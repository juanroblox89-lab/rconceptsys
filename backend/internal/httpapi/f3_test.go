package httpapi_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"rconceptsys/backend/internal/store"
)

func setupF3TestEnvironment(t *testing.T) (http.Handler, *store.MemoryStore, string, string, string) {
	routes, s, adminID, editorID, camID, _ := setupF2TestEnvironment(t)

	// Ajustar precios y unidades base para F3
	// Tipo 1: grabacion_video -> por minuto, 1.500 COP
	doRequest(routes, "PATCH", "/api/admin/trabajos/1", adminID, map[string]any{
		"precio": 1500,
		"unidad": "minuto",
	})

	// Tipo 2: edicion_video -> por trabajo, 50.000 COP
	doRequest(routes, "PATCH", "/api/admin/trabajos/2", adminID, map[string]any{
		"precio": 50000,
		"unidad": "trabajo",
	})

	return routes, s, adminID, editorID, camID
}

// 1. Test ciclo de cobro por minuto: precio × minutos, validaciones y congelación
func TestF3CobroPorMinuto(t *testing.T) {
	routes, _, adminID, _, camID := setupF3TestEnvironment(t)

	// Crear tarea de grabación (por minuto)
	crearRes := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"tipo_id":   1, // grabacion_video
		"asignado_a": camID,
		"titulo":    "Grabación comercial restaurante",
	})
	if crearRes.Code != http.StatusCreated {
		t.Fatalf("Error al crear tarea: %d %s", crearRes.Code, crearRes.Body.String())
	}
	var tarea store.Tarea
	_ = json.Unmarshal(crearRes.Body.Bytes(), &tarea)

	// Marcar hecha SIN minutos -> debe fallar (400)
	sinMinutos := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), camID, map[string]any{
		"nota": "Terminado",
	})
	if sinMinutos.Code != http.StatusBadRequest {
		t.Fatalf("Esperaba 400 por falta de minutos, obtuve %d", sinMinutos.Code)
	}

	// Marcar hecha con minutos fuera de rango (0 o 1500) -> 400
	minutos0 := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), camID, map[string]any{
		"cantidad": 0,
	})
	if minutos0.Code != http.StatusBadRequest {
		t.Fatalf("Esperaba 400 por minutos=0, obtuve %d", minutos0.Code)
	}
	minutos1500 := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), camID, map[string]any{
		"cantidad": 1500,
	})
	if minutos1500.Code != http.StatusBadRequest {
		t.Fatalf("Esperaba 400 por minutos=1500, obtuve %d", minutos1500.Code)
	}

	// Marcar hecha con 120 minutos -> 200 OK
	okMinutos := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), camID, map[string]any{
		"cantidad": 120,
		"nota":     "2 horas exactas de grabación",
	})
	if okMinutos.Code != http.StatusOK {
		t.Fatalf("Error al marcar hecha con 120 minutos: %d %s", okMinutos.Code, okMinutos.Body.String())
	}

	// Admin acepta sin indicar corrección -> toma los 120 minutos
	aceptarRes := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/aceptar", tarea.ID), adminID, nil)
	if aceptarRes.Code != http.StatusOK {
		t.Fatalf("Error al aceptar tarea: %d %s", aceptarRes.Code, aceptarRes.Body.String())
	}
	var aceptada store.Tarea
	_ = json.Unmarshal(aceptarRes.Body.Bytes(), &aceptada)

	if aceptada.CantidadAceptada == nil || *aceptada.CantidadAceptada != 120 {
		t.Fatalf("Cantidad aceptada incorrecta: %v", aceptada.CantidadAceptada)
	}
	if aceptada.PrecioUnitarioCongelado == nil || *aceptada.PrecioUnitarioCongelado != 1500 {
		t.Fatalf("Precio unitario incorrecto: %v", aceptada.PrecioUnitarioCongelado)
	}
	// 120 min × 1.500 COP = 180.000 COP
	if aceptada.PrecioCongelado == nil || *aceptada.PrecioCongelado != 180000 {
		t.Fatalf("Precio total congelado incorrecto: %v (esperaba 180000)", aceptada.PrecioCongelado)
	}

	// Verificar factura del camarógrafo
	factRes := doRequest(routes, "GET", "/api/facturas/mia", camID, nil)
	if factRes.Code != http.StatusOK {
		t.Fatalf("Error al obtener factura: %d", factRes.Code)
	}
	var miFact struct {
		Abierta *store.Factura `json:"abierta"`
	}
	_ = json.Unmarshal(factRes.Body.Bytes(), &miFact)
	if miFact.Abierta == nil || miFact.Abierta.Total != 180000 {
		t.Fatalf("Total de la factura abierta incorrecto: %v", miFact.Abierta)
	}
}

