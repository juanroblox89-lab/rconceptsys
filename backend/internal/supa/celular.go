package supa

import (
	"context"
	"net/url"
	"rconceptsys/backend/internal/store"
)

func (s *SupabaseStore) ObtenerCelular(ctx context.Context, id string) (string, error) {
	var rows []struct {
		Celular string `json:"celular"`
	}
	e := s.client.REST(ctx, "GET", "perfiles", url.Values{"id": {"eq." + id}, "select": {"celular"}}, nil, "", &rows)
	if e != nil {
		return "", e
	}
	if len(rows) == 0 {
		return "", store.ErrNotFound
	}
	return rows[0].Celular, nil
}
func (s *SupabaseStore) GuardarCelular(ctx context.Context, id, celular string) error {
	return s.client.REST(ctx, "PATCH", "perfiles", url.Values{"id": {"eq." + id}}, map[string]string{"celular": celular}, "", nil)
}
