package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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
}

func NewAPI(s store.Store, auth AuthVerifier, modoDemoActivo bool) *API {
	return &API{
		Store:          s,
		Auth:           auth,
		ChatLimiter:    NewRateLimiter(20, time.Minute),    // 20 mensajes por minuto por usuario
		AuthLimiter:    NewRateLimiter(10, 5*time.Minute), // 10 intentos por 5 minutos por IP o correo
		ModoDemoActivo: modoDemoActivo,
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
			MaxAge:   30 * 24 * 3600, // 30 días
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

	perfil, err := a.Auth.Registro(r.Context(), correo, req.Contrasena, nombre)
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
		Cuerpo string `json:"cuerpo"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "El formato del mensaje no es válido.")
		return
	}

	c := strings.TrimSpace(req.Cuerpo)
	long := len([]rune(c))
	if long < 1 || long > 2000 {
		ResponderError(w, http.StatusBadRequest, "mensaje_invalido", "El mensaje debe tener entre 1 y 2000 caracteres.")
		return
	}

	msg, err := a.Store.CrearMensajeChat(r.Context(), yo.ID, c)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_crear_mensaje", "No se pudo enviar el mensaje al chat.")
		return
	}

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
