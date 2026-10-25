package store

import (
	"context"
	"errors"
	"time"
)

var (
	ErrNotFound       = errors.New("recurso no encontrado")
	ErrConflict       = errors.New("conflicto con registro existente")
	ErrUnauthorized   = errors.New("no autorizado")
	ErrForbidden      = errors.New("acceso denegado")
	ErrLastAdmin      = errors.New("no se puede degradar o remover al último administrador")
	ErrValidation     = errors.New("error de validación")
	ErrRateLimited    = errors.New("límite de velocidad excedido")
)

type EstadoPerfil string

const (
	EstadoPendiente  EstadoPerfil = "pendiente"
	EstadoAprobado   EstadoPerfil = "aprobado"
	EstadoSuspendido EstadoPerfil = "suspendido"
)

type Rol struct {
	ID     int    `json:"id"`
	Clave  string `json:"clave"`
	Nombre string `json:"nombre"`
	Color  string `json:"color"`
	Orden  int    `json:"orden"`
	Activo bool   `json:"activo"`
}

type Perfil struct {
	ID        string       `json:"id"`
	Correo    string       `json:"correo"`
	Nombre    string       `json:"nombre"`
	FotoPath  *string      `json:"foto_path"`
	Estado    EstadoPerfil `json:"estado"`
	EsAdmin   bool         `json:"es_admin"`
	CreadoEn  time.Time    `json:"creado_en"`
	Roles     []Rol        `json:"roles,omitempty"`
}

type ChatMensaje struct {
	ID        int64      `json:"id"`
	AutorID   string     `json:"autor_id"`
	Autor     *Perfil    `json:"autor,omitempty"`
	Cuerpo    string     `json:"cuerpo"`
	CreadoEn  time.Time  `json:"creado_en"`
	EditadoEn *time.Time `json:"editado_en,omitempty"`
	BorradoEn *time.Time `json:"borrado_en,omitempty"`
}

type FiltroMiembros struct {
	Estado *EstadoPerfil
}

// Store define las operaciones que necesita el backend para F0.
type Store interface {
	// Perfiles & Auth
	ObtenerPerfilPorID(ctx context.Context, id string) (*Perfil, error)
	ObtenerPerfilPorCorreo(ctx context.Context, correo string) (*Perfil, error)
	CrearOActualizarPerfil(ctx context.Context, perfil *Perfil) error
	ActualizarNombre(ctx context.Context, id string, nombre string) (*Perfil, error)
	ActualizarFoto(ctx context.Context, id string, fotoPath string) (*Perfil, error)

	// Equipo (solo miembros aprobados)
	ListarEquipo(ctx context.Context) ([]*Perfil, error)
	ObtenerMiembroEquipo(ctx context.Context, id string) (*Perfil, error)

	// Chat
	ListarMensajesChat(ctx context.Context, antesID int64, despuesID int64, limite int) ([]*ChatMensaje, error)
	CrearMensajeChat(ctx context.Context, autorID string, cuerpo string) (*ChatMensaje, error)

	// Roles
	ListarRoles(ctx context.Context, soloActivos bool) ([]*Rol, error)
	CrearRol(ctx context.Context, rol *Rol) (*Rol, error)
	ActualizarRol(ctx context.Context, id int, campos map[string]any) (*Rol, error)

	// Admin
	ListarMiembros(ctx context.Context, filtro FiltroMiembros) ([]*Perfil, error)
	AprobarMiembro(ctx context.Context, id string) (*Perfil, error)
	SuspenderMiembro(ctx context.Context, id string) (*Perfil, error)
	ReactivarMiembro(ctx context.Context, id string) (*Perfil, error)
	AsignarRolesMiembro(ctx context.Context, id string, rolIDs []int) (*Perfil, error)
	CambiarEsAdmin(ctx context.Context, id string, esAdmin bool) (*Perfil, error)

	// Storage (avatares)
	GuardarAvatar(ctx context.Context, nombreArchivo string, datos []byte, contentType string) (string, error)
}
