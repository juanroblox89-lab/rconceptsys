package httpapi

import (
	"bytes"
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"rconceptsys/backend/internal/store"
)

const vidaMedioAdjunto = 300
const vidaDescargaAdjunto = 90

var uuidAdjunto = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
var turnoFinalizarAdjunto = make(chan struct{}, 2)

func (a *API) tareaParaAdjuntos(w http.ResponseWriter, r *http.Request, editar bool) *store.Tarea {
	w.Header().Set("Cache-Control", "private, no-store")
	id, e := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if e != nil || id <= 0 {
		ResponderError(w, 400, "id_invalido", "No encontramos ese trabajo.")
		return nil
	}
	t, e := a.Store.ObtenerTareaPorID(r.Context(), id)
	if errors.Is(e, store.ErrNotFound) {
		ResponderError(w, 404, "tarea_no_encontrada", "No encontramos ese trabajo.")
		return nil
	}
	if e != nil {
		errorAdjunto(w)
		return nil
	}
	p := UsuarioDesdeContexto(r.Context())
	if !p.EsAdmin && t.AsignadoA != p.ID {
		ResponderError(w, 403, "tarea_ajena", "No tienes acceso a ese trabajo.")
		return nil
	}
	if editar && t.Estado != "pendiente" && t.Estado != "rechazada" {
		ResponderError(w, 409, "tarea_cerrada", "Ya no se puede editar este trabajo.")
		return nil
	}
	return t
}

func (a *API) handleDetalleAsignacion(w http.ResponseWriter, r *http.Request) {
	if t := a.tareaParaAdjuntos(w, r, false); t != nil {
		copia := *t
		if hist, err := a.Store.ObtenerHistorialTarea(r.Context(), t.ID); err == nil {
			copia.Historial = hist
		}
		if !UsuarioDesdeContexto(r.Context()).EsAdmin {
			if t.Asignado != nil {
				perfil := *t.Asignado
				perfil.Correo = ""
				copia.Asignado = &perfil
			}
			if t.Creador != nil {
				perfil := *t.Creador
				perfil.Correo = ""
				copia.Creador = &perfil
			}
			if t.Cliente != nil {
				cliente := *t.Cliente
				cliente.Notas = nil
				cliente.Paquete = nil
				copia.Cliente = &cliente
			}
		}
		a.enriquecerTareasReferencias(r.Context(), []*store.Tarea{&copia})
		ResponderJSON(w, 200, &copia)
	}
}

type vistaAdjunto struct {
	ID            string   `json:"id"`
	Tipo          string   `json:"tipo"`
	Nombre        string   `json:"nombre"`
	Tamano        int      `json:"tamano"`
	Mime          string   `json:"mime"`
	DuracionMS    *int     `json:"duracion_ms"`
	Resumir       bool     `json:"resumir"`
	EstadoResumen string   `json:"estado_resumen"`
	Resumen       []string `json:"resumen,omitempty"`
	Transcripcion *string  `json:"transcripcion,omitempty"`
	ErrorResumen  *string  `json:"error_resumen,omitempty"`
}

func vistaDeAdjunto(v *store.AdjuntoAsignacion) vistaAdjunto {
	return vistaAdjunto{v.ID, v.Tipo, v.Nombre, v.Tamano, v.Mime, v.DuracionMS, v.Resumir, v.EstadoResumen, v.Resumen, v.Transcripcion, v.ErrorResumen}
}

func errorAdjunto(w http.ResponseWriter) {
	ResponderError(w, 503, "adjuntos_no_disponibles", "No pudimos completar la acción con los adjuntos. Intenta de nuevo.")
}
func faltaAdjunto(w http.ResponseWriter) {
	ResponderError(w, 404, "adjunto_no_encontrado", "No encontramos ese adjunto.")
}

