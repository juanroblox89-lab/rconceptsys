// Package httpapi — F4 ventas (CRM): handlers de leads, visitas, fotos,
// métricas y conversión lead → cliente. Mismo patrón F0/F1/F2/F3:
// resolveUser + permisos.Puede + secreto interno X-RC-Internal. Solo stdlib.
//
// Reglas que impone cada handler (BRIEF F4, ANALISIS):
//   - §3.2: equipo sin oficio ventas no ve Ventas (403); vendedor solo SUS
//     leads (OwnerID = su id); solo admin/dueño reasigna (vendedor_id).
//   - §4.4: prospecto → en_contacto → propuesta_enviada → negociacion →
//     ganado | perdido (perdido con motivo obligatorio). Ganado → pide
//     paquete (catálogo F2) → crea el cliente F1 con paquete_id y
//     vendido_por = vendedor del lead → F2 genera la comisión 8 % una sola
//     vez por el camino que ya existe (generarComisiones, idempotente).
//   - §5.23: visita idempotente por client_id (UUID del celular); repetir el
//     POST con el mismo client_id = 200 con la visita existente, sin duplicar
//     ni crear otra comisión. Fotos aparte (POST /visitas/{id}/fotos).
//   - §5.24: al crear, buscar duplicados por teléfono normalizado y nombre
//     parecido; el aviso va en la respuesta (campo "duplicados"), no bloquea;
//     el admin decide (reasignar).
//   - §5.25: si el negocio ya fue cliente (archivado/terminado por
//     teléfono/nombre), la respuesta de ganar ofrece "reactivar" en vez de
//     crear otro; la comisión igual se genera una sola vez.
//   - §5.26: al desactivar un vendedor, sus leads abiertos pasan a sin
//     asignar (hook en desactivar, igual que F1 usa para tareas: aquí los
//     leads no tienen "asignado" sino vendedor_id).
//   - Próxima acción vencida: flag calculado + notificación in-app al
//     vendedor el día que vence (al listar) y al admin si pasa 3 días.
//   - Cada cambio → actividad.Registrar + lead_eventos (historial inmutable).
package httpapi

import (
	"encoding/base64"
	"net/http"
	"strings"

	"rconceptsys/backend/internal/actividad"
	"rconceptsys/backend/internal/cobros"
	"rconceptsys/backend/internal/permisos"
	"rconceptsys/backend/internal/produccion"
	"rconceptsys/backend/internal/store"
	"rconceptsys/backend/internal/ventas"
)

// rutasF4 registra los endpoints de ventas en el mux.
func (s *Server) rutasF4(mux *http.ServeMux) {
	mux.HandleFunc("GET /leads", s.listLeads)
	mux.HandleFunc("POST /leads", s.createLead)
	mux.HandleFunc("GET /leads/{id}", s.getLead)
	mux.HandleFunc("PATCH /leads/{id}", s.patchLead)
	mux.HandleFunc("POST /leads/{id}/mover", s.moverLead)
	mux.HandleFunc("POST /leads/{id}/reasignar", s.reasignarLead)
	mux.HandleFunc("POST /leads/{id}/ganar", s.ganarLead)
	mux.HandleFunc("GET /leads/{id}/eventos", s.listLeadEventos)
	mux.HandleFunc("GET /leads/{id}/visitas", s.visitasDeLead)

	mux.HandleFunc("GET /visitas", s.listVisitas)
	mux.HandleFunc("POST /visitas", s.createVisita)
	mux.HandleFunc("GET /visitas/{id}", s.getVisita)
	mux.HandleFunc("POST /visitas/{id}/fotos", s.subirFotoVisita)
	mux.HandleFunc("GET /visitas/{id}/fotos", s.listFotosVisita)

	mux.HandleFunc("GET /ventas/metricas", s.metricasVentas)
}

// Tipos de notificación F4 (campanita in-app).
const (
	NotiLeadAsignado   = "lead_asignado"
	NotiLeadGanado     = "lead_ganado"
	NotiLeadReasignado = "lead_reasignado"
	NotiAccionVencida  = "accion_vencida"
	NotiVisitaNueva    = "visita_nueva"
)

// --- helpers F4 ---

func (s *Server) conLead(w http.ResponseWriter, id string) (store.Lead, bool) {
	l, existe, err := s.st.GetLead(id)
	if err != nil {
		errorDatos(w, err)
		return store.Lead{}, false
	}
	if !existe {
		writeError(w, http.StatusNotFound, "lead no encontrado")
		return store.Lead{}, false
	}
	return l, true
}

// puedeVerLead: admin/dueño todo; vendedor con oficio ventas solo SUS leads.
// Equipo sin ventas → false (ni siquiera 404: 403 directo, BRIEF F4 §6.5).
func (s *Server) puedeVerLead(u permisos.Usuario, l store.Lead) bool {
	if esAdmin(u) {
		return true
	}
	if !tieneVentas(u) {
		return false
	}
	return l.VendedorID == u.ID
}

// tieneVentas dice si el usuario es equipo con oficio ventas.
func tieneVentas(u permisos.Usuario) bool {
	if u.Acceso != permisos.AccesoEquipo {
		return false
	}
	for _, o := range u.Oficios {
		if o == permisos.OficioVentas {
			return true
		}
	}
	return false
}

// leadDuenoParaPermiso arma el Recurso para permisos.Puede(CRM): admin pasa
// con Recurso vacío (Puede no lo exige para admin); equipo exige
// OwnerID == su id (ver permisos.Puede).
func leadRecurso(u permisos.Usuario, vendedorID string) permisos.Recurso {
	if esAdmin(u) {
		return permisos.Recurso{}
	}
	if vendedorID != "" {
		return permisos.Recurso{OwnerID: vendedorID}
	}
	return permisos.Recurso{OwnerID: u.ID}
}

