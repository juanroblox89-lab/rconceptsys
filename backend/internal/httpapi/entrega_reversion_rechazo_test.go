package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"rconceptsys/backend/internal/httpapi"
	"rconceptsys/backend/internal/store"
)

func TestEntregaDriveYWhatsAppYValidacion(t *testing.T) {
	ctx := context.Background()
	api, s := configurarTestAPI()
	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID: "admin-1", Correo: "admin@rconcept.com", Nombre: "Admin", Estado: store.EstadoAprobado, EsAdmin: true,
	})
	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID: "ed-1", Correo: "ed@rconcept.com", Nombre: "Editor", Estado: store.EstadoAprobado, EsAdmin: false,
	})
	_ = s.GuardarConexionDrive(ctx, &store.ConexionDrive{
		Correo: "equipo@gmail.com", CarpetaRaizID: "raiz_1", CarpetaClientesID: "raiz_1", RefreshToken: "ref-secreto",
	})
	api.F5.Drive = httpapi.ConfDrive{ClientID: "cid", ClientSecret: "csec", PickerKey: "pk", PickerAppID: "123"}

	var copiasArchivo atomic.Int32
	api.F5.HTTP = &http.Client{Transport: transporteDrivePruebas(func(r *http.Request) (*http.Response, error) {
		send := func(code int, v any) (*http.Response, error) {
			b, _ := json.Marshal(v)
			return &http.Response{StatusCode: code, Body: io.NopCloser(strings.NewReader(string(b))), Header: make(http.Header)}, nil
		}
		if r.URL.Host == "oauth2.googleapis.com" {
			return send(200, map[string]any{"access_token": "tok-team", "expires_in": 3600})
		}
		if strings.Contains(r.URL.Path, "/copy") {
			copiasArchivo.Add(1)
			return send(200, map[string]any{"id": "copia_1", "name": "Final.mp4", "mimeType": "video/mp4", "webViewLink": "https://drive.google.com/file/d/copia_1/view"})
		}
		if r.URL.Path == "/drive/v3/files" {
			return send(200, map[string]any{"files": []map[string]any{{"id": "entregas_sub", "name": "Entregas"}}})
		}
		return send(404, nil)
	})}

	carpetaID := "carpeta_tarea_1"
	carpetaURL := "https://drive.google.com/drive/folders/" + carpetaID
	tarea, err := s.CrearTarea(ctx, &store.Tarea{
		TipoID: 2, Titulo: "Reel entrega", AsignadoA: "ed-1", CreadoPor: "admin-1",
		DriveCarpetaID: &carpetaID, DriveCarpetaURL: &carpetaURL,
	})
	if err != nil {
		t.Fatal(err)
	}
	routes := api.Routes()

	// 1. Entrega por Drive sin enlace -> 400
	rSinEnlace := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), "ed-1", map[string]any{
		"metodo_entrega": "drive",
		"nota":           "Olvidé el link",
	})
	if rSinEnlace.Code != http.StatusBadRequest {
		t.Fatalf("drive sin enlace esperaba 400, obtuvo %d: %s", rSinEnlace.Code, rSinEnlace.Body.String())
	}

	// 2. Método o tipo inválidos -> 400
	rMetodoMalo := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), "ed-1", map[string]any{
		"metodo_entrega": "telegram",
	})
	if rMetodoMalo.Code != http.StatusBadRequest {
		t.Fatalf("metodo inválido esperaba 400, obtuvo %d", rMetodoMalo.Code)
	}
	rTipoMalo := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), "ed-1", map[string]any{
		"metodo_entrega": "drive",
		"enlace_medios":  "https://drive.google.com/drive/folders/abc123456789",
		"entrega_tipo":   "zip",
	})
	if rTipoMalo.Code != http.StatusBadRequest {
		t.Fatalf("entrega_tipo inválido esperaba 400, obtuvo %d", rTipoMalo.Code)
	}

	// 3. URL inválida de Drive -> 400
	for _, mala := range []string{
		"http://drive.google.com/drive/folders/abc123456789",
		"https://evil@drive.google.com/drive/folders/abc123456789",
		"https://dropbox.com/s/archivo",
		"https://drive.google.com/",
	} {
		rMala := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), "ed-1", map[string]any{
			"metodo_entrega": "drive",
			"enlace_medios":  mala,
		})
		if rMala.Code != http.StatusBadRequest {
			t.Fatalf("URL mala %q esperaba 400, obtuvo %d", mala, rMala.Code)
		}
	}

	// 4. Entrega por Drive con carpeta: guarda nombre + tipo y NO intenta copiar carpeta
	rCarpeta := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), "ed-1", map[string]any{
		"metodo_entrega": "drive",
		"enlace_medios":  "https://drive.google.com/open?id=carpetaSeleccionada123",
		"entrega_nombre": "Cortes finales",
		"entrega_tipo":   "carpeta",
		"nota":           "Ahí están todos los clips",
	})
	if rCarpeta.Code != http.StatusOK {
		t.Fatalf("entrega carpeta esperaba 200, obtuvo %d: %s", rCarpeta.Code, rCarpeta.Body.String())
	}
	if copiasArchivo.Load() != 0 {
		t.Fatalf("no debe intentar copiar una carpeta, copias=%d", copiasArchivo.Load())
	}
	var tCarpeta store.Tarea
	_ = json.Unmarshal(rCarpeta.Body.Bytes(), &tCarpeta)
	if tCarpeta.MetodoEntrega == nil || *tCarpeta.MetodoEntrega != "drive" ||
		tCarpeta.EntregaNombre == nil || *tCarpeta.EntregaNombre != "Cortes finales" ||
		tCarpeta.EntregaTipo == nil || *tCarpeta.EntregaTipo != "carpeta" {
		t.Fatalf("datos de entrega carpeta incompletos: %+v", tCarpeta)
	}

	// 5. Revertir y entregar por WhatsApp limpia enlace/nombre/tipo previos
	rRev := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/revertir", tarea.ID), "ed-1", nil)
	if rRev.Code != http.StatusOK {
		t.Fatalf("revertir esperaba 200, obtuvo %d: %s", rRev.Code, rRev.Body.String())
	}
	rWA := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), "ed-1", map[string]any{
		"metodo_entrega": "whatsapp",
		"enlace_medios":  "https://drive.google.com/drive/folders/estoDebeIgnorarse",
		"nota":           "Enviado al grupo de WhatsApp",
	})
	if rWA.Code != http.StatusOK {
		t.Fatalf("entrega WhatsApp esperaba 200, obtuvo %d: %s", rWA.Code, rWA.Body.String())
	}
	var tWA store.Tarea
	_ = json.Unmarshal(rWA.Body.Bytes(), &tWA)
	if tWA.MetodoEntrega == nil || *tWA.MetodoEntrega != "whatsapp" ||
		tWA.EnlaceMedios != nil || tWA.EntregaNombre != nil || tWA.EntregaTipo != nil {
		t.Fatalf("WhatsApp debe limpiar campos de Drive: %+v", tWA)
	}
}

