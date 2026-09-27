// Package produccion concentra el dominio F1 (clientes, piezas, tareas):
// tipos, máquinas de estados (ANALISIS §4.1 pieza, §4.2 tarea), oficio por
// etapa (§5.8), dato de entrega exigido (§5.9), vencidas (§5.10) y visibilidad
// por cliente (§3.1.3). Solo stdlib. La seguridad (quién puede qué) vive en
// permisos.Puede; aquí solo "qué transiciones existen" y "qué dato exige
// cada etapa". Los handlers (httpapi) llaman a este paquete + Puede.
package produccion

import "time"

// --- Clientes (BRIEF F1 §1) ---

// Estados de cliente. Nunca se borra: se archiva (§5.16).
const (
	ClienteActivo    = "activo"
	ClientePausado   = "pausado"
	ClienteTerminado = "terminado"
)

// Cliente es la ficha del cliente. Los opcionales van como string (""
// = no informado) para no pelear con PostgREST; ArchivadoAt "" = no
// archivado (archivar = fijar fecha, nunca DELETE, §5.16).
type Cliente struct {
	ID               string `json:"id"`
	Nombre           string `json:"nombre"`
	LogoURL          string `json:"logo_url,omitempty"`
	ContactoNombre   string `json:"contacto_nombre,omitempty"`
	ContactoTelefono string `json:"contacto_telefono,omitempty"`
	ContactoWhatsapp string `json:"contacto_whatsapp,omitempty"`
	Paquete          string `json:"paquete,omitempty"`
	// PaqueteID referencia al catálogo F2 (BRIEF F2 §4); el texto Paquete se
	// conserva por compatibilidad F1. VendidoPor = vendedor que consiguió al
	// cliente (oficio ventas, opcional).
	PaqueteID   string `json:"paquete_id,omitempty"`
	VendidoPor  string `json:"vendido_por,omitempty"`
	Estado      string `json:"estado"`
	DriveURL    string `json:"drive_url,omitempty"`
	Notas       string `json:"notas,omitempty"`
	Estrategia  string `json:"estrategia,omitempty"`
	// Vínculo Biblioteca F3 (BRIEF F3 §1): formato y hook recomendados para
	// el cliente. Solo referencia (ids, SET NULL en base); no rompe F1.
	FormatoRecomendadoID string `json:"formato_recomendado_id,omitempty"`
	HookRecomendadoID    string `json:"hook_recomendado_id,omitempty"`
	ArchivadoAt string `json:"archivado_at,omitempty"`
	CreatedAt   string `json:"created_at,omitempty"`
	UpdatedAt   string `json:"updated_at,omitempty"`
	CreatedBy   string `json:"created_by,omitempty"`
}

// EstadoClienteValido dice si el estado pertenece al vocabulario.
func EstadoClienteValido(e string) bool {
	return e == ClienteActivo || e == ClientePausado || e == ClienteTerminado
}

// --- Piezas (ANALISIS §4.1) ---

const (
	PiezaBorrador     = "borrador"
	PiezaEnProduccion = "en_produccion"
	PiezaEnRevision   = "en_revision"
	PiezaAprobada     = "aprobada"
	PiezaPublicada    = "publicada"
	PiezaCancelada    = "cancelada"
)

// Pieza es un contenido a entregar. UpdatedAt es el control de versión
// (§5.14): el PATCH lo exige y el handler responde 409 si cambió.
type Pieza struct {
	ID            string `json:"id"`
	ClienteID     string `json:"cliente_id"`
	Titulo        string `json:"titulo"`
	Formato       string `json:"formato,omitempty"`
	Guion         string `json:"guion,omitempty"`
	// GuionBorrador lo escribe el asistente IA (F5): nunca reemplaza al
	// guion aprobado sin confirmación del usuario (se adopta con PATCH).
	GuionBorrador string `json:"guion_borrador,omitempty"`
	FechaObjetivo string `json:"fecha_objetivo,omitempty"`
	Estado        string `json:"estado"`
	// Vínculo Biblioteca F3 (BRIEF F3 §1): formato y hook usados o
	// recomendados en la pieza. Solo referencia; convive con el texto
	// libre Formato de F1 (compatibilidad).
	FormatoRecomendadoID string `json:"formato_recomendado_id,omitempty"`
	HookRecomendadoID    string `json:"hook_recomendado_id,omitempty"`
	MotivoCancelacion string `json:"motivo_cancelacion,omitempty"`
	CreatedAt         string `json:"created_at,omitempty"`
	UpdatedAt         string `json:"updated_at,omitempty"`
	CreatedBy         string `json:"created_by,omitempty"`
}

