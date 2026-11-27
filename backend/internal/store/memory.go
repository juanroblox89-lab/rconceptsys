package store

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

type MemoryStore struct {
	oauthDrive       map[string]EstadoDriveOAuth
	apariencias      map[string]Apariencia
	mediosApariencia map[string][]byte
	ria              *memoriaRIA
	mu               sync.RWMutex
	perfiles         map[string]*Perfil
	roles            map[int]*Rol
	perfilRoles      map[string]map[int]bool // perfil_id -> set de rol_id
	mensajes         []*ChatMensaje
	nextRolID        int
	nextMsgID        int64
	avatares         map[string][]byte

	// F2 y F3: Clientes, tipos de trabajo, tareas, facturas
	clientes        map[int]*Cliente
	nextClienteID   int
	tiposTrabajo    map[int]*TipoTrabajo
	nextTipoID      int
	tareas          map[int64]*Tarea
	nextTareaID     int64
	entregasTareas  map[int64][]*EntregaTarea
	nextEntregaID   int64
	historialTareas map[int64][]*TareaHistorialItem
	nextHistorialID int64
	facturas        map[int64]*Factura
	nextFactID      int64

	// F5: equipo, adjuntos del chat, asignaciones, Drive, piezas, cortes y push
	equipo             ConfigEquipo
	enlaces            map[int]*EnlaceEquipo
	nextEnlaceID       int
	adjuntos           map[int64]*ChatAdjunto
	archivosAdjuntos   map[int64][]byte
	nextAdjuntoID      int64
	asignacionesVistas map[string]map[int64]time.Time
	conexionDrive      *ConexionDrive
	piezas             map[int]*Pieza
	nextPiezaID        int
	cortes             map[int64]*Corte
	nextCorteID        int64
	suscripcionesPush  map[int64]*SuscripcionPush
	nextPushID         int64
	avisosEnviados     map[string]bool
	notificaciones     *memoriaNotificaciones
	adjuntosAsignacion map[string]*AdjuntoAsignacion
	objetosAsignacion  map[string][]byte
}

