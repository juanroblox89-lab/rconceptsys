package httpapi_test

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"rconceptsys/backend/internal/store"
)

func TestF6BandejaPrivadaAgrupaYMencionesSiempreLlegan(t *testing.T) {
	rutas, _, admin, editor, cam, _ := setupF2TestEnvironment(t)
	post := func(usuario, texto string) {
		t.Helper()
		r := doRequest(rutas, "POST", "/api/chat", usuario, map[string]any{"cuerpo": texto})
		if r.Code != 201 {
			t.Fatalf("chat: %d %s", r.Code, r.Body.String())
		}
	}
	bandeja := func(usuario string) ([]store.Notificacion, int) {
		t.Helper()
		r := doRequest(rutas, "GET", "/api/notificaciones", usuario, nil)
		var j struct {
			Notificaciones []store.Notificacion `json:"notificaciones"`
			NoLeidas       int                  `json:"no_leidas"`
		}
		if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &j) != nil {
			t.Fatalf("bandeja: %d %s", r.Code, r.Body.String())
		}
		return j.Notificaciones, j.NoLeidas
	}
	post(admin, "Primer mensaje")
	post(admin, "Segundo mensaje")
	v, n := bandeja(editor)
	if n != 1 || len(v) != 1 || v[0].Titulo != "2 mensajes nuevos" || !strings.Contains(v[0].URL, "#mensaje-") {
		t.Fatalf("agrupación incorrecta: %d %+v", n, v)
	}
	if _, n := bandeja(admin); n != 0 {
		t.Fatal("el autor recibió su propio mensaje")
	}
	pref := doRequest(rutas, "PUT", "/api/notificaciones/preferencias", editor, map[string]any{"silenciar_chat": true, "silencio_desde": "22:00", "silencio_hasta": "07:30"})
	if pref.Code != 200 {
		t.Fatalf("preferencias: %d %s", pref.Code, pref.Body.String())
	}
	post(cam, "Mensaje ordinario")
	post(cam, "@Eduardo revisa este mensaje, por favor")
	v, n = bandeja(editor)
	if n != 2 || v[0].Tipo != "mencion" {
		t.Fatalf("mención no recibida: %d %+v", n, v)
	}
	if r := doRequest(rutas, "POST", "/api/notificaciones/leidas", cam, nil); r.Code != 200 {
		t.Fatalf("leer: %d", r.Code)
	}
	if _, n := bandeja(editor); n != 2 {
		t.Fatal("otro usuario marcó avisos ajenos")
	}
	if r := doRequest(rutas, "POST", "/api/notificaciones/leidas", editor, nil); r.Code != 200 {
		t.Fatalf("leer: %d", r.Code)
	}
	if _, n := bandeja(editor); n != 0 {
		t.Fatal("quedaron avisos sin leer")
	}
}

func TestF6CronPrivado(t *testing.T) {
	rutas, _, _, _, _, _ := setupF2TestEnvironment(t)
	ruta := "/api/cron/notificaciones"
	t.Setenv("CRON_SECRET", t.Name())
	if r := doRequest(rutas, "GET", ruta, "", nil); r.Code != 401 {
		t.Fatalf("cron abierto: %d", r.Code)
	}
	req := httptest.NewRequest("GET", ruta, nil)
	req.Header.Set("Authorization", "Bearer "+os.Getenv("CRON_SECRET"))
	res := httptest.NewRecorder()
	rutas.ServeHTTP(res, req)
	if res.Code != 200 {
		t.Fatalf("cron: %d %s", res.Code, res.Body.String())
	}
}
