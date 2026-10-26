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
	mu          sync.RWMutex
	perfiles    map[string]*Perfil
	roles       map[int]*Rol
	perfilRoles map[string]map[int]bool // perfil_id -> set de rol_id
	mensajes    []*ChatMensaje
	nextRolID   int
	nextMsgID   int64
	avatares    map[string][]byte

	// F2 y F3: Clientes, tipos de trabajo, tareas, facturas
	clientes     map[int]*Cliente
	nextClienteID int
	tiposTrabajo map[int]*TipoTrabajo
	nextTipoID   int
	tareas       map[int64]*Tarea
	nextTareaID  int64
	facturas     map[int64]*Factura
	nextFactID   int64
}

func NewMemoryStore() *MemoryStore {
	m := &MemoryStore{
		perfiles:     make(map[string]*Perfil),
		roles:        make(map[int]*Rol),
		perfilRoles:  make(map[string]map[int]bool),
		mensajes:     make([]*ChatMensaje, 0),
		nextRolID:    4,
		nextMsgID:    1,
		avatares:     make(map[string][]byte),
		clientes:     make(map[int]*Cliente),
		nextClienteID: 1,
		tiposTrabajo: make(map[int]*TipoTrabajo),
		nextTipoID:   4,
		tareas:       make(map[int64]*Tarea),
		nextTareaID:  1,
		facturas:     make(map[int64]*Factura),
		nextFactID:   1,
	}

	// Semilla de roles iniciales
	m.roles[1] = &Rol{ID: 1, Clave: "camarografo", Nombre: "Camarógrafo", Color: "#2563EB", Orden: 1, Activo: true}
	m.roles[2] = &Rol{ID: 2, Clave: "editor", Nombre: "Editor", Color: "#7C3AED", Orden: 2, Activo: true}
	m.roles[3] = &Rol{ID: 3, Clave: "subidor_contenido", Nombre: "Subidor de contenido", Color: "#059669", Orden: 3, Activo: true}

	// Semilla de tipos de trabajo iniciales (F2 y F3)
	rolCam := 1
	rolEd := 2
	rolSub := 3
	ahora := time.Now()
	m.tiposTrabajo[1] = &TipoTrabajo{ID: 1, Clave: "grabacion_video", Nombre: "Grabación de video", RolID: &rolCam, Precio: 0, Unidad: "minuto", Activo: true, Orden: 1, CreadoEn: ahora}
	m.tiposTrabajo[2] = &TipoTrabajo{ID: 2, Clave: "edicion_video", Nombre: "Edición de video", RolID: &rolEd, Precio: 0, Unidad: "trabajo", Activo: true, Orden: 2, CreadoEn: ahora}
	m.tiposTrabajo[3] = &TipoTrabajo{ID: 3, Clave: "subida_video", Nombre: "Subir video", RolID: &rolSub, Precio: 0, Unidad: "trabajo", Activo: true, Orden: 3, CreadoEn: ahora}

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

// ==========================================
// F2: Implementación Tipos de Trabajo
// ==========================================

func (m *MemoryStore) clonarTipoTrabajoLocked(t *TipoTrabajo) *TipoTrabajo {
	if t == nil {
		return nil
	}
	cp := *t
	if t.RolID != nil {
		if r, ok := m.roles[*t.RolID]; ok {
			rolCp := *r
			cp.Rol = &rolCp
		}
	}
	return &cp
}

func (m *MemoryStore) ListarTiposTrabajo(ctx context.Context, soloActivos bool) ([]*TipoTrabajo, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var res []*TipoTrabajo
	for _, t := range m.tiposTrabajo {
		if soloActivos && !t.Activo {
			continue
		}
		res = append(res, m.clonarTipoTrabajoLocked(t))
	}
	sort.Slice(res, func(i, j int) bool {
		if res[i].Orden == res[j].Orden {
			return res[i].ID < res[j].ID
		}
		return res[i].Orden < res[j].Orden
	})
	return res, nil
}

func (m *MemoryStore) ObtenerTipoTrabajoPorID(ctx context.Context, id int) (*TipoTrabajo, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	t, ok := m.tiposTrabajo[id]
	if !ok {
		return nil, ErrNotFound
	}
	return m.clonarTipoTrabajoLocked(t), nil
}

func (m *MemoryStore) CrearTipoTrabajo(ctx context.Context, t *TipoTrabajo) (*TipoTrabajo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if t == nil || strings.TrimSpace(t.Clave) == "" || strings.TrimSpace(t.Nombre) == "" {
		return nil, ErrValidation
	}
	if t.Precio < 0 || t.Precio > 100000000 {
		return nil, ErrValidation
	}

	clave := strings.ToLower(strings.TrimSpace(t.Clave))
	for _, exist := range m.tiposTrabajo {
		if exist.Clave == clave {
			return nil, ErrConflict
		}
	}

	if t.RolID != nil {
		if _, ok := m.roles[*t.RolID]; !ok {
			return nil, ErrValidation
		}
	}

	id := m.nextTipoID
	m.nextTipoID++

	unidad := "trabajo"
	if t.Unidad != "" {
		if t.Unidad != "trabajo" && t.Unidad != "minuto" {
			return nil, ErrValidation
		}
		unidad = t.Unidad
	}

	nuevo := &TipoTrabajo{
		ID:       id,
		Clave:    clave,
		Nombre:   strings.TrimSpace(t.Nombre),
		RolID:    t.RolID,
		Precio:   t.Precio,
		Unidad:   unidad,
		Activo:   t.Activo,
		Orden:    t.Orden,
		CreadoEn: time.Now(),
	}
	m.tiposTrabajo[id] = nuevo
	return m.clonarTipoTrabajoLocked(nuevo), nil
}

func (m *MemoryStore) ActualizarTipoTrabajo(ctx context.Context, id int, campos map[string]any) (*TipoTrabajo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	t, ok := m.tiposTrabajo[id]
	if !ok {
		return nil, ErrNotFound
	}

	if v, exists := campos["nombre"]; exists {
		if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
			t.Nombre = strings.TrimSpace(s)
		} else {
			return nil, ErrValidation
		}
	}
	if v, exists := campos["unidad"]; exists {
		if s, ok := v.(string); ok {
			sLimpio := strings.TrimSpace(s)
			if sLimpio != "trabajo" && sLimpio != "minuto" {
				return nil, fmt.Errorf("%w: la unidad debe ser 'trabajo' o 'minuto'", ErrValidation)
			}
			t.Unidad = sLimpio
		} else {
			return nil, ErrValidation
		}
	}
	if v, exists := campos["precio"]; exists {
		var p int
		switch n := v.(type) {
		case int:
			p = n
		case float64:
			p = int(n)
		default:
			return nil, ErrValidation
		}
		if p < 0 || p > 100000000 {
			return nil, ErrValidation
		}
		t.Precio = p
	}
	if v, exists := campos["rol_id"]; exists {
		if v == nil {
			t.RolID = nil
		} else {
			var rID int
			switch n := v.(type) {
			case int:
				rID = n
			case float64:
				rID = int(n)
			default:
				return nil, ErrValidation
			}
			if _, ok := m.roles[rID]; !ok {
				return nil, ErrValidation
			}
			t.RolID = &rID
		}
	}
	if v, exists := campos["activo"]; exists {
		if b, ok := v.(bool); ok {
			t.Activo = b
		}
	}
	if v, exists := campos["orden"]; exists {
		switch n := v.(type) {
		case int:
			t.Orden = n
		case float64:
			t.Orden = int(n)
		}
	}

	return m.clonarTipoTrabajoLocked(t), nil
}

