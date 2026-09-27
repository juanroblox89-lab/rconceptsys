// Memoria — F3 biblioteca: semillas demo + CRUD en memoria.
// Semillas: contenido real de contenido/formatos-y-hooks.js (formatos RC-01,
// ED-02 + 2 hooks) + 2 SOPs de ejemplo (grabación y entrega de edición),
// todo marcado demo=true y publicado (BRIEF F3 §1).
package store

import (
	"sort"

	"rconceptsys/backend/internal/biblioteca"
)

// UUID estables de las semillas demo F3.
const (
	SemillaFormatoRC01 = "b1000000-0000-4000-8000-000000000001"
	SemillaFormatoED02 = "b1000000-0000-4000-8000-000000000002"
	SemillaHookSabias  = "b2000000-0000-4000-8000-000000000001"
	SemillaHookError   = "b2000000-0000-4000-8000-000000000002"
	SemillaSOPGrab     = "b3000000-0000-4000-8000-000000000001"
	SemillaSOPEntrega  = "b3000000-0000-4000-8000-000000000002"
)

// semillasF3 carga formatos/hooks/SOPs demo. Sin mutex: solo la llama
// NuevaMemoria antes de publicar el store.
func (m *Memoria) semillasF3(fija string) {
	m.formatos[SemillaFormatoRC01] = biblioteca.Formato{
		ID: SemillaFormatoRC01, Codigo: "RC-01", Nombre: "Recorrido Comercial",
		Objetivo:          "Generar autoridad y mostrar infraestructura.",
		Estructura:        "Intro Gancho\nRecorrido POV\nBeneficios\nCTA",
		HooksRecomendados: "Problema-Solución, POV Curiosidad",
		KPIs:              "Retención > 45%",
		Etiquetas:         []string{"recorrido", "comercial", "autoridad"},
		Estado:            biblioteca.EstadoPublicado,
		PublicadoPor:      SemillaDuenoID,
		Demo:              true, CreatedAt: fija, UpdatedAt: fija, CreatedBy: SemillaDuenoID,
	}
	m.formatos[SemillaFormatoED02] = biblioteca.Formato{
		ID: SemillaFormatoED02, Codigo: "ED-02", Nombre: "Educativo Rápido",
		Objetivo:          "Posicionamiento experto y valor gratuito.",
		Estructura:        "Hook Educación\nPaso 1\nPaso 2\nPaso 3\nCTA",
		HooksRecomendados: "Sabías que?, Error común",
		KPIs:              "Guardados > Compartidos",
		Etiquetas:         []string{"educativo", "experto"},
		Estado:            biblioteca.EstadoPublicado,
		PublicadoPor:      SemillaDuenoID,
		Demo:              true, CreatedAt: fija, UpdatedAt: fija, CreatedBy: SemillaDuenoID,
	}
	m.ordenForm = append(m.ordenForm, SemillaFormatoRC01, SemillaFormatoED02)

	m.hooks[SemillaHookSabias] = biblioteca.Hook{
		ID: SemillaHookSabias, Titulo: "¿Sabías que el 90% de...?",
		Categoria: "Descubrimiento", Psicologia: "Curiosidad por estadística chocante.",
		RetencionEsperada: "Alta",
		Variaciones:       "¿Sabías que la mayoría de...? / El 90% de la gente no sabe que...",
		Etiquetas:         []string{"curiosidad", "dato"},
		Estado:            biblioteca.EstadoPublicado,
		PublicadoPor:      SemillaDuenoID,
		Demo:              true, CreatedAt: fija, UpdatedAt: fija, CreatedBy: SemillaDuenoID,
	}
	m.hooks[SemillaHookError] = biblioteca.Hook{
		ID: SemillaHookError, Titulo: "Deja de cometer este error en...",
		Categoria: "Problema", Psicologia: "Miedo a la pérdida o ineficiencia.",
		RetencionEsperada: "Muy Alta",
		Variaciones:       "El error que todos cometen en... / Si haces esto, estás perdiendo...",
		Etiquetas:         []string{"error", "problema"},
		Estado:            biblioteca.EstadoPublicado,
		PublicadoPor:      SemillaDuenoID,
		Demo:              true, CreatedAt: fija, UpdatedAt: fija, CreatedBy: SemillaDuenoID,
	}
	m.ordenHook = append(m.ordenHook, SemillaHookSabias, SemillaHookError)

	m.sops[SemillaSOPGrab] = biblioteca.SOP{
		ID: SemillaSOPGrab, Titulo: "Checklist de grabación", Oficio: "grabacion",
		TiempoEstimadoMin: intPtr(30),
		Etiquetas:        []string{"grabacion", "checklist"},
		Estado:           biblioteca.EstadoPublicado,
		PublicadoPor:     SemillaDuenoID,
		Demo:             true, CreatedAt: fija, UpdatedAt: fija, CreatedBy: SemillaDuenoID,
	}
	m.sops[SemillaSOPEntrega] = biblioteca.SOP{
		ID: SemillaSOPEntrega, Titulo: "Checklist de entrega de edición", Oficio: "edicion",
		TiempoEstimadoMin: intPtr(15),
		Etiquetas:        []string{"edicion", "entrega"},
		Estado:           biblioteca.EstadoPublicado,
		PublicadoPor:     SemillaDuenoID,
		Demo:             true, CreatedAt: fija, UpdatedAt: fija, CreatedBy: SemillaDuenoID,
	}
	m.ordenSOP = append(m.ordenSOP, SemillaSOPGrab, SemillaSOPEntrega)

	pasosGrab := []struct {
		titulo, desc string
	}{
		{"Batería y memoria", "Batería cargada + memoria con espacio antes de salir."},
		{"Audio de prueba", "Grabar 10 segundos y escuchar con audífonos."},
		{"Toma principal + apoyo", "Principal con material completo; apoyo solo minutos."},
		{"Minutos registrados", "Anotar los minutos grabados para la entrega."},
	}
	for i, p := range pasosGrab {
		id := "b4000000-0000-4000-8000-00000000000" + string(rune('1'+i))
		m.sopPasos[id] = biblioteca.SOPPaso{
			ID: id, SOPID: SemillaSOPGrab, Orden: i + 1,
			Titulo: p.titulo, Descripcion: p.desc, CreatedAt: fija,
		}
	}
	pasosEntrega := []struct {
		titulo, desc string
	}{
		{"Export en 1080p", "Exportar en 1080p, bitrate alto, nombre con fecha."},
		{"Subir link del entregable", "Subir a Drive y pegar el link en la tarea."},
		{"Revisar subtítulos", "Subtítulos legibles en celular, sin faltas."},
		{"Pedir revisión", "Marcar la tarea como entregada para revisión."},
	}
	for i, p := range pasosEntrega {
		id := "b4000000-0000-4000-8000-00000000001" + string(rune('1'+i))
		m.sopPasos[id] = biblioteca.SOPPaso{
			ID: id, SOPID: SemillaSOPEntrega, Orden: i + 1,
			Titulo: p.titulo, Descripcion: p.desc, CreatedAt: fija,
		}
	}
}

