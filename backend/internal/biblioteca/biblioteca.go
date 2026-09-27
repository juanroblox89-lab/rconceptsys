// Package biblioteca concentra el dominio F3 (formatos, hooks, referencias,
// SOPs ejecutables): tipos, flujo de contenido (BRIEF F3 §1, ANALISIS §3.2)
// y reglas de ejecución de SOP. Solo stdlib. La seguridad (quién puede qué)
// vive en permisos.Puede; aquí solo "qué estados existen" y "qué transiciones
// existen". Los handlers (httpapi) llaman a este paquete + Puede + Store.
package biblioteca

// --- Estados de contenido (BRIEF F3 §1) ---
// Flujo: equipo propone → borrador (visible solo para quien lo propuso y
// para admin/dueño) → admin/dueño publica o rechaza con motivo. Nada se
// borra: se archiva. Admin/dueño crea y publica directo.
const (
	EstadoBorrador   = "borrador"
	EstadoPublicado  = "publicado"
	EstadoRechazado  = "rechazado"
	EstadoArchivado  = "archivado"
)

// EsEstadoContenido dice si el estado pertenece al vocabulario.
func EsEstadoContenido(e string) bool {
	switch e {
	case EstadoBorrador, EstadoPublicado, EstadoRechazado, EstadoArchivado:
		return true
	}
	return false
}

// transicionesContenido: borrador → publicado | rechazado; publicado →
// archivado; rechazado → borrador (reproponer con cambios) o archivado;
// archivado es final. Repetir el mismo estado es válido (idempotencia §5.32).
var transicionesContenido = map[string][]string{
	EstadoBorrador:  {EstadoPublicado, EstadoRechazado, EstadoArchivado},
	EstadoPublicado: {EstadoArchivado},
	EstadoRechazado: {EstadoBorrador, EstadoArchivado},
}

// TransicionContenidoValida dice si se puede pasar de un estado a otro.
// Igual-estado = válido (idempotencia §5.32: 200 sin duplicar).
func TransicionContenidoValida(de, a string) bool {
	if de == a {
		return true
	}
	for _, d := range transicionesContenido[de] {
		if d == a {
			return true
		}
	}
	return false
}

// --- Formatos (BRIEF F3 §1) ---
// Formato = estructura reusable (ej. RC-01 Recorrido Comercial, ED-02
// Educativo Rápido, de contenido/formatos-y-hooks.js). Estructura = pasos
// ordenados en texto (uno por línea); Codigo = id legible del sistema viejo
// (RC-01, ED-02; "" en propuestos por el equipo). Demo = semilla de ejemplo.
type Formato struct {
	ID                string   `json:"id"`
	Codigo            string   `json:"codigo,omitempty"`
	Nombre            string   `json:"nombre"`
	Objetivo          string   `json:"objetivo,omitempty"`
	Estructura        string   `json:"estructura,omitempty"`
	HooksRecomendados string   `json:"hooks_recomendados,omitempty"`
	KPIs              string   `json:"kpis,omitempty"`
	Ejemplos          []string `json:"ejemplos,omitempty"`
	Etiquetas         []string `json:"etiquetas,omitempty"`
	Estado            string   `json:"estado"`
	PropuestoPor      string   `json:"propuesto_por,omitempty"`
	PublicadoPor      string   `json:"publicado_por,omitempty"`
	MotivoRechazo     string   `json:"motivo_rechazo,omitempty"`
	Demo              bool     `json:"demo,omitempty"`
	CreatedAt         string   `json:"created_at,omitempty"`
	UpdatedAt         string   `json:"updated_at,omitempty"`
	CreatedBy         string   `json:"created_by,omitempty"`
}

// --- Hooks (BRIEF F3 §1) ---
// Hook = patrón de apertura (ej. "¿Sabías que el 90% de...?").
// RetencionEsperada = texto libre del sistema viejo (Alta, Muy Alta…).
type Hook struct {
	ID                string   `json:"id"`
	Titulo            string   `json:"titulo"`
	Categoria         string   `json:"categoria,omitempty"`
	Psicologia        string   `json:"psicologia,omitempty"`
	RetencionEsperada string   `json:"retencion_esperada,omitempty"`
	Variaciones       string   `json:"variaciones,omitempty"`
	Ejemplos          []string `json:"ejemplos,omitempty"`
	Etiquetas         []string `json:"etiquetas,omitempty"`
	Estado            string   `json:"estado"`
	PropuestoPor      string   `json:"propuesto_por,omitempty"`
	PublicadoPor      string   `json:"publicado_por,omitempty"`
	MotivoRechazo     string   `json:"motivo_rechazo,omitempty"`
	Demo              bool     `json:"demo,omitempty"`
	CreatedAt         string   `json:"created_at,omitempty"`
	UpdatedAt         string   `json:"updated_at,omitempty"`
	CreatedBy         string   `json:"created_by,omitempty"`
}

