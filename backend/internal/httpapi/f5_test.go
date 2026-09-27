// Tests HTTP del contrato F5 con store en memoria + X-Demo-User
// (proveedor FALSO inyectado: nunca se llama a la red en tests).
// Cubren: herramientas respetan permisos (equipo no obtiene datos de
// clientes ajenos ni cobros de otros por ninguna herramienta), solo
// borradores (el guion aprobado no cambia), tope diario, "no disponible"
// sin claves, historial por usuario (ajena → 404), métricas solo
// admin/dueño (equipo → 403) y actividad "vía asistente".
package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"rconceptsys/backend/internal/asistente"
	"rconceptsys/backend/internal/store"
)

func llamarF5(t *testing.T, s *Server, metodo, ruta, demo, cuerpo string, quiere int) map[string]any {
	t.Helper()
	w := llamar(s, metodo, ruta, demo, cuerpo)
	if w.Code != quiere {
		t.Fatalf("%s %s %s = %d (%s), quería %d", metodo, ruta, demo, w.Code, w.Body.String(), quiere)
	}
	var m map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &m); err != nil {
		t.Fatalf("respuesta no JSON: %v (%q)", err, w.Body.String())
	}
	return m
}

// conProveedorFalso instala cadena 9router contra un httptest que responde
// según el marcador pedido en la pregunta (guion, hooks o texto plano).
func conProveedorFalso(t *testing.T, responder func(pregunta string) string) func() {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Model    string `json:"model"`
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
			Stream   bool `json:"stream"`
			MaxTokens int  `json:"max_tokens"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.Stream {
			t.Errorf("el gateway exige stream:false, llegó stream:true")
		}
		if body.MaxTokens < 16 {
			t.Errorf("el gateway exige max_tokens >= 16, llegó %d", body.MaxTokens)
		}
		pregunta := ""
		for i := len(body.Messages) - 1; i >= 0; i-- {
			if body.Messages[i].Role == "user" {
				pregunta = body.Messages[i].Content
				break
			}
		}
		texto := responder(pregunta)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{"message": map[string]any{"content": texto}}},
		})
	}))
	t.Cleanup(srv.Close)
	asistenteSetenv(map[string]string{
		"NINEROUTER_BASE_URL": srv.URL,
		"NINEROUTER_API_KEY":  "clave-falsa",
		"NINEROUTER_MODEL":    "oc/big-pickle(xhigh)",
	})
	return asistenteRestaura
}

func TestAsistenteNoDisponibleSinClaves(t *testing.T) {
	s := servidorPrueba()
	asistenteSetenv(map[string]string{})
	defer asistenteRestaura()
	m := llamarF5(t, s, "POST", "/asistente/chat", "equipo", `{"mensaje":"¿qué tengo hoy?"}`, http.StatusOK)
	if m["no_disponible"] != true {
		t.Fatalf("sin claves quería no_disponible=true: %v", m)
	}
	resp := m["respuesta"].(map[string]any)
	if !strings.Contains(resp["contenido"].(string), "no está disponible") {
		t.Fatalf("mensaje amable esperado: %v", resp)
	}
	if n, _ := s.st.UsoHoy(store.SemillaEquipoID, asistente.DiaHoy()); n != 0 {
		t.Fatalf("sin claves no suma uso: %d", n)
	}
}

func TestAsistenteEquipoSoloLoSuyo(t *testing.T) {
	s := servidorPrueba()
	defer conProveedorFalso(t, func(pregunta string) string { return "eco: " + pregunta })()
	u := usuarioEquipo(t, s)
	d := datosAsistente{s}
	// 1) mis_tareas_hoy → solo tareas de Breiner (Villa Grande), sin
	// datos de otros.
	if out, err := asistente.Ejecutar(d, u, "mis_tareas_hoy", nil); err != nil || !strings.Contains(out, "Reel demo") {
		t.Fatalf("mis tareas = %q, %v (quería su Reel demo)", out, err)
	}
	// 2) Cobros: el resumen es SOLO el suyo (filtra por usuario; Breiner
	// no tiene líneas → $0).
	if out, err := asistente.Ejecutar(d, u, "resumen_mes", nil); err != nil || !strings.Contains(out, "$0 aprobado") {
		t.Fatalf("resumen mes = %q, %v (quería solo sus cobros $0)", out, err)
	}
	// 3) Estrategia de cliente ajeno (Kantel, sin tareas) → no la ve.
	if out, err := asistente.Ejecutar(d, u, "ver_estrategia", map[string]string{"cliente": "Kantel"}); err != nil || !strings.HasPrefix(out, "No encontré") {
		t.Fatalf("estrategia ajena = %q, %v (quería 'No encontré…')", out, err)
	}
	// 4) Atrasadas de cliente ajeno → no las ve.
	if out, err := asistente.Ejecutar(d, u, "piezas_atrasadas", map[string]string{"cliente": "Kantel"}); err != nil || !strings.HasPrefix(out, "No encontré") {
		t.Fatalf("atrasadas ajenas = %q, %v (quería 'No encontré…')", out, err)
	}
	// 5) ver_pieza ajena (pieza de Kantel no existe; la demo sí la ve
	// porque trabaja ahí).
	if out, err := asistente.Ejecutar(d, u, "ver_pieza", map[string]string{"pieza": "Reel demo"}); err != nil || !strings.Contains(out, "Villa Grande") {
		t.Fatalf("ver pieza propia = %q, %v (quería Villa Grande)", out, err)
	}
	// 6) Ventas: equipo sin oficio ventas (Breiner) → sin acceso; una
	// vendedora (Valentina) solo ve lo suyo por la herramienta.
	if out, err := asistente.Ejecutar(d, u, "mis_leads", nil); err != nil || !strings.Contains(out, "Sin acceso") && !strings.Contains(out, "sin acceso") && !strings.Contains(out, "Ventas") {
		t.Fatalf("mis_leads sin oficio = %q, %v (quería sin acceso)", out, err)
	}
	vv, _, _ := s.st.GetUsuarioByEmail("valentina@demo.rconceptsys")
	if out, err := asistente.Ejecutar(d, vv, "mis_leads", nil); err != nil || !(strings.Contains(out, "Tizón") || strings.Contains(out, "Kantel")) {
		t.Fatalf("mis_leads vendedora = %q, %v (quería sus leads)", out, err)
	}
	// 7) El chat guarda historial y suma uso (con el falso).
	m := llamarF5(t, s, "POST", "/asistente/chat", "equipo", `{"mensaje":"¿qué tengo hoy?"}`, http.StatusOK)
	if m["no_disponible"] != false {
		t.Fatalf("con falso quería no_disponible=false: %v", m)
	}
	if n, _ := s.st.UsoHoy(store.SemillaEquipoID, asistente.DiaHoy()); n != 1 {
		t.Fatalf("quería uso=1, hay %d", n)
	}
}

func TestAsistenteGuionQuedaEnBorrador(t *testing.T) {
	s := servidorPrueba()
	defer conProveedorFalso(t, func(pregunta string) string {
		return "Listo. [GUARDAR_BORRADOR pieza=Reel demo — Villa Grande]Hook: ¿sabías esto? Desarrollo en 3 pasos.[/GUARDAR_BORRADOR]"
	})()
	m := llamarF5(t, s, "POST", "/asistente/chat", "admin", `{"mensaje":"escribí el guion de la demo"}`, http.StatusOK)
	txt := m["respuesta"].(map[string]any)["contenido"].(string)
	if !strings.Contains(txt, "borrador") {
		t.Fatalf("quería confirmación de borrador: %q", txt)
	}
	p, _, _ := s.st.GetPieza(store.SemillaPiezaDemoID)
	if p.GuionBorrador == "" {
		t.Fatal("el borrador no se guardó en la pieza")
	}
	if p.Guion == "Hook + demo (semilla F1)" {
		// El guion aprobado NO cambió: bien (solo borrador).
	} else {
		t.Fatalf("el guion aprobado cambió: %q", p.Guion)
	}
	// Actividad "vía asistente".
	evs, _ := s.st.ListActividad("")
	hay := false
	for _, e := range evs {
		if e.Accion == "guardar_borrador_guion" && e.Motivo != nil && *e.Motivo == "vía asistente" {
			hay = true
		}
	}
	if !hay {
		t.Fatal("falta actividad guardar_borrador_guion vía asistente")
	}
}

func TestAsistenteProponeHooksEnBorrador(t *testing.T) {
	s := servidorPrueba()
	defer conProveedorFalso(t, func(pregunta string) string {
		return "Acá van. [PROPONER_HOOKS]¿Sabías que el 90% falla?\nEl error que nadie te cuenta\n3 pasos en 30 segundos[/PROPONER_HOOKS]"
	})()
	llamarF5(t, s, "POST", "/asistente/chat", "equipo", `{"mensaje":"proponé 3 hooks"}`, http.StatusOK)
	hs, _ := s.st.ListHooks()
	n := 0
	for _, h := range hs {
		if h.Estado == "borrador" && h.PropuestoPor == store.SemillaEquipoID {
			n++
		}
	}
	if n != 3 {
		t.Fatalf("quería 3 hooks en borrador del equipo, hay %d", n)
	}
}

func TestAsistenteTopeDiario(t *testing.T) {
	s := servidorPrueba()
	defer conProveedorFalso(t, func(pregunta string) string { return "eco" })()
	t.Setenv("ASISTENTE_TOPE_DIA", "1")
	llamarF5(t, s, "POST", "/asistente/chat", "equipo", `{"mensaje":"hola 1"}`, http.StatusOK)
	m := llamarF5(t, s, "POST", "/asistente/chat", "equipo", `{"mensaje":"hola 2"}`, http.StatusOK)
	if !strings.Contains(m["respuesta"].(map[string]any)["contenido"].(string), "tope diario") {
		t.Fatalf("quería mensaje de tope: %v", m)
	}
}

func TestAsistenteHistorialPorUsuario(t *testing.T) {
	s := servidorPrueba()
	defer conProveedorFalso(t, func(pregunta string) string { return "eco" })()
	os.Unsetenv("ASISTENTE_TOPE_DIA")
	m := llamarF5(t, s, "POST", "/asistente/chat", "equipo", `{"mensaje":"primera"}`, http.StatusOK)
	id := m["conversacion"].(map[string]any)["id"].(string)
	l := llamarF5(t, s, "GET", "/asistente/conversaciones", "equipo", "", http.StatusOK)
	if len(l["conversaciones"].([]any)) != 1 {
		t.Fatalf("quería 1 conversación propia: %v", l)
	}
	// El admin NO ve la ajena por directa (404, sin filtrar).
	if w := llamar(s, "GET", "/asistente/conversaciones/"+id, "admin", ""); w.Code != http.StatusNotFound {
		t.Fatalf("conversación ajena = %d, quería 404", w.Code)
	}
	d := llamarF5(t, s, "GET", "/asistente/conversaciones/"+id, "equipo", "", http.StatusOK)
	if len(d["mensajes"].([]any)) != 2 {
		t.Fatalf("quería pregunta+respuesta: %v", d)
	}
	// Pendiente no usa el asistente.
	if w := llamar(s, "POST", "/asistente/chat", "pendiente", `{"mensaje":"hola"}`); w.Code != http.StatusForbidden {
		t.Fatalf("pendiente = %d, quería 403", w.Code)
	}
}

func TestMetricasSoloAdmin(t *testing.T) {
	s := servidorPrueba()
	if w := llamar(s, "GET", "/metricas", "equipo", ""); w.Code != http.StatusForbidden {
		t.Fatalf("equipo GET /metricas = %d, quería 403", w.Code)
	}
	m := llamarF5(t, s, "GET", "/metricas", "admin", "", http.StatusOK)
	for _, k := range []string{"piezas_publicadas_semana", "piezas_por_estado", "tareas_vencidas", "carga_por_persona", "cobros_mes", "ventas"} {
		if _, ok := m[k]; !ok {
			t.Fatalf("falta clave %s: %v", k, m)
		}
	}
	if len(m["piezas_publicadas_semana"].([]any)) != 8 {
		t.Fatalf("quería 8 semanas: %v", m["piezas_publicadas_semana"])
	}
}