// --- helpers de clonado (evitan aliasing de slices) ---

func clonarStrings(in []string) []string {
	if in == nil {
		return []string{}
	}
	out := make([]string, len(in))
	copy(out, in)
	return out
}

func clonarFormato(f biblioteca.Formato) biblioteca.Formato {
	f.Ejemplos = clonarStrings(f.Ejemplos)
	f.Etiquetas = clonarStrings(f.Etiquetas)
	return f
}

func clonarHook(h biblioteca.Hook) biblioteca.Hook {
	h.Ejemplos = clonarStrings(h.Ejemplos)
	h.Etiquetas = clonarStrings(h.Etiquetas)
	return h
}

func clonarReferencia(r biblioteca.Referencia) biblioteca.Referencia {
	r.Etiquetas = clonarStrings(r.Etiquetas)
	return r
}

func clonarSOP(s biblioteca.SOP) biblioteca.SOP {
	s.Etiquetas = clonarStrings(s.Etiquetas)
	return s
}

func clonarEjecucion(e biblioteca.SOPEjecucion) biblioteca.SOPEjecucion {
	e.Pasos = clonarStrings(e.Pasos)
	return e
}

// --- Formatos ---

func (m *Memoria) ListFormatos() ([]biblioteca.Formato, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []biblioteca.Formato{}
	for _, id := range m.ordenForm {
		out = append(out, clonarFormato(m.formatos[id]))
	}
	return out, nil
}