// transicionesPieza: Borrador → En producción → En revisión → Aprobada →
// Publicada; En revisión puede volver a En producción (cambios); Cancelada
// desde cualquier estado (solo admin, con motivo — lo exige el handler).
var transicionesPieza = map[string][]string{
	PiezaBorrador:     {PiezaEnProduccion, PiezaCancelada},
	PiezaEnProduccion: {PiezaEnRevision, PiezaCancelada},
	PiezaEnRevision:   {PiezaAprobada, PiezaEnProduccion, PiezaCancelada},
	PiezaAprobada:     {PiezaPublicada, PiezaCancelada},
	PiezaPublicada:    {PiezaCancelada},
}

// TransicionPiezaValida dice si se puede pasar de un estado a otro.
// Repetir el mismo estado es válido (idempotencia §5.32: 200 sin duplicar).
func TransicionPiezaValida(de, a string) bool {
	if de == a {
		return true
	}
	for _, d := range transicionesPieza[de] {
		if d == a {
			return true
		}
	}
	return false
}

// EstadoPiezaValido dice si el estado pertenece al vocabulario.
func EstadoPiezaValido(e string) bool {
	if e == PiezaCancelada {
		return true
	}
	_, ok := transicionesPieza[e]
	return ok
}

// --- Tareas (ANALISIS §4.2) ---

const (
	EtapaGrabPrincipal = "grabacion_principal"
	EtapaGrabApoyo     = "grabacion_apoyo"
	EtapaEdicion       = "edicion"
	EtapaDiseno        = "diseno"
	EtapaPublicacion   = "publicacion"
)

const (
	TareaBloqueada = "bloqueada"
	TareaPendiente = "pendiente"
	TareaEnCurso   = "en_curso"
	TareaEntregada = "entregada"
	TareaAprobada  = "aprobada"
	TareaDevuelta  = "devuelta"
	TareaCancelada = "cancelada"
)

// Tarea es una etapa de una pieza asignada a una persona. AsignadoID "" =
// sin asignar. Minutos nil = no informado (002 lo guarda NULL). Vencida se
// calcula al responder (no se guarda). DecisionPendiente marca la tarea en
// curso al cancelar la pieza para que el admin decida (§5.12).
type Tarea struct {
	ID                string `json:"id"`
	PiezaID           string `json:"pieza_id"`
	Etapa             string `json:"etapa"`
	AsignadoID        string `json:"asignado_id,omitempty"`
	Estado            string `json:"estado"`
	FechaLimite       string `json:"fecha_limite,omitempty"`
	MaterialURL       string `json:"material_url,omitempty"`
	Minutos           *int   `json:"minutos,omitempty"`
	EntregableURL     string `json:"entregable_url,omitempty"`
	PublicadoURL      string `json:"publicado_url,omitempty"`
	DecisionPendiente bool   `json:"decision_pendiente,omitempty"`
	Vencida           bool   `json:"vencida,omitempty"`
	CreatedAt         string `json:"created_at,omitempty"`
	UpdatedAt         string `json:"updated_at,omitempty"`
	CreatedBy         string `json:"created_by,omitempty"`
}