// 2. Test corrección de minutos por el admin al aceptar
func TestF3CorreccionMinutosAdmin(t *testing.T) {
	routes, _, adminID, _, camID := setupF3TestEnvironment(t)

	// Crear tarea y marcar hecha con 100 minutos
	crearRes := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"tipo_id":   1,
		"asignado_a": camID,
		"titulo":    "Grabación entrevista",
	})
	var tarea store.Tarea
	_ = json.Unmarshal(crearRes.Body.Bytes(), &tarea)

	doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), camID, map[string]any{
		"cantidad": 100,
	})

	// Admin intenta corregir con minutos inválidos -> 400
	badAceptar := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/aceptar", tarea.ID), adminID, map[string]any{
		"cantidad": 2000,
	})
	if badAceptar.Code != http.StatusBadRequest {
		t.Fatalf("Esperaba 400 por corrección fuera de rango, obtuve %d", badAceptar.Code)
	}

	// Admin corrige a 90 minutos -> 1500 * 90 = 135.000 COP
	okAceptar := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/aceptar", tarea.ID), adminID, map[string]any{
		"cantidad": 90,
	})
	if okAceptar.Code != http.StatusOK {
		t.Fatalf("Error al aceptar con corrección: %d", okAceptar.Code)
	}
	var aceptada store.Tarea
	_ = json.Unmarshal(okAceptar.Body.Bytes(), &aceptada)

	if aceptada.CantidadAceptada == nil || *aceptada.CantidadAceptada != 90 {
		t.Fatalf("Cantidad aceptada no se actualizó con la corrección: %v", aceptada.CantidadAceptada)
	}
	if aceptada.PrecioCongelado == nil || *aceptada.PrecioCongelado != 135000 {
		t.Fatalf("Total congelado incorrecto tras corrección: %v", aceptada.PrecioCongelado)
	}
}

// 3. Test tipo por trabajo ignora cantidad
func TestF3TipoPorTrabajoIgnoraCantidad(t *testing.T) {
	routes, _, adminID, editorID, _ := setupF3TestEnvironment(t)

	crearRes := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"tipo_id":   2, // edicion_video (por trabajo, 50.000)
		"asignado_a": editorID,
		"titulo":    "Editar video reels",
	})
	var tarea store.Tarea
	_ = json.Unmarshal(crearRes.Body.Bytes(), &tarea)

	// El editor manda cantidad: 60 en una tarea por trabajo
	hechaRes := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), editorID, map[string]any{
		"cantidad": 60,
		"nota":     "Listo",
	})
	if hechaRes.Code != http.StatusOK {
		t.Fatalf("Error al marcar hecha: %d", hechaRes.Code)
	}
	var hecha store.Tarea
	_ = json.Unmarshal(hechaRes.Body.Bytes(), &hecha)
	if hecha.Cantidad != nil {
		t.Fatalf("La cantidad reportada en tipo por trabajo debió ser nil, es: %v", hecha.Cantidad)
	}

	// Admin acepta intentando pasar cantidad: 10 -> se fija cantidad_aceptada: 1
	aceptarRes := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/aceptar", tarea.ID), adminID, map[string]any{
		"cantidad": 10,
	})
	if aceptarRes.Code != http.StatusOK {
		t.Fatalf("Error al aceptar: %d", aceptarRes.Code)
	}
	var aceptada store.Tarea
	_ = json.Unmarshal(aceptarRes.Body.Bytes(), &aceptada)

	if aceptada.CantidadAceptada == nil || *aceptada.CantidadAceptada != 1 {
		t.Fatalf("Cantidad aceptada en tipo por trabajo debe ser 1: %v", aceptada.CantidadAceptada)
	}
	if aceptada.PrecioCongelado == nil || *aceptada.PrecioCongelado != 50000 {
		t.Fatalf("Precio congelado debe ser el precio unitario (50000): %v", aceptada.PrecioCongelado)
	}
}

