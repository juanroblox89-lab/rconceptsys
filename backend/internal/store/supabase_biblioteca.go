// Supabase — F3 biblioteca: CRUD REST contra las tablas de 004_biblioteca.sql.
// Mismo patrón F1/F2 (service role; filtros finos en el handler, no aquí).
package store

import (
	"net/http"
	"net/url"

	"rconceptsys/backend/internal/biblioteca"
)

// --- formatos ---

type formatoFila struct {
	ID                string   `json:"id"`
	Codigo            string   `json:"codigo"`
	Nombre            string   `json:"nombre"`
	Objetivo          string   `json:"objetivo"`
	Estructura        string   `json:"estructura"`
	HooksRecomendados string   `json:"hooks_recomendados"`
	KPIs              string   `json:"kpis"`
	Ejemplos          []string `json:"ejemplos"`
	Etiquetas         []string `json:"etiquetas"`
	Estado            string   `json:"estado"`
	PropuestoPor      string   `json:"propuesto_por"`
	PublicadoPor      string   `json:"publicado_por"`
	MotivoRechazo     string   `json:"motivo_rechazo"`
	Demo              bool     `json:"demo"`
	CreatedAt         string   `json:"created_at"`
	UpdatedAt         string   `json:"updated_at"`
	CreatedBy         string   `json:"created_by"`
}

func (f formatoFila) aFormato() biblioteca.Formato {
	return biblioteca.Formato{
		ID: f.ID, Codigo: f.Codigo, Nombre: f.Nombre, Objetivo: f.Objetivo,
		Estructura: f.Estructura, HooksRecomendados: f.HooksRecomendados,
		KPIs: f.KPIs, Ejemplos: nulosALista(f.Ejemplos), Etiquetas: nulosALista(f.Etiquetas),
		Estado: f.Estado, PropuestoPor: f.PropuestoPor, PublicadoPor: f.PublicadoPor,
		MotivoRechazo: f.MotivoRechazo, Demo: f.Demo,
		CreatedAt: f.CreatedAt, UpdatedAt: f.UpdatedAt, CreatedBy: f.CreatedBy,
	}
}

func nulosALista(in []string) []string {
	if in == nil {
		return []string{}
	}
	return in
}

func filaDeFormato(f biblioteca.Formato) map[string]any {
	return map[string]any{
		"id": f.ID, "codigo": nuloSiVacio(f.Codigo), "nombre": f.Nombre,
		"objetivo": f.Objetivo, "estructura": f.Estructura,
		"hooks_recomendados": f.HooksRecomendados, "kpis": f.KPIs,
		"ejemplos": f.Ejemplos, "etiquetas": f.Etiquetas, "estado": f.Estado,
		"propuesto_por": nuloSiVacio(f.PropuestoPor),
		"publicado_por": nuloSiVacio(f.PublicadoPor),
		"motivo_rechazo": nuloSiVacio(f.MotivoRechazo),
		"demo": f.Demo, "created_by": nuloSiVacio(f.CreatedBy),
	}
}

func (s *Supabase) ListFormatos() ([]biblioteca.Formato, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "order": {"created_at"}}
	var filas []formatoFila
	if err := s.c.REST(ctx, http.MethodGet, "formatos", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []biblioteca.Formato{}
	for _, f := range filas {
		out = append(out, f.aFormato())
	}
	return out, nil
}

func (s *Supabase) GetFormato(id string) (biblioteca.Formato, bool, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "id": {"eq." + id}}
	var filas []formatoFila
	if err := s.c.REST(ctx, http.MethodGet, "formatos", q, nil, "", &filas); err != nil {
		return biblioteca.Formato{}, false, err
	}
	if len(filas) == 0 {
		return biblioteca.Formato{}, false, nil
	}
	return filas[0].aFormato(), true, nil
}

