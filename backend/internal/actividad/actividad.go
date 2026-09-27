// Package actividad registra el historial inmutable de gestión de personas
// (ANALISIS §6): quién, qué, cuándo, antes → después y motivo. Los handlers de
// httpapi la llaman en cada aprobación, cambio de acceso/oficios y
// desactivación; el evento queda guardado en el store y visible en
// GET /actividad para dueño/admin. No se puede editar ni borrar.
package actividad

import (
	"rconceptsys/backend/internal/store"
)

// Registrar guarda un evento de gestión de usuarios y lo devuelve.
// motivo == "" se guarda como nil (sin motivo).
func Registrar(s store.Store, actor store.Usuario, accion, recursoID string, antes, despues any, motivo string) (store.Evento, error) {
	var m *string
	if motivo != "" {
		m = &motivo
	}
	return s.AddActividad(store.Evento{
		ActorID:     actor.ID,
		ActorNombre: actor.Nombre,
		Accion:      accion,
		Recurso:     "usuario",
		RecursoID:   recursoID,
		Antes:       antes,
		Despues:     despues,
		Motivo:      m,
	})
}
