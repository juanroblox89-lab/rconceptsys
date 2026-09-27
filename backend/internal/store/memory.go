// Implementación en memoria de store.Store: modo demo (sin SUPABASE_URL).
// Mutex para uso concurrente; trae las 4 semillas demo con UUID estables para
// poder probar cada acceso con la cabecera X-Demo-User, más las 7 semillas
// de clientes F1 (BRIEF F1 §1) y una pieza demo con tareas para Breiner.
package store

import (
	"strings"
	"sync"

	"rconceptsys/backend/internal/cobros"
	"rconceptsys/backend/internal/produccion"
)

// UUID estables de las semillas demo (válidos como UUID v4).
const (
	SemillaDuenoID     = "11111111-1111-4111-8111-111111111111"
	SemillaAdminID     = "22222222-2222-4222-8222-222222222222"
	SemillaEquipoID    = "33333333-3333-4333-8333-333333333333"
	SemillaPendienteID = "44444444-4444-4434-8444-444444444444"
)

// UUID estables de los 7 clientes semilla F1 (BRIEF F1 §1: clientes reales
// de Rohlfing). El último dígito distingue cada cliente.
const (
	SemillaClienteVillaGrande = "c1000000-0000-4000-8000-000000000001"
	SemillaClientePlomeria    = "c1000000-0000-4000-8000-000000000002"
	SemillaClienteTizon       = "c1000000-0000-4000-8000-000000000003"
	SemillaClientePandeyucas  = "c1000000-0000-4000-8000-000000000004"
	SemillaClienteAsanarte    = "c1000000-0000-4000-8000-000000000005"
	SemillaClienteJerez       = "c1000000-0000-4000-8000-000000000006"
	SemillaClienteKantel      = "c1000000-0000-4000-8000-000000000007"
	SemillaPiezaDemoID        = "d2000000-0000-4000-8000-000000000001"
	SemillaTareaGrabDemoID    = "e3000000-0000-4000-8000-000000000001"
	SemillaTareaEdicionDemoID = "e3000000-0000-4000-8000-000000000002"
	SemillaTareaPublicaDemoID = "e3000000-0000-4000-8000-000000000003"
)

// Memoria es el store demo. eventos va del más reciente al más viejo.
type Memoria struct {
	mu       sync.RWMutex
	usuarios map[string]Usuario
	orden    []string
	eventos  []Evento
	// F1 producción
	clientes       map[string]produccion.Cliente
	ordenCli       []string
	piezas         map[string]produccion.Pieza
	ordenPieza     []string
	tareas         map[string]produccion.Tarea
	ordenTarea     []string
	tareaEventos   []produccion.TareaEvento
	notificaciones map[string]produccion.Notificacion
	// F2 cobros
	tarifas    map[string]cobros.Tarifa
	ordenTar   []string
	tramos     map[string]cobros.TarifaTramo
	paquetes   map[string]cobros.Paquete
	ordenPaq   []string
	lineas     map[string]cobros.LineaCobro
	ordenLin   []string
	cortes     map[string]cobros.Corte
	ordenCor   []string
	config     cobros.ConfigCobros
	tieneConf  bool
}

