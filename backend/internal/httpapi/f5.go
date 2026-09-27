// Package httpapi — F5 asistente IA + métricas. Mismo patrón F0–F4:
// resolveUser + permisos.Puede + secreto interno X-RC-Internal. Solo stdlib.
//
// Asistente (BRIEF F5 §1, ANALISIS §3.2 fila Asistente + §5.31 + §6):
//   - POST /asistente/chat {conversacion_id?, mensaje, contexto?{pieza_id,
//     cliente_id}} → {conversacion, respuesta, no_disponible}.
//     Sin claves (NINEROUTER_* ni respaldo) → "no disponible" y el resto
//     del sistema funciona igual (§5.31). Timeout 30 s con mensaje amable.
//     Tope por usuario/día ASISTENTE_TOPE_DIA (default 30; 0 = sin tope).
//   - El modelo NO toca el store: propone acciones con marcadores y GO las
//     ejecuta con los mismos permisos que la API (permisos.Puede con el
//     usuario que pregunta, visibilidad por cliente §3.1.3, borrador ajeno
//     → 404 sin filtrar). Solo lectura + creación de borradores; nunca
//     aprueba, borra, paga ni cambia estados. Cada escritura queda en
//     actividad con motivo "vía asistente" (§6).
//   - Marcadores que entiende el servidor (van al final de la respuesta):
//     [GUARDAR_BORRADOR pieza=<id o título>] texto [/GUARDAR_BORRADOR]
//     [PROPONER_HOOKS] título por línea [/PROPONER_HOOKS]
//   - GET /asistente/conversaciones → las mías.
//     GET /asistente/conversaciones/{id} → {conversacion, mensajes} (ajena
//     → 404, sin filtrar existencia).
//
// Métricas (BRIEF F5 §2, solo admin/dueño — VerPanel):
//   - GET /metricas → publicadas/semana (últimas 8, por updated_at),
//     piezas por estado, tareas vencidas, carga por persona (abiertas por
//     oficio y persona), cobros del mes (aprobado/por confirmar/reclamado
//     + total del último corte), ventas (leads por etapa, conversión del
//     mes, visitas por vendedor, comisiones del mes).
package httpapi

import (
	"context"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"rconceptsys/backend/internal/actividad"
	"rconceptsys/backend/internal/asistente"
	"rconceptsys/backend/internal/biblioteca"
	"rconceptsys/backend/internal/cobros"
	"rconceptsys/backend/internal/permisos"
	"rconceptsys/backend/internal/produccion"
	"rconceptsys/backend/internal/store"
	"rconceptsys/backend/internal/ventas"
)

func (s *Server) rutasF5(mux *http.ServeMux) {
	mux.HandleFunc("POST /asistente/chat", s.chatAsistente)
	mux.HandleFunc("GET /asistente/conversaciones", s.listConversaciones)
	mux.HandleFunc("GET /asistente/conversaciones/{id}", s.getConversacion)
	mux.HandleFunc("GET /metricas", s.metricas)
}

// --- adaptador Datos (herramientas leen con los permisos del que pregunta) ---

type datosAsistente struct{ s *Server }

func (d datosAsistente) EsAdmin(u permisos.Usuario) bool { return esAdmin(u) }

func (d datosAsistente) ClientesVisibles(u permisos.Usuario) (map[string]bool, error) {
	return d.s.clientesVisiblesPara(u)
}

func (d datosAsistente) ListClientes() ([]produccion.Cliente, error) {
	return d.s.st.ListClientes(true)
}

func (d datosAsistente) GetCliente(id string) (produccion.Cliente, bool, error) {
	return d.s.st.GetCliente(id)
}

func (d datosAsistente) ListPiezas() ([]produccion.Pieza, error) { return d.s.st.ListPiezas() }

func (d datosAsistente) GetPieza(id string) (produccion.Pieza, bool, error) {
	return d.s.st.GetPieza(id)
}

func (d datosAsistente) ListTareas() ([]produccion.Tarea, error) { return d.s.st.ListTareas() }

func (d datosAsistente) TareasDePieza(piezaID string) ([]produccion.Tarea, error) {
	return d.s.st.TareasDePieza(piezaID)
}

func (d datosAsistente) ListLineas() ([]cobros.LineaCobro, error) { return d.s.st.ListLineas() }

func (d datosAsistente) ListLeads() ([]ventas.Lead, error) { return d.s.st.ListLeads() }

