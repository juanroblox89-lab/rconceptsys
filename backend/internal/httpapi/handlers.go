package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"rconceptsys/backend/internal/store"
)

type API struct {
	Store          store.Store
	Auth           AuthVerifier
	ChatLimiter    *RateLimiter
	AuthLimiter    *RateLimiter
	ModoDemoActivo bool
	F5             *EstadoF5
}

func NewAPI(s store.Store, auth AuthVerifier, modoDemoActivo bool) *API {
	return &API{
		Store:          s,
		Auth:           auth,
		ChatLimiter:    NewRateLimiter(20, time.Minute),   // 20 mensajes por minuto por usuario
		AuthLimiter:    NewRateLimiter(25, 5*time.Minute), // 25 intentos por 5 minutos por IP o correo
		ModoDemoActivo: modoDemoActivo,
		F5:             NuevoEstadoF5(),
	}
}

func (a *API) Routes() http.Handler {
	mux := http.NewServeMux()

	// Health check
	mux.HandleFunc("GET /healthz", a.handleHealthz)

	// Auth público
	mux.HandleFunc("POST /api/auth/registro", a.handleAuthRegistro)
	mux.HandleFunc("POST /api/auth/login", a.handleAuthLogin)
	mux.HandleFunc("POST /api/auth/refresh", a.handleAuthRefresh)
	mux.HandleFunc("POST /api/auth/salir", a.handleAuthSalir)

	// Yo (perfil propio, incluso si está pendiente)
	mux.HandleFunc("GET /api/yo/celular", a.MiddlewareAuth(a.handleCelular, false, false))
	mux.HandleFunc("PUT /api/yo/celular", a.MiddlewareAuth(a.handleCelular, false, false))
	mux.HandleFunc("GET /api/yo", a.MiddlewareAuth(a.handleGetYo, false, false))
	mux.HandleFunc("PATCH /api/yo", a.MiddlewareAuth(a.handlePatchYo, false, false))
	mux.HandleFunc("POST /api/yo/foto", a.MiddlewareAuth(a.handlePostYoFoto, false, false))

	// Equipo (solo aprobados)
	mux.HandleFunc("GET /api/equipo", a.MiddlewareAuth(a.handleGetEquipo, true, false))
	mux.HandleFunc("GET /api/equipo/{id}", a.MiddlewareAuth(a.handleGetEquipoDetalle, true, false))

	// Chat (solo aprobados)
	mux.HandleFunc("GET /api/chat", a.MiddlewareAuth(a.handleGetChat, true, false))
	mux.HandleFunc("POST /api/chat", a.MiddlewareAuth(a.handlePostChat, true, false))

	// Admin (solo es_admin)
	mux.HandleFunc("GET /api/admin/miembros", a.MiddlewareAuth(a.handleAdminGetMiembros, true, true))
	mux.HandleFunc("POST /api/admin/miembros/{id}/aprobar", a.MiddlewareAuth(a.handleAdminAprobarMiembro, true, true))
	mux.HandleFunc("POST /api/admin/miembros/{id}/suspender", a.MiddlewareAuth(a.handleAdminSuspenderMiembro, true, true))
	mux.HandleFunc("POST /api/admin/miembros/{id}/reactivar", a.MiddlewareAuth(a.handleAdminReactivarMiembro, true, true))
	mux.HandleFunc("PUT /api/admin/miembros/{id}/roles", a.MiddlewareAuth(a.handleAdminPutRoles, true, true))
	mux.HandleFunc("PUT /api/admin/miembros/{id}/admin", a.MiddlewareAuth(a.handleAdminPutAdmin, true, true))

	mux.HandleFunc("GET /api/admin/roles", a.MiddlewareAuth(a.handleAdminGetRoles, true, true))
	mux.HandleFunc("POST /api/admin/roles", a.MiddlewareAuth(a.handleAdminPostRol, true, true))
	mux.HandleFunc("PATCH /api/admin/roles/{id}", a.MiddlewareAuth(a.handleAdminPatchRol, true, true))

	// F2: Miembros aprobados (Trabajos, Tareas y Factura propia)
	mux.HandleFunc("GET /api/trabajos", a.MiddlewareAuth(a.handleGetTrabajos, true, false))
	mux.HandleFunc("GET /api/tareas", a.MiddlewareAuth(a.handleGetTareas, true, false))
	mux.HandleFunc("POST /api/tareas/{id}/hecha", a.MiddlewareAuth(a.handlePostTareaHecha, true, false))
	mux.HandleFunc("GET /api/facturas/mia", a.MiddlewareAuth(a.handleGetFacturaMia, true, false))

	// F3: Miembros aprobados (Clientes y Mis Estadísticas)
	mux.HandleFunc("GET /api/clientes", a.MiddlewareAuth(a.handleGetClientes, true, false))
	mux.HandleFunc("GET /api/clientes/{id}", a.MiddlewareAuth(a.handleGetFichaCliente, true, false))
	mux.HandleFunc("GET /api/clientes/{id}/foto/{archivo}", a.MiddlewareAuth(a.handleGetClienteFoto, true, false))
	mux.HandleFunc("GET /api/yo/estadisticas", a.MiddlewareAuth(a.handleGetYoEstadisticas, true, false))

	// F2: Solo Admin (Trabajos, Tareas y Facturas)
	mux.HandleFunc("GET /api/admin/trabajos", a.MiddlewareAuth(a.handleAdminGetTrabajos, true, true))
	mux.HandleFunc("POST /api/admin/trabajos", a.MiddlewareAuth(a.handleAdminPostTrabajo, true, true))
	mux.HandleFunc("PATCH /api/admin/trabajos/{id}", a.MiddlewareAuth(a.handleAdminPatchTrabajo, true, true))

	// F3: Solo Admin (Clientes y Estadísticas globales)
	mux.HandleFunc("GET /api/admin/clientes", a.MiddlewareAuth(a.handleAdminGetClientes, true, true))
	mux.HandleFunc("POST /api/admin/clientes", a.MiddlewareAuth(a.handleAdminPostCliente, true, true))
	mux.HandleFunc("GET /api/admin/clientes/{id}", a.MiddlewareAuth(a.handleGetFichaCliente, true, true))
	mux.HandleFunc("POST /api/admin/clientes/{id}/foto", a.MiddlewareAuth(a.handleAdminPostClienteFoto, true, true))
	mux.HandleFunc("GET /api/admin/clientes/{id}/foto/{archivo}", a.MiddlewareAuth(a.handleGetClienteFoto, true, true))
	mux.HandleFunc("GET /api/admin/drive/picker-token", a.MiddlewareAuth(a.handleAdminDrivePickerToken, true, true))
	mux.HandleFunc("PATCH /api/admin/clientes/{id}", a.MiddlewareAuth(a.handleAdminPatchCliente, true, true))
	mux.HandleFunc("GET /api/admin/estadisticas", a.MiddlewareAuth(a.handleAdminGetEstadisticas, true, true))

	mux.HandleFunc("GET /api/admin/tareas", a.MiddlewareAuth(a.handleAdminGetTareas, true, true))
	mux.HandleFunc("POST /api/admin/tareas", a.MiddlewareAuth(a.handleAdminPostTarea, true, true))
	mux.HandleFunc("POST /api/admin/tareas/{id}/aceptar", a.MiddlewareAuth(a.handleAdminPostTareaAceptar, true, true))
	mux.HandleFunc("POST /api/admin/tareas/{id}/rechazar", a.MiddlewareAuth(a.handleAdminPostTareaRechazar, true, true))
	mux.HandleFunc("POST /api/admin/tareas/{id}/cancelar", a.MiddlewareAuth(a.handleAdminPostTareaCancelar, true, true))

	mux.HandleFunc("GET /api/admin/facturas", a.MiddlewareAuth(a.handleAdminGetFacturas, true, true))
	mux.HandleFunc("GET /api/admin/facturas/{id}", a.MiddlewareAuth(a.handleAdminGetFacturaDetalle, true, true))
	mux.HandleFunc("POST /api/admin/facturas/{id}/pagar", a.MiddlewareAuth(a.handleAdminPostFacturaPagar, true, true))

	// F5: barra derecha "Equipo" y su edición en Gestión
	mux.HandleFunc("GET /api/equipo/resumen", a.MiddlewareAuth(a.handleGetEquipoResumen, true, false))
	mux.HandleFunc("PATCH /api/admin/equipo", a.MiddlewareAuth(a.handleAdminPatchEquipo, true, true))
	mux.HandleFunc("POST /api/admin/equipo/enlaces", a.MiddlewareAuth(a.handleAdminPostEnlaceEquipo, true, true))
	mux.HandleFunc("PATCH /api/admin/equipo/enlaces/{id}", a.MiddlewareAuth(a.handleAdminPatchEnlaceEquipo, true, true))
	mux.HandleFunc("DELETE /api/admin/equipo/enlaces/{id}", a.MiddlewareAuth(a.handleAdminDeleteEnlaceEquipo, true, true))

	// F5: adjuntos del chat (imágenes, video, archivos y audios)
	mux.HandleFunc("POST /api/chat/adjuntos", a.MiddlewareAuth(a.handlePostChatAdjunto, true, false))
	mux.HandleFunc("GET /api/chat/adjuntos/{id}/archivo", a.MiddlewareAuth(a.handleGetChatAdjuntoArchivo, true, false))

	// F5: Recientes y página de Asignaciones (solo admin)
	mux.HandleFunc("GET /api/admin/asignaciones", a.MiddlewareAuth(a.handleAdminGetAsignaciones, true, true))
	mux.HandleFunc("GET /api/admin/asignaciones/recientes", a.MiddlewareAuth(a.handleAdminGetAsignacionesRecientes, true, true))
	mux.HandleFunc("POST /api/admin/asignaciones/vistas", a.MiddlewareAuth(a.handleAdminPostAsignacionesVistas, true, true))

	// F5: conector de Google Drive (el callback llega de Google sin sesión: valida el state)
	mux.HandleFunc("GET /api/admin/drive", a.MiddlewareAuth(a.handleAdminGetDrive, true, true))
	mux.HandleFunc("POST /api/admin/drive/conectar", a.MiddlewareAuth(a.handleAdminPostDriveConectar, true, true))
	mux.HandleFunc("GET /api/drive/callback", a.handleDriveCallback)
	mux.HandleFunc("POST /api/admin/drive/desconectar", a.MiddlewareAuth(a.handleAdminPostDriveDesconectar, true, true))
	mux.HandleFunc("POST /api/admin/drive/organizar", a.MiddlewareAuth(a.handleAdminOrganizarDrive, true, true))
	mux.HandleFunc("POST /api/admin/drive/migrar-carpetas", a.MiddlewareAuth(a.handleAdminMigrarCarpetasDrive, true, true))
	mux.HandleFunc("GET /api/admin/drive/archivos", a.MiddlewareAuth(a.handleAdminGetDriveArchivos, true, true))
	mux.HandleFunc("POST /api/admin/tareas/{id}/drive-carpeta", a.MiddlewareAuth(a.handleAdminPostTareaDriveCarpeta, true, true))

	mux.HandleFunc("GET /api/admin/tareas/{id}", a.MiddlewareAuth(a.handleAdminGetTarea, true, true))
	mux.HandleFunc("PATCH /api/admin/tareas/{id}", a.MiddlewareAuth(a.handleAdminPatchTarea, true, true))
	mux.HandleFunc("POST /api/admin/clientes/{id}/drive", a.MiddlewareAuth(a.handleAdminClienteDrive, true, true))

	// F5: piezas que agrupan tareas por etapa
	mux.HandleFunc("GET /api/admin/piezas", a.MiddlewareAuth(a.handleAdminGetPiezas, true, true))
	mux.HandleFunc("POST /api/admin/piezas", a.MiddlewareAuth(a.handleAdminPostPieza, true, true))
	mux.HandleFunc("PATCH /api/admin/piezas/{id}", a.MiddlewareAuth(a.handleAdminPatchPieza, true, true))

	// F5: corte de pagos (quincena o mes) con exportación
	mux.HandleFunc("GET /api/admin/cortes", a.MiddlewareAuth(a.handleAdminGetCortes, true, true))
	mux.HandleFunc("POST /api/admin/cortes", a.MiddlewareAuth(a.handleAdminPostCorte, true, true))
	mux.HandleFunc("GET /api/admin/cortes/{id}", a.MiddlewareAuth(a.handleAdminGetCorte, true, true))
	mux.HandleFunc("POST /api/admin/cortes/{id}/lineas/{perfil}/pagar", a.MiddlewareAuth(a.handleAdminPostCortePagar, true, true))
	mux.HandleFunc("GET /api/admin/cortes/{id}/csv", a.MiddlewareAuth(a.handleAdminGetCorteCSV, true, true))
	mux.HandleFunc("GET /api/admin/cortes/{id}/pdf", a.MiddlewareAuth(a.handleAdminGetCortePDF, true, true))

	// F5: avisos push
	mux.HandleFunc("GET /api/push/clave", a.MiddlewareAuth(a.handleGetPushClave, true, false))
	mux.HandleFunc("GET /api/push/estado", a.MiddlewareAuth(a.handleGetPushEstado, true, false))
	mux.HandleFunc("POST /api/push/suscribir", a.MiddlewareAuth(a.handlePostPushSuscribir, true, false))
	mux.HandleFunc("DELETE /api/push/suscribir", a.MiddlewareAuth(a.handleDeletePushSuscribir, true, false))

	mux.HandleFunc("GET /api/yo/apariencia", a.MiddlewareAuth(a.handleApariencia, true, false))
	mux.HandleFunc("PUT /api/yo/apariencia", a.MiddlewareAuth(a.handleApariencia, true, false))
	mux.HandleFunc("POST /api/yo/apariencia/fondo", a.MiddlewareAuth(a.handleFondoApariencia, true, false))
	mux.HandleFunc("GET /api/yo/apariencia/fondo/{archivo}", a.MiddlewareAuth(a.handleMedioApariencia, true, false))
	mux.HandleFunc("GET /api/ria", a.MiddlewareAuth(a.handleHistorialRIA, true, false))
	mux.HandleFunc("POST /api/ria", a.MiddlewareAuth(a.handleRIA, true, false))
	mux.HandleFunc("GET /api/cortes/{id}/mio", a.MiddlewareAuth(a.handleCortePropio, true, false))
	mux.HandleFunc("GET /api/notificaciones", a.MiddlewareAuth(a.handleNotificaciones, true, false))
	mux.HandleFunc("POST /api/notificaciones/leidas", a.MiddlewareAuth(a.handleLeerNotificaciones, true, false))
	mux.HandleFunc("POST /api/notificaciones/{id}/leida", a.MiddlewareAuth(a.handleLeerNotificaciones, true, false))
	mux.HandleFunc("GET /api/notificaciones/preferencias", a.MiddlewareAuth(a.handlePreferenciasNotificaciones, true, false))
	mux.HandleFunc("PUT /api/notificaciones/preferencias", a.MiddlewareAuth(a.handlePreferenciasNotificaciones, true, false))
	mux.HandleFunc("GET /api/cron/notificaciones", a.handleCronNotificaciones)

	return a.corsMiddleware(mux)
}

