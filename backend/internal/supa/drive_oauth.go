package supa

import (
	"context"
	"net/url"
	"rconceptsys/backend/internal/store"
	"time"
)

func (s *SupabaseStore) GuardarEstadoDriveOAuth(ctx context.Context, h string, v store.EstadoDriveOAuth) error {
	_ = s.client.REST(ctx, "DELETE", "drive_oauth_estados", url.Values{"expira": {"lte." + time.Now().UTC().Format(time.RFC3339)}}, nil, "", nil)
	return s.client.REST(ctx, "POST", "drive_oauth_estados", nil, map[string]any{"huella": h, "admin_id": v.AdminID, "retorno": v.Retorno, "expira": v.Expira}, "", nil)
}
func (s *SupabaseStore) ConsumirEstadoDriveOAuth(ctx context.Context, h string) (store.EstadoDriveOAuth, error) {
	var rows []store.EstadoDriveOAuth
	if e := s.client.RPC(ctx, "rc_consumir_drive_oauth", map[string]string{"p_huella": h}, &rows); e != nil {
		return store.EstadoDriveOAuth{}, e
	}
	if len(rows) != 1 {
		return store.EstadoDriveOAuth{}, store.ErrNotFound
	}
	return rows[0], nil
}