func (s *Supabase) CreateFormato(f biblioteca.Formato) (biblioteca.Formato, error) {
	if f.ID == "" {
		f.ID = NewUUID()
	}
	if f.Estado == "" {
		f.Estado = biblioteca.EstadoBorrador
	}
	ctx, cancel := contexto()
	defer cancel()
	var filas []formatoFila
	if err := s.c.REST(ctx, http.MethodPost, "formatos", nil, filaDeFormato(f), "return=representation", &filas); err != nil {
		return biblioteca.Formato{}, err
	}
	if len(filas) == 0 {
		return f, nil
	}
	return filas[0].aFormato(), nil
}

func (s *Supabase) UpdateFormato(id string, cambios map[string]any) (biblioteca.Formato, error) {
	ctx, cancel := contexto()
	defer cancel()
	var filas []formatoFila
	if err := s.c.REST(ctx, http.MethodPatch, "formatos", url.Values{"id": {"eq." + id}}, cambios, "return=representation", &filas); err != nil {
		return biblioteca.Formato{}, err
	}
	if len(filas) == 0 {
		return biblioteca.Formato{}, ErrNoExiste
	}
	return filas[0].aFormato(), nil
}

// --- hooks ---

type hookFila struct {
	ID                string   `json:"id"`
	Titulo            string   `json:"titulo"`
	Categoria         string   `json:"categoria"`
	Psicologia        string   `json:"psicologia"`
	RetencionEsperada string   `json:"retencion_esperada"`
	Variaciones       string   `json:"variaciones"`
	Ejemplos          []string `json:"ejemplos"`
	Etiquetas         []string `json:"etiquetas"`
	Estado            string   `json:"estado"`
	PropuestoPor      string   `json:"propuesto_por"`
	PublicadoPor      string   `json:"publicado_por"`
	MotivoRechazo     string   `json:"motivo_rechazo"`
	Demo              bool     `json:"demo"`
	CreatedAt         string   `json:"created_at"`
	UpdatedAt         string   `json:"updated_at"`
	CreatedBy         string   `json:"created_by"`
}

func (f hookFila) aHook() biblioteca.Hook {
	return biblioteca.Hook{
		ID: f.ID, Titulo: f.Titulo, Categoria: f.Categoria,
		Psicologia: f.Psicologia, RetencionEsperada: f.RetencionEsperada,
		Variaciones: f.Variaciones,
		Ejemplos:  nulosALista(f.Ejemplos),
		Etiquetas: nulosALista(f.Etiquetas),
		Estado: f.Estado, PropuestoPor: f.PropuestoPor, PublicadoPor: f.PublicadoPor,
		MotivoRechazo: f.MotivoRechazo, Demo: f.Demo,
		CreatedAt: f.CreatedAt, UpdatedAt: f.UpdatedAt, CreatedBy: f.CreatedBy,
	}
}

func filaDeHook(h biblioteca.Hook) map[string]any {
	return map[string]any{
		"id": h.ID, "titulo": h.Titulo, "categoria": h.Categoria,
		"psicologia": h.Psicologia, "retencion_esperada": h.RetencionEsperada,
		"variaciones": h.Variaciones,
		"ejemplos": h.Ejemplos, "etiquetas": h.Etiquetas, "estado": h.Estado,
		"propuesto_por": nuloSiVacio(h.PropuestoPor),
		"publicado_por": nuloSiVacio(h.PublicadoPor),
		"motivo_rechazo": nuloSiVacio(h.MotivoRechazo),
		"demo": h.Demo, "created_by": nuloSiVacio(h.CreatedBy),
	}
}

func (s *Supabase) ListHooks() ([]biblioteca.Hook, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "order": {"created_at"}}
	var filas []hookFila
	if err := s.c.REST(ctx, http.MethodGet, "hooks", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []biblioteca.Hook{}
	for _, f := range filas {
		out = append(out, f.aHook())
	}
	return out, nil
}

