package store

import (
	"context"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"
)

// ==========================================================
// F5: Store en memoria (modo demo y pruebas)
// ==========================================================

// adjuntosDeMensajeLocked devuelve los adjuntos de un mensaje (sin bloquear).
func (m *MemoryStore) adjuntosDeMensajeLocked(mensajeID int64) []*ChatAdjunto {
	var res []*ChatAdjunto
	for _, a := range m.adjuntos {
		if a.MensajeID != nil && *a.MensajeID == mensajeID {
			cp := *a
			res = append(res, &cp)
		}
	}
	sort.Slice(res, func(i, j int) bool { return res[i].ID < res[j].ID })
	if len(res) == 0 {
		return nil
	}
	return res
}

// ---------- Equipo (barra derecha) ----------

func (m *MemoryStore) clonarConfigEquipoLocked() *ConfigEquipo {
	cp := m.equipo
	enlaces := make([]*EnlaceEquipo, 0, len(m.enlaces))
	for _, e := range m.enlaces {
		copia := *e
		enlaces = append(enlaces, &copia)
	}
	sort.Slice(enlaces, func(i, j int) bool {
		if enlaces[i].Orden != enlaces[j].Orden {
			return enlaces[i].Orden < enlaces[j].Orden
		}
		return enlaces[i].ID < enlaces[j].ID
	})
	cp.Enlaces = enlaces

	act := ActividadEquipo{}
	for _, msg := range m.mensajes {
		if msg.BorradoEn == nil {
			act.Mensajes++
		}
	}
	act.Tareas = len(m.tareas)
	for _, p := range m.perfiles {
		if p.Estado == EstadoAprobado {
			act.Miembros++
		}
	}
	// Archivos = adjuntos del chat + enlaces de Drive de las tareas
	act.Archivos = len(m.adjuntos)
	for _, t := range m.tareas {
		if t.EnlaceMedios != nil && strings.TrimSpace(*t.EnlaceMedios) != "" {
			act.Archivos++
		}
	}
	cp.Actividad = act
	return &cp
}

func (m *MemoryStore) ObtenerConfigEquipo(ctx context.Context) (*ConfigEquipo, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.clonarConfigEquipoLocked(), nil
}

func (m *MemoryStore) ActualizarConfigEquipo(ctx context.Context, nombre, descripcion *string) (*ConfigEquipo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if nombre != nil {
		n := strings.TrimSpace(*nombre)
		if len([]rune(n)) < 2 || len([]rune(n)) > 80 {
			return nil, fmt.Errorf("%w: el nombre del equipo debe tener entre 2 y 80 caracteres", ErrValidation)
		}
		m.equipo.Nombre = n
	}
	if descripcion != nil {
		d := strings.TrimSpace(*descripcion)
		if len([]rune(d)) > 300 {
			return nil, fmt.Errorf("%w: la descripción no puede superar 300 caracteres", ErrValidation)
		}
		m.equipo.Descripcion = d
	}
	ahora := time.Now()
	m.equipo.ActualizadoEn = &ahora
	return m.clonarConfigEquipoLocked(), nil
}

// NormalizarURLEnlaceEquipo valida que sea https válido y devuelve forma canónica para comparar duplicados.
func NormalizarURLEnlaceEquipo(raw string) (string, string, error) {
	u := strings.TrimSpace(raw)
	if len(u) < 8 || len(u) > 500 || !strings.HasPrefix(strings.ToLower(u), "https://") {
		return "", "", fmt.Errorf("%w: el enlace debe ser una URL https de máximo 500 caracteres", ErrValidation)
	}
	parsed, err := url.Parse(u)
	if err != nil || !strings.EqualFold(parsed.Scheme, "https") || parsed.Host == "" || parsed.User != nil {
		return "", "", fmt.Errorf("%w: el enlace debe ser una URL https de máximo 500 caracteres", ErrValidation)
	}
	canon := *parsed
	canon.Scheme = strings.ToLower(canon.Scheme)
	canon.Host = strings.ToLower(canon.Host)
	clave := strings.TrimRight(canon.String(), "/")
	return u, clave, nil
}

