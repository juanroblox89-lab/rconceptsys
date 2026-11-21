package httpapi_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"rconceptsys/backend/internal/httpapi"
	"rconceptsys/backend/internal/store"
)

func TestF6FechasRelativasBogota(t *testing.T) {
	ahora := time.Date(2026, 8, 25, 3, 55, 0, 0, time.UTC) // lunes 24 en Bogotá
	for fecha, texto := range map[string]string{
		"2026-08-24": "para hoy", "2026-08-25": "para mañana", "2026-08-26": "para pasado mañana", "2026-08-28": "para el viernes 28",
	} {
		if got := httpapi.FechaEntrega(&fecha, ahora); got != texto {
			t.Errorf("%s: %q, esperaba %q", fecha, got, texto)
		}
	}
}

func TestF6AsignarEditarYEntregar(t *testing.T) {
	rutas, _, admin, editor, cam, _ := setupF2TestEnvironment(t)
	datos := map[string]any{"tipo_id": 2, "asignado_a": editor, "titulo": "Editar el corte", "fecha_limite": "2026-12-05"}
	post := func() *store.Tarea {
		r := doRequest(rutas, http.MethodPost, "/api/admin/tareas", admin, datos)
		if r.Code != 201 {
			t.Fatalf("asignar: %d %s", r.Code, r.Body.String())
		}
		var tarea store.Tarea
		if err := json.Unmarshal(r.Body.Bytes(), &tarea); err != nil {
			t.Fatal(err)
		}
		return &tarea
	}
	if r := doRequest(rutas, "POST", "/api/admin/tareas", admin, datos); r.Code != 400 || !strings.Contains(r.Body.String(), "cliente_requerido") {
		t.Fatalf("cliente obligatorio: %d %s", r.Code, r.Body.String())
	}
	datos["cliente_id"] = 1
	tarea := post()
	ruta := fmt.Sprintf("/api/admin/tareas/%d", tarea.ID)
	cambios := map[string]any{"asignado_a": cam, "tipo_id": 1, "fecha_limite": "2026-12-06", "descripcion": "Graba una segunda toma"}
	if r := doRequest(rutas, "PATCH", ruta, editor, cambios); r.Code != 403 {
		t.Fatalf("un trabajador pudo editar: %d", r.Code)
	}
	if r := doRequest(rutas, "PATCH", ruta, admin, cambios); r.Code != 200 {
		t.Fatalf("edición: %d %s", r.Code, r.Body.String())
	}
	if r := doRequest(rutas, "GET", "/api/tareas", editor, nil); r.Code != 200 || strings.Contains(r.Body.String(), "segunda toma") {
		t.Fatalf("la tarea sigue visible al anterior: %d %s", r.Code, r.Body.String())
	}
	if r := doRequest(rutas, "GET", "/api/tareas", cam, nil); r.Code != 200 || !strings.Contains(r.Body.String(), "segunda toma") {
		t.Fatalf("la tarea no llegó al nuevo: %d %s", r.Code, r.Body.String())
	}
	if r := doRequest(rutas, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), cam, map[string]any{"cantidad": 5}); r.Code != 200 {
		t.Fatalf("entrega: %d %s", r.Code, r.Body.String())
	}
	if r := doRequest(rutas, "PATCH", ruta, admin, cambios); r.Code != 409 {
		t.Fatalf("se editó una entrega: %d", r.Code)
	}
}