func (s *Supabase) GetHook(id string) (biblioteca.Hook, bool, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "id": {"eq." + id}}
	var filas []hookFila
	if err := s.c.REST(ctx, http.MethodGet, "hooks", q, nil, "", &filas); err != nil {
		return biblioteca.Hook{}, false, err
	}
	if len(filas) == 0 {
		return biblioteca.Hook{}, false, nil
	}
	return filas[0].aHook(), true, nil
}

func (s *Supabase) CreateHook(h biblioteca.Hook) (biblioteca.Hook, error) {
	if h.ID == "" {
		h.ID = NewUUID()
	}
	if h.Estado == "" {
		h.Estado = biblioteca.EstadoBorrador
	}
	ctx, cancel := contexto()
	defer cancel()
	var filas []hookFila
	if err := s.c.REST(ctx, http.MethodPost, "hooks", nil, filaDeHook(h), "return=representation", &filas); err != nil {
		return biblioteca.Hook{}, err
	}
	if len(filas) == 0 {
		return h, nil
	}
	return filas[0].aHook(), nil
}

func (s *Supabase) UpdateHook(id string, cambios map[string]any) (biblioteca.Hook, error) {
	ctx, cancel := contexto()
	defer cancel()
	var filas []hookFila
	if err := s.c.REST(ctx, http.MethodPatch, "hooks", url.Values{"id": {"eq." + id}}, cambios, "return=representation", &filas); err != nil {
		return biblioteca.Hook{}, err
	}
	if len(filas) == 0 {
		return biblioteca.Hook{}, ErrNoExiste
	}
	return filas[0].aHook(), nil
}

// --- referencias ---

type referenciaFila struct {
	ID           string   `json:"id"`
	Titulo       string   `json:"titulo"`
	Link         string   `json:"link"`
	Plataforma   string   `json:"plataforma"`
	Analisis     string   `json:"analisis"`
	Etiquetas    []string `json:"etiquetas"`
	ClienteID    string   `json:"cliente_id"`
	Estado       string   `json:"estado"`
	PropuestoPor string   `json:"propuesto_por"`
	PublicadoPor string   `json:"publicado_por"`
	MotivoRech   string   `json:"motivo_rechazo"`
	Demo         bool     `json:"demo"`
	CreatedAt    string   `json:"created_at"`
	UpdatedAt    string   `json:"updated_at"`
	CreatedBy    string   `json:"created_by"`
}

func (f referenciaFila) aReferencia() biblioteca.Referencia {
	return biblioteca.Referencia{
		ID: f.ID, Titulo: f.Titulo, Link: f.Link, Plataforma: f.Plataforma,
		Analisis: f.Analisis, Etiquetas: nulosALista(f.Etiquetas),
		ClienteID: f.ClienteID,
		Estado: f.Estado, PropuestoPor: f.PropuestoPor, PublicadoPor: f.PublicadoPor,
		MotivoRech: f.MotivoRech, Demo: f.Demo,
		CreatedAt: f.CreatedAt, UpdatedAt: f.UpdatedAt, CreatedBy: f.CreatedBy,
	}
}

func filaDeReferencia(r biblioteca.Referencia) map[string]any {
	return map[string]any{
		"id": r.ID, "titulo": r.Titulo, "link": r.Link, "plataforma": r.Plataforma,
		"analisis": r.Analisis, "etiquetas": r.Etiquetas,
		"cliente_id": nuloSiVacio(r.ClienteID), "estado": r.Estado,
		"propuesto_por": nuloSiVacio(r.PropuestoPor),
		"publicado_por": nuloSiVacio(r.PublicadoPor),
		"motivo_rechazo": nuloSiVacio(r.MotivoRech),
		"demo": r.Demo, "created_by": nuloSiVacio(r.CreatedBy),
	}
}

func (s *Supabase) ListReferencias() ([]biblioteca.Referencia, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "order": {"created_at.desc"}}
	var filas []referenciaFila
	if err := s.c.REST(ctx, http.MethodGet, "referencias", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []biblioteca.Referencia{}
	for _, f := range filas {
		out = append(out, f.aReferencia())
	}
	return out, nil
}