func (m *Memoria) GetFormato(id string) (biblioteca.Formato, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	f, ok := m.formatos[id]
	if !ok {
		return biblioteca.Formato{}, false, nil
	}
	return clonarFormato(f), true, nil
}

func (m *Memoria) CreateFormato(f biblioteca.Formato) (biblioteca.Formato, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if f.ID == "" {
		f.ID = NewUUID()
	}
	if f.Estado == "" {
		f.Estado = biblioteca.EstadoBorrador
	}
	if f.CreatedAt == "" {
		f.CreatedAt = Ahora()
	}
	f.UpdatedAt = Ahora()
	if f.Ejemplos == nil {
		f.Ejemplos = []string{}
	}
	if f.Etiquetas == nil {
		f.Etiquetas = []string{}
	}
	if _, existe := m.formatos[f.ID]; !existe {
		m.ordenForm = append(m.ordenForm, f.ID)
	}
	m.formatos[f.ID] = f
	return clonarFormato(f), nil
}

func (m *Memoria) UpdateFormato(id string, cambios map[string]any) (biblioteca.Formato, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	f, ok := m.formatos[id]
	if !ok {
		return biblioteca.Formato{}, ErrNoExiste
	}
	f = aplicaFormato(f, cambios)
	f.UpdatedAt = Ahora()
	m.formatos[id] = f
	return clonarFormato(f), nil
}

func aplicaFormato(f biblioteca.Formato, cambios map[string]any) biblioteca.Formato {
	if v, ok := cambios["nombre"].(string); ok {
		f.Nombre = v
	}
	if v, ok := cambios["codigo"].(string); ok {
		f.Codigo = v
	}
	if v, ok := cambios["objetivo"].(string); ok {
		f.Objetivo = v
	}
	if v, ok := cambios["estructura"].(string); ok {
		f.Estructura = v
	}
	if v, ok := cambios["hooks_recomendados"].(string); ok {
		f.HooksRecomendados = v
	}
	if v, ok := cambios["kpis"].(string); ok {
		f.KPIs = v
	}
	if v, ok := cambios["estado"].(string); ok {
		f.Estado = v
	}
	if v, ok := cambios["propuesto_por"].(string); ok {
		f.PropuestoPor = v
	}
	if v, ok := cambios["publicado_por"].(string); ok {
		f.PublicadoPor = v
	}
	if v, ok := cambios["motivo_rechazo"].(string); ok {
		f.MotivoRechazo = v
	}
	if v, ok := cambios["ejemplos"].([]string); ok {
		f.Ejemplos = v
	}
	if v, ok := cambios["etiquetas"].([]string); ok {
		f.Etiquetas = v
	}
	return f
}

// --- Hooks ---

func (m *Memoria) ListHooks() ([]biblioteca.Hook, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []biblioteca.Hook{}
	for _, id := range m.ordenHook {
		out = append(out, clonarHook(m.hooks[id]))
	}
	return out, nil
}

func (m *Memoria) GetHook(id string) (biblioteca.Hook, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	h, ok := m.hooks[id]
	if !ok {
		return biblioteca.Hook{}, false, nil
	}
	return clonarHook(h), true, nil
}

func (m *Memoria) CreateHook(h biblioteca.Hook) (biblioteca.Hook, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if h.ID == "" {
		h.ID = NewUUID()
	}
	if h.Estado == "" {
		h.Estado = biblioteca.EstadoBorrador
	}
	if h.CreatedAt == "" {
		h.CreatedAt = Ahora()
	}
	h.UpdatedAt = Ahora()
	if h.Ejemplos == nil {
		h.Ejemplos = []string{}
	}
	if h.Etiquetas == nil {
		h.Etiquetas = []string{}
	}
	if _, existe := m.hooks[h.ID]; !existe {
		m.ordenHook = append(m.ordenHook, h.ID)
	}
	m.hooks[h.ID] = h
	return clonarHook(h), nil
}