// NuevaMemoria crea el store demo con las 4 semillas F0: dueño Samuel (todos
// los oficios), admin Coord, equipo Breiner (grabación+edición) y un
// pendiente; más las 7 semillas de clientes F1 (§1) y una pieza demo de
// Villa Grande con grabación principal (Breiner, en curso) + edición
// (Breiner, bloqueada) + publicación (sin asignar, bloqueada).
func NuevaMemoria() *Memoria {
	m := &Memoria{
		usuarios:       map[string]Usuario{},
		clientes:       map[string]produccion.Cliente{},
		piezas:         map[string]produccion.Pieza{},
		tareas:         map[string]produccion.Tarea{},
		notificaciones: map[string]produccion.Notificacion{},
		tarifas:        map[string]cobros.Tarifa{},
		tramos:         map[string]cobros.TarifaTramo{},
		paquetes:       map[string]cobros.Paquete{},
		lineas:         map[string]cobros.LineaCobro{},
		cortes:         map[string]cobros.Corte{},
	}
	fija := "2026-09-26T12:00:00Z"
	m.poner(Usuario{ID: SemillaDuenoID, Nombre: "Samuel", Email: "samuel@demo.rconceptsys", Acceso: "dueno", Oficios: []string{"grabacion", "edicion", "diseno", "estrategia", "publicacion", "ventas"}, CreatedAt: fija, UpdatedAt: fija})
	m.poner(Usuario{ID: SemillaAdminID, Nombre: "Coord Admin", Email: "admin@demo.rconceptsys", Acceso: "admin", CreatedAt: fija, UpdatedAt: fija})
	m.poner(Usuario{ID: SemillaEquipoID, Nombre: "Breiner", Email: "breiner@demo.rconceptsys", Acceso: "equipo", Oficios: []string{"grabacion", "edicion"}, CreatedAt: fija, UpdatedAt: fija})
	m.poner(Usuario{ID: SemillaPendienteID, Nombre: "Nuevo Pendiente", Email: "pendiente@demo.rconceptsys", Acceso: "pendiente", CreatedAt: fija, UpdatedAt: fija})
	m.semillasF1(fija)
	m.semillasF2(fija)
	return m
}

