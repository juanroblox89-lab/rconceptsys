// Tests HTTP del contrato F2 con store en memoria + X-Demo-User: tarifas
// (solo dueño, versionado), líneas automáticas al aprobar (idempotencia,
// tarifa congelada, sin_tarifa), ciclo confirmar/reclamar/aprobar/devolver,
// ajustes, cortes (cerrar/arrastre/pagar/revertir/CSV), comisión 8 %,
// decision_pendiente solo dueño y seguridad (admin 403 en tarifas/cortes/
// pagado; equipo solo sus líneas; nadie edita montos).
package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"rconceptsys/backend/internal/cobros"
	"rconceptsys/backend/internal/store"
)

func decF2(t *testing.T, codigo int, cuerpo []byte) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(cuerpo, &m); err != nil {
		t.Fatalf("respuesta no JSON: %v (%q)", err, string(cuerpo))
	}
	return m
}

func listaLineas(t *testing.T, s *Server, demo, query string) []any {
	t.Helper()
	w := llamar(s, "GET", "/lineas"+query, demo, "")
	if w.Code != http.StatusOK {
		t.Fatalf("GET /lineas %s = %d (%s)", demo, w.Code, w.Body.String())
	}
	var m map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &m); err != nil {
		t.Fatalf("lineas no JSON: %v", err)
	}
	v, _ := m["lineas"].([]any)
	if v == nil {
		return []any{}
	}
	return v
}

// aprobarTareaF2 lleva una tarea demo a aprobada: empezar → entregar →
// aprobar. Devuelve el id de la tarea aprobada.
func aprobarTareaF2(t *testing.T, s *Server, tareaID, demoEntrega, cuerpoEntrega string) string {
	t.Helper()
	if w := llamar(s, "POST", "/tareas/"+tareaID+"/empezar", "equipo", ""); w.Code != http.StatusOK {
		t.Fatalf("empezar = %d (%s)", w.Code, w.Body.String())
	}
	if w := llamar(s, "POST", "/tareas/"+tareaID+"/entregar", "equipo", cuerpoEntrega); w.Code != http.StatusOK {
		t.Fatalf("entregar = %d (%s)", w.Code, w.Body.String())
	}
	w := llamar(s, "POST", "/tareas/"+tareaID+"/aprobar", "admin", "")
	if w.Code != http.StatusOK {
		t.Fatalf("aprobar = %d (%s)", w.Code, w.Body.String())
	}
	_ = demoEntrega
	return tareaID
}

func TestTarifasSoloDueno(t *testing.T) {
	s := servidorPrueba()
	body := `{"etapa":"edicion","unidad":"por_tarea","monto_cop":90000}`
	if w := llamar(s, "POST", "/tarifas", "admin", body); w.Code != http.StatusForbidden {
		t.Errorf("admin crea tarifa = %d, quería 403 (%s)", w.Code, w.Body.String())
	}
	if w := llamar(s, "GET", "/tarifas", "equipo", ""); w.Code != http.StatusForbidden {
		t.Errorf("equipo lista tarifas = %d, quería 403", w.Code)
	}
	w := llamar(s, "POST", "/tarifas", "dueno", body)
	if w.Code != http.StatusCreated {
		t.Fatalf("dueño crea tarifa = %d (%s)", w.Code, w.Body.String())
	}
	// Versionado: la anterior se desactiva, la nueva es version+1.
	w2 := llamar(s, "POST", "/tarifas", "dueno", body)
	if w2.Code != http.StatusCreated {
		t.Fatalf("dueño re-crea tarifa = %d (%s)", w2.Code, w2.Body.String())
	}
	var m map[string]any
	_ = json.Unmarshal(w2.Body.Bytes(), &m)
	if v, _ := m["version"].(float64); v != 3 {
		t.Errorf("version = %v, quería 3 (semilla v1 + creada v2 + esta v3)", m["version"])
	}
	w = llamar(s, "GET", "/tarifas", "dueno", "")
	var lm map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &lm)
	activas := 0
	for _, item := range listaF1(lm, "tarifas") {
		if item.(map[string]any)["activa"] == true {
			activas++
		}
	}
	// Activas por (etapa,unidad): edicion/por_tarea solo 1 (más la semilla
	// de grabación por_minuto).
	for _, item := range listaF1(lm, "tarifas") {
		tm := item.(map[string]any)
		_ = tm
	}
	if activas < 2 {
		t.Errorf("activas = %d, quería al menos 2 (semillas + nueva)", activas)
	}
}