func TestPickerTrabajadorPermisosYProxyCarpeta(t *testing.T) {
	ctx := context.Background()
	api, s := configurarTestAPI()
	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID: "admin-1", Correo: "admin@rconcept.com", Nombre: "Admin", Estado: store.EstadoAprobado, EsAdmin: true,
	})
	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID: "ed-1", Correo: "ed@rconcept.com", Nombre: "Editor", Estado: store.EstadoAprobado, EsAdmin: false,
	})
	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID: "cam-1", Correo: "cam@rconcept.com", Nombre: "Camarografo", Estado: store.EstadoAprobado, EsAdmin: false,
	})
	_ = s.GuardarConexionDrive(ctx, &store.ConexionDrive{
		Correo: "ladlejuan26@gmail.com", CarpetaRaizID: "raiz_team", CarpetaClientesID: "raiz_team", RefreshToken: "refresh-super-secreto",
	})
	api.F5.Drive = httpapi.ConfDrive{
		ClientID: "client-id-publico", ClientSecret: "client-secret-privado", PickerKey: "picker-key", PickerAppID: "999",
	}

	api.F5.HTTP = &http.Client{Transport: transporteDrivePruebas(func(r *http.Request) (*http.Response, error) {
		send := func(code int, v any) (*http.Response, error) {
			b, _ := json.Marshal(v)
			return &http.Response{StatusCode: code, Body: io.NopCloser(strings.NewReader(string(b))), Header: make(http.Header)}, nil
		}
		if r.URL.Host == "oauth2.googleapis.com" {
			return send(200, map[string]any{"access_token": "ya29.token-maestro-equipo-no-exponer", "expires_in": 3600})
		}
		if r.URL.Path == "/drive/v3/files/carpeta_ajena" {
			return send(200, map[string]any{
				"id": "carpeta_ajena", "name": "Otro Cliente", "mimeType": "application/vnd.google-apps.folder",
				"parents": []string{"raiz_team"}, "trashed": false,
			})
		}
		if r.URL.Path == "/drive/v3/files/sub_entregas" {
			return send(200, map[string]any{
				"id": "sub_entregas", "name": "Entregas", "mimeType": "application/vnd.google-apps.folder",
				"parents": []string{"carpeta_tarea_ok"}, "trashed": false,
			})
		}
		if r.URL.Path == "/drive/v3/files" {
			return send(200, map[string]any{
				"files": []map[string]any{
					{"id": "clip_final_1", "name": "Reel_v1.mp4", "mimeType": "video/mp4", "webViewLink": "https://drive.google.com/file/d/clip_final_1/view"},
				},
			})
		}
		return send(404, nil)
	})}

	carpetaOK := "carpeta_tarea_ok"
	carpetaURL := "https://drive.google.com/drive/folders/" + carpetaOK
	tarea, err := s.CrearTarea(ctx, &store.Tarea{
		TipoID: 2, Titulo: "Editar reel cliente", AsignadoA: "ed-1", CreadoPor: "admin-1",
		DriveCarpetaID: &carpetaOK, DriveCarpetaURL: &carpetaURL,
	})
	if err != nil {
		t.Fatal(err)
	}
	routes := api.Routes()

	// 1. /api/admin/drive/picker-token sigue prohibido (403) para trabajadores
	if r := doRequest(routes, "GET", "/api/admin/drive/picker-token", "ed-1", nil); r.Code != http.StatusForbidden {
		t.Fatalf("admin picker-token para trabajador esperaba 403, obtuvo %d", r.Code)
	}

	// 2. /api/tareas/{id}/drive/picker-token: 401 sin sesión, 403 otro trabajador, 404 inexistente
	if r := doRequest(routes, "GET", fmt.Sprintf("/api/tareas/%d/drive/picker-token", tarea.ID), "", nil); r.Code != http.StatusUnauthorized {
		t.Fatalf("sin sesión esperaba 401, obtuvo %d", r.Code)
	}
	if r := doRequest(routes, "GET", fmt.Sprintf("/api/tareas/%d/drive/picker-token", tarea.ID), "cam-1", nil); r.Code != http.StatusForbidden {
		t.Fatalf("otro trabajador esperaba 403, obtuvo %d", r.Code)
	}
	if r := doRequest(routes, "GET", "/api/tareas/9999/drive/picker-token", "ed-1", nil); r.Code != http.StatusNotFound {
		t.Fatalf("tarea inexistente esperaba 404, obtuvo %d", r.Code)
	}

	// 3. Trabajador asignado recibe configuración GIS solo-selección, NUNCA el token maestro ni secretos
	rPick := doRequest(routes, "GET", fmt.Sprintf("/api/tareas/%d/drive/picker-token", tarea.ID), "ed-1", nil)
	if rPick.Code != http.StatusOK {
		t.Fatalf("picker-token trabajador esperaba 200, obtuvo %d: %s", rPick.Code, rPick.Body.String())
	}
	cuerpoPick := rPick.Body.String()
	for _, secreto := range []string{"refresh-super-secreto", "client-secret-privado", "ya29.token-maestro-equipo-no-exponer", "access_token"} {
		if strings.Contains(cuerpoPick, secreto) {
			t.Fatalf("fuga de credenciales en picker-token trabajador (%s): %s", secreto, cuerpoPick)
		}
	}
	var cfg map[string]any
	_ = json.Unmarshal(rPick.Body.Bytes(), &cfg)
	if cfg["client_id"] != "client-id-publico" || cfg["scope"] != "https://www.googleapis.com/auth/drive.file" {
		t.Fatalf("configuración inesperada: %+v", cfg)
	}

	// 4. Proxy de archivos solo lectura: permite subcarpeta autorizada de la tarea, bloquea carpeta ajena
	if r := doRequest(routes, "GET", fmt.Sprintf("/api/tareas/%d/drive/archivos", tarea.ID), "cam-1", nil); r.Code != http.StatusForbidden {
		t.Fatalf("otro trabajador en archivos esperaba 403, obtuvo %d", r.Code)
	}
	if r := doRequest(routes, "GET", fmt.Sprintf("/api/tareas/%d/drive/archivos?carpeta=carpeta_ajena", tarea.ID), "ed-1", nil); r.Code != http.StatusForbidden {
		t.Fatalf("carpeta ajena esperaba 403, obtuvo %d: %s", r.Code, r.Body.String())
	}
	rSub := doRequest(routes, "GET", fmt.Sprintf("/api/tareas/%d/drive/archivos?carpeta=sub_entregas", tarea.ID), "ed-1", nil)
	if rSub.Code != http.StatusOK || !strings.Contains(rSub.Body.String(), "Reel_v1.mp4") {
		t.Fatalf("subcarpeta autorizada esperaba 200 con Reel_v1.mp4, obtuvo %d: %s", rSub.Code, rSub.Body.String())
	}
	if strings.Contains(rSub.Body.String(), "ya29.token") {
		t.Fatalf("no debe exponer token en listado de archivos")
	}
}

