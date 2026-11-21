package supa

import (
	"context"
	"net/url"
	"strconv"
	"time"

	"rconceptsys/backend/internal/store"
)

func (s *SupabaseStore) HistorialRIA(ctx context.Context, perfil string, limite int) ([]store.MensajeRIA, error) {
	r := []store.MensajeRIA{}
	q := url.Values{"perfil_id": {"eq." + perfil}, "limit": {"" + strconv.Itoa(limite)}, "order": {"id.desc"}, "select": {"id,rol,cuerpo,creado_en"}}
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
	for _, m := range r {
		if m.Rol == "assistant" {
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
	t, _ := time.Parse(time.RFC3339, v.CreadoEn)
	return &store.ChatMensaje{ID: v.ID, AutorID: "ria", EsRIA: true, Cuerpo: v.Cuerpo, CreadoEn: t}, nil
}
