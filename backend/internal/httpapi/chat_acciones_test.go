package httpapi_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"rconceptsys/backend/internal/store"
	"rconceptsys/backend/internal/supa"
)

func TestPermisosAccionesChatEquipo(t *testing.T) {
	routes, s, adminID, editorID, camID, suspID := setupF2TestEnvironment(t)
	ctx := context.Background()

	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID:      "pend-chat",
		Correo:  "pend@rconcept.com",
		Nombre:  "Pendiente",
		Estado:  store.EstadoPendiente,
		EsAdmin: false,
	})

	// Mensajes base: uno del editor, uno del camarógrafo, uno de RIA en el chat del equipo
	msgEditor, err := s.CrearMensajeChat(ctx, editorID, "Mensaje original del editor")
	if err != nil {
		t.Fatal(err)
	}
	msgCam, err := s.CrearMensajeChat(ctx, camID, "Mensaje del camarógrafo")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.IniciarRIAGrupo(ctx, editorID, "solicitud", "turno", "/ria ¿qué opinas?", "2026-01-01", 20); err != nil {
		t.Fatal(err)
	}
	msgRIA, err := s.FinalizarRIAGrupo(ctx, editorID, "solicitud", "turno", "Respuesta pública de RIA")
	if err != nil {
		t.Fatal(err)
	}

	// 1. Sin autenticación / pendiente / suspendido -> 401 / 403
	for _, tc := range []struct {
		nombre string
		metodo string
		ruta   string
		user   string
		body   any
		code   int
	}{
		{"Sin auth PATCH", "PATCH", fmt.Sprintf("/api/chat/%d", msgEditor.ID), "", map[string]string{"cuerpo": "x"}, 401},
		{"Sin auth DELETE", "DELETE", fmt.Sprintf("/api/chat/%d", msgEditor.ID), "", nil, 401},
		{"Sin auth restaurar", "POST", fmt.Sprintf("/api/chat/%d/restaurar", msgEditor.ID), "", nil, 401},
		{"Pendiente PATCH", "PATCH", fmt.Sprintf("/api/chat/%d", msgEditor.ID), "pend-chat", map[string]string{"cuerpo": "x"}, 403},
		{"Suspendido DELETE", "DELETE", fmt.Sprintf("/api/chat/%d", msgEditor.ID), suspID, nil, 403},
	} {
		rr := doRequest(routes, tc.metodo, tc.ruta, tc.user, tc.body)
		if rr.Code != tc.code {
			t.Fatalf("%s: esperaba %d, obtuve %d (%s)", tc.nombre, tc.code, rr.Code, rr.Body.String())
		}
	}

	// 2. Editar: solo autor propio (admin NO edita ajenos; nadie edita RIA)
	if rr := doRequest(routes, "PATCH", fmt.Sprintf("/api/chat/%d", msgEditor.ID), camID, map[string]string{"cuerpo": "Intento ajeno"}); rr.Code != 403 {
		t.Fatalf("otro miembro no debe editar mensaje ajeno: %d", rr.Code)
	}
	if rr := doRequest(routes, "PATCH", fmt.Sprintf("/api/chat/%d", msgEditor.ID), adminID, map[string]string{"cuerpo": "Admin editando ajeno"}); rr.Code != 403 {
		t.Fatalf("admin no debe editar mensaje ajeno: %d", rr.Code)
	}
	if rr := doRequest(routes, "PATCH", fmt.Sprintf("/api/chat/%d", msgRIA.ID), editorID, map[string]string{"cuerpo": "Editando RIA"}); rr.Code != 403 {
		t.Fatalf("autor que invocó RIA no debe editar mensaje de RIA: %d", rr.Code)
	}
	if rr := doRequest(routes, "PATCH", fmt.Sprintf("/api/chat/%d", msgRIA.ID), adminID, map[string]string{"cuerpo": "Admin editando RIA"}); rr.Code != 403 {
		t.Fatalf("admin no debe editar mensaje de RIA: %d", rr.Code)
	}
	if rr := doRequest(routes, "PATCH", fmt.Sprintf("/api/chat/%d", msgEditor.ID), editorID, map[string]string{"cuerpo": "   "}); rr.Code != 400 {
		t.Fatalf("edición vacía sin adjuntos debe dar 400, dio %d", rr.Code)
	}

	// Edición válida por su autor
	rrEdit := doRequest(routes, "PATCH", fmt.Sprintf("/api/chat/%d", msgEditor.ID), editorID, map[string]string{"cuerpo": "  Mensaje corregido  "})
	if rrEdit.Code != 200 {
		t.Fatalf("autor debe poder editar: %d %s", rrEdit.Code, rrEdit.Body.String())
	}
	var editado store.ChatMensaje
	if err := json.Unmarshal(rrEdit.Body.Bytes(), &editado); err != nil {
		t.Fatal(err)
	}
	if editado.Cuerpo != "Mensaje corregido" || editado.EditadoEn == nil {
		t.Fatalf("esperaba cuerpo actualizado y editado_en != nil, obtuve %+v", editado)
	}

	// 3. Eliminar y restaurar: propio o admin
	if rr := doRequest(routes, "DELETE", fmt.Sprintf("/api/chat/%d", msgEditor.ID), camID, nil); rr.Code != 403 {
		t.Fatalf("otro miembro no debe eliminar mensaje ajeno: %d", rr.Code)
	}
	if rr := doRequest(routes, "DELETE", fmt.Sprintf("/api/chat/%d", msgRIA.ID), editorID, nil); rr.Code != 403 {
		t.Fatalf("no-admin no debe eliminar mensaje de RIA: %d", rr.Code)
	}

	// Autor elimina su mensaje y lo restaura
	if rr := doRequest(routes, "DELETE", fmt.Sprintf("/api/chat/%d", msgEditor.ID), editorID, nil); rr.Code != 200 {
		t.Fatalf("autor debe poder eliminar: %d %s", rr.Code, rr.Body.String())
	}
	// No debe aparecer en GET /api/chat ni poder editarse mientras esté borrado
	rrLista := doRequest(routes, "GET", "/api/chat", editorID, nil)
	if strings.Contains(rrLista.Body.String(), "Mensaje corregido") {
		t.Fatalf("mensaje eliminado siguió apareciendo en GET /api/chat: %s", rrLista.Body.String())
	}
	if rr := doRequest(routes, "PATCH", fmt.Sprintf("/api/chat/%d", msgEditor.ID), editorID, map[string]string{"cuerpo": "Otro"}); rr.Code != 404 {
		t.Fatalf("mensaje eliminado no debe poder editarse: %d", rr.Code)
	}
	if rr := doRequest(routes, "POST", fmt.Sprintf("/api/chat/%d/restaurar", msgEditor.ID), camID, nil); rr.Code != 403 {
		t.Fatalf("otro miembro no debe restaurar mensaje ajeno: %d", rr.Code)
	}
	if rr := doRequest(routes, "POST", fmt.Sprintf("/api/chat/%d/restaurar", msgEditor.ID), editorID, nil); rr.Code != 200 {
		t.Fatalf("autor debe poder restaurar su mensaje: %d %s", rr.Code, rr.Body.String())
	}
	rrLista2 := doRequest(routes, "GET", "/api/chat", editorID, nil)
	if !strings.Contains(rrLista2.Body.String(), "Mensaje corregido") {
		t.Fatalf("mensaje restaurado debe volver a GET /api/chat: %s", rrLista2.Body.String())
	}

	// Admin puede eliminar mensaje de otro miembro y mensaje de RIA
	if rr := doRequest(routes, "DELETE", fmt.Sprintf("/api/chat/%d", msgCam.ID), adminID, nil); rr.Code != 200 {
		t.Fatalf("admin debe poder eliminar cualquier mensaje: %d %s", rr.Code, rr.Body.String())
	}
	if rr := doRequest(routes, "DELETE", fmt.Sprintf("/api/chat/%d", msgRIA.ID), adminID, nil); rr.Code != 200 {
		t.Fatalf("admin debe poder eliminar mensaje de RIA: %d %s", rr.Code, rr.Body.String())
	}

	// Ventana expirada para restaurar
	_, err = s.RestaurarMensajeChat(ctx, msgCam.ID, adminID, true, -1*time.Second)
	if err != store.ErrConflict {
		t.Fatalf("esperaba ErrConflict con ventana vencida, obtuve %v", err)
	}
}