func TestReversionEntregaAtomicaPermisosYNotificacion(t *testing.T) {
	routes, s, adminID, editorID, camID, _ := setupF2TestEnvironment(t)
	tarea := crearTareaF4(t, routes, adminID, editorID, "Reel para revertir")

	// 1. Entregar por Drive
	rHecha := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), editorID, map[string]any{
		"metodo_entrega": "drive",
		"enlace_medios":  "https://drive.google.com/drive/folders/entrega_inicial_1",
		"entrega_nombre": "Entrega v1",
		"entrega_tipo":   "carpeta",
		"nota":           "Primera nota",
	})
	if rHecha.Code != http.StatusOK {
		t.Fatalf("hecha: %d %s", rHecha.Code, rHecha.Body.String())
	}

	// Admin abre el trabajo (registra vista)
	if rAdmVer := doRequest(routes, "GET", fmt.Sprintf("/api/admin/tareas/%d", tarea.ID), adminID, nil); rAdmVer.Code != http.StatusOK {
		t.Fatalf("admin get tarea: %d", rAdmVer.Code)
	}

	// 2. Permisos: sin sesión 401, otro trabajador 403, incluso admin (no dueño) 403
	if r := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/revertir", tarea.ID), "", nil); r.Code != http.StatusUnauthorized {
		t.Fatalf("sin sesión esperaba 401, obtuvo %d", r.Code)
	}
	if r := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/revertir", tarea.ID), camID, nil); r.Code != http.StatusForbidden {
		t.Fatalf("otro trabajador esperaba 403, obtuvo %d", r.Code)
	}
	if r := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/revertir", tarea.ID), adminID, nil); r.Code != http.StatusForbidden {
		t.Fatalf("admin no dueño esperaba 403, obtuvo %d", r.Code)
	}

	// 3. Reversión atómica exitosa -> 200
	rRev := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/revertir", tarea.ID), editorID, nil)
	if rRev.Code != http.StatusOK {
		t.Fatalf("revertir esperaba 200, obtuvo %d: %s", rRev.Code, rRev.Body.String())
	}
	var tRev store.Tarea
	_ = json.Unmarshal(rRev.Body.Bytes(), &tRev)
	if tRev.Estado != store.EstadoTareaPendiente || tRev.HechaEn != nil || tRev.EnlaceMedios != nil || tRev.MetodoEntrega != nil || tRev.NotaPersona != nil {
		t.Fatalf("las 2 partes no quedaron limpias tras revertir: %+v", tRev)
	}
	if tRev.BorradorEntrega == nil || tRev.BorradorEntrega.Metodo != "drive" ||
		tRev.BorradorEntrega.Nota == nil || *tRev.BorradorEntrega.Nota != "Primera nota" ||
		tRev.BorradorEntrega.EntregaNombre == nil || *tRev.BorradorEntrega.EntregaNombre != "Entrega v1" {
		t.Fatalf("borrador_entrega debe conservar la entrega retirada para edición: %+v", tRev.BorradorEntrega)
	}

	// 4. Doble clic / repetir revertir devuelve 409 Conflict
	rRev2 := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/revertir", tarea.ID), editorID, nil)
	if rRev2.Code != http.StatusConflict {
		t.Fatalf("segunda reversión esperaba 409, obtuvo %d: %s", rRev2.Code, rRev2.Body.String())
	}

	// 5. Admin que había abierto recibe notificación de retiro
	rNotif := doRequest(routes, "GET", "/api/notificaciones", adminID, nil)
	if rNotif.Code != http.StatusOK || !strings.Contains(rNotif.Body.String(), "entrega-retirada") {
		t.Fatalf("admin debía recibir notificación entrega-retirada: %d %s", rNotif.Code, rNotif.Body.String())
	}

	// 6. Historial guarda auditoría "Entrega retirada por el trabajador"
	rDet := doRequest(routes, "GET", fmt.Sprintf("/api/tareas/%d/detalle", tarea.ID), editorID, nil)
	var det store.Tarea
	_ = json.Unmarshal(rDet.Body.Bytes(), &det)
	encontradoRetiro := false
	for _, h := range det.Historial {
		if h.Evento == "entrega_retirada" && strings.Contains(strings.ToLower(h.Detalle), "entrega retirada por el trabajador") {
			encontradoRetiro = true
		}
	}
	if !encontradoRetiro {
		t.Fatalf("historial sin registro de retiro: %+v", det.Historial)
	}

	// 7. Reenviar por WhatsApp reemplaza la entrega anterior; aceptar bloquea revertir (409)
	if r := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), editorID, map[string]any{
		"metodo_entrega": "whatsapp",
		"nota":           "Corregido y enviado por WhatsApp",
	}); r.Code != http.StatusOK {
		t.Fatalf("reenvío WhatsApp: %d %s", r.Code, r.Body.String())
	}
	if r := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/aceptar", tarea.ID), adminID, nil); r.Code != http.StatusOK {
		t.Fatalf("aceptar: %d %s", r.Code, r.Body.String())
	}
	rRevAceptada := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/revertir", tarea.ID), editorID, nil)
	if rRevAceptada.Code != http.StatusConflict {
		t.Fatalf("revertir aceptada esperaba 409, obtuvo %d: %s", rRevAceptada.Code, rRevAceptada.Body.String())
	}

	_ = s
}

