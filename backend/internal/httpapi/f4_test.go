package httpapi_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"rconceptsys/backend/internal/store"
)

func crearTareaF4(t *testing.T, routes http.Handler, adminID, editorID string, titulo string) store.Tarea {
	t.Helper()
	res := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"fecha_limite": "2026-12-05",
		"cliente_id":   1,
		"tipo_id":      2, "asignado_a": editorID, "titulo": titulo, "descripcion": titulo,
	})
	if res.Code != http.StatusCreated {
		t.Fatalf("crear tarea %q: esperado 201, obtenido %d: %s", titulo, res.Code, res.Body.String())
	}
	var creada store.Tarea
	_ = json.Unmarshal(res.Body.Bytes(), &creada)
	return creada
}

// Enlace válido de Drive persiste y aparece en bandeja y listado admin.
func TestF4EnlaceDriveValido(t *testing.T) {
	routes, _, adminID, editorID, _, _ := setupF2TestEnvironment(t)
	creada := crearTareaF4(t, routes, adminID, editorID, "Editar video con enlace Drive")

	enlace := "https://drive.google.com/drive/folders/1ABCdefGHIjklMNOpqrstUVWXYZ"
	res := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", creada.ID), editorID, map[string]any{
		"nota": "Listo", "enlace_medios": "  " + enlace + "  ",
	})
	if res.Code != http.StatusOK {
		t.Fatalf("esperado 200, obtenido %d: %s", res.Code, res.Body.String())
	}
	var hecha store.Tarea
	_ = json.Unmarshal(res.Body.Bytes(), &hecha)
	if hecha.EnlaceMedios == nil || *hecha.EnlaceMedios != enlace {
		t.Fatalf("enlace no normalizado/persistido: %+v", hecha.EnlaceMedios)
	}

	// Bandeja por_revisar (alias) y hecha devuelven la tarea con enlace
	for _, q := range []string{"por_revisar", "hecha"} {
		g := doRequest(routes, "GET", "/api/admin/tareas?estado="+q, adminID, nil)
		var resp struct {
			Tareas     []*store.Tarea `json:"tareas"`
			PorRevisar int            `json:"por_revisar"`
		}
		_ = json.Unmarshal(g.Body.Bytes(), &resp)
		if resp.PorRevisar != 1 || len(resp.Tareas) != 1 {
			t.Fatalf("estado=%s: por_revisar=%d tareas=%d", q, resp.PorRevisar, len(resp.Tareas))
		}
		if resp.Tareas[0].EnlaceMedios == nil || *resp.Tareas[0].EnlaceMedios != enlace {
			t.Fatalf("estado=%s: enlace ausente en admin: %+v", q, resp.Tareas[0].EnlaceMedios)
		}
	}
}

// Host ajeno, http sin TLS y enlace demasiado largo se rechazan con 400.
func TestF4EnlaceDriveInvalido(t *testing.T) {
	routes, _, adminID, editorID, _, _ := setupF2TestEnvironment(t)
	creada := crearTareaF4(t, routes, adminID, editorID, "Tarea enlaces invalidos")

	casos := []struct {
		nombre string
		enlace string
	}{
		{"host ajeno", "https://example.com/carpeta"},
		{"http sin TLS", "http://drive.google.com/drive/folders/abc"},
		{"demasiado largo", "https://drive.google.com/drive/folders/" + strings.Repeat("a", 470)},
		{"no es URL", "no-es-una-url"},
	}
	for _, c := range casos {
		res := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", creada.ID), editorID, map[string]any{
			"enlace_medios": c.enlace,
		})
		if res.Code != http.StatusBadRequest {
			t.Fatalf("%s: esperado 400, obtenido %d: %s", c.nombre, res.Code, res.Body.String())
		}
		if !strings.Contains(res.Body.String(), "Google Drive") {
			t.Fatalf("%s: mensaje poco claro: %s", c.nombre, res.Body.String())
		}
	}
	// La tarea sigue pendiente tras los intentos inválidos
	g := doRequest(routes, "GET", "/api/tareas", editorID, nil)
	var mis []*store.Tarea
	_ = json.Unmarshal(g.Body.Bytes(), &mis)
	if len(mis) != 1 || mis[0].Estado != store.EstadoTareaPendiente {
		t.Fatalf("tarea no debía cambiar de estado: %+v", mis)
	}
}