// semillasF1 carga los 7 clientes reales + pieza demo. Sin mutex: solo la
// llama NuevaMemoria antes de publicar el store.
func (m *Memoria) semillasF1(fija string) {
	nombres := []struct {
		id, nombre, paquete string
	}{
		{SemillaClienteVillaGrande, "Villa Grande", "Mixto II"},
		{SemillaClientePlomeria, "Plomería Norte", "TV Basic"},
		{SemillaClienteTizon, "El Tizón Dorado", "Digital Inicial"},
		{SemillaClientePandeyucas, "Ricos Pandeyucas", "Digital Inicial"},
		{SemillaClienteAsanarte, "Asanarte Droguería", "Mixto II"},
		{SemillaClienteJerez, "El Jerez del Caballero", "TV Basic"},
		{SemillaClienteKantel, "Kantel", "Digital Inicial"},
	}
	for _, n := range nombres {
		m.clientes[n.id] = produccion.Cliente{
			ID: n.id, Nombre: n.nombre, Paquete: n.paquete,
			Estado:    produccion.ClienteActivo,
			CreatedAt: fija, UpdatedAt: fija, CreatedBy: SemillaDuenoID,
		}
		m.ordenCli = append(m.ordenCli, n.id)
	}
	m.piezas[SemillaPiezaDemoID] = produccion.Pieza{
		ID: SemillaPiezaDemoID, ClienteID: SemillaClienteVillaGrande,
		Titulo: "Reel demo — Villa Grande", Formato: "reel",
		Guion:         "Hook + demo (semilla F1)",
		FechaObjetivo: produccion.HoyMas(7),
		Estado:        produccion.PiezaEnProduccion,
		CreatedAt:     fija, UpdatedAt: fija, CreatedBy: SemillaDuenoID,
	}
	m.ordenPieza = append(m.ordenPieza, SemillaPiezaDemoID)
	grab := produccion.Tarea{
		ID: SemillaTareaGrabDemoID, PiezaID: SemillaPiezaDemoID,
		Etapa: produccion.EtapaGrabPrincipal, AsignadoID: SemillaEquipoID,
		Estado: produccion.TareaEnCurso, FechaLimite: produccion.HoyMas(2),
		CreatedAt: fija, UpdatedAt: fija, CreatedBy: SemillaDuenoID,
	}
	edi := produccion.Tarea{
		ID: SemillaTareaEdicionDemoID, PiezaID: SemillaPiezaDemoID,
		Etapa: produccion.EtapaEdicion, AsignadoID: SemillaEquipoID,
		Estado: produccion.TareaBloqueada, FechaLimite: produccion.HoyMas(5),
		CreatedAt: fija, UpdatedAt: fija, CreatedBy: SemillaDuenoID,
	}
	pub := produccion.Tarea{
		ID: SemillaTareaPublicaDemoID, PiezaID: SemillaPiezaDemoID,
		Etapa:  produccion.EtapaPublicacion,
		Estado: produccion.TareaBloqueada, FechaLimite: produccion.HoyMas(7),
		CreatedAt: fija, UpdatedAt: fija, CreatedBy: SemillaDuenoID,
	}
	m.tareas[grab.ID] = grab
	m.tareas[edi.ID] = edi
	m.tareas[pub.ID] = pub
	m.ordenTarea = append(m.ordenTarea, grab.ID, edi.ID, pub.ID)
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

// --- F1 producción (memoria) ---

func clonarCliente(c produccion.Cliente) produccion.Cliente { return c }
func clonarPieza(p produccion.Pieza) produccion.Pieza       { return p }

func clonarTarea(t produccion.Tarea) produccion.Tarea {
	out := t
	if t.Minutos != nil {
		v := *t.Minutos
		out.Minutos = &v
	}
	return out
}

func (m *Memoria) ListClientes(incluirArchivados bool) ([]produccion.Cliente, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []produccion.Cliente{}
	for _, id := range m.ordenCli {
		c := m.clientes[id]
		if c.ArchivadoAt != "" && !incluirArchivados {
			continue
		}
		out = append(out, clonarCliente(c))
	}
	return out, nil
}

func (m *Memoria) GetCliente(id string) (produccion.Cliente, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	c, ok := m.clientes[id]
	if !ok {
		return produccion.Cliente{}, false, nil
	}
	return clonarCliente(c), true, nil
}

func (m *Memoria) CreateCliente(c produccion.Cliente) (produccion.Cliente, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if c.ID == "" {
		c.ID = NewUUID()
	}
	if c.Estado == "" {
		c.Estado = produccion.ClienteActivo
	}
	if c.CreatedAt == "" {
		c.CreatedAt = Ahora()
	}
	c.UpdatedAt = Ahora()
	if _, existe := m.clientes[c.ID]; !existe {
		m.ordenCli = append(m.ordenCli, c.ID)
	}
	m.clientes[c.ID] = c
	return clonarCliente(c), nil
}

func aplicaCliente(c produccion.Cliente, cambios map[string]any) produccion.Cliente {
	str := func(k string) (string, bool) {
		v, ok := cambios[k].(string)
		return v, ok
	}
	if v, ok := str("nombre"); ok {
		c.Nombre = v
	}
	if v, ok := str("logo_url"); ok {
		c.LogoURL = v
	}
	if v, ok := str("contacto_nombre"); ok {
		c.ContactoNombre = v
	}
	if v, ok := str("contacto_telefono"); ok {
		c.ContactoTelefono = v
	}
	if v, ok := str("contacto_whatsapp"); ok {
		c.ContactoWhatsapp = v
	}
	if v, ok := str("paquete"); ok {
		c.Paquete = v
	}
	if v, ok := str("paquete_id"); ok {
		c.PaqueteID = v
	}
	if v, ok := str("vendido_por"); ok {
		c.VendidoPor = v
	}
	if v, ok := str("estado"); ok {
		c.Estado = v
	}
	if v, ok := str("drive_url"); ok {
		c.DriveURL = v
	}
	if v, ok := str("notas"); ok {
		c.Notas = v
	}
	if v, ok := str("estrategia"); ok {
		c.Estrategia = v
	}
	return c
}

func (m *Memoria) UpdateCliente(id string, cambios map[string]any) (produccion.Cliente, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.clientes[id]
	if !ok {
		return produccion.Cliente{}, ErrNoExiste
	}
	c = aplicaCliente(c, cambios)
	c.UpdatedAt = Ahora()
	m.clientes[id] = c
	return clonarCliente(c), nil
}

func (m *Memoria) ArchivarCliente(id string) (produccion.Cliente, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.clientes[id]
	if !ok {
		return produccion.Cliente{}, ErrNoExiste
	}
	c.ArchivadoAt = Ahora()
	c.UpdatedAt = c.ArchivadoAt
	m.clientes[id] = c
	return clonarCliente(c), nil
}

func (m *Memoria) ListPiezas() ([]produccion.Pieza, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []produccion.Pieza{}
	for _, id := range m.ordenPieza {
		out = append(out, clonarPieza(m.piezas[id]))
	}
	return out, nil
}

func (m *Memoria) GetPieza(id string) (produccion.Pieza, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	p, ok := m.piezas[id]
	if !ok {
		return produccion.Pieza{}, false, nil
	}
	return clonarPieza(p), true, nil
}

func (m *Memoria) CreatePieza(p produccion.Pieza) (produccion.Pieza, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if p.ID == "" {
		p.ID = NewUUID()
	}
	if p.Estado == "" {
		p.Estado = produccion.PiezaBorrador
	}
	if p.CreatedAt == "" {
		p.CreatedAt = Ahora()
	}
	p.UpdatedAt = Ahora()
	if _, existe := m.piezas[p.ID]; !existe {
		m.ordenPieza = append(m.ordenPieza, p.ID)
	}
	m.piezas[p.ID] = p
	return clonarPieza(p), nil
}

func aplicaPieza(p produccion.Pieza, cambios map[string]any) produccion.Pieza {
	if v, ok := cambios["titulo"].(string); ok {
		p.Titulo = v
	}
	if v, ok := cambios["formato"].(string); ok {
		p.Formato = v
	}
	if v, ok := cambios["guion"].(string); ok {
		p.Guion = v
	}
	if v, ok := cambios["fecha_objetivo"].(string); ok {
		p.FechaObjetivo = v
	}
	if v, ok := cambios["estado"].(string); ok {
		p.Estado = v
	}
	if v, ok := cambios["motivo_cancelacion"].(string); ok {
		p.MotivoCancelacion = v
	}
	return p
}

func (m *Memoria) UpdatePieza(id string, cambios map[string]any) (produccion.Pieza, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.piezas[id]
	if !ok {
		return produccion.Pieza{}, ErrNoExiste
	}
	p = aplicaPieza(p, cambios)
	p.UpdatedAt = Ahora()
	m.piezas[id] = p
	return clonarPieza(p), nil
}

func (m *Memoria) ListTareas() ([]produccion.Tarea, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []produccion.Tarea{}
	for _, id := range m.ordenTarea {
		out = append(out, clonarTarea(m.tareas[id]))
	}
	return out, nil
}

func (m *Memoria) GetTarea(id string) (produccion.Tarea, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	t, ok := m.tareas[id]
	if !ok {
		return produccion.Tarea{}, false, nil
	}
	return clonarTarea(t), true, nil
}

func (m *Memoria) CreateTarea(t produccion.Tarea) (produccion.Tarea, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if t.ID == "" {
		t.ID = NewUUID()
	}
	if t.Estado == "" {
		t.Estado = produccion.TareaBloqueada
	}
	if t.CreatedAt == "" {
		t.CreatedAt = Ahora()
	}
	t.UpdatedAt = Ahora()
	if _, existe := m.tareas[t.ID]; !existe {
		m.ordenTarea = append(m.ordenTarea, t.ID)
	}
	m.tareas[t.ID] = t
	return clonarTarea(t), nil
}

func aplicaTarea(t produccion.Tarea, cambios map[string]any) produccion.Tarea {
	if v, ok := cambios["asignado_id"].(string); ok {
		t.AsignadoID = v
	}
	if v, ok := cambios["estado"].(string); ok {
		t.Estado = v
	}
	if v, ok := cambios["fecha_limite"].(string); ok {
		t.FechaLimite = v
	}
	if v, ok := cambios["material_url"].(string); ok {
		t.MaterialURL = v
	}
	if m, ok := cambios["minutos"]; ok {
		switch n := m.(type) {
		case int:
			t.Minutos = &n
		case float64:
			v := int(n)
			t.Minutos = &v
		case nil:
			t.Minutos = nil
		}
	}
	if v, ok := cambios["entregable_url"].(string); ok {
		t.EntregableURL = v
	}
	if v, ok := cambios["publicado_url"].(string); ok {
		t.PublicadoURL = v
	}
	if v, ok := cambios["decision_pendiente"].(bool); ok {
		t.DecisionPendiente = v
	}
	return t
}

func (m *Memoria) UpdateTarea(id string, cambios map[string]any) (produccion.Tarea, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.tareas[id]
	if !ok {
		return produccion.Tarea{}, ErrNoExiste
	}
	t = aplicaTarea(t, cambios)
	t.UpdatedAt = Ahora()
	m.tareas[id] = t
	return clonarTarea(t), nil
}

func (m *Memoria) TareasDePieza(piezaID string) ([]produccion.Tarea, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []produccion.Tarea{}
	for _, id := range m.ordenTarea {
		if t := m.tareas[id]; t.PiezaID == piezaID {
			out = append(out, clonarTarea(t))
		}
	}
	return out, nil
}

func clonarTareaEvento(e produccion.TareaEvento) produccion.TareaEvento { return e }

func (m *Memoria) ListTareaEventos(tareaID string) ([]produccion.TareaEvento, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []produccion.TareaEvento{}
	for _, e := range m.tareaEventos {
		if e.TareaID == tareaID {
			out = append(out, clonarTareaEvento(e))
		}
	}
	return out, nil
}

func (m *Memoria) TodosTareaEventos() ([]produccion.TareaEvento, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]produccion.TareaEvento, len(m.tareaEventos))
	copy(out, m.tareaEventos)
	return out, nil
}

