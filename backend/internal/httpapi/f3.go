// Package httpapi — F3 biblioteca: handlers de formatos, hooks,
// referencias, SOPs (+pasos) y ejecuciones de SOP. Mismo patrón F0/F1/F2:
// resolveUser + permisos.Puede + secreto interno X-RC-Internal. Solo stdlib.
//
// Reglas que impone cada handler (BRIEF F3 §1, ANALISIS §3.2):
//   - Leer: todo acceso salvo pendiente/desactivado (BibliotecaLeer).
//   - Proponer: equipo → queda en borrador (forzado) visible solo para
//     quien lo propuso y para admin/dueño. Admin/dueño crea y publica
//     directo (BibliotecaCrear).
//   - Publicar/rechazar/archivar: solo admin/dueño (BibliotecaPublicar;
//     equipo → 403, §4.4). Rechazar exige motivo.
//   - Editar: admin/dueño todo salvo archivado; equipo solo su borrador o
//     rechazado (reproponer lo vuelve a borrador); nadie del equipo edita
//     lo publicado (BibliotecaEditar, §4.4).
//   - Pasos de SOP: solo en SOP borrador/rechazado (editar un SOP
//     publicado = archivar + crear nuevo). En publicado → 400.
//   - Ejecución: cualquiera que lee ejecuta SOPs publicados (EjecutarSOP);
//     ligada a tarea F1 opcional (equipo: solo sus tareas). Solo el dueño
//     de la ejecución (o admin) marca pasos y la termina. Terminada no se
//     reabre. El admin ve todas las ejecuciones; el equipo solo las suyas.
//   - Nada se borra: se archiva (§5.16). Cada cambio → actividad.Registrar.
package httpapi

import (
	"net/http"
	"strings"

	"rconceptsys/backend/internal/actividad"
	"rconceptsys/backend/internal/biblioteca"
	"rconceptsys/backend/internal/permisos"
	"rconceptsys/backend/internal/store"
)

// rutasF3 registra los endpoints de biblioteca en el mux.
func (s *Server) rutasF3(mux *http.ServeMux) {
	mux.HandleFunc("GET /formatos", s.listFormatos)
	mux.HandleFunc("POST /formatos", s.createFormato)
	mux.HandleFunc("GET /formatos/{id}", s.getFormato)
	mux.HandleFunc("PATCH /formatos/{id}", s.patchFormato)
	mux.HandleFunc("POST /formatos/{id}/publicar", s.publicarFormato)
	mux.HandleFunc("POST /formatos/{id}/rechazar", s.rechazarFormato)
	mux.HandleFunc("POST /formatos/{id}/archivar", s.archivarFormato)

	mux.HandleFunc("GET /hooks", s.listHooks)
	mux.HandleFunc("POST /hooks", s.createHook)
	mux.HandleFunc("GET /hooks/{id}", s.getHook)
	mux.HandleFunc("PATCH /hooks/{id}", s.patchHook)
	mux.HandleFunc("POST /hooks/{id}/publicar", s.publicarHook)
	mux.HandleFunc("POST /hooks/{id}/rechazar", s.rechazarHook)
	mux.HandleFunc("POST /hooks/{id}/archivar", s.archivarHook)

	mux.HandleFunc("GET /referencias", s.listReferencias)
	mux.HandleFunc("POST /referencias", s.createReferencia)
	mux.HandleFunc("GET /referencias/{id}", s.getReferencia)
	mux.HandleFunc("PATCH /referencias/{id}", s.patchReferencia)
	mux.HandleFunc("POST /referencias/{id}/publicar", s.publicarReferencia)
	mux.HandleFunc("POST /referencias/{id}/rechazar", s.rechazarReferencia)
	mux.HandleFunc("POST /referencias/{id}/archivar", s.archivarReferencia)

	mux.HandleFunc("GET /sops", s.listSOPs)
	mux.HandleFunc("POST /sops", s.createSOP)
	mux.HandleFunc("GET /sops/{id}", s.getSOP)
	mux.HandleFunc("PATCH /sops/{id}", s.patchSOP)
	mux.HandleFunc("POST /sops/{id}/publicar", s.publicarSOP)
	mux.HandleFunc("POST /sops/{id}/rechazar", s.rechazarSOP)
	mux.HandleFunc("POST /sops/{id}/archivar", s.archivarSOP)

	mux.HandleFunc("GET /sops/{id}/pasos", s.listSOPPasos)
	mux.HandleFunc("POST /sops/{id}/pasos", s.createSOPPaso)
	mux.HandleFunc("PATCH /sop-pasos/{id}", s.patchSOPPaso)

	mux.HandleFunc("GET /sop-ejecuciones", s.listSOPEjecuciones)
	mux.HandleFunc("POST /sop-ejecuciones", s.createSOPEjecucion)
	mux.HandleFunc("GET /sop-ejecuciones/{id}", s.getSOPEjecucion)
	mux.HandleFunc("POST /sop-ejecuciones/{id}/pasos", s.marcarEjecucionPaso)
	mux.HandleFunc("DELETE /sop-ejecuciones/{id}/pasos/{paso_id}", s.desmarcarEjecucionPaso)
	mux.HandleFunc("POST /sop-ejecuciones/{id}/terminar", s.terminarEjecucion)
}

// Tipos de notificación F3 (campanita in-app).
const (
	NotiContenidoPublicado = "contenido_publicado"
	NotiContenidoRechazado = "contenido_rechazado"
)

// --- item genérico de contenido ---

// bibItem normaliza los 4 tipos para compartir la lógica de visibilidad,
// búsqueda y flujo. raw conserva el struct tipado para responder.
type bibItem struct {
	id, estado, propuestoPor, publicadoPor, motivo string
	titulo, texto                                  string
	etiquetas                                     []string
	raw                                           any
}

func bibDeFormato(f store.Formato) bibItem {
	return bibItem{
		id: f.ID, estado: f.Estado, propuestoPor: f.PropuestoPor,
		publicadoPor: f.PublicadoPor, motivo: f.MotivoRechazo,
		titulo: f.Nombre,
		texto: strings.Join([]string{f.Codigo, f.Nombre, f.Objetivo,
			f.Estructura, f.HooksRecomendados, f.KPIs,
			strings.Join(f.Ejemplos, " ")}, "\n"),
		etiquetas: f.Etiquetas, raw: f,
	}
}

func bibDeHook(h store.Hook) bibItem {
	return bibItem{
		id: h.ID, estado: h.Estado, propuestoPor: h.PropuestoPor,
		publicadoPor: h.PublicadoPor, motivo: h.MotivoRechazo,
		titulo: h.Titulo,
		texto: strings.Join([]string{h.Titulo, h.Categoria, h.Psicologia,
			h.RetencionEsperada, h.Variaciones,
			strings.Join(h.Ejemplos, " ")}, "\n"),
		etiquetas: h.Etiquetas, raw: h,
	}
}

func bibDeReferencia(r store.Referencia) bibItem {
	return bibItem{
		id: r.ID, estado: r.Estado, propuestoPor: r.PropuestoPor,
		publicadoPor: r.PublicadoPor, motivo: r.MotivoRech,
		titulo: r.Titulo,
		texto: strings.Join([]string{r.Titulo, r.Link, r.Plataforma,
			r.Analisis}, "\n"),
		etiquetas: r.Etiquetas, raw: r,
	}
}

func bibDeSOP(p store.SOP) bibItem {
	return bibItem{
		id: p.ID, estado: p.Estado, propuestoPor: p.PropuestoPor,
		publicadoPor: p.PublicadoPor, motivo: p.MotivoRechazo,
		titulo: p.Titulo,
		texto: strings.Join([]string{p.Titulo, p.Oficio}, "\n"),
		etiquetas: p.Etiquetas, raw: p,
	}
}