func (m *MemoryStore) CrearEnlaceEquipo(ctx context.Context, nombre, rawURL string) (*EnlaceEquipo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	n := strings.TrimSpace(nombre)
	if len([]rune(n)) < 1 || len([]rune(n)) > 40 {
		return nil, fmt.Errorf("%w: el nombre del enlace debe tener entre 1 y 40 caracteres", ErrValidation)
	}
	u, clave, err := NormalizarURLEnlaceEquipo(rawURL)
	if err != nil {
		return nil, err
	}
	for _, existente := range m.enlaces {
		if _, cExistente, err := NormalizarURLEnlaceEquipo(existente.URL); err == nil && cExistente == clave {
			return nil, fmt.Errorf("%w: ese enlace ya está en la lista", ErrValidation)
		}
	}
	if len(m.enlaces) >= 12 {
		return nil, fmt.Errorf("%w: ya hay 12 enlaces, quita uno antes de agregar otro", ErrValidation)
	}

	e := &EnlaceEquipo{ID: m.nextEnlaceID, Nombre: n, URL: u, Orden: m.nextEnlaceID, CreadoEn: time.Now()}
	m.nextEnlaceID++
	m.enlaces[e.ID] = e
	copia := *e
	return &copia, nil
}

func (m *MemoryStore) ActualizarEnlaceEquipo(ctx context.Context, id int, campos map[string]any) (*EnlaceEquipo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	e, ok := m.enlaces[id]
	if !ok {
		return nil, ErrNotFound
	}
	if v, exists := campos["nombre"]; exists {
		s, ok := v.(string)
		if !ok {
			return nil, ErrValidation
		}
		s = strings.TrimSpace(s)
		if len([]rune(s)) < 1 || len([]rune(s)) > 40 {
			return nil, fmt.Errorf("%w: el nombre del enlace debe tener entre 1 y 40 caracteres", ErrValidation)
		}
		e.Nombre = s
	}
	if v, exists := campos["url"]; exists {
		s, ok := v.(string)
		if !ok {
			return nil, ErrValidation
		}
		u, clave, err := NormalizarURLEnlaceEquipo(s)
		if err != nil {
			return nil, err
		}
		for otroID, existente := range m.enlaces {
			if otroID != id {
				if _, cExistente, err := NormalizarURLEnlaceEquipo(existente.URL); err == nil && cExistente == clave {
					return nil, fmt.Errorf("%w: ese enlace ya está en la lista", ErrValidation)
				}
			}
		}
		e.URL = u
	}
	if v, exists := campos["orden"]; exists {
		switch n := v.(type) {
		case int:
			e.Orden = n
		case float64:
			e.Orden = int(n)
		default:
			return nil, ErrValidation
		}
	}
	copia := *e
	return &copia, nil
}

func (m *MemoryStore) EliminarEnlaceEquipo(ctx context.Context, id int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.enlaces[id]; !ok {
		return ErrNotFound
	}
	delete(m.enlaces, id)
	return nil
}

// ---------- Chat con adjuntos ----------

func (m *MemoryStore) GuardarAdjuntoChat(ctx context.Context, autorID, tipo, nombre, mime string, tamano int64, duracionSeg *int, datos []byte) (*ChatAdjunto, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.perfiles[autorID]; !ok {
		return nil, ErrNotFound
	}
	switch tipo {
	case AdjuntoImagen, AdjuntoVideo, AdjuntoAudio, AdjuntoArchivo, AdjuntoDrive:
	default:
		return nil, fmt.Errorf("%w: tipo de adjunto no válido", ErrValidation)
	}

	id := m.nextAdjuntoID
	m.nextAdjuntoID++
	ahora := time.Now()
	path := fmt.Sprintf("chat/%s/%d", autorID, id)

	a := &ChatAdjunto{
		ID:          id,
		AutorID:     autorID,
		Tipo:        tipo,
		Nombre:      strings.TrimSpace(nombre),
		Mime:        mime,
		Tamano:      tamano,
		DuracionSeg: duracionSeg,
		StoragePath: &path,
		CreadoEn:    ahora,
	}
	m.adjuntos[id] = a
	if len(datos) > 0 {
		m.archivosAdjuntos[id] = datos
	}
	copia := *a
	return &copia, nil
}

