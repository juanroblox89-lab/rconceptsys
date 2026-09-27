// Tests HTTP del contrato F0 con store en memoria + X-Demo-User: cubren el
// cableado de §5.4 y §5.5 en los endpoints (las reglas puras están en
// internal/permisos/permisos_test.go) y las formas exactas que consume el
// frontend (modulos en orden, Usuario plano en aprobar/patch/desactivar).
package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"rconceptsys/backend/internal/permisos"
	"rconceptsys/backend/internal/store"
)

const secretoPrueba = "secreto-test"

func servidorPrueba() *Server {
	mem := store.NuevaMemoria()
	return Nuevo(mem, func(r *http.Request) (permisos.Usuario, error) {
		return DemoResolve(mem, r)
	}, secretoPrueba)
}

// llamar pide siempre con secreto interno (hay un test aparte sin secreto).
func llamar(s *Server, metodo, ruta, demo, cuerpo string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(metodo, ruta, strings.NewReader(cuerpo))
	if cuerpo != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if demo != "" {
		req.Header.Set("X-Demo-User", demo)
	}
	req.Header.Set("X-RC-Internal", secretoPrueba)
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)
	return w
}

func dec(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &m); err != nil {
		t.Fatalf("respuesta no JSON: %v (%q)", err, w.Body.String())
	}
	return m
}

func TestHealthSinAuthNiSecreto(t *testing.T) {
	s := servidorPrueba()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("health = %d", w.Code)
	}
	if dec(t, w)["status"] != "ok" {
		t.Fatalf("health sin status ok: %q", w.Body.String())
	}
}

func TestSecretoInternoExigido(t *testing.T) {
	s := servidorPrueba()
	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	req.Header.Set("X-Demo-User", "dueno")
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("sin secreto = %d, quería 403", w.Code)
	}
}

func TestMeSinAuth401(t *testing.T) {
	if w := llamar(servidorPrueba(), "GET", "/me", "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("me sin auth = %d, quería 401", w.Code)
	}
}

func TestMeDuenoModulos(t *testing.T) {
	w := llamar(servidorPrueba(), "GET", "/me", "dueno", "")
	if w.Code != http.StatusOK {
		t.Fatalf("me dueno = %d (%s)", w.Code, w.Body.String())
	}
	m := dec(t, w)
	if m["usuario"].(map[string]any)["acceso"] != "dueno" {
		t.Fatalf("usuario.acceso = %v", m["usuario"])
	}
	ids := []string{"inicio", "produccion", "cobros", "clientes", "ventas", "biblioteca", "equipo", "mi-perfil"}
	mods, ok := m["modulos"].([]any)
	if !ok || len(mods) != len(ids) {
		t.Fatalf("modulos incompletos: %q", w.Body.String())
	}
	quiereHab := map[string]bool{"inicio": true, "produccion": true, "cobros": true, "clientes": true, "equipo": true, "mi-perfil": true}
	for i, id := range ids {
		mm := mods[i].(map[string]any)
		if mm["id"] != id {
			t.Fatalf("modulos[%d].id = %v, quería %q", i, mm["id"], id)
		}
		if mm["habilitado"] != quiereHab[id] {
			t.Errorf("modulo %q habilitado = %v", id, mm["habilitado"])
		}
		if mm["ruta"] != "/"+id {
			t.Errorf("modulo %q ruta = %v", id, mm["ruta"])
		}
	}
}

func TestMePendienteSoloInicioDeshabilitado(t *testing.T) {
	w := llamar(servidorPrueba(), "GET", "/me", "pendiente", "")
	if w.Code != http.StatusOK {
		t.Fatalf("me pendiente = %d, quería 200", w.Code)
	}
	// El pendiente solo llega a WaitingScreen (el frontend no monta el panel),
	// pero /me igual responde 200 con inicio habilitado para no romper el gate.
	for _, item := range dec(t, w)["modulos"].([]any) {
		mm := item.(map[string]any)
		if mm["id"] == "inicio" {
			if mm["habilitado"] != true {
				t.Error("pendiente debería tener inicio habilitado (gate del panel)")
			}
			continue
		}
		if mm["habilitado"] == true {
			t.Errorf("pendiente no debería tener %q habilitado", mm["id"])
			break
		}
	}
}

