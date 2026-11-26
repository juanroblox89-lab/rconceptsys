package supa

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"rconceptsys/backend/internal/store"
)

func TestSupabaseRIAGrupoUsaProyeccionYRPC(t *testing.T) {
	ctx := context.Background()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method + " " + r.URL.Path {
		case "GET /rest/v1/chat_mensajes":
			q := r.URL.Query()
			for k, esperada := range map[string]string{"select": "es_ria,cuerpo", "id": "lt.91", "order": "creado_en.desc,id.desc", "borrado_en": "is.null", "limit": "50", "cuerpo": "neq."} {
				if q.Get(k) != esperada {
					t.Errorf("%s: %q", k, q.Get(k))
				}
			}
			_, _ = w.Write([]byte(`[{"es_ria":true,"cuerpo":"reciente"},{"cuerpo":"anterior"}]`))
		case "POST /rest/v1/rpc/rc_iniciar_ria_grupo", "POST /rest/v1/rpc/rc_finalizar_ria_grupo", "POST /rest/v1/rpc/rc_liberar_ria_grupo":
			var p map[string]any
			if json.NewDecoder(r.Body).Decode(&p) != nil || p["p_perfil"] != "perfil-fixture" || p["p_solicitud"] != "solicitud-fixture" || p["p_turno"] != "turno-fixture" {
				t.Errorf("datos de persistencia inesperados: %#v", p)
			}
			switch r.URL.Path {
			case "/rest/v1/rpc/rc_iniciar_ria_grupo":
				if p["p_comando"] != "/ria resume" || p["p_dia"] != "2026-01-01" || p["p_tope"] != float64(20) {
					t.Errorf("inicio mal construido: %v", p)
				}
				_, _ = w.Write([]byte(`{"estado":"iniciada","consulta":{"id":91,"autor_id":"perfil-fixture","cuerpo":"/ria resume","creado_en":"2026-01-01T10:00:00Z"}}`))
			case "/rest/v1/rpc/rc_finalizar_ria_grupo":
				if p["p_respuesta"] != "resumen" {
					_, _ = w.Write([]byte(`null`))
					return
				}
				_, _ = w.Write([]byte(`{"id":92,"autor_id":null,"es_ria":true,"cuerpo":"resumen","creado_en":"2026-01-01T10:00:01Z"}`))
			default:
				w.WriteHeader(http.StatusNoContent)
			}
		default:
			t.Errorf("el store de grupo llamó un recurso no permitido: %s %s", r.Method, r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	s := NewSupabaseStore(New(srv.URL, "qa-service-fixture", "qa-anon-fixture"))
	p, id, turno := "perfil-fixture", "solicitud-fixture", "turno-fixture"
	i, e := s.IniciarRIAGrupo(ctx, p, id, turno, "/ria resume", "2026-01-01", 20)
	if e != nil || i.Estado != store.RIAGrupoIniciada || i.Consulta == nil || i.Consulta.ID != 91 || i.Consulta.AutorID != p {
		t.Fatalf("inicio: %+v %v", i, e)
	}
	h, e := s.ContextoRIAGrupo(ctx, i.Consulta.ID)
	if e != nil || !reflect.DeepEqual(h, []store.TextoRIAGrupo{{Cuerpo: "anterior"}, {EsRIA: true, Cuerpo: "reciente"}}) {
		t.Fatalf("contexto: %+v %v", h, e)
	}
	f, e := s.FinalizarRIAGrupo(ctx, p, id, turno, "resumen")
	if e != nil || f == nil || f.ID != 92 || f.AutorID != store.AutorChatRIA || !f.EsRIA || f.Autor != nil {
		t.Fatalf("fin: %+v %v", f, e)
	}
	if _, e = s.FinalizarRIAGrupo(ctx, p, id, turno, "no válido"); !errors.Is(e, store.ErrConflict) {
		t.Fatalf("esperaba conflicto, llegó %v", e)
	}
	if e = s.LiberarRIAGrupo(ctx, p, id, turno); e != nil {
		t.Fatal(e)
	}
}