func (d datosAsistente) ListFormatos() ([]biblioteca.Formato, error) {
	return d.s.st.ListFormatos()
}

func (d datosAsistente) ListHooks() ([]biblioteca.Hook, error) { return d.s.st.ListHooks() }

func (d datosAsistente) NombreUsuario(id string) string {
	if u, ok := d.s.mapaUsuarios()[id]; ok {
		return u.Nombre
	}
	return ""
}

// --- tope diario ---

// topeAsistente lee ASISTENTE_TOPE_DIA (default 30; 0 = sin tope).
func topeAsistente() int {
	raw := strings.TrimSpace(os.Getenv("ASISTENTE_TOPE_DIA"))
	if raw == "" {
		return 30
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 {
		return 30
	}
	return n
}

// --- chat ---

type chatBody struct {
	ConversacionID string `json:"conversacion_id"`
	Mensaje       string `json:"mensaje"`
	Contexto       struct {
		PiezaID   string `json:"pieza_id"`
		ClienteID string `json:"cliente_id"`
	} `json:"contexto"`
}

const msgNoDisponible = "El asistente no está disponible ahora (sin conexión con la IA). El resto del sistema funciona igual."
const msgTimeout = "Tardé demasiado en responder, probá de nuevo con una pregunta más corta."
const msgTope = "Llegaste al tope diario del asistente, probá mañana."

func conversacionVista(c store.Conversacion) map[string]any {
	return map[string]any{
		"id": c.ID, "titulo": c.Titulo,
		"created_at": c.CreatedAt, "updated_at": c.UpdatedAt,
	}
}

func mensajeVista(m store.Mensaje) map[string]any {
	return map[string]any{
		"id": m.ID, "rol": m.Rol, "contenido": m.Contenido,
		"created_at": m.CreatedAt,
	}
}

func (s *Server) chatAsistente(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(u, permisos.AsistenteIA, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	var body chatBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	pregunta := strings.TrimSpace(body.Mensaje)
	if pregunta == "" {
		writeError(w, http.StatusBadRequest, "escribí tu pregunta")
		return
	}
	if len([]rune(pregunta)) > 2000 {
		writeError(w, http.StatusBadRequest, "pregunta muy larga (máximo 2000 caracteres)")
		return
	}
	d := datosAsistente{s}
	// Conversación: la indicada (mía) o una nueva.
	var conv store.Conversacion
	if id := strings.TrimSpace(body.ConversacionID); id != "" {
		convs, err := s.st.ListConversaciones(u.ID)
		if err != nil {
			errorDatos(w, err)
			return
		}
		hallada := false
		for _, c := range convs {
			if c.ID == id {
				conv, hallada = c, true
				break
			}
		}
		if !hallada {
			writeError(w, http.StatusNotFound, "conversación no encontrada")
			return
		}
	} else {
		titulo := asistente.TituloDe(pregunta)
		if titulo == "" {
			titulo = "Conversación"
		}
		var err error
		conv, err = s.st.CreateConversacion(store.Conversacion{UsuarioID: u.ID, Titulo: titulo})
		if err != nil {
			errorDatos(w, err)
			return
		}
	}
	if _, err := s.st.CreateMensaje(store.Mensaje{
		ConversacionID: conv.ID, Rol: asistente.RolUsuario, Contenido: pregunta,
	}); err != nil {
		errorDatos(w, err)
		return
	}
	responder := func(texto string, noDisp bool) {
		msg, err := s.st.CreateMensaje(store.Mensaje{
			ConversacionID: conv.ID, Rol: asistente.RolAsistente, Contenido: texto,
		})
		if err != nil {
			errorDatos(w, err)
			return
		}
		_, _ = s.st.TouchConversacion(conv.ID)
		writeJSON(w, http.StatusOK, map[string]any{
			"conversacion": conversacionVista(conv),
			"respuesta":    mensajeVista(msg),
			"no_disponible": noDisp,
		})
	}
	// Sin claves → "no disponible" (§5.31); no suma uso.
	if !asistente.Configurado() {
		responder(msgNoDisponible, true)
		return
	}
	// Tope diario (solo cuenta turnos que usan el modelo).
	if tope := topeAsistente(); tope > 0 {
		if n, err := s.st.UsoHoy(u.ID, asistente.DiaHoy()); err != nil {
			errorDatos(w, err)
			return
		} else if n >= tope {
			responder(msgTope, false)
			return
		}
	}
	// Contexto: historial corto + datos visibles que pide el contexto o
	// que sugieren las palabras (hoy/mes).
	msgs := s.promptAsistente(d, u, conv.ID, pregunta, body.Contexto.PiezaID, body.Contexto.ClienteID)
	ctx, cancel := context.WithTimeout(r.Context(), asistente.TimeoutLLM)
	defer cancel()
	texto, err := asistente.Completar(ctx, msgs)
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			responder(msgTimeout, false)
			return
		}
		responder(msgNoDisponible, true)
		return
	}
	_, _ = s.st.SumarUso(u.ID, asistente.DiaHoy())
	final := s.aplicarAcciones(d, u, conv.ID, texto)
	responder(final, false)
}

