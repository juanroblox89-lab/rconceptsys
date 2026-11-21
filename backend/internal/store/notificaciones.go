package store

import (
	"context"
	"time"
)

// Notificacion es una entrada privada de la bandeja y también un trabajo de la cola.
type Notificacion struct {
	ID            int64      `json:"id"`
	PerfilID      string     `json:"perfil_id"`
	Tipo          string     `json:"tipo"`
	Titulo        string     `json:"titulo"`
	Cuerpo        string     `json:"cuerpo"`
	URL           string     `json:"url"`
	LeidaEn       *time.Time `json:"leida_en"`
	CreadaEn      time.Time  `json:"creada_en"`
	ActualizadaEn time.Time  `json:"actualizada_en"`
	Grupo         string     `json:"grupo"`
	Cantidad      int        `json:"cantidad"`
	DisponibleEn  time.Time  `json:"disponible_en"`
	Intentos      int        `json:"intentos"`
	BloqueoHasta  *time.Time `json:"bloqueo_hasta"`
	FinalizadaEn  *time.Time `json:"finalizada_en"`
}

type PreferenciasNotificaciones struct {
	TiposSilenciados []string `json:"tipos_silenciados"`
	SilenciarChat    bool     `json:"silenciar_chat"`
	SilencioDesde    string   `json:"silencio_desde"`
	SilencioHasta    string   `json:"silencio_hasta"`
}

func (p PreferenciasNotificaciones) Silencia(tipo string) bool {
	if tipo == "mencion" {
		return false
	}
	if tipo == "chat" && p.SilenciarChat {
		return true
	}
	for _, s := range p.TiposSilenciados {
		if s == tipo {
			return true
		}
	}
	return false
}

type StoreNotificaciones interface {
	TareasVencidas(ctx context.Context, fecha string) ([]*Tarea, error)
	EncolarNotificacion(ctx context.Context, n Notificacion, clave string, ventana time.Duration) error
	BandejaNotificaciones(ctx context.Context, perfil string) ([]Notificacion, int, error)
	LeerNotificaciones(ctx context.Context, perfil string, id int64) error
	PreferenciasNotificaciones(ctx context.Context, perfil string) (PreferenciasNotificaciones, error)
	GuardarPreferenciasNotificaciones(ctx context.Context, perfil string, p PreferenciasNotificaciones) error
	ReclamarNotificaciones(ctx context.Context, limite int) ([]Notificacion, error)
	ResolverNotificacion(ctx context.Context, n Notificacion, siguiente *time.Time) error
	NotificacionEntregada(ctx context.Context, aviso, suscripcion int64) (bool, error)
	RegistrarNotificacionEntregada(ctx context.Context, aviso, suscripcion int64) error
	BloquearControlNotificaciones(ctx context.Context, clave string) (string, bool, error)
	GuardarControlNotificaciones(ctx context.Context, clave, valor string) error
}
