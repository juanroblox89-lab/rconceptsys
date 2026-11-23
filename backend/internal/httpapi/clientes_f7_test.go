package httpapi_test

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"rconceptsys/backend/internal/store"
)

func TestF7FichaClienteYFoto(t *testing.T) {
	routes, _, admin, editor, _, _ := setupF2TestEnvironment(t)
	const ruta = "/api/admin/clientes/1"
	comprobar := func(got *httptest.ResponseRecorder, want int) {
		t.Helper()
		if got.Code != want {
			t.Fatalf("HTTP %d, esperado %d: %s", got.Code, want, got.Body.String())
		}
	}
	comprobar(doRequest(routes, "GET", ruta, editor, nil), http.StatusForbidden)
	comprobar(doRequest(routes, "GET", ruta, "", nil), http.StatusUnauthorized)
	datos := map[string]any{"titulo": "Grabación F7", "fecha_limite": "2026-12-05", "tipo_id": 2, "cliente_id": 1, "asignado_a": editor}
	creado := doRequest(routes, "POST", "/api/admin/tareas", admin, datos)
	comprobar(creado, http.StatusCreated)
	var tarea store.Tarea
	if err := json.Unmarshal(creado.Body.Bytes(), &tarea); err != nil {
		t.Fatal(err)
	}
	trabajo := fmt.Sprintf("/api/admin/tareas/%d", tarea.ID)
	comprobar(doRequest(routes, "GET", trabajo, admin, nil), http.StatusOK)
	comprobar(doRequest(routes, "GET", trabajo, editor, nil), http.StatusForbidden)
	comprobar(doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), editor, map[string]any{"nota_persona": "Lista"}), http.StatusOK)
	comprobar(doRequest(routes, "POST", trabajo+"/aceptar", admin, map[string]any{}), http.StatusOK)
	ficha := doRequest(routes, "GET", ruta, admin, nil)
	comprobar(ficha, http.StatusOK)
	var f struct {
		Trabajos     []store.Tarea `json:"trabajos"`
		Estadisticas struct {
			Total, Aprobados, Entregados, Activos int
			UltimaEntrega                         string `json:"ultima_entrega"`
		} `json:"estadisticas"`
	}
	if err := json.Unmarshal(ficha.Body.Bytes(), &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Trabajos) != 1 || f.Estadisticas.Total != 1 || f.Estadisticas.Entregados != 1 || f.Estadisticas.Aprobados != 1 || f.Estadisticas.Activos != 0 || f.Estadisticas.UltimaEntrega == "" {
		t.Fatalf("estadísticas inesperadas: %+v", f.Estadisticas)
	}

	subir := func(user string, datos []byte) *httptest.ResponseRecorder {
		var buf bytes.Buffer
		m := multipart.NewWriter(&buf)
		f, e := m.CreateFormFile("foto", "foto.png")
		if e != nil {
			t.Fatal(e)
		}
		if _, e = f.Write(datos); e != nil {
			t.Fatal(e)
		}
		if e = m.Close(); e != nil {
			t.Fatal(e)
		}
		req := httptest.NewRequest("POST", ruta+"/foto", &buf)
		req.Header.Set("Content-Type", m.FormDataContentType())
		req.Header.Set("X-Demo-User", user)
		w := httptest.NewRecorder()
		routes.ServeHTTP(w, req)
		return w
	}
	imagen, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXY0AAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	comprobar(subir(admin, []byte("<svg onload='alert(1)'/>")), http.StatusBadRequest)
	comprobar(subir(admin, make([]byte, 1024*1024+1)), http.StatusBadRequest)
	comprobar(subir(editor, imagen), http.StatusForbidden)
	foto := subir(admin, imagen)
	comprobar(foto, http.StatusOK)
	var cliente store.Cliente
	if err := json.Unmarshal(foto.Body.Bytes(), &cliente); err != nil || cliente.FotoURL == nil {
		t.Fatalf("foto no vinculada: %s", foto.Body.String())
	}
	comprobar(doRequest(routes, "GET", *cliente.FotoURL, editor, nil), http.StatusForbidden)
	leer := doRequest(routes, "GET", *cliente.FotoURL, admin, nil)
	comprobar(leer, http.StatusOK)
	if leer.Header().Get("Content-Type") != "image/png" || !bytes.Equal(leer.Body.Bytes(), imagen) {
		t.Fatal("foto no coincide")
	}
}