// promptAsistente arma system + historial (últimos 10) + contexto visible.
func (s *Server) promptAsistente(d datosAsistente, u permisos.Usuario, convID, pregunta, piezaID, clienteID string) []asistente.MensajeLLM {
	var sb strings.Builder
	bogota := time.FixedZone("America/Bogota", -5*3600)
	sb.WriteString("Sos el asistente de RConcept Systems (agencia Rohlfing Concept, San Pedro de los Milagros, Antioquia). Hablás en español de Colombia, cercano, con vos como en Antioquia. Respuestas cortas.\n")
	sb.WriteString("Hoy es " + time.Now().In(bogota).Format("2006-01-02") + " (hora de Colombia). Usá esta fecha para decir qué vence hoy, mañana o está atrasado.\n")
	sb.WriteString("Nunca inventes a qué se dedica un cliente ni datos de su negocio: usá solo la estrategia y los datos que te pasan. Si faltan (no hay estrategia ni rubro), preguntá qué es el negocio antes de escribir, o escribí el guion con marcadores claros como [PRODUCTO] o [BENEFICIO].\n")
	sb.WriteString("Solo podés LEER datos y crear BORRADORES. Nunca aprobás, borrás, pagás ni cambiás estados: si te lo piden, explicá que eso lo hace una persona en el sistema.\n")
	sb.WriteString("Para escribir o mejorar un guion: pedí la pieza si no la tenés, escribí el guion y cerrá con [GUARDAR_BORRADOR pieza=<id o título exacto de la pieza>] <texto del guion> [/GUARDAR_BORRADOR]. El servidor lo deja como borrador sin tocar el guion aprobado.\n")
	sb.WriteString("Para proponer hooks: cerrá con [PROPONER_HOOKS] un título por línea [/PROPONER_HOOKS]. Quedan como borradores hasta que un admin los publique.\n")
	sb.WriteString("Si no sabés de qué pieza o cliente hablan, preguntá antes de inventar.")
	inj := []string{}
	if id := strings.TrimSpace(piezaID); id != "" {
		if p, existe, err := s.st.GetPieza(id); err == nil && existe {
			if t, tErr := asistente.Ejecutar(d, u, "ver_pieza", map[string]string{"pieza": p.ID}); tErr == nil {
				inj = append(inj, "Contexto (pieza abierta):\n"+t)
			}
			// La estrategia del cliente de la pieza es lo que evita guiones inventados.
			if strings.TrimSpace(clienteID) == "" && p.ClienteID != "" {
				clienteID = p.ClienteID
			}
		}
	}
	if id := strings.TrimSpace(clienteID); id != "" {
		if t, tErr := asistente.Ejecutar(d, u, "ver_estrategia", map[string]string{"cliente": id}); tErr == nil && !strings.HasPrefix(t, "No encontré") {
			inj = append(inj, "Contexto (cliente abierto):\n"+t)
		}
	}
	baja := strings.ToLower(pregunta)
	if strings.Contains(baja, "hoy") || strings.Contains(baja, "tengo") || strings.Contains(baja, "mis tareas") || strings.Contains(baja, "atrasad") {
		if t, tErr := asistente.Ejecutar(d, u, "mis_tareas_hoy", nil); tErr == nil {
			inj = append(inj, t)
		}
	}
	if strings.Contains(baja, "mes") || strings.Contains(baja, "llevo") || strings.Contains(baja, "cobro") || strings.Contains(baja, "cuánto") || strings.Contains(baja, "cuanto") {
		if t, tErr := asistente.Ejecutar(d, u, "resumen_mes", nil); tErr == nil {
			inj = append(inj, t)
		}
	}
	if strings.Contains(baja, "lead") || strings.Contains(baja, "visita") || strings.Contains(baja, "vender") || strings.Contains(baja, "venta") {
		if t, tErr := asistente.Ejecutar(d, u, "mis_leads", nil); tErr == nil {
			inj = append(inj, t)
		}
	}
	if len(inj) > 0 {
		sb.WriteString("Datos visibles del usuario (no repitas lo que no te pidan):\n" + strings.Join(inj, "\n"))
	}
	out := []asistente.MensajeLLM{{Role: "system", Content: sb.String()}}
	if prev, err := s.st.ListMensajes(convID); err == nil {
		if len(prev) > 10 {
			prev = prev[len(prev)-10:]
		}
		for _, m := range prev {
			rol := "user"
			if m.Rol == asistente.RolAsistente {
				rol = "assistant"
			}
			out = append(out, asistente.MensajeLLM{Role: rol, Content: m.Contenido})
		}
	}
	out = append(out, asistente.MensajeLLM{Role: "user", Content: pregunta})
	return out
}