func TestMeEquipoSoloSuyos(t *testing.T) {
	w := llamar(servidorPrueba(), "GET", "/me", "equipo", "")
	if w.Code != http.StatusOK {
		t.Fatalf("me equipo = %d, quería 200", w.Code)
	}
	// F1: equipo ve inicio + produccion/clientes (filtrados por dueño en el
	// backend) + mi-perfil; F2: + cobros (solo sus líneas); el resto
	// deshabilitado.
	quiereHab := map[string]bool{"inicio": true, "produccion": true, "cobros": true, "clientes": true, "mi-perfil": true}
	for _, item := range dec(t, w)["modulos"].([]any) {
		mm := item.(map[string]any)
		if mm["habilitado"] != quiereHab[mm["id"].(string)] {
			t.Errorf("equipo modulo %q habilitado = %v", mm["id"], mm["habilitado"])
		}
	}
}

func TestMeDesactivado403(t *testing.T) {
	s := servidorPrueba()
	if w := llamar(s, "POST", "/usuarios/"+store.SemillaEquipoID+"/desactivar", "dueno", `{"motivo":"se fue"}`); w.Code != http.StatusOK {
		t.Fatalf("desactivar = %d (%s)", w.Code, w.Body.String())
	}
	// Por email: por acceso "equipo" ya no hay a quién matchear.
	w := llamar(s, "GET", "/me", "breiner@demo.rconceptsys", "")
	if w.Code != http.StatusForbidden {
		t.Fatalf("me desactivado = %d, quería 403", w.Code)
	}
	if dec(t, w)["error"] != "acceso desactivado" {
		t.Errorf("mensaje = %q", w.Body.String())
	}
}

func TestUsuariosEquipo403Admin200(t *testing.T) {
	s := servidorPrueba()
	if w := llamar(s, "GET", "/usuarios", "equipo", ""); w.Code != http.StatusForbidden {
		t.Errorf("usuarios como equipo = %d, quería 403", w.Code)
	}
	w := llamar(s, "GET", "/usuarios", "admin", "")
	if w.Code != http.StatusOK {
		t.Fatalf("usuarios como admin = %d", w.Code)
	}
	if len(dec(t, w)["usuarios"].([]any)) != 4 {
		t.Errorf("quería 4 semillas: %q", w.Body.String())
	}
}

func TestAprobarComoEquipoYActividad(t *testing.T) {
	s := servidorPrueba()
	w := llamar(s, "POST", "/usuarios/"+store.SemillaPendienteID+"/aprobar", "admin", `{}`)
	if w.Code != http.StatusOK {
		t.Fatalf("aprobar = %d (%s)", w.Code, w.Body.String())
	}
	m := dec(t, w)
	if m["acceso"] != "equipo" {
		t.Errorf("acceso = %v, quería equipo", m["acceso"])
	}
	if _, tiene := m["usuario"]; tiene {
		t.Error("aprobar debe devolver el Usuario plano, sin envoltura")
	}
	w = llamar(s, "GET", "/actividad?recurso="+store.SemillaPendienteID, "admin", "")
	evs, ok := dec(t, w)["eventos"].([]any)
	if !ok || len(evs) != 1 {
		t.Fatalf("eventos = %q, quería 1", w.Body.String())
	}
	ev := evs[0].(map[string]any)
	if ev["accion"] != "aprobar_usuario" || ev["actor_nombre"] == "" || ev["cuando"] == "" {
		t.Errorf("evento incompleto: %v", ev)
	}
	if ev["motivo"] != nil {
		t.Errorf("motivo debería ser null: %v", ev["motivo"])
	}
	if ev["antes"].(map[string]any)["acceso"] != "pendiente" || ev["despues"].(map[string]any)["acceso"] != "equipo" {
		t.Errorf("antes→después mal: %v", ev)
	}
}

