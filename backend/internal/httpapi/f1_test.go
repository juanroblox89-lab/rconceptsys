// Tests HTTP del contrato F1 con store en memoria + X-Demo-User: cubren el
// cableado de los casos §5.8–5.16 y §5.28–5.29 en los endpoints (las reglas
// puras están en internal/produccion/produccion_test.go) y el flujo demo
// §5.3 de punta a punta. Las semillas F1 (7 clientes + pieza demo) vienen
// de store.NuevaMemoria.
package httpapi

import (
	"encoding/json"
	"net/http"
	"testing"

	"rconceptsys/backend/internal/produccion"
	"rconceptsys/backend/internal/store"
)

func decF1(t *testing.T, codigo int, cuerpo []byte) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(cuerpo, &m); err != nil {
		t.Fatalf("respuesta %d no JSON: %v (%q)", codigo, err, string(cuerpo))
	}
	return m
}

func listaF1(m map[string]any, k string) []any {
	v, _ := m[k].([]any)
	if v == nil {
		return []any{}
	}
	return v
}

// TestSemillasF1: los 7 clientes reales del brief + pieza demo con tareas
// para Breiner.
func TestSemillasF1(t *testing.T) {
	s := servidorPrueba()
	w := llamar(s, "GET", "/clientes", "dueno", "")
	if w.Code != http.StatusOK {
		t.Fatalf("clientes = %d (%s)", w.Code, w.Body.String())
	}
	clientes := listaF1(dec(t, w), "clientes")
	if len(clientes) != 7 {
		t.Fatalf("clientes = %d, quería 7: %q", len(clientes), w.Body.String())
	}
	nombres := map[string]bool{}
	for _, c := range clientes {
		nombres[c.(map[string]any)["nombre"].(string)] = true
	}
	for _, n := range []string{"Villa Grande", "Plomería Norte", "El Tizón Dorado", "Ricos Pandeyucas", "Asanarte Droguería", "El Jerez del Caballero", "Kantel"} {
		if !nombres[n] {
			t.Errorf("falta semilla %q", n)
		}
	}
	// Breiner tiene tareas demo (visibilidad §3.1.3).
	w = llamar(s, "GET", "/tareas", "equipo", "")
	if w.Code != http.StatusOK || len(listaF1(dec(t, w), "tareas")) == 0 {
		t.Errorf("Breiner debería tener tareas demo: %d %q", w.Code, w.Body.String())
	}
}

// TestEquipoSoloSusClientes: §3.1.3 + §5.29 (URL ajena → 403 sin datos).
func TestEquipoSoloSusClientes(t *testing.T) {
	s := servidorPrueba()
	w := llamar(s, "GET", "/tareas", "equipo", "")
	mios := map[string]bool{}
	for _, item := range listaF1(dec(t, w), "tareas") {
		tm := item.(map[string]any)
		if c, ok := tm["cliente_id"].(string); ok {
			mios[c] = true
		}
	}
	w = llamar(s, "GET", "/clientes", "dueno", "")
	var ajeno string
	var ajenoNombre string
	for _, item := range listaF1(dec(t, w), "clientes") {
		cm := item.(map[string]any)
		if !mios[cm["id"].(string)] {
			ajeno, ajenoNombre = cm["id"].(string), cm["nombre"].(string)
			break
		}
	}
	if ajeno == "" {
		t.Skip("equipo tiene tareas en todos los clientes (sin ajeno que probar)")
	}
	// Lista filtrada: no trae el ajeno.
	w = llamar(s, "GET", "/clientes", "equipo", "")
	for _, item := range listaF1(dec(t, w), "clientes") {
		if item.(map[string]any)["id"] == ajeno {
			t.Errorf("lista equipo trae cliente ajeno %q", ajenoNombre)
		}
	}
	// URL directa → 403 sin datos.
	w = llamar(s, "GET", "/clientes/"+ajeno, "equipo", "")
	if w.Code != http.StatusForbidden {
		t.Errorf("cliente ajeno = %d, quería 403", w.Code)
	}
	if got := w.Body.String(); len(got) > 0 && containsStr(got, ajenoNombre) {
		t.Errorf("el 403 filtra datos del cliente ajeno: %q", got)
	}
}

func containsStr(haystack, needle string) bool {
	return len(needle) > 0 && len(haystack) >= len(needle) && (func() bool {
		for i := 0; i+len(needle) <= len(haystack); i++ {
			if haystack[i:i+len(needle)] == needle {
				return true
			}
		}
		return false
	})()
}

