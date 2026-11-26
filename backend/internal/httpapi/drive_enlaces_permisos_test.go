package httpapi_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"rconceptsys/backend/internal/httpapi"
	"rconceptsys/backend/internal/store"
)

func TestDriveCuentaEquipoYCorreoPickerToken(t *testing.T) {
	ctx := context.Background()
	t.Setenv("DRIVE_CUENTA_EQUIPO", "")
	t.Setenv("NEXT_PUBLIC_DRIVE_CUENTA_EQUIPO", "")
	api, s := configurarTestAPI()
	const admin = "admin-cuenta"
	if err := s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID: admin, Correo: "juan@rconcept.com", Nombre: "Admin", Estado: store.EstadoAprobado, EsAdmin: true,
	}); err != nil {
		t.Fatal(err)
	}
	api.F5.Drive = httpapi.ConfDrive{
		ClientID: "client", ClientSecret: "secret", PickerKey: "picker-key", PickerAppID: "123",
	}
	if err := s.GuardarConexionDrive(ctx, &store.ConexionDrive{
		Correo:            "otra-cuenta@gmail.com",
		CarpetaRaizID:     "raiz_1",
		CarpetaClientesID: "raiz_1",
		RefreshToken:      "refresh-secreto-test",
	}); err != nil {
		t.Fatal(err)
	}
	api.F5.HTTP = &http.Client{Transport: transporteDrivePruebas(func(r *http.Request) (*http.Response, error) {
		send := func(code int, v any) (*http.Response, error) {
			b, _ := json.Marshal(v)
			return &http.Response{StatusCode: code, Body: io.NopCloser(strings.NewReader(string(b))), Header: make(http.Header)}, nil
		}
		if r.URL.Host == "oauth2.googleapis.com" {
			return send(200, map[string]any{"access_token": "tok-demo", "expires_in": 3600})
		}
		if r.URL.Path == "/drive/v3/about" {
			return send(200, map[string]any{"user": map[string]string{"emailAddress": "token-real@gmail.com"}})
		}
		if r.URL.Path == "/drive/v3/files/raiz_1" {
			return send(200, map[string]any{"id": "raiz_1", "name": "RConcept", "mimeType": "application/vnd.google-apps.folder", "trashed": false})
		}
		return send(404, nil)
	})}

	rutas := api.Routes()

	estRes := doRequest(rutas, "GET", "/api/admin/drive", admin, nil)
	if estRes.Code != http.StatusOK {
		t.Fatalf("estado drive: %d %s", estRes.Code, estRes.Body.String())
	}
	var est map[string]any
	_ = json.Unmarshal(estRes.Body.Bytes(), &est)
	if est["cuenta_equipo"] != "ladlejuan26@gmail.com" || est["correo"] != "otra-cuenta@gmail.com" {
		t.Fatalf("estado inesperado: %+v", est)
	}

	pickRes := doRequest(rutas, "GET", "/api/admin/drive/picker-token", admin, nil)
	if pickRes.Code != http.StatusOK {
		t.Fatalf("picker-token: %d %s", pickRes.Code, pickRes.Body.String())
	}
	if strings.Contains(pickRes.Body.String(), "refresh-secreto-test") || strings.Contains(pickRes.Body.String(), "refresh_token") {
		t.Fatalf("el picker-token nunca debe exponer el refresh_token: %s", pickRes.Body.String())
	}
	var pick map[string]any
	_ = json.Unmarshal(pickRes.Body.Bytes(), &pick)
	if pick["correo"] != "token-real@gmail.com" || pick["cuenta_equipo"] != "ladlejuan26@gmail.com" {
		t.Fatalf("picker-token debe reportar correo real del token y cuenta_equipo: %+v", pick)
	}

	// Override configurable por variable de entorno
	t.Setenv("DRIVE_CUENTA_EQUIPO", "equipo-custom@gmail.com")
	api2, s2 := configurarTestAPI()
	_ = s2.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID: admin, Correo: "juan@rconcept.com", Nombre: "Admin", Estado: store.EstadoAprobado, EsAdmin: true,
	})
	estCustom := doRequest(api2.Routes(), "GET", "/api/admin/drive", admin, nil)
	var estC map[string]any
	_ = json.Unmarshal(estCustom.Body.Bytes(), &estC)
	if estC["cuenta_equipo"] != "equipo-custom@gmail.com" {
		t.Fatalf("override DRIVE_CUENTA_EQUIPO esperado: %+v", estC)
	}
}