func (a *API) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Demo-User")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *API) getClientIP(r *http.Request) string {
	xf := r.Header.Get("X-Forwarded-For")
	if xf != "" {
		parts := strings.Split(xf, ",")
		return strings.TrimSpace(parts[0])
	}
	ip := r.RemoteAddr
	if colon := strings.LastIndex(ip, ":"); colon != -1 {
		return ip[:colon]
	}
	return ip
}

func (a *API) setAuthCookies(w http.ResponseWriter, r *http.Request, accessToken, refreshToken string, expiresIn int) {
	isSecure := r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
	if expiresIn <= 0 {
		expiresIn = 3600
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "rc_access_token",
		Value:    accessToken,
		Path:     "/",
		MaxAge:   expiresIn,
		HttpOnly: true,
		Secure:   isSecure,
		SameSite: http.SameSiteLaxMode,
	})

	if refreshToken != "" {
		http.SetCookie(w, &http.Cookie{
			Name:     "rc_refresh_token",
			Value:    refreshToken,
			Path:     "/",
			MaxAge:   180 * 24 * 3600, // 180 días: la sesión se recuerda y se renueva en cada refresco
			HttpOnly: true,
			Secure:   isSecure,
			SameSite: http.SameSiteLaxMode,
		})
	}
}

func (a *API) clearAuthCookies(w http.ResponseWriter, r *http.Request) {
	isSecure := r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
	http.SetCookie(w, &http.Cookie{
		Name:     "rc_access_token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   isSecure,
		SameSite: http.SameSiteLaxMode,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     "rc_refresh_token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   isSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (a *API) handleAuthRegistro(w http.ResponseWriter, r *http.Request) {
	ip := a.getClientIP(r)
	if !a.AuthLimiter.Permitir("ip:" + ip) {
		ResponderError(w, http.StatusTooManyRequests, "limite_intentos", "Demasiados intentos. Espera unos minutos antes de volver a intentar.")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1024*16)
	var req struct {
		Nombre     string `json:"nombre"`
		Correo     string `json:"correo"`
		Contrasena string `json:"contrasena"`
		Indicativo string `json:"indicativo"`
		Numero     string `json:"numero"`
		Confirmar  string `json:"confirmar"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "El formato de los datos no es válido.")
		return
	}

	nombre := strings.TrimSpace(req.Nombre)
	if len([]rune(nombre)) < 2 || len([]rune(nombre)) > 60 {
		ResponderError(w, http.StatusBadRequest, "nombre_invalido", "El nombre debe tener entre 2 y 60 caracteres.")
		return
	}

	correo := strings.ToLower(strings.TrimSpace(req.Correo))
	if !strings.Contains(correo, "@") || !strings.Contains(correo, ".") {
		ResponderError(w, http.StatusBadRequest, "correo_invalido", "Ingresa un correo electrónico válido.")
		return
	}

	if !a.AuthLimiter.Permitir("email:" + correo) {
		ResponderError(w, http.StatusTooManyRequests, "limite_intentos", "Demasiados intentos con este correo. Espera unos minutos.")
		return
	}

	if len(req.Contrasena) < 10 {
		ResponderError(w, http.StatusBadRequest, "contrasena_corta", "La contraseña debe tener al menos 10 caracteres.")
		return
	}

	if req.Confirmar != "" && req.Contrasena != req.Confirmar {
		ResponderError(w, http.StatusBadRequest, "contrasenas_no_coinciden", "Las contraseñas no coinciden.")
		return
	}

	celular := normalizarCelular(req.Indicativo, req.Numero)
	if celular == "" {
		ResponderError(w, 400, "celular_invalido", "Escribe un celular válido para el país seleccionado.")
		return
	}
	perfil, err := a.Auth.Registro(r.Context(), correo, req.Contrasena, nombre, celular)
	if err == store.ErrConflict {
		// Respuesta neutra si el correo ya existe
		ResponderJSON(w, http.StatusOK, map[string]string{
			"mensaje": "Si el correo no estaba registrado, tu cuenta ha sido creada y queda pendiente de aprobación.",
		})
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_registro", "No se pudo completar el registro. Intenta más tarde.")
		return
	}

	a.avisarSolicitud(r.Context(), perfil)
	ResponderJSON(w, http.StatusCreated, perfil)
}

func (a *API) handleAuthLogin(w http.ResponseWriter, r *http.Request) {
	ip := a.getClientIP(r)
	if !a.AuthLimiter.Permitir("ip:" + ip) {
		ResponderError(w, http.StatusTooManyRequests, "limite_intentos", "Demasiados intentos. Espera unos minutos antes de volver a intentar.")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1024*16)
	var req struct {
		Correo     string `json:"correo"`
		Contrasena string `json:"contrasena"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "El formato de los datos no es válido.")
		return
	}

	correo := strings.ToLower(strings.TrimSpace(req.Correo))
	if correo == "" || req.Contrasena == "" {
		ResponderError(w, http.StatusBadRequest, "credenciales_incompletas", "Ingresa tu correo y contraseña.")
		return
	}

	if !a.AuthLimiter.Permitir("email:" + correo) {
		ResponderError(w, http.StatusTooManyRequests, "limite_intentos", "Demasiados intentos con este correo. Espera unos minutos.")
		return
	}

	tok, perfil, err := a.Auth.Login(r.Context(), correo, req.Contrasena)
	if err != nil || tok == nil || perfil == nil {
		ResponderError(w, http.StatusUnauthorized, "credenciales_invalidas", "El correo o la contraseña no coinciden.")
		return
	}

	if perfil.Estado == store.EstadoSuspendido {
		ResponderError(w, http.StatusForbidden, "cuenta_suspendida", "Tu cuenta ha sido suspendida. Contacta a un administrador.")
		return
	}

	// Entregar cookies httpOnly seguras
	a.setAuthCookies(w, r, tok.AccessToken, tok.RefreshToken, tok.ExpiresIn)

	ResponderJSON(w, http.StatusOK, map[string]any{
		"perfil":       perfil,
		"access_token": tok.AccessToken,
	})
}

func (a *API) handleAuthRefresh(w http.ResponseWriter, r *http.Request) {
	var refreshToken string
	if c, err := r.Cookie("rc_refresh_token"); err == nil && c.Value != "" {
		refreshToken = c.Value
	}

	if refreshToken == "" {
		var req struct {
			RefreshToken string `json:"refresh_token"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		refreshToken = req.RefreshToken
	}

	if refreshToken == "" {
		ResponderError(w, http.StatusBadRequest, "sin_token_refresco", "No se proporcionó token de refresco.")
		return
	}

	tok, err := a.Auth.RefrescarToken(r.Context(), refreshToken)
	if err != nil || tok == nil {
		a.clearAuthCookies(w, r)
		ResponderError(w, http.StatusUnauthorized, "token_expirado", "La sesión no pudo renovarse. Inicia sesión nuevamente.")
		return
	}

	a.setAuthCookies(w, r, tok.AccessToken, tok.RefreshToken, tok.ExpiresIn)
	ResponderJSON(w, http.StatusOK, map[string]any{
		"access_token": tok.AccessToken,
		"expires_in":   tok.ExpiresIn,
	})
}

func (a *API) handleAuthSalir(w http.ResponseWriter, r *http.Request) {
	a.clearAuthCookies(w, r)
	ResponderJSON(w, http.StatusOK, map[string]string{"mensaje": "Sesión cerrada correctamente."})
}

func (a *API) handleHealthz(w http.ResponseWriter, r *http.Request) {
	ResponderJSON(w, http.StatusOK, map[string]string{"estado": "ok", "servicio": "rconceptsys-api"})
}

func (a *API) handleGetYo(w http.ResponseWriter, r *http.Request) {
	yo := UsuarioDesdeContexto(r.Context())
	if yo == nil {
		ResponderError(w, http.StatusUnauthorized, "no_autenticado", "No se encontró el usuario.")
		return
	}
	// Refrescar desde el store
	p, err := a.Store.ObtenerPerfilPorID(r.Context(), yo.ID)
	if err != nil {
		ResponderError(w, http.StatusNotFound, "perfil_no_encontrado", "No se encontró tu perfil de usuario.")
		return
	}
	ResponderJSON(w, http.StatusOK, p)
}

func (a *API) handlePatchYo(w http.ResponseWriter, r *http.Request) {
	yo := UsuarioDesdeContexto(r.Context())
	r.Body = http.MaxBytesReader(w, r.Body, 1024*16) // Máx 16KB

	var req struct {
		Nombre string `json:"nombre"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "El formato del cuerpo no es válido.")
		return
	}

	nombre := strings.TrimSpace(req.Nombre)
	caracteres := len([]rune(nombre))
	if caracteres < 2 || caracteres > 60 {
		ResponderError(w, http.StatusBadRequest, "nombre_invalido", "El nombre debe tener entre 2 y 60 caracteres.")
		return
	}

	p, err := a.Store.ActualizarNombre(r.Context(), yo.ID, nombre)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_actualizacion", "No se pudo actualizar el nombre.")
		return
	}
	ResponderJSON(w, http.StatusOK, p)
}