func (m *Memoria) AddTareaEvento(e produccion.TareaEvento) (produccion.TareaEvento, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if e.ID == "" {
		e.ID = NewUUID()
	}
	if e.Cuando == "" {
		e.Cuando = Ahora()
	}
	m.tareaEventos = append(m.tareaEventos, e)
	return clonarTareaEvento(e), nil
}

func (m *Memoria) ListNotificaciones(usuarioID string) ([]produccion.Notificacion, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []produccion.Notificacion{}
	for _, n := range m.notificaciones {
		if n.UsuarioID == usuarioID {
			out = append(out, n)
		}
	}
	return out, nil
}

func (m *Memoria) AddNotificacion(n produccion.Notificacion) (produccion.Notificacion, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if n.ID == "" {
		n.ID = NewUUID()
	}
	if n.CreatedAt == "" {
		n.CreatedAt = Ahora()
	}
	m.notificaciones[n.ID] = n
	return n, nil
}

func (m *Memoria) MarcarLeida(usuarioID, id string) (produccion.Notificacion, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, ok := m.notificaciones[id]
	if !ok || n.UsuarioID != usuarioID {
		return produccion.Notificacion{}, ErrNoExiste
	}
	n.Leida = true
	m.notificaciones[id] = n
	return n, nil
}