func TestConcurrenciaReversionYAceptacion(t *testing.T) {
	// Caso 1: Dos reversiones simultáneas -> exactamente 1 éxito (200) y 1 conflicto (409)
	t.Run("dos_reversiones_simultaneas", func(t *testing.T) {
		routes, _, adminID, editorID, _, _ := setupF2TestEnvironment(t)
		tarea := crearTareaF4(t, routes, adminID, editorID, "Concurrencia doble reversión")
		if r := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), editorID, map[string]any{
			"metodo_entrega": "whatsapp",
			"nota":           "Entrega A",
		}); r.Code != http.StatusOK {
			t.Fatal(r.Body.String())
		}

		start := make(chan struct{})
		var wg sync.WaitGroup
		codigos := make([]int, 2)
		for i := range 2 {
			idx := i
			wg.Go(func() {
				<-start
				r := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/revertir", tarea.ID), editorID, nil)
				codigos[idx] = r.Code
			})
		}
		close(start)
		wg.Wait()

		okCount, conflictCount := 0, 0
		for _, c := range codigos {
			if c == http.StatusOK {
				okCount++
			} else if c == http.StatusConflict {
				conflictCount++
			}
		}
		if okCount != 1 || conflictCount != 1 {
			t.Fatalf("esperaba exactamente un 200 y un 409, obtuvo %v", codigos)
		}

		det := doRequest(routes, "GET", fmt.Sprintf("/api/tareas/%d/detalle", tarea.ID), editorID, nil)
		var d store.Tarea
		_ = json.Unmarshal(det.Body.Bytes(), &d)
		retiros := 0
		for _, h := range d.Historial {
			if h.Evento == "entrega_retirada" {
				retiros++
			}
		}
		if retiros != 1 {
			t.Fatalf("se duplicó el historial de retiro: %d", retiros)
		}
	})

	// Caso 2: Revertir mientras el admin acepta (20 rondas concurrentes)
	t.Run("revertir_vs_aceptar", func(t *testing.T) {
		for ronda := range 20 {
			routes, _, adminID, editorID, _, _ := setupF2TestEnvironment(t)
			tarea := crearTareaF4(t, routes, adminID, editorID, fmt.Sprintf("Carrera %d", ronda))
			if r := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), editorID, map[string]any{
				"metodo_entrega": "drive",
				"enlace_medios":  "https://drive.google.com/drive/folders/carrera12345",
			}); r.Code != http.StatusOK {
				t.Fatal(r.Body.String())
			}

			start := make(chan struct{})
			var wg sync.WaitGroup
			var codRevertir, codAceptar int
			wg.Go(func() {
				<-start
				codRevertir = doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/revertir", tarea.ID), editorID, nil).Code
			})
			wg.Go(func() {
				<-start
				codAceptar = doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/aceptar", tarea.ID), adminID, nil).Code
			})
			close(start)
			wg.Wait()

			if (codRevertir == http.StatusOK) == (codAceptar == http.StatusOK) {
				t.Fatalf("ronda %d: debe ganar exactamente uno (revertir=%d aceptar=%d)", ronda, codRevertir, codAceptar)
			}

			rFinal := doRequest(routes, "GET", fmt.Sprintf("/api/admin/tareas/%d", tarea.ID), adminID, nil)
			var final store.Tarea
			_ = json.Unmarshal(rFinal.Body.Bytes(), &final)
			if codAceptar == http.StatusOK {
				if final.Estado != store.EstadoTareaAceptada || final.FacturaID == nil || codRevertir != http.StatusConflict {
					t.Fatalf("ronda %d inconsistencia tras aceptar: estado=%s factura=%v rev=%d", ronda, final.Estado, final.FacturaID, codRevertir)
				}
			} else {
				if final.Estado != store.EstadoTareaPendiente || final.FacturaID != nil || final.EnlaceMedios != nil {
					t.Fatalf("ronda %d inconsistencia tras revertir: %+v", ronda, final)
				}
			}
		}
	})

	// Caso 3: Revertir mientras el admin rechaza
	t.Run("revertir_vs_rechazar", func(t *testing.T) {
		for ronda := range 10 {
			routes, _, adminID, editorID, _, _ := setupF2TestEnvironment(t)
			tarea := crearTareaF4(t, routes, adminID, editorID, fmt.Sprintf("Carrera rechazo %d", ronda))
			_ = doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), editorID, map[string]any{"metodo_entrega": "whatsapp"})

			start := make(chan struct{})
			var wg sync.WaitGroup
			var codRev, codRech int
			wg.Go(func() {
				<-start
				codRev = doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/revertir", tarea.ID), editorID, nil).Code
			})
			wg.Go(func() {
				<-start
				codRech = doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/rechazar", tarea.ID), adminID, map[string]any{"motivo": "Ajusta el volumen"}).Code
			})
			close(start)
			wg.Wait()

			if (codRev == http.StatusOK) == (codRech == http.StatusOK) {
				t.Fatalf("ronda %d: debe ganar exactamente uno (rev=%d rech=%d)", ronda, codRev, codRech)
			}
		}
	})
}