func (a *API) handlePostYoFoto(w http.ResponseWriter, r *http.Request) {
	yo := UsuarioDesdeContexto(r.Context())

	// Límite de 1MB para la foto
	err := r.ParseMultipartForm(1024 * 1024)
	if err != nil {
		ResponderError(w, http.StatusBadRequest, "tamano_excedido", "La imagen no debe superar 1 MB.")
		return
	}

	file, header, err := r.FormFile("foto")
	if err != nil {
		ResponderError(w, http.StatusBadRequest, "archivo_faltante", "Debes adjuntar un archivo en el campo 'foto'.")
		return
	}
	defer file.Close()

	if header.Size > 1024*1024 {
		ResponderError(w, http.StatusBadRequest, "tamano_excedido", "La imagen supera el límite de 1 MB.")
		return
	}

	// Leer los primeros 512 bytes para detectar el tipo real
	buffer := make([]byte, 512)
	n, err := file.Read(buffer)
	if err != nil && err != io.EOF {
		ResponderError(w, http.StatusBadRequest, "archivo_ilegible", "No se pudo leer el archivo de imagen.")
		return
	}

	contentType := http.DetectContentType(buffer[:n])
	if contentType != "image/jpeg" && contentType != "image/png" && contentType != "image/webp" {
		ResponderError(w, http.StatusBadRequest, "formato_invalido", "El formato de imagen debe ser JPEG, PNG o WebP.")
		return
	}

	// Volver al inicio y leer todo
	var totalData []byte
	totalData = append(totalData, buffer[:n]...)
	resto, err := io.ReadAll(file)
	if err != nil {
		ResponderError(w, http.StatusBadRequest, "error_lectura", "Error leyendo el archivo completo.")
		return
	}
	totalData = append(totalData, resto...)

	if len(totalData) > 1024*1024 {
		ResponderError(w, http.StatusBadRequest, "tamano_excedido", "La imagen supera el límite de 1 MB.")
		return
	}

	// Generar nombre aleatorio seguro uuid.webp
	randomBytes := make([]byte, 16)
	_, _ = rand.Read(randomBytes)
	fileName := fmt.Sprintf("%s.webp", hex.EncodeToString(randomBytes))

	urlPath, err := a.Store.GuardarAvatar(r.Context(), fileName, totalData, contentType)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_guardar_foto", "No se pudo guardar la foto de perfil.")
		return
	}

	p, err := a.Store.ActualizarFoto(r.Context(), yo.ID, urlPath)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_actualizar_perfil", "No se pudo vincular la foto al perfil.")
		return
	}

	ResponderJSON(w, http.StatusOK, p)
}

func (a *API) handleGetEquipo(w http.ResponseWriter, r *http.Request) {
	yo := UsuarioDesdeContexto(r.Context())
	equipo, err := a.Store.ListarEquipo(r.Context())
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_consulta", "No se pudo consultar el equipo.")
		return
	}

	// Regla de privacidad: solo el admin o el propio usuario ven su correo
	var seguro []*store.Perfil
	for _, m := range equipo {
		cp := *m
		if !yo.EsAdmin && yo.ID != m.ID {
			cp.Correo = ""
		}
		seguro = append(seguro, &cp)
	}

	ResponderJSON(w, http.StatusOK, seguro)
}

func (a *API) handleGetEquipoDetalle(w http.ResponseWriter, r *http.Request) {
	yo := UsuarioDesdeContexto(r.Context())
	id := r.PathValue("id")
	if id == "" {
		ResponderError(w, http.StatusBadRequest, "id_requerido", "Se requiere el ID del miembro.")
		return
	}

	miembro, err := a.Store.ObtenerMiembroEquipo(r.Context(), id)
	if err != nil {
		ResponderError(w, http.StatusNotFound, "miembro_no_encontrado", "No se encontró el perfil del miembro del equipo.")
		return
	}

	// Regla de privacidad: solo el admin o el propio usuario ven su correo
	cp := *miembro
	if !yo.EsAdmin && yo.ID != miembro.ID {
		cp.Correo = ""
	}

	ResponderJSON(w, http.StatusOK, &cp)
}

func (a *API) handleGetChat(w http.ResponseWriter, r *http.Request) {
	var antesID int64
	if s := r.URL.Query().Get("antes"); s != "" {
		antesID, _ = strconv.ParseInt(s, 10, 64)
	}

	var despuesID int64
	if s := r.URL.Query().Get("despues"); s != "" {
		despuesID, _ = strconv.ParseInt(s, 10, 64)
	}

	limite := 40
	if s := r.URL.Query().Get("limite"); s != "" {
		if l, err := strconv.Atoi(s); err == nil && l > 0 && l <= 100 {
			limite = l
		}
	}

	mensajes, err := a.Store.ListarMensajesChat(r.Context(), antesID, despuesID, limite)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_chat", "No se pudieron cargar los mensajes del chat.")
		return
	}
	ResponderJSON(w, http.StatusOK, mensajes)
}