// leadVista enriquece el lead con nombres y vencida calculada.
func (s *Server) leadVista(l store.Lead) map[string]any {
	hoy := produccion.HoyFecha()
	usuarios := s.mapaUsuarios()
	v := map[string]any{
		"id": l.ID, "negocio": l.Negocio,
		"contacto_nombre": l.ContactoNombre, "telefono": l.Telefono,
		"direccion": l.Direccion, "barrio": l.Barrio, "municipio": l.Municipio,
		"rubro": l.Rubro, "origen": l.Origen,
		"valor_estimado_cop": l.ValorEstimadoCOP, "paquete_id": l.PaqueteID,
		"notas": l.Notas, "accion_que": l.AccionQue, "accion_fecha": l.AccionFecha,
		"estado": l.Estado, "motivo_perdida": l.MotivoPerdida,
		"vendedor_id": l.VendedorID, "cliente_id": l.ClienteID,
		"vencida":     ventas.EsVencida(l.AccionFecha, l.Estado, hoy),
		"created_at": l.CreatedAt, "updated_at": l.UpdatedAt,
	}
	if l.VendedorID != "" {
		if u, ok := usuarios[l.VendedorID]; ok {
			v["vendedor_nombre"] = u.Nombre
		}
	} else {
		v["vendedor_nombre"] = "sin asignar"
	}
	return v
}

// duplicadosDe busca leads existentes que duplican al candidato (§5.24):
// mismo teléfono normalizado o nombre parecido. Excluye excluirID (el mismo
// lead al editar) y solo mira abiertos (ganado/perdido ya se resolvieron).
func (s *Server) duplicadosDe(cand store.Lead, excluirID string) []map[string]any {
	todos, err := s.st.ListLeads()
	if err != nil {
		return nil
	}
	usuarios := s.mapaUsuarios()
	out := []map[string]any{}
	for _, e := range todos {
		if e.ID == excluirID || !ventas.LeadAbierto(e.Estado) {
			continue
		}
		if !ventas.EsDuplicado(cand, e) {
			continue
		}
		v := map[string]any{"id": e.ID, "negocio": e.Negocio, "estado": e.Estado}
		if u, ok := usuarios[e.VendedorID]; ok {
			v["vendedor_nombre"] = u.Nombre
		} else if e.VendedorID == "" {
			v["vendedor_nombre"] = "sin asignar"
		}
		out = append(out, v)
	}
	return out
}

// registrarLead guarda el evento de historial + actividad global.
func (s *Server) registrarLead(actor permisos.Usuario, leadID, accion string, antes, despues any, motivo string) {
	var c *string
	if motivo != "" {
		c = &motivo
	}
	_, _ = s.st.AddLeadEvento(store.LeadEvento{
		LeadID: leadID, ActorID: actor.ID, ActorNombre: actor.Nombre,
		Accion: accion, Antes: antes, Despues: despues, Motivo: c,
	})
	_, _ = actividad.Registrar(s.st, actor, accion+"_lead", leadID, antes, despues, motivo)
}

// avisarVencida crea la notificación in-app de próxima acción vencida: al
// vendedor el día que vence y al admin si pasan 3+ días (BRIEF F4 §1).
// Idempotente por día: no duplica si ya hay una de hoy para ese lead.
func (s *Server) avisarVencida(l store.Lead, hoy string) {
	if !ventas.EsVencida(l.AccionFecha, l.Estado, hoy) {
		return
	}
	if l.VendedorID != "" {
		s.notificarUnica(l.VendedorID, NotiAccionVencida,
			"Próxima acción vencida", l.Negocio+": "+l.AccionQue,
			"lead", l.ID, hoy)
	}
	// +3 días: avisar a cada admin/dueño una vez por día.
	if l.AccionFecha < sumarDias(hoy, -3) {
		if us, err := s.st.ListUsuarios(); err == nil {
			for _, u := range us {
				if u.Acceso == permisos.AccesoDueno || u.Acceso == permisos.AccesoAdmin {
					s.notificarUnica(u.ID, NotiAccionVencida,
						"Acción vencida hace 3+ días", l.Negocio+": "+l.AccionQue,
						"lead", l.ID, hoy)
				}
			}
		}
	}
}

// notificarUnica crea la notificación solo si hoy no hay otra igual
// (mismo usuario, tipo y recurso): evita spam al listar cada vez.
func (s *Server) notificarUnica(usuarioID, tipo, titulo, detalle, recurso, recursoID, hoy string) {
	if usuarioID == "" {
		return
	}
	if ns, err := s.st.ListNotificaciones(usuarioID); err == nil {
		for _, n := range ns {
			if n.Tipo == tipo && n.RecursoID == recursoID && strings.HasPrefix(n.CreatedAt, hoy) {
				return
			}
		}
	}
	s.notificar(usuarioID, tipo, titulo, detalle, recurso, recursoID)
}

// sumarDias suma días a una fecha YYYY-MM-DD (para el umbral de 3 días).
func sumarDias(fecha string, dias int) string {
	if len(fecha) != 10 {
		return fecha
	}
	y, m, d := 0, 0, 0
	for i, ch := range fecha {
		if ch < '0' || ch > '9' {
			if i != 4 && i != 7 {
				return fecha
			}
			continue
		}
		switch {
		case i < 4:
			y = y*10 + int(ch-'0')
		case i == 5 || i == 6:
			m = m*10 + int(ch-'0')
		case i == 8 || i == 9:
			d = d*10 + int(ch-'0')
		}
	}
	diasMes := []int{31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}
	if (y%4 == 0 && y%100 != 0) || y%400 == 0 {
		diasMes[1] = 29
	}
	d += dias
	for d < 1 {
		m--
		if m < 1 {
			m = 12
			y--
		}
		d += diasMes[m-1]
	}
	for m >= 1 && m <= 12 && d > diasMes[m-1] {
		d -= diasMes[m-1]
		m++
		if m > 12 {
			m = 1
			y++
		}
	}
	pad := func(n int) string {
		if n < 10 {
			return "0" + string(rune('0'+n))
		}
		return string(rune('0'+n/10)) + string(rune('0'+n%10))
	}
	return pad2(y, 4) + "-" + pad(m) + "-" + pad(d)
}

