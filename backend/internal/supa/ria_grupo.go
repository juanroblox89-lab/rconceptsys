package supa

import (
	"context"
	"net/url"
	"strconv"

	"rconceptsys/backend/internal/store"
)

func (s *SupabaseStore) IniciarRIAGrupo(ctx context.Context, perfil, solicitud, turno, comando, dia string, tope int) (store.InicioRIAGrupo, error) {
	var row struct {
		Estado    string         `json:"estado"`
		Consulta  *dbChatMensaje `json:"consulta"`
		Respuesta *dbChatMensaje `json:"respuesta"`
	}
	p := map[string]any{"p_perfil": perfil, "p_solicitud": solicitud, "p_turno": turno, "p_comando": comando, "p_dia": dia, "p_tope": tope}
	if err := s.client.REST(ctx, "POST", "rpc/rc_iniciar_ria_grupo", nil, p, "", &row); err != nil {
		return store.InicioRIAGrupo{}, err
	}
	res := store.InicioRIAGrupo{Estado: row.Estado}
	if row.Consulta != nil {
		res.Consulta = s.convertirChatMensaje(ctx, row.Consulta, false)
	}
	if row.Respuesta != nil {
		res.Respuesta = s.convertirChatMensaje(ctx, row.Respuesta, false)
	}
	return res, nil
}

func (s *SupabaseStore) ContextoRIAGrupo(ctx context.Context, antesID int64) ([]store.TextoRIAGrupo, error) {
	filas := make([]store.TextoRIAGrupo, 0, store.LimiteHistorialRIAGrupo)
	q := url.Values{
		"id":         {"lt." + strconv.FormatInt(antesID, 10)},
		"borrado_en": {"is.null"},
		"cuerpo":     {"neq."},
		"order":      {"creado_en.desc,id.desc"},
		"limit":      {strconv.Itoa(store.LimiteHistorialRIAGrupo)},
		"select":     {"es_ria,cuerpo"},
	}
	if err := s.client.REST(ctx, "GET", "chat_mensajes", q, nil, "", &filas); err != nil {
		return nil, err
	}
	for i, j := 0, len(filas)-1; i < j; i, j = i+1, j-1 {
		filas[i], filas[j] = filas[j], filas[i]
	}
	return filas, nil
}

func (s *SupabaseStore) FinalizarRIAGrupo(ctx context.Context, perfil, solicitud, turno, respuesta string) (*store.ChatMensaje, error) {
	var row *dbChatMensaje
	p := map[string]string{"p_perfil": perfil, "p_solicitud": solicitud, "p_turno": turno, "p_respuesta": respuesta}
	if err := s.client.REST(ctx, "POST", "rpc/rc_finalizar_ria_grupo", nil, p, "", &row); err != nil {
		return nil, err
	}
	if row == nil {
		return nil, store.ErrConflict
	}
	return s.convertirChatMensaje(ctx, row, false), nil
}

func (s *SupabaseStore) LiberarRIAGrupo(ctx context.Context, perfil, solicitud, turno string) error {
	p := map[string]string{"p_perfil": perfil, "p_solicitud": solicitud, "p_turno": turno}
	return s.client.REST(ctx, "POST", "rpc/rc_liberar_ria_grupo", nil, p, "", nil)
}
