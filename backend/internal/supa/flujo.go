package supa

import (
	"context"
	"fmt"
	"net/url"
	"rconceptsys/backend/internal/store"
)

func (s *SupabaseStore) ActualizarTarea(ctx context.Context, id int64, campos map[string]any) (*store.Tarea, error) {
	q := url.Values{"id": {fmt.Sprintf("eq.%d", id)}, "estado": {"in.(pendiente,rechazada)"}}
	var rows []struct {
		ID int64 `json:"id"`
	}
	if err := s.client.REST(ctx, "PATCH", "tareas", q, campos, "return=representation", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrConflict
	}
	return s.ObtenerTareaPorID(ctx, id)
}