// transicionesTarea: Bloqueada → Pendiente → En curso → Entregada → Aprobada;
// Devuelta (con comentario) vuelve a En curso o reentrega directo; al
// cancelar la pieza, bloqueada/pendiente/devuelta → cancelada (las en curso
// y entregadas quedan con decision_pendiente, las aprobadas quedan).
var transicionesTarea = map[string][]string{
	TareaBloqueada: {TareaPendiente, TareaCancelada},
	TareaPendiente: {TareaEnCurso, TareaCancelada},
	TareaEnCurso:   {TareaEntregada},
	TareaEntregada: {TareaAprobada, TareaDevuelta},
	TareaDevuelta:  {TareaEnCurso, TareaEntregada, TareaCancelada},
}

// TransicionTareaValida dice si se puede pasar de un estado a otro.
// Igual-estado = válido (idempotencia §5.32).
func TransicionTareaValida(de, a string) bool {
	if de == a {
		return true
	}
	for _, d := range transicionesTarea[de] {
		if d == a {
			return true
		}
	}
	return false
}

// EstadoTareaValido dice si el estado pertenece al vocabulario.
func EstadoTareaValido(e string) bool {
	switch e {
	case TareaBloqueada, TareaPendiente, TareaEnCurso, TareaEntregada,
		TareaAprobada, TareaDevuelta, TareaCancelada:
		return true
	}
	return false
}

// EtapaValida dice si la etapa pertenece al vocabulario.
func EtapaValida(e string) bool {
	switch e {
	case EtapaGrabPrincipal, EtapaGrabApoyo, EtapaEdicion, EtapaDiseno, EtapaPublicacion:
		return true
	}
	return false
}

// OficioDeEtapa mapea cada etapa al oficio exigido para asignarla (§5.8).
// Las dos grabaciones piden oficio grabacion (la de apoyo cobra aparte sin
// bloquear nada, §5.15).
func OficioDeEtapa(etapa string) (string, bool) {
	switch etapa {
	case EtapaGrabPrincipal, EtapaGrabApoyo:
		return "grabacion", true
	case EtapaEdicion:
		return "edicion", true
	case EtapaDiseno:
		return "diseno", true
	case EtapaPublicacion:
		return "publicacion", true
	}
	return "", false
}

// OrdenBloqueante es el orden en que las etapas se desbloquean entre sí.
// La grabación de apoyo NO está: nunca bloquea ni espera (§5.15).
var OrdenBloqueante = []string{EtapaGrabPrincipal, EtapaEdicion, EtapaDiseno, EtapaPublicacion}

// EsApoyo dice si la etapa es de apoyo (flujo libre, no bloquea).
func EsApoyo(etapa string) bool { return etapa == EtapaGrabApoyo }

// EntregaDatos trae los datos de una entrega (el handler los saca del body).
type EntregaDatos struct {
	MaterialURL   string
	Minutos       *int
	EntregableURL string
	PublicadoURL  string
}

// ValidarEntrega exige el dato de la etapa (§5.9): grabación principal =
// link del material + minutos; apoyo = minutos; edición/diseño = link del
// entregable; publicación = link publicado.
func ValidarEntrega(etapa string, d EntregaDatos) (string, bool) {
	switch etapa {
	case EtapaGrabPrincipal:
		if d.MaterialURL == "" {
			return "la entrega exige el link del material", false
		}
		if d.Minutos == nil {
			return "la entrega exige los minutos grabados", false
		}
	case EtapaGrabApoyo:
		if d.Minutos == nil {
			return "la entrega exige los minutos grabados", false
		}
	case EtapaEdicion, EtapaDiseno:
		if d.EntregableURL == "" {
			return "la entrega exige el link del entregable", false
		}
	case EtapaPublicacion:
		if d.PublicadoURL == "" {
			return "la entrega exige el link publicado", false
		}
	default:
		return "etapa inválida", false
	}
	return "", true
}

// --- Fechas y vencidas (§5.10) ---

// HoyFecha devuelve hoy en UTC como YYYY-MM-DD (formato de fecha_objetivo,
// fecha_limite y del tipo date de Supabase).
func HoyFecha() string { return time.Now().UTC().Format("2006-01-02") }