func TestRechazoConAdjuntosMultimediaYDrive(t *testing.T) {
	routes, _, adminID, editorID, camID, _ := setupF2TestEnvironment(t)
	tarea := crearTareaF4(t, routes, adminID, editorID, "Reel con notas visuales")
	otraTarea := crearTareaF4(t, routes, adminID, editorID, "Otra tarea")

	if r := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), editorID, map[string]any{
		"metodo_entrega": "whatsapp",
	}); r.Code != http.StatusOK {
		t.Fatal(r.Body.String())
	}

	// 1. No-admin no puede rechazar
	if r := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/rechazar", tarea.ID), editorID, map[string]any{
		"motivo": "Intento inválido",
	}); r.Code != http.StatusForbidden {
		t.Fatalf("no-admin rechazando esperaba 403, obtuvo %d", r.Code)
	}

	// 2. Drive adjunto inválido en rechazo -> 400
	if r := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/rechazar", tarea.ID), adminID, map[string]any{
		"motivo": "Falta música",
		"drive_adjuntos": []map[string]any{
			{"id": "ref_mala", "nombre": "Mal", "url": "http://drive.google.com/open?id=ref_mala", "tipo": "archivo"},
		},
	}); r.Code != http.StatusBadRequest {
		t.Fatalf("drive_adjuntos http esperaba 400, obtuvo %d", r.Code)
	}

	// 3. Rechazo válido con motivo + elementos de Drive (carpeta y archivo)
	rRechazo := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/rechazar", tarea.ID), adminID, map[string]any{
		"motivo": "Ponle más efectos de sonido.",
		"drive_adjuntos": []map[string]any{
			{"id": "sfx_carpeta_1", "nombre": "Librería SFX", "url": "https://drive.google.com/drive/folders/sfx_carpeta_1", "tipo": "carpeta"},
			{"id": "referencia_clip_2", "nombre": "Ejemplo corte.mp4", "url": "https://drive.google.com/open?id=referencia_clip_2", "tipo": "archivo"},
		},
	})
	if rRechazo.Code != http.StatusOK {
		t.Fatalf("rechazar esperaba 200, obtuvo %d: %s", rRechazo.Code, rRechazo.Body.String())
	}
	var rechazada store.Tarea
	_ = json.Unmarshal(rRechazo.Body.Bytes(), &rechazada)
	if rechazada.RechazoActual == nil || rechazada.RechazoActual.HistorialID <= 0 || len(rechazada.RechazoActual.DriveAdjuntos) != 2 {
		t.Fatalf("rechazo_actual inválido: %+v", rechazada.RechazoActual)
	}
	histID := rechazada.RechazoActual.HistorialID

	// 4. Subir audio e imagen al evento de rechazo (reutilizando pipeline F10)
	subirRaw := func(metodo, ruta, who string, body []byte, contentType string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(metodo, ruta, bytes.NewReader(body))
		if who != "" {
			req.Header.Set("X-Demo-User", who)
		}
		if contentType != "" {
			req.Header.Set("Content-Type", contentType)
		}
		rr := httptest.NewRecorder()
		routes.ServeHTTP(rr, req)
		return rr
	}

	audioBytes := []byte("RIFF\x0c\x00\x00\x00WAVEfmt \x00\x00\x00\x00")
	audioID := "11111111-1111-4111-8111-111111111111"

	// Trabajador no puede subir adjunto de rechazo -> 403
	if r := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/adjuntos", tarea.ID), editorID, map[string]any{
		"id": audioID, "nombre": "voz.wav", "tipo": "audio", "tamano": len(audioBytes), "origen": "rechazo", "historial_id": histID,
	}); r.Code != http.StatusForbidden {
		t.Fatalf("trabajador subiendo adjunto de rechazo esperaba 403, obtuvo %d", r.Code)
	}

	// Admin no puede vincular adjunto de rechazo a otra tarea -> 400/409
	if r := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/adjuntos", otraTarea.ID), adminID, map[string]any{
		"id": audioID, "nombre": "voz.wav", "tipo": "audio", "tamano": len(audioBytes), "origen": "rechazo", "historial_id": histID,
	}); r.Code != http.StatusConflict {
		t.Fatalf("otra tarea no rechazada esperaba 409, obtuvo %d: %s", r.Code, r.Body.String())
	}

	// Admin sube audio real del rechazo
	rRes := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/adjuntos", tarea.ID), adminID, map[string]any{
		"id": audioID, "nombre": "indicacion.wav", "tipo": "audio", "tamano": len(audioBytes), "origen": "rechazo", "historial_id": histID,
	})
	if rRes.Code != http.StatusOK {
		t.Fatalf("reservar adjunto rechazo esperaba 200, obtuvo %d: %s", rRes.Code, rRes.Body.String())
	}
	if rPart := subirRaw("PUT", fmt.Sprintf("/api/admin/tareas/%d/adjuntos/%s/partes/0", tarea.ID, audioID), adminID, audioBytes, "application/octet-stream"); rPart.Code != http.StatusNoContent {
		t.Fatalf("parte audio esperaba 204, obtuvo %d", rPart.Code)
	}
	if rFin := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/adjuntos/%s/finalizar", tarea.ID, audioID), adminID, nil); rFin.Code != http.StatusCreated {
		t.Fatalf("finalizar audio esperaba 201, obtuvo %d: %s", rFin.Code, rFin.Body.String())
	}

	// 5. Trabajador asignado ve adjuntos del rechazo en Mis tareas, detalle e historial, y puede firmar/reproducir;
	// los adjuntos de asignación (/adjuntos sin origen) NO se mezclan con los de rechazo.
	rMis := doRequest(routes, "GET", "/api/tareas", editorID, nil)
	if rMis.Code != http.StatusOK || !strings.Contains(rMis.Body.String(), "indicacion.wav") || !strings.Contains(rMis.Body.String(), "Librería SFX") {
		t.Fatalf("Mis tareas debe incluir adjuntos del rechazo: %d %s", rMis.Code, rMis.Body.String())
	}

	rDet := doRequest(routes, "GET", fmt.Sprintf("/api/tareas/%d/detalle", tarea.ID), editorID, nil)
	if rDet.Code != http.StatusOK || !strings.Contains(rDet.Body.String(), "indicacion.wav") {
		t.Fatalf("detalle debe incluir adjuntos en historial: %d %s", rDet.Code, rDet.Body.String())
	}
	if strings.Contains(rDet.Body.String(), "admin@rconcept.com") {
		t.Fatalf("detalle no debe exponer correo del admin al trabajador")
	}

	rAsigAdj := doRequest(routes, "GET", fmt.Sprintf("/api/tareas/%d/adjuntos", tarea.ID), editorID, nil)
	if rAsigAdj.Code != http.StatusOK || strings.Contains(rAsigAdj.Body.String(), "indicacion.wav") {
		t.Fatalf("adjuntos de asignación no deben mezclar los de rechazo: %s", rAsigAdj.Body.String())
	}

	if rFirma := doRequest(routes, "GET", fmt.Sprintf("/api/tareas/%d/adjuntos/%s/firma", tarea.ID, audioID), editorID, nil); rFirma.Code != http.StatusOK {
		t.Fatalf("trabajador asignado firmando adjunto rechazo esperaba 200, obtuvo %d", rFirma.Code)
	}

	// Otro trabajador NO tiene acceso
	if r := doRequest(routes, "GET", fmt.Sprintf("/api/tareas/%d/adjuntos/%s/firma", tarea.ID, audioID), camID, nil); r.Code != http.StatusForbidden {
		t.Fatalf("ajeno firmando adjunto rechazo esperaba 403, obtuvo %d", r.Code)
	}
	if r := doRequest(routes, "GET", fmt.Sprintf("/api/tareas/%d/adjuntos?origen=rechazo", tarea.ID), camID, nil); r.Code != http.StatusForbidden {
		t.Fatalf("ajeno listando adjuntos rechazo esperaba 403, obtuvo %d", r.Code)
	}
}