// 4. Test inmutabilidad tras cambio de precio vigente
func TestF3PrecioCongeladoInmutable(t *testing.T) {
	routes, _, adminID, _, camID := setupF3TestEnvironment(t)

	crearRes := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"tipo_id":   1, // grabacion 1500
		"asignado_a": camID,
		"titulo":    "Grabación institucional",
	})
	var tarea store.Tarea
	_ = json.Unmarshal(crearRes.Body.Bytes(), &tarea)

	doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tarea.ID), camID, map[string]any{
		"cantidad": 100,
	})
	doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/aceptar", tarea.ID), adminID, nil)

	// Admin cambia el precio de grabación a 3.000 COP y cambia la unidad a trabajo
	doRequest(routes, "PATCH", "/api/admin/trabajos/1", adminID, map[string]any{
		"precio": 3000,
		"unidad": "trabajo",
	})

	// Consultar factura: debe seguir congelada en 1500 * 100 = 150.000 COP
	factRes := doRequest(routes, "GET", "/api/facturas/mia", camID, nil)
	var miFact struct {
		Abierta *store.Factura `json:"abierta"`
	}
	_ = json.Unmarshal(factRes.Body.Bytes(), &miFact)

	if miFact.Abierta == nil || len(miFact.Abierta.Lineas) == 0 {
		t.Fatalf("No se encontraron líneas en la factura abierta")
	}
	linea := miFact.Abierta.Lineas[0]
	if linea.PrecioUnitarioCongelado == nil || *linea.PrecioUnitarioCongelado != 1500 {
		t.Fatalf("Precio unitario congelado cambió: %v", linea.PrecioUnitarioCongelado)
	}
	if linea.CantidadAceptada == nil || *linea.CantidadAceptada != 100 {
		t.Fatalf("Cantidad aceptada cambió: %v", linea.CantidadAceptada)
	}
	if linea.PrecioCongelado == nil || *linea.PrecioCongelado != 150000 {
		t.Fatalf("Total congelado cambió: %v", linea.PrecioCongelado)
	}
}

// 5. Test CRUD Clientes y validaciones
func TestF3ClientesCRUDYValidaciones(t *testing.T) {
	routes, _, adminID, editorID, _ := setupF3TestEnvironment(t)

	// Crear cliente válido
	crearCli := doRequest(routes, "POST", "/api/admin/clientes", adminID, map[string]any{
		"nombre": "Alcaldía de Bucaramanga",
	})
	if crearCli.Code != http.StatusCreated {
		t.Fatalf("Error al crear cliente: %d %s", crearCli.Code, crearCli.Body.String())
	}
	var cli store.Cliente
	_ = json.Unmarshal(crearCli.Body.Bytes(), &cli)
	if cli.Nombre != "Alcaldía de Bucaramanga" || !cli.Activo {
		t.Fatalf("Datos del cliente incorrectos: %+v", cli)
	}

	// Nombre duplicado insensible a mayúsculas -> 409 Conflict
	dupCli := doRequest(routes, "POST", "/api/admin/clientes", adminID, map[string]any{
		"nombre": "alcaldía de bucaramanga",
	})
	if dupCli.Code != http.StatusConflict {
		t.Fatalf("Esperaba 409 Conflict por cliente duplicado, obtuve %d", dupCli.Code)
	}

	// Nombre inválido (vacío o > 80 caracteres) -> 400
	vacioCli := doRequest(routes, "POST", "/api/admin/clientes", adminID, map[string]any{
		"nombre": "   ",
	})
	if vacioCli.Code != http.StatusBadRequest {
		t.Fatalf("Esperaba 400 por nombre vacío, obtuve %d", vacioCli.Code)
	}

	// Listar clientes como miembro aprobado: solo activos
	listMiembro := doRequest(routes, "GET", "/api/clientes", editorID, nil)
	if listMiembro.Code != http.StatusOK {
		t.Fatalf("Error al listar clientes como miembro: %d", listMiembro.Code)
	}
	var clientesMiembro []*store.Cliente
	_ = json.Unmarshal(listMiembro.Body.Bytes(), &clientesMiembro)
	if len(clientesMiembro) != 1 {
		t.Fatalf("Esperaba 1 cliente activo, obtuve %d", len(clientesMiembro))
	}

	// Desactivar cliente
	patchCli := doRequest(routes, "PATCH", fmt.Sprintf("/api/admin/clientes/%d", cli.ID), adminID, map[string]any{
		"activo": false,
	})
	if patchCli.Code != http.StatusOK {
		t.Fatalf("Error al desactivar cliente: %d", patchCli.Code)
	}

	// Miembro ya no lo ve
	listMiembro2 := doRequest(routes, "GET", "/api/clientes", editorID, nil)
	var clientesMiembro2 []*store.Cliente
	_ = json.Unmarshal(listMiembro2.Body.Bytes(), &clientesMiembro2)
	if len(clientesMiembro2) != 0 {
		t.Fatalf("Esperaba 0 clientes activos, obtuve %d", len(clientesMiembro2))
	}

	// Admin sí lo ve
	listAdmin := doRequest(routes, "GET", "/api/admin/clientes", adminID, nil)
	var clientesAdmin []*store.Cliente
	_ = json.Unmarshal(listAdmin.Body.Bytes(), &clientesAdmin)
	if len(clientesAdmin) != 1 {
		t.Fatalf("Admin debe ver clientes inactivos, obtuve %d", len(clientesAdmin))
	}

	// Asignar tarea con cliente inactivo -> 400
	tareaInactiva := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"tipo_id":    2,
		"cliente_id": cli.ID,
		"asignado_a":  editorID,
		"titulo":     "Tarea con cliente inactivo",
	})
	if tareaInactiva.Code != http.StatusBadRequest {
		t.Fatalf("Esperaba 400 al asignar con cliente inactivo, obtuve %d", tareaInactiva.Code)
	}

	// Reactivar cliente y asignar tarea
	doRequest(routes, "PATCH", fmt.Sprintf("/api/admin/clientes/%d", cli.ID), adminID, map[string]any{
		"activo": true,
	})
	tareaOk := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"tipo_id":    2,
		"cliente_id": cli.ID,
		"asignado_a":  editorID,
		"titulo":     "Tarea con cliente activo",
	})
	if tareaOk.Code != http.StatusCreated {
		t.Fatalf("Error al crear tarea con cliente activo: %d", tareaOk.Code)
	}
	var tCreada store.Tarea
	_ = json.Unmarshal(tareaOk.Body.Bytes(), &tCreada)
	if tCreada.ClienteID == nil || *tCreada.ClienteID != cli.ID || tCreada.Cliente == nil {
		t.Fatalf("Cliente no se pobló en la tarea: %+v", tCreada)
	}
}

