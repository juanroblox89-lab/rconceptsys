package supa

import (
	"context"
	"fmt"
)

func (s *SupabaseStore) GuardarFotoCliente(ctx context.Context, id int, nombre, mime string, datos []byte) error {
	return s.client.UploadStorage(ctx, "clientes-fotos", fmt.Sprintf("%d/%s", id, nombre), datos, mime)
}

func (s *SupabaseStore) LeerFotoCliente(ctx context.Context, id int, nombre string) ([]byte, error) {
	return s.client.DownloadStorage(ctx, "clientes-fotos", fmt.Sprintf("%d/%s", id, nombre))
}
