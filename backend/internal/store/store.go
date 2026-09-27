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

	"rconceptsys/backend/internal/permisos"
	"rconceptsys/backend/internal/produccion"
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