// GuardarAdjuntoDrive registra una carpeta de Drive compartida en el chat.
func (m *MemoryStore) GuardarAdjuntoDrive(ctx context.Context, autorID, nombre, url string) (*ChatAdjunto, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.perfiles[autorID]; !ok {
		return nil, ErrNotFound
	}
	limpio := strings.TrimSpace(nombre)
	if len([]rune(limpio)) < 1 || len([]rune(limpio)) > 200 {
		return nil, fmt.Errorf("%w: el nombre de la carpeta debe tener entre 1 y 200 caracteres", ErrValidation)
	}
	enlace := strings.TrimSpace(url)
	if len(enlace) < 10 || len(enlace) > 800 {
		return nil, fmt.Errorf("%w: el enlace de Drive no es válido", ErrValidation)
	}

	id := m.nextAdjuntoID
	m.nextAdjuntoID++
	a := &ChatAdjunto{
		ID:         id,
		AutorID:    autorID,
		Tipo:       AdjuntoDrive,
		Nombre:     limpio,
		Mime:       "application/vnd.google-apps.folder",
		URLExterna: &enlace,
		CreadoEn:   time.Now(),
	}
	m.adjuntos[id] = a
	copia := *a
	return &copia, nil
}

func (m *MemoryStore) ObtenerAdjuntoChat(ctx context.Context, id int64) (*ChatAdjunto, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	a, ok := m.adjuntos[id]
	if !ok {
		return nil, ErrNotFound
	}
	copia := *a
	return &copia, nil
}

func (m *MemoryStore) LeerArchivoAdjunto(ctx context.Context, id int64) ([]byte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	datos, ok := m.archivosAdjuntos[id]
	if !ok {
		return nil, ErrNotFound
	}
	copia := make([]byte, len(datos))
	copy(copia, datos)
	return copia, nil
}

func (m *MemoryStore) EnlazarAdjuntosMensaje(ctx context.Context, mensajeID int64, autorID string, ids []int64) ([]*ChatAdjunto, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if len(ids) == 0 {
		return nil, nil
	}
	if len(ids) > 10 {
		return nil, fmt.Errorf("%w: máximo 10 adjuntos por mensaje", ErrValidation)
	}
	for _, id := range ids {
		a, ok := m.adjuntos[id]
		if !ok || a.AutorID != autorID || a.MensajeID != nil {
			return nil, fmt.Errorf("%w: adjunto no válido", ErrValidation)
		}
	}
	res := make([]*ChatAdjunto, 0, len(ids))
	for _, id := range ids {
		a := m.adjuntos[id]
		a.MensajeID = &mensajeID
		copia := *a
		res = append(res, &copia)
	}
	return res, nil
}

// ---------- Asignaciones (admin) ----------

func (m *MemoryStore) ListarAsignaciones(ctx context.Context, filtro FiltroAsignaciones) ([]*AsignacionResumen, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var res []*AsignacionResumen
	for _, t := range m.tareas {
		if filtro.PersonaID != nil && t.AsignadoA != *filtro.PersonaID {
			continue
		}
		if filtro.Estado != nil && t.Estado != *filtro.Estado {
			continue
		}
		if filtro.Desde != nil && t.CreadaEn.Before(*filtro.Desde) {
			continue
		}
		if filtro.Hasta != nil && t.CreadaEn.After(*filtro.Hasta) {
			continue
		}
		res = append(res, &AsignacionResumen{Tarea: m.clonarTareaLocked(t)})
	}
	sort.Slice(res, func(i, j int) bool {
		return movimientoTarea(res[i].Tarea).After(movimientoTarea(res[j].Tarea))
	})
	if filtro.Limite > 0 && len(res) > filtro.Limite {
		res = res[:filtro.Limite]
	}
	if res == nil {
		res = []*AsignacionResumen{}
	}
	if filtro.VistasDe != "" {
		vistas := m.asignacionesVistas[filtro.VistasDe]
		for _, a := range res {
			if a.Tarea == nil {
				continue
			}
			ultimaVista, visto := vistas[a.Tarea.ID]
			if !visto {
				a.Novedad = true
				continue
			}
			a.Novedad = movimientoTarea(a.Tarea).After(ultimaVista)
		}
	}
	return res, nil
}