func (s *Supabase) GetReferencia(id string) (biblioteca.Referencia, bool, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "id": {"eq." + id}}
	var filas []referenciaFila
	if err := s.c.REST(ctx, http.MethodGet, "referencias", q, nil, "", &filas); err != nil {
		return biblioteca.Referencia{}, false, err
	}
	if len(filas) == 0 {
		return biblioteca.Referencia{}, false, nil
	}
	return filas[0].aReferencia(), true, nil
}

func (s *Supabase) CreateReferencia(r biblioteca.Referencia) (biblioteca.Referencia, error) {
	if r.ID == "" {
		r.ID = NewUUID()
	}
	if r.Estado == "" {
		r.Estado = biblioteca.EstadoBorrador
	}
	if r.Plataforma == "" {
		r.Plataforma = biblioteca.PlatOtra
	}
	ctx, cancel := contexto()
	defer cancel()
	var filas []referenciaFila
	if err := s.c.REST(ctx, http.MethodPost, "referencias", nil, filaDeReferencia(r), "return=representation", &filas); err != nil {
		return biblioteca.Referencia{}, err
	}
	if len(filas) == 0 {
		return r, nil
	}
	return filas[0].aReferencia(), nil
}

func (s *Supabase) UpdateReferencia(id string, cambios map[string]any) (biblioteca.Referencia, error) {
	ctx, cancel := contexto()
	defer cancel()
	var filas []referenciaFila
	if err := s.c.REST(ctx, http.MethodPatch, "referencias", url.Values{"id": {"eq." + id}}, cambios, "return=representation", &filas); err != nil {
		return biblioteca.Referencia{}, err
	}
	if len(filas) == 0 {
		return biblioteca.Referencia{}, ErrNoExiste
	}
	return filas[0].aReferencia(), nil
}

// --- SOPs ---

type sopFila struct {
	ID                string   `json:"id"`
	Titulo            string   `json:"titulo"`
	Oficio            string   `json:"oficio"`
	TiempoEstimadoMin *int     `json:"tiempo_estimado_min"`
	Etiquetas         []string `json:"etiquetas"`
	Estado            string   `json:"estado"`
	PropuestoPor      string   `json:"propuesto_por"`
	PublicadoPor      string   `json:"publicado_por"`
	MotivoRechazo     string   `json:"motivo_rechazo"`
	Demo              bool     `json:"demo"`
	CreatedAt         string   `json:"created_at"`
	UpdatedAt         string   `json:"updated_at"`
	CreatedBy         string   `json:"created_by"`
}

func (f sopFila) aSOP() biblioteca.SOP {
	return biblioteca.SOP{
		ID: f.ID, Titulo: f.Titulo, Oficio: f.Oficio,
		TiempoEstimadoMin: f.TiempoEstimadoMin,
		Etiquetas:         nulosALista(f.Etiquetas),
		Estado:            f.Estado, PropuestoPor: f.PropuestoPor,
		PublicadoPor: f.PublicadoPor, MotivoRechazo: f.MotivoRechazo,
		Demo: f.Demo,
		CreatedAt: f.CreatedAt, UpdatedAt: f.UpdatedAt, CreatedBy: f.CreatedBy,
	}
}

func filaDeSOP(sp biblioteca.SOP) map[string]any {
	return map[string]any{
		"id": sp.ID, "titulo": sp.Titulo, "oficio": sp.Oficio,
		"tiempo_estimado_min": sp.TiempoEstimadoMin,
		"etiquetas": sp.Etiquetas, "estado": sp.Estado,
		"propuesto_por": nuloSiVacio(sp.PropuestoPor),
		"publicado_por": nuloSiVacio(sp.PublicadoPor),
		"motivo_rechazo": nuloSiVacio(sp.MotivoRechazo),
		"demo": sp.Demo, "created_by": nuloSiVacio(sp.CreatedBy),
	}
}