// 6. Test estadísticas de Yo (GET /api/yo/estadisticas)
func TestF3EstadisticasYo(t *testing.T) {
	routes, _, adminID, editorID, camID := setupF3TestEnvironment(t)

	// Crear y aceptar 2 tareas para editor y 1 para camarografo
	// Tarea 1 Editor: Edicion (50.000)
	t1 := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"tipo_id": 2, "asignado_a": editorID, "titulo": "T1",
	})
	var tr1 store.Tarea
	_ = json.Unmarshal(t1.Body.Bytes(), &tr1)
	doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tr1.ID), editorID, nil)
	doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/aceptar", tr1.ID), adminID, nil)

	// Tarea 2 Editor: Edicion (50.000)
	t2 := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"tipo_id": 2, "asignado_a": editorID, "titulo": "T2",
	})
	var tr2 store.Tarea
	_ = json.Unmarshal(t2.Body.Bytes(), &tr2)
	doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", tr2.ID), editorID, nil)
	doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/aceptar", tr2.ID), adminID, nil)

	// Tarea Camarógrafo: Grabacion 60 min (1500 * 60 = 90.000)
	tc := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"tipo_id": 1, "asignado_a": camID, "titulo": "TC",
	})
	var trc store.Tarea
	_ = json.Unmarshal(tc.Body.Bytes(), &trc)
	doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", trc.ID), camID, map[string]any{"cantidad": 60})
	doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/aceptar", trc.ID), adminID, nil)

	// Consultar estadísticas de Editor (sin parámetros -> todo)
	yoRes := doRequest(routes, "GET", "/api/yo/estadisticas", editorID, nil)
	if yoRes.Code != http.StatusOK {
		t.Fatalf("Error en GET /api/yo/estadisticas: %d %s", yoRes.Code, yoRes.Body.String())
	}
	var yoStats store.EstadisticasYoResponse
	_ = json.Unmarshal(yoRes.Body.Bytes(), &yoStats)

	if yoStats.Trabajos != 2 {
		t.Fatalf("Trabajos editor incorrectos: %d (esperaba 2)", yoStats.Trabajos)
	}
	if yoStats.Valor != 100000 {
		t.Fatalf("Valor editor incorrecto: %d (esperaba 100000)", yoStats.Valor)
	}
	if yoStats.Total.Trabajos != 2 || yoStats.EsteMes.Trabajos != 2 {
		t.Fatalf("Total o EsteMes incorrecto: %+v", yoStats)
	}
	if len(yoStats.PorTipo) != 1 || yoStats.PorTipo[0].TipoID != 2 {
		t.Fatalf("PorTipo incorrecto: %+v", yoStats.PorTipo)
	}

	// Consultar camarógrafo
	camRes := doRequest(routes, "GET", "/api/yo/estadisticas", camID, nil)
	var camStats store.EstadisticasYoResponse
	_ = json.Unmarshal(camRes.Body.Bytes(), &camStats)

	if camStats.Trabajos != 1 || camStats.Minutos != 60 || camStats.Valor != 90000 {
		t.Fatalf("Estadísticas camarógrafo incorrectas: %+v", camStats)
	}
}