// movimientoTarea es la última fecha en que la asignación tuvo movimiento.
func movimientoTarea(t *Tarea) time.Time {
	if t == nil {
		return time.Time{}
	}
	ultimo := t.CreadaEn
	if t.HechaEn != nil && t.HechaEn.After(ultimo) {
		ultimo = *t.HechaEn
	}
	if t.ResueltaEn != nil && t.ResueltaEn.After(ultimo) {
		ultimo = *t.ResueltaEn
	}
	return ultimo
}

func (m *MemoryStore) MarcarAsignacionesVistas(ctx context.Context, perfilID string, ids []int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.asignacionesVistas[perfilID] == nil {
		m.asignacionesVistas[perfilID] = make(map[int64]time.Time)
	}
	ahora := time.Now()
	if len(ids) == 0 {
		for id := range m.tareas {
			m.asignacionesVistas[perfilID][id] = ahora
		}
		return nil
	}
	for _, id := range ids {
		if _, ok := m.tareas[id]; ok {
			m.asignacionesVistas[perfilID][id] = ahora
		}
	}
	return nil
}

// ---------- Google Drive ----------

func (m *MemoryStore) ObtenerConexionDrive(ctx context.Context) (*ConexionDrive, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.conexionDrive == nil {
		return nil, ErrNotFound
	}
	copia := *m.conexionDrive
	return &copia, nil
}

func (m *MemoryStore) GuardarConexionDrive(ctx context.Context, c *ConexionDrive) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if c == nil || strings.TrimSpace(c.RefreshToken) == "" {
		return ErrValidation
	}
	copia := *c
	if copia.ConectadoEn.IsZero() {
		copia.ConectadoEn = time.Now()
	}
	m.conexionDrive = &copia
	return nil
}

func (m *MemoryStore) EliminarConexionDrive(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.conexionDrive = nil
	return nil
}

func (m *MemoryStore) ActualizarCarpetaDriveTarea(ctx context.Context, tareaID int64, carpetaID, carpetaURL string) (*Tarea, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	t, ok := m.tareas[tareaID]
	if !ok {
		return nil, ErrNotFound
	}
	if strings.TrimSpace(carpetaID) == "" {
		t.DriveCarpetaID = nil
		t.DriveCarpetaURL = nil
	} else {
		id := strings.TrimSpace(carpetaID)
		u := strings.TrimSpace(carpetaURL)
		t.DriveCarpetaID = &id
		t.DriveCarpetaURL = &u
	}
	return m.clonarTareaLocked(t), nil
}

// ---------- Piezas ----------

func (m *MemoryStore) clonarPiezaLocked(p *Pieza) *Pieza {
	if p == nil {
		return nil
	}
	cp := *p
	if p.ClienteID != nil {
		if c, ok := m.clientes[*p.ClienteID]; ok {
			cp.Cliente = m.clonarClienteLocked(c)
		}
	}
	tareas := make([]*Tarea, 0)
	for _, t := range m.tareas {
		if t.PiezaID != nil && *t.PiezaID == p.ID {
			tareas = append(tareas, m.clonarTareaLocked(t))
		}
	}
	sort.Slice(tareas, func(i, j int) bool { return tareas[i].CreadaEn.Before(tareas[j].CreadaEn) })
	cp.Tareas = tareas
	return &cp
}

func (m *MemoryStore) ListarPiezas(ctx context.Context, filtro FiltroPiezas) ([]*Pieza, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var res []*Pieza
	for _, p := range m.piezas {
		if filtro.ClienteID != nil && (p.ClienteID == nil || *p.ClienteID != *filtro.ClienteID) {
			continue
		}
		if filtro.Etapa != nil && p.Etapa != *filtro.Etapa {
			continue
		}
		res = append(res, m.clonarPiezaLocked(p))
	}
	sort.Slice(res, func(i, j int) bool { return res[i].ActualizadoEn.After(res[j].ActualizadoEn) })
	if res == nil {
		res = []*Pieza{}
	}
	return res, nil
}

func (m *MemoryStore) ObtenerPieza(ctx context.Context, id int) (*Pieza, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	p, ok := m.piezas[id]
	if !ok {
		return nil, ErrNotFound
	}
	return m.clonarPiezaLocked(p), nil
}