var (
	reBorrador = regexp.MustCompile(`(?s)\[GUARDAR_BORRADOR\s+pieza=(?P<ref>[^\]]+)\](?P<texto>.*?)\[/GUARDAR_BORRADOR\]`)
	reHooks    = regexp.MustCompile(`(?s)\[PROPONER_HOOKS\](?P<texto>.*?)\[/PROPONER_HOOKS\]`)
)

// aplicarAcciones ejecuta los marcadores del modelo con permisos Go y
// devuelve el texto final (con confirmaciones). Cada escritura queda en
// actividad con motivo "vía asistente".
func (s *Server) aplicarAcciones(d datosAsistente, u permisos.Usuario, convID, texto string) string {
	final := texto
	// 1) Borradores de guion (solo piezas visibles; nunca toca el guion).
	for _, m := range reBorrador.FindAllStringSubmatch(texto, -1) {
		ref := strings.TrimSpace(m[1])
		guion := strings.TrimSpace(m[2])
		if guion == "" {
			continue
		}
		p, existe, err := s.st.GetPieza(ref)
		if err != nil || !existe {
			if q, ok, qErr := buscarPiezaVisible(d, u, ref); qErr == nil && ok {
				p, existe = q, true
			}
		} else if !piezaVisiblePara(d, u, p) {
			existe = false
		}
		if !existe {
			final = strings.Replace(final, m[0],
				"(No pude guardar el borrador: no encontré esa pieza entre las que podés ver.)", 1)
			continue
		}
		if _, err := s.st.UpdatePiezaBorrador(p.ID, guion); err != nil {
			final = strings.Replace(final, m[0], "(No pude guardar el borrador, probá de nuevo.)", 1)
			continue
		}
		_, _ = actividad.Registrar(s.st, u, "guardar_borrador_guion", p.ID,
			nil, map[string]any{"titulo": p.Titulo}, "vía asistente")
		final = strings.Replace(final, m[0],
			"(Lo dejé como borrador en \""+p.Titulo+"\". El guion aprobado no cambió: avisame si querés usarlo.)", 1)
	}
	// 2) Hooks propuestos (borradores; el admin publica — flujo F3).
	if m := reHooks.FindStringSubmatch(texto); m != nil {
		titulos := []string{}
		for _, ln := range strings.Split(m[1], "\n") {
			if t := strings.TrimSpace(strings.Trim(ln, "-•* \t")); t != "" {
				titulos = append(titulos, t)
			}
			if len(titulos) >= 10 {
				break
			}
		}
		if len(titulos) == 0 {
			final = strings.Replace(final, m[0], "(No propusiste ningún hook con título.)", 1)
		} else {
			n := 0
			for _, t := range titulos {
				h, err := s.st.CreateHook(store.Hook{
					Titulo: t, Estado: biblioteca.EstadoBorrador,
					PropuestoPor: u.ID, CreatedBy: u.ID,
				})
				if err != nil {
					break
				}
				_, _ = actividad.Registrar(s.st, u, "crear_hook", h.ID,
					nil, map[string]any{"titulo": h.Titulo, "estado": h.Estado}, "vía asistente")
				n++
			}
			final = strings.Replace(final, m[0],
				"(Guardé "+strconv.Itoa(n)+" hook(s) como borrador(es) en la Biblioteca. Un admin los publica.)", 1)
		}
	}
	// Los marcadores ya cumplidos no viajan al historial como código.
	_ = convID
	return strings.TrimSpace(final)
}