func TestEnlacesEquipoDuplicadoMax12YValidacion(t *testing.T) {
	routes, _, adminID, _, _, _ := setupF2TestEnvironment(t)

	// URLs inválidas
	for _, url := range []string{
		"http://drive.google.com/drive/folders/abc",
		"https://usuario:clave@drive.google.com/drive/folders/abc",
		"https://",
		"no-es-url",
	} {
		r := doRequest(routes, "POST", "/api/admin/equipo/enlaces", adminID, map[string]any{
			"nombre": "Enlace malo", "url": url,
		})
		if r.Code != http.StatusBadRequest {
			t.Fatalf("URL inválida %q esperaba 400, obtuvo %d: %s", url, r.Code, r.Body.String())
		}
	}

	// Crear enlace válido
	r1 := doRequest(routes, "POST", "/api/admin/equipo/enlaces", adminID, map[string]any{
		"nombre": "Carpeta Madre", "url": "https://drive.google.com/drive/folders/1AbCDefGhiJ",
	})
	if r1.Code != http.StatusCreated {
		t.Fatalf("crear enlace válido: %d %s", r1.Code, r1.Body.String())
	}

	// Duplicados exactos y normalizados (barra final / mayúsculas de host) se rechazan
	for _, dup := range []string{
		"https://drive.google.com/drive/folders/1AbCDefGhiJ",
		"https://Drive.Google.com/drive/folders/1AbCDefGhiJ/",
		"  https://drive.google.com/drive/folders/1AbCDefGhiJ  ",
	} {
		rd := doRequest(routes, "POST", "/api/admin/equipo/enlaces", adminID, map[string]any{
			"nombre": "Duplicado", "url": dup,
		})
		if rd.Code != http.StatusBadRequest {
			t.Fatalf("duplicado %q esperaba 400, obtuvo %d: %s", dup, rd.Code, rd.Body.String())
		}
	}

	// Llenar hasta 12 enlaces y comprobar tope
	for i := 2; i <= 12; i++ {
		ri := doRequest(routes, "POST", "/api/admin/equipo/enlaces", adminID, map[string]any{
			"nombre": fmt.Sprintf("Carpeta %d", i),
			"url":    fmt.Sprintf("https://drive.google.com/drive/folders/folder%02d", i),
		})
		if ri.Code != http.StatusCreated {
			t.Fatalf("enlace %d: %d %s", i, ri.Code, ri.Body.String())
		}
	}
	r13 := doRequest(routes, "POST", "/api/admin/equipo/enlaces", adminID, map[string]any{
		"nombre": "Carpeta 13", "url": "https://drive.google.com/drive/folders/folder13",
	})
	if r13.Code != http.StatusBadRequest {
		t.Fatalf("enlace 13 esperaba 400, obtuvo %d: %s", r13.Code, r13.Body.String())
	}

	// PATCH no puede duplicar la URL de otro enlace
	rp := doRequest(routes, "PATCH", "/api/admin/equipo/enlaces/2", adminID, map[string]any{
		"url": "https://drive.google.com/drive/folders/1AbCDefGhiJ",
	})
	if rp.Code != http.StatusBadRequest {
		t.Fatalf("PATCH duplicando URL esperaba 400, obtuvo %d: %s", rp.Code, rp.Body.String())
	}
}

