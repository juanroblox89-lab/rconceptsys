package httpapi_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"rconceptsys/backend/internal/store"
)

func TestChatCitasYConservar(t *testing.T) {
	routes, _, admin, editor, cam, _ := setupF2TestEnvironment(t)
	llamada := func(m, p, u string, body any, status int) *httptest.ResponseRecorder {
		t.Helper()
		r := doRequest(routes, m, p, u, body)
		if r.Code != status {
			t.Fatalf("%s %s: %d, quería %d — %s", m, p, r.Code, status, r.Body.String())
		}
		return r
	}
	subido := subirAdjunto(t, routes, editor, "voz.webm", []byte{0x1a, 0x45, 0xdf, 0xa3, 1, 2}, "audio/webm; codecs=opus")
	if subido.Code != 201 {
		t.Fatal(subido.Body.String())
	}
	var adj store.ChatAdjunto
	if e := json.Unmarshal(subido.Body.Bytes(), &adj); e != nil || adj.Mime != "audio/webm" {
		t.Fatalf("adjunto: %+v %v", adj, e)
	}
	archivo := fmt.Sprintf("/api/chat/adjuntos/%d/archivo", adj.ID)
	marcar := fmt.Sprintf("/api/chat/adjuntos/%d/conservar", adj.ID)
	llamada("GET", archivo, cam, nil, 404)
	llamada("PATCH", marcar, cam, map[string]bool{"conservar": true}, 409)
	llamada("POST", "/api/chat", cam, map[string]any{"adjuntos": []int64{adj.ID}}, 400)
	var original store.ChatMensaje
	creada := llamada("POST", "/api/chat", editor, map[string]any{"cuerpo": "Texto de referencia", "adjuntos": []int64{adj.ID}}, 201)
	if e := json.Unmarshal(creada.Body.Bytes(), &original); e != nil || len(original.Adjuntos) != 1 {
		t.Fatal(creada.Body.String())
	}
	req := httptest.NewRequest(http.MethodGet, archivo, nil)
	req.Header.Set("X-Demo-User", cam)
	req.Header.Set("Range", "bytes=0-2")
	medio := httptest.NewRecorder()
	routes.ServeHTTP(medio, req)
	if medio.Code != 206 || medio.Header().Get("Content-Range") != "bytes 0-2/6" {
		t.Fatalf("rango: %d %+v", medio.Code, medio.Header())
	}
	llamada("PATCH", marcar, "", map[string]bool{"conservar": true}, 401)
	if r := llamada("PATCH", marcar, cam, map[string]bool{"conservar": true}, 200); !strings.Contains(r.Body.String(), `"conservar":true`) {
		t.Fatal(r.Body.String())
	}
	llamada("PATCH", marcar, cam, map[string]bool{"conservar": false}, 403)
	llamada("PATCH", marcar, admin, map[string]bool{"conservar": false}, 200)
	cita := map[string]any{"respuesta_a_id": original.ID, "cuerpo": "Lo tengo en cuenta"}
	otro := llamada("POST", "/api/chat", cam, cita, 201)
	var respuesta store.ChatMensaje
	if e := json.Unmarshal(otro.Body.Bytes(), &respuesta); e != nil || respuesta.RespuestaAID == nil || *respuesta.RespuestaAID != original.ID || respuesta.Cita == nil || respuesta.Cita.Extracto != "Texto de referencia" {
		t.Fatal(otro.Body.String())
	}
	llamada("DELETE", fmt.Sprintf("/api/chat/%d", original.ID), editor, nil, 200)
	llamada("GET", archivo, cam, nil, 404)
	llamada("POST", "/api/chat", cam, cita, 400)
	if r := llamada("GET", "/api/chat", cam, nil, 200); strings.Contains(r.Body.String(), "Texto de referencia") || !strings.Contains(r.Body.String(), "Lo tengo en cuenta") {
		t.Fatal(r.Body.String())
	}
}