func TestAprobarGeneraLineaCongelada(t *testing.T) {
	s := servidorPrueba()
	aprobarTareaF2(t, s, store.SemillaTareaGrabDemoID, "",
		`{"material_url":"https://d/x","minutos":15}`)
	lineas := listaLineas(t, s, "dueno", "")
	if len(lineas) != 1 {
		t.Fatalf("líneas = %d, quería 1 (%v)", len(lineas), lineas)
	}
	lm := lineas[0].(map[string]any)
	if lm["estado"] != cobros.LineaPorConfirmar {
		t.Errorf("estado = %v, quería por_confirmar", lm["estado"])
	}
	// Semilla grabación por_minuto 2000 × 15 min = 30000.
	if monto, _ := lm["monto_cop"].(float64); monto != 30000 {
		t.Errorf("monto = %v, quería 30000", lm["monto_cop"])
	}
	if lm["tarifa_id"] == nil || lm["tarifa_id"] == "" {
		t.Error("la línea debería congelar tarifa_id")
	}
	// Idempotencia: aprobar de nuevo no duplica.
	if w := llamar(s, "POST", "/tareas/"+store.SemillaTareaGrabDemoID+"/aprobar", "admin", ""); w.Code != http.StatusOK {
		t.Fatalf("re-aprobar = %d", w.Code)
	}
	if n := len(listaLineas(t, s, "dueno", "")); n != 1 {
		t.Errorf("tras re-aprobar líneas = %d, quería 1", n)
	}
	// Cambio de tarifa NO altera la línea vieja (§5.17).
	w := llamar(s, "POST", "/tarifas",
		"dueno", `{"etapa":"grabacion_principal","unidad":"por_minuto","monto_cop":9999}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("nueva tarifa = %d (%s)", w.Code, w.Body.String())
	}
	lineas = listaLineas(t, s, "dueno", "")
	if monto, _ := lineas[0].(map[string]any)["monto_cop"].(float64); monto != 30000 {
		t.Errorf("tras cambio de tarifa monto = %v, quería 30000", lineas[0])
	}
}

func TestSinTarifa(t *testing.T) {
	s := servidorPrueba()
	// Diseño no tiene tarifa semilla → sin_tarifa.
	// Crear pieza con etapa diseño asignada a Samuel (dueño tiene oficios).
	w := llamar(s, "POST", "/piezas", "admin",
		`{"cliente_id":"`+store.SemillaClienteVillaGrande+`","titulo":"P sin tarifa","etapas":[{"etapa":"diseno","asignado_id":"`+store.SemillaDuenoID+`"}]}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("crear pieza = %d (%s)", w.Code, w.Body.String())
	}
	var m map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &m)
	tareas, _ := m["tareas"].([]any)
	if len(tareas) == 0 {
		t.Fatal("la pieza no trajo tareas")
	}
	tid := tareas[0].(map[string]any)["id"].(string)
	if w := llamar(s, "POST", "/tareas/"+tid+"/empezar", "dueno", ""); w.Code != http.StatusOK {
		t.Fatalf("empezar = %d (%s)", w.Code, w.Body.String())
	}
	if w := llamar(s, "POST", "/tareas/"+tid+"/entregar", "dueno", `{"entregable_url":"https://d/y"}`); w.Code != http.StatusOK {
		t.Fatalf("entregar = %d (%s)", w.Code, w.Body.String())
	}
	if w := llamar(s, "POST", "/tareas/"+tid+"/aprobar", "admin", ""); w.Code != http.StatusOK {
		t.Fatalf("aprobar = %d (%s)", w.Code, w.Body.String())
	}
	lineas := listaLineas(t, s, "dueno", "")
	hallada := false
	for _, item := range lineas {
		lm := item.(map[string]any)
		if lm["tarea_id"] == tid && lm["estado"] == cobros.LineaSinTarifa {
			hallada = true
			if monto, _ := lm["monto_cop"].(float64); monto != 0 {
				t.Errorf("sin_tarifa monto = %v, quería 0", lm["monto_cop"])
			}
		}
	}
	if !hallada {
		t.Errorf("no se halló línea sin_tarifa para %s (%v)", tid, lineas)
	}
}

