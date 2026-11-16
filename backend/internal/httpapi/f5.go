package httpapi

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"rconceptsys/backend/internal/store"
)

// ==========================================================
// F5: handlers de equipo, adjuntos del chat, asignaciones,
// Drive, piezas, cortes de pago y avisos push.
// ==========================================================

func leerJSONCuerpo(r *http.Request, maxBytes int64, destino any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, maxBytes)
	return json.NewDecoder(r.Body).Decode(destino)
}

func (a *API) usuarioActual(r *http.Request) *store.Perfil {
	return UsuarioDesdeContexto(r.Context())
}

// ---------- Equipo (barra derecha) ----------

// GET /api/equipo/resumen
func (a *API) handleGetEquipoResumen(w http.ResponseWriter, r *http.Request) {
	cfg, err := a.Store.ObtenerConfigEquipo(r.Context())
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_equipo", "No se pudo cargar la información del equipo.")
		return
	}
	ResponderJSON(w, http.StatusOK, cfg)
}

// PATCH /api/admin/equipo
func (a *API) handleAdminPatchEquipo(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Nombre      *string `json:"nombre"`
		Descripcion *string `json:"descripcion"`
	}
	if err := leerJSONCuerpo(r, 1024*8, &req); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "Formato de datos inválido.")
		return
	}
	if req.Nombre == nil && req.Descripcion == nil {
		ResponderError(w, http.StatusBadRequest, "sin_cambios", "No enviaste ningún cambio para guardar.")
		return
	}
	cfg, err := a.Store.ActualizarConfigEquipo(r.Context(), req.Nombre, req.Descripcion)
	if err != nil {
		if err == store.ErrValidation || strings.Contains(err.Error(), "caracteres") {
			ResponderError(w, http.StatusBadRequest, "datos_invalidos", err.Error())
			return
		}
		ResponderError(w, http.StatusInternalServerError, "error_equipo", "No se pudo guardar la información del equipo.")
		return
	}
	ResponderJSON(w, http.StatusOK, cfg)
}

// POST /api/admin/equipo/enlaces
func (a *API) handleAdminPostEnlaceEquipo(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Nombre string `json:"nombre"`
		URL    string `json:"url"`
	}
	if err := leerJSONCuerpo(r, 1024*8, &req); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "Formato de datos inválido.")
		return
	}
	enlace, err := a.Store.CrearEnlaceEquipo(r.Context(), req.Nombre, req.URL)
	if err != nil {
		ResponderError(w, http.StatusBadRequest, "enlace_invalido", err.Error())
		return
	}
	ResponderJSON(w, http.StatusCreated, enlace)
}

// PATCH /api/admin/equipo/enlaces/{id}
func (a *API) handleAdminPatchEnlaceEquipo(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		ResponderError(w, http.StatusBadRequest, "id_invalido", "ID de enlace inválido.")
		return
	}
	var campos map[string]any
	if err := leerJSONCuerpo(r, 1024*8, &campos); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "Formato de datos inválido.")
		return
	}
	enlace, err := a.Store.ActualizarEnlaceEquipo(r.Context(), id, campos)
	if err == store.ErrNotFound {
		ResponderError(w, http.StatusNotFound, "enlace_no_encontrado", "El enlace no existe.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusBadRequest, "enlace_invalido", err.Error())
		return
	}
	ResponderJSON(w, http.StatusOK, enlace)
}

// DELETE /api/admin/equipo/enlaces/{id}
func (a *API) handleAdminDeleteEnlaceEquipo(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		ResponderError(w, http.StatusBadRequest, "id_invalido", "ID de enlace inválido.")
		return
	}
	if err := a.Store.EliminarEnlaceEquipo(r.Context(), id); err != nil {
		ResponderError(w, http.StatusNotFound, "enlace_no_encontrado", "El enlace no existe.")
		return
	}
	ResponderJSON(w, http.StatusOK, map[string]string{"mensaje": "Enlace eliminado."})
}

// ---------- Chat con adjuntos ----------

