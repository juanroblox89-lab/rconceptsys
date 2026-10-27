package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"rconceptsys/backend/internal/httpapi"
	"rconceptsys/backend/internal/store"
	"rconceptsys/backend/internal/supa"
)

// Servidor Falso que simula Supabase Auth y REST
func configurarFakeSupabaseServer(t *testing.T) (*httptest.Server, *store.MemoryStore) {
	mem := store.NewMemoryStore()
	usersDB := make(map[string]map[string]any) // email -> user

	fakeMux := http.NewServeMux()

	// 1. POST /auth/v1/admin/users (Admin Create User)
	fakeMux.HandleFunc("POST /auth/v1/admin/users", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Email        string         `json:"email"`
			Password     string         `json:"password"`
			EmailConfirm bool           `json:"email_confirm"`
			UserMetadata map[string]any `json:"user_metadata"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		eNorm := strings.ToLower(strings.TrimSpace(req.Email))

		if _, exists := usersDB[eNorm]; exists {
			w.WriteHeader(http.StatusConflict)
			_ = json.NewEncoder(w).Encode(map[string]string{"msg": "User already registered"})
			return
		}

		uid := "fake-uuid-" + eNorm
		usersDB[eNorm] = map[string]any{
			"id":       uid,
			"email":    eNorm,
			"password": req.Password,
			"metadata": req.UserMetadata,
		}

		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":    uid,
			"email": eNorm,
		})
	})

	// 2. POST /auth/v1/token?grant_type=password
	fakeMux.HandleFunc("POST /auth/v1/token", func(w http.ResponseWriter, r *http.Request) {
		grantType := r.URL.Query().Get("grant_type")
		if grantType == "password" {
			var req struct {
				Email    string `json:"email"`
				Password string `json:"password"`
			}
			_ = json.NewDecoder(r.Body).Decode(&req)
			eNorm := strings.ToLower(strings.TrimSpace(req.Email))
			u, exists := usersDB[eNorm]
			if !exists || u["password"] != req.Password {
				w.WriteHeader(http.StatusBadRequest)
				_ = json.NewEncoder(w).Encode(map[string]string{"error_description": "Invalid login credentials"})
				return
			}

			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token":  "fake-access-token-" + u["id"].(string),
				"token_type":    "bearer",
				"expires_in":    3600,
				"refresh_token": "fake-refresh-token-" + u["id"].(string),
				"user": map[string]any{
					"id":    u["id"],
					"email": u["email"],
				},
			})
			return
		}

		if grantType == "refresh_token" {
			var req struct {
				RefreshToken string `json:"refresh_token"`
			}
			_ = json.NewDecoder(r.Body).Decode(&req)
			if !strings.HasPrefix(req.RefreshToken, "fake-refresh-token-") {
				w.WriteHeader(http.StatusBadRequest)
				_ = json.NewEncoder(w).Encode(map[string]string{"error_description": "Invalid refresh token"})
				return
			}
			uid := strings.TrimPrefix(req.RefreshToken, "fake-refresh-token-")
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token":  "fake-access-token-" + uid,
				"token_type":    "bearer",
				"expires_in":    3600,
				"refresh_token": req.RefreshToken,
			})
			return
		}

		w.WriteHeader(http.StatusBadRequest)
	})

	// 3. GET /auth/v1/user
	fakeMux.HandleFunc("GET /auth/v1/user", func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		tok := strings.TrimPrefix(auth, "Bearer ")
		if !strings.HasPrefix(tok, "fake-access-token-") {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		uid := strings.TrimPrefix(tok, "fake-access-token-")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id": uid,
		})
	})

	// 4. REST endpoints delegados a mem
	fakeMux.HandleFunc("/rest/v1/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode([]any{})
	})

	server := httptest.NewServer(fakeMux)
	return server, mem
}

func TestAuthRegistroYLogin(t *testing.T) {
	fakeSupa, memStore := configurarFakeSupabaseServer(t)
	defer fakeSupa.Close()

	adminEmails := []string{"admin@rconcept.com"}
	sc := supa.New(fakeSupa.URL, "fake-service-key", "fake-anon-key")
	authVerifier := supa.NewSupabaseAuthVerifier(sc, memStore, adminEmails)

	// API con ModoDemoActivo = false (producción con Supabase)
	api := httpapi.NewAPI(memStore, authVerifier, false)
	routes := api.Routes()

	// 1. Registro: contraseña corta rechazada
	{
		body := `{"nombre":"Carlos","correo":"carlos@rconcept.com","contrasena":"corta","confirmar":"corta"}`
		req := httptest.NewRequest("POST", "/api/auth/registro", bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		routes.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("esperaba 400 por contraseña corta, obtuve %d", w.Code)
		}
	}

	// 2. Registro válido
	{
		body := `{"nombre":"Carlos Perez","correo":"carlos@rconcept.com","contrasena":"password12345","confirmar":"password12345"}`
		req := httptest.NewRequest("POST", "/api/auth/registro", bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		routes.ServeHTTP(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("esperaba 201 por registro exitoso, obtuve %d: %s", w.Code, w.Body.String())
		}
		var p store.Perfil
		_ = json.Unmarshal(w.Body.Bytes(), &p)
		if p.Estado != store.EstadoPendiente {
			t.Errorf("usuario nuevo debe nacer pendiente, dio: %s", p.Estado)
		}
	}

	// 3. Registro duplicado devuelve respuesta neutra 200 sin error
	{
		body := `{"nombre":"Carlos Perez","correo":"carlos@rconcept.com","contrasena":"password12345","confirmar":"password12345"}`
		req := httptest.NewRequest("POST", "/api/auth/registro", bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		routes.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("esperaba 200 neutro por correo repetido, obtuve %d", w.Code)
		}
	}

	// 4. Registro de correo en ADMIN_EMAILS queda admin y aprobado inmediatamente
	{
		body := `{"nombre":"Super Admin","correo":"admin@rconcept.com","contrasena":"password12345","confirmar":"password12345"}`
		req := httptest.NewRequest("POST", "/api/auth/registro", bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		routes.ServeHTTP(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("esperaba 201 por registro admin, obtuve %d: %s", w.Code, w.Body.String())
		}
		var p store.Perfil
		_ = json.Unmarshal(w.Body.Bytes(), &p)
		if p.Estado != store.EstadoAprobado || !p.EsAdmin {
			t.Errorf("correo en ADMIN_EMAILS debe quedar aprobado y admin, dio: %+v", p)
		}
	}

	// 5. Login con contraseña incorrecta falla
	{
		body := `{"correo":"carlos@rconcept.com","contrasena":"erronea12345"}`
		req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		routes.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("esperaba 401 por contraseña errónea, obtuve %d", w.Code)
		}
	}

	// 6. Login correcto entrega cookies httpOnly
	var accessTokenCookie string
	var refreshTokenCookie string
	{
		body := `{"correo":"carlos@rconcept.com","contrasena":"password12345"}`
		req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		routes.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("esperaba 200 por login correcto, obtuve %d: %s", w.Code, w.Body.String())
		}

		cookies := w.Result().Cookies()
		for _, c := range cookies {
			if c.Name == "rc_access_token" {
				accessTokenCookie = c.Value
				if !c.HttpOnly {
					t.Errorf("rc_access_token debe ser httpOnly")
				}
			}
			if c.Name == "rc_refresh_token" {
				refreshTokenCookie = c.Value
				if !c.HttpOnly {
					t.Errorf("rc_refresh_token debe ser httpOnly")
				}
			}
		}
		if accessTokenCookie == "" || refreshTokenCookie == "" {
			t.Errorf("no se enviaron las cookies de sesión esperadas")
		}
	}

	// 7. Usuario pendiente entra a /api/yo con su cookie, pero NO al chat
	{
		reqYo := httptest.NewRequest("GET", "/api/yo", nil)
		reqYo.AddCookie(&http.Cookie{Name: "rc_access_token", Value: accessTokenCookie})
		wYo := httptest.NewRecorder()
		routes.ServeHTTP(wYo, reqYo)
		if wYo.Code != http.StatusOK {
			t.Errorf("pendiente debe poder ver /api/yo, obtuve %d", wYo.Code)
		}

		reqChat := httptest.NewRequest("GET", "/api/chat", nil)
		reqChat.AddCookie(&http.Cookie{Name: "rc_access_token", Value: accessTokenCookie})
		wChat := httptest.NewRecorder()
		routes.ServeHTTP(wChat, reqChat)
		if wChat.Code != http.StatusForbidden {
			t.Errorf("pendiente NO debe poder entrar al chat, obtuve %d", wChat.Code)
		}
	}

	// 8. Modo demo DESACTIVADO: una cabecera X-Demo-User NO autentica
	{
		reqDemo := httptest.NewRequest("GET", "/api/yo", nil)
		reqDemo.Header.Set("X-Demo-User", "admin-1")
		wDemo := httptest.NewRecorder()
		routes.ServeHTTP(wDemo, reqDemo)
		if wDemo.Code != http.StatusUnauthorized {
			t.Errorf("con ModoDemoActivo=false, X-Demo-User DEBE ser ignorado y dar 401, obtuve %d", wDemo.Code)
		}
	}

	// 9. Token caducado se refresca automáticamente usando rc_refresh_token
	{
		reqRef := httptest.NewRequest("GET", "/api/yo", nil)
		reqRef.AddCookie(&http.Cookie{Name: "rc_access_token", Value: "token-caducado-o-invalido"})
		reqRef.AddCookie(&http.Cookie{Name: "rc_refresh_token", Value: refreshTokenCookie})
		wRef := httptest.NewRecorder()
		routes.ServeHTTP(wRef, reqRef)
		if wRef.Code != http.StatusOK {
			t.Errorf("debió refrescar la sesión caducada vía cookie refresh, obtuve %d: %s", wRef.Code, wRef.Body.String())
		}
	}

	// 10. Cerrar sesión (/api/auth/salir) borra las cookies
	{
		reqSalir := httptest.NewRequest("POST", "/api/auth/salir", nil)
		wSalir := httptest.NewRecorder()
		routes.ServeHTTP(wSalir, reqSalir)
		if wSalir.Code != http.StatusOK {
			t.Errorf("esperaba 200 en salir, obtuve %d", wSalir.Code)
		}
		for _, c := range wSalir.Result().Cookies() {
			if (c.Name == "rc_access_token" || c.Name == "rc_refresh_token") && c.MaxAge >= 0 {
				t.Errorf("cookie %s no fue eliminada (MaxAge = %d)", c.Name, c.MaxAge)
			}
		}
	}
}

func TestChatDespuesParam(t *testing.T) {
	api, s := configurarTestAPI()
	routes := api.Routes()

	ctx := context.Background()
	_ = s.CrearOActualizarPerfil(ctx, &store.Perfil{
		ID:      "cam-chat",
		Correo:  "cam@rconcept.com",
		Nombre:  "Camarografo Chat",
		Estado:  store.EstadoAprobado,
		EsAdmin: false,
	})

	m1, _ := s.CrearMensajeChat(ctx, "cam-chat", "Msg 1")
	m2, _ := s.CrearMensajeChat(ctx, "cam-chat", "Msg 2")
	m3, _ := s.CrearMensajeChat(ctx, "cam-chat", "Msg 3")

	// Consultar con despues={m1.ID}
	req := httptest.NewRequest("GET", "/api/chat?despues="+strings.TrimSpace(string(rune('0'+m1.ID))), nil)
	req.Header.Set("Authorization", "Bearer cam-chat")
	w := httptest.NewRecorder()
	routes.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("esperaba 200, obtuve %d", w.Code)
	}

	var res []*store.ChatMensaje
	_ = json.Unmarshal(w.Body.Bytes(), &res)

	// Deben venir m2 y m3
	if len(res) < 2 {
		t.Errorf("esperaba al menos 2 mensajes después del id %d, obtuve %d", m1.ID, len(res))
	}
	if len(res) >= 2 && (res[0].ID != m2.ID || res[1].ID != m3.ID) {
		t.Errorf("orden o ids incorrectos en polling despues: %+v", res)
	}
}

// Sin cookie de acceso (el navegador la descarta al vencer) pero con cookie de refresco, la sesión se renueva sola.
func TestMiddlewareRenuevaSesionSoloConCookieDeRefresco(t *testing.T) {
	perfil := &store.Perfil{ID: "u1", Correo: "a@b.co", Nombre: "A", Estado: store.EstadoAprobado}
	api, _ := configurarTestAPI()
	api.Auth = &verificadorRefresco{perfil: perfil}

	llamado := false
	h := api.MiddlewareAuth(func(w http.ResponseWriter, r *http.Request) {
		llamado = true
		w.WriteHeader(http.StatusOK)
	}, true, false)

	req := httptest.NewRequest("GET", "/api/yo", nil)
	req.AddCookie(&http.Cookie{Name: "rc_refresh_token", Value: "viejo-refresh"})
	rr := httptest.NewRecorder()
	h(rr, req)

	if rr.Code != http.StatusOK || !llamado {
		t.Fatalf("esperaba 200 tras renovar la sesión, obtuve %d", rr.Code)
	}
	var cookieAcceso, cookieRefresco bool
	for _, c := range rr.Result().Cookies() {
		if c.Name == "rc_access_token" && c.Value == "nuevo-token" {
			cookieAcceso = true
		}
		if c.Name == "rc_refresh_token" && c.Value == "nuevo-refresh" && c.MaxAge >= 90*24*3600 {
			cookieRefresco = true
		}
	}
	if !cookieAcceso || !cookieRefresco {
		t.Fatalf("faltan las cookies renovadas (acceso=%v, refresco=%v)", cookieAcceso, cookieRefresco)
	}

	// Sin ninguna cookie: 401
	rr2 := httptest.NewRecorder()
	h(rr2, httptest.NewRequest("GET", "/api/yo", nil))
	if rr2.Code != http.StatusUnauthorized {
		t.Fatalf("sin cookies esperaba 401, obtuve %d", rr2.Code)
	}
}

type verificadorRefresco struct{ perfil *store.Perfil }

func (v *verificadorRefresco) VerificarToken(ctx context.Context, token string) (*store.Perfil, error) {
	if token == "nuevo-token" {
		return v.perfil, nil
	}
	return nil, store.ErrUnauthorized
}
func (v *verificadorRefresco) RefrescarToken(ctx context.Context, refreshToken string) (*supa.TokenResponse, error) {
	if refreshToken == "viejo-refresh" {
		return &supa.TokenResponse{AccessToken: "nuevo-token", RefreshToken: "nuevo-refresh", ExpiresIn: 3600}, nil
	}
	return nil, store.ErrUnauthorized
}
func (v *verificadorRefresco) Login(ctx context.Context, email, password string) (*supa.TokenResponse, *store.Perfil, error) {
	return nil, nil, store.ErrUnauthorized
}
func (v *verificadorRefresco) Registro(ctx context.Context, email, password, nombre string) (*store.Perfil, error) {
	return nil, store.ErrUnauthorized
}
