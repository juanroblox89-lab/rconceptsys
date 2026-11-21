package httpapi

import (
	"net/http"
	"strconv"
)

func (a *API) handleCortePropio(w http.ResponseWriter, r *http.Request) {
	id, e := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if e != nil || id < 1 {
		ResponderError(w, 404, "corte_no_encontrado", "No encontramos ese corte.")
		return
	}
	c, e := a.Store.ObtenerCorte(r.Context(), id)
	if e != nil || c == nil {
		ResponderError(w, 404, "corte_no_encontrado", "No encontramos ese corte.")
		return
	}
	for _, l := range c.Lineas {
		if l.PerfilID == a.usuarioActual(r).ID {
			ResponderJSON(w, 200, map[string]any{"id": id, "desde": c.Desde, "hasta": c.Hasta, "total": l.Total, "tareas": l.Tareas, "pagada_en": l.PagadaEn})
			return
		}
	}
	ResponderError(w, 404, "corte_no_encontrado", "No encontramos ese corte.")
}