const maxAdjuntoChat = 20 * 1024 * 1024 // 20 MB por archivo

// tipoDeMime decide el tipo de adjunto a partir del MIME real del archivo.
func tipoDeMime(mime string) (string, bool) {
	switch {
	case strings.HasPrefix(mime, "image/"):
		return store.AdjuntoImagen, true
	case strings.HasPrefix(mime, "audio/"):
		return store.AdjuntoAudio, true
	case strings.HasPrefix(mime, "video/"):
		return store.AdjuntoVideo, true
	case mime == "application/pdf",
		mime == "application/zip",
		mime == "text/plain",
		mime == "text/csv",
		mime == "application/msword",
		mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		mime == "application/vnd.ms-excel",
		mime == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		mime == "application/vnd.oasis.opendocument.text",
		mime == "application/octet-stream":
		return store.AdjuntoArchivo, true
	}
	return "", false
}

// POST /api/chat/adjuntos (multipart: archivo, duracion_seg)
func (a *API) handlePostChatAdjunto(w http.ResponseWriter, r *http.Request) {
	yo := a.usuarioActual(r)
	if yo == nil {
		ResponderError(w, http.StatusUnauthorized, "no_autenticado", "No se encontró el perfil autenticado.")
		return
	}
	if !a.ChatLimiter.Permitir("adjunto:" + yo.ID) {
		ResponderError(w, http.StatusTooManyRequests, "limite_archivos", "Has subido muchos archivos seguidos. Espera un momento.")
		return
	}

	if err := r.ParseMultipartForm(maxAdjuntoChat + 1024*1024); err != nil {
		ResponderError(w, http.StatusBadRequest, "archivo_grande", "El archivo supera el límite de 20 MB. Para videos pesados usa una carpeta de Drive.")
		return
	}
	archivo, cabecera, err := r.FormFile("archivo")
	if err != nil {
		ResponderError(w, http.StatusBadRequest, "archivo_faltante", "Adjunta un archivo en el campo 'archivo'.")
		return
	}
	defer archivo.Close()

	if cabecera.Size > maxAdjuntoChat {
		ResponderError(w, http.StatusBadRequest, "archivo_grande", "El archivo supera el límite de 20 MB. Para videos pesados usa una carpeta de Drive.")
		return
	}

	cabecera512 := make([]byte, 512)
	n, err := archivo.Read(cabecera512)
	if err != nil && err != io.EOF {
		ResponderError(w, http.StatusBadRequest, "archivo_ilegible", "No se pudo leer el archivo.")
		return
	}
	mime := http.DetectContentType(cabecera512[:n])
	// Los navegadores no siempre detectan bien audios y documentos: se usa el tipo declarado como respaldo.
	declarado := cabecera.Header.Get("Content-Type")
	if strings.HasPrefix(declarado, "audio/") || strings.HasPrefix(declarado, "video/") {
		mime = declarado
	}

	tipo, ok := tipoDeMime(mime)
	if !ok {
		ResponderError(w, http.StatusBadRequest, "tipo_no_permitido", "Ese tipo de archivo no se puede adjuntar.")
		return
	}
	if tipo == store.AdjuntoVideo && cabecera.Size > maxAdjuntoChat {
		ResponderError(w, http.StatusBadRequest, "video_grande", "El video supera 20 MB. Súbelo a Drive y comparte la carpeta.")
		return
	}

	datos := make([]byte, 0, cabecera.Size)
	datos = append(datos, cabecera512[:n]...)
	resto, err := io.ReadAll(io.LimitReader(archivo, maxAdjuntoChat+1))
	if err != nil {
		ResponderError(w, http.StatusBadRequest, "error_lectura", "No se pudo leer el archivo completo.")
		return
	}
	datos = append(datos, resto...)
	if int64(len(datos)) > maxAdjuntoChat {
		ResponderError(w, http.StatusBadRequest, "archivo_grande", "El archivo supera el límite de 20 MB.")
		return
	}

	var duracion *int
	if s := strings.TrimSpace(r.FormValue("duracion_seg")); s != "" {
		if v, err := strconv.Atoi(s); err == nil && v >= 0 && v <= 3600 {
			duracion = &v
		}
	}

	adjunto, err := a.Store.GuardarAdjuntoChat(r.Context(), yo.ID, tipo, cabecera.Filename, mime, int64(len(datos)), duracion, datos)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_guardar", "No se pudo guardar el archivo.")
		return
	}
	ResponderJSON(w, http.StatusCreated, adjunto)
}

