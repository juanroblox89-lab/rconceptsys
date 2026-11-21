package store

import (
	"context"
	"strings"
	"time"
)

type MensajeRIA struct {
	ID       int64     `json:"id"`
	Rol      string    `json:"rol"`
	Cuerpo   string    `json:"cuerpo"`
	CreadoEn time.Time `json:"creado_en"`
}
type StoreRIA interface {
	HistorialRIA(ctx context.Context, perfil string, limite int) ([]MensajeRIA, error)
	GuardarConversacionRIA(ctx context.Context, perfil, pregunta, respuesta string) (MensajeRIA, error)
	UsarCupoRIA(ctx context.Context, perfil, dia string, tope int) (bool, error)
	CrearMensajeEquipoRIA(ctx context.Context, perfil, respuesta string) (*ChatMensaje, error)
}
type memoriaRIA struct {
	historial map[string][]MensajeRIA
	usos      map[[2]string]int
	ultimo    int64
}

func (m *MemoryStore) riaLocked() *memoriaRIA {
	if m.ria == nil {
		m.ria = &memoriaRIA{historial: map[string][]MensajeRIA{}, usos: map[[2]string]int{}}
	}
	return m.ria
}
func (m *MemoryStore) HistorialRIA(_ context.Context, perfil string, limite int) ([]MensajeRIA, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	filas := m.riaLocked().historial[perfil]
	inicio := max(0, len(filas)-limite)
	return append([]MensajeRIA{}, filas[inicio:]...), nil
}
func (m *MemoryStore) GuardarConversacionRIA(_ context.Context, perfil, pregunta, respuesta string) (MensajeRIA, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.riaLocked()
	ahora := time.Now()
	q := MensajeRIA{s.ultimo + 1, "user", pregunta, ahora}
	r := MensajeRIA{s.ultimo + 2, "assistant", respuesta, ahora}
	s.ultimo += 2
	s.historial[perfil] = append(s.historial[perfil], q, r)
	return r, nil
}
func (m *MemoryStore) UsarCupoRIA(_ context.Context, perfil, dia string, tope int) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.riaLocked()
	k := [2]string{perfil, dia}
	if s.usos[k] >= tope {
		return false, nil
	}
	s.usos[k]++
	return true, nil
}
func (m *MemoryStore) CrearMensajeEquipoRIA(_ context.Context, perfil, respuesta string) (*ChatMensaje, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p := m.perfiles[perfil]
	if p == nil || p.Estado != EstadoAprobado {
		return nil, ErrForbidden
	}
	if strings.TrimSpace(respuesta) == "" {
		return nil, ErrValidation
	}
	msg := ChatMensaje{ID: m.nextMsgID, AutorID: "ria", EsRIA: true, Cuerpo: respuesta, CreadoEn: time.Now()}
	m.nextMsgID++
	m.mensajes = append(m.mensajes, &msg)
	copia := msg
	return &copia, nil
}