// --- F2 cobros (memoria) ---
//
// Semillas demo (§7.3: sin valores de fábrica; la demo trae ejemplos
// marcados demo=true): 2 tarifas por_tarea/por_minuto + 1 por_duracion con
// los 6 tramos del sitio como ejemplo + 9 paquetes del brief + config 8 %
// una_vez. UUID estables para tests.

// UUID estables de semillas F2.
const (
	SemillaTarifaEdicionID  = "f4000000-0000-4000-8000-000000000001"
	SemillaTarifaGrabMinID  = "f4000000-0000-4000-8000-000000000002"
	SemillaTarifaDuracionID = "f4000000-0000-4000-8000-000000000003"
)

// semillasF2 carga tarifas/paquetes/config demo. Sin mutex: solo la llama
// NuevaMemoria antes de publicar el store.
func (m *Memoria) semillasF2(fija string) {
	m.tarifas[SemillaTarifaEdicionID] = cobros.Tarifa{
		ID: SemillaTarifaEdicionID, Etapa: produccion.EtapaEdicion,
		Unidad: cobros.UnidadPorTarea, MontoCOP: 80000,
		VigenteDesde: fija, Version: 1, Activa: true, Demo: true,
		CreatedAt: fija, UpdatedAt: fija, CreatedBy: SemillaDuenoID,
	}
	m.tarifas[SemillaTarifaGrabMinID] = cobros.Tarifa{
		ID: SemillaTarifaGrabMinID, Etapa: produccion.EtapaGrabPrincipal,
		Unidad: cobros.UnidadPorMinuto, MontoCOP: 2000,
		VigenteDesde: fija, Version: 1, Activa: true, Demo: true,
		CreatedAt: fija, UpdatedAt: fija, CreatedBy: SemillaDuenoID,
	}
	m.tarifas[SemillaTarifaDuracionID] = cobros.Tarifa{
		ID: SemillaTarifaDuracionID, Etapa: produccion.EtapaEdicion,
		Unidad: cobros.UnidadPorDuracion, MontoCOP: 80000,
		VigenteDesde: fija, Version: 1, Activa: false, Demo: true,
		CreatedAt: fija, UpdatedAt: fija, CreatedBy: SemillaDuenoID,
	}
	m.ordenTar = append(m.ordenTar, SemillaTarifaEdicionID, SemillaTarifaGrabMinID, SemillaTarifaDuracionID)
	// 6 tramos demo del sitio (10s–1min, 1–3, 3–10, 11–30, 31–60, +61min).
	tramosDemo := []struct {
		desde int
		hasta *int
		monto int64
	}{
		{10, intPtr(60), 45000},
		{61, intPtr(180), 60000},
		{181, intPtr(600), 80000},
		{601, intPtr(1800), 150000},
		{1801, intPtr(3600), 250000},
		{3661, nil, 400000},
	}
	for i, tr := range tramosDemo {
		id := "f5000000-0000-4000-8000-00000000000" + string(rune('1'+i))
		m.tramos[id] = cobros.TarifaTramo{
			ID: id, TarifaID: SemillaTarifaDuracionID,
			DesdeSeg: tr.desde, HastaSeg: tr.hasta, MontoCOP: tr.monto,
		}
	}
	paqs := []struct {
		nombre string
		precio int64
	}{
		{"TV Basic", 300000}, {"TV Supreme", 600000}, {"TV Premier", 900000},
		{"Digital Inicial", 290000}, {"Digital", 390000}, {"Digital Aumento", 520000},
		{"Mixto I", 499000}, {"Mixto II", 899000}, {"Mixto III", 1299000},
	}
	for i, p := range paqs {
		id := "f6000000-0000-4000-8000-00000000000" + string(rune('1'+i))
		m.paquetes[id] = cobros.Paquete{
			ID: id, Nombre: p.nombre, PrecioCOP: p.precio,
			Activo: true, Demo: true, CreatedAt: fija, UpdatedAt: fija,
		}
		m.ordenPaq = append(m.ordenPaq, id)
	}
	m.config = cobros.ConfigCobros{PorcentajeComision: 8, ModoComision: cobros.ModoUnaVez}
	m.tieneConf = true
}

