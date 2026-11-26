package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"rconceptsys/backend/internal/store"
)

func (a *API) handleAdminPostTareaPedirDeNuevo(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		ResponderError(w, 400, "id_invalido", "No encontramos ese trabajo.")
		return
	}
	// Leer hasta el final: incluso los espacios posteriores al JSON cuentan en el límite.
	datos, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 32*1024))
	if err != nil {
		var demasiado *http.MaxBytesError
		if errors.As(err, &demasiado) {
			ResponderError(w, 413, "cuerpo_demasiado_grande", "Los datos del pedido superan el tamaño permitido.")
		} else {
			ResponderError(w, 400, "cuerpo_invalido", "Revisa los datos del pedido.")
		}
		return
	}
	var body struct {
		Motivo string `json:"motivo"`
	}
	if len(datos) > 0 && json.Unmarshal(datos, &body) != nil {
		ResponderError(w, 400, "cuerpo_invalido", "Revisa los datos del pedido.")
		return
	}
	if utf8.RuneCountInString(body.Motivo) > 500 {
		ResponderError(w, 400, "motivo_largo", "Escribe un motivo de hasta 500 caracteres.")
		return
	}
	motivo := strings.TrimSpace(body.Motivo)
	actor := a.usuarioActual(r)
	ctx := r.Context()
	tarea, err := a.Store.PedirDeNuevoTarea(ctx, id, actor.ID, motivo)
	switch {
	case errors.Is(err, store.ErrCortePagado):
		ResponderError(w, 409, "corte_pagado", "Ese trabajo ya está incluido en un corte pagado. Crea un trabajo nuevo para el rehacer.")
	case errors.Is(err, store.ErrConflict):
		ResponderError(w, 409, "estado_invalido", "Solo puedes pedir de nuevo un trabajo ya aprobado.")
	case errors.Is(err, store.ErrNotFound):
		ResponderError(w, 404, "tarea_no_encontrada", "No encontramos ese trabajo.")
	case errors.Is(err, store.ErrForbidden):
		ResponderError(w, 403, "no_autorizado", "Solo un administrador puede pedir de nuevo un trabajo.")
	case errors.Is(err, store.ErrValidation):
		ResponderError(w, 400, "motivo_invalido", "Revisa el motivo del pedido.")
	case err != nil:
		ResponderError(w, 500, "error_pedir_de_nuevo", "No pudimos volver a pedir el trabajo.")
	default:
		a.avisarPedidoDeNuevo(ctx, tarea, actor.ID, motivo)
		if historial, err := a.Store.ObtenerHistorialTarea(ctx, id); err == nil {
			tarea.Historial = historial
		}
		ResponderJSON(w, 200, tarea)
	}
}
