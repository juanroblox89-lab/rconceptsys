package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"rconceptsys/backend/internal/httpapi"
	"rconceptsys/backend/internal/store"
)

func configurarTestAPI() (*httpapi.API, *store.MemoryStore) {
	s := store.NewMemoryStore()
	adminEmails := []string{"juan@rconcept.com"}
	auth := httpapi.NewDemoAuthVerifier(s, adminEmails)
	api := httpapi.NewAPI(s, auth, true) // modoDemoActivo = true para tests existentes
	return api, s
}

func TestPermisosYRolesTabla(t *testing.T) {
	api, s := configurarTestAPI()
	routes := api.Routes()

	ctx := context.Background()

	// Crear usuarios:
	// 1. Juan (en ADMIN_EMAILS)
	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID:     "juan-id",
		Correo: "juan@rconcept.com",
		Nombre: "Juan",
		Estado: store.EstadoPendiente, // Debe promoverse a aprobado y admin al autenticar
	})

	// 2. Miembro aprobado no-admin
	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID:      "cam-id",
		Correo:  "camarografo@rconcept.com",
		Nombre:  "Carlos Cámara",
		Estado:  store.EstadoAprobado,
		EsAdmin: false,
	})

	// 3. Miembro pendiente
	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID:      "pend-id",
		Correo:  "nuevo@rconcept.com",
		Nombre:  "Nuevo Usuario",
		Estado:  store.EstadoPendiente,
		EsAdmin: false,
	})

	// 4. Miembro suspendido
	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID:      "susp-id",
		Correo:  "susp@rconcept.com",
		Nombre:  "Suspendido",
		Estado:  store.EstadoSuspendido,
		EsAdmin: false,
	})

	tests := []struct {
		nombre         string
		metodo         string
		ruta           string
		userID         string
		body           string
		esperadoStatus int
	}{
		{
			nombre:         "Health check público",
			metodo:         "GET",
			ruta:           "/healthz",
			userID:         "",
			esperadoStatus: http.StatusOK,
		},
		{
			nombre:         "Sin auth da 401",
			metodo:         "GET",
			ruta:           "/api/yo",
			userID:         "",
			esperadoStatus: http.StatusUnauthorized,
		},
		{
			nombre:         "Admin email se aprueba y se vuelve admin en primer login",
			metodo:         "GET",
			ruta:           "/api/yo",
			userID:         "juan-id",
			esperadoStatus: http.StatusOK,
		},
		{
			nombre:         "Pendiente puede ver su propio perfil en /api/yo",
			metodo:         "GET",
			ruta:           "/api/yo",
			userID:         "pend-id",
			esperadoStatus: http.StatusOK,
		},
		{
			nombre:         "Pendiente NO puede leer chat",
			metodo:         "GET",
			ruta:           "/api/chat",
			userID:         "pend-id",
			esperadoStatus: http.StatusForbidden,
		},
		{
			nombre:         "Pendiente NO puede enviar chat",
			metodo:         "POST",
			ruta:           "/api/chat",
			userID:         "pend-id",
			body:           `{"cuerpo":"hola"}`,
			esperadoStatus: http.StatusForbidden,
		},
		{
			nombre:         "Suspendido NO puede leer chat",
			metodo:         "GET",
			ruta:           "/api/chat",
			userID:         "susp-id",
			esperadoStatus: http.StatusForbidden,
		},
		{
			nombre:         "Aprobado puede leer chat",
			metodo:         "GET",
			ruta:           "/api/chat",
			userID:         "cam-id",
			esperadoStatus: http.StatusOK,
		},
		{
			nombre:         "Aprobado puede enviar mensaje al chat",
			metodo:         "POST",
			ruta:           "/api/chat",
			userID:         "cam-id",
			body:           `{"cuerpo":"Grabación lista"}`,
			esperadoStatus: http.StatusCreated,
		},
		{
			nombre:         "No admin NO entra a /api/admin/miembros",
			metodo:         "GET",
			ruta:           "/api/admin/miembros",
			userID:         "cam-id",
			esperadoStatus: http.StatusForbidden,
		},
		{
			nombre:         "Admin entra a /api/admin/miembros",
			metodo:         "GET",
			ruta:           "/api/admin/miembros",
			userID:         "juan-id",
			esperadoStatus: http.StatusOK,
		},
		{
			nombre:         "Mensaje con cuerpo vacío es rechazado",
			metodo:         "POST",
			ruta:           "/api/chat",
			userID:         "cam-id",
			body:           `{"cuerpo":"   "}`,
			esperadoStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.nombre, func(t *testing.T) {
			var bodyReader *bytes.Reader
			if tc.body != "" {
				bodyReader = bytes.NewReader([]byte(tc.body))
			} else {
				bodyReader = bytes.NewReader(nil)
			}
			req := httptest.NewRequest(tc.metodo, tc.ruta, bodyReader)
			if tc.userID != "" {
				req.Header.Set("Authorization", "Bearer "+tc.userID)
			}
			if tc.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}

			w := httptest.NewRecorder()
			routes.ServeHTTP(w, req)

			if w.Code != tc.esperadoStatus {
				t.Errorf("para %s esperaba status %d, obtuve %d (body: %s)", tc.nombre, tc.esperadoStatus, w.Code, w.Body.String())
			}
		})
	}
}

func TestUltimoAdminNoSeDegrada(t *testing.T) {
	api, s := configurarTestAPI()
	routes := api.Routes()

	// Crear solo 1 admin
	ctx := context.Background()
	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID:      "unico-admin",
		Correo:  "unico@rconcept.com",
		Nombre:  "Único Admin",
		Estado:  store.EstadoAprobado,
		EsAdmin: true,
	})

	// Intentar quitarle el rol de admin
	body := bytes.NewReader([]byte(`{"es_admin": false}`))
	req := httptest.NewRequest("PUT", "/api/admin/miembros/unico-admin/admin", body)
	req.Header.Set("Authorization", "Bearer unico-admin")
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	routes.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("esperaba status 400 Bad Request, obtuve %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Error struct {
			Codigo string `json:"codigo"`
		} `json:"error"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Error.Codigo != "ultimo_admin" {
		t.Errorf("esperaba código 'ultimo_admin', obtuve %s", resp.Error.Codigo)
	}
}

func TestRateLimitChat(t *testing.T) {
	api, s := configurarTestAPI()
	routes := api.Routes()

	ctx := context.Background()
	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID:      "user-spam",
		Correo:  "spam@rconcept.com",
		Nombre:  "Spam User",
		Estado:  store.EstadoAprobado,
		EsAdmin: false,
	})

	// 20 permitidos
	for i := 1; i <= 20; i++ {
		body := bytes.NewReader([]byte(`{"cuerpo":"Mensaje permitido"}`))
		req := httptest.NewRequest("POST", "/api/chat", body)
		req.Header.Set("Authorization", "Bearer user-spam")
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		routes.ServeHTTP(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("mensaje %d debió permitirse, dio %d", i, w.Code)
		}
	}

	// El 21 debe ser rechazado por rate limit
	body := bytes.NewReader([]byte(`{"cuerpo":"Mensaje extra"}`))
	req := httptest.NewRequest("POST", "/api/chat", body)
	req.Header.Set("Authorization", "Bearer user-spam")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	routes.ServeHTTP(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("esperaba 429 Too Many Requests para mensaje 21, obtuve %d", w.Code)
	}
}