func TestEntregaDriveMultiplePermisosYHistorial(t *testing.T) {
	ctx := context.Background()
	api, s := configurarTestAPI()
	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID: "admin-1", Correo: "admin@rconcept.com", Nombre: "Admin", Estado: store.EstadoAprobado, EsAdmin: true,
	})
	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID: "ed-1", Correo: "ed@rconcept.com", Nombre: "Editor", Estado: store.EstadoAprobado, EsAdmin: false,
	})
	_ = s.GuardarConexionDrive(ctx, &store.ConexionDrive{
		Correo: "equipo@gmail.com", CarpetaRaizID: "raiz_1", CarpetaClientesID: "raiz_1", RefreshToken: "ref-secreto",
	})
	api.F5.Drive = httpapi.ConfDrive{ClientID: "cid", ClientSecret: "csec", PickerKey: "pk", PickerAppID: "123"}

	var copiasArchivo atomic.Int32
	api.F5.HTTP = &http.Client{Transport: transporteDrivePruebas(func(r *http.Request) (*http.Response, error) {
		send := func(code int, v any) (*http.Response, error) {
			b, _ := json.Marshal(v)
			return &http.Response{StatusCode: code, Body: io.NopCloser(strings.NewReader(string(b))), Header: make(http.Header)}, nil
		}
		if r.URL.Host == "oauth2.googleapis.com" {
			return send(200, map[string]any{"access_token": "tok-team", "expires_in": 3600})
		}
		if strings.Contains(r.URL.Path, "/copy") {
			copiasArchivo.Add(1)
			return send(200, map[string]any{"id": "copia_1", "name": "Clip.mp4", "mimeType": "video/mp4", "webViewLink": "https://drive.google.com/file/d/copia_1/view"})
		}
		switch r.URL.Path {
		case "/drive/v3/files":
			return send(200, map[string]any{"files": []map[string]any{{"id": "entregas_sub", "name": "Entregas"}}})
		case "/drive/v3/files/carp_dentro":
			return send(200, map[string]any{"id": "carp_dentro", "name": "B-roll", "mimeType": "application/vnd.google-apps.folder", "parents": []string{"carpeta_tarea_m"}})
		case "/drive/v3/files/arch_dentro":
			return send(200, map[string]any{"id": "arch_dentro", "name": "Master.mp4", "mimeType": "video/mp4", "parents": []string{"carpeta_tarea_m"}})
		case "/drive/v3/files/arch_picker":
			if r.Header.Get("Authorization") == "Bearer tok-worker-picker" || r.Header.Get("Authorization") == "Bearer tok-team" {
				return send(200, map[string]any{"id": "arch_picker", "name": "Portada.png", "mimeType": "image/png", "parents": []string{"mi_unidad_worker"}})
			}
		case "/drive/v3/files/arch_ajeno":
			if r.Header.Get("Authorization") == "Bearer tok-team" {
				return send(200, map[string]any{"id": "arch_ajeno", "name": "OtroCliente.mp4", "mimeType": "video/mp4", "parents": []string{"otro_cliente"}})
			}
		}
		return send(404, nil)
	})}

	carpetaID := "carpeta_tarea_m"
	carpetaURL := "https://drive.google.com/drive/folders/" + carpetaID
	tarea, err := s.CrearTarea(ctx, &store.Tarea{
		TipoID: 2, Titulo: "Multi entrega", AsignadoA: "ed-1", CreadoPor: "admin-1",
		DriveCarpetaID: &carpetaID, DriveCarpetaURL: &carpetaURL,
	})
	if err != nil {
		t.Fatal(err)
	}
	routes := api.Routes()
	ruta := fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID)

	// 1. Duplicado rechazado (400)
	if r := doRequest(routes, "POST", ruta, "ed-1", map[string]any{
		"metodo_entrega": "drive",
		"entrega_drive": []map[string]any{
			{"id": "carp_dentro", "nombre": "B-roll", "url": "https://drive.google.com/drive/folders/carp_dentro", "tipo": "carpeta"},
			{"id": "carp_dentro", "nombre": "B-roll", "url": "https://drive.google.com/drive/folders/carp_dentro", "tipo": "carpeta"},
		},
	}); r.Code != http.StatusBadRequest {
		t.Fatalf("duplicado esperaba 400, obtuvo %d: %s", r.Code, r.Body.String())
	}

	// 2. Más de 4 elementos rechazado (400)
	var cinco []map[string]any
	for i := range 5 {
		cinco = append(cinco, map[string]any{
			"id": fmt.Sprintf("item_%d", i), "nombre": fmt.Sprintf("Archivo %d", i),
			"url": fmt.Sprintf("https://drive.google.com/open?id=item_%d", i), "tipo": "archivo",
		})
	}
	if r := doRequest(routes, "POST", ruta, "ed-1", map[string]any{
		"metodo_entrega": "drive", "entrega_drive": cinco,
	}); r.Code != http.StatusBadRequest {
		t.Fatalf("5 elementos esperaba 400, obtuvo %d", r.Code)
	}

	// 3. Elemento fuera de carpeta de tarea sin token_selector -> 403
	if r := doRequest(routes, "POST", ruta, "ed-1", map[string]any{
		"metodo_entrega": "drive",
		"entrega_drive": []map[string]any{
			{"id": "arch_ajeno", "nombre": "OtroCliente.mp4", "url": "https://drive.google.com/file/d/arch_ajeno/view", "tipo": "archivo"},
		},
	}); r.Code != http.StatusForbidden {
		t.Fatalf("ajeno sin token_selector esperaba 403, obtuvo %d: %s", r.Code, r.Body.String())
	}

	// 4. Combinación válida de hasta 4 elementos (carpeta + archivo dentro + archivo picker)
	rOK := doRequest(routes, "POST", ruta, "ed-1", map[string]any{
		"metodo_entrega": "drive",
		"token_selector": "tok-worker-picker",
		"nota":           "Tres entregables listos",
		"entrega_drive": []map[string]any{
			{"id": "carp_dentro", "nombre": "B-roll", "url": "https://drive.google.com/drive/folders/carp_dentro", "tipo": "carpeta"},
			{"id": "arch_dentro", "nombre": "Master.mp4", "url": "https://drive.google.com/file/d/arch_dentro/view", "tipo": "archivo"},
			{"id": "arch_picker", "nombre": "Portada.png", "url": "https://drive.google.com/file/d/arch_picker/view", "tipo": "archivo"},
		},
	})
	if rOK.Code != http.StatusOK {
		t.Fatalf("entrega múltiple esperaba 200, obtuvo %d: %s", rOK.Code, rOK.Body.String())
	}
	if strings.Contains(rOK.Body.String(), "tok-worker-picker") {
		t.Fatal("nunca debe devolver token_selector")
	}
	// Solo los 2 archivos (no la carpeta) deben haberse copiado a Entregas
	if copiasArchivo.Load() != 2 {
		t.Fatalf("esperaba 2 copias de archivos a Entregas, obtuvo %d", copiasArchivo.Load())
	}
	var tOut store.Tarea
	_ = json.Unmarshal(rOK.Body.Bytes(), &tOut)
	if len(tOut.EntregaDrive) != 3 {
		t.Fatalf("esperaba 3 elementos en entrega_drive, obtuvo %+v", tOut.EntregaDrive)
	}

	// 5. Revertir conserva entrega_drive en borrador_entrega y en historial
	rRev := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/revertir", tarea.ID), "ed-1", nil)
	if rRev.Code != http.StatusOK {
		t.Fatalf("revertir: %d %s", rRev.Code, rRev.Body.String())
	}
	var tRev store.Tarea
	_ = json.Unmarshal(rRev.Body.Bytes(), &tRev)
	if len(tRev.EntregaDrive) != 0 || tRev.BorradorEntrega == nil || len(tRev.BorradorEntrega.EntregaDrive) != 3 {
		t.Fatalf("borrador debe conservar los 3 elementos al revertir: %+v", tRev.BorradorEntrega)
	}
	rDet := doRequest(routes, "GET", fmt.Sprintf("/api/tareas/%d/detalle", tarea.ID), "ed-1", nil)
	var tDet store.Tarea
	_ = json.Unmarshal(rDet.Body.Bytes(), &tDet)
	if len(tDet.Historial) < 2 || len(tDet.Historial[0].EntregaDrive) != 3 || len(tDet.Historial[1].EntregaDrive) != 3 {
		t.Fatalf("historial debe conservar entrega_drive: %+v", tDet.Historial)
	}
}