// ==========================================
// F3: Implementación Clientes
// ==========================================

func (m *MemoryStore) clonarClienteLocked(c *Cliente) *Cliente {
	if c == nil {
		return nil
	}
	cp := *c
	return &cp
}

func (m *MemoryStore) ListarClientes(ctx context.Context, soloActivos bool) ([]*Cliente, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var res []*Cliente
	for _, c := range m.clientes {
		if soloActivos && !c.Activo {
			continue
		}
		res = append(res, m.clonarClienteLocked(c))
	}
	sort.Slice(res, func(i, j int) bool {
		return strings.ToLower(res[i].Nombre) < strings.ToLower(res[j].Nombre)
	})
	return res, nil
}

func (m *MemoryStore) ObtenerClientePorID(ctx context.Context, id int) (*Cliente, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	c, ok := m.clientes[id]
	if !ok {
		return nil, ErrNotFound
	}
	return m.clonarClienteLocked(c), nil
}

func (m *MemoryStore) CrearCliente(ctx context.Context, nombre string) (*Cliente, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	nombreLimpio := strings.TrimSpace(nombre)
	if len(nombreLimpio) < 1 || len(nombreLimpio) > 80 {
		return nil, fmt.Errorf("%w: el nombre del cliente debe tener entre 1 y 80 caracteres", ErrValidation)
	}

	for _, c := range m.clientes {
		if strings.EqualFold(c.Nombre, nombreLimpio) {
			return nil, fmt.Errorf("%w: ya existe un cliente con ese nombre", ErrConflict)
		}
	}

	id := m.nextClienteID
	m.nextClienteID++

	c := &Cliente{
		ID:       id,
		Nombre:   nombreLimpio,
		Activo:   true,
		CreadoEn: time.Now(),
	}
	m.clientes[id] = c
	return m.clonarClienteLocked(c), nil
}

