// Package store define la interfaz de datos de RConcept Systems F0+F1 y los
// tipos compartidos. El modelo Usuario se reutiliza desde permisos (alias)
// para que la matriz de permisos y el store hablen del mismo tipo; los
// modelos de producción (Cliente, Pieza...) se reutilizan desde produccion.
package store

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"rconceptsys/backend/internal/asistente"
	"rconceptsys/backend/internal/biblioteca"
	"rconceptsys/backend/internal/cobros"
	"rconceptsys/backend/internal/permisos"
	"rconceptsys/backend/internal/produccion"
	"rconceptsys/backend/internal/ventas"
)

// Usuario es la persona del sistema (contrato API F0). Oficios en minúsculas
// sin tildes (ver permisos.NormalizarOficios).
type Usuario = permisos.Usuario

// Acceso reexportado para comodidad de los implementadores.
type Acceso = permisos.Acceso

// ErrNoExiste lo devuelven Get/Update/Desactivar cuando el id no está.
var ErrNoExiste = errors.New("no existe")

// Aliases F1 para que implementadores y handlers hablen del mismo tipo.
type (
	Cliente      = produccion.Cliente
	Pieza        = produccion.Pieza
	Tarea        = produccion.Tarea
	TareaEvento  = produccion.TareaEvento
	Notificacion = produccion.Notificacion
	EntregaDatos = produccion.EntregaDatos
)

// Aliases F2 (cobros: tarifas, líneas, cortes, comisión). Mismo patrón F1.
type (
	Tarifa       = cobros.Tarifa
	TarifaTramo  = cobros.TarifaTramo
	Paquete      = cobros.Paquete
	LineaCobro   = cobros.LineaCobro
	Corte        = cobros.Corte
	ConfigCobros = cobros.ConfigCobros
)

// Aliases F3 (biblioteca: formatos, hooks, referencias, SOPs ejecutables).
type (
	Formato      = biblioteca.Formato
	Hook         = biblioteca.Hook
	Referencia   = biblioteca.Referencia
	SOP          = biblioteca.SOP
	SOPPaso      = biblioteca.SOPPaso
	SOPEjecucion = biblioteca.SOPEjecucion
)

// Aliases F4 (ventas: leads, visitas; BRIEF F4, ANALISIS §4.4, §5.23–5.26).
type (
	Lead       = ventas.Lead
	LeadEvento = ventas.LeadEvento
	Visita     = ventas.Visita
)

// Aliases F5 (asistente IA; BRIEF F5 §4).
// Conversacion/Mensaje/UsoDiario viven en asistente (dominio F5).
type (
	Conversacion = asistente.Conversacion
	Mensaje       = asistente.Mensaje
)

// ErrVersion es el conflicto de edición (§5.14): el updated_at esperado no
// coincide con el actual → el handler responde 409.
var ErrVersion = errors.New("version")

// Evento es una entrada inmutable del historial (ANALISIS §6): quién, qué,
// cuándo, antes → después y motivo. No se edita ni se borra.
type Evento struct {
	ID          string  `json:"id"`
	Cuando      string  `json:"cuando"`
	ActorID     string  `json:"actor_id"`
	ActorNombre string  `json:"actor_nombre"`
	Accion      string  `json:"accion"`
	Recurso     string  `json:"recurso"`
	RecursoID   string  `json:"recurso_id"`
	Antes       any     `json:"antes"`
	Despues     any     `json:"despues"`
	Motivo      *string `json:"motivo"`
}

