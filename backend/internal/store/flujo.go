package store

import "context"

// ActualizarTarea no permite cambiar el estado ni los valores de una factura.
func (m *MemoryStore) ActualizarTarea(ctx context.Context, id int64, campos map[string]any) (*Tarea, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.tareas[id]
	if !ok {
		return nil, ErrNotFound
	}
	if t.Estado != EstadoTareaPendiente && t.Estado != EstadoTareaRechazada {
		return nil, ErrConflict
	}
	if v, ok := campos["tipo_id"].(int); ok {
		t.TipoID = v
	}
	if v, ok := campos["asignado_a"].(string); ok && v != t.AsignadoA {
		t.AsignadoA = v
		t.AsignadorID = nil
		if actor, ok := campos["asignador_id"].(string); ok {
			t.AsignadorID = &actor
		}
	}
	if v, ok := campos["titulo"].(string); ok {
		t.Titulo = v
	}
	for k, dst := range map[string]**string{"descripcion": &t.Descripcion, "fecha_limite": &t.FechaLimite, "drive_carpeta_id": &t.DriveCarpetaID, "drive_carpeta_url": &t.DriveCarpetaURL} {
		if v, ok := campos[k]; ok {
			if v == nil {
				*dst = nil
			} else if texto, ok := v.(string); ok {
				*dst = &texto
			}
		}
	}
	if v, ok := campos["drive_referencias"].([]ReferenciaDriveTrabajo); ok {
		t.DriveReferencias = append([]ReferenciaDriveTrabajo{}, v...)
	}
	return m.clonarTareaLocked(t), nil
}