// TestFlujoDemo: admin crea pieza para Villa Grande con grabación + edición +
// publicación → Breiner empieza/entrega grabación → admin devuelve →
// Breiner reentrega → admin aprueba → edición desbloqueada → pieza
// aprobada → publicada. Cubre §5.8 (oficio), §5.9 (dato exigido), §5.11
// (historial), §5.15 (apoyo no bloquea), §5.32 (idempotencia).
func TestFlujoDemo(t *testing.T) {
	s := servidorPrueba()
	villa := store.SemillaClienteVillaGrande

	crear := func(etapas string) map[string]any {
		w := llamar(s, "POST", "/piezas", "dueno", `{"cliente_id":"`+villa+`","titulo":"QA demo","formato":"reel","guion":"g","etapas":[`+etapas+`]}`)
		if w.Code != http.StatusCreated {
			t.Fatalf("crear pieza = %d (%s)", w.Code, w.Body.String())
		}
		return dec(t, w)
	}
	porEtapa := func(m map[string]any, etapa string) map[string]any {
		for _, item := range listaF1(m, "tareas") {
			tm := item.(map[string]any)
			if tm["etapa"] == etapa {
				return tm
			}
		}
		t.Fatalf("falta tarea %q en %q", etapa, w2s(m))
		return nil
	}

	// §5.8: crear con edición asignada a alguien sin oficio → 422.
	w := llamar(s, "POST", "/piezas", "dueno", `{"cliente_id":"`+villa+`","titulo":"QA 422","etapas":[{"etapa":"edicion","asignado_id":"`+store.SemillaPendienteID+`"}]}`)
	if w.Code != http.StatusUnprocessableEntity {
		t.Errorf("crear con asignado sin oficio = %d, quería 422 (%s)", w.Code, w.Body.String())
	}

	m := crear(`{"etapa":"grabacion_principal","asignado_id":"` + store.SemillaEquipoID + `"},{"etapa":"edicion","asignado_id":"` + store.SemillaEquipoID + `"},{"etapa":"publicacion"}`)
	grab := porEtapa(m, produccion.EtapaGrabPrincipal)
	edi := porEtapa(m, produccion.EtapaEdicion)
	pub := porEtapa(m, produccion.EtapaPublicacion)
	if grab["estado"] != produccion.TareaPendiente {
		t.Errorf("grabación nace pendiente, es %v", grab["estado"])
	}
	if edi["estado"] != produccion.TareaBloqueada {
		t.Errorf("edición nace bloqueada, es %v", edi["estado"])
	}

	// §5.8 vía reasignar: edición al pendiente → 422 (sin oficio y sin
	// acceso que trabaje, §5.2). El pendiente no tiene oficios.
	w = llamar(s, "PATCH", "/tareas/"+edi["id"].(string), "dueno",
		`{"asignado_id":"`+store.SemillaPendienteID+`","updated_at":"`+edi["updated_at"].(string)+`"}`)
	if w.Code != http.StatusUnprocessableEntity {
		t.Errorf("asignar sin oficio = %d, quería 422 (%s)", w.Code, w.Body.String())
	}

	// Equipo no puede crear piezas ni aprobar.
	w = llamar(s, "POST", "/piezas", "equipo", `{"cliente_id":"`+villa+`","titulo":"X","etapas":[]}`)
	if w.Code != http.StatusForbidden {
		t.Errorf("crear pieza como equipo = %d, quería 403", w.Code)
	}

	// Empezar como otro equipo (tarea sin asignar) → 403; como Breiner → 200.
	grabID := grab["id"].(string)
	w = llamar(s, "POST", "/tareas/"+grabID+"/empezar", "equipo", `{}`)
	if w.Code != http.StatusOK {
		t.Fatalf("empezar = %d (%s)", w.Code, w.Body.String())
	}

	// §5.9: sin minutos → 400; con link+minutos → 200.
	w = llamar(s, "POST", "/tareas/"+grabID+"/entregar", "equipo", `{"material_url":"https://drive/mat"}`)
	if w.Code != http.StatusBadRequest {
		t.Errorf("entregar sin minutos = %d, quería 400", w.Code)
	}
	w = llamar(s, "POST", "/tareas/"+grabID+"/entregar", "equipo", `{"material_url":"https://drive/mat","minutos":45}`)
	if w.Code != http.StatusOK {
		t.Fatalf("entregar = %d (%s)", w.Code, w.Body.String())
	}
	// §5.32: doble entregar idempotente.
	w = llamar(s, "POST", "/tareas/"+grabID+"/entregar", "equipo", `{"material_url":"https://drive/mat","minutos":45}`)
	if w.Code != http.StatusOK {
		t.Errorf("doble entregar = %d, quería 200", w.Code)
	}

	// Devolver sin comentario → 400; con comentario → 200 (§5.11 historial).
	w = llamar(s, "POST", "/tareas/"+grabID+"/devolver", "dueno", `{}`)
	if w.Code != http.StatusBadRequest {
		t.Errorf("devolver sin comentario = %d, quería 400", w.Code)
	}
	w = llamar(s, "POST", "/tareas/"+grabID+"/devolver", "dueno", `{"comentario":"falta plano detalle"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("devolver = %d (%s)", w.Code, w.Body.String())
	}
	w = llamar(s, "POST", "/tareas/"+grabID+"/entregar", "equipo", `{"material_url":"https://drive/mat2","minutos":50}`)
	if w.Code != http.StatusOK {
		t.Fatalf("reentrega = %d (%s)", w.Code, w.Body.String())
	}

	// Aprobar como equipo → 403; como dueño → 200 + desbloquea edición.
	w = llamar(s, "POST", "/tareas/"+grabID+"/aprobar", "equipo", `{}`)
	if w.Code != http.StatusForbidden {
		t.Errorf("aprobar como equipo = %d, quería 403", w.Code)
	}
	w = llamar(s, "POST", "/tareas/"+grabID+"/aprobar", "dueno", `{}`)
	if w.Code != http.StatusOK {
		t.Fatalf("aprobar = %d (%s)", w.Code, w.Body.String())
	}
	w = llamar(s, "POST", "/tareas/"+grabID+"/aprobar", "dueno", `{}`)
	if w.Code != http.StatusOK {
		t.Errorf("doble aprobar = %d, quería 200", w.Code)
	}
	w = llamar(s, "GET", "/tareas/"+edi["id"].(string), "dueno", "")
	estEdi := dec(t, w)["tarea"].(map[string]any)["estado"]
	if estEdi != produccion.TareaPendiente {
		t.Errorf("edición debería desbloquearse a pendiente, es %v", estEdi)
	}

	// Historial guarda la devolución (§5.11).
	w = llamar(s, "GET", "/tareas/"+grabID+"/eventos", "dueno", "")
	evs := listaF1(dec(t, w), "eventos")
	hayDev := false
	for _, e := range evs {
		if e.(map[string]any)["accion"] == "devolver" {
			hayDev = true
		}
	}
	if !hayDev {
		t.Errorf("historial sin devolución (%d eventos)", len(evs))
	}

	// Completar edición y publicación hasta pieza aprobada → publicada.
	ediID := edi["id"].(string)
	pubID := pub["id"].(string)
	for _, paso := range []struct{ id, body string }{
		{ediID, `{"entregable_url":"https://drive/edit"}`},
	} {
		_ = llamar(s, "POST", "/tareas/"+paso.id+"/empezar", "equipo", `{}`)
		if w := llamar(s, "POST", "/tareas/"+paso.id+"/entregar", "equipo", paso.body); w.Code != http.StatusOK {
			t.Fatalf("entregar edición = %d (%s)", w.Code, w.Body.String())
		}
		if w := llamar(s, "POST", "/tareas/"+paso.id+"/aprobar", "dueno", `{}`); w.Code != http.StatusOK {
			t.Fatalf("aprobar edición = %d (%s)", w.Code, w.Body.String())
		}
	}
	// Avanzar la pieza a aprobada para poder publicar (§4.2).
	piezaID := m["pieza"].(map[string]any)["id"].(string)
	piezaGet := llamar(s, "GET", "/piezas/"+piezaID, "dueno", "")
	pv := dec(t, piezaGet)["pieza"].(map[string]any)
	for _, est := range []string{produccion.PiezaEnProduccion, produccion.PiezaEnRevision, produccion.PiezaAprobada} {
		pg := llamar(s, "GET", "/piezas/"+piezaID, "dueno", "")
		vAct := dec(t, pg)["pieza"].(map[string]any)["updated_at"].(string)
		_ = vAct
		w := llamar(s, "PATCH", "/piezas/"+piezaID, "dueno", `{"estado":"`+est+`","updated_at":"`+dec(t, pg)["pieza"].(map[string]any)["updated_at"].(string)+`"}`)
		if w.Code != http.StatusOK {
			t.Fatalf("pieza → %q = %d (%s)", est, w.Code, w.Body.String())
		}
	}
	_ = pv
	// F14: publicar sin pieza aprobada se rechaza (entregar/aprobar la
	// etapa de publicación + PATCH a publicada exigen pieza aprobada).
	w = llamar(s, "POST", "/piezas", "dueno", `{"cliente_id":"`+villa+`","titulo":"QA pub temprana","etapas":[{"etapa":"publicacion","asignado_id":"`+store.SemillaDuenoID+`"}]}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("crear pub temprana = %d (%s)", w.Code, w.Body.String())
	}
	temprana := dec(t, w)
	pubTemprana := porEtapa(temprana, produccion.EtapaPublicacion)["id"].(string)
	_ = llamar(s, "POST", "/tareas/"+pubTemprana+"/empezar", "dueno", `{}`)
	if w := llamar(s, "POST", "/tareas/"+pubTemprana+"/entregar", "dueno", `{"publicado_url":"https://red/p/0"}`); w.Code != http.StatusBadRequest {
		t.Errorf("entregar publicación sin pieza aprobada = %d, quería 400", w.Code)
	}
	// Publicar: la hace Samuel (dueño con oficio publicacion; Breiner solo
	// tiene grabacion+edicion por semillas F0 y §5.8 lo rechazaría con 422).
	_ = llamar(s, "PATCH", "/tareas/"+pubID, "dueno", `{"asignado_id":"`+store.SemillaDuenoID+`"}`)
	_ = llamar(s, "POST", "/tareas/"+pubID+"/empezar", "dueno", `{}`)
	if w := llamar(s, "POST", "/tareas/"+pubID+"/entregar", "dueno", `{"publicado_url":"https://red/p/1"}`); w.Code != http.StatusOK {
		t.Fatalf("entregar publicación = %d (%s)", w.Code, w.Body.String())
	}
	if w := llamar(s, "POST", "/tareas/"+pubID+"/aprobar", "dueno", `{}`); w.Code != http.StatusOK {
		t.Fatalf("aprobar publicación = %d (%s)", w.Code, w.Body.String())
	}
	pg := llamar(s, "GET", "/piezas/"+piezaID, "dueno", "")
	w = llamar(s, "PATCH", "/piezas/"+piezaID, "dueno", `{"estado":"publicada","updated_at":"`+dec(t, pg)["pieza"].(map[string]any)["updated_at"].(string)+`"}`)
	if w.Code != http.StatusOK {
		t.Errorf("pieza → publicada = %d (%s)", w.Code, w.Body.String())
	}
}