// visiblePara: publicado → todo el que lee; lo demás → admin/dueño o el
// proponente. Lo invisible responde 404 (no se filtra la existencia de
// borradores ajenos, §4.4).
func (b bibItem) visiblePara(u permisos.Usuario) bool {
	if b.estado == biblioteca.EstadoPublicado {
		return true
	}
	if esAdmin(u) {
		return true
	}
	return b.propuestoPor != "" && b.propuestoPor == u.ID
}

// coincide aplica los filtros de lista ?q= (texto) y ?etiqueta=.
func (b bibItem) coincide(q, etiqueta string) bool {
	if etiqueta != "" {
		hay := false
		for _, e := range b.etiquetas {
			if strings.EqualFold(strings.TrimSpace(e), strings.TrimSpace(etiqueta)) {
				hay = true
				break
			}
		}
		if !hay {
			return false
		}
	}
	if q = strings.TrimSpace(q); q != "" {
		return strings.Contains(strings.ToLower(b.texto), strings.ToLower(q))
	}
	return true
}

// conNombreProponente agrega propuesto_por_nombre para la vista de
// borradores del admin.
func (s *Server) conNombreProponente(v map[string]any, propuestoPor string) map[string]any {
	if propuestoPor == "" {
		return v
	}
	if u, existe, err := s.st.GetUsuario(propuestoPor); err == nil && existe {
		v["propuesto_por_nombre"] = u.Nombre
	}
	return v
}

func formatoVista(f store.Formato) map[string]any {
	return map[string]any{
		"id": f.ID, "codigo": f.Codigo, "nombre": f.Nombre,
		"objetivo": f.Objetivo, "estructura": f.Estructura,
		"hooks_recomendados": f.HooksRecomendados, "kpis": f.KPIs,
		"ejemplos": f.Ejemplos, "etiquetas": f.Etiquetas,
		"estado": f.Estado, "propuesto_por": f.PropuestoPor,
		"publicado_por": f.PublicadoPor, "motivo_rechazo": f.MotivoRechazo,
		"demo": f.Demo, "created_at": f.CreatedAt, "updated_at": f.UpdatedAt,
	}
}

func hookVista(h store.Hook) map[string]any {
	return map[string]any{
		"id": h.ID, "titulo": h.Titulo, "categoria": h.Categoria,
		"psicologia": h.Psicologia, "retencion_esperada": h.RetencionEsperada,
		"variaciones": h.Variaciones,
		"ejemplos": h.Ejemplos, "etiquetas": h.Etiquetas,
		"estado": h.Estado, "propuesto_por": h.PropuestoPor,
		"publicado_por": h.PublicadoPor, "motivo_rechazo": h.MotivoRechazo,
		"demo": h.Demo, "created_at": h.CreatedAt, "updated_at": h.UpdatedAt,
	}
}

func referenciaVista(r store.Referencia) map[string]any {
	return map[string]any{
		"id": r.ID, "titulo": r.Titulo, "link": r.Link,
		"plataforma": r.Plataforma, "analisis": r.Analisis,
		"etiquetas": r.Etiquetas, "cliente_id": r.ClienteID,
		"estado": r.Estado, "propuesto_por": r.PropuestoPor,
		"publicado_por": r.PublicadoPor, "motivo_rechazo": r.MotivoRech,
		"demo": r.Demo, "created_at": r.CreatedAt, "updated_at": r.UpdatedAt,
	}
}

func sopVista(p store.SOP) map[string]any {
	var tiempo any
	if p.TiempoEstimadoMin != nil {
		tiempo = *p.TiempoEstimadoMin
	}
	return map[string]any{
		"id": p.ID, "titulo": p.Titulo, "oficio": p.Oficio,
		"tiempo_estimado_min": tiempo,
		"etiquetas": p.Etiquetas,
		"estado": p.Estado, "propuesto_por": p.PropuestoPor,
		"publicado_por": p.PublicadoPor, "motivo_rechazo": p.MotivoRechazo,
		"demo": p.Demo, "created_at": p.CreatedAt, "updated_at": p.UpdatedAt,
	}
}

func sopPasoVista(p store.SOPPaso) map[string]any {
	return map[string]any{
		"id": p.ID, "sop_id": p.SOPID, "orden": p.Orden,
		"titulo": p.Titulo, "title": p.Titulo,
		"descripcion": p.Descripcion, "created_at": p.CreatedAt,
	}
}

// validaVinculoBiblio chequea el vínculo formato/hook recomendado en
// clientes y piezas (BRIEF F3 §1, solo referencia): si se informa, debe
// existir y estar publicado. Responde 400 y devuelve false si ya respondió.
func (s *Server) validaVinculoBiblio(w http.ResponseWriter, formatoID, hookID string) bool {
	if strings.TrimSpace(formatoID) != "" {
		f, existe, err := s.st.GetFormato(strings.TrimSpace(formatoID))
		if err != nil {
			errorDatos(w, err)
			return false
		}
		if !existe {
			writeError(w, http.StatusBadRequest, "el formato recomendado no existe")
			return false
		}
		if f.Estado != biblioteca.EstadoPublicado {
			writeError(w, http.StatusBadRequest, "el formato recomendado no está publicado")
			return false
		}
	}
	if strings.TrimSpace(hookID) != "" {
		h, existe, err := s.st.GetHook(strings.TrimSpace(hookID))
		if err != nil {
			errorDatos(w, err)
			return false
		}
		if !existe {
			writeError(w, http.StatusBadRequest, "el hook recomendado no existe")
			return false
		}
		if h.Estado != biblioteca.EstadoPublicado {
			writeError(w, http.StatusBadRequest, "el hook recomendado no está publicado")
			return false
		}
	}
	return true
}

// --- listados genéricos ---

func (s *Server) listBib(w http.ResponseWriter, r *http.Request, items []bibItem, clave string, aVista func(bibItem) map[string]any) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(u, permisos.BibliotecaLeer, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	q := r.URL.Query()
	fEstado, fQ, fEt := q.Get("estado"), q.Get("q"), q.Get("etiqueta")
	vista := []map[string]any{}
	for _, b := range items {
		if !b.visiblePara(u) {
			continue
		}
		if fEstado != "" && b.estado != fEstado {
			continue
		}
		if !b.coincide(fQ, fEt) {
			continue
		}
		vista = append(vista, s.conNombreProponente(aVista(b), b.propuestoPor))
	}
	writeJSON(w, http.StatusOK, map[string]any{clave: vista})
}

// getBib trae un item o responde 404/502 (borrador ajeno → 404, §4.4).
func (s *Server) getBib(w http.ResponseWriter, u permisos.Usuario, b bibItem, existe bool, tipo string) (bibItem, bool) {
	if !existe {
		writeError(w, http.StatusNotFound, tipo+" no encontrado")
		return bibItem{}, false
	}
	if !b.visiblePara(u) {
		writeError(w, http.StatusNotFound, tipo+" no encontrado")
		return bibItem{}, false
	}
	return b, true
}

// puedeEditarBib: admin/dueño todo salvo archivado; equipo solo su
// borrador o rechazado. Publicado del equipo → 403 (§4.4).
func puedeEditarBib(u permisos.Usuario, b bibItem) (string, bool) {
	if esAdmin(u) {
		if b.estado == biblioteca.EstadoArchivado {
			return "archivado no se edita (está archivado)", false
		}
		return "", true
	}
	if b.estado == biblioteca.EstadoPublicado {
		return "no podés editar contenido publicado", false
	}
	if b.estado == biblioteca.EstadoArchivado {
		return "archivado no se edita (está archivado)", false
	}
	if b.propuestoPor == "" || b.propuestoPor != u.ID {
		return "no autorizado", false
	}
	return "", true
}

