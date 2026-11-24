package store

import (
	"context"
	"strings"
	"time"
)

// ==========================================================
// F5: modelos compartidos (equipo, adjuntos, asignaciones,
// Drive, piezas, cortes de pago y avisos push)
// ==========================================================

// EnlaceEquipo es un acceso rápido de la barra derecha "Equipo".
type EnlaceEquipo struct {
	ID       int       `json:"id"`
	Nombre   string    `json:"nombre"`
	URL      string    `json:"url"`
	Orden    int       `json:"orden"`
	CreadoEn time.Time `json:"creado_en"`
}

// ActividadEquipo son los totales históricos de la barra derecha.
type ActividadEquipo struct {
	Mensajes int `json:"mensajes"`
	Tareas   int `json:"tareas"`
	Miembros int `json:"miembros"`
	Archivos int `json:"archivos"`
}

// ConfigEquipo es la tarjeta "Este equipo" + enlaces + actividad.
type ConfigEquipo struct {
	Nombre        string          `json:"nombre"`
	Descripcion   string          `json:"descripcion"`
	Enlaces       []*EnlaceEquipo `json:"enlaces"`
	Actividad     ActividadEquipo `json:"actividad"`
	ActualizadoEn *time.Time      `json:"actualizado_en,omitempty"`
}

// Tipos de adjunto del chat.
const (
	AdjuntoImagen  = "imagen"
	AdjuntoVideo   = "video"
	AdjuntoAudio   = "audio"
	AdjuntoArchivo = "archivo"
	AdjuntoDrive   = "drive"
)

// ChatAdjunto es un archivo, audio, video o carpeta de Drive de un mensaje.
type ChatAdjunto struct {
	ID          int64     `json:"id"`
	MensajeID   *int64    `json:"mensaje_id,omitempty"`
	AutorID     string    `json:"autor_id"`
	Tipo        string    `json:"tipo"`
	Nombre      string    `json:"nombre"`
	Mime        string    `json:"mime"`
	Tamano      int64     `json:"tamano"`
	DuracionSeg *int      `json:"duracion_seg,omitempty"`
	Ancho       *int      `json:"ancho,omitempty"`
	Alto        *int      `json:"alto,omitempty"`
	StoragePath *string   `json:"storage_path,omitempty"`
	URLExterna  *string   `json:"url_externa,omitempty"`
	CreadoEn    time.Time `json:"creado_en"`
}

// Descargable indica si el adjunto se puede servir desde el backend.
func (a *ChatAdjunto) Descargable() bool {
	return a != nil && a.StoragePath != nil && *a.StoragePath != ""
}

// AsignacionResumen es una asignación (tarea) con la marca de novedad vista por el admin.
type AsignacionResumen struct {
	Tarea   *Tarea `json:"tarea"`
	Novedad bool   `json:"novedad"`
}

// FiltroAsignaciones filtra la página de Asignaciones.
type FiltroAsignaciones struct {
	PersonaID *string
	Estado    *EstadoTarea
	Desde     *time.Time
	Hasta     *time.Time
	Limite    int
	// VistasDe es el admin que mira la lista; se usa para marcar "novedad".
	VistasDe string
}

// ConexionDrive guarda el OAuth de Google Drive del equipo (una sola cuenta).
type ConexionDrive struct {
	Correo            string    `json:"correo"`
	RefreshToken      string    `json:"-"`
	CarpetaRaizID     string    `json:"carpeta_raiz_id"`
	CarpetaClientesID string    `json:"-"`
	ConectadoEn       time.Time `json:"conectado_en"`
	ConectadoPor      *string   `json:"conectado_por,omitempty"`
}

// Etapas de una pieza de contenido.
var EtapasPieza = []string{"guion", "grabacion", "edicion", "revision", "aprobada", "publicada"}

// EtapaPiezaValida valida y normaliza una etapa.
func EtapaPiezaValida(etapa string) (string, bool) {
	e := strings.ToLower(strings.TrimSpace(etapa))
	for _, v := range EtapasPieza {
		if v == e {
			return e, true
		}
	}
	return "", false
}

// Pieza agrupa las tareas de un contenido por etapa.
type Pieza struct {
	ID               int       `json:"id"`
	ClienteID        *int      `json:"cliente_id,omitempty"`
	Cliente          *Cliente  `json:"cliente,omitempty"`
	Nombre           string    `json:"nombre"`
	Formato          string    `json:"formato"`
	Etapa            string    `json:"etapa"`
	FechaPublicacion *string   `json:"fecha_publicacion,omitempty"`
	Notas            *string   `json:"notas,omitempty"`
	DriveCarpetaURL  *string   `json:"drive_carpeta_url,omitempty"`
	Tareas           []*Tarea  `json:"tareas,omitempty"`
	CreadoPor        string    `json:"creado_por"`
	CreadoEn         time.Time `json:"creado_en"`
	ActualizadoEn    time.Time `json:"actualizado_en"`
}

// FiltroPiezas filtra el tablero de piezas.
type FiltroPiezas struct {
	ClienteID *int
	Etapa     *string
}

// LineaCorte es el total de una persona dentro de un corte.
type LineaCorte struct {
	PerfilID  string     `json:"perfil_id"`
	Perfil    *Perfil    `json:"perfil,omitempty"`
	Total     int64      `json:"total"`
	Tareas    int        `json:"tareas"`
	PagadaEn  *time.Time `json:"pagada_en,omitempty"`
	PagadaPor *string    `json:"pagada_por,omitempty"`
}