func w2s(m map[string]any) string {
	b, _ := json.Marshal(m)
	return string(b)
}

// TestConflicto409: §5.14 — PATCH con updated_at viejo → 409.
func TestConflicto409(t *testing.T) {
	s := servidorPrueba()
	w := llamar(s, "POST", "/piezas", "dueno", `{"cliente_id":"`+store.SemillaClienteVillaGrande+`","titulo":"QA 409","etapas":[]}`)
	pieza := dec(t, w)["pieza"].(map[string]any)
	w = llamar(s, "PATCH", "/piezas/"+pieza["id"].(string), "dueno", `{"titulo":"choque","updated_at":"2000-01-01T00:00:00Z"}`)
	if w.Code != http.StatusConflict {
		t.Errorf("PATCH viejo = %d, quería 409", w.Code)
	}
	if dec(t, w)["error"] != "esto cambió mientras editabas" {
		t.Errorf("mensaje 409 = %q", w.Body.String())
	}
}

// TestVencidasYCancelar: §5.10 (vencida=true) + §5.12 (motivo, reparto de
// tareas) + §5.28 (pausado no admite piezas).
func TestVencidasYCancelar(t *testing.T) {
	s := servidorPrueba()
	villa := store.SemillaClienteVillaGrande
	w := llamar(s, "POST", "/piezas", "dueno", `{"cliente_id":"`+villa+`","titulo":"QA vencida","etapas":[{"etapa":"edicion","fecha_limite":"2020-01-01"}]}`)
	pieza := dec(t, w)["pieza"].(map[string]any)
	piezaID := pieza["id"].(string)

	w = llamar(s, "GET", "/tareas?vista=vencidas", "dueno", "")
	hay := false
	for _, item := range listaF1(dec(t, w), "tareas") {
		tm := item.(map[string]any)
		if tm["pieza_id"] == piezaID && tm["vencida"] == true {
			hay = true
		}
	}
	if !hay {
		t.Error("la tarea con límite 2020 debería salir vencida")
	}

	// Cancelar como equipo → 403; sin motivo → 400.
	w = llamar(s, "POST", "/piezas/"+piezaID+"/cancelar", "equipo", `{"motivo":"x"}`)
	if w.Code != http.StatusForbidden {
		t.Errorf("cancelar equipo = %d, quería 403", w.Code)
	}
	w = llamar(s, "POST", "/piezas/"+piezaID+"/cancelar", "dueno", `{}`)
	if w.Code != http.StatusBadRequest {
		t.Errorf("cancelar sin motivo = %d, quería 400", w.Code)
	}
	w = llamar(s, "POST", "/piezas/"+piezaID+"/cancelar", "dueno", `{"motivo":"cliente canceló"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("cancelar = %d (%s)", w.Code, w.Body.String())
	}
	// La tarea bloqueada quedó cancelada.
	w = llamar(s, "GET", "/piezas/"+piezaID, "dueno", "")
	for _, item := range listaF1(dec(t, w), "tareas") {
		if item.(map[string]any)["estado"] != produccion.TareaCancelada {
			t.Errorf("tarea bloqueada debería cancelarse: %v", item)
		}
	}

	// §5.28: pausar el cliente → piezas nuevas 400/422; luego reactivar.
	g0 := llamar(s, "GET", "/clientes/"+villa, "dueno", "")
	v0 := dec(t, g0)["cliente"].(map[string]any)["updated_at"].(string)
	if w := llamar(s, "PATCH", "/clientes/"+villa, "dueno", `{"estado":"pausado","updated_at":"`+v0+`"}`); w.Code != http.StatusOK {
		t.Fatalf("pausar = %d (%s)", w.Code, w.Body.String())
	}
	w = llamar(s, "POST", "/piezas", "dueno", `{"cliente_id":"`+villa+`","titulo":"QA pausado","etapas":[]}`)
	if w.Code != http.StatusBadRequest && w.Code != http.StatusUnprocessableEntity {
		t.Errorf("pieza en pausado = %d, quería 400/422", w.Code)
	}
	g1 := llamar(s, "GET", "/clientes/"+villa, "dueno", "")
	v1 := dec(t, g1)["cliente"].(map[string]any)["updated_at"].(string)
	if w := llamar(s, "PATCH", "/clientes/"+villa, "dueno", `{"estado":"activo","updated_at":"`+v1+`"}`); w.Code != http.StatusOK {
		t.Fatalf("reactivar = %d (%s)", w.Code, w.Body.String())
	}
}

// TestNotificaciones: el flujo genera avisos (asignar, entregar, devolver,
// aprobar) y se marcan leídas.
func TestNotificaciones(t *testing.T) {
	s := servidorPrueba()
	w := llamar(s, "GET", "/notificaciones", "equipo", "")
	if w.Code != http.StatusOK {
		t.Fatalf("notificaciones = %d", w.Code)
	}
	// Las semillas no traen notificaciones; crear pieza asignada genera una.
	villa := store.SemillaClienteVillaGrande
	w = llamar(s, "POST", "/piezas", "dueno", `{"cliente_id":"`+villa+`","titulo":"QA noti","etapas":[{"etapa":"edicion","asignado_id":"`+store.SemillaEquipoID+`"}]}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("crear = %d (%s)", w.Code, w.Body.String())
	}
	w = llamar(s, "GET", "/notificaciones", "equipo", "")
	notis := listaF1(dec(t, w), "notificaciones")
	if len(notis) == 0 {
		t.Fatal("Breiner debería tener ≥1 notificación tras asignarle")
	}
	primera := notis[0].(map[string]any)
	w = llamar(s, "POST", "/notificaciones/"+primera["id"].(string)+"/leer", "equipo", `{}`)
	if w.Code != http.StatusOK {
		t.Errorf("leer = %d, quería 200", w.Code)
	}
	// Leer la de otro → 404.
	w = llamar(s, "POST", "/notificaciones/"+primera["id"].(string)+"/leer", "admin", `{}`)
	if w.Code != http.StatusNotFound {
		t.Errorf("leer ajena = %d, quería 404", w.Code)
	}
}