func TestWhatsAppPorTrabajoYReasignacion(t *testing.T) {
	routes, s, admin1, editorID, camID, _ := setupF2TestEnvironment(t)
	ctx := context.Background()
	admin2 := "admin-2-reasig"
	if err := s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID: admin2, Correo: "admin2@rconcept.com", Nombre: "Admin Dos", Estado: store.EstadoAprobado, EsAdmin: true,
	}); err != nil {
		t.Fatal(err)
	}
	if err := s.GuardarCelular(ctx, admin1, "+573001112233"); err != nil {
		t.Fatal(err)
	}
	if err := s.GuardarCelular(ctx, editorID, "+573005554433"); err != nil {
		t.Fatal(err)
	}

	tarea := crearTareaF4(t, routes, admin1, editorID, "Video WhatsApp")

	// 1. Editor ve el WhatsApp del asignador inicial (admin1)
	rEd := doRequest(routes, "GET", fmt.Sprintf("/api/tareas/%d/whatsapp", tarea.ID), editorID, nil)
	if rEd.Code != http.StatusOK || !strings.Contains(rEd.Body.String(), "https://wa.me/573001112233") {
		t.Fatalf("editor debía ver WhatsApp de admin1: %d %s", rEd.Code, rEd.Body.String())
	}
	// Otro trabajador no asignado recibe 404
	if rAjeno := doRequest(routes, "GET", fmt.Sprintf("/api/tareas/%d/whatsapp", tarea.ID), camID, nil); rAjeno.Code != http.StatusNotFound {
		t.Fatalf("ajeno esperaba 404, obtuvo %d", rAjeno.Code)
	}

	// 2. Admin2 (SIN celular configurado) reasigna la tarea a camID -> NO debe caer al creador (admin1)!
	if rPatch := doRequest(routes, "PATCH", fmt.Sprintf("/api/admin/tareas/%d", tarea.ID), admin2, map[string]any{
		"asignado_a": camID, "forzar": true,
	}); rPatch.Code != http.StatusOK {
		t.Fatalf("reasignar: %d %s", rPatch.Code, rPatch.Body.String())
	}
	rCamSinTel := doRequest(routes, "GET", fmt.Sprintf("/api/tareas/%d/whatsapp", tarea.ID), camID, nil)
	if rCamSinTel.Code != http.StatusOK {
		t.Fatalf("esperaba 200 sin URL: %d", rCamSinTel.Code)
	}
	var respSin map[string]any
	_ = json.Unmarshal(rCamSinTel.Body.Bytes(), &respSin)
	if respSin["url"] != "" || respSin["disponible"] != false {
		t.Fatalf("tras reasignar sin teléfono del reasignador no debe usar creador: %+v", respSin)
	}

	// 3. Cuando admin2 configura su celular, camID ve el WhatsApp de admin2 (no admin1)
	if err := s.GuardarCelular(ctx, admin2, "+573009998877"); err != nil {
		t.Fatal(err)
	}
	rCamConTel := doRequest(routes, "GET", fmt.Sprintf("/api/tareas/%d/whatsapp", tarea.ID), camID, nil)
	if !strings.Contains(rCamConTel.Body.String(), "https://wa.me/573009998877") || !strings.Contains(rCamConTel.Body.String(), "Admin Dos") {
		t.Fatalf("camID debía ver WhatsApp de Admin Dos: %s", rCamConTel.Body.String())
	}

	// 4. Reasignar de vuelta a editorID y entregar por WhatsApp -> admin ve WhatsApp del editor
	_ = doRequest(routes, "PATCH", fmt.Sprintf("/api/admin/tareas/%d", tarea.ID), admin2, map[string]any{
		"asignado_a": editorID, "forzar": true,
	})
	// Solo consultar WhatsApp no marca como entregada la tarea
	if tCheck, _ := s.ObtenerTareaPorID(ctx, tarea.ID); tCheck.Estado != store.EstadoTareaPendiente {
		t.Fatalf("consultar WhatsApp no debe cambiar estado: %s", tCheck.Estado)
	}
	_ = doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), editorID, map[string]any{
		"metodo_entrega": "whatsapp",
	})
	rRev := doRequest(routes, "GET", fmt.Sprintf("/api/tareas/%d/whatsapp", tarea.ID), admin1, nil)
	if rRev.Code != http.StatusOK || !strings.Contains(rRev.Body.String(), "https://wa.me/573005554433") {
		t.Fatalf("revisor debía ver WhatsApp de quien entregó: %d %s", rRev.Code, rRev.Body.String())
	}
}