func (a *API) handlePostChat(w http.ResponseWriter, r *http.Request) {
	yo := UsuarioDesdeContexto(r.Context())

	// Rate limit: 20 mensajes por minuto por usuario
	if !a.ChatLimiter.Permitir(yo.ID) {
		ResponderError(w, http.StatusTooManyRequests, "limite_mensajes", "Has enviado muchos mensajes seguidos. Espera un momento antes de enviar otro.")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1024*32) // 32KB
	var req struct {
		Cuerpo   string  `json:"cuerpo"`
		Adjuntos []int64 `json:"adjuntos"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "El formato del mensaje no es válido.")
		return
	}

	c := strings.TrimSpace(req.Cuerpo)
	long := len([]rune(c))
	if long > 2000 {
		ResponderError(w, http.StatusBadRequest, "mensaje_invalido", "El mensaje debe tener entre 1 y 2000 caracteres.")
		return
	}
	if long == 0 && len(req.Adjuntos) == 0 {
		ResponderError(w, http.StatusBadRequest, "mensaje_invalido", "Escribe un mensaje o adjunta un archivo.")
		return
	}
	if len(req.Adjuntos) > 10 {
		ResponderError(w, http.StatusBadRequest, "mensaje_invalido", "Puedes adjuntar máximo 10 archivos por mensaje.")
		return
	}

	msg, err := a.Store.CrearMensajeChat(r.Context(), yo.ID, c)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_crear_mensaje", "No se pudo enviar el mensaje al chat.")
		return
	}

	if len(req.Adjuntos) > 0 {
		adjuntos, errAdj := a.Store.EnlazarAdjuntosMensaje(r.Context(), msg.ID, yo.ID, req.Adjuntos)
		if errAdj == nil {
			msg.Adjuntos = adjuntos
		}
	}

	a.avisarChat(r.Context(), yo, msg)
	ResponderJSON(w, http.StatusCreated, msg)
}

func (a *API) handleAdminGetMiembros(w http.ResponseWriter, r *http.Request) {
	var filtro store.FiltroMiembros
	if estadoStr := r.URL.Query().Get("estado"); estadoStr != "" {
		est := store.EstadoPerfil(estadoStr)
		filtro.Estado = &est
	}

	miembros, err := a.Store.ListarMiembros(r.Context(), filtro)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_consulta", "No se pudo consultar la lista de miembros.")
		return
	}
	ResponderJSON(w, http.StatusOK, miembros)
}

func (a *API) handleAdminAprobarMiembro(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, err := a.Store.AprobarMiembro(r.Context(), id)
	if err != nil {
		ResponderError(w, http.StatusNotFound, "miembro_no_encontrado", "No se encontró el miembro para aprobar.")
		return
	}
	ResponderJSON(w, http.StatusOK, p)
}

func (a *API) handleAdminSuspenderMiembro(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	// Un admin que se suspende a sí mismo se queda fuera del sistema sin forma de volver.
	if yo := UsuarioDesdeContexto(r.Context()); yo != nil && yo.ID == id {
		ResponderError(w, http.StatusBadRequest, "auto_suspension", "No puedes suspender tu propia cuenta.")
		return
	}
	p, err := a.Store.SuspenderMiembro(r.Context(), id)
	if err != nil {
		ResponderError(w, http.StatusNotFound, "miembro_no_encontrado", "No se encontró el miembro para suspender.")
		return
	}
	ResponderJSON(w, http.StatusOK, p)
}

func (a *API) handleAdminReactivarMiembro(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, err := a.Store.ReactivarMiembro(r.Context(), id)
	if err != nil {
		ResponderError(w, http.StatusNotFound, "miembro_no_encontrado", "No se encontró el miembro para reactivar.")
		return
	}
	ResponderJSON(w, http.StatusOK, p)
}

func (a *API) handleAdminPutRoles(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	r.Body = http.MaxBytesReader(w, r.Body, 1024*16)

	var req struct {
		Roles []int `json:"roles"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "Lista de roles no válida.")
		return
	}

	p, err := a.Store.AsignarRolesMiembro(r.Context(), id, req.Roles)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_asignacion", "No se pudieron asignar los roles.")
		return
	}
	ResponderJSON(w, http.StatusOK, p)
}