func (s *Supabase) ListSOPs() ([]biblioteca.SOP, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "order": {"created_at"}}
	var filas []sopFila
	if err := s.c.REST(ctx, http.MethodGet, "sops", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []biblioteca.SOP{}
	for _, f := range filas {
		out = append(out, f.aSOP())
	}
	return out, nil
}

func (s *Supabase) GetSOP(id string) (biblioteca.SOP, bool, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "id": {"eq." + id}}
	var filas []sopFila
	if err := s.c.REST(ctx, http.MethodGet, "sops", q, nil, "", &filas); err != nil {
		return biblioteca.SOP{}, false, err
	}
	if len(filas) == 0 {
		return biblioteca.SOP{}, false, nil
	}
	return filas[0].aSOP(), true, nil
}

func (s *Supabase) CreateSOP(sp biblioteca.SOP) (biblioteca.SOP, error) {
	if sp.ID == "" {
		sp.ID = NewUUID()
	}
	if sp.Estado == "" {
		sp.Estado = biblioteca.EstadoBorrador
	}
	if sp.Oficio == "" {
		sp.Oficio = biblioteca.OficioTodos
	}
	ctx, cancel := contexto()
	defer cancel()
	var filas []sopFila
	if err := s.c.REST(ctx, http.MethodPost, "sops", nil, filaDeSOP(sp), "return=representation", &filas); err != nil {
		return biblioteca.SOP{}, err
	}
	if len(filas) == 0 {
		return sp, nil
	}
	return filas[0].aSOP(), nil
}

func (s *Supabase) UpdateSOP(id string, cambios map[string]any) (biblioteca.SOP, error) {
	ctx, cancel := contexto()
	defer cancel()
	var filas []sopFila
	if err := s.c.REST(ctx, http.MethodPatch, "sops", url.Values{"id": {"eq." + id}}, cambios, "return=representation", &filas); err != nil {
		return biblioteca.SOP{}, err
	}
	if len(filas) == 0 {
		return biblioteca.SOP{}, ErrNoExiste
	}
	return filas[0].aSOP(), nil
}

// --- pasos de SOP ---

type sopPasoFila struct {
	ID          string `json:"id"`
	SOPID       string `json:"sop_id"`
	Orden       int    `json:"orden"`
	Titulo      string `json:"titulo"`
	Descripcion string `json:"descripcion"`
	CreatedAt   string `json:"created_at"`
}

func (f sopPasoFila) aPaso() biblioteca.SOPPaso {
	return biblioteca.SOPPaso{
		ID: f.ID, SOPID: f.SOPID, Orden: f.Orden,
		Titulo: f.Titulo, Descripcion: f.Descripcion, CreatedAt: f.CreatedAt,
	}
}

func (s *Supabase) ListSOPPasos(sopID string) ([]biblioteca.SOPPaso, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "sop_id": {"eq." + sopID}, "order": {"orden"}}
	var filas []sopPasoFila
	if err := s.c.REST(ctx, http.MethodGet, "sop_pasos", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []biblioteca.SOPPaso{}
	for _, f := range filas {
		out = append(out, f.aPaso())
	}
	return out, nil
}

func (s *Supabase) CreateSOPPaso(p biblioteca.SOPPaso) (biblioteca.SOPPaso, error) {
	if p.ID == "" {
		p.ID = NewUUID()
	}
	if p.Orden <= 0 {
		previos, err := s.ListSOPPasos(p.SOPID)
		if err != nil {
			return biblioteca.SOPPaso{}, err
		}
		max := 0
		for _, e := range previos {
			if e.Orden > max {
				max = e.Orden
			}
		}
		p.Orden = max + 1
	}
	ctx, cancel := contexto()
	defer cancel()
	body := map[string]any{
		"id": p.ID, "sop_id": p.SOPID, "orden": p.Orden,
		"titulo": p.Titulo, "descripcion": p.Descripcion,
	}
	var filas []sopPasoFila
	if err := s.c.REST(ctx, http.MethodPost, "sop_pasos", nil, body, "return=representation", &filas); err != nil {
		return biblioteca.SOPPaso{}, err
	}
	if len(filas) == 0 {
		return p, nil
	}
	return filas[0].aPaso(), nil
}