// buscarPiezaVisible y piezaVisiblePara exponen la búsqueda con permisos
// (la lógica vive en el paquete asistente; aquí se adapta al handler).
func buscarPiezaVisible(d datosAsistente, u permisos.Usuario, q string) (produccion.Pieza, bool, error) {
	piezas, err := d.ListPiezas()
	if err != nil {
		return produccion.Pieza{}, false, err
	}
	qq := strings.ToLower(strings.TrimSpace(q))
	for _, p := range piezas {
		if qq != "" && strings.Contains(strings.ToLower(p.Titulo), qq) && piezaVisiblePara(d, u, p) {
			return p, true, nil
		}
	}
	return produccion.Pieza{}, false, nil
}

func piezaVisiblePara(d datosAsistente, u permisos.Usuario, p produccion.Pieza) bool {
	if d.EsAdmin(u) {
		return true
	}
	vis, err := d.ClientesVisibles(u)
	if err != nil {
		return false
	}
	return vis[p.ClienteID]
}

func (s *Server) listConversaciones(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(u, permisos.AsistenteIA, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	convs, err := s.st.ListConversaciones(u.ID)
	if err != nil {
		errorDatos(w, err)
		return
	}
	out := []map[string]any{}
	for _, c := range convs {
		out = append(out, conversacionVista(c))
	}
	writeJSON(w, http.StatusOK, map[string]any{"conversaciones": out})
}

func (s *Server) getConversacion(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(u, permisos.AsistenteIA, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	id := r.PathValue("id")
	convs, err := s.st.ListConversaciones(u.ID)
	if err != nil {
		errorDatos(w, err)
		return
	}
	var conv *store.Conversacion
	for _, c := range convs {
		if c.ID == id {
			cc := c
			conv = &cc
			break
		}
	}
	if conv == nil {
		writeError(w, http.StatusNotFound, "conversación no encontrada")
		return
	}
	msgs, err := s.st.ListMensajes(conv.ID)
	if err != nil {
		errorDatos(w, err)
		return
	}
	out := []map[string]any{}
	for _, m := range msgs {
		out = append(out, mensajeVista(m))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"conversacion": conversacionVista(*conv), "mensajes": out,
	})
}

// --- métricas (solo admin/dueño) ---

func (s *Server) metricas(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !esAdmin(u) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	piezas, err := s.st.ListPiezas()
	if err != nil {
		errorDatos(w, err)
		return
	}
	tareas, err := s.st.ListTareas()
	if err != nil {
		errorDatos(w, err)
		return
	}
	lineas, err := s.st.ListLineas()
	if err != nil {
		errorDatos(w, err)
		return
	}
	leads, err := s.st.ListLeads()
	if err != nil {
		errorDatos(w, err)
		return
	}
	visitas, err := s.st.ListVisitas()
	if err != nil {
		errorDatos(w, err)
		return
	}
	usuarios := s.mapaUsuarios()
	nombre := func(id string) string {
		if x, ok := usuarios[id]; ok {
			return x.Nombre
		}
		return "Sin asignar"
	}
	hoy := produccion.HoyFecha()

	// Piezas por estado + publicadas por semana (últimas 8, por updated_at).
	porEstado := map[string]int{}
	semanas := ultimasSemanas(8)
	pubPorSemana := make([]map[string]any, len(semanas))
	for i, sm := range semanas {
		pubPorSemana[i] = map[string]any{"semana": sm, "piezas": 0}
	}
	for _, p := range piezas {
		porEstado[p.Estado]++
		if p.Estado != produccion.PiezaPublicada {
			continue
		}
		ref := p.UpdatedAt
		if len(ref) < 10 {
			ref = p.CreatedAt
		}
		if len(ref) < 10 {
			continue
		}
		sm := semanaDe(ref[:10])
		for _, fila := range pubPorSemana {
			if fila["semana"] == sm {
				fila["piezas"] = fila["piezas"].(int) + 1
			}
		}
	}

	// Tareas vencidas + carga por persona (abiertas por oficio y persona).
	vencidas := 0
	type carga struct {
		uid, oficio string
		n           int
	}
	cargas := map[string]*carga{}
	for _, t := range tareas {
		if produccion.EsVencida(t.FechaLimite, t.Estado, hoy) {
			vencidas++
		}
		switch t.Estado {
		case produccion.TareaAprobada, produccion.TareaCancelada:
			continue
		}
		of, _ := produccion.OficioDeEtapa(t.Etapa)
		k := t.AsignadoID + "|" + of
		if c, ok := cargas[k]; ok {
			c.n++
		} else {
			cargas[k] = &carga{uid: t.AsignadoID, oficio: of, n: 1}
		}
	}
	cargaLista := []map[string]any{}
	for _, c := range cargas {
		cargaLista = append(cargaLista, map[string]any{
			"usuario_id": c.uid, "usuario_nombre": nombre(c.uid),
			"oficio": c.oficio, "abiertas": c.n,
		})
	}
	sort.Slice(cargaLista, func(i, j int) bool {
		return cargaLista[i]["abiertas"].(int) > cargaLista[j]["abiertas"].(int)
	})

	// Cobros del mes + total del último corte.
	mes := cobros.PeriodoActual()
	var ap, pc, rec int64
	var comMes int64
	for _, l := range lineas {
		if l.Periodo != mes {
			continue
		}
		switch l.Estado {
		case cobros.LineaAprobada:
			ap += l.MontoCOP
		case cobros.LineaPorConfirmar, cobros.LineaConfirmada:
			pc += l.MontoCOP
		case cobros.LineaReclamada:
			rec += l.MontoCOP
		}
		if l.Tipo == cobros.TipoComision {
			comMes += l.MontoCOP
		}
	}
	var ultimoCorte any
	if cortes, err := s.st.ListCortes(); err == nil && len(cortes) > 0 {
		mejor := cortes[0]
		for _, c := range cortes[1:] {
			if c.Periodo > mejor.Periodo {
				mejor = c
			}
		}
		ultimoCorte = map[string]any{
			"periodo": mejor.Periodo, "estado": mejor.Estado,
		}
	}

	// Ventas: leads por etapa, conversión del mes, visitas por vendedor.
	porEtapa := map[string]int{}
	gan, per := 0, 0
	for _, l := range leads {
		porEtapa[l.Estado]++
		if len(l.UpdatedAt) >= 7 && l.UpdatedAt[:7] == mes {
			if l.Estado == ventas.LeadGanado {
				gan++
			}
			if l.Estado == ventas.LeadPerdido {
				per++
			}
		}
	}
	conv := 0.0
	if gan+per > 0 {
		conv = float64(gan) / float64(gan+per)
	}
	visPorVend := map[string]int{}
	for _, v := range visitas {
		visPorVend[v.Vendedor]++
	}
	visLista := []map[string]any{}
	for id, n := range visPorVend {
		visLista = append(visLista, map[string]any{
			"usuario_id": id, "usuario_nombre": nombre(id), "visitas": n,
		})
	}
	sort.Slice(visLista, func(i, j int) bool {
		return visLista[i]["visitas"].(int) > visLista[j]["visitas"].(int)
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"piezas_publicadas_semana": pubPorSemana,
		"piezas_por_estado":        porEstado,
		"tareas_vencidas":          vencidas,
		"carga_por_persona":        cargaLista,
		"cobros_mes": map[string]any{
			"periodo": mes, "aprobado": ap, "por_confirmar": pc,
			"reclamado": rec, "ultimo_corte": ultimoCorte,
		},
		"ventas": map[string]any{
			"leads_por_etapa": porEtapa, "conversion_mes": conv,
			"ganados_mes": gan, "perdidos_mes": per,
			"visitas_por_vendedor": visLista, "comisiones_mes": comMes,
		},
	})
}

// ultimasSemanas devuelve los lunes (YYYY-MM-DD) de las últimas n semanas.
func ultimasSemanas(n int) []string {
	hoy := time.Now().UTC()
	// Lunes de esta semana.
	d := hoy
	wd := int(d.Weekday())
	if wd == 0 {
		wd = 7
	}
	lunes := d.AddDate(0, 0, -(wd - 1))
	out := make([]string, n)
	for i := range out {
		out[n-1-i] = lunes.AddDate(0, 0, -7*i).Format("2006-01-02")
	}
	return out
}

// semanaDe devuelve el lunes (YYYY-MM-DD) de la semana de una fecha.
func semanaDe(fecha string) string {
	t, err := time.Parse("2006-01-02", fecha)
	if err != nil {
		return ""
	}
	wd := int(t.Weekday())
	if wd == 0 {
		wd = 7
	}
	return t.AddDate(0, 0, -(wd - 1)).Format("2006-01-02")
}