func (m *MemoryStore) ActualizarCliente(ctx context.Context, id int, campos map[string]any) (*Cliente, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	c, ok := m.clientes[id]
	if !ok {
		return nil, ErrNotFound
	}

	if v, exists := campos["nombre"]; exists {
		if s, ok := v.(string); ok {
			sLimpio := strings.TrimSpace(s)
			if len(sLimpio) < 1 || len(sLimpio) > 80 {
				return nil, fmt.Errorf("%w: el nombre del cliente debe tener entre 1 y 80 caracteres", ErrValidation)
			}
			for otherID, other := range m.clientes {
				if otherID != id && strings.EqualFold(other.Nombre, sLimpio) {
					return nil, fmt.Errorf("%w: ya existe un cliente con ese nombre", ErrConflict)
				}
			}
			c.Nombre = sLimpio
		} else {
			return nil, ErrValidation
		}
	}

	if v, exists := campos["activo"]; exists {
		if b, ok := v.(bool); ok {
			c.Activo = b
		} else {
			return nil, ErrValidation
		}
	}

	return m.clonarClienteLocked(c), nil
}

// ==========================================
// F2: Implementación Tareas
// ==========================================

func (m *MemoryStore) clonarTareaLocked(t *Tarea) *Tarea {
	if t == nil {
		return nil
	}
	cp := *t
	if tipo, ok := m.tiposTrabajo[t.TipoID]; ok {
		cp.Tipo = m.clonarTipoTrabajoLocked(tipo)
	}
	if t.ClienteID != nil {
		if cli, ok := m.clientes[*t.ClienteID]; ok {
			cp.Cliente = m.clonarClienteLocked(cli)
		}
	}
	if asig, ok := m.perfiles[t.AsignadoA]; ok {
		cp.Asignado = m.clonarPerfilLocked(asig)
	}
	if creador, ok := m.perfiles[t.CreadoPor]; ok {
		cp.Creador = m.clonarPerfilLocked(creador)
	}
	return &cp
}

func (m *MemoryStore) CrearTarea(ctx context.Context, t *Tarea) (*Tarea, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if t == nil || strings.TrimSpace(t.Titulo) == "" || len(t.Titulo) > 120 {
		return nil, ErrValidation
	}
	if t.Descripcion != nil && len(*t.Descripcion) > 1000 {
		return nil, ErrValidation
	}

	// Tipo debe existir
	if _, ok := m.tiposTrabajo[t.TipoID]; !ok {
		return nil, ErrValidation
	}

	// Cliente opcional: debe existir y estar activo
	if t.ClienteID != nil {
		cli, ok := m.clientes[*t.ClienteID]
		if !ok || !cli.Activo {
			return nil, fmt.Errorf("%w: el cliente especificado no existe o no está activo", ErrValidation)
		}
	}

	// Asignado y Creador deben existir
	if _, ok := m.perfiles[t.AsignadoA]; !ok {
		return nil, ErrValidation
	}
	if _, ok := m.perfiles[t.CreadoPor]; !ok {
		return nil, ErrValidation
	}

	id := m.nextTareaID
	m.nextTareaID++

	estado := EstadoTareaPendiente
	if t.Estado != "" {
		estado = t.Estado
	}

	nueva := &Tarea{
		ID:          id,
		TipoID:      t.TipoID,
		ClienteID:   t.ClienteID,
		Titulo:      strings.TrimSpace(t.Titulo),
		Descripcion: t.Descripcion,
		AsignadoA:   t.AsignadoA,
		CreadoPor:   t.CreadoPor,
		Estado:      estado,
		FechaLimite: t.FechaLimite,
		Cantidad:    t.Cantidad,
		CreadaEn:    time.Now(),
	}
	m.tareas[id] = nueva
	return m.clonarTareaLocked(nueva), nil
}

