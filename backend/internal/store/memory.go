// Implementación en memoria de store.Store: modo demo (sin SUPABASE_URL).
// Mutex para uso concurrente; trae las 4 semillas demo con UUID estables para
// poder probar cada acceso con la cabecera X-Demo-User.
package store

import (
	"strings"
	"sync"
)

// UUID estables de las semillas demo (válidos como UUID v4).
const (
	SemillaDuenoID     = "11111111-1111-4111-8111-111111111111"
	SemillaAdminID     = "22222222-2222-4222-8222-222222222222"
	SemillaEquipoID    = "33333333-3333-4333-8333-333333333333"
	SemillaPendienteID = "44444444-4444-4434-8444-444444444444"
)

// Memoria es el store demo. eventos va del más reciente al más viejo.
type Memoria struct {
	mu       sync.RWMutex
	usuarios map[string]Usuario
	orden    []string
	eventos  []Evento
}

// NuevaMemoria crea el store demo con las 4 semillas: dueño Samuel (todos los
// oficios), admin Coord, equipo Breiner (grabación+edición) y un pendiente.
func NuevaMemoria() *Memoria {
	m := &Memoria{usuarios: map[string]Usuario{}}
	fija := "2026-09-26T12:00:00Z"
	m.poner(Usuario{ID: SemillaDuenoID, Nombre: "Samuel", Email: "samuel@demo.rconceptsys", Acceso: "dueno", Oficios: []string{"grabacion", "edicion", "diseno", "estrategia", "publicacion", "ventas"}, CreatedAt: fija, UpdatedAt: fija})
	m.poner(Usuario{ID: SemillaAdminID, Nombre: "Coord Admin", Email: "admin@demo.rconceptsys", Acceso: "admin", CreatedAt: fija, UpdatedAt: fija})
	m.poner(Usuario{ID: SemillaEquipoID, Nombre: "Breiner", Email: "breiner@demo.rconceptsys", Acceso: "equipo", Oficios: []string{"grabacion", "edicion"}, CreatedAt: fija, UpdatedAt: fija})
	m.poner(Usuario{ID: SemillaPendienteID, Nombre: "Nuevo Pendiente", Email: "pendiente@demo.rconceptsys", Acceso: "pendiente", CreatedAt: fija, UpdatedAt: fija})
	return m
}

func (m *Memoria) poner(u Usuario) {
	if u.Oficios == nil {
		u.Oficios = []string{}
	}
	if _, existe := m.usuarios[u.ID]; !existe {
		m.orden = append(m.orden, u.ID)
	}
	m.usuarios[u.ID] = u
}

func clonar(u Usuario) Usuario {
	oficios := make([]string, len(u.Oficios))
	copy(oficios, u.Oficios)
	u.Oficios = oficios
	return u
}

func (m *Memoria) ListUsuarios() ([]Usuario, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]Usuario, 0, len(m.orden))
	for _, id := range m.orden {
		out = append(out, clonar(m.usuarios[id]))
	}
	return out, nil
}

func (m *Memoria) GetUsuario(id string) (Usuario, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	u, ok := m.usuarios[id]
	if !ok {
		return Usuario{}, false, nil
	}
	return clonar(u), true, nil
}

func (m *Memoria) GetUsuarioByEmail(email string) (Usuario, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, id := range m.orden {
		if u := m.usuarios[id]; strings.EqualFold(u.Email, email) {
			return clonar(u), true, nil
		}
	}
	return Usuario{}, false, nil
}

func (m *Memoria) CreateUsuario(u Usuario) (Usuario, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if u.ID == "" {
		u.ID = NewUUID()
	}
	if u.Oficios == nil {
		u.Oficios = []string{}
	}
	if u.CreatedAt == "" {
		u.CreatedAt = Ahora()
	}
	if u.UpdatedAt == "" {
		u.UpdatedAt = Ahora()
	}
	m.poner(u)
	return clonar(m.usuarios[u.ID]), nil
}

func (m *Memoria) UpdateUsuario(id string, acceso Acceso, oficios []string) (Usuario, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.usuarios[id]
	if !ok {
		return Usuario{}, ErrNoExiste
	}
	if acceso != "" {
		u.Acceso = acceso
	}
	if oficios != nil {
		u.Oficios = append([]string{}, oficios...)
	}
	u.UpdatedAt = Ahora()
	m.usuarios[id] = u
	return clonar(u), nil
}

func (m *Memoria) Desactivar(id string) (Usuario, error) {
	return m.UpdateUsuario(id, "desactivado", nil)
}

func (m *Memoria) ListActividad(filtro string) ([]Evento, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []Evento{}
	for _, e := range m.eventos {
		if filtro != "" && e.Recurso != filtro && e.RecursoID != filtro {
			continue
		}
		out = append(out, e)
	}
	return out, nil
}

func (m *Memoria) AddActividad(e Evento) (Evento, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if e.ID == "" {
		e.ID = NewUUID()
	}
	if e.Cuando == "" {
		e.Cuando = Ahora()
	}
	m.eventos = append([]Evento{e}, m.eventos...)
	return e, nil
}

func (m *Memoria) CountDuenos() (int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	n := 0
	for _, u := range m.usuarios {
		if u.Acceso == "dueno" {
			n++
		}
	}
	return n, nil
}