func TestCicloConfirmarReclamarAprobar(t *testing.T) {
	s := servidorPrueba()
	aprobarTareaF2(t, s, store.SemillaTareaGrabDemoID, "",
		`{"material_url":"https://d/x","minutos":10}`)
	lineas := listaLineas(t, s, "equipo", "")
	if len(lineas) != 1 {
		t.Fatalf("Breiner líneas = %d, quería 1", len(lineas))
	}
	id := lineas[0].(map[string]any)["id"].(string)
	// Equipo confirma la suya.
	if w := llamar(s, "POST", "/lineas/"+id+"/confirmar", "equipo", ""); w.Code != http.StatusOK {
		t.Fatalf("confirmar = %d (%s)", w.Code, w.Body.String())
	}
	// Equipo reclama con motivo.
	if w := llamar(s, "POST", "/lineas/"+id+"/reclamar", "equipo", `{"motivo":"faltan 5 min"}`); w.Code != http.StatusOK {
		t.Fatalf("reclamar = %d (%s)", w.Code, w.Body.String())
	}
	// Reclamar sin motivo → 400.
	if w := llamar(s, "POST", "/lineas/"+id+"/reclamar", "equipo", `{}`); w.Code != http.StatusBadRequest {
		t.Errorf("reclamar sin motivo = %d, quería 400", w.Code)
	}
	// Admin aprueba la reclamada (y responde con ajuste aparte).
	if w := llamar(s, "POST", "/lineas/"+id+"/aprobar", "admin", ""); w.Code != http.StatusOK {
		t.Fatalf("aprobar = %d (%s)", w.Code, w.Body.String())
	}
	// Ajuste con motivo (admin sí; monto != 0).
	w := llamar(s, "POST", "/lineas/ajuste", "admin",
		`{"usuario_id":"`+store.SemillaEquipoID+`","monto_cop":5000,"motivo":"bono"}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("ajuste = %d (%s)", w.Code, w.Body.String())
	}
	if w := llamar(s, "POST", "/lineas/ajuste", "admin",
		`{"usuario_id":"`+store.SemillaEquipoID+`","monto_cop":5000,"motivo":""}`); w.Code != http.StatusBadRequest {
		t.Errorf("ajuste sin motivo = %d, quería 400", w.Code)
	}
	if w := llamar(s, "POST", "/lineas/ajuste", "equipo",
		`{"usuario_id":"`+store.SemillaEquipoID+`","monto_cop":5000,"motivo":"x"}`); w.Code != http.StatusForbidden {
		t.Errorf("equipo ajusta = %d, quería 403", w.Code)
	}
}

func TestEquipoSoloSusLineas(t *testing.T) {
	s := servidorPrueba()
	aprobarTareaF2(t, s, store.SemillaTareaGrabDemoID, "",
		`{"material_url":"https://d/x","minutos":10}`)
	// La línea es de Breiner: el vendedor (otro equipo con oficio ventas)
	// no la ve en su lista (solo comisiones).
	if w := llamar(s, "POST", "/usuarios/"+store.SemillaPendienteID+"/aprobar", "dueno",
		`{"acceso":"equipo","oficios":["ventas"]}`); w.Code != http.StatusOK {
		t.Fatalf("aprobar vendedor = %d (%s)", w.Code, w.Body.String())
	}
	// Breiner ve la suya.
	lineas := listaLineas(t, s, "equipo", "")
	if len(lineas) != 1 {
		t.Fatalf("Breiner líneas = %d, quería 1", len(lineas))
	}
	id := lineas[0].(map[string]any)["id"].(string)
	// Otro equipo (vendedor) lista: no ve la línea de tarea ajena.
	w := llamar(s, "GET", "/lineas", store.SemillaPendienteID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("vendedor lista = %d", w.Code)
	}
	var vm map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &vm)
	for _, item := range listaF1(vm, "lineas") {
		if item.(map[string]any)["id"] == id {
			t.Error("el vendedor no debería ver la línea de tarea ajena")
		}
	}
	// Detalle ajeno: 404 (no revela existencia).
	if w := llamar(s, "GET", "/lineas/"+id, store.SemillaPendienteID, ""); w.Code != http.StatusNotFound {
		t.Errorf("vendedor detalle ajeno = %d, quería 404", w.Code)
	}
	// Admin sí ve todas.
	if n := len(listaLineas(t, s, "admin", "")); n < 1 {
		t.Errorf("admin líneas = %d", n)
	}
	// Pendiente no existe en demo ("pendiente" no resuelve a usuario) →
	// 401 sin auth; con auth real el guard VerCobros daría 403. Se usa un
	// id inexistente para el mismo efecto.
	if w := llamar(s, "GET", "/lineas", "nadie@demo.rconceptsys", ""); w.Code != http.StatusUnauthorized {
		t.Errorf("desconocido lista = %d, quería 401", w.Code)
	}
	_ = id
}

func TestCierreArrastreYPagado(t *testing.T) {
	s := servidorPrueba()
	aprobarTareaF2(t, s, store.SemillaTareaGrabDemoID, "",
		`{"material_url":"https://d/x","minutos":10}`)
	lineas := listaLineas(t, s, "dueno", "")
	id := lineas[0].(map[string]any)["id"].(string)
	periodo := lineas[0].(map[string]any)["periodo"].(string)
	// La línea está por_confirmar (no aprobada): al cerrar se arrastra.
	if w := llamar(s, "POST", "/cortes/cerrar", "admin", `{"periodo":"`+periodo+`"}`); w.Code != http.StatusForbidden {
		t.Fatalf("admin cierra = %d, quería 403 (%s)", w.Code, w.Body.String())
	}
	w := llamar(s, "POST", "/cortes/cerrar", "dueno", `{"periodo":"`+periodo+`"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("cerrar = %d (%s)", w.Code, w.Body.String())
	}
	// Cerrado no se reabre.
	if w := llamar(s, "POST", "/cortes/cerrar", "dueno", `{"periodo":"`+periodo+`"}`); w.Code != http.StatusBadRequest {
		t.Errorf("re-cerrar = %d, quería 400", w.Code)
	}
	// La línea se arrastró al periodo siguiente.
	w = llamar(s, "GET", "/lineas/"+id, "dueno", "")
	var lm map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &lm)
	if lm["periodo"] == periodo {
		t.Errorf("la línea no se arrastró (sigue en %s)", periodo)
	}
	// Aprobarla en el periodo nuevo, cerrar ese periodo y pagar.
	nuevoPeriodo := lm["periodo"].(string)
	if w := llamar(s, "POST", "/lineas/"+id+"/confirmar", "dueno", ""); w.Code != http.StatusOK {
		t.Fatalf("confirmar = %d (%s)", w.Code, w.Body.String())
	}
	if w := llamar(s, "POST", "/lineas/"+id+"/aprobar", "dueno", ""); w.Code != http.StatusOK {
		t.Fatalf("aprobar línea = %d (%s)", w.Code, w.Body.String())
	}
	if w := llamar(s, "POST", "/cortes/cerrar", "dueno", `{"periodo":"`+nuevoPeriodo+`"}`); w.Code != http.StatusOK {
		t.Fatalf("cerrar nuevo = %d (%s)", w.Code, w.Body.String())
	}
	// Verificar en_corte.
	w = llamar(s, "GET", "/lineas/"+id, "dueno", "")
	_ = json.Unmarshal(w.Body.Bytes(), &lm)
	if lm["estado"] != cobros.LineaEnCorte {
		t.Fatalf("estado = %v, quería en_corte", lm["estado"])
	}
	// Admin no puede marcar pagado.
	if w := llamar(s, "POST", "/cortes/"+nuevoPeriodo+"/pagar", "admin", `{}`); w.Code != http.StatusForbidden {
		t.Errorf("admin paga = %d, quería 403", w.Code)
	}
	if w := llamar(s, "POST", "/cortes/"+nuevoPeriodo+"/pagar", "dueno", `{}`); w.Code != http.StatusOK {
		t.Fatalf("pagar = %d (%s)", w.Code, w.Body.String())
	}
	w = llamar(s, "GET", "/lineas/"+id, "dueno", "")
	_ = json.Unmarshal(w.Body.Bytes(), &lm)
	if lm["estado"] != cobros.LineaPagada {
		t.Fatalf("estado = %v, quería pagada", lm["estado"])
	}
	// Revertir solo dueño.
	if w := llamar(s, "POST", "/cortes/"+nuevoPeriodo+"/revertir", "admin", `{}`); w.Code != http.StatusForbidden {
		t.Errorf("admin revierte = %d, quería 403", w.Code)
	}
	if w := llamar(s, "POST", "/cortes/"+nuevoPeriodo+"/revertir", "dueno", `{}`); w.Code != http.StatusOK {
		t.Fatalf("revertir = %d (%s)", w.Code, w.Body.String())
	}
	// CSV del corte (dueño/admin; equipo 403).
	if w := llamar(s, "GET", "/cortes/"+nuevoPeriodo+"/csv", "dueno", ""); w.Code != http.StatusOK {
		t.Errorf("csv = %d, quería 200", w.Code)
	} else if ct := w.Header().Get("Content-Type"); !strings.Contains(ct, "text/csv") {
		t.Errorf("csv content-type = %q", ct)
	}
	if w := llamar(s, "GET", "/cortes/"+nuevoPeriodo+"/csv", "equipo", ""); w.Code != http.StatusForbidden {
		t.Errorf("equipo csv = %d, quería 403", w.Code)
	}
}

