package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"rconceptsys/backend/internal/store"
)

// Helper para hacer peticiones autenticadas
func doRequest(routes http.Handler, metodo, ruta, userID string, body any) *httptest.ResponseRecorder {
	var bodyReader *bytes.Buffer
	if body != nil {
		switch v := body.(type) {
		case string:
			bodyReader = bytes.NewBufferString(v)
		default:
			b, _ := json.Marshal(v)
			bodyReader = bytes.NewBuffer(b)
		}
	} else {
		bodyReader = bytes.NewBuffer(nil)
	}

	req := httptest.NewRequest(metodo, ruta, bodyReader)
	req.Header.Set("Content-Type", "application/json")
	if userID != "" {
		req.Header.Set("X-Demo-User", userID)
	}

	rr := httptest.NewRecorder()
	routes.ServeHTTP(rr, req)
	return rr
}

func setupF2TestEnvironment(t *testing.T) (http.Handler, *store.MemoryStore, string, string, string, string) {
	api, s := configurarTestAPI()
	routes := api.Routes()
	ctx := context.Background()

	// 1. Admin (Samuel / Juan)
	adminID := "admin-samuel-id"
	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID:      adminID,
		Correo:  "juan@rconcept.com",
		Nombre:  "Samuel Admin",
		Estado:  store.EstadoAprobado,
		EsAdmin: true,
	})

	// 2. Editor aprobado con rol editor (ID 2)
	editorID := "editor-id"
	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID:      editorID,
		Correo:  "editor@rconcept.com",
		Nombre:  "Eduardo Editor",
		Estado:  store.EstadoAprobado,
		EsAdmin: false,
	})
	_, _ = s.AsignarRolesMiembro(ctx, editorID, []int{2}) // 2 = editor

	// 3. Camarógrafo aprobado con rol camarógrafo (ID 1)
	camID := "cam-id"
	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID:      camID,
		Correo:  "cam@rconcept.com",
		Nombre:  "Carlos Cámara",
		Estado:  store.EstadoAprobado,
		EsAdmin: false,
	})
	_, _ = s.AsignarRolesMiembro(ctx, camID, []int{1}) // 1 = camarografo

	// 4. Miembro suspendido
	suspID := "susp-id"
	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID:      suspID,
		Correo:  "susp@rconcept.com",
		Nombre:  "Simón Suspendido",
		Estado:  store.EstadoSuspendido,
		EsAdmin: false,
	})

	return routes, s, adminID, editorID, camID, suspID
}