func (m *MemoryStore) CrearPieza(ctx context.Context, p *Pieza) (*Pieza, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if p == nil {
		return nil, ErrValidation
	}
	nombre := strings.TrimSpace(p.Nombre)
	if len([]rune(nombre)) < 2 || len([]rune(nombre)) > 120 {
		return nil, fmt.Errorf("%w: el nombre de la pieza debe tener entre 2 y 120 caracteres", ErrValidation)
	}
	etapa, ok := EtapaPiezaValida(p.Etapa)
	if p.Etapa == "" {
		etapa, ok = "guion", true
	}
	if !ok {
		return nil, fmt.Errorf("%w: la etapa no es válida", ErrValidation)
	}
	if p.ClienteID != nil {
		if _, existe := m.clientes[*p.ClienteID]; !existe {
			return nil, fmt.Errorf("%w: el cliente no existe", ErrValidation)
		}
	}

	id := m.nextPiezaID
	m.nextPiezaID++
	ahora := time.Now()
	nueva := &Pieza{
		ID:              id,
		ClienteID:       p.ClienteID,
		Nombre:          nombre,
		Formato:         strings.TrimSpace(p.Formato),
		Etapa:           etapa,
		DriveCarpetaURL: p.DriveCarpetaURL,
		CreadoPor:       p.CreadoPor,
		CreadoEn:        ahora,
		ActualizadoEn:   ahora,
	}
	if nueva.Formato == "" {
		nueva.Formato = "Reel"
	}
	m.piezas[id] = nueva
	return m.clonarPiezaLocked(nueva), nil
}

func (m *MemoryStore) ActualizarPieza(ctx context.Context, id int, campos map[string]any) (*Pieza, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	p, ok := m.piezas[id]
	if !ok {
		return nil, ErrNotFound
	}
	if v, exists := campos["nombre"]; exists {
		s, ok := v.(string)
		if !ok {
			return nil, ErrValidation
		}
		s = strings.TrimSpace(s)
		if len([]rune(s)) < 2 || len([]rune(s)) > 120 {
			return nil, fmt.Errorf("%w: el nombre de la pieza debe tener entre 2 y 120 caracteres", ErrValidation)
		}
		p.Nombre = s
	}
	if v, exists := campos["etapa"]; exists {
		s, ok := v.(string)
		if !ok {
			return nil, ErrValidation
		}
		etapa, valida := EtapaPiezaValida(s)
		if !valida {
			return nil, fmt.Errorf("%w: la etapa no es válida", ErrValidation)
		}
		p.Etapa = etapa
	}
	if v, exists := campos["formato"]; exists {
		if s, ok := v.(string); ok {
			p.Formato = strings.TrimSpace(s)
		} else {
			return nil, ErrValidation
		}
	}
	if v, exists := campos["fecha_publicacion"]; exists {
		if s, ok := v.(string); ok {
			limpio := strings.TrimSpace(s)
			if limpio == "" {
				p.FechaPublicacion = nil
			} else {
				p.FechaPublicacion = &limpio
			}
		} else if v == nil {
			p.FechaPublicacion = nil
		} else {
			return nil, ErrValidation
		}
	}
	if v, exists := campos["notas"]; exists {
		if s, ok := v.(string); ok {
			limpio := strings.TrimSpace(s)
			if len([]rune(limpio)) > 1000 {
				return nil, ErrValidation
			}
			if limpio == "" {
				p.Notas = nil
			} else {
				p.Notas = &limpio
			}
		} else if v == nil {
			p.Notas = nil
		} else {
			return nil, ErrValidation
		}
	}
	if v, exists := campos["drive_carpeta_url"]; exists {
		if s, ok := v.(string); ok {
			limpio := strings.TrimSpace(s)
			if len(limpio) > 500 {
				return nil, ErrValidation
			}
			if limpio == "" {
				p.DriveCarpetaURL = nil
			} else {
				p.DriveCarpetaURL = &limpio
			}
		} else if v == nil {
			p.DriveCarpetaURL = nil
		} else {
			return nil, ErrValidation
		}
	}
	if v, exists := campos["cliente_id"]; exists {
		if v == nil {
			p.ClienteID = nil
		} else {
			switch n := v.(type) {
			case float64:
				idCli := int(n)
				if _, existe := m.clientes[idCli]; !existe {
					return nil, fmt.Errorf("%w: el cliente no existe", ErrValidation)
				}
				p.ClienteID = &idCli
			case int:
				if _, existe := m.clientes[n]; !existe {
					return nil, fmt.Errorf("%w: el cliente no existe", ErrValidation)
				}
				idCli := n
				p.ClienteID = &idCli
			default:
				return nil, ErrValidation
			}
		}
	}
	p.ActualizadoEn = time.Now()
	return m.clonarPiezaLocked(p), nil
}