func (a *API) handleAdminPutAdmin(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	r.Body = http.MaxBytesReader(w, r.Body, 1024*16)

	var req struct {
		EsAdmin bool `json:"es_admin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "Formato inválido.")
		return
	}

	p, err := a.Store.CambiarEsAdmin(r.Context(), id, req.EsAdmin)
	if err == store.ErrLastAdmin {
		ResponderError(w, http.StatusBadRequest, "ultimo_admin", "No puedes quitar permisos de administrador al último administrador del sistema.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_actualizacion", "No se pudo actualizar el estado de administrador.")
		return
	}
	ResponderJSON(w, http.StatusOK, p)
}

func (a *API) handleAdminGetRoles(w http.ResponseWriter, r *http.Request) {
	roles, err := a.Store.ListarRoles(r.Context(), false)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_consulta", "No se pudieron obtener los roles.")
		return
	}
	ResponderJSON(w, http.StatusOK, roles)
}

func (a *API) handleAdminPostRol(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1024*16)
	var rol store.Rol
	if err := json.NewDecoder(r.Body).Decode(&rol); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "Formato de rol inválido.")
		return
	}

	if strings.TrimSpace(rol.Clave) == "" || strings.TrimSpace(rol.Nombre) == "" {
		ResponderError(w, http.StatusBadRequest, "campos_requeridos", "El nombre y la clave del rol son obligatorios.")
		return
	}

	creado, err := a.Store.CrearRol(r.Context(), &rol)
	if err == store.ErrConflict {
		ResponderError(w, http.StatusConflict, "rol_duplicado", "Ya existe un rol con esa misma clave.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_crear_rol", "No se pudo crear el rol.")
		return
	}
	ResponderJSON(w, http.StatusCreated, creado)
}

func (a *API) handleAdminPatchRol(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		ResponderError(w, http.StatusBadRequest, "id_invalido", "ID de rol inválido.")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1024*16)
	var campos map[string]any
	if err := json.NewDecoder(r.Body).Decode(&campos); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "Formato inválido.")
		return
	}

	actualizado, err := a.Store.ActualizarRol(r.Context(), id, campos)
	if err == store.ErrNotFound {
		ResponderError(w, http.StatusNotFound, "rol_no_encontrado", "El rol especificado no existe.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_actualizar_rol", "No se pudo actualizar el rol.")
		return
	}
	ResponderJSON(w, http.StatusOK, actualizado)
}

// ==========================================
// F2: Handlers para Miembros Aprobados
// ==========================================

// GET /api/trabajos
func (a *API) handleGetTrabajos(w http.ResponseWriter, r *http.Request) {
	trabajos, err := a.Store.ListarTiposTrabajo(r.Context(), true)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_listar_trabajos", "No se pudieron obtener los tipos de trabajo.")
		return
	}
	if trabajos == nil {
		trabajos = []*store.TipoTrabajo{}
	}
	ResponderJSON(w, http.StatusOK, trabajos)
}

// GET /api/tareas?estado=
func (a *API) handleGetTareas(w http.ResponseWriter, r *http.Request) {
	yo := UsuarioDesdeContexto(r.Context())
	if yo == nil {
		ResponderError(w, http.StatusUnauthorized, "no_autenticado", "No se encontró el perfil autenticado.")
		return
	}

	filtro := store.FiltroTareas{
		AsignadoA: &yo.ID,
	}
	estadoQuery := strings.TrimSpace(r.URL.Query().Get("estado"))
	if estadoQuery != "" {
		st := store.EstadoTarea(normalizarEstadoTarea(estadoQuery))
		filtro.Estado = &st
	}

	tareas, err := a.Store.ListarTareas(r.Context(), filtro)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_listar_tareas", "No se pudieron obtener tus tareas.")
		return
	}
	if tareas == nil {
		tareas = []*store.Tarea{}
	}
	ResponderJSON(w, http.StatusOK, tareas)
}

// validarEnlaceDrive normaliza y valida un enlace de Google Drive. Devuelve
// (normalizado, ok). Vacío => (nil, true) permitido.
func validarEnlaceDrive(enlace *string) (*string, bool) {
	if enlace == nil {
		return nil, true
	}
	limpio := strings.TrimSpace(*enlace)
	if limpio == "" {
		return nil, true
	}
	if len(limpio) > 500 {
		return nil, false
	}
	u, err := url.Parse(limpio)
	if err != nil || u.Scheme != "https" {
		return nil, false
	}
	host := strings.ToLower(u.Hostname())
	switch host {
	case "drive.google.com", "docs.google.com", "drive.usercontent.google.com":
	default:
		return nil, false
	}
	return &limpio, true
}

// normalizarEstadoTarea mapea alias de estado de la URL al estado real.
func normalizarEstadoTarea(estado string) string {
	if estado == "por_revisar" {
		return "hecha"
	}
	return estado
}

// POST /api/tareas/{id}/hecha
func (a *API) handlePostTareaHecha(w http.ResponseWriter, r *http.Request) {
	yo := UsuarioDesdeContexto(r.Context())
	if yo == nil {
		ResponderError(w, http.StatusUnauthorized, "no_autenticado", "No se encontró el perfil autenticado.")
		return
	}

	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		ResponderError(w, http.StatusBadRequest, "id_invalido", "ID de tarea inválido.")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1024*16)
	var body struct {
		Nota         *string `json:"nota"`
		Cantidad     *int    `json:"cantidad"`
		EnlaceMedios *string `json:"enlace_medios"`
	}
	// El cuerpo es opcional
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && err != io.EOF {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "Formato de datos inválido.")
		return
	}

	enlacePtr, okEnlace := validarEnlaceDrive(body.EnlaceMedios)
	if !okEnlace {
		ResponderError(w, http.StatusBadRequest, "enlace_invalido", "El enlace debe ser una URL https de Google Drive (drive.google.com, docs.google.com o drive.usercontent.google.com) y tener máximo 500 caracteres.")
		return
	}

	tarea, err := a.Store.ObtenerTareaPorID(r.Context(), id)
	if err == store.ErrNotFound {
		ResponderError(w, http.StatusNotFound, "tarea_no_encontrada", "La tarea no existe.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_obtener_tarea", "No se pudo consultar la tarea.")
		return
	}

	if tarea.AsignadoA != yo.ID {
		ResponderError(w, http.StatusNotFound, "tarea_no_encontrada", "La tarea no existe.")
		return
	}

	if tarea.Estado != store.EstadoTareaPendiente && tarea.Estado != store.EstadoTareaRechazada {
		ResponderError(w, http.StatusBadRequest, "estado_invalido", "Solo puedes marcar como hecha una tarea pendiente o rechazada.")
		return
	}

	if tarea.Tipo != nil && tarea.Tipo.Unidad == "minuto" {
		if body.Cantidad == nil || *body.Cantidad < 1 || *body.Cantidad > 1440 {
			ResponderError(w, http.StatusBadRequest, "cantidad_invalida", "Los minutos grabados son obligatorios y deben estar entre 1 y 1440.")
			return
		}
	} else {
		body.Cantidad = nil
	}

	var notaPtr *string
	if body.Nota != nil {
		trimmed := strings.TrimSpace(*body.Nota)
		if len(trimmed) > 500 {
			ResponderError(w, http.StatusBadRequest, "nota_demasiado_larga", "La nota no puede tener más de 500 caracteres.")
			return
		}
		if trimmed != "" {
			notaPtr = &trimmed
		}
	}

	actualizada, err := a.Store.MarcarTareaHecha(r.Context(), id, yo.ID, notaPtr, body.Cantidad, enlacePtr)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_marcar_hecha", "No se pudo marcar la tarea como hecha.")
		return
	}

	// F5: si la tarea tiene subcarpeta en el Drive del equipo, la entrega se copia ahí.
	a.avisarEntregaAdmins(r.Context(), actualizada, yo.Nombre)
	a.SincronizarEntregaConDrive(r.Context(), actualizada)

	ResponderJSON(w, http.StatusOK, actualizada)
}

// GET /api/facturas/mia
func (a *API) handleGetFacturaMia(w http.ResponseWriter, r *http.Request) {
	yo := UsuarioDesdeContexto(r.Context())
	if yo == nil {
		ResponderError(w, http.StatusUnauthorized, "no_autenticado", "No se encontró el perfil autenticado.")
		return
	}

	facturas, err := a.Store.ListarFacturasPerfil(r.Context(), yo.ID)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_obtener_facturas", "No se pudieron obtener tus facturas.")
		return
	}

	var abierta *store.Factura
	var pagadas []*store.Factura
	var totalPagado int64 = 0
	var totalPendiente int64 = 0

	for _, f := range facturas {
		if f.Estado == store.EstadoFacturaAbierta {
			abierta = f
			totalPendiente = f.Total
		} else if f.Estado == store.EstadoFacturaPagada {
			pagadas = append(pagadas, f)
			totalPagado += f.Total
		}
	}

	if pagadas == nil {
		pagadas = []*store.Factura{}
	}

	respuesta := map[string]any{
		"abierta":         abierta,
		"total_pendiente": totalPendiente,
		"pagadas":         pagadas,
		"total_pagado":    totalPagado,
	}
	ResponderJSON(w, http.StatusOK, respuesta)
}

// ==========================================
// F2: Handlers Solo Admin
// ==========================================

// GET /api/admin/trabajos
func (a *API) handleAdminGetTrabajos(w http.ResponseWriter, r *http.Request) {
	trabajos, err := a.Store.ListarTiposTrabajo(r.Context(), false)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_listar_trabajos", "No se pudieron obtener los tipos de trabajo.")
		return
	}
	if trabajos == nil {
		trabajos = []*store.TipoTrabajo{}
	}
	ResponderJSON(w, http.StatusOK, trabajos)
}

// POST /api/admin/trabajos
func (a *API) handleAdminPostTrabajo(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1024*16)
	var req struct {
		Clave  string  `json:"clave"`
		Nombre string  `json:"nombre"`
		RolID  *int    `json:"rol_id"`
		Precio *int    `json:"precio"`
		Unidad *string `json:"unidad"`
		Activo *bool   `json:"activo"`
		Orden  *int    `json:"orden"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "Formato de datos inválido.")
		return
	}

	clave := strings.ToLower(strings.TrimSpace(req.Clave))
	nombre := strings.TrimSpace(req.Nombre)
	if clave == "" || nombre == "" {
		ResponderError(w, http.StatusBadRequest, "campos_requeridos", "El nombre y la clave del tipo de trabajo son obligatorios.")
		return
	}

	unidad := "trabajo"
	if req.Unidad != nil {
		u := strings.ToLower(strings.TrimSpace(*req.Unidad))
		if u != "trabajo" && u != "minuto" {
			ResponderError(w, http.StatusBadRequest, "unidad_invalida", "La unidad debe ser 'trabajo' o 'minuto'.")
			return
		}
		unidad = u
	}

	precio := 0
	if req.Precio != nil {
		precio = *req.Precio
	}
	if precio < 0 || precio > 100000000 {
		ResponderError(w, http.StatusBadRequest, "precio_invalido", "El precio debe ser un número entero entre 0 y 100.000.000 pesos.")
		return
	}

	activo := true
	if req.Activo != nil {
		activo = *req.Activo
	}

	orden := 0
	if req.Orden != nil {
		orden = *req.Orden
	}

	t := &store.TipoTrabajo{
		Clave:  clave,
		Nombre: nombre,
		RolID:  req.RolID,
		Precio: precio,
		Unidad: unidad,
		Activo: activo,
		Orden:  orden,
	}

	creado, err := a.Store.CrearTipoTrabajo(r.Context(), t)
	if err == store.ErrConflict {
		ResponderError(w, http.StatusConflict, "trabajo_duplicado", "Ya existe un trabajo con esa misma clave.")
		return
	}
	if err == store.ErrValidation {
		ResponderError(w, http.StatusBadRequest, "validacion_fallida", "Los datos enviados no son válidos (revisa el rol_id, la unidad o el precio).")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_crear_trabajo", "No se pudo crear el tipo de trabajo.")
		return
	}

	ResponderJSON(w, http.StatusCreated, creado)
}

// PATCH /api/admin/trabajos/{id}
func (a *API) handleAdminPatchTrabajo(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		ResponderError(w, http.StatusBadRequest, "id_invalido", "ID de tipo de trabajo inválido.")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1024*16)
	var campos map[string]any
	if err := json.NewDecoder(r.Body).Decode(&campos); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "Formato de datos inválido.")
		return
	}

	if uVal, exists := campos["unidad"]; exists {
		if s, ok := uVal.(string); ok {
			u := strings.ToLower(strings.TrimSpace(s))
			if u != "trabajo" && u != "minuto" {
				ResponderError(w, http.StatusBadRequest, "unidad_invalida", "La unidad debe ser 'trabajo' o 'minuto'.")
				return
			}
			campos["unidad"] = u
		} else {
			ResponderError(w, http.StatusBadRequest, "unidad_invalida", "La unidad debe ser 'trabajo' o 'minuto'.")
			return
		}
	}

	if p, exists := campos["precio"]; exists {
		switch n := p.(type) {
		case float64:
			if n < 0 || n > 100000000 || n != float64(int(n)) {
				ResponderError(w, http.StatusBadRequest, "precio_invalido", "El precio debe ser un número entero entre 0 y 100.000.000 pesos.")
				return
			}
		case int:
			if n < 0 || n > 100000000 {
				ResponderError(w, http.StatusBadRequest, "precio_invalido", "El precio debe ser un número entero entre 0 y 100.000.000 pesos.")
				return
			}
		default:
			ResponderError(w, http.StatusBadRequest, "precio_invalido", "El precio debe ser un valor numérico entero.")
			return
		}
	}

	actualizado, err := a.Store.ActualizarTipoTrabajo(r.Context(), id, campos)
	if err == store.ErrNotFound {
		ResponderError(w, http.StatusNotFound, "trabajo_no_encontrado", "El tipo de trabajo no existe.")
		return
	}
	if err == store.ErrValidation {
		ResponderError(w, http.StatusBadRequest, "validacion_fallida", "Uno de los campos a actualizar no es válido.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_actualizar_trabajo", "No se pudo actualizar el tipo de trabajo.")
		return
	}

	ResponderJSON(w, http.StatusOK, actualizado)
}

// GET /api/admin/tareas?estado=&persona=
func (a *API) handleAdminGetTareas(w http.ResponseWriter, r *http.Request) {
	filtro := store.FiltroTareas{}
	estadoQuery := strings.TrimSpace(r.URL.Query().Get("estado"))
	if estadoQuery != "" {
		st := store.EstadoTarea(normalizarEstadoTarea(estadoQuery))
		filtro.Estado = &st
	}
	personaQuery := strings.TrimSpace(r.URL.Query().Get("persona"))
	if personaQuery != "" {
		filtro.AsignadoA = &personaQuery
	}

	tareas, err := a.Store.ListarTareas(r.Context(), filtro)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_listar_tareas", "No se pudieron obtener las tareas.")
		return
	}
	if tareas == nil {
		tareas = []*store.Tarea{}
	}

	porRevisar, err := a.Store.ContarTareasPorRevisar(r.Context())
	if err != nil {
		porRevisar = 0
	}

	respuesta := map[string]any{
		"tareas":      tareas,
		"por_revisar": porRevisar,
	}
	ResponderJSON(w, http.StatusOK, respuesta)
}