func (a *API) handleListarAdjuntos(w http.ResponseWriter, r *http.Request) {
	t := a.tareaParaAdjuntos(w, r, false)
	if t == nil {
		return
	}
	origen := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("origen")))
	if origen == "" {
		origen = "asignacion"
	}
	if origen != "asignacion" && origen != "rechazo" {
		ResponderError(w, 400, "origen_invalido", "Origen de adjuntos inválido.")
		return
	}
	var histPtr *int64
	if hs := strings.TrimSpace(r.URL.Query().Get("historial_id")); hs != "" {
		hid, err := strconv.ParseInt(hs, 10, 64)
		if err != nil || hid <= 0 {
			ResponderError(w, 400, "historial_invalido", "Referencia de historial inválida.")
			return
		}
		histPtr = &hid
	}
	lista, e := a.Store.ListarAdjuntosPorOrigen(r.Context(), t.ID, origen, histPtr)
	if e != nil {
		errorAdjunto(w)
		return
	}
	salida := make([]vistaAdjunto, 0, len(lista))
	for _, v := range lista {
		salida = append(salida, vistaDeAdjunto(v))
	}
	ResponderJSON(w, 200, salida)
}

func (a *API) adjuntoDeRuta(w http.ResponseWriter, r *http.Request, editar, soloListo bool) *store.AdjuntoAsignacion {
	t := a.tareaParaAdjuntos(w, r, editar)
	if t == nil {
		return nil
	}
	id := r.PathValue("adjunto")
	if !uuidAdjunto.MatchString(id) {
		faltaAdjunto(w)
		return nil
	}
	v, e := a.Store.ObtenerAdjunto(r.Context(), t.ID, id)
	if errors.Is(e, store.ErrNotFound) || (e == nil && soloListo && v.EstadoArchivo != "listo") {
		faltaAdjunto(w)
		return nil
	}
	if e != nil {
		errorAdjunto(w)
		return nil
	}
	return v
}

func (a *API) handleFirmarAdjunto(w http.ResponseWriter, r *http.Request) {
	v := a.adjuntoDeRuta(w, r, false, true)
	if v == nil {
		return
	}
	nombre := ""
	vida := vidaMedioAdjunto
	if r.URL.Query().Get("descargar") == "1" {
		nombre = v.Nombre
		vida = vidaDescargaAdjunto
	}
	u, e := a.Store.FirmarObjetoAdjunto(r.Context(), v.Ruta, nombre, vida)
	if e != nil {
		errorAdjunto(w)
		return
	}
	ResponderJSON(w, 200, map[string]any{"url": u, "expira_en": vida})
}

func (a *API) handleMedioDemoAdjunto(w http.ResponseWriter, r *http.Request) {
	// En producción el navegador usa Storage y su soporte de Range, no esta ruta.
	if _, ok := a.Store.(*store.MemoryStore); !ok {
		faltaAdjunto(w)
		return
	}
	v := a.adjuntoDeRuta(w, r, false, true)
	if v == nil {
		return
	}
	b, e := a.Store.LeerObjetoAdjunto(r.Context(), v.Ruta, v.Tamano)
	if e != nil {
		errorAdjunto(w)
		return
	}
	w.Header().Set("Content-Type", v.Mime)
	http.ServeContent(w, r, v.Nombre, time.Time{}, bytes.NewReader(b))
}