func pad2(n, ancho int) string {
	s := ""
	if n == 0 {
		s = "0"
	} else {
		for n > 0 {
			s = string(rune('0'+n%10)) + s
			n /= 10
		}
	}
	for len(s) < ancho {
		s = "0" + s
	}
	return s
}

// validaVendedorLead chequea que el vendedor existe, tiene oficio ventas y
// trabaja (§5.2: pendiente/desactivado → 422). "" = sin asignar (válido,
// solo lo deja admin/dueño; lo impone el handler).
func (s *Server) validaVendedorLead(w http.ResponseWriter, vendedorID string) bool {
	if vendedorID == "" {
		return true
	}
	v, existe, err := s.st.GetUsuario(vendedorID)
	if err != nil {
		errorDatos(w, err)
		return false
	}
	if !existe {
		writeError(w, http.StatusNotFound, "el vendedor no existe")
		return false
	}
	tiene := false
	for _, o := range v.Oficios {
		if o == permisos.OficioVentas {
			tiene = true
			break
		}
	}
	if !tiene {
		writeError(w, http.StatusUnprocessableEntity, "el vendedor debe tener oficio ventas")
		return false
	}
	if v.Acceso == permisos.AccesoPendiente || v.Acceso == permisos.AccesoDesactivado {
		writeError(w, http.StatusUnprocessableEntity, "el vendedor no puede ser pendiente ni desactivado")
		return false
	}
	return true
}

// --- /leads ---

type leadBody struct {
	Negocio        string `json:"negocio"`
	ContactoNombre string `json:"contacto_nombre"`
	Telefono       string `json:"telefono"`
	Direccion      string `json:"direccion"`
	Barrio         string `json:"barrio"`
	Municipio      string `json:"municipio"`
	Rubro          string `json:"rubro"`
	Origen         string `json:"origen"`
	ValorEstimado  int64  `json:"valor_estimado_cop"`
	PaqueteID      string `json:"paquete_id"`
	Notas          string `json:"notas"`
	AccionQue      string `json:"accion_que"`
	AccionFecha    string `json:"accion_fecha"`
	Estado         string `json:"estado"`
	MotivoPerdida  string `json:"motivo_perdida"`
	VendedorID     string `json:"vendedor_id"`
}

func (s *Server) listLeads(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	// Equipo sin oficio ventas: 403 sin lista (BRIEF F4 §6.5).
	if !esAdmin(u) && !tieneVentas(u) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	q := r.URL.Query()
	fEstado, fVendedor, fMunicipio := q.Get("estado"), q.Get("vendedor"), q.Get("municipio")
	fMias := q.Get("mias") == "1"
	leads, err := s.st.ListLeads()
	if err != nil {
		errorDatos(w, err)
		return
	}
	hoy := produccion.HoyFecha()
	out := []map[string]any{}
	for _, l := range leads {
		// Vendedor: solo los suyos (BRIEF F4 §6.5).
		if !esAdmin(u) && l.VendedorID != u.ID {
			continue
		}
		if fEstado != "" && l.Estado != fEstado {
			continue
		}
		if fVendedor != "" && l.VendedorID != fVendedor {
			continue
		}
		if fMunicipio != "" && !strings.EqualFold(strings.TrimSpace(l.Municipio), strings.TrimSpace(fMunicipio)) {
			continue
		}
		if fMias && l.VendedorID != u.ID {
			continue
		}
		v := s.leadVista(l)
		if ventas.EsVencida(l.AccionFecha, l.Estado, hoy) {
			s.avisarVencida(l, hoy)
		}
		out = append(out, v)
	}
	writeJSON(w, http.StatusOK, map[string]any{"leads": out})
}

