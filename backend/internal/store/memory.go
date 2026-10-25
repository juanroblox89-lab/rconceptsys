package store

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

type MemoryStore struct {
	mu           sync.RWMutex
	perfiles     map[string]*Perfil
	roles        map[int]*Rol
	perfilRoles  map[string]map[int]bool // perfil_id -> set de rol_id
	mensajes     []*ChatMensaje
	nextRolID    int
	nextMsgID    int64
	avatares     map[string][]byte
}

func NewMemoryStore() *MemoryStore {
	m := &MemoryStore{
		perfiles:    make(map[string]*Perfil),
		roles:       make(map[int]*Rol),
		perfilRoles: make(map[string]map[int]bool),
		mensajes:    make([]*ChatMensaje, 0),
		nextRolID:   4,
		nextMsgID:   1,
		avatares:    make(map[string][]byte),
	}

	// Semilla de roles iniciales
	m.roles[1] = &Rol{ID: 1, Clave: "camarografo", Nombre: "Camarógrafo", Color: "#2563EB", Orden: 1, Activo: true}
	m.roles[2] = &Rol{ID: 2, Clave: "editor", Nombre: "Editor", Color: "#7C3AED", Orden: 2, Activo: true}
	m.roles[3] = &Rol{ID: 3, Clave: "subidor_contenido", Nombre: "Subidor de contenido", Color: "#059669", Orden: 3, Activo: true}

	return m
}

func (m *MemoryStore) getPerfilRolesLocked(perfilID string) []Rol {
	rolIDs := m.perfilRoles[perfilID]
	if len(rolIDs) == 0 {
		return []Rol{}
	}
	res := make([]Rol, 0, len(rolIDs))
	for rID := range rolIDs {
		if r, ok := m.roles[rID]; ok && r.Activo {
			res = append(res, *r)
		}
	}
	sort.Slice(res, func(i, j int) bool {
		return res[i].Orden < res[j].Orden
	})
	return res
}

func (m *MemoryStore) clonarPerfilLocked(p *Perfil) *Perfil {
	if p == nil {
		return nil
	}
	cp := *p
	cp.Roles = m.getPerfilRolesLocked(p.ID)
	return &cp
}

func (m *MemoryStore) ObtenerPerfilPorID(ctx context.Context, id string) (*Perfil, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	p, ok := m.perfiles[id]
	if !ok {
		return nil, ErrNotFound
	}
	return m.clonarPerfilLocked(p), nil
}

func (m *MemoryStore) ObtenerPerfilPorCorreo(ctx context.Context, correo string) (*Perfil, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	correoNorm := strings.ToLower(strings.TrimSpace(correo))
	for _, p := range m.perfiles {
		if strings.ToLower(p.Correo) == correoNorm {
			return m.clonarPerfilLocked(p), nil
		}
	}
	return nil, ErrNotFound
}

func (m *MemoryStore) CrearOActualizarPerfil(ctx context.Context, perfil *Perfil) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if perfil == nil || perfil.ID == "" {
		return ErrValidation
	}

	existente, ok := m.perfiles[perfil.ID]
	if ok {
		existente.Nombre = perfil.Nombre
		existente.Correo = perfil.Correo
		existente.Estado = perfil.Estado
		existente.EsAdmin = perfil.EsAdmin
		if perfil.FotoPath != nil {
			existente.FotoPath = perfil.FotoPath
		}
	} else {
		cp := *perfil
		if cp.CreadoEn.IsZero() {
			cp.CreadoEn = time.Now()
		}
		m.perfiles[perfil.ID] = &cp
	}
	return nil
}

func (m *MemoryStore) ActualizarNombre(ctx context.Context, id string, nombre string) (*Perfil, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	p, ok := m.perfiles[id]
	if !ok {
		return nil, ErrNotFound
	}
	p.Nombre = strings.TrimSpace(nombre)
	return m.clonarPerfilLocked(p), nil
}

func (m *MemoryStore) ActualizarFoto(ctx context.Context, id string, fotoPath string) (*Perfil, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	p, ok := m.perfiles[id]
	if !ok {
		return nil, ErrNotFound
	}
	p.FotoPath = &fotoPath
	return m.clonarPerfilLocked(p), nil
}