// 1. Test ciclo completo: crear -> hecha -> aceptada -> factura con línea y total
func TestF2CicloCompletoTareaYFactura(t *testing.T) {
	routes, s, adminID, editorID, _, _ := setupF2TestEnvironment(t)

	// Admin actualiza el precio del trabajo edicion_video (ID 2) a 75.000 COP
	patchTrabajo := doRequest(routes, "PATCH", "/api/admin/trabajos/2", adminID, map[string]any{
		"precio": 75000,
	})
	if patchTrabajo.Code != http.StatusOK {
		t.Fatalf("Esperado 200 en patch trabajo, obtenido %d: %s", patchTrabajo.Code, patchTrabajo.Body.String())
	}

	// Admin crea tarea para el editor
	postTarea := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"tipo_id":     2,
		"asignado_a":  editorID,
		"titulo":      "Editar video para TikTok",
		"descripcion": "Cortes dinámicos y subtítulos",
	})
	if postTarea.Code != http.StatusCreated {
		t.Fatalf("Esperado 201 al crear tarea, obtenido %d: %s", postTarea.Code, postTarea.Body.String())
	}

	var creada store.Tarea
	_ = json.Unmarshal(postTarea.Body.Bytes(), &creada)
	if creada.ID == 0 || creada.Estado != store.EstadoTareaPendiente {
		t.Fatalf("Tarea creada inválida: %+v", creada)
	}

	// Editor consulta sus tareas
	getMisTareas := doRequest(routes, "GET", "/api/tareas", editorID, nil)
	if getMisTareas.Code != http.StatusOK {
		t.Fatalf("Esperado 200 al listar mis tareas, obtenido %d: %s", getMisTareas.Code, getMisTareas.Body.String())
	}
	var misTareas []*store.Tarea
	_ = json.Unmarshal(getMisTareas.Body.Bytes(), &misTareas)
	if len(misTareas) != 1 || misTareas[0].ID != creada.ID {
		t.Fatalf("Mis tareas no contiene la tarea creada: %+v", misTareas)
	}

	// Editor la marca como hecha con nota
	nota := "Listo, subido al Drive"
	postHecha := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", creada.ID), editorID, map[string]any{
		"nota": nota,
	})
	if postHecha.Code != http.StatusOK {
		t.Fatalf("Esperado 200 al marcar hecha, obtenido %d: %s", postHecha.Code, postHecha.Body.String())
	}
	var hecha store.Tarea
	_ = json.Unmarshal(postHecha.Body.Bytes(), &hecha)
	if hecha.Estado != store.EstadoTareaHecha || hecha.NotaPersona == nil || *hecha.NotaPersona != nota {
		t.Fatalf("Estado tras marcar hecha no es 'hecha': %+v", hecha)
	}

	// Admin revisa bandeja de tareas por revisar
	getAdminTareas := doRequest(routes, "GET", "/api/admin/tareas?estado=hecha", adminID, nil)
	if getAdminTareas.Code != http.StatusOK {
		t.Fatalf("Esperado 200 en get admin tareas, obtenido %d: %s", getAdminTareas.Code, getAdminTareas.Body.String())
	}
	var resAdminTareas struct {
		Tareas     []*store.Tarea `json:"tareas"`
		PorRevisar int            `json:"por_revisar"`
	}
	_ = json.Unmarshal(getAdminTareas.Body.Bytes(), &resAdminTareas)
	if resAdminTareas.PorRevisar != 1 || len(resAdminTareas.Tareas) != 1 {
		t.Fatalf("Bandeja por revisar incorrecta: %+v", resAdminTareas)
	}

	// Admin acepta la tarea
	postAceptar := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/aceptar", creada.ID), adminID, nil)
	if postAceptar.Code != http.StatusOK {
		t.Fatalf("Esperado 200 al aceptar tarea, obtenido %d: %s", postAceptar.Code, postAceptar.Body.String())
	}
	var aceptada store.Tarea
	_ = json.Unmarshal(postAceptar.Body.Bytes(), &aceptada)
	if aceptada.Estado != store.EstadoTareaAceptada {
		t.Fatalf("Estado no es aceptada: %s", aceptada.Estado)
	}
	if aceptada.PrecioCongelado == nil || *aceptada.PrecioCongelado != 75000 {
		t.Fatalf("Precio congelado incorrecto: %v", aceptada.PrecioCongelado)
	}
	if aceptada.FacturaID == nil || *aceptada.FacturaID == 0 {
		t.Fatalf("FacturaID no asignado: %v", aceptada.FacturaID)
	}

	// Editor revisa su factura propia
	getMiFactura := doRequest(routes, "GET", "/api/facturas/mia", editorID, nil)
	if getMiFactura.Code != http.StatusOK {
		t.Fatalf("Esperado 200 en factura mia, obtenido %d: %s", getMiFactura.Code, getMiFactura.Body.String())
	}
	var resMiFactura struct {
		Abierta        *store.Factura `json:"abierta"`
		TotalPendiente int            `json:"total_pendiente"`
	}
	_ = json.Unmarshal(getMiFactura.Body.Bytes(), &resMiFactura)
	if resMiFactura.Abierta == nil {
		t.Fatalf("No hay factura abierta para el editor")
	}
	if resMiFactura.TotalPendiente != 75000 || resMiFactura.Abierta.Total != 75000 {
		t.Fatalf("Total de la factura incorrecto: esperado 75000, obtenido pendiente %d, factura %d", resMiFactura.TotalPendiente, resMiFactura.Abierta.Total)
	}
	if len(resMiFactura.Abierta.Lineas) != 1 || resMiFactura.Abierta.Lineas[0].ID != creada.ID {
		t.Fatalf("Líneas de la factura incorrectas: %+v", resMiFactura.Abierta.Lineas)
	}

	_ = s
}