func TestPermisosTrabajadoresNoAdminEnDriveYAdjuntos(t *testing.T) {
	routes, _, adminID, editorID, camID, _ := setupF2TestEnvironment(t)

	// Crear tarea para editorID (no para camID)
	tarea := crearTareaF4(t, routes, adminID, editorID, "Editar reel de cliente")

	// 1. Ningún no-admin puede editar, mover, crear carpetas ni borrar en Drive o adjuntos de asignación
	rutasProhibidas := []struct {
		metodo string
		ruta   string
	}{
		{"GET", "/api/admin/drive"},
		{"POST", "/api/admin/drive/conectar"},
		{"POST", "/api/admin/drive/desconectar"},
		{"POST", "/api/admin/drive/organizar"},
		{"POST", "/api/admin/drive/migrar-carpetas"},
		{"GET", "/api/admin/drive/picker-token"},
		{"GET", "/api/admin/drive/archivos"},
		{"POST", fmt.Sprintf("/api/admin/tareas/%d/drive-carpeta", tarea.ID)},
		{"POST", "/api/admin/clientes/1/drive"},
		{"PATCH", "/api/admin/clientes/1"},
		{"PATCH", fmt.Sprintf("/api/admin/tareas/%d", tarea.ID)},
		{"POST", "/api/admin/equipo/enlaces"},
		{"PATCH", "/api/admin/equipo/enlaces/1"},
		{"DELETE", "/api/admin/equipo/enlaces/1"},
		{"POST", fmt.Sprintf("/api/admin/tareas/%d/adjuntos", tarea.ID)},
		{"PUT", fmt.Sprintf("/api/admin/tareas/%d/adjuntos/00000000-0000-4000-8000-000000000001/partes/0", tarea.ID)},
		{"POST", fmt.Sprintf("/api/admin/tareas/%d/adjuntos/00000000-0000-4000-8000-000000000001/finalizar", tarea.ID)},
		{"PATCH", fmt.Sprintf("/api/admin/tareas/%d/adjuntos/00000000-0000-4000-8000-000000000001", tarea.ID)},
		{"DELETE", fmt.Sprintf("/api/admin/tareas/%d/adjuntos/00000000-0000-4000-8000-000000000001", tarea.ID)},
	}
	for _, tc := range rutasProhibidas {
		for _, usuario := range []string{editorID, camID} {
			res := doRequest(routes, tc.metodo, tc.ruta, usuario, map[string]any{})
			if res.Code != http.StatusForbidden {
				t.Fatalf("no-admin %s en %s %s: esperaba 403, obtuvo %d (%s)", usuario, tc.metodo, tc.ruta, res.Code, res.Body.String())
			}
		}
	}

	// 2. Trabajador SÍ puede ver sus flujos autorizados y adjuntar/mandar enlaces Drive válidos en chat y entrega
	for _, getRuta := range []string{
		"/api/equipo/resumen",
		"/api/clientes",
		"/api/clientes/1",
		"/api/tareas",
		fmt.Sprintf("/api/tareas/%d/detalle", tarea.ID),
		fmt.Sprintf("/api/tareas/%d/adjuntos", tarea.ID),
	} {
		r := doRequest(routes, "GET", getRuta, editorID, nil)
		if r.Code != http.StatusOK {
			t.Fatalf("trabajador leyendo %s: esperaba 200, obtuvo %d (%s)", getRuta, r.Code, r.Body.String())
		}
	}

	// Otro trabajador NO puede ver detalles ni adjuntos de tarea ajena
	if r := doRequest(routes, "GET", fmt.Sprintf("/api/tareas/%d/detalle", tarea.ID), camID, nil); r.Code != http.StatusForbidden {
		t.Fatalf("camID viendo detalle ajeno esperaba 403, obtuvo %d", r.Code)
	}
	if r := doRequest(routes, "GET", fmt.Sprintf("/api/tareas/%d/adjuntos", tarea.ID), camID, nil); r.Code != http.StatusForbidden {
		t.Fatalf("camID viendo adjuntos ajenos esperaba 403, obtuvo %d", r.Code)
	}

	// En el chat, trabajador puede compartir carpeta de Drive válida y enlazarla en mensaje
	adj := doRequest(routes, "POST", "/api/chat/adjuntos", editorID, map[string]any{
		"nombre": "Material del cliente",
		"url":    "https://drive.google.com/drive/folders/material12345",
	})
	if adj.Code != http.StatusCreated {
		t.Fatalf("adjuntar Drive en chat esperaba 201, obtuvo %d (%s)", adj.Code, adj.Body.String())
	}
	var adjunto store.ChatAdjunto
	_ = json.Unmarshal(adj.Body.Bytes(), &adjunto)
	if adjunto.Tipo != store.AdjuntoDrive || adjunto.URLExterna == nil || *adjunto.URLExterna != "https://drive.google.com/drive/folders/material12345" {
		t.Fatalf("adjunto Drive inesperado: %+v", adjunto)
	}

	// URLs maliciosas o fuera de Drive se rechazan en chat y entrega
	for _, urlMala := range []string{
		"https://evil@drive.google.com/drive/folders/abc123",
		"https://drive.google.com/",
		"http://drive.google.com/drive/folders/abc123",
		"https://ejemplo.com/drive",
	} {
		rc := doRequest(routes, "POST", "/api/chat/adjuntos", editorID, map[string]any{
			"nombre": "Malo", "url": urlMala,
		})
		if rc.Code != http.StatusBadRequest {
			t.Fatalf("chat Drive %q esperaba 400, obtuvo %d", urlMala, rc.Code)
		}
		rt := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), editorID, map[string]any{
			"enlace_medios": urlMala,
		})
		if rt.Code != http.StatusBadRequest {
			t.Fatalf("entrega Drive %q esperaba 400, obtuvo %d", urlMala, rt.Code)
		}
	}

	// Entrega válida de Drive por el trabajador
	okHecha := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), editorID, map[string]any{
		"enlace_medios": "https://drive.google.com/drive/folders/entrega_trabajador_1",
		"nota":          "Subido al Drive",
	})
	if okHecha.Code != http.StatusOK {
		t.Fatalf("entrega Drive válida esperaba 200, obtuvo %d (%s)", okHecha.Code, okHecha.Body.String())
	}
}
