// Package store define la interfaz de datos de RConcept Systems F0 y los
// tipos compartidos (Usuario, Evento). Dos implementaciones: Memoria (modo
// demo, sin red) y Supabase (REST con service role, server-side).
// El modelo Usuario se reutiliza desde permisos (alias) para que la matriz
// de permisos y el store hablen del mismo tipo.
package store

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"rconceptsys/backend/internal/permisos"
)

// Usuario es la persona del sistema (contrato API F0). Oficios en minúsculas
// sin tildes (ver permisos.NormalizarOficios).
type Usuario = permisos.Usuario

// Acceso reexportado para comodidad de los implementadores.
type Acceso = permisos.Acceso

// ErrNoExiste lo devuelven Get/Update/Desactivar cuando el id no está.
var ErrNoExiste = errors.New("no existe")

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

// Store es la interfaz de datos F0: personas + actividad.
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