func (m *MemoryStore) ObtenerTareaPorID(ctx context.Context, id int64) (*Tarea, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	t, ok := m.tareas[id]
	if !ok {
		return nil, ErrNotFound
	}
	return m.clonarTareaLocked(t), nil
}

func (m *MemoryStore) ListarTareas(ctx context.Context, filtro FiltroTareas) ([]*Tarea, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var res []*Tarea
	for _, t := range m.tareas {
		if filtro.Estado != nil && t.Estado != *filtro.Estado {
			continue
		}
		if filtro.AsignadoA != nil && t.AsignadoA != *filtro.AsignadoA {
			continue
		}
		if filtro.ClienteID != nil {
			if t.ClienteID == nil || *t.ClienteID != *filtro.ClienteID {
				continue
			}
		}
		res = append(res, m.clonarTareaLocked(t))
	}

	// Orden por CreadaEn desc
	sort.Slice(res, func(i, j int) bool {
		return res[i].CreadaEn.After(res[j].CreadaEn)
	})
	return res, nil
}

func (m *MemoryStore) ContarTareasPorRevisar(ctx context.Context) (int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	count := 0
	for _, t := range m.tareas {
		if t.Estado == EstadoTareaHecha {
			count++
		}
	}
	return count, nil
}

func (m *MemoryStore) MarcarTareaHecha(ctx context.Context, id int64, asignadoID string, nota *string, cantidad *int) (*Tarea, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	t, ok := m.tareas[id]
	if !ok {
		return nil, ErrNotFound
	}
	if t.AsignadoA != asignadoID {
		return nil, ErrForbidden
	}
	if t.Estado != EstadoTareaPendiente && t.Estado != EstadoTareaRechazada {
		return nil, fmt.Errorf("%w: la tarea no está en estado pendiente ni rechazada", ErrValidation)
	}

	tipo := m.tiposTrabajo[t.TipoID]
	if tipo != nil && tipo.Unidad == "minuto" {
		if cantidad == nil || *cantidad < 1 || *cantidad > 1440 {
			return nil, fmt.Errorf("%w: los minutos deben estar entre 1 y 1440", ErrValidation)
		}
		t.Cantidad = cantidad
	} else {
		t.Cantidad = nil
	}

	if nota != nil {
		if len(*nota) > 500 {
			return nil, ErrValidation
		}
		t.NotaPersona = nota
	}

	ahora := time.Now()
	t.Estado = EstadoTareaHecha
	t.HechaEn = &ahora
	t.MotivoRechazo = nil // Se limpia motivo al volver a entregar

	return m.clonarTareaLocked(t), nil
}

func (m *MemoryStore) AceptarTarea(ctx context.Context, id int64, adminID string, cantidad *int) (*Tarea, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	admin, ok := m.perfiles[adminID]
	if !ok || !admin.EsAdmin {
		return nil, ErrForbidden
	}

	t, ok := m.tareas[id]
	if !ok {
		return nil, ErrNotFound
	}
	if t.Estado != EstadoTareaHecha {
		return nil, fmt.Errorf("%w: solo se pueden aceptar tareas en estado hecha", ErrValidation)
	}

	tipo, ok := m.tiposTrabajo[t.TipoID]
	if !ok {
		return nil, ErrValidation
	}

	var cantAceptada int
	if tipo.Unidad == "minuto" {
		if cantidad != nil {
			cantAceptada = *cantidad
		} else if t.Cantidad != nil {
			cantAceptada = *t.Cantidad
		} else {
			return nil, fmt.Errorf("%w: la cantidad de minutos es requerida", ErrValidation)
		}
		if cantAceptada < 1 || cantAceptada > 1440 {
			return nil, fmt.Errorf("%w: los minutos deben estar entre 1 y 1440", ErrValidation)
		}
	} else {
		cantAceptada = 1
	}

	// Buscar o abrir factura abierta para la persona
	var factAbierta *Factura
	for _, f := range m.facturas {
		if f.PerfilID == t.AsignadoA && f.Estado == EstadoFacturaAbierta {
			factAbierta = f
			break
		}
	}

	ahora := time.Now()
	if factAbierta == nil {
		fID := m.nextFactID
		m.nextFactID++
		factAbierta = &Factura{
			ID:       fID,
			PerfilID: t.AsignadoA,
			Estado:   EstadoFacturaAbierta,
			CreadaEn: ahora,
		}
		m.facturas[fID] = factAbierta
	}

	unit := int64(tipo.Precio)
	total := int64(tipo.Precio) * int64(cantAceptada)
	t.Estado = EstadoTareaAceptada
	t.CantidadAceptada = &cantAceptada
	t.PrecioUnitarioCongelado = &unit
	t.PrecioCongelado = &total
	t.FacturaID = &factAbierta.ID
	t.ResueltaEn = &ahora
	t.ResueltaPor = &adminID

	return m.clonarTareaLocked(t), nil
}