// 7. Test estadísticas de Admin (GET /api/admin/estadisticas): permisos, totales, serie continua, clientes y filtros
func TestF3EstadisticasAdmin(t *testing.T) {
	routes, s, adminID, editorID, camID := setupF3TestEnvironment(t)

	// 1. Permisos: miembro no admin recibe 403
	noAdminRes := doRequest(routes, "GET", "/api/admin/estadisticas", editorID, nil)
	if noAdminRes.Code != http.StatusForbidden {
		t.Fatalf("Esperaba 403 Forbidden para miembro no admin, obtuve %d", noAdminRes.Code)
	}

	// 2. Crear clientes
	cliA, _ := s.CrearCliente(context.Background(), "Cliente Alfa")
	cliB, _ := s.CrearCliente(context.Background(), "Cliente Beta")

	// Crear y aceptar tareas:
	// Tarea 1: Cam, Grabación 100 min (150.000 COP), con Cliente Alfa
	t1, _ := s.CrearTarea(context.Background(), &store.Tarea{
		TipoID: 1, AsignadoA: camID, ClienteID: &cliA.ID, Titulo: "T1", CreadoPor: adminID,
	})
	cant1 := 100
	_, _ = s.MarcarTareaHecha(context.Background(), t1.ID, camID, nil, &cant1)
	_, _ = s.AceptarTarea(context.Background(), t1.ID, adminID, nil)

	// Tarea 2: Editor, Edición (50.000 COP), con Cliente Beta
	t2, _ := s.CrearTarea(context.Background(), &store.Tarea{
		TipoID: 2, AsignadoA: editorID, ClienteID: &cliB.ID, Titulo: "T2", CreadoPor: adminID,
	})
	_, _ = s.MarcarTareaHecha(context.Background(), t2.ID, editorID, nil, nil)
	_, _ = s.AceptarTarea(context.Background(), t2.ID, adminID, nil)

	// Tarea 3: Cam, Grabación 50 min (75.000 COP), SIN cliente
	t3, _ := s.CrearTarea(context.Background(), &store.Tarea{
		TipoID: 1, AsignadoA: camID, ClienteID: nil, Titulo: "T3", CreadoPor: adminID,
	})
	cant3 := 50
	_, _ = s.MarcarTareaHecha(context.Background(), t3.ID, camID, nil, &cant3)
	_, _ = s.AceptarTarea(context.Background(), t3.ID, adminID, nil)

	// Consultar estadísticas de admin para hoy
	hoy := time.Now().In(store.LocBogota).Format("2006-01-02")
	adminRes := doRequest(routes, "GET", fmt.Sprintf("/api/admin/estadisticas?desde=%s&hasta=%s&agrupar=dia", hoy, hoy), adminID, nil)
	if adminRes.Code != http.StatusOK {
		t.Fatalf("Error en estadísticas admin: %d %s", adminRes.Code, adminRes.Body.String())
	}
	var res store.EstadisticasAdminResponse
	_ = json.Unmarshal(adminRes.Body.Bytes(), &res)

	// Totales: 3 trabajos, 150 minutos (100+50), valor = 150000 + 50000 + 75000 = 275000
	// Personas = 2 (cam y editor), Clientes = 2 (Alfa y Beta)
	if res.Totales.Trabajos != 3 {
		t.Fatalf("Totales trabajos incorrectos: %d (esperaba 3)", res.Totales.Trabajos)
	}
	if res.Totales.Minutos != 150 {
		t.Fatalf("Totales minutos incorrectos: %d (esperaba 150)", res.Totales.Minutos)
	}
	if res.Totales.Valor != 275000 {
		t.Fatalf("Totales valor incorrecto: %d (esperaba 275000)", res.Totales.Valor)
	}
	if res.Totales.Personas != 2 {
		t.Fatalf("Totales personas incorrecto: %d (esperaba 2)", res.Totales.Personas)
	}
	if res.Totales.Clientes != 2 {
		t.Fatalf("Totales clientes incorrecto: %d (esperaba 2)", res.Totales.Clientes)
	}

	// Serie con huecos en 0: rango de 5 días
	hace4Dias := time.Now().In(store.LocBogota).AddDate(0, 0, -4).Format("2006-01-02")
	serieRes := doRequest(routes, "GET", fmt.Sprintf("/api/admin/estadisticas?desde=%s&hasta=%s&agrupar=dia", hace4Dias, hoy), adminID, nil)
	var serieData store.EstadisticasAdminResponse
	_ = json.Unmarshal(serieRes.Body.Bytes(), &serieData)
	if len(serieData.Serie) != 5 {
		t.Fatalf("Esperaba serie continua de 5 días, obtuve %d", len(serieData.Serie))
	}
	// Los primeros 4 días deben estar en 0
	for i := 0; i < 4; i++ {
		if serieData.Serie[i].Trabajos != 0 || serieData.Serie[i].Valor != 0 {
			t.Fatalf("El día %s debió tener 0 trabajos, tiene %d", serieData.Serie[i].Fecha, serieData.Serie[i].Trabajos)
		}
	}
	// El último día (hoy) debe tener 3 trabajos
	if serieData.Serie[4].Trabajos != 3 {
		t.Fatalf("El último día debe tener 3 trabajos, tiene: %d", serieData.Serie[4].Trabajos)
	}

	// Por cliente incluye "Sin cliente" con 1 trabajo y 75.000 COP
	encontradoSinCliente := false
	for _, c := range res.PorCliente {
		if c.ClienteID == nil && c.Nombre == "Sin cliente" {
			encontradoSinCliente = true
			if c.Trabajos != 1 || c.Valor != 75000 {
				t.Fatalf("Datos de 'Sin cliente' incorrectos: %+v", c)
			}
		}
	}
	if !encontradoSinCliente {
		t.Fatalf("No se encontró el grupo 'Sin cliente' en PorCliente: %+v", res.PorCliente)
	}

	// Filtros combinados: cliente_id = cliA.ID
	filtroCliRes := doRequest(routes, "GET", fmt.Sprintf("/api/admin/estadisticas?desde=%s&hasta=%s&cliente_id=%d", hoy, hoy, cliA.ID), adminID, nil)
	var fCliData store.EstadisticasAdminResponse
	_ = json.Unmarshal(filtroCliRes.Body.Bytes(), &fCliData)
	if fCliData.Totales.Trabajos != 1 || fCliData.Totales.Valor != 150000 {
		t.Fatalf("Filtro por cliente falló: %+v", fCliData.Totales)
	}

	// Filtros combinados: cliente_id = sin_cliente
	filtroSinCliRes := doRequest(routes, "GET", fmt.Sprintf("/api/admin/estadisticas?desde=%s&hasta=%s&cliente_id=sin_cliente", hoy, hoy), adminID, nil)
	var fSinCliData store.EstadisticasAdminResponse
	_ = json.Unmarshal(filtroSinCliRes.Body.Bytes(), &fSinCliData)
	if fSinCliData.Totales.Trabajos != 1 || fSinCliData.Totales.Valor != 75000 {
		t.Fatalf("Filtro sin_cliente falló: %+v", fSinCliData.Totales)
	}
}

