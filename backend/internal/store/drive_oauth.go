package store

import (
	"context"
	"time"
)

type EstadoDriveOAuth struct {
	AdminID string    `json:"admin_id"`
	Retorno string    `json:"retorno"`
	Expira  time.Time `json:"expira"`
}

type StoreDriveOAuth interface {
	GuardarEstadoDriveOAuth(context.Context, string, EstadoDriveOAuth) error
	ConsumirEstadoDriveOAuth(context.Context, string) (EstadoDriveOAuth, error)
}

func (m *MemoryStore) GuardarEstadoDriveOAuth(_ context.Context, huella string, v EstadoDriveOAuth) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.oauthDrive == nil {
		m.oauthDrive = map[string]EstadoDriveOAuth{}
	}
	ahora := time.Now()
	for k, s := range m.oauthDrive {
		if !s.Expira.After(ahora) {
			delete(m.oauthDrive, k)
		}
	}
	m.oauthDrive[huella] = v
	return nil
}
func (m *MemoryStore) ConsumirEstadoDriveOAuth(_ context.Context, huella string) (EstadoDriveOAuth, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	v, ok := m.oauthDrive[huella]
	delete(m.oauthDrive, huella)
	if !ok || !v.Expira.After(time.Now()) {
		return EstadoDriveOAuth{}, ErrNotFound
	}
	return v, nil
}
