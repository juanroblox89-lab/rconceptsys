package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
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
	if sinCliente := post(); sinCliente.ClienteID != nil {
		t.Fatalf("el alta sin cliente asignó un cliente: %+v", sinCliente.ClienteID)
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

func TestNotificarPedidoActualizadoYAdjuntosSinAutoAviso(t *testing.T) {
	rutas, s, admin, editor, _, _ := setupF2TestEnvironment(t)
	ctx := context.Background()

	leerBandeja := func(usuario string) []store.Notificacion {
		t.Helper()
		res := doRequest(rutas, "GET", "/api/notificaciones", usuario, nil)
		if res.Code != 200 {
			t.Fatalf("bandeja %s: %d %s", usuario, res.Code, res.Body.String())
		}
		var out struct {
			Notificaciones []store.Notificacion `json:"notificaciones"`
		}
		if err := json.Unmarshal(res.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		return out.Notificaciones
	}

	seq := 0
	subirAudio := func(tareaID int64, nombre string, inicial bool) {
		t.Helper()
		seq++
		audio := []byte("RIFF\x0c\x00\x00\x00WAVEfmt \x00\x00\x00\x00")
		id := fmt.Sprintf("11111111-1111-4111-8111-%012d", seq)
		base := fmt.Sprintf("/api/admin/tareas/%d/adjuntos", tareaID)
		r1 := doRequest(rutas, "POST", base, admin, map[string]any{
			"id": id, "nombre": nombre, "tipo": "audio", "tamano": len(audio), "resumir": false,
		})
		if r1.Code != 200 {
			t.Fatalf("reservar audio: %d %s", r1.Code, r1.Body.String())
		}
		req := httptest.NewRequest("PUT", base+"/"+id+"/partes/0", bytes.NewReader(audio))
		req.Header.Set("X-Demo-User", admin)
		w := httptest.NewRecorder()
		rutas.ServeHTTP(w, req)
		if w.Code != 204 {
			t.Fatalf("parte audio: %d %s", w.Code, w.Body.String())
		}
		var finBody any
		if inicial {
			finBody = map[string]any{"inicial": true}
		}
		r3 := doRequest(rutas, "POST", base+"/"+id+"/finalizar", admin, finBody)
		if r3.Code != 201 {
			t.Fatalf("finalizar audio: %d %s", r3.Code, r3.Body.String())
		}
	}

	// 1. Editar tarea existente notifica a asignado_a con URL al detalle
	t1, err := s.CrearTarea(ctx, &store.Tarea{TipoID: 2, AsignadoA: editor, CreadoPor: admin, Titulo: "Corte A"})
	if err != nil {
		t.Fatal(err)
	}
	if r := doRequest(rutas, "PATCH", fmt.Sprintf("/api/admin/tareas/%d", t1.ID), admin, map[string]any{"descripcion": "Nueva descripción detallada"}); r.Code != 200 {
		t.Fatalf("patch t1: %d %s", r.Code, r.Body.String())
	}
	avisos1 := leerBandeja(editor)
	if len(avisos1) != 1 || avisos1[0].Titulo != "Pedido actualizado" || avisos1[0].URL != fmt.Sprintf("/trabajos/%d?desde=tareas", t1.ID) {
		t.Fatalf("aviso esperado tras PATCH: %+v", avisos1)
	}

	// 2. Subir audio nuevo a tarea existente notifica y deduplica múltiples archivos en la misma ventana
	t2, err := s.CrearTarea(ctx, &store.Tarea{TipoID: 2, AsignadoA: editor, CreadoPor: admin, Titulo: "Corte B"})
	if err != nil {
		t.Fatal(err)
	}
	subirAudio(t2.ID, "indicacion-1.wav", false)
	subirAudio(t2.ID, "indicacion-2.wav", false)
	avisos2 := leerBandeja(editor)
	if len(avisos2) != 2 {
		t.Fatalf("debía deduplicar los 2 audios en un solo aviso adicional (total 2), obtuvo %d: %+v", len(avisos2), avisos2)
	}
	if avisos2[0].Titulo != "Pedido actualizado" || !strings.Contains(strings.ToLower(avisos2[0].Cuerpo), "audio") || avisos2[0].URL != fmt.Sprintf("/trabajos/%d?desde=tareas", t2.ID) {
		t.Fatalf("aviso de audio inesperado: %+v", avisos2[0])
	}

	// 3. Subida inicial durante creación no dispara "Pedido actualizado"
	t3, err := s.CrearTarea(ctx, &store.Tarea{TipoID: 2, AsignadoA: editor, CreadoPor: admin, Titulo: "Corte C"})
	if err != nil {
		t.Fatal(err)
	}
	subirAudio(t3.ID, "inicial.wav", true)
	if avisos3 := leerBandeja(editor); len(avisos3) != 2 {
		t.Fatalf("subida inicial no debe duplicar aviso: %+v", avisos3)
	}

	// 4. Si actor == asignado_a (auto-asignado), ni PATCH ni audio generan notificación para sí mismo
	tAuto, err := s.CrearTarea(ctx, &store.Tarea{TipoID: 2, AsignadoA: admin, CreadoPor: admin, Titulo: "Auto asignado"})
	if err != nil {
		t.Fatal(err)
	}
	if r := doRequest(rutas, "PATCH", fmt.Sprintf("/api/admin/tareas/%d", tAuto.ID), admin, map[string]any{"descripcion": "Cambio propio"}); r.Code != 200 {
		t.Fatalf("patch auto-asignado: %d %s", r.Code, r.Body.String())
	}
	subirAudio(tAuto.ID, "propio.wav", false)
	if avisosAdmin := leerBandeja(admin); len(avisosAdmin) != 0 {
		t.Fatalf("no debe notificarse al mismo actor auto-asignado: %+v", avisosAdmin)
	}
}