// 2. Test Rechazo y re-envío
func TestF2RechazoYReenvio(t *testing.T) {
	routes, _, adminID, editorID, _, _ := setupF2TestEnvironment(t)

	// Admin crea tarea
	resCrear := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"tipo_id":    2,
		"asignado_a": editorID,
		"titulo":     "Reel con audio desfasado",
	})
	var t1 store.Tarea
	_ = json.Unmarshal(resCrear.Body.Bytes(), &t1)

	// Editor la marca hecha
	_ = doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", t1.ID), editorID, nil)

	// Admin rechaza sin motivo -> debe dar 400
	resRechazoSinMotivo := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/rechazar", t1.ID), adminID, map[string]any{
		"motivo": "   ",
	})
	if resRechazoSinMotivo.Code != http.StatusBadRequest {
		t.Fatalf("Esperado 400 sin motivo de rechazo, obtenido %d", resRechazoSinMotivo.Code)
	}

	// Admin rechaza con motivo
	motivo := "El audio del segundo 10 al 15 no está sincronizado"
	resRechazo := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/rechazar", t1.ID), adminID, map[string]any{
		"motivo": motivo,
	})
	if resRechazo.Code != http.StatusOK {
		t.Fatalf("Esperado 200 en rechazo, obtenido %d", resRechazo.Code)
	}
	var rechazada store.Tarea
	_ = json.Unmarshal(resRechazo.Body.Bytes(), &rechazada)
	if rechazada.Estado != store.EstadoTareaRechazada || rechazada.MotivoRechazo == nil || *rechazada.MotivoRechazo != motivo {
		t.Fatalf("Estado o motivo de rechazo incorrecto: %+v", rechazada)
	}

	// Editor la vuelve a marcar hecha (con nueva nota)
	nuevaNota := "Audio resincronizado en CapCut"
	resReenvio := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", t1.ID), editorID, map[string]any{
		"nota": nuevaNota,
	})
	if resReenvio.Code != http.StatusOK {
		t.Fatalf("Esperado 200 en reenvío, obtenido %d", resReenvio.Code)
	}
	var reenviada store.Tarea
	_ = json.Unmarshal(resReenvio.Body.Bytes(), &reenviada)
	if reenviada.Estado != store.EstadoTareaHecha {
		t.Fatalf("Estado tras reenvío no es hecha: %s", reenviada.Estado)
	}

	// Admin la acepta
	resAceptar := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/aceptar", t1.ID), adminID, nil)
	if resAceptar.Code != http.StatusOK {
		t.Fatalf("Esperado 200 al aceptar tras rechazo, obtenido %d", resAceptar.Code)
	}
}

// 3. Test Precio congelado: cambiar el precio del trabajo después NO altera tareas ya aceptadas
func TestF2PrecioCongeladoInmutable(t *testing.T) {
	routes, _, adminID, editorID, _, _ := setupF2TestEnvironment(t)

	// Precio inicial: 50.000
	_ = doRequest(routes, "PATCH", "/api/admin/trabajos/2", adminID, map[string]any{"precio": 50000})

	// Crear tarea, marcar hecha y aceptar
	resCrear := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"tipo_id":    2,
		"asignado_a": editorID,
		"titulo":     "Tarea con precio congelado",
	})
	var t1 store.Tarea
	_ = json.Unmarshal(resCrear.Body.Bytes(), &t1)

	_ = doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", t1.ID), editorID, nil)
	resAceptar := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/aceptar", t1.ID), adminID, nil)
	if resAceptar.Code != http.StatusOK {
		t.Fatalf("Error al aceptar: %d", resAceptar.Code)
	}

	// Cambiar precio a 120.000
	_ = doRequest(routes, "PATCH", "/api/admin/trabajos/2", adminID, map[string]any{"precio": 120000})

	// Verificar factura del editor: DEBE seguir en 50.000
	resFactura := doRequest(routes, "GET", "/api/facturas/mia", editorID, nil)
	var miFact struct {
		Abierta *store.Factura `json:"abierta"`
	}
	_ = json.Unmarshal(resFactura.Body.Bytes(), &miFact)
	if miFact.Abierta == nil || miFact.Abierta.Total != 50000 {
		t.Fatalf("El total de la factura cambió indebidamente tras editar el tipo de trabajo: %+v", miFact.Abierta)
	}
	if *miFact.Abierta.Lineas[0].PrecioCongelado != 50000 {
		t.Fatalf("El precio congelado de la línea cambió: %d", *miFact.Abierta.Lineas[0].PrecioCongelado)
	}
}

