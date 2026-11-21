package supa

import (
	"context"
	"net/url"
	"rconceptsys/backend/internal/store"
	"strconv"
	"time"
)

func (s *SupabaseStore) TareasVencidas(ctx context.Context, fecha string) ([]*store.Tarea, error) {
	q := url.Values{"select": {"*,tipos_trabajo(*,roles(*)),clientes(*)"}, "fecha_limite": {"lt." + fecha}, "estado": {"in.(pendiente,rechazada)"}, "order": {"id.asc"}}
	var rows []dbTarea
	if err := s.client.REST(ctx, "GET", "tareas", q, nil, "", &rows); err != nil {
		return nil, err
	}
	tareas := make([]*store.Tarea, 0, len(rows))
	for i := range rows {
		tareas = append(tareas, convertirTarea(&rows[i]))
	}
	return tareas, nil
}

func (s *SupabaseStore) EncolarNotificacion(ctx context.Context, n store.Notificacion, clave string, ventana time.Duration) error {
	return s.client.REST(ctx, "POST", "rpc/rc_encolar_notificacion", nil, map[string]any{"p_perfil": n.PerfilID, "p_tipo": n.Tipo, "p_titulo": n.Titulo, "p_cuerpo": n.Cuerpo, "p_url": n.URL, "p_clave": clave, "p_grupo": n.Grupo, "p_ventana_segundos": int(ventana / time.Second)}, "", nil)
}
func (s *SupabaseStore) BandejaNotificaciones(ctx context.Context, perfil string) ([]store.Notificacion, int, error) {
	filas := []store.Notificacion{}
	q := url.Values{"perfil_id": {"eq." + perfil}, "order": {"actualizada_en.desc,id.desc"}, "limit": {"50"}}
	if err := s.client.REST(ctx, "GET", "notificaciones", q, nil, "", &filas); err != nil {
		return nil, 0, err
	}
	var cuenta int
	err := s.client.REST(ctx, "POST", "rpc/rc_contar_notificaciones", nil, map[string]string{"p_perfil": perfil}, "", &cuenta)
	return filas, cuenta, err
}
func (s *SupabaseStore) LeerNotificaciones(ctx context.Context, perfil string, id int64) error {
	q := url.Values{"perfil_id": {"eq." + perfil}, "leida_en": {"is.null"}}
	if id > 0 {
		q.Set("id", "eq."+strconv.FormatInt(id, 10))
	}
	return s.client.REST(ctx, "PATCH", "notificaciones", q, map[string]any{"leida_en": time.Now()}, "return=minimal", nil)
}
func (s *SupabaseStore) PreferenciasNotificaciones(ctx context.Context, perfil string) (store.PreferenciasNotificaciones, error) {
	var rows []store.PreferenciasNotificaciones
	err := s.client.REST(ctx, "GET", "notificaciones_preferencias", url.Values{"perfil_id": {"eq." + perfil}}, nil, "", &rows)
	if len(rows) > 0 {
		return rows[0], err
	}
	return store.PreferenciasNotificaciones{}, err
}
func (s *SupabaseStore) GuardarPreferenciasNotificaciones(ctx context.Context, perfil string, p store.PreferenciasNotificaciones) error {
	if p.TiposSilenciados == nil {
		p.TiposSilenciados = []string{}
	}
	return s.client.REST(ctx, "POST", "notificaciones_preferencias", url.Values{"on_conflict": {"perfil_id"}}, struct {
		PerfilID string `json:"perfil_id"`
		store.PreferenciasNotificaciones
	}{perfil, p}, "resolution=merge-duplicates,return=minimal", nil)
}
func (s *SupabaseStore) ReclamarNotificaciones(ctx context.Context, limite int) ([]store.Notificacion, error) {
	var rows []store.Notificacion
	err := s.client.REST(ctx, "POST", "rpc/rc_reclamar_notificaciones", nil, map[string]int{"p_limite": limite}, "", &rows)
	return rows, err
}
func (s *SupabaseStore) ResolverNotificacion(ctx context.Context, n store.Notificacion, siguiente *time.Time) error {
	datos := map[string]any{"bloqueo_hasta": nil}
	if siguiente == nil {
		datos["finalizada_en"] = time.Now()
	} else {
		datos["disponible_en"] = siguiente
	}
	return s.client.REST(ctx, "PATCH", "notificaciones", url.Values{"id": {"eq." + strconv.FormatInt(n.ID, 10)}, "intentos": {"eq." + strconv.Itoa(n.Intentos)}}, datos, "return=minimal", nil)
}
func (s *SupabaseStore) NotificacionEntregada(ctx context.Context, aviso, suscripcion int64) (bool, error) {
	var rows []map[string]int64
	err := s.client.REST(ctx, "GET", "notificaciones_entregas", url.Values{"notificacion_id": {"eq." + strconv.FormatInt(aviso, 10)}, "suscripcion_id": {"eq." + strconv.FormatInt(suscripcion, 10)}}, nil, "", &rows)
	return len(rows) > 0, err
}
func (s *SupabaseStore) RegistrarNotificacionEntregada(ctx context.Context, aviso, suscripcion int64) error {
	return s.client.REST(ctx, "POST", "notificaciones_entregas", nil, map[string]int64{"notificacion_id": aviso, "suscripcion_id": suscripcion}, "resolution=ignore-duplicates,return=minimal", nil)
}
func (s *SupabaseStore) BloquearControlNotificaciones(ctx context.Context, clave string) (string, bool, error) {
	var ok bool
	err := s.client.REST(ctx, "POST", "rpc/rc_bloquear_notificaciones_control", nil, map[string]string{"p_clave": clave}, "", &ok)
	if err != nil || !ok {
		return "", false, err
	}
	var rows []struct {
		Valor string `json:"valor"`
	}
	err = s.client.REST(ctx, "GET", "notificaciones_control", url.Values{"clave": {"eq." + clave}, "select": {"valor"}}, nil, "", &rows)
	if err != nil || len(rows) == 0 {
		return "", false, err
	}
	return rows[0].Valor, true, nil
}
func (s *SupabaseStore) GuardarControlNotificaciones(ctx context.Context, clave, valor string) error {
	return s.client.REST(ctx, "PATCH", "notificaciones_control", url.Values{"clave": {"eq." + clave}}, map[string]string{"valor": valor, "bloqueo_hasta": "-infinity"}, "return=minimal", nil)
}
