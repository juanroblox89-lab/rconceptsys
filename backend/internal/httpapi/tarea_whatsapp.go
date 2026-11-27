package httpapi

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"rconceptsys/backend/internal/store"
)

// handleTareaWhatsApp resuelve únicamente el contacto pertinente para esta tarea.
func (a *API) handleTareaWhatsApp(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Vary", "Cookie, Authorization")
	yo := UsuarioDesdeContexto(r.Context())
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		ResponderError(w, 400, "id_invalido", "No encontramos ese trabajo.")
		return
	}
	t, err := a.Store.ObtenerTareaPorID(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) || (err == nil && !yo.EsAdmin && t.AsignadoA != yo.ID) {
		ResponderError(w, 404, "tarea_no_encontrada", "No encontramos ese trabajo.")
		return
	}
	if err != nil {
		ResponderError(w, 503, "contacto_no_disponible", "No pudimos consultar el contacto de WhatsApp.")
		return
	}
	var contacto string
	if yo.EsAdmin && t.Estado == store.EstadoTareaHecha && t.MetodoEntrega != nil && *t.MetodoEntrega == "whatsapp" {
		// El envío se autoriza solo al asignado y no se puede reasignar en revisión.
		contacto = t.AsignadoA
	} else if t.AsignadoA == yo.ID && (t.Estado == store.EstadoTareaPendiente || t.Estado == store.EstadoTareaRechazada) && t.AsignadorID != nil {
		contacto = *t.AsignadorID
	}
	var enlace, nombre string
	if contacto != "" {
		if p, err := a.Store.ObtenerPerfilPorID(r.Context(), contacto); err == nil && p != nil {
			nombre = strings.TrimSpace(p.Nombre)
		}
		if nombre == "" && contacto == t.AsignadoA && t.Asignado != nil {
			nombre = strings.TrimSpace(t.Asignado.Nombre)
		}
		celular, err := a.Store.ObtenerCelular(r.Context(), contacto)
		if err == nil {
			for prefijo := range formatosCelular {
				if strings.HasPrefix(celular, prefijo) && normalizarCelular(prefijo, strings.TrimPrefix(celular, prefijo)) == celular {
					enlace = "https://wa.me/" + strings.TrimPrefix(celular, "+")
					break
				}
			}
		}
	}
	ResponderJSON(w, 200, map[string]any{
		"url":        enlace,
		"disponible": enlace != "",
		"nombre":     nombre,
	})
}