func (m *MemoryStore) RechazarTarea(ctx context.Context, id int64, adminID string, motivo string) (*Tarea, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	admin, ok := m.perfiles[adminID]
	if !ok || !admin.EsAdmin {
		return nil, ErrForbidden
	}

	motivoLimpio := strings.TrimSpace(motivo)
	if motivoLimpio == "" || len(motivoLimpio) > 500 {
		return nil, fmt.Errorf("%w: el motivo de rechazo es obligatorio (hasta 500 caracteres)", ErrValidation)
	}

	t, ok := m.tareas[id]
	if !ok {
		return nil, ErrNotFound
	}
	if t.Estado != EstadoTareaHecha {
		return nil, fmt.Errorf("%w: solo se pueden rechazar tareas en estado hecha", ErrValidation)
	}

	ahora := time.Now()
	t.Estado = EstadoTareaRechazada
	t.MotivoRechazo = &motivoLimpio
	t.ResueltaEn = &ahora
	t.ResueltaPor = &adminID

	return m.clonarTareaLocked(t), nil
}

func (m *MemoryStore) CancelarTarea(ctx context.Context, id int64, adminID string) (*Tarea, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	admin, ok := m.perfiles[adminID]
	if !ok || !admin.EsAdmin {
		return nil, ErrForbidden
	}

	t, ok := m.tareas[id]
	if !ok {
		return nil, ErrNotFound
	}
	if t.Estado != EstadoTareaPendiente && t.Estado != EstadoTareaRechazada {
		return nil, fmt.Errorf("%w: solo se pueden cancelar tareas en estado pendiente o rechazada", ErrValidation)
	}

	ahora := time.Now()
	t.Estado = EstadoTareaCancelada
	t.ResueltaEn = &ahora
	t.ResueltaPor = &adminID

	return m.clonarTareaLocked(t), nil
}

// ==========================================
// F2: Implementación Facturas
// ==========================================

func (m *MemoryStore) hidratarFacturaLocked(f *Factura) *Factura {
	if f == nil {
		return nil
	}
	cp := *f
	if p, ok := m.perfiles[f.PerfilID]; ok {
		cp.Perfil = m.clonarPerfilLocked(p)
	}

	var lineas []*Tarea
	var total int64 = 0
	for _, t := range m.tareas {
		if t.FacturaID != nil && *t.FacturaID == f.ID && t.Estado == EstadoTareaAceptada {
			lineas = append(lineas, m.clonarTareaLocked(t))
			if t.PrecioCongelado != nil {
				total += *t.PrecioCongelado
			}
		}
	}
	sort.Slice(lineas, func(i, j int) bool {
		return lineas[i].ID < lineas[j].ID
	})
	cp.Lineas = lineas
	cp.Total = total
	return &cp
}

func (m *MemoryStore) ObtenerFacturaAbierta(ctx context.Context, perfilID string) (*Factura, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, f := range m.facturas {
		if f.PerfilID == perfilID && f.Estado == EstadoFacturaAbierta {
			return m.hidratarFacturaLocked(f), nil
		}
	}
	return nil, ErrNotFound
}

func (m *MemoryStore) ListarFacturasPerfil(ctx context.Context, perfilID string) ([]*Factura, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var res []*Factura
	for _, f := range m.facturas {
		if f.PerfilID == perfilID {
			res = append(res, m.hidratarFacturaLocked(f))
		}
	}
	sort.Slice(res, func(i, j int) bool {
		return res[i].CreadaEn.After(res[j].CreadaEn)
	})
	return res, nil
}