func (m *MemoryStore) ListarEquipo(ctx context.Context) ([]*Perfil, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var lista []*Perfil
	for _, p := range m.perfiles {
		if p.Estado == EstadoAprobado {
			lista = append(lista, m.clonarPerfilLocked(p))
		}
	}
	sort.Slice(lista, func(i, j int) bool {
		return strings.ToLower(lista[i].Nombre) < strings.ToLower(lista[j].Nombre)
	})
	return lista, nil
}

func (m *MemoryStore) ObtenerMiembroEquipo(ctx context.Context, id string) (*Perfil, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	p, ok := m.perfiles[id]
	if !ok || p.Estado != EstadoAprobado {
		return nil, ErrNotFound
	}
	return m.clonarPerfilLocked(p), nil
}

func (m *MemoryStore) ListarMensajesChat(ctx context.Context, antesID int64, despuesID int64, limite int) ([]*ChatMensaje, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if limite <= 0 || limite > 100 {
		limite = 40
	}

	// Si piden 'despuesID', buscan mensajes más nuevos que despuesID (polling ascendente)
	if despuesID > 0 {
		var nuevos []*ChatMensaje = make([]*ChatMensaje, 0)
		for _, msg := range m.mensajes {
			if msg.BorradoEn != nil {
				continue
			}
			if msg.ID > despuesID {
				autor := m.perfiles[msg.AutorID]
				cpMsg := *msg
				if autor != nil {
					cpMsg.Autor = m.clonarPerfilLocked(autor)
				}
				nuevos = append(nuevos, &cpMsg)
				if len(nuevos) >= limite {
					break
				}
			}
		}
		return nuevos, nil
	}

	// Recorrer de más recientes a más viejos (paginado hacia atrás con antesID)
	var filtrados []*ChatMensaje = make([]*ChatMensaje, 0)
	for i := len(m.mensajes) - 1; i >= 0; i-- {
		msg := m.mensajes[i]
		if msg.BorradoEn != nil {
			continue
		}
		if antesID > 0 && msg.ID >= antesID {
			continue
		}
		autor := m.perfiles[msg.AutorID]
		cpMsg := *msg
		if autor != nil {
			cpMsg.Autor = m.clonarPerfilLocked(autor)
		}
		filtrados = append(filtrados, &cpMsg)
		if len(filtrados) >= limite {
			break
		}
	}

	return filtrados, nil
}

func (m *MemoryStore) CrearMensajeChat(ctx context.Context, autorID string, cuerpo string) (*ChatMensaje, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	autor, ok := m.perfiles[autorID]
	if !ok {
		return nil, ErrNotFound
	}
	if autor.Estado != EstadoAprobado {
		return nil, ErrForbidden
	}

	c := strings.TrimSpace(cuerpo)
	if len(c) < 1 || len([]rune(c)) > 2000 {
		return nil, ErrValidation
	}

	id := m.nextMsgID
	m.nextMsgID++

	msg := &ChatMensaje{
		ID:       id,
		AutorID:  autorID,
		Cuerpo:   c,
		CreadoEn: time.Now(),
	}
	m.mensajes = append(m.mensajes, msg)

	cpMsg := *msg
	cpMsg.Autor = m.clonarPerfilLocked(autor)
	return &cpMsg, nil
}

func (m *MemoryStore) ListarRoles(ctx context.Context, soloActivos bool) ([]*Rol, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var lista []*Rol
	for _, r := range m.roles {
		if soloActivos && !r.Activo {
			continue
		}
		cp := *r
		lista = append(lista, &cp)
	}
	sort.Slice(lista, func(i, j int) bool {
		return lista[i].Orden < lista[j].Orden
	})
	return lista, nil
}

