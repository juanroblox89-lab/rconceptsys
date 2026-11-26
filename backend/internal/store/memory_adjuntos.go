package store

import (
	"context"
	"fmt"
	"maps"
	"slices"
	"strings"
	"time"
)

func copiarAdjunto(a *AdjuntoAsignacion) *AdjuntoAsignacion {
	b := *a
	b.Resumen = slices.Clone(a.Resumen)
	return &b
}

func origenAdjunto(a *AdjuntoAsignacion) string {
	if a != nil && a.Origen == "rechazo" {
		return "rechazo"
	}
	return "asignacion"
}

func mismoHistorialAdjunto(a, b *int64) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

func (m *MemoryStore) ReservarAdjunto(_ context.Context, a *AdjuntoAsignacion) (*AdjuntoAsignacion, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	t := m.tareas[a.TareaID]
	origen := origenAdjunto(a)
	if origen == "rechazo" {
		if t == nil || t.Estado != EstadoTareaRechazada || a.HistorialID == nil {
			return nil, ErrCupoAdjuntos
		}
		valido := false
		for _, h := range m.historialTareas[a.TareaID] {
			if h.ID == *a.HistorialID && h.Evento == "entrega_rechazada" {
				valido = true
				break
			}
		}
		if !valido {
			return nil, ErrCupoAdjuntos
		}
	} else {
		if t == nil || (t.Estado != "pendiente" && t.Estado != "rechazada") {
			return nil, ErrCupoAdjuntos
		}
	}
	if previa := m.adjuntosAsignacion[a.ID]; previa != nil {
		if previa.TareaID != a.TareaID {
			return nil, ErrCupoAdjuntos
		}
		return copiarAdjunto(previa), nil
	}
	if m.adjuntosAsignacion == nil {
		m.adjuntosAsignacion = make(map[string]*AdjuntoAsignacion)
	}
	usados := [11]bool{}
	for _, v := range m.adjuntosAsignacion {
		if v.TareaID == a.TareaID && origenAdjunto(v) == origen && (origen != "rechazo" || mismoHistorialAdjunto(v.HistorialID, a.HistorialID)) {
			usados[v.Cupo] = true
		}
	}
	for cupo := 1; cupo <= 10; cupo++ {
		if usados[cupo] {
			continue
		}
		b := copiarAdjunto(a)
		b.Origen = origen
		if origen == "asignacion" {
			b.HistorialID = nil
		}
		b.Cupo = cupo
		b.CreadoEn = time.Now().UTC()
		b.ActualizadoEn = b.CreadoEn
		b.EstadoArchivo = "subiendo"
		b.EstadoResumen = "sin_resumen"
		m.adjuntosAsignacion[b.ID] = b
		return copiarAdjunto(b), nil
	}
	return nil, ErrCupoAdjuntos
}

func (m *MemoryStore) ListarAdjuntos(ctx context.Context, tarea int64) ([]*AdjuntoAsignacion, error) {
	return m.ListarAdjuntosPorOrigen(ctx, tarea, "asignacion", nil)
}

func (m *MemoryStore) ListarAdjuntosPorOrigen(_ context.Context, tarea int64, origen string, historialID *int64) ([]*AdjuntoAsignacion, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if origen == "" {
		origen = "asignacion"
	}
	out := make([]*AdjuntoAsignacion, 0)
	for _, a := range m.adjuntosAsignacion {
		if a.TareaID == tarea && a.EstadoArchivo == "listo" && origenAdjunto(a) == origen {
			if historialID != nil && (a.HistorialID == nil || *a.HistorialID != *historialID) {
				continue
			}
			out = append(out, copiarAdjunto(a))
		}
	}
	slices.SortFunc(out, func(a, b *AdjuntoAsignacion) int { return a.Cupo - b.Cupo })
	return out, nil
}

func (m *MemoryStore) ObtenerAdjunto(_ context.Context, tarea int64, id string) (*AdjuntoAsignacion, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	a := m.adjuntosAsignacion[id]
	if a == nil || a.TareaID != tarea {
		return nil, ErrNotFound
	}
	return copiarAdjunto(a), nil
}