func (s *Server) createLead(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	var body leadBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	if strings.TrimSpace(body.Negocio) == "" {
		writeError(w, http.StatusBadRequest, "el negocio es obligatorio")
		return
	}
	origen := strings.TrimSpace(body.Origen)
	if !ventas.OrigenValido(origen) {
		writeError(w, http.StatusBadRequest, "origen inválido (visita, referido, redes o llamada)")
		return
	}
	accionFecha := strings.TrimSpace(body.AccionFecha)
	if !ventas.FechaValida(accionFecha) {
		writeError(w, http.StatusBadRequest, "fecha de próxima acción inválida (YYYY-MM-DD)")
		return
	}
	paqueteID := strings.TrimSpace(body.PaqueteID)
	if paqueteID != "" {
		if _, existe, err := s.st.GetPaquete(paqueteID); err != nil {
			errorDatos(w, err)
			return
		} else if !existe {
			writeError(w, http.StatusBadRequest, "paquete_id no existe")
			return
		}
	}
	// Dueño del lead: admin/dueño elige vendedor (o sin asignar); el
	// vendedor crea los suyos (el dueño queda él).
	vendedorID := strings.TrimSpace(body.VendedorID)
	if esAdmin(actor) {
		if !s.validaVendedorLead(w, vendedorID) {
			return
		}
	} else {
		if !tieneVentas(actor) {
			writeError(w, http.StatusForbidden, "no autorizado")
			return
		}
		if vendedorID != "" && vendedorID != actor.ID {
			writeError(w, http.StatusForbidden, "solo el admin reasigna leads")
			return
		}
		vendedorID = actor.ID
	}
	if !permisos.Puede(actor, permisos.CRM, leadRecurso(actor, vendedorID)) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	if body.ValorEstimado < 0 {
		writeError(w, http.StatusBadRequest, "el valor estimado no puede ser negativo")
		return
	}
	l, err := s.st.CreateLead(store.Lead{
		Negocio: strings.TrimSpace(body.Negocio),
		ContactoNombre: strings.TrimSpace(body.ContactoNombre),
		Telefono: strings.TrimSpace(body.Telefono),
		Direccion: strings.TrimSpace(body.Direccion),
		Barrio: strings.TrimSpace(body.Barrio),
		Municipio: strings.TrimSpace(body.Municipio),
		Rubro: strings.TrimSpace(body.Rubro), Origen: origen,
		ValorEstimadoCOP: body.ValorEstimado, PaqueteID: paqueteID,
		Notas: body.Notas, AccionQue: strings.TrimSpace(body.AccionQue),
		AccionFecha: accionFecha, Estado: ventas.LeadProspecto,
		VendedorID: vendedorID, CreatedBy: actor.ID,
	})
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.registrarLead(actor, l.ID, "crear",
		nil, map[string]any{"negocio": l.Negocio, "estado": l.Estado}, "")
	if vendedorID != "" && vendedorID != actor.ID {
		s.notificar(vendedorID, NotiLeadAsignado,
			"Te asignaron un lead", l.Negocio, "lead", l.ID)
	}
	resp := s.leadVista(l)
	// §5.24: aviso de duplicados, sin bloquear ("este negocio ya lo tiene
	// Fulano", con opción de seguir en la UI).
	if dups := s.duplicadosDe(l, l.ID); len(dups) > 0 {
		resp["duplicados"] = dups
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (s *Server) getLead(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	l, ok := s.conLead(w, r.PathValue("id"))
	if !ok {
		return
	}
	if !s.puedeVerLead(u, l) {
		// Vendedor ajeno o equipo sin ventas: no revelar existencia.
		if !esAdmin(u) && !tieneVentas(u) {
			writeError(w, http.StatusForbidden, "no autorizado")
			return
		}
		writeError(w, http.StatusNotFound, "lead no encontrado")
		return
	}
	v := s.leadVista(l)
	evs, _ := s.st.ListLeadEventos(l.ID)
	v["historial"] = evs
	if evs == nil {
		v["historial"] = []store.LeadEvento{}
	}
	visitas, _ := s.st.VisitasDeLead(l.ID)
	v["visitas"] = visitas
	if visitas == nil {
		v["visitas"] = []store.Visita{}
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *Server) patchLead(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	l, ok := s.conLead(w, r.PathValue("id"))
	if !ok {
		return
	}
	if !s.puedeVerLead(actor, l) {
		if !esAdmin(actor) && !tieneVentas(actor) {
			writeError(w, http.StatusForbidden, "no autorizado")
			return
		}
		writeError(w, http.StatusNotFound, "lead no encontrado")
		return
	}
	// Ganado/perdido son finales: solo se reabre vía admin (mover a un
	// estado abierto con motivo queda en el historial).
	if !ventas.LeadAbierto(l.Estado) && !esAdmin(actor) {
		writeError(w, http.StatusBadRequest, "el lead ya se cerró (ganado o perdido)")
		return
	}
	var body leadBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	cambios := map[string]any{}
	if body.Negocio != "" && body.Negocio != l.Negocio {
		cambios["negocio"] = strings.TrimSpace(body.Negocio)
	}
	if body.ContactoNombre != l.ContactoNombre && (body.ContactoNombre != "" || l.ContactoNombre != "") {
		cambios["contacto_nombre"] = strings.TrimSpace(body.ContactoNombre)
	}
	if body.Telefono != l.Telefono && (body.Telefono != "" || l.Telefono != "") {
		cambios["telefono"] = strings.TrimSpace(body.Telefono)
	}
	if body.Direccion != l.Direccion && (body.Direccion != "" || l.Direccion != "") {
		cambios["direccion"] = strings.TrimSpace(body.Direccion)
	}
	if body.Barrio != l.Barrio && (body.Barrio != "" || l.Barrio != "") {
		cambios["barrio"] = strings.TrimSpace(body.Barrio)
	}
	if body.Municipio != l.Municipio && (body.Municipio != "" || l.Municipio != "") {
		cambios["municipio"] = strings.TrimSpace(body.Municipio)
	}
	if body.Rubro != l.Rubro && (body.Rubro != "" || l.Rubro != "") {
		cambios["rubro"] = strings.TrimSpace(body.Rubro)
	}
	if o := strings.TrimSpace(body.Origen); o != "" && o != l.Origen {
		if !ventas.OrigenValido(o) {
			writeError(w, http.StatusBadRequest, "origen inválido (visita, referido, redes o llamada)")
			return
		}
		cambios["origen"] = o
	}
	if body.Notas != l.Notas && (body.Notas != "" || l.Notas != "") {
		cambios["notas"] = body.Notas
	}
	if body.AccionQue != l.AccionQue && (body.AccionQue != "" || l.AccionQue != "") {
		cambios["accion_que"] = strings.TrimSpace(body.AccionQue)
	}
	if body.AccionFecha != l.AccionFecha && (body.AccionFecha != "" || l.AccionFecha != "") {
		if !ventas.FechaValida(strings.TrimSpace(body.AccionFecha)) {
			writeError(w, http.StatusBadRequest, "fecha de próxima acción inválida (YYYY-MM-DD)")
			return
		}
		cambios["accion_fecha"] = strings.TrimSpace(body.AccionFecha)
	}
	if pid := strings.TrimSpace(body.PaqueteID); pid != l.PaqueteID && (pid != "" || l.PaqueteID != "") {
		if pid != "" {
			if _, existe, err := s.st.GetPaquete(pid); err != nil {
				errorDatos(w, err)
				return
			} else if !existe {
				writeError(w, http.StatusBadRequest, "paquete_id no existe")
				return
			}
		}
		cambios["paquete_id"] = pid
	}
	// El estado NO se edita por PATCH (usar /mover; ganado por /ganar).
	if strings.TrimSpace(body.Estado) != "" {
		writeError(w, http.StatusBadRequest, "el estado se cambia con /mover (y /ganar para ganar)")
		return
	}
	// Vendedor NO se edita por PATCH (usar /reasignar, solo admin).
	if strings.TrimSpace(body.VendedorID) != "" && strings.TrimSpace(body.VendedorID) != l.VendedorID {
		writeError(w, http.StatusBadRequest, "el vendedor se cambia con /reasignar (solo admin)")
		return
	}
	if len(cambios) == 0 {
		writeJSON(w, http.StatusOK, s.leadVista(l))
		return
	}
	antes := s.leadVista(l)
	act, err := s.st.UpdateLead(l.ID, cambios)
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.registrarLead(actor, l.ID, "editar", antes, s.leadVista(act), "")
	writeJSON(w, http.StatusOK, s.leadVista(act))
}

type moverLeadBody struct {
	Estado        string `json:"estado"`
	MotivoPerdida string `json:"motivo_perdida"`
}

// moverLead cambia el estado del lead (kanban desktop / "mover" en 2 toques
// en 375). Perdido exige motivo. Ganado por aquí exige que ya tenga
// cliente enlazado (si no, usar /ganar que lo crea).
func (s *Server) moverLead(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	l, ok := s.conLead(w, r.PathValue("id"))
	if !ok {
		return
	}
	if !s.puedeVerLead(actor, l) {
		if !esAdmin(actor) && !tieneVentas(actor) {
			writeError(w, http.StatusForbidden, "no autorizado")
			return
		}
		writeError(w, http.StatusNotFound, "lead no encontrado")
		return
	}
	var body moverLeadBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	nuevo := strings.TrimSpace(body.Estado)
	if !ventas.EsEstadoLead(nuevo) {
		writeError(w, http.StatusBadRequest, "estado inválido")
		return
	}
	if !ventas.TransicionLeadValida(l.Estado, nuevo) {
		writeError(w, http.StatusBadRequest, "esa transición de estado no es válida")
		return
	}
	if nuevo == l.Estado {
		writeJSON(w, http.StatusOK, s.leadVista(l))
		return
	}
	if nuevo == ventas.LeadPerdido && strings.TrimSpace(body.MotivoPerdida) == "" {
		writeError(w, http.StatusBadRequest, "perder un lead exige el motivo")
		return
	}
	if nuevo == ventas.LeadGanado && l.ClienteID == "" {
		writeError(w, http.StatusBadRequest, "para ganar usá /ganar (crea o reactiva el cliente)")
		return
	}
	antes := map[string]any{"estado": l.Estado}
	cambios := map[string]any{"estado": nuevo}
	if nuevo == ventas.LeadPerdido {
		cambios["motivo_perdida"] = strings.TrimSpace(body.MotivoPerdida)
	}
	act, err := s.st.UpdateLead(l.ID, cambios)
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.registrarLead(actor, l.ID, "mover",
		antes, map[string]any{"estado": act.Estado},
		strings.TrimSpace(body.MotivoPerdida))
	writeJSON(w, http.StatusOK, s.leadVista(act))
}

type reasignarLeadBody struct {
	VendedorID string `json:"vendedor_id"`
}

// reasignarLead: solo admin/dueño (BRIEF F4 §6.5). VendedorID "" = sin
// asignar (el admin decide a quién queda, §5.24).
func (s *Server) reasignarLead(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !esAdmin(actor) {
		writeError(w, http.StatusForbidden, "solo el admin reasigna leads")
		return
	}
	l, ok := s.conLead(w, r.PathValue("id"))
	if !ok {
		return
	}
	var body reasignarLeadBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	nuevo := strings.TrimSpace(body.VendedorID)
	if nuevo == l.VendedorID {
		writeJSON(w, http.StatusOK, s.leadVista(l))
		return
	}
	if !s.validaVendedorLead(w, nuevo) {
		return
	}
	antes := map[string]any{"vendedor_id": l.VendedorID}
	act, err := s.st.UpdateLead(l.ID, map[string]any{"vendedor_id": nuevo})
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.registrarLead(actor, l.ID, "reasignar",
		antes, map[string]any{"vendedor_id": act.VendedorID}, "")
	if nuevo != "" {
		s.notificar(nuevo, NotiLeadReasignado,
			"Te asignaron un lead", act.Negocio, "lead", act.ID)
	}
	writeJSON(w, http.StatusOK, s.leadVista(act))
}

type ganarLeadBody struct {
	PaqueteID      string `json:"paquete_id"`
	NombreCliente  string `json:"nombre_cliente"`
	ReactivarID    string `json:"reactivar_id"`
	ContactoNombre string `json:"contacto_nombre"`
	Telefono       string `json:"telefono"`
}

// ganarLead: prospecto…negociacion → ganado con paquete del catálogo F2.
// Crea el cliente F1 con paquete_id y vendido_por = vendedor del lead →
// F2 genera la comisión 8 % una sola vez por el camino que ya existe
// (generarComisiones es idempotente: repetir /ganar no duplica comisión).
// Si el negocio ya fue cliente (match por teléfono/nombre entre archivados
// y terminados), responde 409 con "reactivar": la UI ofrece reactivar ese
// cliente (reactivar_id) en vez de crear otro.
func (s *Server) ganarLead(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	l, ok := s.conLead(w, r.PathValue("id"))
	if !ok {
		return
	}
	if !s.puedeVerLead(actor, l) {
		if !esAdmin(actor) && !tieneVentas(actor) {
			writeError(w, http.StatusForbidden, "no autorizado")
			return
		}
		writeError(w, http.StatusNotFound, "lead no encontrado")
		return
	}
	// Idempotencia: ya ganado con cliente → 200 con lo que hay (§5.32: no
	// se crean dos clientes ni dos comisiones aunque se repita la acción).
	if l.Estado == ventas.LeadGanado && l.ClienteID != "" {
		v := s.leadVista(l)
		v["cliente_id"] = l.ClienteID
		writeJSON(w, http.StatusOK, v)
		return
	}
	if !ventas.TransicionLeadValida(l.Estado, ventas.LeadGanado) {
		writeError(w, http.StatusBadRequest, "el lead debe estar en negociación para ganarse")
		return
	}
	var body ganarLeadBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	paqueteID := strings.TrimSpace(body.PaqueteID)
	if paqueteID == "" {
		paqueteID = strings.TrimSpace(l.PaqueteID)
	}
	if paqueteID == "" {
		writeError(w, http.StatusBadRequest, "para ganar hay que elegir el paquete")
		return
	}
	p, existe, err := s.st.GetPaquete(paqueteID)
	if err != nil {
		errorDatos(w, err)
		return
	}
	if !existe {
		writeError(w, http.StatusBadRequest, "paquete_id no existe")
		return
	}
	vendedorID := l.VendedorID
	if vendedorID == "" {
		vendedorID = actor.ID
	}
	if !s.validaVendedorLead(w, vendedorID) {
		return
	}
	reactivarID := strings.TrimSpace(body.ReactivarID)
	var cliente store.Cliente
	if reactivarID != "" {
		// Reactivar (§5.25): el cliente archivado/terminado vuelve a activo.
		c, existe, err := s.st.GetCliente(reactivarID)
		if err != nil {
			errorDatos(w, err)
			return
		}
		if !existe {
			writeError(w, http.StatusNotFound, "cliente a reactivar no encontrado")
			return
		}
		if !permisoCliente(actor, c.ID, s) {
			writeError(w, http.StatusForbidden, "no autorizado")
			return
		}
		act2, err := s.st.UpdateCliente(reactivarID, map[string]any{
			"estado": produccion.ClienteActivo, "paquete_id": paqueteID,
			"vendido_por": vendedorID,
		})
		if err != nil {
			errorDatos(w, err)
			return
		}
		// Desarchivar: si estaba archivado, reactivar lo desarchiva.
		if c.ArchivadoAt != "" {
			act2, err = s.st.UpdateCliente(reactivarID, map[string]any{"desarchivar": true})
			if err != nil {
				errorDatos(w, err)
				return
			}
		}
		cliente = act2
		_, _ = actividad.Registrar(s.st, actor, "reactivar_cliente", cliente.ID,
			map[string]any{"negocio": l.Negocio}, map[string]any{"estado": cliente.Estado}, "lead ganado reactiva cliente")
	} else {
		// ¿Ya fue cliente? Buscar match para ofrecer reactivar (§5.25).
		if match := s.clientePrevio(l); match != nil {
			v := s.leadVista(l)
			v["reactivar"] = map[string]any{
				"id": match.ID, "nombre": match.Nombre, "estado": match.Estado,
			}
			writeJSON(w, http.StatusConflict, v)
			return
		}
		nombre := strings.TrimSpace(body.NombreCliente)
		if nombre == "" {
			nombre = l.Negocio
		}
		contacto := strings.TrimSpace(body.ContactoNombre)
		if contacto == "" {
			contacto = l.ContactoNombre
		}
		tel := strings.TrimSpace(body.Telefono)
		if tel == "" {
			tel = l.Telefono
		}
		if !permisoCrearCliente(actor) {
			writeError(w, http.StatusForbidden, "no autorizado")
			return
		}
		c, err := s.st.CreateCliente(store.Cliente{
			Nombre: nombre, ContactoNombre: contacto,
			ContactoTelefono: tel, PaqueteID: paqueteID,
			Paquete: p.Nombre, VendidoPor: vendedorID,
			Estado: produccion.ClienteActivo, CreatedBy: actor.ID,
		})
		if err != nil {
			errorDatos(w, err)
			return
		}
		cliente = c
		_, _ = actividad.Registrar(s.st, actor, "crear_cliente", c.ID, nil,
			map[string]any{"nombre": c.Nombre, "estado": c.Estado, "lead_id": l.ID}, "")
	}
	// Comisión 8 % una sola vez por el camino F2 que ya existe (modo
	// una_vez; idempotente por vendedor+cliente+periodo).
	if cfg, err := s.st.GetConfig(); err == nil && cfg.ModoComision == cobros.ModoUnaVez {
		s.generarComisiones(actor, cobros.PeriodoActual(), &cliente)
	}
	act, err := s.st.UpdateLead(l.ID, map[string]any{
		"estado": ventas.LeadGanado, "cliente_id": cliente.ID,
		"paquete_id": paqueteID,
	})
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.registrarLead(actor, l.ID, "ganar",
		map[string]any{"estado": l.Estado},
		map[string]any{"estado": act.Estado, "cliente_id": cliente.ID}, "")
	if vendedorID != "" {
		s.notificar(vendedorID, NotiLeadGanado,
			"Lead ganado", l.Negocio+" → cliente", "lead", l.ID)
	}
	v := s.leadVista(act)
	v["cliente_id"] = cliente.ID
	writeJSON(w, http.StatusOK, v)
}

// permisoCliente: admin/dueño todo; equipo-ventas solo si… (crear cliente
// desde un lead lo puede hacer el vendedor dueño del lead; la ficha la ve
// el admin).
func permisoCliente(u permisos.Usuario, _ string, _ *Server) bool {
	return esAdmin(u) || tieneVentas(u)
}

func permisoCrearCliente(u permisos.Usuario) bool {
	return esAdmin(u) || tieneVentas(u)
}

// clientePrevio busca si el negocio ya fue cliente (§5.25): match por
// teléfono normalizado o nombre parecido entre archivados y terminados
// (también activos: no crear dos veces el mismo negocio).
func (s *Server) clientePrevio(l store.Lead) *store.Cliente {
	clientes, err := s.st.ListClientes(true)
	if err != nil {
		return nil
	}
	telLead := ventas.NormalizarTelefono(l.Telefono)
	for _, c := range clientes {
		if telLead != "" && ventas.NormalizarTelefono(c.ContactoTelefono) == telLead {
			cp := c
			return &cp
		}
		if strings.TrimSpace(l.Negocio) != "" && ventas.NombreParecido(l.Negocio, c.Nombre) {
			cp := c
			return &cp
		}
	}
	return nil
}

func (s *Server) listLeadEventos(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	l, ok := s.conLead(w, r.PathValue("id"))
	if !ok {
		return
	}
	if !s.puedeVerLead(u, l) {
		if !esAdmin(u) && !tieneVentas(u) {
			writeError(w, http.StatusForbidden, "no autorizado")
			return
		}
		writeError(w, http.StatusNotFound, "lead no encontrado")
		return
	}
	evs, err := s.st.ListLeadEventos(l.ID)
	if err != nil {
		errorDatos(w, err)
		return
	}
	if evs == nil {
		evs = []store.LeadEvento{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"eventos": evs})
}

// --- /visitas ---

type visitaBody struct {
	LeadID    string   `json:"lead_id"`
	Negocio   string   `json:"negocio"`
	Telefono  string   `json:"telefono"`
	Municipio string   `json:"municipio"`
	Direccion string   `json:"direccion"`
	Barrio    string   `json:"barrio"`
	Latitud   *float64 `json:"latitud"`
	Longitud  *float64 `json:"longitud"`
	Notas     string   `json:"notas"`
	Resultado string   `json:"resultado"`
	ClientID  string   `json:"client_id"`
	Cuando    string   `json:"cuando"`
}

// visitaVista enriquece la visita con negocio y fotos.
func (s *Server) visitaVista(v store.Visita) map[string]any {
	out := map[string]any{
		"id": v.ID, "lead_id": v.LeadID, "vendedor_id": v.Vendedor,
		"client_id": v.ClientID, "latitud": v.Latitud, "longitud": v.Longitud,
		"notas": v.Notas, "resultado": v.Resultado, "fotos": v.Fotos,
		"cuando": v.Cuando, "created_at": v.CreatedAt,
	}
	if l, existe, _ := s.st.GetLead(v.LeadID); existe {
		out["negocio"] = l.Negocio
	}
	if u, ok := s.mapaUsuarios()[v.Vendedor]; ok {
		out["vendedor_nombre"] = u.Nombre
	}
	return out
}

func (s *Server) listVisitas(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !esAdmin(u) && !tieneVentas(u) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	q := r.URL.Query()
	fLead, fVendedor, fMias := q.Get("lead"), q.Get("vendedor"), q.Get("mias") == "1"
	todas, err := s.st.ListVisitas()
	if err != nil {
		errorDatos(w, err)
		return
	}
	out := []map[string]any{}
	for _, v := range todas {
		if !esAdmin(u) && v.Vendedor != u.ID {
			continue
		}
		if fLead != "" && v.LeadID != fLead {
			continue
		}
		if fVendedor != "" && v.Vendedor != fVendedor {
			continue
		}
		if fMias && v.Vendedor != u.ID {
			continue
		}
		out = append(out, s.visitaVista(v))
	}
	writeJSON(w, http.StatusOK, map[string]any{"visitas": out})
}

// createVisita registra una visita desde un lead o creando el lead ahí
// mismo (BRIEF F4 §2: negocio+teléfono → lead nuevo en prospecto).
// Idempotente por client_id (§5.23): si ya existe una visita con ese
// client_id, devuelve 200 con la existente sin crear otra.
func (s *Server) createVisita(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !esAdmin(actor) && !tieneVentas(actor) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	var body visitaBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	resultado := strings.TrimSpace(body.Resultado)
	if !ventas.ResultadoVisitaValido(resultado) {
		writeError(w, http.StatusBadRequest, "resultado inválido (interesado, no_interesado o volver)")
		return
	}
	clientID := strings.TrimSpace(body.ClientID)
	if !ventas.ClientIDValido(clientID) {
		writeError(w, http.StatusBadRequest, "client_id inválido")
		return
	}
	// Idempotencia offline: el backend ignora duplicados (§5.23).
	if clientID != "" {
		if prev, existe, err := s.st.VisitaPorClientID(clientID); err == nil && existe {
			writeJSON(w, http.StatusOK, s.visitaVista(prev))
			return
		}
	}
	leadID := strings.TrimSpace(body.LeadID)
	if leadID == "" {
		// Crear el lead ahí mismo (BRIEF F4 §2).
		if strings.TrimSpace(body.Negocio) == "" {
			writeError(w, http.StatusBadRequest, "la visita necesita lead_id o negocio para crear el lead")
			return
		}
		vendedorID := actor.ID
		if esAdmin(actor) {
			vendedorID = actor.ID
		}
		if !permisos.Puede(actor, permisos.CRM, leadRecurso(actor, vendedorID)) {
			writeError(w, http.StatusForbidden, "no autorizado")
			return
		}
		l, err := s.st.CreateLead(store.Lead{
			Negocio: strings.TrimSpace(body.Negocio),
			Telefono: strings.TrimSpace(body.Telefono),
			Municipio: strings.TrimSpace(body.Municipio),
			Direccion: strings.TrimSpace(body.Direccion),
			Barrio: strings.TrimSpace(body.Barrio),
			Origen: "visita", Estado: ventas.LeadProspecto,
			VendedorID: vendedorID, CreatedBy: actor.ID,
		})
		if err != nil {
			errorDatos(w, err)
			return
		}
		s.registrarLead(actor, l.ID, "crear",
			nil, map[string]any{"negocio": l.Negocio, "origen": "visita"}, "")
		leadID = l.ID
	} else {
		l, ok := s.conLead(w, leadID)
		if !ok {
			return
		}
		if !s.puedeVerLead(actor, l) {
			writeError(w, http.StatusNotFound, "lead no encontrado")
			return
		}
	}
	v, err := s.st.CreateVisita(store.Visita{
		LeadID: leadID, Vendedor: actor.ID, ClientID: clientID,
		Latitud: body.Latitud, Longitud: body.Longitud,
		Notas: body.Notas, Resultado: resultado,
		Cuando: strings.TrimSpace(body.Cuando), CreatedBy: actor.ID,
	})
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.registrarLead(actor, leadID, "visita",
		nil, map[string]any{"resultado": resultado}, strings.TrimSpace(body.Notas))
	if !esAdmin(actor) {
		// Avisar a los admins de la visita nueva (campanita).
		if us, err := s.st.ListUsuarios(); err == nil {
			for _, x := range us {
				if x.Acceso == permisos.AccesoDueno || x.Acceso == permisos.AccesoAdmin {
					s.notificar(x.ID, NotiVisitaNueva,
						"Visita nueva", actor.Nombre, "visita", v.ID)
				}
			}
		}
	}
	writeJSON(w, http.StatusCreated, s.visitaVista(v))
}

func (s *Server) getVisita(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	v, existe, err := s.st.GetVisita(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	if !existe {
		writeError(w, http.StatusNotFound, "visita no encontrada")
		return
	}
	if !esAdmin(u) && v.Vendedor != u.ID {
		writeError(w, http.StatusNotFound, "visita no encontrada")
		return
	}
	writeJSON(w, http.StatusOK, s.visitaVista(v))
}

func (s *Server) visitasDeLead(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	l, ok := s.conLead(w, r.PathValue("id"))
	if !ok {
		return
	}
	if !s.puedeVerLead(u, l) {
		writeError(w, http.StatusNotFound, "lead no encontrado")
		return
	}
	vs, err := s.st.VisitasDeLead(l.ID)
	if err != nil {
		errorDatos(w, err)
		return
	}
	out := []map[string]any{}
	for _, v := range vs {
		out = append(out, s.visitaVista(v))
	}
	writeJSON(w, http.StatusOK, map[string]any{"visitas": out})
}

type fotoBody struct {
	// Datos en base64 (data URL o base64 puro) tras comprimir en el cliente
	// con canvas (~500 KB por foto, BRIEF F4 §2).
	Datos  string `json:"datos"`
	Nombre string `json:"nombre"`
}

// subirFotoVisita guarda una foto (cámara/galería) de la visita. En modo
// demo guarda en memoria con tope MaxFotoBytes; la interfaz
// store.GuardarArchivo queda preparada para Supabase Storage.
func (s *Server) subirFotoVisita(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	v, existe, err := s.st.GetVisita(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	if !existe {
		writeError(w, http.StatusNotFound, "visita no encontrada")
		return
	}
	if !esAdmin(actor) && v.Vendedor != actor.ID {
		writeError(w, http.StatusNotFound, "visita no encontrada")
		return
	}
	var body fotoBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	raw := strings.TrimSpace(body.Datos)
	if i := strings.Index(raw, ","); strings.HasPrefix(raw, "data:") && i >= 0 {
		raw = raw[i+1:]
	}
	datos, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		writeError(w, http.StatusBadRequest, "foto inválida (base64)")
		return
	}
	if !ventas.FotoTamanoValido(len(datos)) {
		writeError(w, http.StatusRequestEntityTooLarge, "foto muy grande (máximo 500 KB tras comprimir)")
		return
	}
	nombre := strings.TrimSpace(body.Nombre)
	if nombre == "" {
		nombre = "foto.jpg"
	}
	id, err := s.st.GuardarArchivo(nombre, datos)
	if err != nil {
		if err == store.ErrFotoGrande {
			writeError(w, http.StatusRequestEntityTooLarge, "foto muy grande (máximo 500 KB tras comprimir)")
			return
		}
		errorDatos(w, err)
		return
	}
	// Enlazar el archivo a la visita (contador en la vista).
	if mem, ok := s.st.(interface {
		EnlazarArchivo(visitaID, archivoID string)
	}); ok {
		mem.EnlazarArchivo(v.ID, id)
	}
	n, _ := s.st.ContarFotosVisita(v.ID)
	vv := s.visitaVista(v)
	vv["fotos"] = n
	vv["foto_id"] = id
	writeJSON(w, http.StatusCreated, vv)
}

func (s *Server) listFotosVisita(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	v, existe, err := s.st.GetVisita(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	if !existe {
		writeError(w, http.StatusNotFound, "visita no encontrada")
		return
	}
	if !esAdmin(u) && v.Vendedor != u.ID {
		writeError(w, http.StatusNotFound, "visita no encontrada")
		return
	}
	n, _ := s.st.ContarFotosVisita(v.ID)
	writeJSON(w, http.StatusOK, map[string]any{"visita_id": v.ID, "fotos": n})
}

// --- métricas (BRIEF F4 §4) ---

func (s *Server) metricasVentas(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !esAdmin(u) && !tieneVentas(u) {
		writeError(w, http.StatusForbidden, "no autorizado")
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
	mes := cobros.PeriodoActual()
	porEtapa := map[string]int{}
	porVendedor := map[string]int{}
	ganadosMes, perdidosMes, nuevosMes := 0, 0, 0
	for _, l := range leads {
		if !esAdmin(u) && l.VendedorID != u.ID {
			continue
		}
		porEtapa[l.Estado]++
		if l.VendedorID != "" {
			porVendedor[l.VendedorID]++
		}
		if len(l.CreatedAt) >= 7 && l.CreatedAt[:7] == mes {
			nuevosMes++
		}
		if len(l.UpdatedAt) >= 7 && l.UpdatedAt[:7] == mes {
			if l.Estado == ventas.LeadGanado {
				ganadosMes++
			}
			if l.Estado == ventas.LeadPerdido {
				perdidosMes++
			}
		}
	}
	visitasPorVendedor := map[string]int{}
	for _, v := range visitas {
		if !esAdmin(u) && v.Vendedor != u.ID {
			continue
		}
		visitasPorVendedor[v.Vendedor]++
	}
	// Tasa de conversión del mes: ganados / (ganados + perdidos).
	conversion := 0.0
	if ganadosMes+perdidosMes > 0 {
		conversion = float64(ganadosMes) / float64(ganadosMes+perdidosMes)
	}
	nombres := map[string]string{}
	for id, u2 := range s.mapaUsuarios() {
		nombres[id] = u2.Nombre
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"por_etapa": porEtapa, "por_vendedor": porVendedor,
		"visitas_por_vendedor": visitasPorVendedor,
		"tasa_conversion_mes":  conversion,
		"ganados_mes": ganadosMes, "perdidos_mes": perdidosMes,
		"nuevos_mes": nuevosMes, "vendedores": nombres,
	})
}