func (m *MemoryStore) CrearRol(ctx context.Context, rol *Rol) (*Rol, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	clave := strings.ToLower(strings.TrimSpace(rol.Clave))
	if clave == "" || rol.Nombre == "" {
		return nil, ErrValidation
	}

	for _, r := range m.roles {
		if strings.ToLower(r.Clave) == clave {
			return nil, ErrConflict
		}
	}

	id := m.nextRolID
	m.nextRolID++

	nuevo := &Rol{
		ID:     id,
		Clave:  clave,
		Nombre: strings.TrimSpace(rol.Nombre),
		Color:  strings.TrimSpace(rol.Color),
		Orden:  rol.Orden,
		Activo: rol.Activo,
	}
	if nuevo.Color == "" {
		nuevo.Color = "#737373"
	}
	m.roles[id] = nuevo
	cp := *nuevo
	return &cp, nil
}

func (m *MemoryStore) ActualizarRol(ctx context.Context, id int, campos map[string]any) (*Rol, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	r, ok := m.roles[id]
	if !ok {
		return nil, ErrNotFound
	}

	if nom, ok := campos["nombre"].(string); ok && strings.TrimSpace(nom) != "" {
		r.Nombre = strings.TrimSpace(nom)
	}
	if col, ok := campos["color"].(string); ok && strings.TrimSpace(col) != "" {
		r.Color = strings.TrimSpace(col)
	}
	if ord, ok := campos["orden"].(int); ok {
		r.Orden = ord
	} else if ordF, ok := campos["orden"].(float64); ok {
		r.Orden = int(ordF)
	}
	if act, ok := campos["activo"].(bool); ok {
		r.Activo = act
	}

	cp := *r
	return &cp, nil
}

func (m *MemoryStore) ListarMiembros(ctx context.Context, filtro FiltroMiembros) ([]*Perfil, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var lista []*Perfil
	for _, p := range m.perfiles {
		if filtro.Estado != nil && p.Estado != *filtro.Estado {
			continue
		}
		lista = append(lista, m.clonarPerfilLocked(p))
	}
	sort.Slice(lista, func(i, j int) bool {
		return lista[i].CreadoEn.Before(lista[j].CreadoEn)
	})
	return lista, nil
}

func (m *MemoryStore) AprobarMiembro(ctx context.Context, id string) (*Perfil, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	p, ok := m.perfiles[id]
	if !ok {
		return nil, ErrNotFound
	}
	p.Estado = EstadoAprobado
	return m.clonarPerfilLocked(p), nil
}

func (m *MemoryStore) SuspenderMiembro(ctx context.Context, id string) (*Perfil, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	p, ok := m.perfiles[id]
	if !ok {
		return nil, ErrNotFound
	}
	p.Estado = EstadoSuspendido
	return m.clonarPerfilLocked(p), nil
}

func (m *MemoryStore) ReactivarMiembro(ctx context.Context, id string) (*Perfil, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	p, ok := m.perfiles[id]
	if !ok {
		return nil, ErrNotFound
	}
	p.Estado = EstadoAprobado
	return m.clonarPerfilLocked(p), nil
}

func (m *MemoryStore) AsignarRolesMiembro(ctx context.Context, id string, rolIDs []int) (*Perfil, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	p, ok := m.perfiles[id]
	if !ok {
		return nil, ErrNotFound
	}

	set := make(map[int]bool)
	for _, rID := range rolIDs {
		if _, exists := m.roles[rID]; exists {
			set[rID] = true
		}
	}
	m.perfilRoles[id] = set
	return m.clonarPerfilLocked(p), nil
}

func (m *MemoryStore) contarAdminsLocked() int {
	count := 0
	for _, p := range m.perfiles {
		if p.EsAdmin && p.Estado == EstadoAprobado {
			count++
		}
	}
	return count
}

func (m *MemoryStore) CambiarEsAdmin(ctx context.Context, id string, esAdmin bool) (*Perfil, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	p, ok := m.perfiles[id]
	if !ok {
		return nil, ErrNotFound
	}

	if !esAdmin && p.EsAdmin {
		if m.contarAdminsLocked() <= 1 {
			return nil, ErrLastAdmin
		}
	}

	p.EsAdmin = esAdmin
	return m.clonarPerfilLocked(p), nil
}

func (m *MemoryStore) GuardarAvatar(ctx context.Context, nombreArchivo string, datos []byte, contentType string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.avatares[nombreArchivo] = datos
	return fmt.Sprintf("/storage/v1/object/public/avatares/%s", nombreArchivo), nil
}