// --- Referencias (BRIEF F3 §1) ---
// Referencia = link analizado (qué se puede copiar). Plataforma:
// Instagram | TikTok | YouTube | otra. ClienteID opcional.
type Referencia struct {
	ID           string   `json:"id"`
	Titulo       string   `json:"titulo"`
	Link         string   `json:"link"`
	Plataforma   string   `json:"plataforma"`
	Analisis     string   `json:"analisis,omitempty"`
	Etiquetas    []string `json:"etiquetas,omitempty"`
	ClienteID    string   `json:"cliente_id,omitempty"`
	Estado       string   `json:"estado"`
	PropuestoPor string   `json:"propuesto_por,omitempty"`
	PublicadoPor string   `json:"publicado_por,omitempty"`
	MotivoRech   string   `json:"motivo_rechazo,omitempty"`
	Demo         bool     `json:"demo,omitempty"`
	CreatedAt    string   `json:"created_at,omitempty"`
	UpdatedAt    string   `json:"updated_at,omitempty"`
	CreatedBy    string   `json:"created_by,omitempty"`
}

// Plataformas válidas de referencia.
const (
	PlatInstagram = "Instagram"
	PlatTikTok    = "TikTok"
	PlatYouTube   = "YouTube"
	PlatOtra      = "otra"
)

// PlataformaValida dice si la plataforma pertenece al vocabulario.
func PlataformaValida(p string) bool {
	switch p {
	case PlatInstagram, PlatTikTok, PlatYouTube, PlatOtra:
		return true
	}
	return false
}

// --- SOPs (BRIEF F3 §1) ---
// SOP = checklist por oficio (o todos). Oficio = oficio canónico en
// minúsculas sin tildes o "todos". TiempoEstimadoMin nil = no informado.
// Los pasos viven aparte (SOPPaso, ordenados).
type SOP struct {
	ID                 string   `json:"id"`
	Titulo             string   `json:"titulo"`
	Oficio             string   `json:"oficio"`
	TiempoEstimadoMin  *int     `json:"tiempo_estimado_min,omitempty"`
	Etiquetas          []string `json:"etiquetas,omitempty"`
	Estado             string   `json:"estado"`
	PropuestoPor       string   `json:"propuesto_por,omitempty"`
	PublicadoPor       string   `json:"publicado_por,omitempty"`
	MotivoRechazo      string   `json:"motivo_rechazo,omitempty"`
	Demo               bool     `json:"demo,omitempty"`
	CreatedAt          string   `json:"created_at,omitempty"`
	UpdatedAt          string   `json:"updated_at,omitempty"`
	CreatedBy          string   `json:"created_by,omitempty"`
}

// OficioTodos marca un SOP que aplica a todos los oficios.
const OficioTodos = "todos"

// OficioSOPValido dice si el oficio del SOP es válido (oficios canónicos o
// todos). La normalización con tildes la hace permisos.NormalizarOficio.
func OficioSOPValido(o string) bool {
	switch o {
	case OficioTodos, "grabacion", "edicion", "diseno", "estrategia", "publicacion", "ventas":
		return true
	}
	return false
}

// SOPPaso es un paso de la checklist (orden 1, 2, 3… + título + descripción).
type SOPPaso struct {
	ID          string `json:"id"`
	SOPID       string `json:"sop_id"`
	Orden       int    `json:"orden"`
	Titulo      string `json:"titulo"`
	Descripcion string `json:"descripcion,omitempty"`
	CreatedAt   string `json:"created_at,omitempty"`
}

// --- Ejecuciones de SOP (BRIEF F3 §1) ---
// Una persona inicia un SOP (opcionalmente ligado a una tarea F1), marca
// pasos, lo termina; queda registro (quién, cuándo, pasos marcados).
// EnCurso → Terminada; terminada no se reabre.

const (
	EjecEnCurso   = "en_curso"
	EjecTerminada = "terminada"
)

// SOPEjecucion es el registro de una ejecución.
type SOPEjecucion struct {
	ID          string   `json:"id"`
	SOPID       string   `json:"sop_id"`
	TareaID     string   `json:"tarea_id,omitempty"`
	IniciadoPor string   `json:"iniciado_por"`
	Estado      string   `json:"estado"`
	IniciadaAt  string   `json:"iniciada_at,omitempty"`
	TerminadaAt string   `json:"terminada_at,omitempty"`
	Pasos       []string `json:"pasos_marcados,omitempty"`
	CreatedAt   string   `json:"created_at,omitempty"`
	UpdatedAt   string   `json:"updated_at,omitempty"`
}

// EsEstadoEjecucion dice si el estado de ejecución es válido.
func EsEstadoEjecucion(e string) bool {
	return e == EjecEnCurso || e == EjecTerminada
}

// SOPEjecucionPaso es un paso marcado dentro de una ejecución.
type SOPEjecucionPaso struct {
	ID          string `json:"id"`
	EjecucionID string `json:"ejecucion_id"`
	PasoID      string `json:"paso_id"`
	MarcadoAt   string `json:"marcado_at,omitempty"`
}