func NewMemoryStore() *MemoryStore {
	m := &MemoryStore{
		perfiles:        make(map[string]*Perfil),
		roles:           make(map[int]*Rol),
		perfilRoles:     make(map[string]map[int]bool),
		mensajes:        make([]*ChatMensaje, 0),
		nextRolID:       4,
		nextMsgID:       1,
		avatares:        make(map[string][]byte),
		clientes:        make(map[int]*Cliente),
		nextClienteID:   1,
		tiposTrabajo:    make(map[int]*TipoTrabajo),
		nextTipoID:      4,
		tareas:          make(map[int64]*Tarea),
		nextTareaID:     1,
		entregasTareas:  make(map[int64][]*EntregaTarea),
		nextEntregaID:   1,
		historialTareas: make(map[int64][]*TareaHistorialItem),
		nextHistorialID: 1,
		facturas:        make(map[int64]*Factura),
		nextFactID:      1,
		equipo: ConfigEquipo{
			Nombre:      "RConcept Systems",
			Descripcion: "Producción de contenido para clientes: grabación, edición y publicación.",
			Enlaces:     []*EnlaceEquipo{},
		},
		enlaces:            make(map[int]*EnlaceEquipo),
		nextEnlaceID:       1,
		adjuntos:           make(map[int64]*ChatAdjunto),
		archivosAdjuntos:   make(map[int64][]byte),
		nextAdjuntoID:      1,
		asignacionesVistas: make(map[string]map[int64]time.Time),
		piezas:             make(map[int]*Pieza),
		nextPiezaID:        1,
		cortes:             make(map[int64]*Corte),
		nextCorteID:        1,
		suscripcionesPush:  make(map[int64]*SuscripcionPush),
		nextPushID:         1,
		avisosEnviados:     make(map[string]bool),
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
	m.tiposTrabajo[1] = &TipoTrabajo{ID: 1, Clave: "grabacion_video", Nombre: "Grabación de video", RolID: &rolCam, Precio: 1500, Unidad: "minuto", Activo: true, Orden: 1, CreadoEn: ahora}
	m.tiposTrabajo[2] = &TipoTrabajo{ID: 2, Clave: "edicion_video", Nombre: "Edición de video", RolID: &rolEd, Precio: 75000, Unidad: "trabajo", Activo: true, Orden: 2, CreadoEn: ahora}
	m.tiposTrabajo[3] = &TipoTrabajo{ID: 3, Clave: "subida_video", Nombre: "Subir video", RolID: &rolSub, Precio: 25000, Unidad: "trabajo", Activo: true, Orden: 3, CreadoEn: ahora}

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
				cpMsg.Adjuntos = m.adjuntosDeMensajeLocked(msg.ID)
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
		cpMsg.Adjuntos = m.adjuntosDeMensajeLocked(msg.ID)
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
	if len([]rune(c)) > 2000 {
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

func (m *MemoryStore) clonarMensajeChatLocked(msg *ChatMensaje, conservarBorrado bool) *ChatMensaje {
	cp := *msg
	if !conservarBorrado {
		cp.BorradoEn = nil
	}
	cp.Adjuntos = m.adjuntosDeMensajeLocked(msg.ID)
	if !msg.EsRIA {
		if autor := m.perfiles[msg.AutorID]; autor != nil {
			cp.Autor = m.clonarPerfilLocked(autor)
		}
	}
	return &cp
}

func (m *MemoryStore) ObtenerMensajeChatPorID(_ context.Context, id int64, incluirBorrado bool) (*ChatMensaje, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, msg := range m.mensajes {
		if msg.ID == id {
			if !incluirBorrado && msg.BorradoEn != nil {
				return nil, ErrNotFound
			}
			return m.clonarMensajeChatLocked(msg, incluirBorrado), nil
		}
	}
	return nil, ErrNotFound
}

func (m *MemoryStore) EditarMensajeChat(_ context.Context, id int64, autorID string, cuerpo string) (*ChatMensaje, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, msg := range m.mensajes {
		if msg.ID != id {
			continue
		}
		if msg.BorradoEn != nil {
			return nil, ErrNotFound
		}
		if msg.EsRIA || msg.AutorID != autorID {
			return nil, ErrForbidden
		}
		c := strings.TrimSpace(cuerpo)
		long := len([]rune(c))
		adjuntos := m.adjuntosDeMensajeLocked(msg.ID)
		if long > 2000 || (long == 0 && len(adjuntos) == 0) {
			return nil, ErrValidation
		}
		ahora := time.Now()
		msg.Cuerpo = c
		msg.EditadoEn = &ahora
		return m.clonarMensajeChatLocked(msg, false), nil
	}
	return nil, ErrNotFound
}

func (m *MemoryStore) EliminarMensajeChat(_ context.Context, id int64, actorID string, esAdmin bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, msg := range m.mensajes {
		if msg.ID != id {
			continue
		}
		if msg.BorradoEn != nil {
			return ErrNotFound
		}
		if !esAdmin && (msg.EsRIA || msg.AutorID != actorID) {
			return ErrForbidden
		}
		ahora := time.Now()
		msg.BorradoEn = &ahora
		return nil
	}
	return ErrNotFound
}

func (m *MemoryStore) RestaurarMensajeChat(_ context.Context, id int64, actorID string, esAdmin bool, ventana time.Duration) (*ChatMensaje, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, msg := range m.mensajes {
		if msg.ID != id {
			continue
		}
		if msg.BorradoEn == nil {
			return nil, ErrNotFound
		}
		if !esAdmin && (msg.EsRIA || msg.AutorID != actorID) {
			return nil, ErrForbidden
		}
		if time.Since(*msg.BorradoEn) > ventana {
			return nil, ErrConflict
		}
		msg.BorradoEn = nil
		return m.clonarMensajeChatLocked(msg, false), nil
	}
	return nil, ErrNotFound
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
	cp.DriveReferencias = append([]ReferenciaDrive{}, ReferenciasDeCliente(c.DriveReferencias, c.DriveReferenciaID, c.DriveReferenciaNombre, c.DriveReferenciaURL)...)
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

	if v, exists := campos["paquete"]; exists {
		if s, ok := v.(string); ok {
			sLimpio := strings.TrimSpace(s)
			if len(sLimpio) > 80 {
				return nil, ErrValidation
			}
			if sLimpio == "" {
				c.Paquete = nil
			} else {
				c.Paquete = &sLimpio
			}
		} else if v == nil {
			c.Paquete = nil
		} else {
			return nil, ErrValidation
		}
	}

	if v, exists := campos["drive_url"]; exists {
		if s, ok := v.(string); ok {
			sLimpio := strings.TrimSpace(s)
			if len(sLimpio) > 500 {
				return nil, ErrValidation
			}
			if sLimpio == "" {
				c.DriveURL = nil
			} else {
				c.DriveURL = &sLimpio
			}
		} else if v == nil {
			c.DriveURL = nil
		} else {
			return nil, ErrValidation
		}
	}

	if v, exists := campos["notas"]; exists {
		if s, ok := v.(string); ok {
			sLimpio := strings.TrimSpace(s)
			if len([]rune(sLimpio)) > 1000 {
				return nil, ErrValidation
			}
			if sLimpio == "" {
				c.Notas = nil
			} else {
				c.Notas = &sLimpio
			}
		} else if v == nil {
			c.Notas = nil
		} else {
			return nil, ErrValidation
		}
	}

	if v, ok := campos["drive_referencias"]; ok {
		lista, tipoOK := v.([]ReferenciaDrive)
		if !tipoOK {
			return nil, ErrValidation
		}
		c.DriveReferencias = append([]ReferenciaDrive{}, lista...)
	}
	for clave, destino := range map[string]**string{"foto_url": &c.FotoURL, "drive_referencia_id": &c.DriveReferenciaID, "drive_referencia_nombre": &c.DriveReferenciaNombre, "drive_referencia_url": &c.DriveReferenciaURL, "drive_carpeta_id": &c.DriveCarpetaID, "material_carpeta_id": &c.MaterialCarpetaID, "producto_carpeta_id": &c.ProductoCarpetaID} {
		if v, ok := campos[clave]; ok {
			if v == nil {
				*destino = nil
			} else if texto, ok := v.(string); ok {
				*destino = &texto
			} else {
				return nil, ErrValidation
			}
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
	cp.EntregaDrive = append([]ReferenciaDriveTrabajo(nil), t.EntregaDrive...)
	if t.DriveReferencias != nil {
		cp.DriveReferencias = append([]ReferenciaDriveTrabajo{}, t.DriveReferencias...)
	}
	if tipo, ok := m.tiposTrabajo[t.TipoID]; ok {
		cp.Tipo = m.clonarTipoTrabajoLocked(tipo)
	}
	if t.ClienteID != nil {
		if cli, ok := m.clientes[*t.ClienteID]; ok {
			cp.Cliente = m.clonarClienteLocked(cli)
		}
	}
	if t.PiezaID != nil {
		if p, ok := m.piezas[*t.PiezaID]; ok {
			cp.Pieza = &PiezaCorta{ID: p.ID, Nombre: p.Nombre, Etapa: p.Etapa}
		}
	}
	if asig, ok := m.perfiles[t.AsignadoA]; ok {
		cp.Asignado = m.clonarPerfilLocked(asig)
	}
	if creador, ok := m.perfiles[t.CreadoPor]; ok {
		cp.Creador = m.clonarPerfilLocked(creador)
	}
	if t.Estado == EstadoTareaPendiente || t.Estado == EstadoTareaRechazada {
		if entregas := m.entregasTareas[t.ID]; len(entregas) > 0 {
			ultima := entregas[len(entregas)-1]
			if ultima.PerfilID == t.AsignadoA && (ultima.Estado == "retirada" || ultima.Estado == "rechazada") {
				copiaEntrega := *ultima
				copiaEntrega.EntregaDrive = append([]ReferenciaDriveTrabajo(nil), ultima.EntregaDrive...)
				cp.BorradorEntrega = &copiaEntrega
			}
		}
	}
	if t.Estado == EstadoTareaRechazada {
		if hist := m.historialTareas[t.ID]; len(hist) > 0 {
			for i := len(hist) - 1; i >= 0; i-- {
				h := hist[i]
				if h.Evento == "entrega_rechazada" {
					motivo := ""
					if h.Motivo != nil {
						motivo = *h.Motivo
					}
					cp.RechazoActual = &RechazoEvento{
						HistorialID:   h.ID,
						Motivo:        motivo,
						DriveAdjuntos: append([]ReferenciaDriveTrabajo{}, h.DriveAdjuntos...),
						Adjuntos:      m.vistaAdjuntosRechazoLocked(t.ID, h.ID),
						CreadoEn:      h.CreadoEn,
					}
					break
				}
			}
		}
	}
	return &cp
}

func (m *MemoryStore) vistaAdjuntosRechazoLocked(tareaID, historialID int64) []*VistaAdjuntoTarea {
	var lista []*AdjuntoAsignacion
	for _, a := range m.adjuntosAsignacion {
		if a.TareaID == tareaID && a.Origen == "rechazo" && a.HistorialID != nil && *a.HistorialID == historialID && a.EstadoArchivo == "listo" {
			lista = append(lista, a)
		}
	}
	if len(lista) == 0 {
		return nil
	}
	sort.Slice(lista, func(i, j int) bool { return lista[i].Cupo < lista[j].Cupo })
	out := make([]*VistaAdjuntoTarea, 0, len(lista))
	for _, a := range lista {
		out = append(out, &VistaAdjuntoTarea{
			ID:            a.ID,
			Tipo:          a.Tipo,
			Nombre:        a.Nombre,
			Tamano:        a.Tamano,
			Mime:          a.Mime,
			DuracionMS:    a.DuracionMS,
			Resumir:       a.Resumir,
			EstadoResumen: a.EstadoResumen,
			Resumen:       append([]string{}, a.Resumen...),
			Transcripcion: a.Transcripcion,
			ErrorResumen:  a.ErrorResumen,
		})
	}
	return out
}

// ContarLetrasDigitos cuenta letras y dígitos (unicode) de un texto.
func ContarLetrasDigitos(s string) int {
	n := 0
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			n++
		}
	}
	return n
}

func (m *MemoryStore) CrearTarea(ctx context.Context, t *Tarea) (*Tarea, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if t == nil || strings.TrimSpace(t.Titulo) == "" || len(t.Titulo) > 120 {
		return nil, ErrValidation
	}
	if ContarLetrasDigitos(t.Titulo) < 3 {
		return nil, fmt.Errorf("%w: el aviso debe tener al menos 3 letras o números", ErrValidation)
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

	// Pieza opcional: debe existir
	if t.PiezaID != nil {
		if _, ok := m.piezas[*t.PiezaID]; !ok {
			return nil, fmt.Errorf("%w: la pieza especificada no existe", ErrValidation)
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
		ID:              id,
		TipoID:          t.TipoID,
		ClienteID:       t.ClienteID,
		PiezaID:         t.PiezaID,
		Titulo:          strings.TrimSpace(t.Titulo),
		Descripcion:     t.Descripcion,
		AsignadoA:       t.AsignadoA,
		CreadoPor:       t.CreadoPor,
		AsignadorID:     &t.CreadoPor,
		Estado:          estado,
		FechaLimite:     t.FechaLimite,
		Cantidad:        t.Cantidad,
		DriveCarpetaID:  t.DriveCarpetaID,
		DriveCarpetaURL: t.DriveCarpetaURL,
		CreadaEn:        time.Now(),
	}
	if t.DriveReferencias != nil {
		nueva.DriveReferencias = append([]ReferenciaDriveTrabajo{}, t.DriveReferencias...)
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
		if filtro.ConCarpetaDrive && t.DriveCarpetaID == nil {
			continue
		}
		res = append(res, m.clonarTareaLocked(t))
	}

	// Orden por CreadaEn desc
	sort.Slice(res, func(i, j int) bool {
		if res[i].CreadaEn.Equal(res[j].CreadaEn) {
			return res[i].ID > res[j].ID
		}
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

func (m *MemoryStore) MarcarTareaHecha(ctx context.Context, id int64, asignadoID string, nota *string, cantidad *int, enlaceMedios *string) (*Tarea, error) {
	return m.EntregarTarea(ctx, id, asignadoID, EntregaInput{
		Nota:         nota,
		Cantidad:     cantidad,
		EnlaceMedios: enlaceMedios,
	})
}

func (m *MemoryStore) EntregarTarea(ctx context.Context, id int64, asignadoID string, entrada EntregaInput) (*Tarea, error) {
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
		if entrada.Cantidad == nil || *entrada.Cantidad < 1 || *entrada.Cantidad > 1440 {
			return nil, fmt.Errorf("%w: los minutos deben estar entre 1 y 1440", ErrValidation)
		}
		cant := *entrada.Cantidad
		t.Cantidad = &cant
	} else {
		t.Cantidad = nil
	}

	var notaLimpia *string
	if entrada.Nota != nil {
		tr := strings.TrimSpace(*entrada.Nota)
		if utf8.RuneCountInString(tr) > 500 {
			return nil, ErrValidation
		}
		if tr != "" {
			notaLimpia = &tr
		}
	}
	t.NotaPersona = notaLimpia

	metodo := strings.ToLower(strings.TrimSpace(entrada.Metodo))
	var enlaceLimpio, nombreLimpio, tipoEntregaLimpio *string
	if entrada.EnlaceMedios != nil {
		tr := strings.TrimSpace(*entrada.EnlaceMedios)
		if tr != "" {
			enlaceLimpio = &tr
		}
	}
	if entrada.EntregaNombre != nil {
		tr := strings.TrimSpace(*entrada.EntregaNombre)
		if tr != "" {
			r := []rune(tr)
			if len(r) > 200 {
				tr = string(r[:200])
			}
			nombreLimpio = &tr
		}
	}
	if entrada.EntregaTipo != nil {
		tr := strings.ToLower(strings.TrimSpace(*entrada.EntregaTipo))
		if tr == "carpeta" || tr == "archivo" {
			tipoEntregaLimpio = &tr
		} else if tr != "" {
			return nil, ErrValidation
		}
	}

	if metodo == "" && enlaceLimpio != nil {
		metodo = "drive"
	}

	var detalle string
	var metodoPtr *string
	switch metodo {
	case "whatsapp":
		mp := "whatsapp"
		metodoPtr = &mp
		enlaceLimpio = nil
		nombreLimpio = nil
		tipoEntregaLimpio = nil
		detalle = "Entrega enviada por WhatsApp"
	case "drive":
		mp := "drive"
		metodoPtr = &mp
		detalle = "Entrega enviada por Drive"
	case "":
		detalle = "Entrega enviada a revisión"
	default:
		return nil, fmt.Errorf("%w: método de entrega inválido", ErrValidation)
	}

	t.EntregaDrive = nil
	if metodo == "drive" {
		t.EntregaDrive = append([]ReferenciaDriveTrabajo(nil), entrada.EntregaDrive...)
	}
	t.MetodoEntrega = metodoPtr
	t.EnlaceMedios = enlaceLimpio
	t.EntregaNombre = nombreLimpio
	t.EntregaTipo = tipoEntregaLimpio

	ahora := time.Now()
	t.Estado = EstadoTareaHecha
	t.HechaEn = &ahora
	t.MotivoRechazo = nil // Se limpia motivo al volver a entregar

	if m.entregasTareas == nil {
		m.entregasTareas = make(map[int64][]*EntregaTarea)
	}
	if m.nextEntregaID == 0 {
		m.nextEntregaID = 1
	}
	for _, previa := range m.entregasTareas[id] {
		if previa.Estado == "activa" {
			previa.Estado = "reemplazada"
		}
	}
	eid := m.nextEntregaID
	m.nextEntregaID++
	entrega := &EntregaTarea{
		ID:            eid,
		TareaID:       id,
		PerfilID:      asignadoID,
		Metodo:        metodo,
		EnlaceMedios:  enlaceLimpio,
		EntregaNombre: nombreLimpio,
		EntregaTipo:   tipoEntregaLimpio,
		EntregaDrive:  t.EntregaDrive,
		Nota:          notaLimpia,
		Cantidad:      t.Cantidad,
		Estado:        "activa",
		CreadaEn:      ahora,
	}
	m.entregasTareas[id] = append(m.entregasTareas[id], entrega)

	m.registrarHistorialLocked(id, &asignadoID, "entrega_enviada", detalle, func(h *TareaHistorialItem) {
		h.MetodoEntrega = metodoPtr
		h.EnlaceMedios = enlaceLimpio
		h.EntregaNombre = nombreLimpio
		h.EntregaTipo = tipoEntregaLimpio
		h.EntregaDrive = t.EntregaDrive
		h.Nota = notaLimpia
		h.Cantidad = t.Cantidad
		h.CreadoEn = ahora
	})

	return m.clonarTareaLocked(t), nil
}

func (m *MemoryStore) registrarHistorialLocked(tareaID int64, actorID *string, evento, detalle string, configurar func(*TareaHistorialItem)) *TareaHistorialItem {
	if m.historialTareas == nil {
		m.historialTareas = make(map[int64][]*TareaHistorialItem)
	}
	if m.nextHistorialID == 0 {
		m.nextHistorialID = 1
	}
	hid := m.nextHistorialID
	m.nextHistorialID++
	item := &TareaHistorialItem{
		ID:       hid,
		TareaID:  tareaID,
		ActorID:  actorID,
		Evento:   evento,
		Detalle:  detalle,
		CreadoEn: time.Now(),
	}
	if actorID != nil {
		if p, ok := m.perfiles[*actorID]; ok {
			item.ActorNombre = p.Nombre
		}
	}
	if configurar != nil {
		configurar(item)
	}
	m.historialTareas[tareaID] = append(m.historialTareas[tareaID], item)
	return item
}

func (m *MemoryStore) RevertirEntregaTarea(ctx context.Context, id int64, asignadoID string) (*ResultadoReversionEntrega, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	t, ok := m.tareas[id]
	if !ok {
		return nil, ErrNotFound
	}
	if t.AsignadoA != asignadoID {
		return nil, ErrForbidden
	}
	if t.Estado != EstadoTareaHecha {
		return nil, fmt.Errorf("%w:estado:%s", ErrConflict, t.Estado)
	}

	ahora := time.Now()
	hechaAnterior := t.HechaEn

	var retirada *EntregaTarea
	for i := len(m.entregasTareas[id]) - 1; i >= 0; i-- {
		e := m.entregasTareas[id][i]
		if e.Estado == "activa" {
			e.Estado = "retirada"
			e.RetiradaEn = &ahora
			retirada = e
			break
		}
	}
	if retirada == nil {
		if m.entregasTareas == nil {
			m.entregasTareas = make(map[int64][]*EntregaTarea)
		}
		if m.nextEntregaID == 0 {
			m.nextEntregaID = 1
		}
		eid := m.nextEntregaID
		m.nextEntregaID++
		metodo := ""
		if t.MetodoEntrega != nil {
			metodo = *t.MetodoEntrega
		}
		retirada = &EntregaTarea{
			ID:            eid,
			TareaID:       id,
			PerfilID:      asignadoID,
			Metodo:        metodo,
			EnlaceMedios:  t.EnlaceMedios,
			EntregaNombre: t.EntregaNombre,
			EntregaTipo:   t.EntregaTipo,
			EntregaDrive:  t.EntregaDrive,
			Nota:          t.NotaPersona,
			Cantidad:      t.Cantidad,
			Estado:        "retirada",
			CreadaEn:      ahora,
			RetiradaEn:    &ahora,
		}
		m.entregasTareas[id] = append(m.entregasTareas[id], retirada)
	}

	t.Estado = EstadoTareaPendiente
	t.HechaEn = nil
	t.MetodoEntrega = nil
	t.EnlaceMedios = nil
	t.EntregaNombre = nil
	t.EntregaTipo = nil
	t.EntregaDrive = nil
	t.NotaPersona = nil
	t.Cantidad = nil

	var metodoHist *string
	if retirada.Metodo != "" {
		mp := retirada.Metodo
		metodoHist = &mp
	}
	m.registrarHistorialLocked(id, &asignadoID, "entrega_retirada", "Entrega retirada por el trabajador", func(h *TareaHistorialItem) {
		h.MetodoEntrega = metodoHist
		h.EnlaceMedios = retirada.EnlaceMedios
		h.EntregaNombre = retirada.EntregaNombre
		h.EntregaTipo = retirada.EntregaTipo
		h.EntregaDrive = retirada.EntregaDrive
		h.Nota = retirada.Nota
		h.Cantidad = retirada.Cantidad
		h.CreadoEn = ahora
	})

	return &ResultadoReversionEntrega{
		Tarea:           m.clonarTareaLocked(t),
		HechaEnAnterior: hechaAnterior,
	}, nil
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

	for i := len(m.entregasTareas[id]) - 1; i >= 0; i-- {
		if m.entregasTareas[id][i].Estado == "activa" {
			m.entregasTareas[id][i].Estado = "aceptada"
			break
		}
	}
	m.registrarHistorialLocked(id, &adminID, "entrega_aceptada", "Entrega aprobada", func(h *TareaHistorialItem) {
		h.Cantidad = &cantAceptada
		h.CreadoEn = ahora
	})

	return m.clonarTareaLocked(t), nil
}

func (m *MemoryStore) PedirDeNuevoTarea(ctx context.Context, id int64, adminID string, motivo string) (*Tarea, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	admin, ok := m.perfiles[adminID]
	if !ok || !admin.EsAdmin || admin.Estado != EstadoAprobado {
		return nil, ErrForbidden
	}
	motivo = strings.TrimSpace(motivo)
	if utf8.RuneCountInString(motivo) > 500 {
		return nil, ErrValidation
	}
	t, ok := m.tareas[id]
	if !ok {
		return nil, ErrNotFound
	}
	if t.Estado != EstadoTareaAceptada {
		return nil, ErrConflict
	}
	if t.FacturaID != nil {
		if f := m.facturas[*t.FacturaID]; f != nil && f.Estado == EstadoFacturaPagada {
			return nil, ErrCortePagado
		}
	}

	// El panel de cortes guarda totales por persona y periodo, no IDs de tareas.
	if t.ResueltaEn != nil {
		fecha := t.ResueltaEn.In(time.Local).Format("2006-01-02")
		for _, c := range m.cortes {
			if fecha < c.Desde || fecha > c.Hasta || t.ResueltaEn.After(c.CreadoEn) {
				continue
			}
			for _, l := range c.Lineas {
				if l.PerfilID == t.AsignadoA && l.PagadaEn != nil {
					return nil, ErrCortePagado
				}
			}
		}
	}

	ahora := time.Now()
	entregas := m.entregasTareas[id]
	if len(entregas) > 0 {
		if e := entregas[len(entregas)-1]; e.Estado == "aceptada" || e.Estado == "activa" {
			e.Estado = "reabierta"
		}
	}
	m.registrarHistorialLocked(id, &adminID, "pedido_de_nuevo", "Se pidió rehacer", func(h *TareaHistorialItem) {
		if motivo != "" {
			h.Motivo = &motivo
		}
		h.CreadoEn = ahora
		// El evento conserva la entrega visible incluso en trabajos anteriores al historial.
		h.MetodoEntrega, h.EnlaceMedios, h.EntregaNombre, h.EntregaTipo = t.MetodoEntrega, t.EnlaceMedios, t.EntregaNombre, t.EntregaTipo
		h.Nota, h.Cantidad = t.NotaPersona, t.Cantidad
		h.EntregaDrive = t.EntregaDrive
	})
	t.Estado = EstadoTareaPendiente
	t.CantidadAceptada, t.PrecioUnitarioCongelado, t.PrecioCongelado = nil, nil, nil
	t.FacturaID, t.ResueltaEn, t.ResueltaPor, t.HechaEn = nil, nil, nil, nil
	t.MetodoEntrega, t.EnlaceMedios, t.EntregaNombre, t.EntregaTipo = nil, nil, nil, nil
	t.NotaPersona, t.Cantidad, t.MotivoRechazo = nil, nil, nil
	t.EntregaDrive = nil
	if hoy := ahora.In(LocBogota).Format("2006-01-02"); t.FechaLimite != nil && *t.FechaLimite < hoy {
		t.FechaLimite = &hoy
	}
	return m.clonarTareaLocked(t), nil
}

func (m *MemoryStore) RechazarTarea(ctx context.Context, id int64, adminID string, motivo string) (*Tarea, error) {
	return m.RechazarTareaConDetalle(ctx, id, adminID, motivo, nil)
}

func (m *MemoryStore) RechazarTareaConDetalle(ctx context.Context, id int64, adminID string, motivo string, driveAdjuntos []ReferenciaDriveTrabajo) (*Tarea, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	admin, ok := m.perfiles[adminID]
	if !ok || !admin.EsAdmin {
		return nil, ErrForbidden
	}

	motivoLimpio := strings.TrimSpace(motivo)
	if motivoLimpio == "" || utf8.RuneCountInString(motivoLimpio) > 500 {
		return nil, fmt.Errorf("%w: el motivo de rechazo es obligatorio (hasta 500 caracteres)", ErrValidation)
	}

	t, ok := m.tareas[id]
	if !ok {
		return nil, ErrNotFound
	}
	if t.Estado != EstadoTareaHecha {
		return nil, fmt.Errorf("%w: solo se pueden rechazar tareas en estado hecha (estado actual: %s)", ErrConflict, t.Estado)
	}

	ahora := time.Now()
	t.Estado = EstadoTareaRechazada
	t.MotivoRechazo = &motivoLimpio
	t.ResueltaEn = &ahora
	t.ResueltaPor = &adminID

	for i := len(m.entregasTareas[id]) - 1; i >= 0; i-- {
		if m.entregasTareas[id][i].Estado == "activa" {
			m.entregasTareas[id][i].Estado = "rechazada"
			break
		}
	}
	m.registrarHistorialLocked(id, &adminID, "entrega_rechazada", "Entrega devuelta con observaciones", func(h *TareaHistorialItem) {
		h.Motivo = &motivoLimpio
		if len(driveAdjuntos) > 0 {
			h.DriveAdjuntos = append([]ReferenciaDriveTrabajo{}, driveAdjuntos...)
		}
		h.CreadoEn = ahora
	})

	return m.clonarTareaLocked(t), nil
}

func (m *MemoryStore) ObtenerHistorialTarea(ctx context.Context, tareaID int64) ([]*TareaHistorialItem, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if _, ok := m.tareas[tareaID]; !ok {
		return nil, ErrNotFound
	}
	items := m.historialTareas[tareaID]
	out := make([]*TareaHistorialItem, 0, len(items))
	for _, h := range items {
		cp := *h
		cp.EntregaDrive = append([]ReferenciaDriveTrabajo(nil), h.EntregaDrive...)
		if h.DriveAdjuntos != nil {
			cp.DriveAdjuntos = append([]ReferenciaDriveTrabajo{}, h.DriveAdjuntos...)
		}
		if h.Evento == "entrega_rechazada" {
			cp.Adjuntos = m.vistaAdjuntosRechazoLocked(tareaID, h.ID)
		}
		if cp.ActorNombre == "" && h.ActorID != nil {
			if p, ok := m.perfiles[*h.ActorID]; ok {
				cp.ActorNombre = p.Nombre
			}
		}
		out = append(out, &cp)
	}
	return out, nil
}

func (m *MemoryStore) AdminsVieronTareaDesde(ctx context.Context, tareaID int64, desde *time.Time) ([]string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var admins []string
	for perfilID, vistas := range m.asignacionesVistas {
		p, ok := m.perfiles[perfilID]
		if !ok || !p.EsAdmin || p.Estado != EstadoAprobado {
			continue
		}
		vistoEn, ok := vistas[tareaID]
		if !ok {
			continue
		}
		if desde != nil && vistoEn.Before(*desde) {
			continue
		}
		admins = append(admins, perfilID)
	}
	return admins, nil
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

// SetResueltaEnParaPruebas permite a los tests fijar la fecha exacta de resolución
func (m *MemoryStore) SetResueltaEnParaPruebas(tareaID int64, t time.Time) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if tarea, ok := m.tareas[tareaID]; ok {
		tarea.ResueltaEn = &t
	}
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