// POST /api/admin/tareas
func (a *API) handleAdminPostTarea(w http.ResponseWriter, r *http.Request) {
	admin := UsuarioDesdeContexto(r.Context())
	if admin == nil {
		ResponderError(w, http.StatusUnauthorized, "no_autenticado", "No se encontró el perfil administrador.")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1024*32)
	var req struct {
		TipoID         int     `json:"tipo_id"`
		ClienteID      *int    `json:"cliente_id"`
		PiezaID        *int    `json:"pieza_id"`
		AsignadoA      string  `json:"asignado_a"`
		Titulo         string  `json:"titulo"`
		Descripcion    *string `json:"descripcion"`
		FechaLimite    *string `json:"fecha_limite"`
		Forzar         bool    `json:"forzar"`
		DriveCarpetaID string  `json:"drive_carpeta_id"`
		DriveCrear     string  `json:"drive_crear"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "Formato de datos inválido.")
		return
	}

	titulo := strings.TrimSpace(req.Titulo)
	if titulo == "" || len(titulo) > 120 {
		ResponderError(w, http.StatusBadRequest, "titulo_invalido", "El título es obligatorio y debe tener entre 1 y 120 caracteres.")
		return
	}
	if store.ContarLetrasDigitos(titulo) < 3 {
		ResponderError(w, http.StatusBadRequest, "aviso_invalido", "El aviso debe tener al menos 3 letras o números. Escribe un aviso más completo.")
		return
	}

	if req.Descripcion != nil && len(*req.Descripcion) > 1000 {
		ResponderError(w, http.StatusBadRequest, "descripcion_larga", "La descripción no puede superar los 1000 caracteres.")
		return
	}

	if req.TipoID <= 0 {
		ResponderError(w, http.StatusBadRequest, "tipo_requerido", "Debes especificar un tipo de trabajo válido.")
		return
	}

	tipo, err := a.Store.ObtenerTipoTrabajoPorID(r.Context(), req.TipoID)
	if err == store.ErrNotFound {
		ResponderError(w, http.StatusNotFound, "tipo_no_encontrado", "El tipo de trabajo especificado no existe.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_obtener_tipo", "Error al consultar el tipo de trabajo.")
		return
	}

	if req.FechaLimite == nil {
		ResponderError(w, 400, "fecha_requerida", "Selecciona una fecha de entrega.")
		return
	}
	if _, e := time.Parse("2006-01-02", *req.FechaLimite); e != nil {
		ResponderError(w, 400, "fecha_invalida", "Selecciona una fecha de entrega válida.")
		return
	}
	if req.ClienteID != nil {
		cli, err := a.Store.ObtenerClientePorID(r.Context(), *req.ClienteID)
		if err == store.ErrNotFound || (cli != nil && !cli.Activo) {
			ResponderError(w, http.StatusBadRequest, "cliente_invalido", "Ese cliente no existe o está inactivo.")
			return
		}
		if err != nil || cli == nil {
			ResponderError(w, http.StatusInternalServerError, "error_obtener_cliente", "No pudimos consultar el cliente.")
			return
		}
	}
	if !tipo.Activo {
		ResponderError(w, http.StatusBadRequest, "tipo_invalido", "Elige un tipo de trabajo activo.")
		return
	}

	// Pieza opcional: debe existir
	if req.PiezaID != nil {
		if _, err := a.Store.ObtenerPieza(r.Context(), *req.PiezaID); err == store.ErrNotFound {
			ResponderError(w, http.StatusBadRequest, "pieza_invalida", "La pieza especificada no existe.")
			return
		} else if err != nil {
			ResponderError(w, http.StatusInternalServerError, "error_obtener_pieza", "Error al consultar la pieza.")
			return
		}
	}

	asignadoID := strings.TrimSpace(req.AsignadoA)
	if asignadoID == "" {
		ResponderError(w, http.StatusBadRequest, "asignado_requerido", "Debes asignar la tarea a una persona.")
		return
	}

	asignado, err := a.Store.ObtenerPerfilPorID(r.Context(), asignadoID)
	if err == store.ErrNotFound {
		ResponderError(w, http.StatusNotFound, "asignado_no_encontrado", "La persona asignada no existe.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_obtener_asignado", "Error al consultar la persona asignada.")
		return
	}

	if asignado.Estado != store.EstadoAprobado {
		ResponderError(w, http.StatusBadRequest, "asignado_no_aprobado", "Solo puedes asignar tareas a miembros aprobados del equipo.")
		return
	}
	if asignado.EsAdmin {
		ResponderError(w, http.StatusBadRequest, "asignado_es_admin", "Los administradores no hacen trabajos: asigna la tarea a una persona del equipo.")
		return
	}

	// Validación de rol del tipo de trabajo
	if tipo.RolID != nil && !req.Forzar {
		tieneRol := false
		for _, rol := range asignado.Roles {
			if rol.ID == *tipo.RolID {
				tieneRol = true
				break
			}
		}
		if !tieneRol {
			nombreRol := "el rol correspondiente"
			if tipo.Rol != nil && tipo.Rol.Nombre != "" {
				nombreRol = tipo.Rol.Nombre
			}
			ResponderError(w, http.StatusUnprocessableEntity, "rol_no_coincide", fmt.Sprintf("La persona no tiene asignado %s para este trabajo. Usa forzar: true si deseas asignarla de todos modos.", nombreRol))
			return
		}
	}

	tarea := &store.Tarea{
		TipoID:      tipo.ID,
		Tipo:        tipo,
		ClienteID:   req.ClienteID,
		PiezaID:     req.PiezaID,
		Titulo:      titulo,
		Descripcion: req.Descripcion,
		AsignadoA:   asignado.ID,
		CreadoPor:   admin.ID,
		FechaLimite: req.FechaLimite,
	}

	if req.DriveCrear != "" && (strings.TrimSpace(req.DriveCrear) == "" || req.DriveCarpetaID != "" || len([]rune(req.DriveCrear)) > 80) {
		ResponderError(w, 400, "carpeta_invalida", "Elige una sola opción para la carpeta del trabajo.")
		return
	}
	if req.DriveCarpetaID != "" {
		if !driveIDValido(req.DriveCarpetaID) {
			ResponderError(w, 400, "carpeta_invalida", "Selecciona una carpeta válida.")
			return
		}
		if e := a.verificarCarpetaCliente(r.Context(), req.ClienteID, req.DriveCarpetaID); e != nil {
			ResponderError(w, 400, "carpeta_invalida", e.Error())
			return
		}
	}
	if req.DriveCarpetaID != "" {
		tarea.DriveCarpetaID = &req.DriveCarpetaID
		u := "https://drive.google.com/drive/folders/" + req.DriveCarpetaID
		tarea.DriveCarpetaURL = &u
	}
	creada, err := a.Store.CrearTarea(r.Context(), tarea)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_crear_tarea", "No se pudo crear la tarea.")
		return
	}

	if creada.DriveCarpetaID == nil {
		if carpeta, e := a.crearCarpetaDeTrabajo(r.Context(), creada); e == nil {
			if actualizada, e := a.Store.ActualizarCarpetaDriveTarea(r.Context(), creada.ID, carpeta.ID, carpeta.Enlace); e == nil {
				creada = actualizada
			} else {
				log.Printf("drive F8: no se guardó carpeta para tarea %d", creada.ID)
			}
		} else if e != errDriveDesconectado {
			log.Printf("drive F8: carpeta pendiente para tarea %d", creada.ID)
		}
	}
	// Aviso push: tarea nueva.
	a.AvisarTareaNueva(r.Context(), creada)

	ResponderJSON(w, http.StatusCreated, creada)
}

// POST /api/admin/tareas/{id}/aceptar
func (a *API) handleAdminPostTareaAceptar(w http.ResponseWriter, r *http.Request) {
	admin := UsuarioDesdeContexto(r.Context())
	if admin == nil {
		ResponderError(w, http.StatusUnauthorized, "no_autenticado", "No se encontró el perfil administrador.")
		return
	}

	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		ResponderError(w, http.StatusBadRequest, "id_invalido", "ID de tarea inválido.")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1024*16)
	var body struct {
		Cantidad *int `json:"cantidad"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && err != io.EOF {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "Formato de datos inválido.")
		return
	}

	if body.Cantidad != nil && (*body.Cantidad < 1 || *body.Cantidad > 1440) {
		ResponderError(w, http.StatusBadRequest, "cantidad_invalida", "Los minutos deben estar entre 1 y 1440.")
		return
	}

	tarea, err := a.Store.ObtenerTareaPorID(r.Context(), id)
	if err == store.ErrNotFound {
		ResponderError(w, http.StatusNotFound, "tarea_no_encontrada", "La tarea no existe.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_obtener_tarea", "Error al consultar la tarea.")
		return
	}

	if tarea.Estado != store.EstadoTareaHecha {
		ResponderError(w, http.StatusBadRequest, "estado_invalido", fmt.Sprintf("Solo se pueden aceptar tareas en estado 'hecha' (estado actual: %s).", tarea.Estado))
		return
	}

	aceptada, err := a.Store.AceptarTarea(r.Context(), id, admin.ID, body.Cantidad)
	if err != nil {
		if strings.Contains(err.Error(), "minutos") {
			ResponderError(w, http.StatusBadRequest, "cantidad_invalida", "Los minutos deben estar entre 1 y 1440.")
			return
		}
		ResponderError(w, http.StatusInternalServerError, "error_aceptar_tarea", "No se pudo aceptar la tarea.")
		return
	}

	// Aviso push: entrega aprobada.
	a.AvisarEntregaAprobada(r.Context(), aceptada)

	ResponderJSON(w, http.StatusOK, aceptada)
}