func TestAprobarComoAdminSegunActor(t *testing.T) {
	if w := llamar(servidorPrueba(), "POST", "/usuarios/"+store.SemillaPendienteID+"/aprobar", "admin", `{"acceso":"admin"}`); w.Code != http.StatusForbidden {
		t.Errorf("admin aprobando como admin = %d, quería 403", w.Code)
	}
	s := servidorPrueba()
	w := llamar(s, "POST", "/usuarios/"+store.SemillaPendienteID+"/aprobar", "dueno", `{"acceso":"admin","motivo":"coordinación"}`)
	if w.Code != http.StatusOK || dec(t, w)["acceso"] != "admin" {
		t.Errorf("dueño aprobando como admin = %d (%s)", w.Code, w.Body.String())
	}
}

func TestPatchMotivoYOicios(t *testing.T) {
	s := servidorPrueba()
	w := llamar(s, "PATCH", "/usuarios/"+store.SemillaEquipoID, "admin", `{"oficios":["diseno"]}`)
	if w.Code != http.StatusBadRequest {
		t.Errorf("patch sin motivo = %d, quería 400", w.Code)
	}
	w = llamar(s, "PATCH", "/usuarios/"+store.SemillaEquipoID, "admin", `{"oficios":["diseno"],"motivo":"apoyo en diseño"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("patch con motivo = %d (%s)", w.Code, w.Body.String())
	}
	of := dec(t, w)["oficios"].([]any)
	if len(of) != 1 || of[0] != "diseno" {
		t.Errorf("oficios = %v", of)
	}
}

func TestPatchAdminADueno403(t *testing.T) {
	s := servidorPrueba()
	w := llamar(s, "PATCH", "/usuarios/"+store.SemillaEquipoID, "admin", `{"acceso":"dueno","motivo":"x"}`)
	if w.Code != http.StatusForbidden {
		t.Errorf("admin poniendo dueño = %d, quería 403", w.Code)
	}
}

func TestNoQuitarUltimoDueno409(t *testing.T) {
	s := servidorPrueba()
	w := llamar(s, "PATCH", "/usuarios/"+store.SemillaDuenoID, "dueno", `{"acceso":"equipo","motivo":"x"}`)
	if w.Code != http.StatusConflict {
		t.Errorf("quitar último dueño = %d, quería 409", w.Code)
	}
	w = llamar(s, "POST", "/usuarios/"+store.SemillaDuenoID+"/desactivar", "dueno", `{"motivo":"x"}`)
	if w.Code != http.StatusConflict {
		t.Errorf("desactivar último dueño = %d, quería 409", w.Code)
	}
}

func TestDesactivarEquipoPorAdmin(t *testing.T) {
	s := servidorPrueba()
	w := llamar(s, "POST", "/usuarios/"+store.SemillaEquipoID+"/desactivar", "admin", `{"motivo":"renunció"}`)
	if w.Code != http.StatusOK || dec(t, w)["acceso"] != "desactivado" {
		t.Errorf("desactivar equipo = %d (%s)", w.Code, w.Body.String())
	}
	// §5.5: admin no puede desactivar a otro admin.
	w = llamar(s, "POST", "/usuarios/"+store.SemillaAdminID+"/desactivar", "admin", `{}`)
	if w.Code != http.StatusForbidden {
		t.Errorf("admin desactivando admin = %d, quería 403", w.Code)
	}
}

func TestActividadEquipo403(t *testing.T) {
	if w := llamar(servidorPrueba(), "GET", "/actividad", "equipo", ""); w.Code != http.StatusForbidden {
		t.Errorf("actividad como equipo = %d, quería 403", w.Code)
	}
}

func TestDemoPorEmailYDesconocido(t *testing.T) {
	s := servidorPrueba()
	if w := llamar(s, "GET", "/me", "breiner@demo.rconceptsys", ""); w.Code != http.StatusOK {
		t.Errorf("demo por email = %d, quería 200", w.Code)
	}
	if w := llamar(s, "GET", "/me", "nadie", ""); w.Code != http.StatusUnauthorized {
		t.Errorf("demo desconocido = %d, quería 401", w.Code)
	}
}
