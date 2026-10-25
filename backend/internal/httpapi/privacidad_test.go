package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"rconceptsys/backend/internal/store"
)

func TestPrivacidadCorreoMiembros(t *testing.T) {
	api, s := configurarTestAPI()
	routes := api.Routes()

	ctx := context.Background()

	// 1. Admin
	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID:      "admin-priv",
		Correo:  "admin@rconcept.com",
		Nombre:  "Admin Privado",
		Estado:  store.EstadoAprobado,
		EsAdmin: true,
	})

	// 2. Miembro 1 (compañero)
	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID:      "miembro-1",
		Correo:  "secreto1@rconcept.com",
		Nombre:  "Miembro Uno",
		Estado:  store.EstadoAprobado,
		EsAdmin: false,
	})

	// 3. Miembro 2 (quien consulta)
	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID:      "miembro-2",
		Correo:  "secreto2@rconcept.com",
		Nombre:  "Miembro Dos",
		Estado:  store.EstadoAprobado,
		EsAdmin: false,
	})

	// CASO A: Miembro 2 consulta el detalle de Miembro 1 -> NO debe ver correo
	req := httptest.NewRequest("GET", "/api/equipo/miembro-1", nil)
	req.Header.Set("Authorization", "Bearer miembro-2")
	w := httptest.NewRecorder()
	routes.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("esperaba 200 OK, obtuve %d", w.Code)
	}

	var perfilCompanero store.Perfil
	_ = json.Unmarshal(w.Body.Bytes(), &perfilCompanero)
	if perfilCompanero.Correo != "" {
		t.Errorf("fuga de privacidad: compañero no admin no debe ver el correo, vio '%s'", perfilCompanero.Correo)
	}

	// CASO B: Miembro 1 consulta su propio perfil en equipo -> SI ve su propio correo
	reqPropio := httptest.NewRequest("GET", "/api/equipo/miembro-1", nil)
	reqPropio.Header.Set("Authorization", "Bearer miembro-1")
	wPropio := httptest.NewRecorder()
	routes.ServeHTTP(wPropio, reqPropio)

	var perfilPropio store.Perfil
	_ = json.Unmarshal(wPropio.Body.Bytes(), &perfilPropio)
	if perfilPropio.Correo != "secreto1@rconcept.com" {
		t.Errorf("usuario debe ver su propio correo, obtuvo: '%s'", perfilPropio.Correo)
	}

	// CASO C: Admin consulta el detalle de Miembro 1 -> SI ve el correo
	reqAdmin := httptest.NewRequest("GET", "/api/equipo/miembro-1", nil)
	reqAdmin.Header.Set("Authorization", "Bearer admin-priv")
	wAdmin := httptest.NewRecorder()
	routes.ServeHTTP(wAdmin, reqAdmin)

	var perfilVistoPorAdmin store.Perfil
	_ = json.Unmarshal(wAdmin.Body.Bytes(), &perfilVistoPorAdmin)
	if perfilVistoPorAdmin.Correo != "secreto1@rconcept.com" {
		t.Errorf("admin debe ver el correo del miembro, obtuvo: '%s'", perfilVistoPorAdmin.Correo)
	}
}