func TestPermisosAccionesRIA(t *testing.T) {
	routes, s, adminID, editorID, camID, _ := setupF2TestEnvironment(t)
	ctx := context.Background()

	// Simular una conversación guardada de editor y otra de admin
	respEd, err := s.GuardarConversacionRIA(ctx, editorID, "¿Qué grabaciones tengo?", "Tienes 2 grabaciones.")
	if err != nil {
		t.Fatal(err)
	}
	if respEd.PreguntaID <= 0 {
		t.Fatalf("GuardarConversacionRIA debe devolver PreguntaID > 0, obtuve %d", respEd.PreguntaID)
	}
	respAdm, err := s.GuardarConversacionRIA(ctx, adminID, "Resumen admin", "Todo al día.")
	if err != nil {
		t.Fatal(err)
	}

	// También probar que POST /api/ria (ficha ayuda) devuelve pregunta_id en event: fin
	t.Setenv("ASISTENTE_TOPE_DIA", "20")
	rrAyuda := doRequest(routes, "POST", "/api/ria", camID, map[string]any{"pregunta": "¿Cómo entrego un trabajo?"})
	if rrAyuda.Code != 200 || !strings.Contains(rrAyuda.Body.String(), `"pregunta_id":`) {
		t.Fatalf("event: fin debe incluir pregunta_id: %d %s", rrAyuda.Code, rrAyuda.Body.String())
	}

	// 1. Sin auth -> 401
	if rr := doRequest(routes, "PATCH", fmt.Sprintf("/api/ria/%d", respEd.PreguntaID), "", map[string]string{"cuerpo": "x"}); rr.Code != 401 {
		t.Fatalf("sin auth debe dar 401, dio %d", rr.Code)
	}

	// 2. Otro usuario (incluso admin) NO puede editar ni eliminar ni restaurar mensajes RIA ajenos
	if rr := doRequest(routes, "PATCH", fmt.Sprintf("/api/ria/%d", respEd.PreguntaID), adminID, map[string]string{"cuerpo": "Editado por admin"}); rr.Code != 403 {
		t.Fatalf("admin no debe editar RIA ajeno: %d", rr.Code)
	}
	if rr := doRequest(routes, "DELETE", fmt.Sprintf("/api/ria/%d", respEd.PreguntaID), adminID, nil); rr.Code != 403 {
		t.Fatalf("admin no debe eliminar RIA ajeno: %d", rr.Code)
	}
	if rr := doRequest(routes, "PATCH", fmt.Sprintf("/api/ria/%d", respAdm.PreguntaID), editorID, map[string]string{"cuerpo": "Editado por editor"}); rr.Code != 403 {
		t.Fatalf("editor no debe editar RIA de admin: %d", rr.Code)
	}

	// 3. El propio usuario NO puede editar ni eliminar la respuesta del asistente (rol=assistant)
	if rr := doRequest(routes, "PATCH", fmt.Sprintf("/api/ria/%d", respEd.ID), editorID, map[string]string{"cuerpo": "Cambiando IA"}); rr.Code != 403 {
		t.Fatalf("usuario no debe editar respuesta de RIA: %d", rr.Code)
	}
	if rr := doRequest(routes, "DELETE", fmt.Sprintf("/api/ria/%d", respEd.ID), editorID, nil); rr.Code != 403 {
		t.Fatalf("usuario no debe eliminar respuesta de RIA: %d", rr.Code)
	}

	// 4. Edición válida de mensaje propio rol=user
	if rr := doRequest(routes, "PATCH", fmt.Sprintf("/api/ria/%d", respEd.PreguntaID), editorID, map[string]string{"cuerpo": ""}); rr.Code != 400 {
		t.Fatalf("edición vacía debe dar 400, dio %d", rr.Code)
	}
	rrEdit := doRequest(routes, "PATCH", fmt.Sprintf("/api/ria/%d", respEd.PreguntaID), editorID, map[string]string{"cuerpo": "¿Qué ediciones tengo?"})
	if rrEdit.Code != 200 {
		t.Fatalf("dueño debe poder editar su pregunta RIA: %d %s", rrEdit.Code, rrEdit.Body.String())
	}
	var mEdit store.MensajeRIA
	_ = json.Unmarshal(rrEdit.Body.Bytes(), &mEdit)
	if mEdit.Cuerpo != "¿Qué ediciones tengo?" || mEdit.EditadoEn == nil {
		t.Fatalf("esperaba cuerpo editado y editado_en != nil, obtuve %+v", mEdit)
	}

	// 5. Eliminación y restauración de mensaje propio rol=user
	if rr := doRequest(routes, "DELETE", fmt.Sprintf("/api/ria/%d", respEd.PreguntaID), editorID, nil); rr.Code != 200 {
		t.Fatalf("dueño debe poder eliminar su mensaje RIA: %d %s", rr.Code, rr.Body.String())
	}
	rrHist := doRequest(routes, "GET", "/api/ria", editorID, nil)
	if strings.Contains(rrHist.Body.String(), "¿Qué ediciones tengo?") {
		t.Fatalf("mensaje eliminado siguió apareciendo en historial RIA: %s", rrHist.Body.String())
	}
	if rr := doRequest(routes, "POST", fmt.Sprintf("/api/ria/%d/restaurar", respEd.PreguntaID), adminID, nil); rr.Code != 403 {
		t.Fatalf("admin no debe restaurar RIA ajeno: %d", rr.Code)
	}
	if rr := doRequest(routes, "POST", fmt.Sprintf("/api/ria/%d/restaurar", respEd.PreguntaID), editorID, nil); rr.Code != 200 {
		t.Fatalf("dueño debe poder restaurar su mensaje RIA: %d %s", rr.Code, rr.Body.String())
	}
	rrHist2 := doRequest(routes, "GET", "/api/ria", editorID, nil)
	if !strings.Contains(rrHist2.Body.String(), "¿Qué ediciones tengo?") {
		t.Fatalf("mensaje restaurado debe volver a historial RIA: %s", rrHist2.Body.String())
	}
}