func (m *MemoryStore) ObtenerFacturaPorID(ctx context.Context, id int64) (*Factura, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	f, ok := m.facturas[id]
	if !ok {
		return nil, ErrNotFound
	}
	return m.hidratarFacturaLocked(f), nil
}

func (m *MemoryStore) ListarResumenFacturasAdmin(ctx context.Context) ([]*ResumenFacturasPersona, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Obtener todos los perfiles aprobados
	var personas []*Perfil
	for _, p := range m.perfiles {
		if p.Estado == EstadoAprobado && !p.EsAdmin {
			personas = append(personas, m.clonarPerfilLocked(p))
		}
	}
	sort.Slice(personas, func(i, j int) bool {
		return personas[i].Nombre < personas[j].Nombre
	})

	var res []*ResumenFacturasPersona
	for _, p := range personas {
		item := &ResumenFacturasPersona{
			PerfilID: p.ID,
			Perfil:   p,
			Pagadas:  make([]*Factura, 0),
		}

		for _, f := range m.facturas {
			if f.PerfilID == p.ID {
				hf := m.hidratarFacturaLocked(f)
				if f.Estado == EstadoFacturaAbierta {
					item.FacturaAbierta = hf
					item.TotalPendiente = hf.Total
				} else if f.Estado == EstadoFacturaPagada {
					item.Pagadas = append(item.Pagadas, hf)
					item.TotalPagado += hf.Total
				}
			}
		}
		sort.Slice(item.Pagadas, func(i, j int) bool {
			return item.Pagadas[i].CreadaEn.After(item.Pagadas[j].CreadaEn)
		})
		res = append(res, item)
	}

	return res, nil
}

func (m *MemoryStore) MarcarFacturaPagada(ctx context.Context, id int64, adminID string) (*Factura, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	admin, ok := m.perfiles[adminID]
	if !ok || !admin.EsAdmin {
		return nil, ErrForbidden
	}

	f, ok := m.facturas[id]
	if !ok {
		return nil, ErrNotFound
	}
	if f.Estado != EstadoFacturaAbierta {
		return nil, fmt.Errorf("%w: solo se puede marcar pagada una factura abierta", ErrValidation)
	}

	ahora := time.Now()
	f.Estado = EstadoFacturaPagada
	f.PagadaEn = &ahora
	f.PagadaPor = &adminID

	return m.hidratarFacturaLocked(f), nil
}

// ==========================================
// F3: Implementación Estadísticas
// ==========================================

func (m *MemoryStore) ObtenerEstadisticasYo(ctx context.Context, perfilID string, filtro FiltroEstadisticasYo) (*EstadisticasYoResponse, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var tareas []*Tarea
	for _, t := range m.tareas {
		if t.AsignadoA == perfilID && t.Estado == EstadoTareaAceptada {
			tareas = append(tareas, m.clonarTareaLocked(t))
		}
	}

	tiposMap := make(map[int]*TipoTrabajo)
	for id, tp := range m.tiposTrabajo {
		tiposMap[id] = m.clonarTipoTrabajoLocked(tp)
	}

	return CalcularEstadisticasYo(perfilID, tareas, tiposMap, filtro, time.Now()), nil
}

func (m *MemoryStore) ObtenerEstadisticasAdmin(ctx context.Context, filtro FiltroEstadisticasAdmin) (*EstadisticasAdminResponse, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var tareas []*Tarea
	for _, t := range m.tareas {
		if t.Estado == EstadoTareaAceptada {
			tareas = append(tareas, m.clonarTareaLocked(t))
		}
	}

	perfilesMap := make(map[string]*Perfil)
	for id, p := range m.perfiles {
		perfilesMap[id] = m.clonarPerfilLocked(p)
	}

	clientesMap := make(map[int]*Cliente)
	for id, c := range m.clientes {
		clientesMap[id] = m.clonarClienteLocked(c)
	}

	tiposMap := make(map[int]*TipoTrabajo)
	for id, tp := range m.tiposTrabajo {
		tiposMap[id] = m.clonarTipoTrabajoLocked(tp)
	}

	return CalcularEstadisticasAdmin(tareas, perfilesMap, clientesMap, tiposMap, filtro), nil
}
