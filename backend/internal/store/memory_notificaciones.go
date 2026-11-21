package store

import (
	"context"
	"fmt"
	"sort"
	"time"
)

func (m *MemoryStore) TareasVencidas(_ context.Context, fecha string) ([]*Tarea, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var tareas []*Tarea
	for _, t := range m.tareas {
		if (t.Estado == EstadoTareaPendiente || t.Estado == EstadoTareaRechazada) && t.FechaLimite != nil && *t.FechaLimite < fecha {
			tareas = append(tareas, m.clonarTareaLocked(t))
		}
	}
	sort.Slice(tareas, func(i, j int) bool { return tareas[i].ID < tareas[j].ID })
	return tareas, nil
}

type controlNotificaciones struct {
	valor string
	hasta time.Time
}

type memoriaNotificaciones struct {
	avisos       []Notificacion
	eventos      map[[2]string]bool
	preferencias map[string]PreferenciasNotificaciones
	entregas     map[[2]int64]bool
	control      map[string]controlNotificaciones
}

func (m *MemoryStore) notificacionesLocked() *memoriaNotificaciones {
	if m.notificaciones == nil {
		m.notificaciones = &memoriaNotificaciones{
			eventos: map[[2]string]bool{}, preferencias: map[string]PreferenciasNotificaciones{}, entregas: map[[2]int64]bool{}, control: map[string]controlNotificaciones{},
		}
	}
	return m.notificaciones
}

func (m *MemoryStore) EncolarNotificacion(_ context.Context, n Notificacion, clave string, ventana time.Duration) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.notificacionesLocked()
	k := [2]string{n.PerfilID, clave}
	if clave != "" && s.eventos[k] {
		return nil
	}
	if clave != "" {
		s.eventos[k] = true
	}
	if s.preferencias[n.PerfilID].Silencia(n.Tipo) {
		return nil
	}
	ahora := time.Now()
	if n.Grupo != "" && ventana > 0 {
		for i := len(s.avisos) - 1; i >= 0; i-- {
			a := &s.avisos[i]
			if a.PerfilID == n.PerfilID && a.Tipo == n.Tipo && a.Grupo == n.Grupo && a.LeidaEn == nil && a.FinalizadaEn == nil && a.Intentos == 0 && a.CreadaEn.Add(ventana).After(ahora) {
				a.Cantidad++
				a.ActualizadaEn = ahora
				a.URL = n.URL
				a.Titulo, a.Cuerpo = n.Titulo, n.Cuerpo
				if n.Tipo == "chat" {
					a.Titulo = fmt.Sprintf("%d mensajes nuevos", a.Cantidad)
				}
				if n.Tipo == "drive" {
					a.Cuerpo = fmt.Sprintf("%d cambios · %s", a.Cantidad, n.Cuerpo)
				}
				return nil
			}
		}
	}
	n.ID, n.Cantidad = int64(len(s.avisos)+1), 1
	n.CreadaEn, n.ActualizadaEn, n.DisponibleEn = ahora, ahora, ahora.Add(ventana)
	s.avisos = append(s.avisos, n)
	return nil
}

func (m *MemoryStore) BandejaNotificaciones(_ context.Context, perfil string) ([]Notificacion, int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.notificacionesLocked()
	r, noLeidas := []Notificacion{}, 0
	for _, n := range s.avisos {
		if n.PerfilID == perfil {
			r = append(r, n)
			if n.LeidaEn == nil {
				noLeidas++
			}
		}
	}
	sort.Slice(r, func(i, j int) bool {
		if r[i].ActualizadaEn.Equal(r[j].ActualizadaEn) {
			return r[i].ID > r[j].ID
		}
		return r[i].ActualizadaEn.After(r[j].ActualizadaEn)
	})
	if len(r) > 50 {
		r = r[:50]
	}
	return r, noLeidas, nil
}

func (m *MemoryStore) LeerNotificaciones(_ context.Context, perfil string, id int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.notificacionesLocked()
	ahora := time.Now()
	for i := range s.avisos {
		n := &s.avisos[i]
		if n.PerfilID == perfil && (id == 0 || id == n.ID) && n.LeidaEn == nil {
			n.LeidaEn = &ahora
		}
	}
	return nil
}
func (m *MemoryStore) PreferenciasNotificaciones(_ context.Context, perfil string) (PreferenciasNotificaciones, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.notificacionesLocked().preferencias[perfil], nil
}
func (m *MemoryStore) GuardarPreferenciasNotificaciones(_ context.Context, perfil string, p PreferenciasNotificaciones) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.notificacionesLocked().preferencias[perfil] = p
	return nil
}
func (m *MemoryStore) ReclamarNotificaciones(_ context.Context, limite int) ([]Notificacion, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.notificacionesLocked()
	ahora := time.Now()
	hasta := ahora.Add(90 * time.Second)
	r := []Notificacion{}
	for i := range s.avisos {
		if len(r) >= limite {
			break
		}
		n := &s.avisos[i]
		if n.FinalizadaEn == nil && !n.DisponibleEn.After(ahora) && (n.BloqueoHasta == nil || !n.BloqueoHasta.After(ahora)) {
			n.Intentos++
			n.BloqueoHasta = &hasta
			r = append(r, *n)
		}
	}
	return r, nil
}
func (m *MemoryStore) ResolverNotificacion(_ context.Context, n Notificacion, siguiente *time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.notificacionesLocked()
	if n.ID <= 0 || n.ID > int64(len(s.avisos)) {
		return ErrNotFound
	}
	actual := &s.avisos[n.ID-1]
	if actual.Intentos != n.Intentos {
		return nil
	}
	actual.BloqueoHasta = nil
	if siguiente == nil {
		ahora := time.Now()
		actual.FinalizadaEn = &ahora
	} else {
		actual.DisponibleEn = *siguiente
	}
	return nil
}
func (m *MemoryStore) NotificacionEntregada(_ context.Context, aviso, suscripcion int64) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.notificacionesLocked().entregas[[2]int64{aviso, suscripcion}], nil
}
func (m *MemoryStore) RegistrarNotificacionEntregada(_ context.Context, aviso, suscripcion int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.notificacionesLocked().entregas[[2]int64{aviso, suscripcion}] = true
	return nil
}
func (m *MemoryStore) BloquearControlNotificaciones(_ context.Context, clave string) (string, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.notificacionesLocked()
	c := s.control[clave]
	ahora := time.Now()
	if c.hasta.After(ahora) {
		return "", false, nil
	}
	c.hasta = ahora.Add(90 * time.Second)
	s.control[clave] = c
	return c.valor, true, nil
}
func (m *MemoryStore) GuardarControlNotificaciones(_ context.Context, clave, valor string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.notificacionesLocked().control[clave] = controlNotificaciones{valor: valor}
	return nil
}
