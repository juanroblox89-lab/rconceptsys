package store

import (
	"context"
	"fmt"
)

func (m *MemoryStore) GuardarFotoCliente(_ context.Context, id int, nombre, _ string, datos []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.avatares[fmt.Sprintf("clientes/%d/%s", id, nombre)] = datos
	return nil
}

func (m *MemoryStore) LeerFotoCliente(_ context.Context, id int, nombre string) ([]byte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	datos, ok := m.avatares[fmt.Sprintf("clientes/%d/%s", id, nombre)]
	if !ok {
		return nil, ErrNotFound
	}
	return datos, nil
}