// 4. Test Una sola factura abierta por persona, pagar y que la siguiente aceptada abra otra
func TestF2PagarFacturaYAbrirNueva(t *testing.T) {
	routes, _, adminID, editorID, _, _ := setupF2TestEnvironment(t)

	_ = doRequest(routes, "PATCH", "/api/admin/trabajos/2", adminID, map[string]any{"precio": 40000})

	// Tarea 1 -> aceptada
	res1 := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"tipo_id": 2, "asignado_a": editorID, "titulo": "Tarea Primera Factura",
	})
	var t1 store.Tarea
	_ = json.Unmarshal(res1.Body.Bytes(), &t1)
	_ = doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", t1.ID), editorID, nil)
	resAcep1 := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/aceptar", t1.ID), adminID, nil)
	var aceptada1 store.Tarea
	_ = json.Unmarshal(resAcep1.Body.Bytes(), &aceptada1)
	factura1ID := *aceptada1.FacturaID

	// Admin marca pagada la factura 1
	resPagar := doRequest(routes, "POST", fmt.Sprintf("/api/admin/facturas/%d/pagar", factura1ID), adminID, nil)
	if resPagar.Code != http.StatusOK {
		t.Fatalf("Esperado 200 al pagar factura, obtenido %d", resPagar.Code)
	}

	// Pagar de nuevo la misma factura da 400 (ya está pagada)
	resPagarOtraVez := doRequest(routes, "POST", fmt.Sprintf("/api/admin/facturas/%d/pagar", factura1ID), adminID, nil)
	if resPagarOtraVez.Code != http.StatusBadRequest {
		t.Fatalf("Esperado 400 al pagar factura ya pagada, obtenido %d", resPagarOtraVez.Code)
	}

	// Tarea 2 para el mismo editor -> aceptada
	res2 := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"tipo_id": 2, "asignado_a": editorID, "titulo": "Tarea Segunda Factura",
	})
	var t2 store.Tarea
	_ = json.Unmarshal(res2.Body.Bytes(), &t2)
	_ = doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", t2.ID), editorID, nil)
	resAcep2 := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/aceptar", t2.ID), adminID, nil)
	var aceptada2 store.Tarea
	_ = json.Unmarshal(resAcep2.Body.Bytes(), &aceptada2)
	factura2ID := *aceptada2.FacturaID

	if factura2ID == factura1ID {
		t.Fatalf("La nueva tarea aceptada se agregó a la factura pagada en vez de abrir una nueva")
	}

	// El editor consulta /api/facturas/mia: debe ver abierta la factura 2 y en pagadas la factura 1
	resMia := doRequest(routes, "GET", "/api/facturas/mia", editorID, nil)
	var estadoMia struct {
		Abierta        *store.Factura   `json:"abierta"`
		TotalPendiente int              `json:"total_pendiente"`
		Pagadas        []*store.Factura `json:"pagadas"`
		TotalPagado    int              `json:"total_pagado"`
	}
	_ = json.Unmarshal(resMia.Body.Bytes(), &estadoMia)
	if estadoMia.Abierta == nil || estadoMia.Abierta.ID != factura2ID {
		t.Fatalf("Factura abierta incorrecta: %+v", estadoMia.Abierta)
	}
	if len(estadoMia.Pagadas) != 1 || estadoMia.Pagadas[0].ID != factura1ID {
		t.Fatalf("Historial de facturas pagadas incorrecto: %+v", estadoMia.Pagadas)
	}
	if estadoMia.TotalPagado != 40000 || estadoMia.TotalPendiente != 40000 {
		t.Fatalf("Totales incorrectos: pagado %d, pendiente %d", estadoMia.TotalPagado, estadoMia.TotalPendiente)
	}
}