// GET /api/chat/adjuntos/{id}/archivo
func (a *API) handleGetChatAdjuntoArchivo(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		ResponderError(w, http.StatusBadRequest, "id_invalido", "ID de adjunto inválido.")
		return
	}
	adjunto, err := a.Store.ObtenerAdjuntoChat(r.Context(), id)
	if err == store.ErrNotFound {
		ResponderError(w, http.StatusNotFound, "adjunto_no_encontrado", "El archivo no existe.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_adjunto", "No se pudo consultar el archivo.")
		return
	}
	datos, err := a.Store.LeerArchivoAdjunto(r.Context(), id)
	if err != nil {
		ResponderError(w, http.StatusNotFound, "archivo_no_encontrado", "El archivo no está disponible.")
		return
	}

	mime := adjunto.Mime
	if mime == "" {
		mime = http.DetectContentType(datos)
	}
	disposicion := "attachment"
	if adjunto.Tipo == store.AdjuntoImagen || adjunto.Tipo == store.AdjuntoAudio || adjunto.Tipo == store.AdjuntoVideo {
		disposicion = "inline"
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Content-Disposition", fmt.Sprintf("%s; filename=%q", disposicion, adjunto.Nombre))
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(datos)
}

// ---------- Asignaciones (admin) ----------

// GET /api/admin/asignaciones?persona=&estado=&desde=&hasta=&limite=
func (a *API) handleAdminGetAsignaciones(w http.ResponseWriter, r *http.Request) {
	yo := a.usuarioActual(r)
	filtro := store.FiltroAsignaciones{VistasDe: yo.ID}
	if p := strings.TrimSpace(r.URL.Query().Get("persona")); p != "" {
		filtro.PersonaID = &p
	}
	if e := strings.TrimSpace(r.URL.Query().Get("estado")); e != "" && e != "todas" {
		if e == "vencida" {
			// Las vencidas se calculan en el cliente: se listan pendientes y rechazadas.
			pend := store.EstadoTareaPendiente
			filtro.Estado = &pend
		} else {
			st := store.EstadoTarea(normalizarEstadoTarea(e))
			filtro.Estado = &st
		}
	}
	if d := strings.TrimSpace(r.URL.Query().Get("desde")); d != "" {
		if t, err := time.ParseInLocation("2006-01-02", d, time.Local); err == nil {
			filtro.Desde = &t
		}
	}
	if h := strings.TrimSpace(r.URL.Query().Get("hasta")); h != "" {
		if t, err := time.ParseInLocation("2006-01-02", h, time.Local); err == nil {
			fin := t.Add(24*time.Hour - time.Second)
			filtro.Hasta = &fin
		}
	}
	if lim := strings.TrimSpace(r.URL.Query().Get("limite")); lim != "" {
		if v, err := strconv.Atoi(lim); err == nil && v > 0 && v <= 200 {
			filtro.Limite = v
		}
	}

	lista, err := a.Store.ListarAsignaciones(r.Context(), filtro)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_asignaciones", "No se pudieron cargar las asignaciones.")
		return
	}
	ResponderJSON(w, http.StatusOK, map[string]any{"asignaciones": lista})
}

// GET /api/admin/asignaciones/recientes
func (a *API) handleAdminGetAsignacionesRecientes(w http.ResponseWriter, r *http.Request) {
	yo := a.usuarioActual(r)
	lista, err := a.Store.ListarAsignaciones(r.Context(), store.FiltroAsignaciones{VistasDe: yo.ID, Limite: 6})
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_asignaciones", "No se pudieron cargar las asignaciones recientes.")
		return
	}
	nuevas := 0
	for _, a := range lista {
		if a.Novedad {
			nuevas++
		}
	}
	ResponderJSON(w, http.StatusOK, map[string]any{"asignaciones": lista, "nuevas": nuevas})
}