// Corte es un cierre de pagos (quincena o mes).
type Corte struct {
	ID        int64         `json:"id"`
	Periodo   string        `json:"periodo"` // "quincena" o "mes"
	Desde     string        `json:"desde"`   // YYYY-MM-DD
	Hasta     string        `json:"hasta"`   // YYYY-MM-DD
	Estado    string        `json:"estado"`  // "cerrado"
	Lineas    []*LineaCorte `json:"lineas"`
	Total     int64         `json:"total"`
	CreadoEn  time.Time     `json:"creado_en"`
	CreadoPor *string       `json:"creado_por,omitempty"`
}

// SuscripcionPush es una suscripción Web Push del navegador o de la APK.
type SuscripcionPush struct {
	ID        int64     `json:"id"`
	PerfilID  string    `json:"perfil_id"`
	Endpoint  string    `json:"endpoint"`
	P256DH    string    `json:"p256dh"`
	Auth      string    `json:"auth"`
	UserAgent *string   `json:"user_agent,omitempty"`
	CreadoEn  time.Time `json:"creado_en"`
}

// PeriodoCorte calcula el rango de fechas de una quincena o mes para la fecha dada.
func PeriodoCorte(periodo string, ahora time.Time) (desde, hasta string, ok bool) {
	loc := ahora.Location()
	y, mo, d := ahora.Date()
	switch strings.ToLower(strings.TrimSpace(periodo)) {
	case "quincena":
		if d <= 15 {
			return time.Date(y, mo, 1, 0, 0, 0, 0, loc).Format("2006-01-02"),
				time.Date(y, mo, 15, 0, 0, 0, 0, loc).Format("2006-01-02"), true
		}
		return time.Date(y, mo, 16, 0, 0, 0, 0, loc).Format("2006-01-02"),
			time.Date(y, mo+1, 0, 0, 0, 0, 0, loc).Format("2006-01-02"), true
	case "mes":
		return time.Date(y, mo, 1, 0, 0, 0, 0, loc).Format("2006-01-02"),
			time.Date(y, mo+1, 0, 0, 0, 0, 0, loc).Format("2006-01-02"), true
	}
	return "", "", false
}

// Extensiones F5 del Store. Se declaran aparte para no repetir la interfaz completa.
type StoreF5 interface {
	// Equipo (barra derecha)
	ObtenerConfigEquipo(ctx context.Context) (*ConfigEquipo, error)
	ActualizarConfigEquipo(ctx context.Context, nombre, descripcion *string) (*ConfigEquipo, error)
	CrearEnlaceEquipo(ctx context.Context, nombre, url string) (*EnlaceEquipo, error)
	ActualizarEnlaceEquipo(ctx context.Context, id int, campos map[string]any) (*EnlaceEquipo, error)
	EliminarEnlaceEquipo(ctx context.Context, id int) error

	// Chat con adjuntos
	GuardarAdjuntoChat(ctx context.Context, autorID, tipo, nombre, mime string, tamano int64, duracionSeg *int, datos []byte) (*ChatAdjunto, error)
	GuardarAdjuntoDrive(ctx context.Context, autorID, nombre, url string) (*ChatAdjunto, error)
	ObtenerAdjuntoChat(ctx context.Context, id int64) (*ChatAdjunto, error)
	LeerArchivoAdjunto(ctx context.Context, id int64) ([]byte, error)
	EnlazarAdjuntosMensaje(ctx context.Context, mensajeID int64, autorID string, ids []int64) ([]*ChatAdjunto, error)

	// Asignaciones (admin)
	ListarAsignaciones(ctx context.Context, filtro FiltroAsignaciones) ([]*AsignacionResumen, error)
	MarcarAsignacionesVistas(ctx context.Context, perfilID string, ids []int64) error

	// Google Drive
	ObtenerConexionDrive(ctx context.Context) (*ConexionDrive, error)
	GuardarConexionDrive(ctx context.Context, c *ConexionDrive) error
	EliminarConexionDrive(ctx context.Context) error
	ActualizarCarpetaDriveTarea(ctx context.Context, tareaID int64, carpetaID, carpetaURL string) (*Tarea, error)

	// Piezas
	ListarPiezas(ctx context.Context, filtro FiltroPiezas) ([]*Pieza, error)
	ObtenerPieza(ctx context.Context, id int) (*Pieza, error)
	CrearPieza(ctx context.Context, p *Pieza) (*Pieza, error)
	ActualizarPieza(ctx context.Context, id int, campos map[string]any) (*Pieza, error)

	// Cortes de pago
	ListarCortes(ctx context.Context) ([]*Corte, error)
	ObtenerCorte(ctx context.Context, id int64) (*Corte, error)
	CrearCorte(ctx context.Context, periodo, desde, hasta, creadoPor string) (*Corte, error)
	MarcarLineaCortePagada(ctx context.Context, corteID int64, perfilID, adminID string) (*Corte, error)

	// Avisos push
	GuardarSuscripcionPush(ctx context.Context, s *SuscripcionPush) (*SuscripcionPush, error)
	EliminarSuscripcionPush(ctx context.Context, endpoint string) error
	ListarSuscripcionesPush(ctx context.Context, perfilID string) ([]*SuscripcionPush, error)
	RegistrarAvisoEnviado(ctx context.Context, clave string) (bool, error)
	TareasPorVencer(ctx context.Context, fecha string) ([]*Tarea, error)
}