// POST /api/admin/tareas/{id}/rechazar
func (a *API) handleAdminPostTareaRechazar(w http.ResponseWriter, r *http.Request) {
	admin := UsuarioDesdeContexto(r.Context())
	if admin == nil {
		ResponderError(w, http.StatusUnauthorized, "no_autenticado", "No se encontró el perfil administrador.")
		return
	}

	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		ResponderError(w, http.StatusBadRequest, "id_invalido", "ID de tarea inválido.")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1024*16)
	var body struct {
		Motivo string `json:"motivo"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "Formato de datos inválido.")
		return
	}

	motivo := strings.TrimSpace(body.Motivo)
	if motivo == "" || len(motivo) > 500 {
		ResponderError(w, http.StatusBadRequest, "motivo_requerido", "Debes ingresar un motivo de rechazo (hasta 500 caracteres).")
		return
	}

	tarea, err := a.Store.ObtenerTareaPorID(r.Context(), id)
	if err == store.ErrNotFound {
		ResponderError(w, http.StatusNotFound, "tarea_no_encontrada", "La tarea no existe.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_obtener_tarea", "Error al consultar la tarea.")
		return
	}

	if tarea.Estado != store.EstadoTareaHecha {
		ResponderError(w, http.StatusBadRequest, "estado_invalido", fmt.Sprintf("Solo se pueden rechazar tareas en estado 'hecha' (estado actual: %s).", tarea.Estado))
		return
	}

	rechazada, err := a.Store.RechazarTarea(r.Context(), id, admin.ID, motivo)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_rechazar_tarea", "No se pudo rechazar la tarea.")
		return
	}

	a.avisar(r.Context(), rechazada.AsignadoA, AvisoPush{Titulo: "Te pidieron cambios", Cuerpo: recortar(motivo, 160), URL: urlTarea(id), Etiqueta: "entrega-devuelta"}, "")
	ResponderJSON(w, http.StatusOK, rechazada)
}

// POST /api/admin/tareas/{id}/cancelar
func (a *API) handleAdminPostTareaCancelar(w http.ResponseWriter, r *http.Request) {
	admin := UsuarioDesdeContexto(r.Context())
	if admin == nil {
		ResponderError(w, http.StatusUnauthorized, "no_autenticado", "No se encontró el perfil administrador.")
		return
	}

	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		ResponderError(w, http.StatusBadRequest, "id_invalido", "ID de tarea inválido.")
		return
	}

	tarea, err := a.Store.ObtenerTareaPorID(r.Context(), id)
	if err == store.ErrNotFound {
		ResponderError(w, http.StatusNotFound, "tarea_no_encontrada", "La tarea no existe.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_obtener_tarea", "Error al consultar la tarea.")
		return
	}

	if tarea.Estado != store.EstadoTareaPendiente && tarea.Estado != store.EstadoTareaRechazada {
		ResponderError(w, http.StatusBadRequest, "estado_invalido", fmt.Sprintf("Solo se pueden cancelar tareas en estado pendiente o rechazada (estado actual: %s).", tarea.Estado))
		return
	}

	cancelada, err := a.Store.CancelarTarea(r.Context(), id, admin.ID)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_cancelar_tarea", "No se pudo cancelar la tarea.")
		return
	}

	ResponderJSON(w, http.StatusOK, cancelada)
}

// GET /api/admin/facturas
func (a *API) handleAdminGetFacturas(w http.ResponseWriter, r *http.Request) {
	resumen, err := a.Store.ListarResumenFacturasAdmin(r.Context())
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_listar_facturas", "No se pudo obtener el resumen de facturas.")
		return
	}
	if resumen == nil {
		resumen = []*store.ResumenFacturasPersona{}
	}
	ResponderJSON(w, http.StatusOK, resumen)
}

// GET /api/admin/facturas/{id}
func (a *API) handleAdminGetFacturaDetalle(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		ResponderError(w, http.StatusBadRequest, "id_invalido", "ID de factura inválido.")
		return
	}

	factura, err := a.Store.ObtenerFacturaPorID(r.Context(), id)
	if err == store.ErrNotFound {
		ResponderError(w, http.StatusNotFound, "factura_no_encontrada", "La factura no existe.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_obtener_factura", "Error al consultar la factura.")
		return
	}

	ResponderJSON(w, http.StatusOK, factura)
}

// POST /api/admin/facturas/{id}/pagar
func (a *API) handleAdminPostFacturaPagar(w http.ResponseWriter, r *http.Request) {
	admin := UsuarioDesdeContexto(r.Context())
	if admin == nil {
		ResponderError(w, http.StatusUnauthorized, "no_autenticado", "No se encontró el perfil administrador.")
		return
	}

	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		ResponderError(w, http.StatusBadRequest, "id_invalido", "ID de factura inválido.")
		return
	}

	factura, err := a.Store.ObtenerFacturaPorID(r.Context(), id)
	if err == store.ErrNotFound {
		ResponderError(w, http.StatusNotFound, "factura_no_encontrada", "La factura no existe.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_obtener_factura", "Error al consultar la factura.")
		return
	}

	if factura.Estado != store.EstadoFacturaAbierta {
		ResponderError(w, http.StatusBadRequest, "factura_ya_pagada", "Esta factura ya fue pagada o no está abierta.")
		return
	}

	pagada, err := a.Store.MarcarFacturaPagada(r.Context(), id, admin.ID)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_pagar_factura", "No se pudo marcar la factura como pagada.")
		return
	}

	ResponderJSON(w, http.StatusOK, pagada)
}

// ==========================================
// F3: Handlers Clientes y Estadísticas
// ==========================================

// GET /api/clientes (miembros aprobados: solo activos)
func (a *API) handleGetClientes(w http.ResponseWriter, r *http.Request) {
	clientes, err := a.Store.ListarClientes(r.Context(), true)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_listar_clientes", "No se pudieron obtener los clientes.")
		return
	}
	if clientes == nil {
		clientes = []*store.Cliente{}
	}
	ResponderJSON(w, http.StatusOK, clientes)
}

// GET /api/admin/clientes (admin: todos)
func (a *API) handleAdminGetClientes(w http.ResponseWriter, r *http.Request) {
	clientes, err := a.Store.ListarClientes(r.Context(), false)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_listar_clientes", "No se pudieron obtener los clientes.")
		return
	}
	if clientes == nil {
		clientes = []*store.Cliente{}
	}
	ResponderJSON(w, http.StatusOK, clientes)
}

// POST /api/admin/clientes
func (a *API) handleAdminPostCliente(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1024*16)
	var req struct {
		Nombre string `json:"nombre"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "Formato de datos inválido.")
		return
	}

	nombre := strings.TrimSpace(req.Nombre)
	if len(nombre) < 1 || len(nombre) > 80 {
		ResponderError(w, http.StatusBadRequest, "nombre_invalido", "El nombre del cliente debe tener entre 1 y 80 caracteres.")
		return
	}

	creado, err := a.Store.CrearCliente(r.Context(), nombre)
	if err == store.ErrConflict || (err != nil && strings.Contains(strings.ToLower(err.Error()), "ya existe")) {
		ResponderError(w, http.StatusConflict, "cliente_duplicado", "Ya existe un cliente con ese nombre.")
		return
	}
	if err == store.ErrValidation {
		ResponderError(w, http.StatusBadRequest, "nombre_invalido", "El nombre del cliente debe tener entre 1 y 80 caracteres.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_crear_cliente", "No se pudo crear el cliente.")
		return
	}

	if actual, e := a.prepararAltaClienteDrive(r.Context(), creado); e == nil {
		creado = actual
	} else if e != errDriveDesconectado {
		log.Printf("drive F8: carpeta pendiente para cliente %d", creado.ID)
	}
	ResponderJSON(w, http.StatusCreated, creado)
}