func intPtr(v int) *int { return &v }

func (m *Memoria) ListTarifas() ([]cobros.Tarifa, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []cobros.Tarifa{}
	for _, id := range m.ordenTar {
		out = append(out, m.tarifas[id])
	}
	return out, nil
}

func (m *Memoria) GetTarifa(id string) (cobros.Tarifa, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	t, ok := m.tarifas[id]
	return t, ok, nil
}

// TarifaVigente devuelve la tarifa activa para etapa+unidad ("" si no hay).
func (m *Memoria) tarifaVigente(etapa, unidad string) (cobros.Tarifa, bool) {
	for _, id := range m.ordenTar {
		if t := m.tarifas[id]; t.Activa && t.Etapa == etapa && t.Unidad == unidad {
			return t, true
		}
	}
	return cobros.Tarifa{}, false
}

func (m *Memoria) CreateTarifa(t cobros.Tarifa) (cobros.Tarifa, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	version := 1
	for _, id := range m.ordenTar {
		v := m.tarifas[id]
		if v.Activa && v.Etapa == t.Etapa && v.Unidad == t.Unidad {
			v.Activa = false
			v.VigenteHasta = Ahora()
			v.UpdatedAt = v.VigenteHasta
			m.tarifas[id] = v
			if v.Version >= version {
				version = v.Version + 1
			}
		}
	}
	if t.ID == "" {
		t.ID = NewUUID()
	}
	t.Version = version
	t.Activa = true
	if t.VigenteDesde == "" {
		t.VigenteDesde = Ahora()
	}
	if t.CreatedAt == "" {
		t.CreatedAt = Ahora()
	}
	t.UpdatedAt = Ahora()
	if _, existe := m.tarifas[t.ID]; !existe {
		m.ordenTar = append(m.ordenTar, t.ID)
	}
	m.tarifas[t.ID] = t
	return t, nil
}

