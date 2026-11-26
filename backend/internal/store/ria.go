package store

import (
	"context"
	"strings"
	"time"
)

type MensajeRIA struct {
	ID         int64      `json:"id"`
	PreguntaID int64      `json:"pregunta_id,omitempty"`
	Rol        string     `json:"rol"`
	Cuerpo     string     `json:"cuerpo"`
	CreadoEn   time.Time  `json:"creado_en"`
	EditadoEn  *time.Time `json:"editado_en,omitempty"`
	BorradoEn  *time.Time `json:"borrado_en,omitempty"`
}
type StoreRIA interface {
	HistorialRIA(ctx context.Context, perfil string, limite int) ([]MensajeRIA, error)
	GuardarConversacionRIA(ctx context.Context, perfil, pregunta, respuesta string) (MensajeRIA, error)
	UsarCupoRIA(ctx context.Context, perfil, dia string, tope int) (bool, error)
	IniciarRIAGrupo(ctx context.Context, perfil, solicitud, turno, comando, dia string, tope int) (InicioRIAGrupo, error)
	ContextoRIAGrupo(ctx context.Context, antesID int64) ([]TextoRIAGrupo, error)
	FinalizarRIAGrupo(ctx context.Context, perfil, solicitud, turno, respuesta string) (*ChatMensaje, error)
	LiberarRIAGrupo(ctx context.Context, perfil, solicitud, turno string) error
	EditarMensajeRIA(ctx context.Context, perfil string, id int64, cuerpo string) (MensajeRIA, error)
	EliminarMensajeRIA(ctx context.Context, perfil string, id int64) error
	RestaurarMensajeRIA(ctx context.Context, perfil string, id int64, ventana time.Duration) (MensajeRIA, error)
}
type memoriaRIA struct {
	historial map[string][]MensajeRIA
	usos      map[[2]string]int
	grupo     map[[2]string]*turnoRIAGrupo
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
	visibles := make([]MensajeRIA, 0, len(filas))
	for _, msg := range filas {
		if msg.BorradoEn != nil {
			continue
		}
		cp := msg
		cp.BorradoEn = nil
		visibles = append(visibles, cp)
	}
	inicio := max(0, len(visibles)-limite)
	return append([]MensajeRIA{}, visibles[inicio:]...), nil
}
func (m *MemoryStore) GuardarConversacionRIA(_ context.Context, perfil, pregunta, respuesta string) (MensajeRIA, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.riaLocked()
	ahora := time.Now()
	q := MensajeRIA{ID: s.ultimo + 1, Rol: "user", Cuerpo: pregunta, CreadoEn: ahora}
	r := MensajeRIA{ID: s.ultimo + 2, Rol: "assistant", Cuerpo: respuesta, CreadoEn: ahora}
	s.ultimo += 2
	s.historial[perfil] = append(s.historial[perfil], q, r)
	ret := r
	ret.PreguntaID = q.ID
	return ret, nil
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
func (m *MemoryStore) buscarMensajeRIALocked(perfil string, id int64) (string, int, *MensajeRIA, error) {
	s := m.riaLocked()
	filas := s.historial[perfil]
	for i := range filas {
		if filas[i].ID == id {
			return perfil, i, &filas[i], nil
		}
	}
	for dueno, lista := range s.historial {
		if dueno == perfil {
			continue
		}
		for i := range lista {
			if lista[i].ID == id {
				return "", -1, nil, ErrForbidden
			}
		}
	}
	return "", -1, nil, ErrNotFound
}

func (m *MemoryStore) EditarMensajeRIA(_ context.Context, perfil string, id int64, cuerpo string) (MensajeRIA, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, _, msg, err := m.buscarMensajeRIALocked(perfil, id)
	if err != nil {
		return MensajeRIA{}, err
	}
	if msg.BorradoEn != nil {
		return MensajeRIA{}, ErrNotFound
	}
	if msg.Rol != "user" {
		return MensajeRIA{}, ErrForbidden
	}
	c := strings.TrimSpace(cuerpo)
	long := len([]rune(c))
	if long == 0 || long > 2000 {
		return MensajeRIA{}, ErrValidation
	}
	ahora := time.Now()
	msg.Cuerpo = c
	msg.EditadoEn = &ahora
	cp := *msg
	cp.BorradoEn = nil
	return cp, nil
}

func (m *MemoryStore) EliminarMensajeRIA(_ context.Context, perfil string, id int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, _, msg, err := m.buscarMensajeRIALocked(perfil, id)
	if err != nil {
		return err
	}
	if msg.BorradoEn != nil {
		return ErrNotFound
	}
	if msg.Rol != "user" {
		return ErrForbidden
	}
	ahora := time.Now()
	msg.BorradoEn = &ahora
	return nil
}

func (m *MemoryStore) RestaurarMensajeRIA(_ context.Context, perfil string, id int64, ventana time.Duration) (MensajeRIA, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, _, msg, err := m.buscarMensajeRIALocked(perfil, id)
	if err != nil {
		return MensajeRIA{}, err
	}
	if msg.BorradoEn == nil {
		return MensajeRIA{}, ErrNotFound
	}
	if msg.Rol != "user" {
		return MensajeRIA{}, ErrForbidden
	}
	if time.Since(*msg.BorradoEn) > ventana {
		return MensajeRIA{}, ErrConflict
	}
	msg.BorradoEn = nil
	cp := *msg
	return cp, nil
}