// 8. Test borde de fecha y zona Bogotá: aceptación a las 23:30 hora de Bogotá
// A las 23:30 en Bogotá (UTC-5) son las 04:30 del día siguiente en UTC.
// Debe contar en el día de Bogotá correspondiente.
func TestF3ZonaBogotaBordeFecha(t *testing.T) {
	routes, s, adminID, editorID, _ := setupF3TestEnvironment(t)

	// Fijar fecha exacta: 2026-10-26 a las 23:30 Bogotá (UTC-5)
	// En UTC: 2026-10-27 04:30:00 UTC
	horaBog := time.Date(2026, 10, 26, 23, 30, 0, 0, store.LocBogota)
	horaUTC := horaBog.UTC()

	// Crear tarea, marcar hecha y aceptar
	t1, err := s.CrearTarea(context.Background(), &store.Tarea{
		TipoID: 2, AsignadoA: editorID, Titulo: "Tarea nocturna", CreadoPor: adminID,
	})
	if err != nil {
		t.Fatalf("Error al crear tarea: %v", err)
	}

	_, err = s.MarcarTareaHecha(context.Background(), t1.ID, editorID, nil, nil)
	if err != nil {
		t.Fatalf("Error al marcar hecha: %v", err)
	}

	_, err = s.AceptarTarea(context.Background(), t1.ID, adminID, nil)
	if err != nil {
		t.Fatalf("Error al aceptar: %v", err)
	}

	// Forzar resuelta_en = horaUTC (23:30 Bogotá del 26 de octubre)
	s.SetResueltaEnParaPruebas(t1.ID, horaUTC)

	// Consultar estadísticas de admin para el día 2026-10-26
	// 'hasta' incluye el día completo (hasta las 23:59:59.999 en Bogotá).
	resReq := doRequest(routes, "GET", "/api/admin/estadisticas?desde=2026-10-26&hasta=2026-10-26&agrupar=dia", adminID, nil)
	if resReq.Code != http.StatusOK {
		t.Fatalf("Error al consultar estadísticas: %d %s", resReq.Code, resReq.Body.String())
	}
	var data store.EstadisticasAdminResponse
	_ = json.Unmarshal(resReq.Body.Bytes(), &data)

	if data.Totales.Trabajos != 1 {
		t.Fatalf("La tarea de las 23:30 Bogotá no se incluyó en 2026-10-26: trabajos = %d", data.Totales.Trabajos)
	}
	if len(data.Serie) != 1 || data.Serie[0].Fecha != "2026-10-26" || data.Serie[0].Trabajos != 1 {
		t.Fatalf("La serie no reflejó la tarea en 2026-10-26: %+v", data.Serie)
	}

	// Si consultamos el día 2026-10-27 (cuando sería en UTC), en Bogotá NO hubo tareas ese día
	resSiguiente := doRequest(routes, "GET", "/api/admin/estadisticas?desde=2026-10-27&hasta=2026-10-27&agrupar=dia", adminID, nil)
	var dataSiguiente store.EstadisticasAdminResponse
	_ = json.Unmarshal(resSiguiente.Body.Bytes(), &dataSiguiente)
	if dataSiguiente.Totales.Trabajos != 0 {
		t.Fatalf("La tarea de 2026-10-26 23:30 Bogotá no debe contar en 2026-10-27: trabajos = %d", dataSiguiente.Totales.Trabajos)
	}
}