func (m *Memoria) ListTramos(tarifaID string) ([]cobros.TarifaTramo, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []cobros.TarifaTramo{}
	for _, tr := range m.tramos {
		if tr.TarifaID == tarifaID {
			out = append(out, tr)
		}
	}
	return out, nil
}

func (m *Memoria) CreateTramo(tr cobros.TarifaTramo) (cobros.TarifaTramo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if tr.ID == "" {
		tr.ID = NewUUID()
	}
	m.tramos[tr.ID] = tr
	return tr, nil
}

func (m *Memoria) ListPaquetes() ([]cobros.Paquete, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []cobros.Paquete{}
	for _, id := range m.ordenPaq {
		out = append(out, m.paquetes[id])
	}
	return out, nil
}

func (m *Memoria) GetPaquete(id string) (cobros.Paquete, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	p, ok := m.paquetes[id]
	return p, ok, nil
}

func (m *Memoria) CreatePaquete(p cobros.Paquete) (cobros.Paquete, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if p.ID == "" {
		p.ID = NewUUID()
	}
	if p.CreatedAt == "" {
		p.CreatedAt = Ahora()
	}
	p.Activo = true
	p.UpdatedAt = Ahora()
	if _, existe := m.paquetes[p.ID]; !existe {
		m.ordenPaq = append(m.ordenPaq, p.ID)
	}
	m.paquetes[p.ID] = p
	return p, nil
}

func (m *Memoria) UpdatePaquete(id string, cambios map[string]any) (cobros.Paquete, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.paquetes[id]
	if !ok {
		return cobros.Paquete{}, ErrNoExiste
	}
	if v, ok := cambios["nombre"].(string); ok {
		p.Nombre = v
	}
	if v, ok := cambios["precio_cop"]; ok {
		switch n := v.(type) {
		case int64:
			p.PrecioCOP = n
		case float64:
			p.PrecioCOP = int64(n)
		case int:
			p.PrecioCOP = int64(n)
		}
	}
	if v, ok := cambios["activo"].(bool); ok {
		p.Activo = v
	}
	p.UpdatedAt = Ahora()
	m.paquetes[id] = p
	return p, nil
}

func (m *Memoria) GetConfig() (cobros.ConfigCobros, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.config, nil
}