func (s *Supabase) UpdateSOPPaso(id string, cambios map[string]any) (biblioteca.SOPPaso, error) {
	ctx, cancel := contexto()
	defer cancel()
	permitido := map[string]bool{"titulo": true, "descripcion": true, "orden": true}
	body := map[string]any{}
	for k, v := range cambios {
		if permitido[k] {
			body[k] = v
		}
	}
	var filas []sopPasoFila
	if err := s.c.REST(ctx, http.MethodPatch, "sop_pasos", url.Values{"id": {"eq." + id}}, body, "return=representation", &filas); err != nil {
		return biblioteca.SOPPaso{}, err
	}
	if len(filas) == 0 {
		return biblioteca.SOPPaso{}, ErrNoExiste
	}
	return filas[0].aPaso(), nil
}

// --- ejecuciones ---

type sopEjecFila struct {
	ID          string `json:"id"`
	SOPID       string `json:"sop_id"`
	TareaID     string `json:"tarea_id"`
	IniciadoPor string `json:"iniciado_por"`
	Estado      string `json:"estado"`
	IniciadaAt  string `json:"iniciada_at"`
	TerminadaAt string `json:"terminada_at"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

func (f sopEjecFila) aEjecucion(pasos []string) biblioteca.SOPEjecucion {
	if pasos == nil {
		pasos = []string{}
	}
	return biblioteca.SOPEjecucion{
		ID: f.ID, SOPID: f.SOPID, TareaID: f.TareaID,
		IniciadoPor: f.IniciadoPor, Estado: f.Estado,
		IniciadaAt: f.IniciadaAt, TerminadaAt: f.TerminadaAt,
		Pasos: pasos,
		CreatedAt: f.CreatedAt, UpdatedAt: f.UpdatedAt,
	}
}

func (s *Supabase) ListSOPEjecuciones() ([]biblioteca.SOPEjecucion, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "order": {"iniciada_at.desc"}}
	var filas []sopEjecFila
	if err := s.c.REST(ctx, http.MethodGet, "sop_ejecuciones", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []biblioteca.SOPEjecucion{}
	for _, f := range filas {
		marcados, _ := s.ListPasosMarcados(f.ID)
		pasos := []string{}
		for _, mp := range marcados {
			pasos = append(pasos, mp.PasoID)
		}
		out = append(out, f.aEjecucion(pasos))
	}
	return out, nil
}

func (s *Supabase) GetSOPEjecucion(id string) (biblioteca.SOPEjecucion, bool, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "id": {"eq." + id}}
	var filas []sopEjecFila
	if err := s.c.REST(ctx, http.MethodGet, "sop_ejecuciones", q, nil, "", &filas); err != nil {
		return biblioteca.SOPEjecucion{}, false, err
	}
	if len(filas) == 0 {
		return biblioteca.SOPEjecucion{}, false, nil
	}
	marcados, _ := s.ListPasosMarcados(id)
	pasos := []string{}
	for _, mp := range marcados {
		pasos = append(pasos, mp.PasoID)
	}
	return filas[0].aEjecucion(pasos), true, nil
}

func (s *Supabase) CreateSOPEjecucion(e biblioteca.SOPEjecucion) (biblioteca.SOPEjecucion, error) {
	if e.ID == "" {
		e.ID = NewUUID()
	}
	if e.Estado == "" {
		e.Estado = biblioteca.EjecEnCurso
	}
	ctx, cancel := contexto()
	defer cancel()
	body := map[string]any{
		"id": e.ID, "sop_id": e.SOPID, "tarea_id": nuloSiVacio(e.TareaID),
		"iniciado_por": e.IniciadoPor, "estado": e.Estado,
	}
	var filas []sopEjecFila
	if err := s.c.REST(ctx, http.MethodPost, "sop_ejecuciones", nil, body, "return=representation", &filas); err != nil {
		return biblioteca.SOPEjecucion{}, err
	}
	if len(filas) == 0 {
		e.Pasos = []string{}
		return e, nil
	}
	return filas[0].aEjecucion([]string{}), nil
}

func (s *Supabase) UpdateSOPEjecucion(id string, cambios map[string]any) (biblioteca.SOPEjecucion, error) {
	ctx, cancel := contexto()
	defer cancel()
	permitido := map[string]bool{"estado": true, "terminada_at": true, "tarea_id": true}
	body := map[string]any{}
	for k, v := range cambios {
		if permitido[k] {
			body[k] = v
		}
	}
	var filas []sopEjecFila
	if err := s.c.REST(ctx, http.MethodPatch, "sop_ejecuciones", url.Values{"id": {"eq." + id}}, body, "return=representation", &filas); err != nil {
		return biblioteca.SOPEjecucion{}, err
	}
	if len(filas) == 0 {
		return biblioteca.SOPEjecucion{}, ErrNoExiste
	}
	marcados, _ := s.ListPasosMarcados(id)
	pasos := []string{}
	for _, mp := range marcados {
		pasos = append(pasos, mp.PasoID)
	}
	return filas[0].aEjecucion(pasos), nil
}

type sopMarcadoFila struct {
	ID          string `json:"id"`
	EjecucionID string `json:"ejecucion_id"`
	PasoID      string `json:"paso_id"`
	MarcadoAt   string `json:"marcado_at"`
}

func (s *Supabase) MarcarPaso(ejecucionID, pasoID string) (biblioteca.SOPEjecucionPaso, error) {
	previos, err := s.ListPasosMarcados(ejecucionID)
	if err != nil {
		return biblioteca.SOPEjecucionPaso{}, err
	}
	for _, mp := range previos {
		if mp.PasoID == pasoID {
			return mp, nil
		}
	}
	ctx, cancel := contexto()
	defer cancel()
	body := map[string]any{
		"id": NewUUID(), "ejecucion_id": ejecucionID, "paso_id": pasoID,
	}
	var filas []sopMarcadoFila
	if err := s.c.REST(ctx, http.MethodPost, "sop_ejecucion_pasos", nil, body, "return=representation", &filas); err != nil {
		return biblioteca.SOPEjecucionPaso{}, err
	}
	if len(filas) == 0 {
		return biblioteca.SOPEjecucionPaso{EjecucionID: ejecucionID, PasoID: pasoID}, nil
	}
	f := filas[0]
	return biblioteca.SOPEjecucionPaso{
		ID: f.ID, EjecucionID: f.EjecucionID, PasoID: f.PasoID, MarcadoAt: f.MarcadoAt,
	}, nil
}

func (s *Supabase) DesmarcarPaso(ejecucionID, pasoID string) error {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"ejecucion_id": {"eq." + ejecucionID}, "paso_id": {"eq." + pasoID}}
	var filas []sopMarcadoFila
	_ = s.c.REST(ctx, http.MethodDelete, "sop_ejecucion_pasos", q, nil, "", &filas)
	return nil
}

func (s *Supabase) ListPasosMarcados(ejecucionID string) ([]biblioteca.SOPEjecucionPaso, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "ejecucion_id": {"eq." + ejecucionID}, "order": {"marcado_at"}}
	var filas []sopMarcadoFila
	if err := s.c.REST(ctx, http.MethodGet, "sop_ejecucion_pasos", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []biblioteca.SOPEjecucionPaso{}
	for _, f := range filas {
		out = append(out, biblioteca.SOPEjecucionPaso{
			ID: f.ID, EjecucionID: f.EjecucionID, PasoID: f.PasoID, MarcadoAt: f.MarcadoAt,
		})
	}
	return out, nil
}
