package store

import (
	"context"
	"errors"
	"time"
)

var (
	ErrNotFound     = errors.New("recurso no encontrado")
	ErrConflict     = errors.New("conflicto con registro existente")
	ErrUnauthorized = errors.New("no autorizado")
	ErrForbidden    = errors.New("acceso denegado")
	ErrLastAdmin    = errors.New("no se puede degradar o remover al último administrador")
	ErrValidation   = errors.New("error de validación")
	ErrRateLimited  = errors.New("límite de velocidad excedido")
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
	ID       string       `json:"id"`
	Correo   string       `json:"correo"`
	Nombre   string       `json:"nombre"`
	FotoPath *string      `json:"foto_path"`
	Estado   EstadoPerfil `json:"estado"`
	EsAdmin  bool         `json:"es_admin"`
	CreadoEn time.Time    `json:"creado_en"`
	Roles    []Rol        `json:"roles,omitempty"`
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

// Modelos F2 y F3: Tipos de trabajo, Clientes, Tareas, Facturas y Estadísticas

type TipoTrabajo struct {
	ID       int       `json:"id"`
	Clave    string    `json:"clave"`
	Nombre   string    `json:"nombre"`
	RolID    *int      `json:"rol_id"`
	Rol      *Rol      `json:"rol,omitempty"`
	Precio   int       `json:"precio"` // Pesos colombianos enteros
	Unidad   string    `json:"unidad"` // "trabajo" o "minuto"
	Activo   bool      `json:"activo"`
	Orden    int       `json:"orden"`
	CreadoEn time.Time `json:"creado_en"`
}

type Cliente struct {
	ID       int       `json:"id"`
	Nombre   string    `json:"nombre"`
	Activo   bool      `json:"activo"`
	CreadoEn time.Time `json:"creado_en"`
}

type EstadoTarea string

const (
	EstadoTareaPendiente EstadoTarea = "pendiente"
	EstadoTareaHecha     EstadoTarea = "hecha"
	EstadoTareaAceptada  EstadoTarea = "aceptada"
	EstadoTareaRechazada EstadoTarea = "rechazada"
	EstadoTareaCancelada EstadoTarea = "cancelada"
)

type Tarea struct {
	ID                      int64        `json:"id"`
	TipoID                  int          `json:"tipo_id"`
	Tipo                    *TipoTrabajo `json:"tipo,omitempty"`
	ClienteID               *int         `json:"cliente_id,omitempty"`
	Cliente                 *Cliente     `json:"cliente,omitempty"`
	Titulo                  string       `json:"titulo"`
	Descripcion             *string      `json:"descripcion,omitempty"`
	AsignadoA               string       `json:"asignado_a"`
	Asignado                *Perfil      `json:"asignado,omitempty"`
	CreadoPor               string       `json:"creado_por"`
	Creador                 *Perfil      `json:"creador,omitempty"`
	Estado                  EstadoTarea  `json:"estado"`
	FechaLimite             *string      `json:"fecha_limite,omitempty"` // YYYY-MM-DD
	NotaPersona             *string      `json:"nota_persona,omitempty"`
	MotivoRechazo           *string      `json:"motivo_rechazo,omitempty"`
	Cantidad                *int         `json:"cantidad,omitempty"`
	CantidadAceptada        *int         `json:"cantidad_aceptada,omitempty"`
	PrecioUnitarioCongelado *int64       `json:"precio_unitario_congelado,omitempty"`
	PrecioCongelado         *int64       `json:"precio_congelado,omitempty"`
	FacturaID               *int64       `json:"factura_id,omitempty"`
	CreadaEn                time.Time    `json:"creada_en"`
	HechaEn                 *time.Time   `json:"hecha_en,omitempty"`
	ResueltaEn              *time.Time   `json:"resuelta_en,omitempty"`
	ResueltaPor             *string      `json:"resuelta_por,omitempty"`
}

type EstadoFactura string

const (
	EstadoFacturaAbierta EstadoFactura = "abierta"
	EstadoFacturaPagada  EstadoFactura = "pagada"
)

type Factura struct {
	ID        int64         `json:"id"`
	PerfilID  string        `json:"perfil_id"`
	Perfil    *Perfil       `json:"perfil,omitempty"`
	Estado    EstadoFactura `json:"estado"`
	CreadaEn  time.Time     `json:"creada_en"`
	PagadaEn  *time.Time    `json:"pagada_en,omitempty"`
	PagadaPor *string       `json:"pagada_por,omitempty"`
	Lineas    []*Tarea      `json:"lineas,omitempty"`
	Total     int64         `json:"total"`
}

type ResumenFacturasPersona struct {
	PerfilID       string     `json:"perfil_id"`
	Perfil         *Perfil    `json:"perfil"`
	FacturaAbierta *Factura   `json:"factura_abierta,omitempty"`
	TotalPendiente int64      `json:"total_pendiente"`
	Pagadas        []*Factura `json:"pagadas,omitempty"`
	TotalPagado    int64      `json:"total_pagado"`
}

type FiltroTareas struct {
	Estado    *EstadoTarea
	AsignadoA *string
	ClienteID *int
}

// Modelos F3: Estadísticas

type TotalesYo struct {
	Trabajos int   `json:"trabajos"`
	Minutos  int   `json:"minutos"`
	Valor    int64 `json:"valor"`
}

type EstadisticaTipoYo struct {
	TipoID   int    `json:"tipo_id"`
	Nombre   string `json:"nombre"`
	Unidad   string `json:"unidad"`
	Trabajos int    `json:"trabajos"`
	Minutos  int    `json:"minutos"`
	Valor    int64  `json:"valor"`
}

type RangoEstadisticaYo struct {
	Desde *string `json:"desde"`
	Hasta *string `json:"hasta"`
}

type EstadisticasYoResponse struct {
	Trabajos int                  `json:"trabajos"`
	Minutos  int                  `json:"minutos"`
	Valor    int64                `json:"valor"`
	PorTipo  []*EstadisticaTipoYo `json:"por_tipo"`
	Rango    *RangoEstadisticaYo  `json:"rango"`
	EsteMes  TotalesYo            `json:"este_mes"`
	Total    TotalesYo            `json:"total"`
}

type FiltroEstadisticasYo struct {
	Desde *time.Time
	Hasta *time.Time
}

type FiltroEstadisticasAdmin struct {
	Desde      time.Time
	Hasta      time.Time
	Agrupar    string // "dia", "semana", "mes"
	PersonaID  *string
	ClienteID  *int
	SinCliente bool
	TipoID     *int
}

type TotalesAdmin struct {
	Trabajos int   `json:"trabajos"`
	Minutos  int   `json:"minutos"`
	Valor    int64 `json:"valor"`
	Personas int   `json:"personas"`
	Clientes int   `json:"clientes"`
}

type PuntoSerieAdmin struct {
	Fecha    string `json:"fecha"`
	Trabajos int    `json:"trabajos"`
	Minutos  int    `json:"minutos"`
	Valor    int64  `json:"valor"`
}

type ItemPersonaEstadistica struct {
	PerfilID string  `json:"perfil_id"`
	Nombre   string  `json:"nombre"`
	Foto     *string `json:"foto"`
	Trabajos int     `json:"trabajos"`
	Minutos  int     `json:"minutos"`
	Valor    int64   `json:"valor"`
}

type ItemClienteEstadistica struct {
	ClienteID *int   `json:"cliente_id"`
	Nombre    string `json:"nombre"`
	Trabajos  int    `json:"trabajos"`
	Minutos   int    `json:"minutos"`
	Valor     int64  `json:"valor"`
}

type ItemTipoEstadistica struct {
	TipoID   int    `json:"tipo_id"`
	Nombre   string `json:"nombre"`
	Unidad   string `json:"unidad"`
	Trabajos int    `json:"trabajos"`
	Minutos  int    `json:"minutos"`
	Valor    int64  `json:"valor"`
}

type HayMasEstadisticas struct {
	PorPersona bool `json:"por_persona"`
	PorCliente bool `json:"por_cliente"`
	PorTipo    bool `json:"por_tipo"`
}

type RangoEstadisticasAdmin struct {
	Desde   string `json:"desde"`
	Hasta   string `json:"hasta"`
	Agrupar string `json:"agrupar"`
}

type EstadisticasAdminResponse struct {
	Rango      RangoEstadisticasAdmin    `json:"rango"`
	Totales    TotalesAdmin              `json:"totales"`
	Serie      []*PuntoSerieAdmin        `json:"serie"`
	PorPersona []*ItemPersonaEstadistica `json:"por_persona"`
	PorCliente []*ItemClienteEstadistica `json:"por_cliente"`
	PorTipo    []*ItemTipoEstadistica    `json:"por_tipo"`
	HayMas     HayMasEstadisticas        `json:"hay_mas"`
	EsteMes    *TotalesYo                `json:"este_mes,omitempty"`
	Total      *TotalesYo                `json:"total,omitempty"`
}

// Store define las operaciones que necesita el backend para F0 y F2.
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

	// F2: Tipos de Trabajo
	ListarTiposTrabajo(ctx context.Context, soloActivos bool) ([]*TipoTrabajo, error)
	ObtenerTipoTrabajoPorID(ctx context.Context, id int) (*TipoTrabajo, error)
	CrearTipoTrabajo(ctx context.Context, t *TipoTrabajo) (*TipoTrabajo, error)
	ActualizarTipoTrabajo(ctx context.Context, id int, campos map[string]any) (*TipoTrabajo, error)

	// F3: Clientes
	ListarClientes(ctx context.Context, soloActivos bool) ([]*Cliente, error)
	ObtenerClientePorID(ctx context.Context, id int) (*Cliente, error)
	CrearCliente(ctx context.Context, nombre string) (*Cliente, error)
	ActualizarCliente(ctx context.Context, id int, campos map[string]any) (*Cliente, error)

	// F2 y F3: Tareas
	CrearTarea(ctx context.Context, t *Tarea) (*Tarea, error)
	ObtenerTareaPorID(ctx context.Context, id int64) (*Tarea, error)
	ListarTareas(ctx context.Context, filtro FiltroTareas) ([]*Tarea, error)
	ContarTareasPorRevisar(ctx context.Context) (int, error)
	MarcarTareaHecha(ctx context.Context, id int64, asignadoID string, nota *string, cantidad *int) (*Tarea, error)
	AceptarTarea(ctx context.Context, id int64, adminID string, cantidad *int) (*Tarea, error)
	RechazarTarea(ctx context.Context, id int64, adminID string, motivo string) (*Tarea, error)
	CancelarTarea(ctx context.Context, id int64, adminID string) (*Tarea, error)

	// F2 y F3: Facturas
	ObtenerFacturaAbierta(ctx context.Context, perfilID string) (*Factura, error)
	ListarFacturasPerfil(ctx context.Context, perfilID string) ([]*Factura, error)
	ObtenerFacturaPorID(ctx context.Context, id int64) (*Factura, error)
	ListarResumenFacturasAdmin(ctx context.Context) ([]*ResumenFacturasPersona, error)
	MarcarFacturaPagada(ctx context.Context, id int64, adminID string) (*Factura, error)

	// F3: Estadísticas
	ObtenerEstadisticasYo(ctx context.Context, perfilID string, filtro FiltroEstadisticasYo) (*EstadisticasYoResponse, error)
	ObtenerEstadisticasAdmin(ctx context.Context, filtro FiltroEstadisticasAdmin) (*EstadisticasAdminResponse, error)
}