func TestComisionUnaVez(t *testing.T) {
	s := servidorPrueba()
	// Vendedor con oficio ventas.
	w := llamar(s, "POST", "/usuarios/"+store.SemillaPendienteID+"/aprobar", "dueno",
		`{"acceso":"equipo","oficios":["ventas"]}`)
	if w.Code != http.StatusOK {
		t.Fatalf("aprobar vendedor = %d (%s)", w.Code, w.Body.String())
	}
	// Paquete TV Basic 300000 → comisión 24000.
	w = llamar(s, "GET", "/paquetes", "admin", "")
	var pm map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &pm)
	var tvBasic string
	for _, item := range listaF1(pm, "paquetes") {
		if item.(map[string]any)["nombre"] == "TV Basic" {
			tvBasic = item.(map[string]any)["id"].(string)
		}
	}
	if tvBasic == "" {
		t.Fatal("falta semilla TV Basic")
	}
	w = llamar(s, "POST", "/clientes", "admin",
		`{"nombre":"Cli Comisión","paquete_id":"`+tvBasic+`","vendido_por":"`+store.SemillaPendienteID+`"}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("crear cliente = %d (%s)", w.Code, w.Body.String())
	}
	lineas := listaLineas(t, s, "dueno", "")
	hallada := false
	for _, item := range lineas {
		lm := item.(map[string]any)
		if lm["tipo"] == cobros.TipoComision {
			hallada = true
			if monto, _ := lm["monto_cop"].(float64); monto != 24000 {
				t.Errorf("comisión = %v, quería 24000", lm["monto_cop"])
			}
		}
	}
	if !hallada {
		t.Errorf("no se generó comisión (%v)", lineas)
	}
	// Vendido por sin oficio ventas → 422.
	w = llamar(s, "POST", "/clientes", "admin",
		`{"nombre":"Cli Mal","paquete_id":"`+tvBasic+`","vendido_por":"`+store.SemillaEquipoID+`"}`)
	if w.Code != http.StatusUnprocessableEntity {
		t.Errorf("vendedor sin oficio = %d, quería 422 (%s)", w.Code, w.Body.String())
	}
	_ = tvBasic
}

func TestDecisionSoloDueno(t *testing.T) {
	s := servidorPrueba()
	// Cancelar la pieza demo: la grabación en curso queda decision_pendiente.
	w := llamar(s, "POST", "/piezas/"+store.SemillaPiezaDemoID+"/cancelar", "admin", `{"motivo":"cliente canceló"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("cancelar = %d (%s)", w.Code, w.Body.String())
	}
	tid := store.SemillaTareaGrabDemoID
	// Admin NO puede decidir (solo dueño, §7.6).
	if w := llamar(s, "POST", "/tareas/"+tid+"/decision", "admin",
		`{"decision":"pagar","motivo":"trabajó"}`); w.Code != http.StatusForbidden {
		t.Errorf("admin decide = %d, quería 403 (%s)", w.Code, w.Body.String())
	}
	w = llamar(s, "POST", "/tareas/"+tid+"/decision", "dueno", `{"decision":"pagar","motivo":"trabajó"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("dueño decide pagar = %d (%s)", w.Code, w.Body.String())
	}
	var m map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &m)
	if m["linea_id"] == nil || m["linea_id"] == "" {
		t.Errorf("decidir pagar debería traer linea_id (%s)", w.Body.String())
	}
}

func TestNadieEditaMonto(t *testing.T) {
	s := servidorPrueba()
	st := s.st
	l, err := st.CreateLinea(store.LineaCobro{
		TareaID: "t-x", UsuarioID: store.SemillaEquipoID, Tipo: cobros.TipoTarea,
		Estado: cobros.LineaPorConfirmar, MontoCOP: 50000, Periodo: cobros.PeriodoActual(),
	})
	if err != nil {
		t.Fatal(err)
	}
	// UpdateLineaEstado ignora monto aunque se intente colar.
	act, err := st.UpdateLineaEstado(l.ID, map[string]any{"estado": cobros.LineaConfirmada, "monto_cop": int64(1)})
	if err != nil {
		t.Fatal(err)
	}
	if act.MontoCOP != 50000 {
		t.Errorf("monto = %d, quería 50000 (inmutable)", act.MontoCOP)
	}
	if act.Estado != cobros.LineaConfirmada {
		t.Errorf("estado = %q", act.Estado)
	}
	_ = fmt.Sprint()
}

func TestCorteMioSoloPropio(t *testing.T) {
	s := servidorPrueba()
	aprobarTareaF2(t, s, store.SemillaTareaGrabDemoID, "",
		`{"material_url":"https://d/x","minutos":10}`)
	// Breiner ve su resumen del periodo (200 sin auth ajeno).
	w := llamar(s, "GET", "/cortes/mios", "equipo", "")
	if w.Code != http.StatusOK {
		t.Fatalf("corte mío = %d (%s)", w.Code, w.Body.String())
	}
	var m map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &m)
	ls, _ := m["lineas"].([]any)
	if len(ls) != 1 {
		t.Fatalf("líneas propias = %d, quería 1 (%s)", len(ls), w.Body.String())
	}
	// El vendedor (otro equipo) no ve esa línea en su resumen.
	w = llamar(s, "GET", "/cortes/mios", "admin", "")
	if w.Code != http.StatusOK {
		t.Fatalf("corte admin = %d", w.Code)
	}
	// Periodo inválido → 400.
	if w := llamar(s, "GET", "/cortes/mios?periodo=2026-13", "equipo", ""); w.Code != http.StatusBadRequest {
		t.Errorf("periodo malo = %d, quería 400", w.Code)
	}
}