func (m *Memoria) UpdateHook(id string, cambios map[string]any) (biblioteca.Hook, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	h, ok := m.hooks[id]
	if !ok {
		return biblioteca.Hook{}, ErrNoExiste
	}
	h = aplicaHook(h, cambios)
	h.UpdatedAt = Ahora()
	m.hooks[id] = h
	return clonarHook(h), nil
}

func aplicaHook(h biblioteca.Hook, cambios map[string]any) biblioteca.Hook {
	if v, ok := cambios["titulo"].(string); ok {
		h.Titulo = v
	}
	if v, ok := cambios["categoria"].(string); ok {
		h.Categoria = v
	}
	if v, ok := cambios["psicologia"].(string); ok {
		h.Psicologia = v
	}
	if v, ok := cambios["retencion_esperada"].(string); ok {
		h.RetencionEsperada = v
	}
	if v, ok := cambios["variaciones"].(string); ok {
		h.Variaciones = v
	}
	if v, ok := cambios["estado"].(string); ok {
		h.Estado = v
	}
	if v, ok := cambios["propuesto_por"].(string); ok {
		h.PropuestoPor = v
	}
	if v, ok := cambios["publicado_por"].(string); ok {
		h.PublicadoPor = v
	}
	if v, ok := cambios["motivo_rechazo"].(string); ok {
		h.MotivoRechazo = v
	}
	if v, ok := cambios["ejemplos"].([]string); ok {
		h.Ejemplos = v
	}
	if v, ok := cambios["etiquetas"].([]string); ok {
		h.Etiquetas = v
	}
	return h
}

// --- Referencias ---

func (m *Memoria) ListReferencias() ([]biblioteca.Referencia, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []biblioteca.Referencia{}
	for _, id := range m.ordenRef {
		out = append(out, clonarReferencia(m.referencias[id]))
	}
	return out, nil
}

func (m *Memoria) GetReferencia(id string) (biblioteca.Referencia, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	r, ok := m.referencias[id]
	if !ok {
		return biblioteca.Referencia{}, false, nil
	}
	return clonarReferencia(r), true, nil
}

func (m *Memoria) CreateReferencia(r biblioteca.Referencia) (biblioteca.Referencia, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if r.ID == "" {
		r.ID = NewUUID()
	}
	if r.Estado == "" {
		r.Estado = biblioteca.EstadoBorrador
	}
	if r.Plataforma == "" {
		r.Plataforma = biblioteca.PlatOtra
	}
	if r.CreatedAt == "" {
		r.CreatedAt = Ahora()
	}
	r.UpdatedAt = Ahora()
	if r.Etiquetas == nil {
		r.Etiquetas = []string{}
	}
	if _, existe := m.referencias[r.ID]; !existe {
		m.ordenRef = append(m.ordenRef, r.ID)
	}
	m.referencias[r.ID] = r
	return clonarReferencia(r), nil
}

func (m *Memoria) UpdateReferencia(id string, cambios map[string]any) (biblioteca.Referencia, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.referencias[id]
	if !ok {
		return biblioteca.Referencia{}, ErrNoExiste
	}
	r = aplicaReferencia(r, cambios)
	r.UpdatedAt = Ahora()
	m.referencias[id] = r
	return clonarReferencia(r), nil
}

func aplicaReferencia(r biblioteca.Referencia, cambios map[string]any) biblioteca.Referencia {
	if v, ok := cambios["titulo"].(string); ok {
		r.Titulo = v
	}
	if v, ok := cambios["link"].(string); ok {
		r.Link = v
	}
	if v, ok := cambios["plataforma"].(string); ok {
		r.Plataforma = v
	}
	if v, ok := cambios["analisis"].(string); ok {
		r.Analisis = v
	}
	if v, ok := cambios["cliente_id"].(string); ok {
		r.ClienteID = v
	}
	if v, ok := cambios["estado"].(string); ok {
		r.Estado = v
	}
	if v, ok := cambios["propuesto_por"].(string); ok {
		r.PropuestoPor = v
	}
	if v, ok := cambios["publicado_por"].(string); ok {
		r.PublicadoPor = v
	}
	if v, ok := cambios["motivo_rechazo"].(string); ok {
		r.MotivoRech = v
	}
	if v, ok := cambios["etiquetas"].([]string); ok {
		r.Etiquetas = v
	}
	return r
}

