package supa

import (
	"context"
	"net/url"
	"strconv"
	"strings"
	"time"

	"rconceptsys/backend/internal/store"
)

type dbMensajeRIA struct {
	ID        int64   `json:"id"`
	PerfilID  string  `json:"perfil_id"`
	Rol       string  `json:"rol"`
	Cuerpo    string  `json:"cuerpo"`
	CreadoEn  string  `json:"creado_en"`
	EditadoEn *string `json:"editado_en"`
	BorradoEn *string `json:"borrado_en"`
}

func convertirMensajeRIA(row *dbMensajeRIA) store.MensajeRIA {
	var editado *time.Time
	if row.EditadoEn != nil {
		et := parsearTiempoSupa(*row.EditadoEn)
		editado = &et
	}
	return store.MensajeRIA{
		ID:        row.ID,
		Rol:       row.Rol,
		Cuerpo:    row.Cuerpo,
		CreadoEn:  parsearTiempoSupa(row.CreadoEn),
		EditadoEn: editado,
	}
}

func (s *SupabaseStore) HistorialRIA(ctx context.Context, perfil string, limite int) ([]store.MensajeRIA, error) {
	r := []store.MensajeRIA{}
	q := url.Values{
		"perfil_id":  {"eq." + perfil},
		"borrado_en": {"is.null"},
		"limit":      {strconv.Itoa(limite)},
		"order":      {"id.desc"},
		"select":     {"id,rol,cuerpo,creado_en,editado_en"},
	}
	e := s.client.REST(ctx, "GET", "ria_mensajes", q, nil, "", &r)
	for i, j := 0, len(r)-1; i < j; i, j = i+1, j-1 {
		r[i], r[j] = r[j], r[i]
	}
	return r, e
}
func (s *SupabaseStore) GuardarConversacionRIA(ctx context.Context, perfil, pregunta, respuesta string) (store.MensajeRIA, error) {
	var r []store.MensajeRIA
	e := s.client.REST(ctx, "POST", "ria_mensajes", nil, []map[string]string{{"perfil_id": perfil, "rol": "user", "cuerpo": pregunta}, {"perfil_id": perfil, "rol": "assistant", "cuerpo": respuesta}}, "return=representation", &r)
	if e != nil {
		return store.MensajeRIA{}, e
	}
	var preguntaID int64
	for _, m := range r {
		if m.Rol == "user" {
			preguntaID = m.ID
			break
		}
	}
	for _, m := range r {
		if m.Rol == "assistant" {
			m.PreguntaID = preguntaID
			return m, nil
		}
	}
	return store.MensajeRIA{}, store.ErrNotFound
}
func (s *SupabaseStore) UsarCupoRIA(ctx context.Context, perfil, dia string, tope int) (bool, error) {
	var ok bool
	e := s.client.REST(ctx, "POST", "rpc/rc_cupo_ria", nil, map[string]any{"p_perfil": perfil, "p_dia": dia, "p_tope": tope}, "", &ok)
	return ok, e
}
func (s *SupabaseStore) CrearMensajeEquipoRIA(ctx context.Context, perfil, respuesta string) (*store.ChatMensaje, error) {
	var rows []dbChatMensaje
	e := s.client.REST(ctx, "POST", "chat_mensajes", nil, map[string]any{"autor_id": perfil, "cuerpo": respuesta, "es_ria": true}, "return=representation", &rows)
	if e != nil {
		return nil, e
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	v := rows[0]
	t := parsearTiempoSupa(v.CreadoEn)
	return &store.ChatMensaje{ID: v.ID, AutorID: "ria", EsRIA: true, Cuerpo: v.Cuerpo, CreadoEn: t}, nil
}

func (s *SupabaseStore) obtenerMensajeRIAPorID(ctx context.Context, id int64) (*dbMensajeRIA, error) {
	q := url.Values{
		"id":     {"eq." + strconv.FormatInt(id, 10)},
		"select": {"id,perfil_id,rol,cuerpo,creado_en,editado_en,borrado_en"},
	}
	var rows []dbMensajeRIA
	if err := s.client.REST(ctx, "GET", "ria_mensajes", q, nil, "", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	return &rows[0], nil
}

func (s *SupabaseStore) EditarMensajeRIA(ctx context.Context, perfil string, id int64, cuerpo string) (store.MensajeRIA, error) {
	row, err := s.obtenerMensajeRIAPorID(ctx, id)
	if err != nil {
		return store.MensajeRIA{}, err
	}
	if row.BorradoEn != nil {
		return store.MensajeRIA{}, store.ErrNotFound
	}
	if row.PerfilID != perfil || row.Rol != "user" {
		return store.MensajeRIA{}, store.ErrForbidden
	}
	c := strings.TrimSpace(cuerpo)
	long := len([]rune(c))
	if long == 0 || long > 2000 {
		return store.MensajeRIA{}, store.ErrValidation
	}
	q := url.Values{
		"id":         {"eq." + strconv.FormatInt(id, 10)},
		"perfil_id":  {"eq." + perfil},
		"rol":        {"eq.user"},
		"borrado_en": {"is.null"},
		"select":     {"id,perfil_id,rol,cuerpo,creado_en,editado_en,borrado_en"},
	}
	payload := map[string]any{
		"cuerpo":     c,
		"editado_en": time.Now().UTC().Format(time.RFC3339Nano),
	}
	var rows []dbMensajeRIA
	if err := s.client.REST(ctx, "PATCH", "ria_mensajes", q, payload, "return=representation", &rows); err != nil {
		return store.MensajeRIA{}, err
	}
	if len(rows) == 0 {
		return store.MensajeRIA{}, store.ErrNotFound
	}
	return convertirMensajeRIA(&rows[0]), nil
}

func (s *SupabaseStore) EliminarMensajeRIA(ctx context.Context, perfil string, id int64) error {
	row, err := s.obtenerMensajeRIAPorID(ctx, id)
	if err != nil {
		return err
	}
	if row.BorradoEn != nil {
		return store.ErrNotFound
	}
	if row.PerfilID != perfil || row.Rol != "user" {
		return store.ErrForbidden
	}
	q := url.Values{
		"id":         {"eq." + strconv.FormatInt(id, 10)},
		"perfil_id":  {"eq." + perfil},
		"rol":        {"eq.user"},
		"borrado_en": {"is.null"},
	}
	payload := map[string]any{
		"borrado_en": time.Now().UTC().Format(time.RFC3339Nano),
	}
	var rows []dbMensajeRIA
	if err := s.client.REST(ctx, "PATCH", "ria_mensajes", q, payload, "return=representation", &rows); err != nil {
		return err
	}
	if len(rows) == 0 {
		return store.ErrNotFound
	}
	return nil
}

func (s *SupabaseStore) RestaurarMensajeRIA(ctx context.Context, perfil string, id int64, ventana time.Duration) (store.MensajeRIA, error) {
	row, err := s.obtenerMensajeRIAPorID(ctx, id)
	if err != nil {
		return store.MensajeRIA{}, err
	}
	if row.BorradoEn == nil {
		return store.MensajeRIA{}, store.ErrNotFound
	}
	if row.PerfilID != perfil || row.Rol != "user" {
		return store.MensajeRIA{}, store.ErrForbidden
	}
	if time.Since(parsearTiempoSupa(*row.BorradoEn)) > ventana {
		return store.MensajeRIA{}, store.ErrConflict
	}
	q := url.Values{
		"id":         {"eq." + strconv.FormatInt(id, 10)},
		"perfil_id":  {"eq." + perfil},
		"rol":        {"eq.user"},
		"borrado_en": {"not.is.null"},
		"select":     {"id,perfil_id,rol,cuerpo,creado_en,editado_en,borrado_en"},
	}
	payload := map[string]any{
		"borrado_en": nil,
	}
	var rows []dbMensajeRIA
	if err := s.client.REST(ctx, "PATCH", "ria_mensajes", q, payload, "return=representation", &rows); err != nil {
		return store.MensajeRIA{}, err
	}
	if len(rows) == 0 {
		return store.MensajeRIA{}, store.ErrNotFound
	}
	return convertirMensajeRIA(&rows[0]), nil
}