// ---------- Cortes de pago ----------

func (m *MemoryStore) lineasCorteLocked(desde, hasta time.Time) []*LineaCorte {
	porPersona := make(map[string]*LineaCorte)
	for _, t := range m.tareas {
		if t.Estado != EstadoTareaAceptada || t.ResueltaEn == nil {
			continue
		}
		if t.ResueltaEn.Before(desde) || t.ResueltaEn.After(hasta) {
			continue
		}
		linea, ok := porPersona[t.AsignadoA]
		if !ok {
			linea = &LineaCorte{PerfilID: t.AsignadoA}
			porPersona[t.AsignadoA] = linea
		}
		if t.PrecioCongelado != nil {
			linea.Total += *t.PrecioCongelado
		}
		linea.Tareas++
	}
	res := make([]*LineaCorte, 0, len(porPersona))
	for _, l := range porPersona {
		if p, ok := m.perfiles[l.PerfilID]; ok {
			l.Perfil = m.clonarPerfilLocked(p)
		}
		res = append(res, l)
	}
	sort.Slice(res, func(i, j int) bool {
		ni, nj := "", ""
		if res[i].Perfil != nil {
			ni = strings.ToLower(res[i].Perfil.Nombre)
		}
		if res[j].Perfil != nil {
			nj = strings.ToLower(res[j].Perfil.Nombre)
		}
		return ni < nj
	})
	return res
}

func (m *MemoryStore) clonarCorteLocked(c *Corte) *Corte {
	if c == nil {
		return nil
	}
	cp := *c
	lineas := make([]*LineaCorte, 0, len(c.Lineas))
	for _, l := range c.Lineas {
		copia := *l
		if p, ok := m.perfiles[l.PerfilID]; ok {
			copia.Perfil = m.clonarPerfilLocked(p)
		}
		lineas = append(lineas, &copia)
	}
	cp.Lineas = lineas
	return &cp
}

func (m *MemoryStore) ListarCortes(ctx context.Context) ([]*Corte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	res := make([]*Corte, 0, len(m.cortes))
	for _, c := range m.cortes {
		res = append(res, m.clonarCorteLocked(c))
	}
	sort.Slice(res, func(i, j int) bool { return res[i].CreadoEn.After(res[j].CreadoEn) })
	return res, nil
}

func (m *MemoryStore) ObtenerCorte(ctx context.Context, id int64) (*Corte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	c, ok := m.cortes[id]
	if !ok {
		return nil, ErrNotFound
	}
	return m.clonarCorteLocked(c), nil
}

func (m *MemoryStore) CrearCorte(ctx context.Context, periodo, desde, hasta, creadoPor string) (*Corte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	d, err := time.ParseInLocation("2006-01-02", desde, time.Local)
	if err != nil {
		return nil, fmt.Errorf("%w: la fecha inicial no es válida", ErrValidation)
	}
	h, err := time.ParseInLocation("2006-01-02", hasta, time.Local)
	if err != nil {
		return nil, fmt.Errorf("%w: la fecha final no es válida", ErrValidation)
	}
	if h.Before(d) {
		return nil, fmt.Errorf("%w: la fecha final no puede ser anterior a la inicial", ErrValidation)
	}

	for _, c := range m.cortes {
		if c.Desde == desde && c.Hasta == hasta {
			return nil, fmt.Errorf("%w: ya existe un corte con ese mismo periodo", ErrConflict)
		}
	}

	// Fin del día de cierre incluido
	finDia := time.Date(h.Year(), h.Month(), h.Day(), 23, 59, 59, 999999999, time.Local)
	lineas := m.lineasCorteLocked(d, finDia)
	if len(lineas) == 0 {
		return nil, fmt.Errorf("%w: no hay tareas aprobadas en ese periodo", ErrValidation)
	}

	id := m.nextCorteID
	m.nextCorteID++
	var total int64
	for _, l := range lineas {
		total += l.Total
	}
	por := creadoPor
	c := &Corte{
		ID:        id,
		Periodo:   periodo,
		Desde:     desde,
		Hasta:     hasta,
		Estado:    "cerrado",
		Lineas:    lineas,
		Total:     total,
		CreadoEn:  time.Now(),
		CreadoPor: &por,
	}
	m.cortes[id] = c
	return m.clonarCorteLocked(c), nil
}