// Store es la interfaz de datos F0+F1: personas + actividad + producción.
// Producción: clientes, piezas, tareas (+historial tarea_eventos) y
// notificaciones. Dos implementaciones: Memoria (demo) y Supabase (REST).
type Store interface {
	ListUsuarios() ([]Usuario, error)
	GetUsuario(id string) (Usuario, bool, error)
	GetUsuarioByEmail(email string) (Usuario, bool, error)
	CreateUsuario(u Usuario) (Usuario, error)
	// UpdateUsuario: acceso == "" conserva el actual; oficios == nil conserva
	// (non-nil reemplaza, incluso vacío). Siempre actualiza updated_at.
	// Devuelve ErrNoExiste si el id no está.
	UpdateUsuario(id string, acceso Acceso, oficios []string) (Usuario, error)
	// Desactivar pasa el acceso a desactivado. Devuelve ErrNoExiste si no está.
	Desactivar(id string) (Usuario, error)
	// ListActividad: filtro == "" trae todo; si no, solo eventos con
	// recurso == filtro o recurso_id == filtro (?recurso=<tipo|id>).
	// Siempre del más reciente al más viejo, nunca nil.
	ListActividad(filtro string) ([]Evento, error)
	// AddActividad asigna id y cuando si vienen vacíos.
	AddActividad(e Evento) (Evento, error)
	CountDuenos() (int, error)

	// --- F1 producción ---
	ListClientes(incluirArchivados bool) ([]produccion.Cliente, error)
	GetCliente(id string) (produccion.Cliente, bool, error)
	CreateCliente(c produccion.Cliente) (produccion.Cliente, error)
	// UpdateCliente: el mapa trae solo los campos a cambiar; siempre
	// actualiza updated_at. Devuelve ErrNoExiste si el id no está.
	UpdateCliente(id string, cambios map[string]any) (produccion.Cliente, error)
	ArchivarCliente(id string) (produccion.Cliente, error)

	ListPiezas() ([]produccion.Pieza, error)
	GetPieza(id string) (produccion.Pieza, bool, error)
	CreatePieza(p produccion.Pieza) (produccion.Pieza, error)
	// UpdatePieza: cambios parciales (estado, titulo, formato, guion,
	// fecha_objetivo, motivo_cancelacion). Devuelve ErrNoExiste si no está.
	UpdatePieza(id string, cambios map[string]any) (produccion.Pieza, error)

	ListTareas() ([]produccion.Tarea, error)
	GetTarea(id string) (produccion.Tarea, bool, error)
	CreateTarea(t produccion.Tarea) (produccion.Tarea, error)
	// UpdateTarea: cambios parciales (asignado_id, estado, fecha_limite,
	// datos de entrega, decision_pendiente). Devuelve ErrNoExiste si no está.
	UpdateTarea(id string, cambios map[string]any) (produccion.Tarea, error)
	TareasDePieza(piezaID string) ([]produccion.Tarea, error)

	// ListTareaEventos trae el historial de una tarea (orden de creación).
	ListTareaEventos(tareaID string) ([]produccion.TareaEvento, error)
	// AddTareaEvento asigna id y cuando si vienen vacíos.
	AddTareaEvento(e produccion.TareaEvento) (produccion.TareaEvento, error)
	// TodosTareaEventos trae todo el historial (para visibilidad por cliente).
	TodosTareaEventos() ([]produccion.TareaEvento, error)

	ListNotificaciones(usuarioID string) ([]produccion.Notificacion, error)
	AddNotificacion(n produccion.Notificacion) (produccion.Notificacion, error)
	// MarcarLeida marca una notificación como leída. Devuelve ErrNoExiste.
	MarcarLeida(usuarioID, id string) (produccion.Notificacion, error)

	// --- F2 cobros (BRIEF F2; ANALISIS §4.3, §5.17–5.22, §7) ---
	ListTarifas() ([]cobros.Tarifa, error)
	GetTarifa(id string) (cobros.Tarifa, bool, error)
	// CreateTarifa versiona: desactiva la activa con misma etapa+unidad
	// (VigenteHasta=ahora) y crea la nueva con version+1. Tramos aparte.
	CreateTarifa(t cobros.Tarifa) (cobros.Tarifa, error)
	ListTramos(tarifaID string) ([]cobros.TarifaTramo, error)
	CreateTramo(tr cobros.TarifaTramo) (cobros.TarifaTramo, error)

	ListPaquetes() ([]cobros.Paquete, error)
	GetPaquete(id string) (cobros.Paquete, bool, error)
	CreatePaquete(p cobros.Paquete) (cobros.Paquete, error)
	UpdatePaquete(id string, cambios map[string]any) (cobros.Paquete, error)

	GetConfig() (cobros.ConfigCobros, error)
	UpdateConfig(c cobros.ConfigCobros) (cobros.ConfigCobros, error)

	CreateLinea(l cobros.LineaCobro) (cobros.LineaCobro, error)
	GetLinea(id string) (cobros.LineaCobro, bool, error)
	ListLineas() ([]cobros.LineaCobro, error)
	// UpdateLineaEstado cambia SOLO estado/motivo/reclamo/corte/periodo.
	// Nunca toca monto/tarifa/unidad/cantidad/tipo/tarea/usuario (§2).
	UpdateLineaEstado(id string, cambios map[string]any) (cobros.LineaCobro, error)
	// LineaDeTarea trae la línea tipo tarea de una tarea (idempotencia).
	LineaDeTarea(tareaID string) (cobros.LineaCobro, bool, error)

	ListCortes() ([]cobros.Corte, error)
	GetCorteByPeriodo(periodo string) (cobros.Corte, bool, error)
	CreateCorte(c cobros.Corte) (cobros.Corte, error)
	UpdateCorte(id string, cambios map[string]any) (cobros.Corte, error)

	// --- F3 biblioteca (BRIEF F3 §1; ANALISIS §3.2 fila Biblioteca) ---
	// Contenido con flujo borrador → publicado/rechazado/archivado.
	// UpdateXxx aplica cambios parciales y actualiza updated_at.
	ListFormatos() ([]biblioteca.Formato, error)
	GetFormato(id string) (biblioteca.Formato, bool, error)
	CreateFormato(f biblioteca.Formato) (biblioteca.Formato, error)
	UpdateFormato(id string, cambios map[string]any) (biblioteca.Formato, error)

	ListHooks() ([]biblioteca.Hook, error)
	GetHook(id string) (biblioteca.Hook, bool, error)
	CreateHook(h biblioteca.Hook) (biblioteca.Hook, error)
	UpdateHook(id string, cambios map[string]any) (biblioteca.Hook, error)

	ListReferencias() ([]biblioteca.Referencia, error)
	GetReferencia(id string) (biblioteca.Referencia, bool, error)
	CreateReferencia(r biblioteca.Referencia) (biblioteca.Referencia, error)
	UpdateReferencia(id string, cambios map[string]any) (biblioteca.Referencia, error)

	ListSOPs() ([]biblioteca.SOP, error)
	GetSOP(id string) (biblioteca.SOP, bool, error)
	CreateSOP(s biblioteca.SOP) (biblioteca.SOP, error)
	UpdateSOP(id string, cambios map[string]any) (biblioteca.SOP, error)

	// Pasos de un SOP (ordenados). UpdateSOPPaso solo toca titulo/
	// descripcion de un BORRADOR (lo impone el handler); CreateSOPPaso
	// asigna orden = max+1 cuando viene en 0.
	ListSOPPasos(sopID string) ([]biblioteca.SOPPaso, error)
	CreateSOPPaso(p biblioteca.SOPPaso) (biblioteca.SOPPaso, error)
	UpdateSOPPaso(id string, cambios map[string]any) (biblioteca.SOPPaso, error)

	// Ejecuciones de SOP (BRIEF F3 §1): iniciar, marcar pasos, terminar.
	ListSOPEjecuciones() ([]biblioteca.SOPEjecucion, error)
	GetSOPEjecucion(id string) (biblioteca.SOPEjecucion, bool, error)
	CreateSOPEjecucion(e biblioteca.SOPEjecucion) (biblioteca.SOPEjecucion, error)
	UpdateSOPEjecucion(id string, cambios map[string]any) (biblioteca.SOPEjecucion, error)
	// MarcarPaso registra un paso marcado (idempotente por
	// ejecucion+paso); DesmarcarPaso lo quita. ListPasosMarcados trae
	// los pasos marcados de una ejecución.
	MarcarPaso(ejecucionID, pasoID string) (biblioteca.SOPEjecucionPaso, error)
	DesmarcarPaso(ejecucionID, pasoID string) error
	ListPasosMarcados(ejecucionID string) ([]biblioteca.SOPEjecucionPaso, error)

	// --- F4 ventas (BRIEF F4; ANALISIS §4.4, §5.23–5.26, §7.5) ---
	// Leads con historial inmutable + visitas idempotentes por client_id.
	// UpdateLead aplica cambios parciales y actualiza updated_at.
	ListLeads() ([]ventas.Lead, error)
	GetLead(id string) (ventas.Lead, bool, error)
	CreateLead(l ventas.Lead) (ventas.Lead, error)
	UpdateLead(id string, cambios map[string]any) (ventas.Lead, error)
	// LeadsAbiertosDe trae los leads abiertos de un vendedor (§5.26: al
	// desactivarlo pasan a sin asignar).
	LeadsAbiertosDe(vendedorID string) ([]ventas.Lead, error)

	// ListLeadEventos trae el historial de un lead (orden de creación).
	ListLeadEventos(leadID string) ([]ventas.LeadEvento, error)
	// AddLeadEvento asigna id y cuando si vienen vacíos.
	AddLeadEvento(e ventas.LeadEvento) (ventas.LeadEvento, error)

	ListVisitas() ([]ventas.Visita, error)
	GetVisita(id string) (ventas.Visita, bool, error)
	// CreateVisita ignora duplicados por ClientID (idempotencia offline
	// §5.23): si ya existe una visita con ese client_id, devuelve la
	// existente sin crear otra. ClientID "" siempre crea.
	CreateVisita(v ventas.Visita) (ventas.Visita, error)
	// VisitaPorClientID trae la visita con ese client_id ("" si no hay).
	VisitaPorClientID(clientID string) (ventas.Visita, bool, error)
	// VisitasDeLead trae las visitas de un lead (orden de creación).
	VisitasDeLead(leadID string) ([]ventas.Visita, error)
	// ContarFotosVisita cuenta las fotos guardadas de una visita.
	ContarFotosVisita(visitaID string) (int, error)

	// --- F4 archivos (BRIEF F4 §2) ---
	// GuardarArchivo guarda bytes (foto de visita) y devuelve su id/ruta.
	// En demo guarda en memoria con tope MaxFotoBytes; en Supabase irá a
	// Storage (interfaz preparada). ObtenerArchivo los lee de vuelta.
	GuardarArchivo(nombre string, datos []byte) (string, error)
	ObtenerArchivo(id string) ([]byte, bool, error)

	// --- F5 asistente (BRIEF F5 §4) ---
	// Conversaciones + mensajes del chat (historial por usuario) y conteo
	// diario de uso (tope por usuario/día configurable por env).
	// UpdatePiezaBorrador deja el guion como borrador (F5 §1: no toca el
	// guion aprobado; crearlo aparte evita romper aplicaPieza F1).
	ListConversaciones(usuarioID string) ([]Conversacion, error)
	CreateConversacion(c Conversacion) (Conversacion, error)
	TouchConversacion(id string) (Conversacion, error)
	ListMensajes(conversacionID string) ([]Mensaje, error)
	CreateMensaje(m Mensaje) (Mensaje, error)
	// UsoHoy cuenta los mensajes del usuario en el día (YYYY-MM-DD).
	// SumarUso registra uno (llamar solo cuando el turno usó el modelo).
	UsoHoy(usuarioID, dia string) (int, error)
	SumarUso(usuarioID, dia string) (int, error)
	UpdatePiezaBorrador(id, borrador string) (Pieza, error)
}

// NewUUID genera un UUID v4 con crypto/rand (stdlib only, sin dependencias).
func NewUUID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic("store: crypto/rand no disponible: " + err.Error())
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	h := hex.EncodeToString(b[:])
	return h[:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:]
}

// Ahora devuelve el instante UTC en RFC3339 (formato de created_at y cuando).
func Ahora() string { return time.Now().UTC().Format(time.RFC3339) }
