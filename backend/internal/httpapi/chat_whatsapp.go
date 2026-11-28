package httpapi

import (
	"errors"
	"net/http"
	"strconv"

	"rconceptsys/backend/internal/store"
)

func responderArchivoPurgado(w http.ResponseWriter) {
	ResponderError(w, http.StatusGone, "archivo_purgado", "Archivo eliminado tras 15 días para liberar espacio")
}

func leerConservar(w http.ResponseWriter, r *http.Request) *bool {
	var in struct {
		Conservar *bool `json:"conservar"`
	}
	if err := leerJSONCuerpo(r, 1024, &in); err != nil || in.Conservar == nil {
		ResponderError(w, 400, "cuerpo_invalido", "Indica si quieres conservar el archivo.")
		return nil
	}
	return in.Conservar
}

func responderConservar(w http.ResponseWriter, valor any, err error) {
	switch {
	case err == nil:
		ResponderJSON(w, 200, valor)
	case errors.Is(err, store.ErrForbidden):
		ResponderError(w, 403, "sin_permiso", "No puedes quitar la protección de este archivo.")
	case errors.Is(err, store.ErrConflict):
		ResponderError(w, 409, "archivo_no_protegible", "Este archivo ya no está disponible para cambiar su protección.")
	default:
		errorAdjunto(w)
	}
}

func (a *API) handleConservarChat(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		faltaAdjunto(w)
		return
	}
	conservar := leerConservar(w, r)
	if conservar == nil {
		return
	}
	p := UsuarioDesdeContexto(r.Context())
	if !*conservar && !p.EsAdmin {
		v, err := a.Store.ObtenerAdjuntoChat(r.Context(), id)
		if err != nil || v.AutorID != p.ID {
			responderConservar(w, nil, store.ErrForbidden)
			return
		}
	}
	v, err := a.Store.ConservarChat(r.Context(), id, p.ID, *conservar)
	responderConservar(w, v, err)
}

func (a *API) handleConservarAsignacion(w http.ResponseWriter, r *http.Request) {
	t := a.tareaParaAdjuntos(w, r, false)
	if t == nil {
		return
	}
	id := r.PathValue("adjunto")
	if !uuidAdjunto.MatchString(id) {
		faltaAdjunto(w)
		return
	}
	conservar := leerConservar(w, r)
	if conservar == nil {
		return
	}
	p := UsuarioDesdeContexto(r.Context())
	if !*conservar && !p.EsAdmin {
		responderConservar(w, nil, store.ErrForbidden)
		return
	}
	v, err := a.Store.ConservarAsignacion(r.Context(), t.ID, id, p.ID, *conservar)
	if err != nil {
		responderConservar(w, nil, err)
		return
	}
	responderConservar(w, vistaDeAdjunto(v), nil)
}