func (m *Memoria) UpdateConfig(c cobros.ConfigCobros) (cobros.ConfigCobros, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.config = c
	m.tieneConf = true
	return m.config, nil
}

func (m *Memoria) CreateLinea(l cobros.LineaCobro) (cobros.LineaCobro, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if l.ID == "" {
		l.ID = NewUUID()
	}
	if l.CreatedAt == "" {
		l.CreatedAt = Ahora()
	}
	l.UpdatedAt = Ahora()
	if _, existe := m.lineas[l.ID]; !existe {
		m.ordenLin = append(m.ordenLin, l.ID)
	}
	m.lineas[l.ID] = l
	return l, nil
}

func (m *Memoria) GetLinea(id string) (cobros.LineaCobro, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	l, ok := m.lineas[id]
	return l, ok, nil
}

func (m *Memoria) ListLineas() ([]cobros.LineaCobro, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []cobros.LineaCobro{}
	for _, id := range m.ordenLin {
		out = append(out, m.lineas[id])
	}
	return out, nil
}

// UpdateLineaEstado cambia SOLO estado/motivo/reclamo/corte/periodo.
// Ignora cualquier otro campo (nadie edita una línea, §2).
func (m *Memoria) UpdateLineaEstado(id string, cambios map[string]any) (cobros.LineaCobro, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	l, ok := m.lineas[id]
	if !ok {
		return cobros.LineaCobro{}, ErrNoExiste
	}
	if v, ok := cambios["estado"].(string); ok {
		l.Estado = v
	}
	if v, ok := cambios["motivo"].(string); ok {
		l.Motivo = v
	}
	if v, ok := cambios["reclamo_motivo"].(string); ok {
		l.ReclamoMotivo = v
	}
	if v, ok := cambios["corte_id"].(string); ok {
		l.CorteID = v
	}
	if v, ok := cambios["periodo"].(string); ok {
		l.Periodo = v
	}
	l.UpdatedAt = Ahora()
	m.lineas[id] = l
	return l, nil
}

func (m *Memoria) LineaDeTarea(tareaID string) (cobros.LineaCobro, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, id := range m.ordenLin {
		if l := m.lineas[id]; l.Tipo == cobros.TipoTarea && l.TareaID == tareaID {
			return l, true, nil
		}
	}
	return cobros.LineaCobro{}, false, nil
}

func (m *Memoria) ListCortes() ([]cobros.Corte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []cobros.Corte{}
	for _, id := range m.ordenCor {
		out = append(out, m.cortes[id])
	}
	return out, nil
}

func (m *Memoria) GetCorteByPeriodo(periodo string) (cobros.Corte, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, id := range m.ordenCor {
		if c := m.cortes[id]; c.Periodo == periodo {
			return c, true, nil
		}
	}
	return cobros.Corte{}, false, nil
}

func (m *Memoria) CreateCorte(c cobros.Corte) (cobros.Corte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if c.ID == "" {
		c.ID = NewUUID()
	}
	if c.Estado == "" {
		c.Estado = cobros.CorteCerrado
	}
	if c.CreatedAt == "" {
		c.CreatedAt = Ahora()
	}
	c.UpdatedAt = Ahora()
	if _, existe := m.cortes[c.ID]; !existe {
		m.ordenCor = append(m.ordenCor, c.ID)
	}
	m.cortes[c.ID] = c
	return c, nil
}

func (m *Memoria) UpdateCorte(id string, cambios map[string]any) (cobros.Corte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.cortes[id]
	if !ok {
		return cobros.Corte{}, ErrNoExiste
	}
	if v, ok := cambios["estado"].(string); ok {
		c.Estado = v
	}
	if v, ok := cambios["cerrado_at"].(string); ok {
		c.CerradoAt = v
	}
	c.UpdatedAt = Ahora()
	m.cortes[id] = c
	return c, nil
}