// --- SOPs ---

func (m *Memoria) ListSOPs() ([]biblioteca.SOP, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []biblioteca.SOP{}
	for _, id := range m.ordenSOP {
		out = append(out, clonarSOP(m.sops[id]))
	}
	return out, nil
}

func (m *Memoria) GetSOP(id string) (biblioteca.SOP, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.sops[id]
	if !ok {
		return biblioteca.SOP{}, false, nil
	}
	return clonarSOP(s), true, nil
}

func (m *Memoria) CreateSOP(s biblioteca.SOP) (biblioteca.SOP, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s.ID == "" {
		s.ID = NewUUID()
	}
	if s.Estado == "" {
		s.Estado = biblioteca.EstadoBorrador
	}
	if s.Oficio == "" {
		s.Oficio = biblioteca.OficioTodos
	}
	if s.CreatedAt == "" {
		s.CreatedAt = Ahora()
	}
	s.UpdatedAt = Ahora()
	if s.Etiquetas == nil {
		s.Etiquetas = []string{}
	}
	if _, existe := m.sops[s.ID]; !existe {
		m.ordenSOP = append(m.ordenSOP, s.ID)
	}
	m.sops[s.ID] = s
	return clonarSOP(s), nil
}

func (m *Memoria) UpdateSOP(id string, cambios map[string]any) (biblioteca.SOP, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sops[id]
	if !ok {
		return biblioteca.SOP{}, ErrNoExiste
	}
	s = aplicaSOP(s, cambios)
	s.UpdatedAt = Ahora()
	m.sops[id] = s
	return clonarSOP(s), nil
}

func aplicaSOP(s biblioteca.SOP, cambios map[string]any) biblioteca.SOP {
	if v, ok := cambios["titulo"].(string); ok {
		s.Titulo = v
	}
	if v, ok := cambios["oficio"].(string); ok {
		s.Oficio = v
	}
	if v, ok := cambios["tiempo_estimado_min"]; ok {
		switch n := v.(type) {
		case int:
			cp := n
			s.TiempoEstimadoMin = &cp
		case float64:
			cp := int(n)
			s.TiempoEstimadoMin = &cp
		case nil:
			s.TiempoEstimadoMin = nil
		}
	}
	if v, ok := cambios["estado"].(string); ok {
		s.Estado = v
	}
	if v, ok := cambios["propuesto_por"].(string); ok {
		s.PropuestoPor = v
	}
	if v, ok := cambios["publicado_por"].(string); ok {
		s.PublicadoPor = v
	}
	if v, ok := cambios["motivo_rechazo"].(string); ok {
		s.MotivoRechazo = v
	}
	if v, ok := cambios["etiquetas"].([]string); ok {
		s.Etiquetas = v
	}
	return s
}

// --- Pasos de SOP ---

func (m *Memoria) ListSOPPasos(sopID string) ([]biblioteca.SOPPaso, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []biblioteca.SOPPaso{}
	for _, p := range m.sopPasos {
		if p.SOPID == sopID {
			out = append(out, p)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Orden < out[j].Orden })
	return out, nil
}

func (m *Memoria) CreateSOPPaso(p biblioteca.SOPPaso) (biblioteca.SOPPaso, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if p.ID == "" {
		p.ID = NewUUID()
	}
	if p.Orden <= 0 {
		max := 0
		for _, e := range m.sopPasos {
			if e.SOPID == p.SOPID && e.Orden > max {
				max = e.Orden
			}
		}
		p.Orden = max + 1
	}
	if p.CreatedAt == "" {
		p.CreatedAt = Ahora()
	}
	m.sopPasos[p.ID] = p
	return p, nil
}

func (m *Memoria) UpdateSOPPaso(id string, cambios map[string]any) (biblioteca.SOPPaso, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.sopPasos[id]
	if !ok {
		return biblioteca.SOPPaso{}, ErrNoExiste
	}
	if v, ok := cambios["titulo"].(string); ok {
		p.Titulo = v
	}
	if v, ok := cambios["descripcion"].(string); ok {
		p.Descripcion = v
	}
	if v, ok := cambios["orden"]; ok {
		switch n := v.(type) {
		case int:
			p.Orden = n
		case float64:
			p.Orden = int(n)
		}
	}
	m.sopPasos[id] = p
	return p, nil
}

