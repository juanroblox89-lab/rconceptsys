package supa

import (
	"context"
	"net/url"

	"rconceptsys/backend/internal/store"
)

func (s *SupabaseStore) ObtenerApariencia(ctx context.Context, p string) (store.Apariencia, error) {
	var r []struct {
		Preferencias store.Apariencia `json:"preferencias"`
	}
	e := s.client.REST(ctx, "GET", "perfil_apariencia", url.Values{"perfil_id": {"eq." + p}, "select": {"preferencias"}}, nil, "", &r)
	if len(r) == 0 {
		return store.AparienciaInicial(), e
	}
	return r[0].Preferencias, e
}
func (s *SupabaseStore) GuardarApariencia(ctx context.Context, p string, v store.Apariencia) error {
	return s.client.REST(ctx, "POST", "perfil_apariencia", url.Values{"on_conflict": {"perfil_id"}}, map[string]any{"perfil_id": p, "preferencias": v}, "resolution=merge-duplicates", nil)
}
func (s *SupabaseStore) GuardarMedioApariencia(ctx context.Context, p, n, mime string, d []byte) error {
	return s.client.UploadStorage(ctx, "apariencia", p+"/"+n, d, mime)
}
func (s *SupabaseStore) LeerMedioApariencia(ctx context.Context, p, n string) ([]byte, error) {
	return s.client.DownloadStorage(ctx, "apariencia", p+"/"+n)
}
