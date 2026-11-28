package store

import (
	"context"
	"errors"
	"time"
)

const BucketAdjuntosAsignacion = "asignaciones-adjuntos"

var ErrCupoAdjuntos = errors.New("no hay cupo disponible para el adjunto")

type AdjuntoAsignacion struct {
	ID             string     `json:"id"`
	TareaID        int64      `json:"tarea_id"`
	Cupo           int        `json:"cupo"`
	Origen         string     `json:"origen,omitempty"`
	HistorialID    *int64     `json:"historial_id,omitempty"`
	Tipo           string     `json:"tipo"`
	Ruta           string     `json:"ruta"`
	Nombre         string     `json:"nombre"`
	Tamano         int        `json:"tamano"`
	Mime           string     `json:"mime"`
	DuracionMS     *int       `json:"duracion_ms"`
	Conservar      bool       `json:"conservar"`
	PurgadoEn      *time.Time `json:"purgado_en,omitempty"`
	EstadoArchivo  string     `json:"estado_archivo"`
	Resumir        bool       `json:"resumir"`
	EstadoResumen  string     `json:"estado_resumen"`
	Resumen        []string   `json:"resumen"`
	Transcripcion  *string    `json:"transcripcion"`
	ErrorResumen   *string    `json:"error_resumen,omitempty"`
	Proveedor      *string    `json:"proveedor"`
	ResumenIntento *string    `json:"resumen_intento"`
	ResumenHasta   *time.Time `json:"resumen_hasta"`
	CreadoPor      *string    `json:"creado_por"`
	CreadoEn       time.Time  `json:"creado_en"`
	ActualizadoEn  time.Time  `json:"actualizado_en"`
}

// FiltroAdjunto aplica compare-and-set para que la cola o una subida antigua no pisen otra versión.
type FiltroAdjunto struct {
	Archivo, Resumen, Intento string
	AntesDe                   time.Time
}

type StoreAdjuntosAsignacion interface {
	ReservarAdjunto(context.Context, *AdjuntoAsignacion) (*AdjuntoAsignacion, error)
	ListarAdjuntos(context.Context, int64) ([]*AdjuntoAsignacion, error)
	ListarAdjuntosPorOrigen(context.Context, int64, string, *int64) ([]*AdjuntoAsignacion, error)
	ObtenerAdjunto(context.Context, int64, string) (*AdjuntoAsignacion, error)
	CambiarAdjunto(context.Context, *AdjuntoAsignacion, FiltroAdjunto) (*AdjuntoAsignacion, error)
	BorrarRegistroAdjunto(context.Context, int64, string) error
	AdjuntosIncompletos(context.Context, time.Time) ([]*AdjuntoAsignacion, error)
	ReclamarResumenAdjunto(context.Context, string) (*AdjuntoAsignacion, error)
	ReclamarResumenAdjuntoPorID(context.Context, int64, string, string) (*AdjuntoAsignacion, bool, error)
	GuardarObjetoAdjunto(context.Context, string, string, []byte, bool) error
	LeerObjetoAdjunto(context.Context, string, int) ([]byte, error)
	BorrarObjetosAdjunto(context.Context, []string) error
	FirmarObjetoAdjunto(context.Context, string, string, int) (string, error)
}