// 5. Test Permisos y privacidad estricta: ajenos no ven nada, suspendido 403, no admin 403
func TestF2PermisosYPrivacidad(t *testing.T) {
	routes, _, adminID, editorID, camID, suspID := setupF2TestEnvironment(t)

	// Admin crea tarea para el editor
	resCrear := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"tipo_id": 2, "asignado_a": editorID, "titulo": "Tarea Secreta Editor",
	})
	var t1 store.Tarea
	_ = json.Unmarshal(resCrear.Body.Bytes(), &t1)

	// 1. Camarógrafo NO ve la tarea del editor en /api/tareas
	resCamTareas := doRequest(routes, "GET", "/api/tareas", camID, nil)
	var camTareas []*store.Tarea
	_ = json.Unmarshal(resCamTareas.Body.Bytes(), &camTareas)
	if len(camTareas) != 0 {
		t.Fatalf("Camarógrafo vio tareas de otro miembro: %+v", camTareas)
	}

	// 2. Camarógrafo intenta marcar hecha la tarea del editor -> 404 (ocultamiento seguro)
	resMarcarAjeno := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", t1.ID), camID, nil)
	if resMarcarAjeno.Code != http.StatusNotFound {
		t.Fatalf("Esperado 404 al intentar marcar tarea ajena, obtenido %d", resMarcarAjeno.Code)
	}

	// 3. Suspendido intenta entrar -> 403 cuenta_suspendida
	resSusp := doRequest(routes, "GET", "/api/tareas", suspID, nil)
	if resSusp.Code != http.StatusForbidden {
		t.Fatalf("Esperado 403 para suspendido, obtenido %d", resSusp.Code)
	}

	// 4. Editor (no admin) intenta acceder a rutas de administración -> 403
	rutasAdmin := []struct {
		metodo string
		ruta   string
	}{
		{"GET", "/api/admin/trabajos"},
		{"POST", "/api/admin/trabajos"},
		{"PATCH", "/api/admin/trabajos/1"},
		{"GET", "/api/admin/tareas"},
		{"POST", "/api/admin/tareas"},
		{"POST", fmt.Sprintf("/api/admin/tareas/%d/aceptar", t1.ID)},
		{"POST", fmt.Sprintf("/api/admin/tareas/%d/rechazar", t1.ID)},
		{"POST", fmt.Sprintf("/api/admin/tareas/%d/cancelar", t1.ID)},
		{"GET", "/api/admin/facturas"},
		{"GET", "/api/admin/facturas/1"},
		{"POST", "/api/admin/facturas/1/pagar"},
	}

	for _, ra := range rutasAdmin {
		res := doRequest(routes, ra.metodo, ra.ruta, editorID, map[string]any{})
		if res.Code != http.StatusForbidden {
			t.Fatalf("Ruta admin %s %s accesible por no-admin con código %d", ra.metodo, ra.ruta, res.Code)
		}
	}
}

// 6. Test Validación de roles y bandera forzar
func TestF2ValidacionRolesYForzar(t *testing.T) {
	routes, _, adminID, editorID, camID, _ := setupF2TestEnvironment(t)

	// Intento de asignar trabajo de edición (rol_id 2) al camarógrafo (solo tiene rol_id 1)
	resSinForzar := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"tipo_id":    2,
		"asignado_a": camID,
		"titulo":     "Asignar edición a camarógrafo",
		"forzar":     false,
	})
	if resSinForzar.Code != http.StatusUnprocessableEntity {
		t.Fatalf("Esperado 422 al asignar sin forzar a persona sin el rol, obtenido %d: %s", resSinForzar.Code, resSinForzar.Body.String())
	}

	// Mismo intento con forzar: true -> debe responder 201 Created
	resConForzar := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"tipo_id":    2,
		"asignado_a": camID,
		"titulo":     "Asignar edición forzada",
		"forzar":     true,
	})
	if resConForzar.Code != http.StatusCreated {
		t.Fatalf("Esperado 201 al forzar asignación, obtenido %d: %s", resConForzar.Code, resConForzar.Body.String())
	}

	// Asignar al editor (que sí tiene el rol 2) sin forzar -> 201
	resEditor := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"tipo_id":    2,
		"asignado_a": editorID,
		"titulo":     "Edición para editor",
		"forzar":     false,
	})
	if resEditor.Code != http.StatusCreated {
		t.Fatalf("Esperado 201 al asignar a persona con el rol, obtenido %d", resEditor.Code)
	}
}