func TestSupabaseStoreNoPermiteEditarNiBorrarRIAConAutorCoincidente(t *testing.T) {
	// Verifica en SupabaseStore que un mensaje chat_mensajes con es_ria=true y autor_id=editorID
	// nunca pueda editarse ni eliminarse por un no-admin, aunque autor_id coincida en la fila de BD.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/rest/v1/chat_mensajes" && r.Method == http.MethodGet {
			_ = json.NewEncoder(w).Encode([]map[string]any{
				{
					"id":        77,
					"autor_id":  "editor-id",
					"cuerpo":    "Soy RIA",
					"es_ria":    true,
					"creado_en": "2026-11-26T00:00:00Z",
				},
			})
			return
		}
		if r.URL.Path == "/rest/v1/chat_adjuntos" {
			_ = json.NewEncoder(w).Encode([]any{})
			return
		}
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer srv.Close()

	st := supa.NewSupabaseStore(supa.New(srv.URL, "srv-key", "anon-key"))
	ctx := context.Background()

	if _, err := st.EditarMensajeChat(ctx, 77, "editor-id", "Hack"); err != store.ErrForbidden {
		t.Fatalf("SupabaseStore debía rechazar editar mensaje es_ria=true con ErrForbidden, dio %v", err)
	}
	if err := st.EliminarMensajeChat(ctx, 77, "editor-id", false); err != store.ErrForbidden {
		t.Fatalf("SupabaseStore debía rechazar eliminar mensaje es_ria=true por no-admin con ErrForbidden, dio %v", err)
	}
}