// PATCH /api/admin/clientes/{id}
func (a *API) handleAdminPatchCliente(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		ResponderError(w, http.StatusBadRequest, "id_invalido", "ID de cliente inválido.")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1024*16)
	var campos map[string]any
	if err := json.NewDecoder(r.Body).Decode(&campos); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "Formato de datos inválido.")
		return
	}

	if nVal, exists := campos["nombre"]; exists {
		if s, ok := nVal.(string); ok {
			sLimpio := strings.TrimSpace(s)
			if len(sLimpio) < 1 || len(sLimpio) > 80 {
				ResponderError(w, http.StatusBadRequest, "nombre_invalido", "El nombre del cliente debe tener entre 1 y 80 caracteres.")
				return
			}
			campos["nombre"] = sLimpio
		} else {
			ResponderError(w, http.StatusBadRequest, "nombre_invalido", "El nombre del cliente debe ser un texto.")
			return
		}
	}

	if aVal, exists := campos["activo"]; exists {
		if _, ok := aVal.(bool); !ok {
			ResponderError(w, http.StatusBadRequest, "activo_invalido", "El campo activo debe ser un valor booleano.")
			return
		}
	}

	// F5: ficha del cliente (paquete, carpeta de Drive y notas)
	for _, clave := range []string{"paquete", "drive_url", "notas", "foto_url"} {
		if v, exists := campos[clave]; exists {
			if v == nil {
				continue
			}
			s, ok := v.(string)
			if !ok {
				ResponderError(w, http.StatusBadRequest, "campo_invalido", "El campo "+clave+" debe ser un texto.")
				return
			}
			s = strings.TrimSpace(s)
			limite := 80
			if clave == "drive_url" || clave == "foto_url" {
				limite = 500
				if s != "" && !strings.HasPrefix(s, "https://") {
					mensaje := "El enlace de la carpeta de Drive debe empezar por https://."
					if clave == "foto_url" {
						mensaje = "El enlace de la foto de perfil debe empezar por https://."
					}
					ResponderError(w, http.StatusBadRequest, "enlace_invalido", mensaje)
					return
				}
			}
			if clave == "notas" {
				limite = 1000
			}
			if len([]rune(s)) > limite {
				ResponderError(w, http.StatusBadRequest, "campo_largo", "El campo "+clave+" supera el máximo de caracteres.")
				return
			}
			campos[clave] = s
		}
	}

	for k := range campos {
		switch k {
		case "nombre", "activo", "paquete", "drive_url", "notas", "foto_url", "drive_referencia_id", "drive_referencias":
		default:
			ResponderError(w, 400, "campo_no_permitido", "Ese dato no se puede cambiar desde aquí.")
			return
		}
	}
	if v, ok := campos["foto_url"].(string); ok && v != "" {
		u, e := url.Parse(v)
		if e != nil || u.Scheme != "https" || u.Host == "" {
			ResponderError(w, 400, "foto_invalida", "La foto debe tener un enlace https válido.")
			return
		}
	}
	if v, ok := campos["drive_referencia_id"]; ok {
		if v == nil {
			campos["drive_referencia_nombre"], campos["drive_referencia_url"] = nil, nil
		} else if ref, tipoOK := v.(string); tipoOK {
			nombre, enlace, err := a.referenciaDriveCliente(r.Context(), ref)
			if err != nil {
				ResponderError(w, 422, "referencia_invalida", err.Error())
				return
			}
			campos["drive_referencia_nombre"], campos["drive_referencia_url"] = nombre, enlace
		} else {
			ResponderError(w, 400, "referencia_invalida", "Selecciona un archivo o carpeta de Drive.")
			return
		}
	}
	if v, ok := campos["drive_referencias"]; ok {
		crudos, tipoOK := v.([]any)
		if !tipoOK || len(crudos) > 10 {
			ResponderError(w, 400, "referencia_invalida", "Elige hasta 10 archivos o carpetas de Drive.")
			return
		}
		lista := make([]store.ReferenciaDrive, 0, len(crudos))
		vistos := map[string]bool{}
		for _, crudo := range crudos {
			ref, esTexto := crudo.(string)
			ref = strings.TrimSpace(ref)
			if !esTexto || ref == "" {
				ResponderError(w, 400, "referencia_invalida", "Selecciona un archivo o carpeta de Drive.")
				return
			}
			if vistos[ref] {
				continue
			}
			vistos[ref] = true
			nombre, enlace, err := a.referenciaDriveCliente(r.Context(), ref)
			if err != nil {
				ResponderError(w, 422, "referencia_invalida", err.Error())
				return
			}
			lista = append(lista, store.ReferenciaDrive{ID: ref, Nombre: nombre, URL: enlace})
		}
		campos["drive_referencias"] = lista
		// Columnas anteriores: reflejan la primera referencia para no romper lecturas viejas.
		if len(lista) == 0 {
			campos["drive_referencia_id"], campos["drive_referencia_nombre"], campos["drive_referencia_url"] = nil, nil, nil
		} else {
			campos["drive_referencia_id"], campos["drive_referencia_nombre"], campos["drive_referencia_url"] = lista[0].ID, lista[0].Nombre, lista[0].URL
		}
	}
	actualizado, err := a.Store.ActualizarCliente(r.Context(), id, campos)
	if err == store.ErrNotFound {
		ResponderError(w, http.StatusNotFound, "cliente_no_encontrado", "El cliente no existe.")
		return
	}
	if err == store.ErrConflict || (err != nil && strings.Contains(strings.ToLower(err.Error()), "ya existe")) {
		ResponderError(w, http.StatusConflict, "cliente_duplicado", "Ya existe un cliente con ese nombre.")
		return
	}
	if err == store.ErrValidation {
		ResponderError(w, http.StatusBadRequest, "nombre_invalido", "El nombre del cliente debe tener entre 1 y 80 caracteres.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_actualizar_cliente", "No se pudo actualizar el cliente.")
		return
	}

	ResponderJSON(w, http.StatusOK, actualizado)
}

// GET /api/yo/estadisticas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
func (a *API) handleGetYoEstadisticas(w http.ResponseWriter, r *http.Request) {
	yo := UsuarioDesdeContexto(r.Context())
	if yo == nil {
		ResponderError(w, http.StatusUnauthorized, "no_autenticado", "No se encontró el perfil autenticado.")
		return
	}

	filtro := store.FiltroEstadisticasYo{}
	desdeStr := strings.TrimSpace(r.URL.Query().Get("desde"))
	hastaStr := strings.TrimSpace(r.URL.Query().Get("hasta"))

	if desdeStr != "" || hastaStr != "" {
		if desdeStr == "" || hastaStr == "" {
			ResponderError(w, http.StatusBadRequest, "rango_invalido", "Debes especificar tanto 'desde' como 'hasta'.")
			return
		}
		tDesde, errD := time.ParseInLocation("2006-01-02", desdeStr, store.LocBogota)
		tHasta, errH := time.ParseInLocation("2006-01-02", hastaStr, store.LocBogota)
		if errD != nil || errH != nil {
			ResponderError(w, http.StatusBadRequest, "formato_fecha_invalido", "Las fechas deben tener el formato YYYY-MM-DD.")
			return
		}
		if tDesde.After(tHasta) {
			ResponderError(w, http.StatusBadRequest, "rango_invalido", "La fecha 'desde' no puede ser posterior a 'hasta'.")
			return
		}
		if tHasta.Sub(tDesde) > 5*366*24*time.Hour {
			ResponderError(w, http.StatusBadRequest, "rango_excedido", "El rango de fechas no puede superar los 5 años.")
			return
		}
		dInicio := store.InicioDiaBogota(tDesde)
		hFin := store.FinDiaBogota(tHasta)
		filtro.Desde = &dInicio
		filtro.Hasta = &hFin
	}

	stats, err := a.Store.ObtenerEstadisticasYo(r.Context(), yo.ID, filtro)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_estadisticas", "No se pudieron calcular tus estadísticas.")
		return
	}

	ResponderJSON(w, http.StatusOK, stats)
}

// GET /api/admin/estadisticas?desde=&hasta=&agrupar=dia|semana|mes
func (a *API) handleAdminGetEstadisticas(w http.ResponseWriter, r *http.Request) {
	desdeStr := strings.TrimSpace(r.URL.Query().Get("desde"))
	hastaStr := strings.TrimSpace(r.URL.Query().Get("hasta"))
	agruparStr := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("agrupar")))

	ahoraBog := time.Now().In(store.LocBogota)
	var tDesde, tHasta time.Time

	if desdeStr != "" && hastaStr != "" {
		d, errD := time.ParseInLocation("2006-01-02", desdeStr, store.LocBogota)
		h, errH := time.ParseInLocation("2006-01-02", hastaStr, store.LocBogota)
		if errD != nil || errH != nil {
			ResponderError(w, http.StatusBadRequest, "formato_fecha_invalido", "Las fechas deben tener el formato YYYY-MM-DD.")
			return
		}
		tDesde = d
		tHasta = h
	} else if desdeStr != "" && hastaStr == "" {
		d, errD := time.ParseInLocation("2006-01-02", desdeStr, store.LocBogota)
		if errD != nil {
			ResponderError(w, http.StatusBadRequest, "formato_fecha_invalido", "Las fechas deben tener el formato YYYY-MM-DD.")
			return
		}
		tDesde = d
		tHasta = ahoraBog
	} else if desdeStr == "" && hastaStr != "" {
		h, errH := time.ParseInLocation("2006-01-02", hastaStr, store.LocBogota)
		if errH != nil {
			ResponderError(w, http.StatusBadRequest, "formato_fecha_invalido", "Las fechas deben tener el formato YYYY-MM-DD.")
			return
		}
		tDesde = h.AddDate(0, 0, -30)
		tHasta = h
	} else {
		tDesde = ahoraBog.AddDate(0, 0, -30)
		tHasta = ahoraBog
	}

	if tDesde.After(tHasta) {
		ResponderError(w, http.StatusBadRequest, "rango_invalido", "La fecha 'desde' no puede ser posterior a 'hasta'.")
		return
	}

	diasDiferencia := int(tHasta.Sub(tDesde).Hours() / 24)
	if diasDiferencia > 5*366 {
		ResponderError(w, http.StatusBadRequest, "rango_excedido", "El rango de fechas no puede superar los 5 años.")
		return
	}

	if agruparStr != "" {
		if agruparStr != "dia" && agruparStr != "semana" && agruparStr != "mes" {
			ResponderError(w, http.StatusBadRequest, "agrupar_invalido", "El parámetro agrupar debe ser 'dia', 'semana' o 'mes'.")
			return
		}
	} else {
		if diasDiferencia <= 92 {
			agruparStr = "dia"
		} else if diasDiferencia < 365 {
			agruparStr = "semana"
		} else {
			agruparStr = "mes"
		}
	}

	filtro := store.FiltroEstadisticasAdmin{
		Desde:   store.InicioDiaBogota(tDesde),
		Hasta:   store.FinDiaBogota(tHasta),
		Agrupar: agruparStr,
	}

	if pID := strings.TrimSpace(r.URL.Query().Get("persona_id")); pID != "" {
		filtro.PersonaID = &pID
	}
	if cIDStr := strings.TrimSpace(r.URL.Query().Get("cliente_id")); cIDStr != "" {
		if cIDStr == "sin_cliente" || cIDStr == "0" || cIDStr == "null" {
			filtro.SinCliente = true
		} else if cID, err := strconv.Atoi(cIDStr); err == nil && cID > 0 {
			filtro.ClienteID = &cID
		}
	}
	if tIDStr := strings.TrimSpace(r.URL.Query().Get("tipo_id")); tIDStr != "" {
		if tID, err := strconv.Atoi(tIDStr); err == nil && tID > 0 {
			filtro.TipoID = &tID
		}
	}

	stats, err := a.Store.ObtenerEstadisticasAdmin(r.Context(), filtro)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_estadisticas", "No se pudieron calcular las estadísticas de administración.")
		return
	}

	ResponderJSON(w, http.StatusOK, stats)
}