// 7. Test Concurrencia: aceptar dos veces en paralelo (goroutines) da exactamente una sola línea
func TestF2AceptarConcurrenteGoroutines(t *testing.T) {
	routes, _, adminID, editorID, _, _ := setupF2TestEnvironment(t)

	_ = doRequest(routes, "PATCH", "/api/admin/trabajos/2", adminID, map[string]any{"precio": 30000})

	// Crear tarea y marcarla hecha
	resCrear := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"tipo_id": 2, "asignado_a": editorID, "titulo": "Tarea Concurrencia",
	})
	var t1 store.Tarea
	_ = json.Unmarshal(resCrear.Body.Bytes(), &t1)
	_ = doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", t1.ID), editorID, nil)

	// Dos llamadas simultáneas a Aceptar
	var wg sync.WaitGroup
	codigos := make([]int, 2)
	wg.Add(2)
	for i := 0; i < 2; i++ {
		idx := i
		go func() {
			defer wg.Done()
			r := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/aceptar", t1.ID), adminID, nil)
			codigos[idx] = r.Code
		}()
	}
	wg.Wait()

	// Una de las dos peticiones debe haber tenido éxito (200), la otra debe haber sido rechazada (400 porque ya no está hecha)
	exitos := 0
	for _, c := range codigos {
		if c == http.StatusOK {
			exitos++
		}
	}
	if exitos != 1 {
		t.Fatalf("Esperado exactamente 1 éxito en aceptar concurrente, obtenidos: %v", codigos)
	}

	// Verificar la factura del editor: solo debe existir 1 línea
	resFactura := doRequest(routes, "GET", "/api/facturas/mia", editorID, nil)
	var miFact struct {
		Abierta *store.Factura `json:"abierta"`
	}
	_ = json.Unmarshal(resFactura.Body.Bytes(), &miFact)
	if miFact.Abierta == nil || len(miFact.Abierta.Lineas) != 1 || miFact.Abierta.Total != 30000 {
		t.Fatalf("Factura tiene líneas duplicadas o total incorrecto: %+v", miFact.Abierta)
	}
}

// 8. Test Cancelar tarea
func TestF2CancelarTarea(t *testing.T) {
	routes, _, adminID, editorID, _, _ := setupF2TestEnvironment(t)

	resCrear := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"tipo_id": 2, "asignado_a": editorID, "titulo": "Tarea que se cancelará",
	})
	var t1 store.Tarea
	_ = json.Unmarshal(resCrear.Body.Bytes(), &t1)

	// Admin cancela tarea pendiente
	resCanc := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/cancelar", t1.ID), adminID, nil)
	if resCanc.Code != http.StatusOK {
		t.Fatalf("Esperado 200 al cancelar tarea, obtenido %d", resCanc.Code)
	}
	var cancelada store.Tarea
	_ = json.Unmarshal(resCanc.Body.Bytes(), &cancelada)
	if cancelada.Estado != store.EstadoTareaCancelada {
		t.Fatalf("Estado no es cancelada: %s", cancelada.Estado)
	}

	// Editor intenta marcarla hecha -> debe dar 400
	resHecha := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", t1.ID), editorID, nil)
	if resHecha.Code != http.StatusBadRequest {
		t.Fatalf("Esperado 400 al marcar hecha una cancelada, obtenido %d", resHecha.Code)
	}
}

// Los administradores no hacen trabajos: no se les puede asignar tareas ni aparecen en las facturas.
func TestF2AdminsNoSonTrabajadores(t *testing.T) {
	routes, _, adminID, _, _, _ := setupF2TestEnvironment(t)

	post := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"tipo_id":    2,
		"asignado_a": adminID,
		"titulo":     "Editar algo",
		"forzar":     true,
	})
	if post.Code != http.StatusBadRequest {
		t.Fatalf("Esperado 400 al asignar a un admin, obtenido %d: %s", post.Code, post.Body.String())
	}

	resumen := doRequest(routes, "GET", "/api/admin/facturas", adminID, nil)
	if resumen.Code != http.StatusOK {
		t.Fatalf("Esperado 200 en facturas, obtenido %d", resumen.Code)
	}
	var filas []struct {
		PerfilID string `json:"perfil_id"`
	}
	_ = json.Unmarshal(resumen.Body.Bytes(), &filas)
	for _, f := range filas {
		if f.PerfilID == adminID {
			t.Fatalf("El admin no debe aparecer en el resumen de facturas")
		}
	}
}