func (a *API) handleReservarAdjunto(w http.ResponseWriter, r *http.Request) {
	t := a.tareaParaAdjuntos(w, r, true)
	if t == nil {
		return
	}
	var in struct {
		ID, Nombre, Tipo string
		Origen           string `json:"origen"`
		HistorialID      *int64 `json:"historial_id"`
		Tamano           int
		Duracion         *int `json:"duracion_ms"`
		Resumir          bool
	}
	if leerJSONCuerpo(r, 4096, &in) != nil || !uuidAdjunto.MatchString(in.ID) {
		ResponderError(w, 400, "adjunto_invalido", "Revisa los datos del adjunto.")
		return
	}
	origen := strings.ToLower(strings.TrimSpace(in.Origen))
	if origen == "" {
		origen = "asignacion"
	}
	if origen != "asignacion" && origen != "rechazo" {
		ResponderError(w, 400, "adjunto_invalido", "Origen de adjunto inválido.")
		return
	}
	if origen == "rechazo" {
		if t.Estado != store.EstadoTareaRechazada {
			ResponderError(w, 409, "tarea_no_rechazada", "Solo puedes adjuntar al rechazo de una tarea devuelta.")
			return
		}
		if in.HistorialID == nil || *in.HistorialID <= 0 {
			ResponderError(w, 400, "rechazo_invalido", "Falta la referencia del rechazo.")
			return
		}
		hist, err := a.Store.ObtenerHistorialTarea(r.Context(), t.ID)
		if err != nil {
			errorAdjunto(w)
			return
		}
		encontrado := false
		for _, h := range hist {
			if h.ID == *in.HistorialID && h.Evento == "entrega_rechazada" {
				encontrado = true
				break
			}
		}
		if !encontrado {
			ResponderError(w, 400, "rechazo_invalido", "El evento de rechazo no pertenece a esta tarea.")
			return
		}
	} else {
		in.HistorialID = nil
	}
	nombre, e := nombreSeguroAdjunto(in.Nombre)
	f, ok := formatoAsignacion(nombre, in.Tipo)
	if e != nil || !ok || (in.Resumir && f.tipo != "audio") || (in.Duracion != nil && (*in.Duracion < 0 || *in.Duracion > 7*24*3600*1000 || f.tipo == "imagen")) {
		ResponderError(w, 415, "tipo_adjunto", "Ese formato de archivo no es compatible.")
		return
	}
	if in.Tamano <= 0 || in.Tamano > f.maximo {
		ResponderError(w, 413, "tamano_adjunto", mensajeTamanoAdjunto(in.Tamano, f))
		return
	}
	p := UsuarioDesdeContexto(r.Context())
	v, e := a.Store.ReservarAdjunto(r.Context(), &store.AdjuntoAsignacion{ID: in.ID, TareaID: t.ID, Origen: origen, HistorialID: in.HistorialID, Tipo: f.tipo, Ruta: fmt.Sprintf("%d/%s/archivo", t.ID, in.ID), Nombre: nombre, Tamano: in.Tamano, Mime: f.mime, DuracionMS: in.Duracion, Resumir: in.Resumir, CreadoPor: &p.ID})
	if errors.Is(e, store.ErrCupoAdjuntos) {
		ResponderError(w, 409, "cupo_adjuntos", "Esta asignación admite hasta 10 adjuntos.")
		return
	}
	if e != nil {
		errorAdjunto(w)
		return
	}
	if v.Nombre != nombre || v.Tipo != f.tipo || v.Tamano != in.Tamano || v.CreadoPor == nil || *v.CreadoPor != p.ID {
		ResponderError(w, 409, "reserva_adjunto", "Ese adjunto ya está registrado.")
		return
	}
	ResponderJSON(w, 200, map[string]any{"id": v.ID, "parte_bytes": parteAdjunto, "listo": v.EstadoArchivo == "listo"})
}

func partesDeAdjunto(v *store.AdjuntoAsignacion) int {
	return (v.Tamano + parteAdjunto - 1) / parteAdjunto
}
func rutaParteAdjunto(v *store.AdjuntoAsignacion, n int) string {
	return fmt.Sprintf("%d/%s/parte-%d", v.TareaID, v.ID, n)
}
func tamanoParteAdjunto(v *store.AdjuntoAsignacion, n int) int {
	return min(parteAdjunto, v.Tamano-n*parteAdjunto)
}
func (a *API) handleParteAdjunto(w http.ResponseWriter, r *http.Request) {
	v := a.adjuntoDeRuta(w, r, true, false)
	if v == nil {
		return
	}
	if v.EstadoArchivo != "subiendo" || v.CreadoPor == nil || *v.CreadoPor != UsuarioDesdeContexto(r.Context()).ID {
		ResponderError(w, 409, "subida_cerrada", "Esta subida ya no está abierta.")
		return
	}
	n, e := strconv.Atoi(r.PathValue("parte"))
	if e != nil || n < 0 || n >= partesDeAdjunto(v) {
		ResponderError(w, 400, "parte_invalida", "El fragmento no es válido.")
		return
	}
	tam := tamanoParteAdjunto(v, n)
	b, e := io.ReadAll(http.MaxBytesReader(w, r.Body, int64(tam)))
	if e != nil || len(b) != tam {
		ResponderError(w, 400, "parte_invalida", "El fragmento no tiene el tamaño esperado.")
		return
	}
	// Escribir bajo una ruta que solo el backend conoce; repetir una parte es idempotente.
	if e = a.Store.GuardarObjetoAdjunto(r.Context(), rutaParteAdjunto(v, n), "application/octet-stream", b, true); e != nil {
		errorAdjunto(w)
		return
	}
	w.WriteHeader(204)
}

