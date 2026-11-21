package store

import "context"

type StoreCelular interface {
	ObtenerCelular(context.Context, string) (string, error)
	GuardarCelular(context.Context, string, string) error
}

func (m *MemoryStore) ObtenerCelular(_ context.Context, id string) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	p := m.perfiles[id]
	if p == nil {
		return "", ErrNotFound
	}
	return p.Celular, nil
}
func (m *MemoryStore) GuardarCelular(_ context.Context, id, celular string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	p := m.perfiles[id]
	if p == nil {
		return ErrNotFound
	}
	p.Celular = celular
	return nil
}