// HoyMas devuelve hoy+m días en YYYY-MM-DD.
func HoyMas(dias int) string {
	return time.Now().UTC().AddDate(0, 0, dias).Format("2006-01-02")
}

// EsVencida: fecha límite pasada y no aprobada (§5.10). Compara lexicográfico
// (válido con YYYY-MM-DD). Cancelada nunca vence.
func EsVencida(fechaLimite, estado, hoy string) bool {
	if fechaLimite == "" || estado == TareaAprobada || estado == TareaCancelada {
		return false
	}
	return fechaLimite < hoy
}

// FechaValida acepta "" (sin fecha) o YYYY-MM-DD.
func FechaValida(f string) bool {
	if f == "" {
		return true
	}
	if len(f) != 10 || f[4] != '-' || f[7] != '-' {
		return false
	}
	for i, ch := range f {
		if i == 4 || i == 7 {
			continue
		}
		if ch < '0' || ch > '9' {
			return false
		}
	}
	return true
}

// --- Historial de tarea y notificaciones ---

// TareaEvento es una entrada del historial de una tarea (§5.11, §6): quién,
// qué, cuándo, antes → después, comentario. Antes/Despues se guardan como
// mapas (p. ej. {"estado":"entregada","asignado_id":"..."}). Inmutable.
type TareaEvento struct {
	ID          string  `json:"id"`
	TareaID     string  `json:"tarea_id"`
	Cuando      string  `json:"cuando"`
	ActorID     string  `json:"actor_id"`
	ActorNombre string  `json:"actor_nombre"`
	Accion      string  `json:"accion"`
	Antes       any     `json:"antes"`
	Despues     any     `json:"despues"`
	Comentario  *string `json:"comentario"`
}

// Notificacion es la campanita in-app (BRIEF F1 §3): tarea asignada,
// devuelta, aprobada, entregada (para admin) y vencida.
type Notificacion struct {
	ID        string `json:"id"`
	UsuarioID string `json:"usuario_id"`
	Tipo      string `json:"tipo"`
	Titulo    string `json:"titulo"`
	Detalle   string `json:"detalle,omitempty"`
	Leida     bool   `json:"leida"`
	Recurso   string `json:"recurso,omitempty"`
	RecursoID string `json:"recurso_id,omitempty"`
	CreatedAt string `json:"created_at,omitempty"`
}

// Tipos de notificación que genera el backend.
const (
	NotiAsignada  = "tarea_asignada"
	NotiEntregada = "tarea_entregada"
	NotiDevuelta  = "tarea_devuelta"
	NotiAprobada  = "tarea_aprobada"
	NotiVencida   = "tarea_vencida"
)

// ExtraerAsignado lee asignado_id de un antes/despues guardado como mapa.
// Devuelve "" si no viene o no es mapa (nunca falla: es solo para visibilidad).
func ExtraerAsignado(v any) string {
	m, ok := v.(map[string]any)
	if !ok {
		return ""
	}
	s, _ := m["asignado_id"].(string)
	return s
}

// ClientesVisibles calcula qué clientes ve un usuario (§3.1.3): aquellos
// donde tiene o tuvo tareas (asignado actual o asignado en algún evento).
// Recibe los tres listados ya cargados; el handler filtra con el resultado.
func ClientesVisibles(usuarioID string, tareas []Tarea, eventos []TareaEvento, piezas []Pieza) map[string]bool {
	out := map[string]bool{}
	piezaCliente := map[string]string{}
	for _, p := range piezas {
		piezaCliente[p.ID] = p.ClienteID
	}
	tareaCliente := map[string]string{}
	for _, t := range tareas {
		if c, ok := piezaCliente[t.PiezaID]; ok {
			tareaCliente[t.ID] = c
		}
		if t.AsignadoID == usuarioID {
			if c, ok := piezaCliente[t.PiezaID]; ok {
				out[c] = true
			}
		}
	}
	for _, e := range eventos {
		if ExtraerAsignado(e.Despues) == usuarioID {
			if c, ok := tareaCliente[e.TareaID]; ok {
				out[c] = true
			}
		}
	}
	return out
}