func (a *API) handleFinalizarAdjunto(w http.ResponseWriter, r *http.Request) {
	_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(90 * time.Second))
	v := a.adjuntoDeRuta(w, r, true, false)
	if v == nil {
		return
	}
	if v.CreadoPor == nil || *v.CreadoPor != UsuarioDesdeContexto(r.Context()).ID {
		ResponderError(w, 403, "subida_ajena", "No tienes acceso a esa subida.")
		return
	}
	if v.EstadoArchivo == "listo" {
		ResponderJSON(w, 200, vistaDeAdjunto(v))
		return
	}
	var in struct {
		BorradorResumen *borradorResumenAplicar `json:"borrador_resumen"`
		Inicial         bool                    `json:"inicial"`
	}
	if r.Body != nil {
		if err := leerJSONCuerpo(r, 256*1024, &in); err != nil && !errors.Is(err, io.EOF) {
			ResponderError(w, 400, "cuerpo_invalido", "Revisa los datos del adjunto.")
			return
		}
	}
	select {
	case turnoFinalizarAdjunto <- struct{}{}:
		defer func() { <-turnoFinalizarAdjunto }()
	default:
		ResponderError(w, 503, "subidas_ocupadas", "Hay otros archivos guardándose. Intenta de nuevo.")
		return
	}
	v.EstadoArchivo = "finalizando"
	v, e := a.Store.CambiarAdjunto(r.Context(), v, store.FiltroAdjunto{Archivo: "subiendo"})
	if e != nil {
		errorAdjunto(w)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 85*time.Second)
	defer cancel()
	terminado := false
	defer func() {
		if terminado {
			return
		}
		rescate, fin := context.WithTimeout(context.WithoutCancel(r.Context()), 5*time.Second)
		defer fin()
		v.EstadoArchivo = "subiendo"
		v.EstadoResumen = "sin_resumen"
		v.ErrorResumen = nil
		_, _ = a.Store.CambiarAdjunto(rescate, v, store.FiltroAdjunto{Archivo: "finalizando"})
	}()
	datos := make([]byte, 0, v.Tamano)
	partes := make([]string, 0, partesDeAdjunto(v))
	for n := 0; n < partesDeAdjunto(v); n++ {
		ruta := rutaParteAdjunto(v, n)
		partes = append(partes, ruta)
		tam := tamanoParteAdjunto(v, n)
		b, e := a.Store.LeerObjetoAdjunto(ctx, ruta, tam)
		if e != nil || len(b) != tam {
			ResponderError(w, 409, "subida_incompleta", "Faltan fragmentos del archivo. Intenta subirlo de nuevo.")
			return
		}
		datos = append(datos, b...)
	}
	f, ok := formatoAsignacion(v.Nombre, v.Tipo)
	if !ok || !validarMedioAdjunto(datos, f) {
		ResponderError(w, 415, "contenido_adjunto", "El contenido no coincide con el formato del archivo.")
		return
	}
	if e = a.Store.GuardarObjetoAdjunto(ctx, v.Ruta, v.Mime, datos, true); e != nil {
		errorAdjunto(w)
		return
	}
	v.EstadoArchivo = "listo"
	v.ErrorResumen = nil
	if v.Resumir {
		if !a.aplicarResumenBorrador(v, UsuarioDesdeContexto(r.Context()).ID, datos, in.BorradorResumen) {
			v.EstadoResumen = "pendiente"
		}
	}
	listo, e := a.Store.CambiarAdjunto(ctx, v, store.FiltroAdjunto{Archivo: "finalizando"})
	if e != nil {
		errorAdjunto(w)
		return
	}
	terminado = true
	// La subida ya está guardada; un fallo limpiando partes no invalida el adjunto.
	_ = a.Store.BorrarObjetosAdjunto(ctx, partes)
	if listo.Origen == "asignacion" && !in.Inicial {
		a.avisarAdjuntoPedido(r.Context(), listo.TareaID, UsuarioDesdeContexto(r.Context()), listo)
	}
	ResponderJSON(w, 201, vistaDeAdjunto(listo))
}