// --- /formatos ---

type formatoBody struct {
	Codigo            string   `json:"codigo"`
	Nombre            string   `json:"nombre"`
	Objetivo          string   `json:"objetivo"`
	Estructura        string   `json:"estructura"`
	HooksRecomendados string   `json:"hooks_recomendados"`
	KPIs              string   `json:"kpis"`
	Ejemplos          []string `json:"ejemplos"`
	Etiquetas         []string `json:"etiquetas"`
	Estado            string   `json:"estado"`
}

func (s *Server) listFormatos(w http.ResponseWriter, r *http.Request) {
	formatos, err := s.st.ListFormatos()
	if err != nil {
		u, ok := s.usuarioActual(w, r)
		if !ok {
			return
		}
		_ = u
		errorDatos(w, err)
		return
	}
	items := make([]bibItem, 0, len(formatos))
	for _, f := range formatos {
		items = append(items, bibDeFormato(f))
	}
	s.listBib(w, r, items, "formatos", func(b bibItem) map[string]any {
		return formatoVista(b.raw.(store.Formato))
	})
}

func (s *Server) createFormato(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.BibliotecaCrear, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	var body formatoBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	if strings.TrimSpace(body.Nombre) == "" {
		writeError(w, http.StatusBadRequest, "el nombre es obligatorio")
		return
	}
	// F35: codigo UNIQUE (el SQL lo exige; aquí se valida para no fallar
	// solo en real). Vacío = sin código (dos vacíos no colisionan).
	codigo := strings.TrimSpace(body.Codigo)
	if codigo != "" {
		fs, err := s.st.ListFormatos()
		if err != nil {
			errorDatos(w, err)
			return
		}
		for _, f := range fs {
			if f.Codigo == codigo {
				writeError(w, http.StatusConflict, "ese código ya existe")
				return
			}
		}
	}
	estado := biblioteca.EstadoBorrador
	publicadoPor := ""
	if esAdmin(actor) {
		estado = biblioteca.EstadoPublicado
		publicadoPor = actor.ID
		if e := strings.TrimSpace(body.Estado); e == biblioteca.EstadoBorrador {
			estado = biblioteca.EstadoBorrador
			publicadoPor = ""
		} else if e != "" && e != biblioteca.EstadoPublicado {
			writeError(w, http.StatusBadRequest, "estado inválido (borrador o publicado)")
			return
		}
	}
	f, err := s.st.CreateFormato(store.Formato{
		Codigo: codigo, Nombre: strings.TrimSpace(body.Nombre),
		Objetivo: body.Objetivo, Estructura: body.Estructura,
		HooksRecomendados: body.HooksRecomendados, KPIs: body.KPIs,
		Ejemplos: limpias(body.Ejemplos), Etiquetas: limpias(body.Etiquetas),
		Estado: estado, PropuestoPor: actor.ID, PublicadoPor: publicadoPor,
		CreatedBy: actor.ID,
	})
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "crear_formato", f.ID, nil,
		map[string]any{"nombre": f.Nombre, "estado": f.Estado}, "")
	writeJSON(w, http.StatusCreated, formatoVista(f))
}

func (s *Server) getFormato(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(u, permisos.BibliotecaLeer, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	f, existe, err := s.st.GetFormato(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	b, ok := s.getBib(w, u, bibDeFormato(f), existe, "formato")
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, s.conNombreProponente(formatoVista(b.raw.(store.Formato)), b.propuestoPor))
}

func (s *Server) patchFormato(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.BibliotecaCrear, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	f, existe, err := s.st.GetFormato(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	b, ok := s.getBib(w, actor, bibDeFormato(f), existe, "formato")
	if !ok {
		return
	}
	_ = b
	if msg, ok := puedeEditarBib(actor, bibDeFormato(f)); !ok {
		codigo := http.StatusForbidden
		if strings.HasPrefix(msg, "archivado") {
			codigo = http.StatusBadRequest
		}
		writeError(w, codigo, msg)
		return
	}
	var body formatoBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	cambios := map[string]any{}
	if body.Nombre != "" && body.Nombre != f.Nombre {
		cambios["nombre"] = strings.TrimSpace(body.Nombre)
	}
	if body.Codigo != f.Codigo && (body.Codigo != "" || f.Codigo != "") {
		cambios["codigo"] = strings.TrimSpace(body.Codigo)
	}
	if body.Objetivo != f.Objetivo && (body.Objetivo != "" || f.Objetivo != "") {
		cambios["objetivo"] = body.Objetivo
	}
	if body.Estructura != f.Estructura && (body.Estructura != "" || f.Estructura != "") {
		cambios["estructura"] = body.Estructura
	}
	if body.HooksRecomendados != f.HooksRecomendados && (body.HooksRecomendados != "" || f.HooksRecomendados != "") {
		cambios["hooks_recomendados"] = body.HooksRecomendados
	}
	if body.KPIs != f.KPIs && (body.KPIs != "" || f.KPIs != "") {
		cambios["kpis"] = body.KPIs
	}
	if body.Ejemplos != nil {
		cambios["ejemplos"] = limpias(body.Ejemplos)
	}
	if body.Etiquetas != nil {
		cambios["etiquetas"] = limpias(body.Etiquetas)
	}
	// Reproponer: editar un rechazado propio lo vuelve a borrador (§3.2).
	if f.Estado == biblioteca.EstadoRechazado && len(cambios) > 0 {
		cambios["estado"] = biblioteca.EstadoBorrador
		cambios["motivo_rechazo"] = ""
	}
	if len(cambios) == 0 {
		writeJSON(w, http.StatusOK, formatoVista(f))
		return
	}
	antes := map[string]any{"nombre": f.Nombre, "estado": f.Estado}
	act, err := s.st.UpdateFormato(f.ID, cambios)
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "editar_formato", f.ID,
		antes, map[string]any{"nombre": act.Nombre, "estado": act.Estado}, "")
	writeJSON(w, http.StatusOK, formatoVista(act))
}

// moverBib aplica publicar/rechazar/archivar con la transición validada.
func (s *Server) moverBib(w http.ResponseWriter, r *http.Request, b bibItem, existe bool, tipo, accion string, a string, motivo string, cambia func(id string, cambios map[string]any) (bibItem, error)) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.BibliotecaPublicar, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	b, ok = s.getBib(w, actor, b, existe, tipo)
	if !ok {
		return
	}
	if b.estado == a {
		writeJSON(w, http.StatusOK, b.raw)
		return
	}
	if !biblioteca.TransicionContenidoValida(b.estado, a) {
		writeError(w, http.StatusBadRequest, "esa transición de estado no es válida")
		return
	}
	cambios := map[string]any{"estado": a}
	if a == biblioteca.EstadoPublicado {
		cambios["publicado_por"] = actor.ID
		cambios["motivo_rechazo"] = ""
	}
	if a == biblioteca.EstadoRechazado {
		cambios["motivo_rechazo"] = motivo
		cambios["publicado_por"] = ""
	}
	act, err := cambia(b.id, cambios)
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, accion+"_"+tipo, b.id,
		map[string]any{"estado": b.estado}, map[string]any{"estado": a}, motivo)
	if act.propuestoPor != "" && act.propuestoPor != actor.ID {
		if a == biblioteca.EstadoPublicado {
			s.notificar(act.propuestoPor, NotiContenidoPublicado,
				"Tu "+tipo+" fue publicado", act.titulo, tipo, act.id)
		} else if a == biblioteca.EstadoRechazado {
			s.notificar(act.propuestoPor, NotiContenidoRechazado,
				"Tu "+tipo+" fue rechazado", motivo, tipo, act.id)
		}
	}
	writeJSON(w, http.StatusOK, act.raw)
}