// Enlace vacío (o ausente, o solo espacios) está permitido.
func TestF4EnlaceVacioPermitido(t *testing.T) {
	routes, _, adminID, editorID, _, _ := setupF2TestEnvironment(t)
	creada := crearTareaF4(t, routes, adminID, editorID, "Tarea sin enlace")

	res := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", creada.ID), editorID, map[string]any{
		"enlace_medios": "   ",
	})
	if res.Code != http.StatusOK {
		t.Fatalf("esperado 200 con enlace vacío, obtenido %d: %s", res.Code, res.Body.String())
	}
	var hecha store.Tarea
	_ = json.Unmarshal(res.Body.Bytes(), &hecha)
	if hecha.EnlaceMedios != nil {
		t.Fatalf("enlace vacío debía quedar nil: %v", *hecha.EnlaceMedios)
	}
}

// Aviso con menos de 3 letras/dígitos se rechaza (caso ",").
func TestF4AvisoInvalido(t *testing.T) {
	routes, _, adminID, editorID, _, _ := setupF2TestEnvironment(t)
	for _, titulo := range []string{",", "  ,  ", "a", "!!"} {
		res := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
			"fecha_limite": "2026-12-05",
			"cliente_id":   1,
			"tipo_id":      2, "asignado_a": editorID, "titulo": titulo, "descripcion": titulo,
		})
		if res.Code != http.StatusBadRequest {
			t.Fatalf("titulo %q: esperado 400, obtenido %d: %s", titulo, res.Code, res.Body.String())
		}
	}
	// Aviso válido mínimo (3 letras) sí se crea
	creada := crearTareaF4(t, routes, adminID, editorID, "abc")
	if creada.ID == 0 {
		t.Fatal("aviso válido mínimo no se creó")
	}
}

// Precios semilla realistas en modo memoria: factura distinta de cero sin PATCH.
func TestF4PreciosSemillaYFactura(t *testing.T) {
	routes, _, adminID, editorID, _, _ := setupF2TestEnvironment(t)
	creada := crearTareaF4(t, routes, adminID, editorID, "Edicion con precio semilla")
	_ = doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", creada.ID), editorID, nil)
	res := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/aceptar", creada.ID), adminID, nil)
	if res.Code != http.StatusOK {
		t.Fatalf("aceptar: %d %s", res.Code, res.Body.String())
	}
	var aceptada store.Tarea
	_ = json.Unmarshal(res.Body.Bytes(), &aceptada)
	if aceptada.PrecioCongelado == nil || *aceptada.PrecioCongelado != 75000 {
		t.Fatalf("precio semilla edicion_video esperado 75000: %v", aceptada.PrecioCongelado)
	}
	g := doRequest(routes, "GET", "/api/facturas/mia", editorID, nil)
	var mia struct {
		TotalPendiente int `json:"total_pendiente"`
	}
	_ = json.Unmarshal(g.Body.Bytes(), &mia)
	if mia.TotalPendiente != 75000 {
		t.Fatalf("factura esperada 75000, obtenida %d", mia.TotalPendiente)
	}
}

// La primera tarea de una sesión demo tiene id 1 y no colisiona al recrear.
func TestF4PrimerIDSinColision(t *testing.T) {
	routes, _, adminID, editorID, _, _ := setupF2TestEnvironment(t)
	t1 := crearTareaF4(t, routes, adminID, editorID, "Primera tarea sesion demo")
	t2 := crearTareaF4(t, routes, adminID, editorID, "Segunda tarea sesion demo")
	if t1.ID != 1 || t2.ID != 2 {
		t.Fatalf("ids esperados 1 y 2, obtenidos %d y %d", t1.ID, t2.ID)
	}
}