// --- Ejecuciones ---

func (m *Memoria) ListSOPEjecuciones() ([]biblioteca.SOPEjecucion, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []biblioteca.SOPEjecucion{}
	for _, id := range m.ordenEjec {
		e := clonarEjecucion(m.ejecuciones[id])
		e.Pasos = m.pasosDe(id)
		out = append(out, e)
	}
	return out, nil
}

func (m *Memoria) GetSOPEjecucion(id string) (biblioteca.SOPEjecucion, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	e, ok := m.ejecuciones[id]
	if !ok {
		return biblioteca.SOPEjecucion{}, false, nil
	}
	e = clonarEjecucion(e)
	e.Pasos = m.pasosDe(id)
	return e, true, nil
}

// pasosDe junta los pasos marcados de una ejecución (solo lectura interna;
// se llama con el lock ya tomado).
func (m *Memoria) pasosDe(ejecucionID string) []string {
	out := []string{}
	for _, mp := range m.marcados {
		if mp.EjecucionID == ejecucionID {
			out = append(out, mp.PasoID)
		}
	}
	sort.Strings(out)
	if out == nil {
		out = []string{}
	}
	return out
}

func (m *Memoria) CreateSOPEjecucion(e biblioteca.SOPEjecucion) (biblioteca.SOPEjecucion, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if e.ID == "" {
		e.ID = NewUUID()
	}
	if e.Estado == "" {
		e.Estado = biblioteca.EjecEnCurso
	}
	if e.IniciadaAt == "" {
		e.IniciadaAt = Ahora()
	}
	if e.CreatedAt == "" {
		e.CreatedAt = Ahora()
	}
	e.UpdatedAt = Ahora()
	if _, existe := m.ejecuciones[e.ID]; !existe {
		m.ordenEjec = append(m.ordenEjec, e.ID)
	}
	m.ejecuciones[e.ID] = e
	e.Pasos = []string{}
	return e, nil
}

func (m *Memoria) UpdateSOPEjecucion(id string, cambios map[string]any) (biblioteca.SOPEjecucion, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.ejecuciones[id]
	if !ok {
		return biblioteca.SOPEjecucion{}, ErrNoExiste
	}
	if v, ok := cambios["estado"].(string); ok {
		e.Estado = v
	}
	if v, ok := cambios["terminada_at"].(string); ok {
		e.TerminadaAt = v
	}
	if v, ok := cambios["tarea_id"].(string); ok {
		e.TareaID = v
	}
	e.UpdatedAt = Ahora()
	m.ejecuciones[id] = e
	e = clonarEjecucion(e)
	e.Pasos = m.pasosDe(id)
	return e, nil
}

func (m *Memoria) MarcarPaso(ejecucionID, pasoID string) (biblioteca.SOPEjecucionPaso, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.ejecuciones[ejecucionID]; !ok {
		return biblioteca.SOPEjecucionPaso{}, ErrNoExiste
	}
	for _, mp := range m.marcados {
		if mp.EjecucionID == ejecucionID && mp.PasoID == pasoID {
			return mp, nil
		}
	}
	mp := biblioteca.SOPEjecucionPaso{
		ID: NewUUID(), EjecucionID: ejecucionID, PasoID: pasoID, MarcadoAt: Ahora(),
	}
	m.marcados[mp.ID] = mp
	return mp, nil
}

func (m *Memoria) DesmarcarPaso(ejecucionID, pasoID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, mp := range m.marcados {
		if mp.EjecucionID == ejecucionID && mp.PasoID == pasoID {
			delete(m.marcados, id)
			return nil
		}
	}
	return nil
}

func (m *Memoria) ListPasosMarcados(ejecucionID string) ([]biblioteca.SOPEjecucionPaso, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []biblioteca.SOPEjecucionPaso{}
	for _, mp := range m.marcados {
		if mp.EjecucionID == ejecucionID {
			out = append(out, mp)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].MarcadoAt < out[j].MarcadoAt })
	return out, nil
}
