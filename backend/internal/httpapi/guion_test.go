package httpapi_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"rconceptsys/backend/internal/store"
)

func TestGuionAsignacion(t *testing.T) {
	rutas, s, admin, editor, otraPersona, _ := setupF2TestEnvironment(t)
	ctx := context.Background()
	if err := s.GuardarCelular(ctx, editor, "+573001112233"); err != nil {
		t.Fatal(err)
	}
	const secreto = "ESCENA 1: Cámara fija\n\nLocución: <texto>"
	post := func(extra map[string]any) *store.Tarea {
		t.Helper()
		datos := map[string]any{"tipo_id": 2, "asignado_a": editor, "titulo": "Video QA", "descripcion": "Planos del producto", "fecha_limite": "2026-12-05"}
		for k, v := range extra {
			datos[k] = v
		}
		r := doRequest(rutas, "POST", "/api/admin/tareas", admin, datos)
		var tarea store.Tarea
		if r.Code != http.StatusCreated || json.Unmarshal(r.Body.Bytes(), &tarea) != nil || tarea.ID == 0 {
			t.Fatalf("POST: %d %s", r.Code, r.Body)
		}
		return &tarea
	}
	con := post(map[string]any{"guion": " \n" + secreto + "  "})
	sin := post(nil)
	if con.Guion != secreto || sin.Guion != "" || con.Descripcion == nil || *con.Descripcion != "Planos del producto" {
		t.Fatalf("Texto inesperado: %q, %q, %v", con.Guion, sin.Guion, con.Descripcion)
	}
	avisos := contarAvisos(t, s, editor, "tarea-nueva")
	if len(avisos) != 2 {
		t.Fatalf("Avisos de asignación: %+v", avisos)
	}
	for _, n := range avisos {
		if strings.Contains(n.Cuerpo, "Incluye guion") != strings.Contains(n.URL, fmt.Sprintf("#tarea-%d", con.ID)) || strings.Contains(n.Cuerpo, "ESCENA") {
			t.Fatalf("Aviso: %+v", n)
		}
	}
	for _, tarea := range []*store.Tarea{con, sin} {
		ruta := fmt.Sprintf("/api/tareas/%d/whatsapp?para=asignacion", tarea.ID)
		r := doRequest(rutas, "GET", ruta, admin, nil)
		var respuesta struct{ URL string }
		if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &respuesta) != nil {
			t.Fatalf("WhatsApp: %d %s", r.Code, r.Body)
		}
		enlace, err := url.Parse(respuesta.URL)
		if err != nil || enlace.Host != "wa.me" || enlace.Path != "/573001112233" || strings.Contains(enlace.Query().Get("text"), "Incluye guion") != (tarea.ID == con.ID) || strings.Contains(enlace.Query().Get("text"), "ESCENA") {
			t.Fatalf("WhatsApp: %v %v", enlace, err)
		}
		if r := doRequest(rutas, "GET", ruta, editor, nil); r.Code != 403 {
			t.Fatalf("Asignado accedió al WhatsApp de asignación: %d", r.Code)
		}
	}
	detalle := fmt.Sprintf("/api/tareas/%d/detalle", con.ID)
	if r := doRequest(rutas, "GET", detalle, otraPersona, nil); r.Code != http.StatusForbidden || strings.Contains(r.Body.String(), "ESCENA") {
		t.Fatalf("Guion de otra persona: %d", r.Code)
	}
	ruta := fmt.Sprintf("/api/admin/tareas/%d", con.ID)
	const emoji = "🎬"
	alLimite := strings.Repeat(emoji, store.MaxCaracteresGuion)
	maxJSON := `{"guion":"` + strings.Repeat(`\ud83c\udfac`, store.MaxCaracteresGuion) + `"}`
	for _, paso := range []struct {
		body any
		want string
	}{
		{map[string]string{"descripcion": "Especificaciones nuevas"}, secreto},
		{maxJSON, alLimite},
		{map[string]string{"guion": "    "}, ""},
		{map[string]string{"guion": secreto}, secreto},
	} {
		r := doRequest(rutas, "PATCH", ruta, admin, paso.body)
		var actual store.Tarea
		if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &actual) != nil || actual.Guion != paso.want {
			t.Fatalf("PATCH: %d; guion de %d bytes", r.Code, len(actual.Guion))
		}
	}
	post(map[string]any{"guion": alLimite})
	for _, rutaMetodo := range []struct{ metodo, ruta string }{{"POST", "/api/admin/tareas"}, {"PATCH", ruta}} {
		datos := map[string]any{"guion": alLimite + emoji}
		if rutaMetodo.metodo == "POST" {
			datos["titulo"] = "Video demasiado largo"
		}
		r := doRequest(rutas, rutaMetodo.metodo, rutaMetodo.ruta, admin, datos)
		if r.Code != 400 || !strings.Contains(r.Body.String(), "20.000 caracteres") {
			t.Fatalf("Límite de %s: %d %s", rutaMetodo.metodo, r.Code, r.Body)
		}
	}
	if _, err := s.EntregarTarea(ctx, con.ID, editor, store.EntregaInput{Metodo: "whatsapp"}); err != nil {
		t.Fatal(err)
	}
	aprobada, err := s.AceptarTarea(ctx, con.ID, admin, nil)
	if err != nil || aprobada.FacturaID == nil {
		t.Fatalf("Aceptar: %v", err)
	}
	if r := doRequest(rutas, "PATCH", ruta, admin, map[string]string{"guion": "no editable"}); r.Code != 409 {
		t.Fatalf("Edición tras aceptar/facturar: %d", r.Code)
	}
	f, err := s.ObtenerFacturaPorID(ctx, *aprobada.FacturaID)
	if err != nil || len(f.Lineas) != 1 || f.Lineas[0].Guion != "" {
		t.Fatalf("Una factura no debe contener el guion: %+v / %v", f, err)
	}
	r := doRequest(rutas, "POST", rutaReapertura(con.ID), admin, nil)
	var reabierta store.Tarea
	if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &reabierta) != nil || reabierta.Guion != secreto || reabierta.ID != con.ID || reabierta.Estado != store.EstadoTareaPendiente {
		t.Fatalf("Pedir de nuevo debe conservar el guion: %d %s", r.Code, r.Body)
	}
}