func (a *API) borrarAdjunto(ctx context.Context, v *store.AdjuntoAsignacion) error {
	rutas := []string{v.Ruta}
	for n := 0; n < partesDeAdjunto(v); n++ {
		rutas = append(rutas, rutaParteAdjunto(v, n))
	}
	if e := a.Store.BorrarObjetosAdjunto(ctx, rutas); e != nil {
		return e
	}
	return a.Store.BorrarRegistroAdjunto(ctx, v.TareaID, v.ID)
}

func (a *API) handleBorrarAdjunto(w http.ResponseWriter, r *http.Request) {
	v := a.adjuntoDeRuta(w, r, true, false)
	if v == nil {
		return
	}
	previo := v.EstadoArchivo
	if previo == "finalizando" {
		ResponderError(w, 409, "subida_en_curso", "Espera a que se guarde el archivo.")
		return
	}
	if previo != "borrando" {
		v.EstadoArchivo = "borrando"
		v.EstadoResumen = "sin_resumen"
		v.ResumenIntento = nil
		v.ResumenHasta = nil
		var e error
		v, e = a.Store.CambiarAdjunto(r.Context(), v, store.FiltroAdjunto{Archivo: previo})
		if e != nil {
			errorAdjunto(w)
			return
		}
	}
	if e := a.borrarAdjunto(r.Context(), v); e != nil {
		errorAdjunto(w)
		return
	}
	w.WriteHeader(204)
}

func (a *API) handlePreferenciaAdjunto(w http.ResponseWriter, r *http.Request) {
	v := a.adjuntoDeRuta(w, r, true, true)
	if v == nil {
		return
	}
	var in struct{ Resumir *bool }
	if v.Tipo != "audio" || leerJSONCuerpo(r, 1024, &in) != nil || in.Resumir == nil {
		ResponderError(w, 400, "preferencia_invalida", "El resumen solo está disponible para audio.")
		return
	}
	if *in.Resumir != v.Resumir || (*in.Resumir && v.EstadoResumen == "fallido") {
		v.Resumir = *in.Resumir
		v.EstadoResumen = "sin_resumen"
		if v.Resumir {
			v.EstadoResumen = "pendiente"
		}
		v.Resumen, v.Transcripcion, v.ErrorResumen, v.Proveedor, v.ResumenIntento, v.ResumenHasta = nil, nil, nil, nil, nil, nil
		var e error
		v, e = a.Store.CambiarAdjunto(r.Context(), v, store.FiltroAdjunto{Archivo: "listo"})
		if e != nil {
			errorAdjunto(w)
			return
		}
	}
	ResponderJSON(w, 200, vistaDeAdjunto(v))
}

func (a *API) handleReintentarResumenAdjunto(w http.ResponseWriter, r *http.Request) {
	v := a.adjuntoDeRuta(w, r, false, true)
	if v == nil {
		return
	}
	if v.Tipo != "audio" || !v.Resumir || v.EstadoResumen != "fallido" {
		ResponderError(w, 409, "resumen_no_reintentable", "Ese resumen no está listo para reintentar.")
		return
	}
	v.EstadoResumen = "pendiente"
	v.ErrorResumen = nil
	v, e := a.Store.CambiarAdjunto(r.Context(), v, store.FiltroAdjunto{Archivo: "listo", Resumen: "fallido"})
	if e != nil {
		errorAdjunto(w)
		return
	}
	ResponderJSON(w, 202, vistaDeAdjunto(v))
}

func nuevoIntentoAdjunto() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}