// POST /api/admin/asignaciones/vistas
func (a *API) handleAdminPostAsignacionesVistas(w http.ResponseWriter, r *http.Request) {
	yo := a.usuarioActual(r)
	var req struct {
		IDs []int64 `json:"ids"`
	}
	if err := leerJSONCuerpo(r, 1024*16, &req); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "Formato de datos inválido.")
		return
	}
	if err := a.Store.MarcarAsignacionesVistas(r.Context(), yo.ID, req.IDs); err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_vistas", "No se pudo marcar la novedad como vista.")
		return
	}
	ResponderJSON(w, http.StatusOK, map[string]string{"mensaje": "Novedad al día."})
}

// ---------- Piezas ----------

// GET /api/admin/piezas?cliente=&etapa=
func (a *API) handleAdminGetPiezas(w http.ResponseWriter, r *http.Request) {
	filtro := store.FiltroPiezas{}
	if c := strings.TrimSpace(r.URL.Query().Get("cliente")); c != "" {
		if v, err := strconv.Atoi(c); err == nil && v > 0 {
			filtro.ClienteID = &v
		}
	}
	if e := strings.TrimSpace(r.URL.Query().Get("etapa")); e != "" {
		if etapa, ok := store.EtapaPiezaValida(e); ok {
			filtro.Etapa = &etapa
		}
	}
	lista, err := a.Store.ListarPiezas(r.Context(), filtro)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_piezas", "No se pudieron cargar las piezas.")
		return
	}
	ResponderJSON(w, http.StatusOK, lista)
}

// POST /api/admin/piezas
func (a *API) handleAdminPostPieza(w http.ResponseWriter, r *http.Request) {
	yo := a.usuarioActual(r)
	var req struct {
		ClienteID *int   `json:"cliente_id"`
		Nombre    string `json:"nombre"`
		Formato   string `json:"formato"`
		Etapa     string `json:"etapa"`
	}
	if err := leerJSONCuerpo(r, 1024*16, &req); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "Formato de datos inválido.")
		return
	}
	pieza, err := a.Store.CrearPieza(r.Context(), &store.Pieza{
		ClienteID: req.ClienteID,
		Nombre:    req.Nombre,
		Formato:   req.Formato,
		Etapa:     req.Etapa,
		CreadoPor: yo.ID,
	})
	if err != nil {
		ResponderError(w, http.StatusBadRequest, "pieza_invalida", err.Error())
		return
	}
	ResponderJSON(w, http.StatusCreated, pieza)
}

// PATCH /api/admin/piezas/{id}
func (a *API) handleAdminPatchPieza(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		ResponderError(w, http.StatusBadRequest, "id_invalido", "ID de pieza inválido.")
		return
	}
	var campos map[string]any
	if err := leerJSONCuerpo(r, 1024*16, &campos); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "Formato de datos inválido.")
		return
	}
	pieza, err := a.Store.ActualizarPieza(r.Context(), id, campos)
	if err == store.ErrNotFound {
		ResponderError(w, http.StatusNotFound, "pieza_no_encontrada", "La pieza no existe.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusBadRequest, "pieza_invalida", err.Error())
		return
	}
	ResponderJSON(w, http.StatusOK, pieza)
}

// ---------- Cortes de pago ----------

// GET /api/admin/cortes
func (a *API) handleAdminGetCortes(w http.ResponseWriter, r *http.Request) {
	lista, err := a.Store.ListarCortes(r.Context())
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_cortes", "No se pudieron cargar los cortes.")
		return
	}
	ResponderJSON(w, http.StatusOK, lista)
}