func (m *MemoryStore) MarcarLineaCortePagada(ctx context.Context, corteID int64, perfilID, adminID string) (*Corte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	c, ok := m.cortes[corteID]
	if !ok {
		return nil, ErrNotFound
	}
	ahora := time.Now()
	encontrada := false
	for _, l := range c.Lineas {
		if l.PerfilID == perfilID {
			l.PagadaEn = &ahora
			por := adminID
			l.PagadaPor = &por
			encontrada = true
		}
	}
	if !encontrada {
		return nil, ErrNotFound
	}
	return m.clonarCorteLocked(c), nil
}

// ---------- Avisos push ----------

func (m *MemoryStore) GuardarSuscripcionPush(ctx context.Context, s *SuscripcionPush) (*SuscripcionPush, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if s == nil || strings.TrimSpace(s.Endpoint) == "" || strings.TrimSpace(s.P256DH) == "" || strings.TrimSpace(s.Auth) == "" {
		return nil, fmt.Errorf("%w: la suscripción está incompleta", ErrValidation)
	}
	// Un endpoint pertenece a un solo perfil: si ya existe, se reasigna.
	for id, existente := range m.suscripcionesPush {
		if existente.Endpoint == s.Endpoint {
			existente.PerfilID = s.PerfilID
			existente.P256DH = s.P256DH
			existente.Auth = s.Auth
			existente.UserAgent = s.UserAgent
			copia := *existente
			_ = id
			return &copia, nil
		}
	}
	id := m.nextPushID
	m.nextPushID++
	nueva := *s
	nueva.ID = id
	if nueva.CreadoEn.IsZero() {
		nueva.CreadoEn = time.Now()
	}
	m.suscripcionesPush[id] = &nueva
	copia := nueva
	return &copia, nil
}

func (m *MemoryStore) EliminarSuscripcionPush(ctx context.Context, endpoint string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, s := range m.suscripcionesPush {
		if s.Endpoint == endpoint {
			delete(m.suscripcionesPush, id)
			return nil
		}
	}
	return nil
}

func (m *MemoryStore) ListarSuscripcionesPush(ctx context.Context, perfilID string) ([]*SuscripcionPush, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	res := make([]*SuscripcionPush, 0)
	for _, s := range m.suscripcionesPush {
		if perfilID != "" && s.PerfilID != perfilID {
			continue
		}
		copia := *s
		res = append(res, &copia)
	}
	sort.Slice(res, func(i, j int) bool { return res[i].ID < res[j].ID })
	return res, nil
}

// RegistrarAvisoEnviado devuelve true la primera vez que se registra la clave.
func (m *MemoryStore) RegistrarAvisoEnviado(ctx context.Context, clave string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.avisosEnviados[clave] {
		return false, nil
	}
	m.avisosEnviados[clave] = true
	return true, nil
}

func (m *MemoryStore) TareasPorVencer(ctx context.Context, fecha string) ([]*Tarea, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var res []*Tarea
	for _, t := range m.tareas {
		if t.Estado != EstadoTareaPendiente && t.Estado != EstadoTareaRechazada {
			continue
		}
		if t.FechaLimite == nil || *t.FechaLimite != fecha {
			continue
		}
		res = append(res, m.clonarTareaLocked(t))
	}
	sort.Slice(res, func(i, j int) bool { return res[i].ID < res[j].ID })
	return res, nil
}
