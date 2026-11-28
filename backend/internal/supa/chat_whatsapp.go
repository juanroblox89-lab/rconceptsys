package supa

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"rconceptsys/backend/internal/store"
)

func (s *SupabaseStore) EnviarChat(ctx context.Context, autor, cuerpo string, respuesta *int64, adjuntos []int64) (*store.ChatMensaje, error) {
	var id *int64
	if err := s.client.RPC(ctx, "rc_enviar_chat", map[string]any{"p_autor": autor, "p_cuerpo": cuerpo, "p_respuesta": respuesta, "p_adjuntos": adjuntos}, &id); err != nil {
		return nil, err
	}
	if id == nil {
		return nil, store.ErrValidation
	}
	return s.ObtenerMensajeChatPorID(ctx, *id, false)
}

// citasChat trae extractos en lote (también para mensajes fuera de la página actual).
// No hidrata perfiles completos ni expone el texto de originales eliminados.
func (s *SupabaseStore) citasChat(ctx context.Context, mensajes []*store.ChatMensaje) {
	var ids []int64
	vistos := map[int64]bool{}
	for _, m := range mensajes {
		if m.RespuestaAID != nil && !vistos[*m.RespuestaAID] {
			ids = append(ids, *m.RespuestaAID)
			vistos[*m.RespuestaAID] = true
		}
	}
	if len(ids) == 0 {
		return
	}
	q := url.Values{"select": {"id,cuerpo,es_ria,perfiles!chat_mensajes_autor_id_fkey(nombre)"}, "borrado_en": {"is.null"}, "id": {"in.(" + listaIDs(ids) + ")"}}
	var originales []dbChatMensaje
	if err := s.client.REST(ctx, http.MethodGet, "chat_mensajes", q, nil, "", &originales); err != nil {
		return
	}
	citas := make(map[int64]*store.CitaChat, len(originales))
	for _, original := range originales {
		autor := ""
		if original.Autor != nil {
			autor = original.Autor.Nombre
		}
		citas[original.ID] = store.NuevaCitaChat(autor, original.Cuerpo, original.EsRIA)
	}
	for _, m := range mensajes {
		if m.RespuestaAID != nil {
			m.Cita = citas[*m.RespuestaAID]
		}
	}
}

func (s *SupabaseStore) ConservarChat(ctx context.Context, id int64, actor string, conservar bool) (*store.ChatAdjunto, error) {
	var filas []dbAdjunto
	err := s.client.RPC(ctx, "rc_conservar_chat", map[string]any{"p_id": id, "p_actor": actor, "p_conservar": conservar}, &filas)
	if err != nil {
		return nil, err
	}
	if len(filas) == 0 {
		return nil, store.ErrConflict
	}
	return convertirAdjunto(&filas[0]), nil
}

func (s *SupabaseStore) ConservarAsignacion(ctx context.Context, tarea int64, id, actor string, conservar bool) (*store.AdjuntoAsignacion, error) {
	var filas []*store.AdjuntoAsignacion
	err := s.client.RPC(ctx, "rc_conservar_asignacion", map[string]any{"p_tarea": tarea, "p_id": id, "p_actor": actor, "p_conservar": conservar}, &filas)
	if err == nil && len(filas) == 0 {
		return nil, store.ErrConflict
	}
	return primeraFilaAdjunto(filas, err)
}

func nuevoTokenPurga() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}

var rutaPurgaChat = regexp.MustCompile(`^[a-f0-9-]{36}/[0-9]+-[A-Za-z0-9_.-]+$`)
var idPurgaUUID = regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)

func rutaPurgaValida(bucket, id, ruta string) bool {
	if bucket == "chat" {
		n, err := strconv.ParseInt(id, 10, 64)
		return err == nil && n > 0 && rutaPurgaChat.MatchString(ruta)
	}
	if bucket != store.BucketAdjuntosAsignacion || !idPurgaUUID.MatchString(id) {
		return false
	}
	partes := strings.Split(ruta, "/")
	if len(partes) != 3 || partes[1] != id || partes[2] != "archivo" {
		return false
	}
	n, err := strconv.ParseInt(partes[0], 10, 64)
	return err == nil && n > 0 && strconv.FormatInt(n, 10) == partes[0]
}

// PurgarRetencion elimina solo objetos reclamados por SQL y confirma el metadato al final.
// Cualquier fallo deja el reclamo recuperable; no se marca ni se libera antes de tiempo.
func (s *SupabaseStore) PurgarRetencion(ctx context.Context) (store.ConteoPurga, error) {
	var conteo store.ConteoPurga
	var fallos error
	for _, grupo := range []struct {
		bucket, rpc string
		conteo      *int
	}{{"chat", "rc_reclamar_purga_chat", &conteo.Chat}, {store.BucketAdjuntosAsignacion, "rc_reclamar_purga_asignacion", &conteo.Asignaciones}} {
		for i := 0; i < store.LotePurga && ctx.Err() == nil; i++ {
			var filas []struct {
				ID   string `json:"id"`
				Ruta string `json:"ruta"`
			}
			// UUID distinto por fila, generado sin semillas ni dependencias externas.
			intento, err := nuevoTokenPurga()
			if err == nil {
				err = s.client.RPC(ctx, grupo.rpc, map[string]string{"p_intento": intento}, &filas)
			}
			if err != nil {
				fallos = errors.Join(fallos, fmt.Errorf("reclamo de purga %s: %w", grupo.bucket, err))
				break
			}
			if len(filas) == 0 {
				break
			}
			fila := filas[0]
			if len(filas) != 1 || !rutaPurgaValida(grupo.bucket, fila.ID, fila.Ruta) {
				fallos = errors.Join(fallos, fmt.Errorf("reclamo inválido: %s", grupo.bucket))
				break
			}
			err = s.client.do(ctx, http.MethodDelete, s.client.baseURL+"/storage/v1/object/"+grupo.bucket, map[string]any{"prefixes": []string{fila.Ruta}}, "", nil)
			if err != nil {
				fallos = errors.Join(fallos, fmt.Errorf("Storage de purga %s: %w", grupo.bucket, err))
				break
			}
			var marcado bool
			err = s.client.RPC(ctx, "rc_marcar_purga", map[string]string{"p_bucket": grupo.bucket, "p_id": fila.ID, "p_intento": intento}, &marcado)
			if err != nil || !marcado {
				fallos = errors.Join(fallos, fmt.Errorf("no se confirmó la purga de %s", grupo.bucket), err)
				break
			}
			*grupo.conteo++
		}
	}
	return conteo, errors.Join(fallos, ctx.Err())
}