// POST /api/admin/cortes {periodo}
func (a *API) handleAdminPostCorte(w http.ResponseWriter, r *http.Request) {
	yo := a.usuarioActual(r)
	var req struct {
		Periodo string `json:"periodo"`
		Desde   string `json:"desde"`
		Hasta   string `json:"hasta"`
	}
	if err := leerJSONCuerpo(r, 1024*8, &req); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "Formato de datos inválido.")
		return
	}

	periodo := strings.ToLower(strings.TrimSpace(req.Periodo))
	desde, hasta := req.Desde, req.Hasta
	if periodo != "" {
		d, h, ok := store.PeriodoCorte(periodo, time.Now())
		if !ok {
			ResponderError(w, http.StatusBadRequest, "periodo_invalido", "El periodo debe ser 'quincena' o 'mes'.")
			return
		}
		desde, hasta = d, h
	}
	if desde == "" || hasta == "" {
		ResponderError(w, http.StatusBadRequest, "fechas_requeridas", "Indica el periodo o las fechas del corte.")
		return
	}

	corte, err := a.Store.CrearCorte(r.Context(), periodo, desde, hasta, yo.ID)
	if err != nil {
		if err == store.ErrConflict || strings.Contains(err.Error(), "ya existe") {
			ResponderError(w, http.StatusConflict, "corte_duplicado", "Ya existe un corte con ese mismo periodo.")
			return
		}
		ResponderError(w, http.StatusBadRequest, "corte_invalido", err.Error())
		return
	}
	ResponderJSON(w, http.StatusCreated, corte)
}

// GET /api/admin/cortes/{id}
func (a *API) handleAdminGetCorte(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		ResponderError(w, http.StatusBadRequest, "id_invalido", "ID de corte inválido.")
		return
	}
	corte, err := a.Store.ObtenerCorte(r.Context(), id)
	if err == store.ErrNotFound {
		ResponderError(w, http.StatusNotFound, "corte_no_encontrado", "El corte no existe.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_corte", "No se pudo cargar el corte.")
		return
	}
	ResponderJSON(w, http.StatusOK, corte)
}

// POST /api/admin/cortes/{id}/lineas/{perfil}/pagar
func (a *API) handleAdminPostCortePagar(w http.ResponseWriter, r *http.Request) {
	yo := a.usuarioActual(r)
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		ResponderError(w, http.StatusBadRequest, "id_invalido", "ID de corte inválido.")
		return
	}
	perfilID := strings.TrimSpace(r.PathValue("perfil"))
	if perfilID == "" {
		ResponderError(w, http.StatusBadRequest, "perfil_requerido", "Falta la persona del corte.")
		return
	}
	corte, err := a.Store.MarcarLineaCortePagada(r.Context(), id, perfilID, yo.ID)
	if err == store.ErrNotFound {
		ResponderError(w, http.StatusNotFound, "linea_no_encontrada", "No hay una línea de esa persona en el corte.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_pagar", "No se pudo marcar como pagado.")
		return
	}
	ResponderJSON(w, http.StatusOK, corte)
}

// GET /api/admin/cortes/{id}/csv
func (a *API) handleAdminGetCorteCSV(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		ResponderError(w, http.StatusBadRequest, "id_invalido", "ID de corte inválido.")
		return
	}
	corte, err := a.Store.ObtenerCorte(r.Context(), id)
	if err != nil {
		ResponderError(w, http.StatusNotFound, "corte_no_encontrado", "El corte no existe.")
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", nombreArchivoCorte(corte, "csv")))
	w.Header().Set("Cache-Control", "private, no-store")
	_, _ = w.Write([]byte(CSVCorte(corte)))
}

// GET /api/admin/cortes/{id}/pdf
func (a *API) handleAdminGetCortePDF(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		ResponderError(w, http.StatusBadRequest, "id_invalido", "ID de corte inválido.")
		return
	}
	corte, err := a.Store.ObtenerCorte(r.Context(), id)
	if err != nil {
		ResponderError(w, http.StatusNotFound, "corte_no_encontrado", "El corte no existe.")
		return
	}
	pdf := PDFCorte(corte)
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", nombreArchivoCorte(corte, "pdf")))
	w.Header().Set("Cache-Control", "private, no-store")
	_, _ = w.Write(pdf)
}