func (m *MemoryStore) CambiarAdjunto(_ context.Context, a *AdjuntoAsignacion, f FiltroAdjunto) (*AdjuntoAsignacion, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	previo := m.adjuntosAsignacion[a.ID]
	if previo == nil || previo.TareaID != a.TareaID || (f.Archivo != "" && previo.EstadoArchivo != f.Archivo) ||
		(f.Resumen != "" && previo.EstadoResumen != f.Resumen) || (f.Intento != "" && (previo.ResumenIntento == nil || *previo.ResumenIntento != f.Intento)) ||
		(!f.AntesDe.IsZero() && !previo.ActualizadoEn.Before(f.AntesDe)) {
		return nil, ErrNotFound
	}
	b := copiarAdjunto(a)
	b.ActualizadoEn = time.Now().UTC()
	m.adjuntosAsignacion[a.ID] = b
	return copiarAdjunto(b), nil
}

func (m *MemoryStore) BorrarRegistroAdjunto(_ context.Context, tarea int64, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if a := m.adjuntosAsignacion[id]; a != nil && a.TareaID == tarea && a.EstadoArchivo == "borrando" {
		delete(m.adjuntosAsignacion, id)
	}
	return nil
}

func (m *MemoryStore) AdjuntosIncompletos(_ context.Context, antes time.Time) ([]*AdjuntoAsignacion, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]*AdjuntoAsignacion, 0)
	for _, a := range m.adjuntosAsignacion {
		if a.EstadoArchivo != "listo" && a.ActualizadoEn.Before(antes) {
			out = append(out, copiarAdjunto(a))
			if len(out) == 5 {
				break
			}
		}
	}
	return out, nil
}

func (m *MemoryStore) ReclamarResumenAdjunto(_ context.Context, intento string) (*AdjuntoAsignacion, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	ahora := time.Now().UTC()
	var elegido *AdjuntoAsignacion
	for _, a := range m.adjuntosAsignacion {
		if a.EstadoResumen == "procesando" && a.ResumenHasta != nil && a.ResumenHasta.After(ahora) {
			return nil, ErrNotFound
		}
		if a.EstadoArchivo != "listo" || !a.Resumir || (a.EstadoResumen != "pendiente" && a.EstadoResumen != "procesando") {
			continue
		}
		if elegido == nil || a.ActualizadoEn.Before(elegido.ActualizadoEn) {
			elegido = a
		}
	}
	if elegido == nil {
		return nil, ErrNotFound
	}
	vence := ahora.Add(3 * time.Minute)
	elegido.EstadoResumen, elegido.ResumenIntento, elegido.ResumenHasta, elegido.ActualizadoEn = "procesando", &intento, &vence, ahora
	return copiarAdjunto(elegido), nil
}

func (m *MemoryStore) GuardarObjetoAdjunto(_ context.Context, ruta, _ string, datos []byte, reemplazar bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.objetosAsignacion == nil {
		m.objetosAsignacion = make(map[string][]byte)
	}
	if _, existe := m.objetosAsignacion[ruta]; existe && !reemplazar {
		return fmt.Errorf("objeto existente")
	}
	m.objetosAsignacion[ruta] = slices.Clone(datos)
	return nil
}

func (m *MemoryStore) LeerObjetoAdjunto(_ context.Context, ruta string, maximo int) ([]byte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	b, ok := m.objetosAsignacion[ruta]
	if !ok {
		return nil, ErrNotFound
	}
	if len(b) > maximo {
		return nil, fmt.Errorf("objeto excede el límite")
	}
	return slices.Clone(b), nil
}

func (m *MemoryStore) BorrarObjetosAdjunto(_ context.Context, rutas []string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	mapas := make(map[string]bool, len(rutas))
	for _, r := range rutas {
		mapas[r] = true
	}
	maps.DeleteFunc(m.objetosAsignacion, func(k string, _ []byte) bool { return mapas[k] })
	return nil
}

func (m *MemoryStore) FirmarObjetoAdjunto(_ context.Context, ruta, _ string, _ int) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if _, ok := m.objetosAsignacion[ruta]; !ok {
		return "", ErrNotFound
	}
	// Ruta local, solo para el store demo. La ruta de medios vuelve a verificar la sesión.
	partes := strings.Split(ruta, "/")
	return fmt.Sprintf("/api/tareas/%s/adjuntos/%s/medio", partes[0], partes[1]), nil
}