func (s *Server) publicarFormato(w http.ResponseWriter, r *http.Request) {
	f, existe, err := s.st.GetFormato(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.moverBib(w, r, bibDeFormato(f), existe, "formato", "publicar",
		biblioteca.EstadoPublicado, "", func(id string, cambios map[string]any) (bibItem, error) {
			act, err := s.st.UpdateFormato(id, cambios)
			return bibDeFormato(act), err
		})
}

func (s *Server) rechazarFormato(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Motivo string `json:"motivo"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	if strings.TrimSpace(body.Motivo) == "" {
		writeError(w, http.StatusBadRequest, "el motivo del rechazo es obligatorio")
		return
	}
	f, existe, err := s.st.GetFormato(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.moverBib(w, r, bibDeFormato(f), existe, "formato", "rechazar",
		biblioteca.EstadoRechazado, strings.TrimSpace(body.Motivo), func(id string, cambios map[string]any) (bibItem, error) {
			act, err := s.st.UpdateFormato(id, cambios)
			return bibDeFormato(act), err
		})
}

func (s *Server) archivarFormato(w http.ResponseWriter, r *http.Request) {
	f, existe, err := s.st.GetFormato(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.moverBib(w, r, bibDeFormato(f), existe, "formato", "archivar",
		biblioteca.EstadoArchivado, "", func(id string, cambios map[string]any) (bibItem, error) {
			act, err := s.st.UpdateFormato(id, cambios)
			return bibDeFormato(act), err
		})
}

// limpias recorta y quita vacíos de una lista (ejemplos, etiquetas).
func limpias(in []string) []string {
	out := []string{}
	for _, e := range in {
		if e = strings.TrimSpace(e); e != "" {
			out = append(out, e)
		}
	}
	if out == nil {
		out = []string{}
	}
	return out
}

// --- /hooks ---

type hookBody struct {
	Titulo            string   `json:"titulo"`
	Categoria         string   `json:"categoria"`
	Psicologia        string   `json:"psicologia"`
	RetencionEsperada string   `json:"retencion_esperada"`
	Variaciones       string   `json:"variaciones"`
	Ejemplos          []string `json:"ejemplos"`
	Etiquetas         []string `json:"etiquetas"`
	Estado            string   `json:"estado"`
}

func (s *Server) listHooks(w http.ResponseWriter, r *http.Request) {
	hooks, err := s.st.ListHooks()
	if err != nil {
		if _, ok := s.usuarioActual(w, r); !ok {
			return
		}
		errorDatos(w, err)
		return
	}
	items := make([]bibItem, 0, len(hooks))
	fCat := strings.TrimSpace(r.URL.Query().Get("categoria"))
	for _, h := range hooks {
		if fCat != "" && !strings.EqualFold(strings.TrimSpace(h.Categoria), fCat) {
			continue
		}
		items = append(items, bibDeHook(h))
	}
	s.listBib(w, r, items, "hooks", func(b bibItem) map[string]any {
		return hookVista(b.raw.(store.Hook))
	})
}

func (s *Server) createHook(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.BibliotecaCrear, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	var body hookBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	if strings.TrimSpace(body.Titulo) == "" {
		writeError(w, http.StatusBadRequest, "el título es obligatorio")
		return
	}
	estado := biblioteca.EstadoBorrador
	publicadoPor := ""
	if esAdmin(actor) {
		estado = biblioteca.EstadoPublicado
		publicadoPor = actor.ID
		if e := strings.TrimSpace(body.Estado); e == biblioteca.EstadoBorrador {
			estado = biblioteca.EstadoBorrador
			publicadoPor = ""
		} else if e != "" && e != biblioteca.EstadoPublicado {
			writeError(w, http.StatusBadRequest, "estado inválido (borrador o publicado)")
			return
		}
	}
	h, err := s.st.CreateHook(store.Hook{
		Titulo: strings.TrimSpace(body.Titulo), Categoria: strings.TrimSpace(body.Categoria),
		Psicologia: body.Psicologia, RetencionEsperada: strings.TrimSpace(body.RetencionEsperada),
		Variaciones: body.Variaciones,
		Ejemplos:    limpias(body.Ejemplos), Etiquetas: limpias(body.Etiquetas),
		Estado: estado, PropuestoPor: actor.ID, PublicadoPor: publicadoPor,
		CreatedBy: actor.ID,
	})
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "crear_hook", h.ID, nil,
		map[string]any{"titulo": h.Titulo, "estado": h.Estado}, "")
	writeJSON(w, http.StatusCreated, hookVista(h))
}

func (s *Server) getHook(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(u, permisos.BibliotecaLeer, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	h, existe, err := s.st.GetHook(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	b, ok := s.getBib(w, u, bibDeHook(h), existe, "hook")
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, s.conNombreProponente(hookVista(b.raw.(store.Hook)), b.propuestoPor))
}

func (s *Server) patchHook(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.BibliotecaCrear, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	h, existe, err := s.st.GetHook(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	b, ok := s.getBib(w, actor, bibDeHook(h), existe, "hook")
	if !ok {
		return
	}
	_ = b
	if msg, ok := puedeEditarBib(actor, bibDeHook(h)); !ok {
		codigo := http.StatusForbidden
		if strings.HasPrefix(msg, "archivado") {
			codigo = http.StatusBadRequest
		}
		writeError(w, codigo, msg)
		return
	}
	var body hookBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	cambios := map[string]any{}
	if body.Titulo != "" && body.Titulo != h.Titulo {
		cambios["titulo"] = strings.TrimSpace(body.Titulo)
	}
	if body.Categoria != h.Categoria && (body.Categoria != "" || h.Categoria != "") {
		cambios["categoria"] = strings.TrimSpace(body.Categoria)
	}
	if body.Psicologia != h.Psicologia && (body.Psicologia != "" || h.Psicologia != "") {
		cambios["psicologia"] = body.Psicologia
	}
	if body.RetencionEsperada != h.RetencionEsperada && (body.RetencionEsperada != "" || h.RetencionEsperada != "") {
		cambios["retencion_esperada"] = strings.TrimSpace(body.RetencionEsperada)
	}
	if body.Variaciones != h.Variaciones && (body.Variaciones != "" || h.Variaciones != "") {
		cambios["variaciones"] = body.Variaciones
	}
	if body.Ejemplos != nil {
		cambios["ejemplos"] = limpias(body.Ejemplos)
	}
	if body.Etiquetas != nil {
		cambios["etiquetas"] = limpias(body.Etiquetas)
	}
	if h.Estado == biblioteca.EstadoRechazado && len(cambios) > 0 {
		cambios["estado"] = biblioteca.EstadoBorrador
		cambios["motivo_rechazo"] = ""
	}
	if len(cambios) == 0 {
		writeJSON(w, http.StatusOK, hookVista(h))
		return
	}
	antes := map[string]any{"titulo": h.Titulo, "estado": h.Estado}
	act, err := s.st.UpdateHook(h.ID, cambios)
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "editar_hook", h.ID,
		antes, map[string]any{"titulo": act.Titulo, "estado": act.Estado}, "")
	writeJSON(w, http.StatusOK, hookVista(act))
}

func (s *Server) publicarHook(w http.ResponseWriter, r *http.Request) {
	h, existe, err := s.st.GetHook(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.moverBib(w, r, bibDeHook(h), existe, "hook", "publicar",
		biblioteca.EstadoPublicado, "", func(id string, cambios map[string]any) (bibItem, error) {
			act, err := s.st.UpdateHook(id, cambios)
			return bibDeHook(act), err
		})
}

func (s *Server) rechazarHook(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Motivo string `json:"motivo"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	if strings.TrimSpace(body.Motivo) == "" {
		writeError(w, http.StatusBadRequest, "el motivo del rechazo es obligatorio")
		return
	}
	h, existe, err := s.st.GetHook(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.moverBib(w, r, bibDeHook(h), existe, "hook", "rechazar",
		biblioteca.EstadoRechazado, strings.TrimSpace(body.Motivo), func(id string, cambios map[string]any) (bibItem, error) {
			act, err := s.st.UpdateHook(id, cambios)
			return bibDeHook(act), err
		})
}

func (s *Server) archivarHook(w http.ResponseWriter, r *http.Request) {
	h, existe, err := s.st.GetHook(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.moverBib(w, r, bibDeHook(h), existe, "hook", "archivar",
		biblioteca.EstadoArchivado, "", func(id string, cambios map[string]any) (bibItem, error) {
			act, err := s.st.UpdateHook(id, cambios)
			return bibDeHook(act), err
		})
}

// --- /referencias ---

type referenciaBody struct {
	Titulo     string   `json:"titulo"`
	Link       string   `json:"link"`
	Plataforma string   `json:"plataforma"`
	Analisis   string   `json:"analisis"`
	Etiquetas  []string `json:"etiquetas"`
	ClienteID  string   `json:"cliente_id"`
	Estado     string   `json:"estado"`
}

func (s *Server) listReferencias(w http.ResponseWriter, r *http.Request) {
	refs, err := s.st.ListReferencias()
	if err != nil {
		if _, ok := s.usuarioActual(w, r); !ok {
			return
		}
		errorDatos(w, err)
		return
	}
	fPlat := r.URL.Query().Get("plataforma")
	items := make([]bibItem, 0, len(refs))
	for _, x := range refs {
		if fPlat != "" && x.Plataforma != fPlat {
			continue
		}
		items = append(items, bibDeReferencia(x))
	}
	s.listBib(w, r, items, "referencias", func(b bibItem) map[string]any {
		return referenciaVista(b.raw.(store.Referencia))
	})
}

func (s *Server) createReferencia(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.BibliotecaCrear, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	var body referenciaBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	if strings.TrimSpace(body.Titulo) == "" {
		writeError(w, http.StatusBadRequest, "el título es obligatorio")
		return
	}
	if strings.TrimSpace(body.Link) == "" {
		writeError(w, http.StatusBadRequest, "el link es obligatorio")
		return
	}
	plat := strings.TrimSpace(body.Plataforma)
	if plat == "" {
		plat = biblioteca.PlatOtra
	}
	if !biblioteca.PlataformaValida(plat) {
		writeError(w, http.StatusBadRequest, "plataforma inválida (Instagram, TikTok, YouTube u otra)")
		return
	}
	clienteID := strings.TrimSpace(body.ClienteID)
	if clienteID != "" {
		if _, existe, err := s.st.GetCliente(clienteID); err != nil {
			errorDatos(w, err)
			return
		} else if !existe {
			writeError(w, http.StatusBadRequest, "el cliente relacionado no existe")
			return
		}
	}
	estado := biblioteca.EstadoBorrador
	publicadoPor := ""
	if esAdmin(actor) {
		estado = biblioteca.EstadoPublicado
		publicadoPor = actor.ID
		if e := strings.TrimSpace(body.Estado); e == biblioteca.EstadoBorrador {
			estado = biblioteca.EstadoBorrador
			publicadoPor = ""
		} else if e != "" && e != biblioteca.EstadoPublicado {
			writeError(w, http.StatusBadRequest, "estado inválido (borrador o publicado)")
			return
		}
	}
	x, err := s.st.CreateReferencia(store.Referencia{
		Titulo: strings.TrimSpace(body.Titulo), Link: strings.TrimSpace(body.Link),
		Plataforma: plat, Analisis: body.Analisis,
		Etiquetas: limpias(body.Etiquetas), ClienteID: clienteID,
		Estado: estado, PropuestoPor: actor.ID, PublicadoPor: publicadoPor,
		CreatedBy: actor.ID,
	})
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "crear_referencia", x.ID, nil,
		map[string]any{"titulo": x.Titulo, "estado": x.Estado}, "")
	writeJSON(w, http.StatusCreated, referenciaVista(x))
}

func (s *Server) getReferencia(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(u, permisos.BibliotecaLeer, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	x, existe, err := s.st.GetReferencia(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	b, ok := s.getBib(w, u, bibDeReferencia(x), existe, "referencia")
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, s.conNombreProponente(referenciaVista(b.raw.(store.Referencia)), b.propuestoPor))
}

func (s *Server) patchReferencia(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.BibliotecaCrear, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	x, existe, err := s.st.GetReferencia(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	b, ok := s.getBib(w, actor, bibDeReferencia(x), existe, "referencia")
	if !ok {
		return
	}
	_ = b
	if msg, ok := puedeEditarBib(actor, bibDeReferencia(x)); !ok {
		codigo := http.StatusForbidden
		if strings.HasPrefix(msg, "archivado") {
			codigo = http.StatusBadRequest
		}
		writeError(w, codigo, msg)
		return
	}
	var body referenciaBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	cambios := map[string]any{}
	if body.Titulo != "" && body.Titulo != x.Titulo {
		cambios["titulo"] = strings.TrimSpace(body.Titulo)
	}
	if body.Link != "" && body.Link != x.Link {
		cambios["link"] = strings.TrimSpace(body.Link)
	}
	if body.Plataforma != "" && body.Plataforma != x.Plataforma {
		if !biblioteca.PlataformaValida(strings.TrimSpace(body.Plataforma)) {
			writeError(w, http.StatusBadRequest, "plataforma inválida (Instagram, TikTok, YouTube u otra)")
			return
		}
		cambios["plataforma"] = strings.TrimSpace(body.Plataforma)
	}
	if body.Analisis != x.Analisis && (body.Analisis != "" || x.Analisis != "") {
		cambios["analisis"] = body.Analisis
	}
	if body.ClienteID != x.ClienteID && (body.ClienteID != "" || x.ClienteID != "") {
		cid := strings.TrimSpace(body.ClienteID)
		if cid != "" {
			if _, existe, err := s.st.GetCliente(cid); err != nil {
				errorDatos(w, err)
				return
			} else if !existe {
				writeError(w, http.StatusBadRequest, "el cliente relacionado no existe")
				return
			}
		}
		cambios["cliente_id"] = cid
	}
	if body.Etiquetas != nil {
		cambios["etiquetas"] = limpias(body.Etiquetas)
	}
	if x.Estado == biblioteca.EstadoRechazado && len(cambios) > 0 {
		cambios["estado"] = biblioteca.EstadoBorrador
		cambios["motivo_rechazo"] = ""
	}
	if len(cambios) == 0 {
		writeJSON(w, http.StatusOK, referenciaVista(x))
		return
	}
	antes := map[string]any{"titulo": x.Titulo, "estado": x.Estado}
	act, err := s.st.UpdateReferencia(x.ID, cambios)
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "editar_referencia", x.ID,
		antes, map[string]any{"titulo": act.Titulo, "estado": act.Estado}, "")
	writeJSON(w, http.StatusOK, referenciaVista(act))
}

func (s *Server) publicarReferencia(w http.ResponseWriter, r *http.Request) {
	x, existe, err := s.st.GetReferencia(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.moverBib(w, r, bibDeReferencia(x), existe, "referencia", "publicar",
		biblioteca.EstadoPublicado, "", func(id string, cambios map[string]any) (bibItem, error) {
			act, err := s.st.UpdateReferencia(id, cambios)
			return bibDeReferencia(act), err
		})
}

func (s *Server) rechazarReferencia(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Motivo string `json:"motivo"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	if strings.TrimSpace(body.Motivo) == "" {
		writeError(w, http.StatusBadRequest, "el motivo del rechazo es obligatorio")
		return
	}
	x, existe, err := s.st.GetReferencia(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.moverBib(w, r, bibDeReferencia(x), existe, "referencia", "rechazar",
		biblioteca.EstadoRechazado, strings.TrimSpace(body.Motivo), func(id string, cambios map[string]any) (bibItem, error) {
			act, err := s.st.UpdateReferencia(id, cambios)
			return bibDeReferencia(act), err
		})
}

func (s *Server) archivarReferencia(w http.ResponseWriter, r *http.Request) {
	x, existe, err := s.st.GetReferencia(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.moverBib(w, r, bibDeReferencia(x), existe, "referencia", "archivar",
		biblioteca.EstadoArchivado, "", func(id string, cambios map[string]any) (bibItem, error) {
			act, err := s.st.UpdateReferencia(id, cambios)
			return bibDeReferencia(act), err
		})
}

// --- /sops ---

type sopPasoBody struct {
	Titulo      string `json:"titulo"`
	Descripcion string `json:"descripcion"`
}

type sopBody struct {
	Titulo             string        `json:"titulo"`
	Oficio             string        `json:"oficio"`
	TiempoEstimadoMin  *int          `json:"tiempo_estimado_min"`
	Etiquetas          []string      `json:"etiquetas"`
	Pasos              []sopPasoBody `json:"pasos"`
	Estado             string        `json:"estado"`
}

func (s *Server) listSOPs(w http.ResponseWriter, r *http.Request) {
	sops, err := s.st.ListSOPs()
	if err != nil {
		if _, ok := s.usuarioActual(w, r); !ok {
			return
		}
		errorDatos(w, err)
		return
	}
	fOficio := r.URL.Query().Get("oficio")
	items := make([]bibItem, 0, len(sops))
	for _, p := range sops {
		if fOficio != "" && p.Oficio != fOficio && p.Oficio != biblioteca.OficioTodos {
			continue
		}
		items = append(items, bibDeSOP(p))
	}
	s.listBib(w, r, items, "sops", func(b bibItem) map[string]any {
		return sopVista(b.raw.(store.SOP))
	})
}

// normalizaOficioSOP acepta formas con tilde ("edición", "estrategia/guion")
// y las traduce al canónico; "todos" se acepta tal cual.
func normalizaOficioSOP(in string) (string, bool) {
	t := strings.TrimSpace(in)
	if t == "" {
		return biblioteca.OficioTodos, true
	}
	if t == biblioteca.OficioTodos {
		return t, true
	}
	if n, ok := permisos.NormalizarOficio(t); ok {
		if biblioteca.OficioSOPValido(n) {
			return n, true
		}
		return "", false
	}
	if biblioteca.OficioSOPValido(t) {
		return t, true
	}
	return "", false
}

func (s *Server) createSOP(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.BibliotecaCrear, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	var body sopBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	if strings.TrimSpace(body.Titulo) == "" {
		writeError(w, http.StatusBadRequest, "el título es obligatorio")
		return
	}
	oficio, okOf := normalizaOficioSOP(body.Oficio)
	if !okOf {
		writeError(w, http.StatusBadRequest, "oficio inválido (grabacion, edicion, diseno, estrategia, publicacion, ventas o todos)")
		return
	}
	if body.TiempoEstimadoMin != nil && *body.TiempoEstimadoMin < 0 {
		writeError(w, http.StatusBadRequest, "el tiempo estimado no puede ser negativo")
		return
	}
	for _, p := range body.Pasos {
		if strings.TrimSpace(p.Titulo) == "" {
			writeError(w, http.StatusBadRequest, "cada paso necesita un título")
			return
		}
	}
	estado := biblioteca.EstadoBorrador
	publicadoPor := ""
	if esAdmin(actor) {
		estado = biblioteca.EstadoPublicado
		publicadoPor = actor.ID
		if e := strings.TrimSpace(body.Estado); e == biblioteca.EstadoBorrador {
			estado = biblioteca.EstadoBorrador
			publicadoPor = ""
		} else if e != "" && e != biblioteca.EstadoPublicado {
			writeError(w, http.StatusBadRequest, "estado inválido (borrador o publicado)")
			return
		}
	}
	p, err := s.st.CreateSOP(store.SOP{
		Titulo: strings.TrimSpace(body.Titulo), Oficio: oficio,
		TiempoEstimadoMin: body.TiempoEstimadoMin,
		Etiquetas:        limpias(body.Etiquetas),
		Estado:           estado, PropuestoPor: actor.ID, PublicadoPor: publicadoPor,
		CreatedBy: actor.ID,
	})
	if err != nil {
		errorDatos(w, err)
		return
	}
	pasos := []map[string]any{}
	for _, pb := range body.Pasos {
		creado, err := s.st.CreateSOPPaso(store.SOPPaso{
			SOPID: p.ID, Titulo: strings.TrimSpace(pb.Titulo),
			Descripcion: pb.Descripcion,
		})
		if err != nil {
			errorDatos(w, err)
			return
		}
		pasos = append(pasos, sopPasoVista(creado))
	}
	_, _ = actividad.Registrar(s.st, actor, "crear_sop", p.ID, nil,
		map[string]any{"titulo": p.Titulo, "estado": p.Estado}, "")
	writeJSON(w, http.StatusCreated, map[string]any{"sop": sopVista(p), "pasos": pasos})
}

func (s *Server) getSOP(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(u, permisos.BibliotecaLeer, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	p, existe, err := s.st.GetSOP(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	b, ok := s.getBib(w, u, bibDeSOP(p), existe, "sop")
	if !ok {
		return
	}
	pasos, err := s.st.ListSOPPasos(p.ID)
	if err != nil {
		errorDatos(w, err)
		return
	}
	vp := []map[string]any{}
	for _, ps := range pasos {
		vp = append(vp, sopPasoVista(ps))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"sop":   s.conNombreProponente(sopVista(b.raw.(store.SOP)), b.propuestoPor),
		"pasos": vp,
	})
}

func (s *Server) patchSOP(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.BibliotecaCrear, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	p, existe, err := s.st.GetSOP(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	b, ok := s.getBib(w, actor, bibDeSOP(p), existe, "sop")
	if !ok {
		return
	}
	_ = b
	if msg, ok := puedeEditarBib(actor, bibDeSOP(p)); !ok {
		codigo := http.StatusForbidden
		if strings.HasPrefix(msg, "archivado") {
			codigo = http.StatusBadRequest
		}
		writeError(w, codigo, msg)
		return
	}
	var body sopBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	cambios := map[string]any{}
	if body.Titulo != "" && body.Titulo != p.Titulo {
		cambios["titulo"] = strings.TrimSpace(body.Titulo)
	}
	if body.Oficio != "" {
		oficio, okOf := normalizaOficioSOP(body.Oficio)
		if !okOf {
			writeError(w, http.StatusBadRequest, "oficio inválido (grabacion, edicion, diseno, estrategia, publicacion, ventas o todos)")
			return
		}
		if oficio != p.Oficio {
			cambios["oficio"] = oficio
		}
	}
	if body.TiempoEstimadoMin != nil {
		if *body.TiempoEstimadoMin < 0 {
			writeError(w, http.StatusBadRequest, "el tiempo estimado no puede ser negativo")
			return
		}
		cambios["tiempo_estimado_min"] = *body.TiempoEstimadoMin
	}
	if body.Etiquetas != nil {
		cambios["etiquetas"] = limpias(body.Etiquetas)
	}
	if p.Estado == biblioteca.EstadoRechazado && len(cambios) > 0 {
		cambios["estado"] = biblioteca.EstadoBorrador
		cambios["motivo_rechazo"] = ""
	}
	if len(cambios) == 0 {
		writeJSON(w, http.StatusOK, sopVista(p))
		return
	}
	antes := map[string]any{"titulo": p.Titulo, "estado": p.Estado}
	act, err := s.st.UpdateSOP(p.ID, cambios)
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "editar_sop", p.ID,
		antes, map[string]any{"titulo": act.Titulo, "estado": act.Estado}, "")
	writeJSON(w, http.StatusOK, sopVista(act))
}

func (s *Server) publicarSOP(w http.ResponseWriter, r *http.Request) {
	p, existe, err := s.st.GetSOP(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.moverBib(w, r, bibDeSOP(p), existe, "sop", "publicar",
		biblioteca.EstadoPublicado, "", func(id string, cambios map[string]any) (bibItem, error) {
			act, err := s.st.UpdateSOP(id, cambios)
			return bibDeSOP(act), err
		})
}

func (s *Server) rechazarSOP(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Motivo string `json:"motivo"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	if strings.TrimSpace(body.Motivo) == "" {
		writeError(w, http.StatusBadRequest, "el motivo del rechazo es obligatorio")
		return
	}
	p, existe, err := s.st.GetSOP(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.moverBib(w, r, bibDeSOP(p), existe, "sop", "rechazar",
		biblioteca.EstadoRechazado, strings.TrimSpace(body.Motivo), func(id string, cambios map[string]any) (bibItem, error) {
			act, err := s.st.UpdateSOP(id, cambios)
			return bibDeSOP(act), err
		})
}

func (s *Server) archivarSOP(w http.ResponseWriter, r *http.Request) {
	p, existe, err := s.st.GetSOP(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.moverBib(w, r, bibDeSOP(p), existe, "sop", "archivar",
		biblioteca.EstadoArchivado, "", func(id string, cambios map[string]any) (bibItem, error) {
			act, err := s.st.UpdateSOP(id, cambios)
			return bibDeSOP(act), err
		})
}

// --- pasos de SOP ---

// sopEditableParaPasos: los pasos solo se tocan en SOP borrador/rechazado
// (editar un publicado = archivar + crear nuevo, BRIEF F3 §1).
func (s *Server) sopParaPasos(w http.ResponseWriter, actor permisos.Usuario, sopID string) (store.SOP, bool) {
	p, existe, err := s.st.GetSOP(sopID)
	if err != nil {
		errorDatos(w, err)
		return store.SOP{}, false
	}
	if !existe {
		writeError(w, http.StatusNotFound, "sop no encontrado")
		return store.SOP{}, false
	}
	if b := bibDeSOP(p); !b.visiblePara(actor) {
		writeError(w, http.StatusNotFound, "sop no encontrado")
		return store.SOP{}, false
	}
	if p.Estado == biblioteca.EstadoPublicado || p.Estado == biblioteca.EstadoArchivado {
		writeError(w, http.StatusBadRequest, "los pasos de un SOP publicado no se editan (archivá y creá uno nuevo)")
		return store.SOP{}, false
	}
	if msg, ok := puedeEditarBib(actor, bibDeSOP(p)); !ok {
		codigo := http.StatusForbidden
		if strings.HasPrefix(msg, "archivado") {
			codigo = http.StatusBadRequest
		}
		writeError(w, codigo, msg)
		return store.SOP{}, false
	}
	return p, true
}

func (s *Server) listSOPPasos(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(u, permisos.BibliotecaLeer, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	p, existe, err := s.st.GetSOP(r.PathValue("id"))
	if err != nil {
		errorDatos(w, err)
		return
	}
	b, ok := s.getBib(w, u, bibDeSOP(p), existe, "sop")
	if !ok {
		return
	}
	_ = b
	pasos, err := s.st.ListSOPPasos(p.ID)
	if err != nil {
		errorDatos(w, err)
		return
	}
	vp := []map[string]any{}
	for _, ps := range pasos {
		vp = append(vp, sopPasoVista(ps))
	}
	writeJSON(w, http.StatusOK, map[string]any{"pasos": vp})
}

func (s *Server) createSOPPaso(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.BibliotecaCrear, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	p, ok := s.sopParaPasos(w, actor, r.PathValue("id"))
	if !ok {
		return
	}
	var body sopPasoBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	if strings.TrimSpace(body.Titulo) == "" {
		writeError(w, http.StatusBadRequest, "el título del paso es obligatorio")
		return
	}
	creado, err := s.st.CreateSOPPaso(store.SOPPaso{
		SOPID: p.ID, Titulo: strings.TrimSpace(body.Titulo),
		Descripcion: body.Descripcion,
	})
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "crear_sop_paso", creado.ID,
		nil, map[string]any{"sop_id": p.ID, "titulo": creado.Titulo}, "")
	writeJSON(w, http.StatusCreated, sopPasoVista(creado))
}

func (s *Server) patchSOPPaso(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.BibliotecaCrear, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	// Buscar el paso: recorrer los SOPs visibles (tabla chica en F3).
	sops, err := s.st.ListSOPs()
	if err != nil {
		errorDatos(w, err)
		return
	}
	var dueño store.SOP
	var paso store.SOPPaso
	hallado := false
	for _, p := range sops {
		if !bibDeSOP(p).visiblePara(actor) {
			continue
		}
		pasos, err := s.st.ListSOPPasos(p.ID)
		if err != nil {
			errorDatos(w, err)
			return
		}
		for _, ps := range pasos {
			if ps.ID == r.PathValue("id") {
				dueño, paso, hallado = p, ps, true
				break
			}
		}
		if hallado {
			break
		}
	}
	if !hallado {
		writeError(w, http.StatusNotFound, "paso no encontrado")
		return
	}
	if _, ok := s.sopParaPasos(w, actor, dueño.ID); !ok {
		return
	}
	var body sopPasoBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	cambios := map[string]any{}
	if body.Titulo != "" && body.Titulo != paso.Titulo {
		cambios["titulo"] = strings.TrimSpace(body.Titulo)
	}
	if body.Descripcion != paso.Descripcion && (body.Descripcion != "" || paso.Descripcion != "") {
		cambios["descripcion"] = body.Descripcion
	}
	if len(cambios) == 0 {
		writeJSON(w, http.StatusOK, sopPasoVista(paso))
		return
	}
	act, err := s.st.UpdateSOPPaso(paso.ID, cambios)
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "editar_sop_paso", paso.ID,
		map[string]any{"titulo": paso.Titulo}, map[string]any{"titulo": act.Titulo}, "")
	writeJSON(w, http.StatusOK, sopPasoVista(act))
}

// --- ejecuciones de SOP ---

func ejecucionVista(e store.SOPEjecucion, nombreSOP, nombreQuien string) map[string]any {
	return map[string]any{
		"id": e.ID, "sop_id": e.SOPID, "sop_titulo": nombreSOP,
		"tarea_id": e.TareaID, "iniciado_por": e.IniciadoPor,
		"iniciado_por_nombre": nombreQuien, "estado": e.Estado,
		"iniciada_at": e.IniciadaAt, "terminada_at": e.TerminadaAt,
		"pasos_marcados": e.Pasos,
		"created_at": e.CreatedAt, "updated_at": e.UpdatedAt,
	}
}

func (s *Server) nombresEjecucion() (map[string]string, map[string]string) {
	nSOP := map[string]string{}
	if sops, err := s.st.ListSOPs(); err == nil {
		for _, p := range sops {
			nSOP[p.ID] = p.Titulo
		}
	}
	nUs := map[string]string{}
	if us, err := s.st.ListUsuarios(); err == nil {
		for _, u := range us {
			nUs[u.ID] = u.Nombre
		}
	}
	return nSOP, nUs
}

func (s *Server) listSOPEjecuciones(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(u, permisos.EjecutarSOP, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	q := r.URL.Query()
	fSOP, fTarea, fMias := q.Get("sop_id"), q.Get("tarea_id"), q.Get("mias") == "1"
	ejecs, err := s.st.ListSOPEjecuciones()
	if err != nil {
		errorDatos(w, err)
		return
	}
	nSOP, nUs := s.nombresEjecucion()
	vista := []map[string]any{}
	for _, e := range ejecs {
		// Equipo: solo las suyas; admin/dueño: todas (ANALISIS §6).
		if !esAdmin(u) && e.IniciadoPor != u.ID {
			continue
		}
		if fMias && e.IniciadoPor != u.ID {
			continue
		}
		if fSOP != "" && e.SOPID != fSOP {
			continue
		}
		if fTarea != "" && e.TareaID != fTarea {
			continue
		}
		vista = append(vista, ejecucionVista(e, nSOP[e.SOPID], nUs[e.IniciadoPor]))
	}
	writeJSON(w, http.StatusOK, map[string]any{"ejecuciones": vista})
}

type ejecucionBody struct {
	SOPID   string `json:"sop_id"`
	TareaID string `json:"tarea_id"`
}

func (s *Server) createSOPEjecucion(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.EjecutarSOP, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	var body ejecucionBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	sopID := strings.TrimSpace(body.SOPID)
	if sopID == "" {
		writeError(w, http.StatusBadRequest, "el sop es obligatorio")
		return
	}
	p, existe, err := s.st.GetSOP(sopID)
	if err != nil {
		errorDatos(w, err)
		return
	}
	if !existe {
		writeError(w, http.StatusNotFound, "sop no encontrado")
		return
	}
	if b := bibDeSOP(p); !b.visiblePara(actor) || p.Estado != biblioteca.EstadoPublicado {
		writeError(w, http.StatusUnprocessableEntity, "el SOP no está publicado")
		return
	}
	tareaID := strings.TrimSpace(body.TareaID)
	if tareaID != "" {
		t, existe, err := s.st.GetTarea(tareaID)
		if err != nil {
			errorDatos(w, err)
			return
		}
		if !existe {
			writeError(w, http.StatusNotFound, "tarea no encontrada")
			return
		}
		// Equipo: solo puede ligar sus propias tareas.
		if !esAdmin(actor) && t.AsignadoID != actor.ID {
			writeError(w, http.StatusForbidden, "no autorizado")
			return
		}
	}
	e, err := s.st.CreateSOPEjecucion(store.SOPEjecucion{
		SOPID: sopID, TareaID: tareaID, IniciadoPor: actor.ID,
		Estado: biblioteca.EjecEnCurso,
	})
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "iniciar_sop", e.ID,
		nil, map[string]any{"sop_id": sopID, "tarea_id": tareaID}, "")
	nSOP, nUs := s.nombresEjecucion()
	writeJSON(w, http.StatusCreated, ejecucionVista(e, nSOP[e.SOPID], nUs[e.IniciadoPor]))
}

// conEjecucion trae la ejecución o responde 404/502/403 (ajena → 404 para
// equipo, igual que borradores ajenos).
func (s *Server) conEjecucion(w http.ResponseWriter, u permisos.Usuario, id string) (store.SOPEjecucion, bool) {
	e, existe, err := s.st.GetSOPEjecucion(id)
	if err != nil {
		errorDatos(w, err)
		return store.SOPEjecucion{}, false
	}
	if !existe {
		writeError(w, http.StatusNotFound, "ejecución no encontrada")
		return store.SOPEjecucion{}, false
	}
	if !esAdmin(u) && e.IniciadoPor != u.ID {
		writeError(w, http.StatusNotFound, "ejecución no encontrada")
		return store.SOPEjecucion{}, false
	}
	return e, true
}

func (s *Server) getSOPEjecucion(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(u, permisos.EjecutarSOP, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	e, ok := s.conEjecucion(w, u, r.PathValue("id"))
	if !ok {
		return
	}
	nSOP, nUs := s.nombresEjecucion()
	writeJSON(w, http.StatusOK, ejecucionVista(e, nSOP[e.SOPID], nUs[e.IniciadoPor]))
}

func (s *Server) marcarEjecucionPaso(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.EjecutarSOP, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	e, ok := s.conEjecucion(w, actor, r.PathValue("id"))
	if !ok {
		return
	}
	// Solo el dueño de la ejecución (o admin) marca pasos.
	if !esAdmin(actor) && e.IniciadoPor != actor.ID {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	if e.Estado == biblioteca.EjecTerminada {
		writeError(w, http.StatusBadRequest, "la ejecución ya terminó")
		return
	}
	var body struct {
		PasoID string `json:"paso_id"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	pasoID := strings.TrimSpace(body.PasoID)
	if pasoID == "" {
		writeError(w, http.StatusBadRequest, "el paso es obligatorio")
		return
	}
	pasos, err := s.st.ListSOPPasos(e.SOPID)
	if err != nil {
		errorDatos(w, err)
		return
	}
	esDelSOP := false
	for _, p := range pasos {
		if p.ID == pasoID {
			esDelSOP = true
			break
		}
	}
	if !esDelSOP {
		writeError(w, http.StatusBadRequest, "ese paso no es de este SOP")
		return
	}
	if _, err := s.st.MarcarPaso(e.ID, pasoID); err != nil {
		errorDatos(w, err)
		return
	}
	act, _, err := s.st.GetSOPEjecucion(e.ID)
	if err != nil {
		errorDatos(w, err)
		return
	}
	nSOP, nUs := s.nombresEjecucion()
	writeJSON(w, http.StatusOK, ejecucionVista(act, nSOP[act.SOPID], nUs[act.IniciadoPor]))
}

func (s *Server) desmarcarEjecucionPaso(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.EjecutarSOP, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	e, ok := s.conEjecucion(w, actor, r.PathValue("id"))
	if !ok {
		return
	}
	if !esAdmin(actor) && e.IniciadoPor != actor.ID {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	if e.Estado == biblioteca.EjecTerminada {
		writeError(w, http.StatusBadRequest, "la ejecución ya terminó")
		return
	}
	if err := s.st.DesmarcarPaso(e.ID, strings.TrimSpace(r.PathValue("paso_id"))); err != nil {
		errorDatos(w, err)
		return
	}
	act, _, err := s.st.GetSOPEjecucion(e.ID)
	if err != nil {
		errorDatos(w, err)
		return
	}
	nSOP, nUs := s.nombresEjecucion()
	writeJSON(w, http.StatusOK, ejecucionVista(act, nSOP[act.SOPID], nUs[act.IniciadoPor]))
}

func (s *Server) terminarEjecucion(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.EjecutarSOP, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	e, ok := s.conEjecucion(w, actor, r.PathValue("id"))
	if !ok {
		return
	}
	if !esAdmin(actor) && e.IniciadoPor != actor.ID {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	if e.Estado == biblioteca.EjecTerminada {
		nSOP, nUs := s.nombresEjecucion()
		writeJSON(w, http.StatusOK, ejecucionVista(e, nSOP[e.SOPID], nUs[e.IniciadoPor]))
		return
	}
	ahora := store.Ahora()
	act, err := s.st.UpdateSOPEjecucion(e.ID, map[string]any{
		"estado": biblioteca.EjecTerminada, "terminada_at": ahora,
	})
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "terminar_sop", e.ID,
		map[string]any{"estado": e.Estado},
		map[string]any{"estado": act.Estado, "pasos_marcados": act.Pasos}, "")
	nSOP, nUs := s.nombresEjecucion()
	writeJSON(w, http.StatusOK, ejecucionVista(act, nSOP[act.SOPID], nUs[act.IniciadoPor]))
}