// 9. Test validación de rangos de fecha
func TestF3ValidacionRangosFecha(t *testing.T) {
	routes, _, adminID, editorID, _ := setupF3TestEnvironment(t)

	// desde > hasta -> 400
	reqInvalido := doRequest(routes, "GET", "/api/admin/estadisticas?desde=2026-10-30&hasta=2026-10-01", adminID, nil)
	if reqInvalido.Code != http.StatusBadRequest {
		t.Fatalf("Esperaba 400 por desde > hasta, obtuve %d", reqInvalido.Code)
	}

	// Formato inválido -> 400
	reqFormato := doRequest(routes, "GET", "/api/admin/estadisticas?desde=26-10-2026&hasta=2026-10-30", adminID, nil)
	if reqFormato.Code != http.StatusBadRequest {
		t.Fatalf("Esperaba 400 por formato inválido, obtuve %d", reqFormato.Code)
	}

	// Rango superior a 5 años -> 400
	req5Anios := doRequest(routes, "GET", "/api/admin/estadisticas?desde=2020-01-01&hasta=2026-01-01", adminID, nil)
	if req5Anios.Code != http.StatusBadRequest {
		t.Fatalf("Esperaba 400 por rango > 5 años, obtuve %d", req5Anios.Code)
	}

	// Mismas validaciones en GET /api/yo/estadisticas
	yoInvalido := doRequest(routes, "GET", "/api/yo/estadisticas?desde=2026-10-30&hasta=2026-10-01", editorID, nil)
	if yoInvalido.Code != http.StatusBadRequest {
		t.Fatalf("Esperaba 400 en yo/estadisticas por desde > hasta, obtuve %d", yoInvalido.Code)
	}
}
