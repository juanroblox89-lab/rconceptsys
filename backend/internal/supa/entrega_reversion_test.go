package supa

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"rconceptsys/backend/internal/store"
)

func TestSupabaseStoreEntregaReversionYRechazoRPC(t *testing.T) {
	ctx := context.Background()
	var ultimoPath string
	var ultimoQuery string
	var rpcLlamada string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ultimoPath = r.URL.Path
		ultimoQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.URL.Path == "/rest/v1/rpc/rc_entregar_tarea":
			rpcLlamada = "rc_entregar_tarea"
			_, _ = w.Write([]byte(`{"tarea_id":10,"entrega_id":1,"estado":"hecha"}`))
		case r.URL.Path == "/rest/v1/rpc/rc_revertir_entrega_tarea":
			rpcLlamada = "rc_revertir_entrega_tarea"
			if strings.Contains(r.Header.Get("Prefer"), "conflict") {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte(`{"code":"P0003","message":"no_reversible:aceptada"}`))
				return
			}
			_, _ = w.Write([]byte(`{"tarea_id":10,"estado":"pendiente","hecha_en_anterior":"2026-11-26T04:00:00Z"}`))
		case r.URL.Path == "/rest/v1/rpc/rc_rechazar_tarea":
			rpcLlamada = "rc_rechazar_tarea"
			_, _ = w.Write([]byte(`{"tarea_id":10,"estado":"rechazada","historial_id":77}`))
		case r.URL.Path == "/rest/v1/tareas":
			_ = json.NewEncoder(w).Encode([]map[string]any{{
				"id": 10, "tipo_id": 2, "titulo": "Demo", "asignado_a": "ed-1", "creado_por": "adm-1",
				"estado": "rechazada", "creada_en": "2026-11-26T03:00:00Z", "metodo_entrega": "whatsapp",
			}})
		case r.URL.Path == "/rest/v1/tarea_entregas":
			_, _ = w.Write([]byte(`[{"id":5,"tarea_id":10,"perfil_id":"ed-1","metodo_entrega":"whatsapp","nota":"Listo","estado":"retirada","creada_en":"2026-11-26T04:00:00Z"}]`))
		case r.URL.Path == "/rest/v1/tarea_historial":
			_, _ = w.Write([]byte(`[{"id":77,"tarea_id":10,"actor_id":"adm-1","evento":"entrega_rechazada","detalle":"Entrega devuelta","motivo":"Falta audio","drive_adjuntos":[],"creado_en":"2026-11-26T04:10:00Z"}]`))
		case r.URL.Path == "/rest/v1/asignacion_adjuntos":
			_, _ = w.Write([]byte(`[]`))
		case r.URL.Path == "/rest/v1/asignaciones_vistas":
			_, _ = w.Write([]byte(`[{"perfil_id":"adm-1","perfiles":{"es_admin":true,"estado":"aprobado"}}]`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	st := NewSupabaseStore(New(srv.URL, "service-key", "anon-key"))
	nota := "Nota"
	tarea, err := st.EntregarTarea(ctx, 10, "ed-1", store.EntregaInput{Metodo: "whatsapp", Nota: &nota})
	if err != nil || tarea == nil || rpcLlamada != "rc_entregar_tarea" {
		t.Fatalf("EntregarTarea: err=%v rpc=%s tarea=%+v", err, rpcLlamada, tarea)
	}

	rev, err := st.RevertirEntregaTarea(ctx, 10, "ed-1")
	if err != nil || rev == nil || rev.HechaEnAnterior == nil || rpcLlamada != "rc_revertir_entrega_tarea" {
		t.Fatalf("RevertirEntregaTarea: err=%v rev=%+v", err, rev)
	}

	rech, err := st.RechazarTareaConDetalle(ctx, 10, "adm-1", "Falta audio", nil)
	if err != nil || rech == nil || rech.RechazoActual == nil || rech.RechazoActual.HistorialID != 77 {
		t.Fatalf("RechazarTareaConDetalle: err=%v rech=%+v", err, rech)
	}

	if _, err := st.ListarAdjuntosPorOrigen(ctx, 10, "rechazo", nil); err != nil || !strings.Contains(ultimoQuery, "origen=eq.rechazo") {
		t.Fatalf("ListarAdjuntosPorOrigen query=%s err=%v", ultimoQuery, err)
	}

	admins, err := st.AdminsVieronTareaDesde(ctx, 10, nil)
	if err != nil || len(admins) != 1 || admins[0] != "adm-1" {
		t.Fatalf("AdminsVieronTareaDesde: admins=%v err=%v path=%s", admins, err, ultimoPath)
	}

	if mapped := mapearErrorRPCTarea(&Error{Status: 400, Body: `{"code":"P0003","message":"no_reversible:aceptada"}`}); !errors.Is(mapped, store.ErrConflict) {
		t.Fatalf("esperaba ErrConflict, obtuvo %v", mapped)
	}
}
