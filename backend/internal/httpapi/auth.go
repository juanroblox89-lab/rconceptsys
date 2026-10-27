package httpapi

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"

	"rconceptsys/backend/internal/store"
	"rconceptsys/backend/internal/supa"
)

type contextKey string

const usuarioKey contextKey = "usuario_autenticado"

type AuthVerifier interface {
	VerificarToken(ctx context.Context, token string) (*store.Perfil, error)
	RefrescarToken(ctx context.Context, refreshToken string) (*supa.TokenResponse, error)
	Login(ctx context.Context, email, password string) (*supa.TokenResponse, *store.Perfil, error)
	Registro(ctx context.Context, email, password, nombre string) (*store.Perfil, error)
}

type DemoAuthVerifier struct {
	Store       store.Store
	AdminEmails []string
	cacheMu     sync.RWMutex
	tokenCache  map[string]*tokenCacheEntry
}

type tokenCacheEntry struct {
	perfil   *store.Perfil
	expiraEn time.Time
}

func NewDemoAuthVerifier(s store.Store, adminEmails []string) *DemoAuthVerifier {
	return &DemoAuthVerifier{
		Store:       s,
		AdminEmails: adminEmails,
		tokenCache:  make(map[string]*tokenCacheEntry),
	}
}

func (v *DemoAuthVerifier) esAdminEmail(email string) bool {
	eNorm := strings.ToLower(strings.TrimSpace(email))
	for _, admin := range v.AdminEmails {
		if strings.ToLower(strings.TrimSpace(admin)) == eNorm {
			return true
		}
	}
	return false
}

func (v *DemoAuthVerifier) VerificarToken(ctx context.Context, token string) (*store.Perfil, error) {
	v.cacheMu.RLock()
	entry, ok := v.tokenCache[token]
	v.cacheMu.RUnlock()
	if ok && entry.expiraEn.After(time.Now()) {
		return entry.perfil, nil
	}

	userID := token
	if strings.HasPrefix(token, "Bearer ") {
		userID = strings.TrimPrefix(token, "Bearer ")
	}

	p, err := v.Store.ObtenerPerfilPorID(ctx, userID)
	if err != nil {
		p, err = v.Store.ObtenerPerfilPorCorreo(ctx, userID)
	}
	if err != nil {
		return nil, store.ErrUnauthorized
	}

	if v.esAdminEmail(p.Correo) && (!p.EsAdmin || p.Estado != store.EstadoAprobado) {
		p.EsAdmin = true
		p.Estado = store.EstadoAprobado
		_ = v.Store.CrearOActualizarPerfil(ctx, p)
	}

	v.cacheMu.Lock()
	v.tokenCache[token] = &tokenCacheEntry{
		perfil:   p,
		expiraEn: time.Now().Add(5 * time.Second),
	}
	v.cacheMu.Unlock()

	return p, nil
}

func (v *DemoAuthVerifier) RefrescarToken(ctx context.Context, refreshToken string) (*supa.TokenResponse, error) {
	// En modo demo simula refresh devolviendo token con el mismo usuario
	return &supa.TokenResponse{
		AccessToken:  refreshToken,
		RefreshToken: refreshToken,
		ExpiresIn:    3600,
	}, nil
}

func (v *DemoAuthVerifier) Login(ctx context.Context, email, password string) (*supa.TokenResponse, *store.Perfil, error) {
	eNorm := strings.ToLower(strings.TrimSpace(email))
	p, err := v.Store.ObtenerPerfilPorCorreo(ctx, eNorm)
	if err != nil {
		return nil, nil, store.ErrUnauthorized
	}

	if v.esAdminEmail(p.Correo) && (!p.EsAdmin || p.Estado != store.EstadoAprobado) {
		p.EsAdmin = true
		p.Estado = store.EstadoAprobado
		_ = v.Store.CrearOActualizarPerfil(ctx, p)
	}

	tok := &supa.TokenResponse{
		AccessToken:  p.ID,
		RefreshToken: "ref-" + p.ID,
		ExpiresIn:    3600,
	}
	tok.User.ID = p.ID
	tok.User.Email = p.Correo

	return tok, p, nil
}

func (v *DemoAuthVerifier) Registro(ctx context.Context, email, password, nombre string) (*store.Perfil, error) {
	eNorm := strings.ToLower(strings.TrimSpace(email))
	// Si ya existe devolvemos ErrConflict
	if _, err := v.Store.ObtenerPerfilPorCorreo(ctx, eNorm); err == nil {
		return nil, store.ErrConflict
	}

	esAdmin := v.esAdminEmail(eNorm)
	estado := store.EstadoPendiente
	if esAdmin {
		estado = store.EstadoAprobado
	}

	nuevoID := "usr-" + strings.ReplaceAll(eNorm, "@", "-")
	nuevoID = strings.ReplaceAll(nuevoID, ".", "-")

	perfil := &store.Perfil{
		ID:       nuevoID,
		Correo:   eNorm,
		Nombre:   strings.TrimSpace(nombre),
		Estado:   estado,
		EsAdmin:  esAdmin,
		CreadoEn: time.Now(),
	}

	if err := v.Store.CrearOActualizarPerfil(ctx, perfil); err != nil {
		return nil, err
	}
	return perfil, nil
}

// Middleware de autenticación y resolución de usuario
func (a *API) MiddlewareAuth(next http.HandlerFunc, requiereAprobado bool, requiereAdmin bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var token string

		// 1. Leer de cookie httpOnly (estándar web seguro)
		if c, err := r.Cookie("rc_access_token"); err == nil && c.Value != "" {
			token = c.Value
		}

		// 2. Si no hay cookie, leer de Authorization: Bearer (para APK Capacitor)
		if token == "" {
			authHeader := r.Header.Get("Authorization")
			if authHeader != "" {
				parts := strings.SplitN(authHeader, " ", 2)
				if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
					token = parts[1]
				} else {
					token = authHeader
				}
			}
		}

		// 3. SOLO si ModoDemoActivo=true, considerar X-Demo-User
		if token == "" && a.ModoDemoActivo {
			demoUserHeader := r.Header.Get("X-Demo-User")
			if demoUserHeader != "" {
				token = demoUserHeader
			}
		}

		// El navegador descarta la cookie de acceso al vencer (1 hora). Si todavía hay cookie de
		// refresco, se renueva la sesión en silencio en lugar de pedir que inicien sesión otra vez.
		if token == "" {
			if rc, rerr := r.Cookie("rc_refresh_token"); rerr == nil && rc.Value != "" {
				if tok, terr := a.Auth.RefrescarToken(r.Context(), rc.Value); terr == nil && tok != nil && tok.AccessToken != "" {
					a.setAuthCookies(w, r, tok.AccessToken, tok.RefreshToken, tok.ExpiresIn)
					token = tok.AccessToken
				}
			}
		}

		if token == "" {
			ResponderError(w, http.StatusUnauthorized, "no_autenticado", "Por favor inicia sesión para continuar.")
			return
		}

		perfil, err := a.Auth.VerificarToken(r.Context(), token)
		if err != nil || perfil == nil {
			// Intentar refresco si hay refresh_token en cookie
			refreshed := false
			if rc, rerr := r.Cookie("rc_refresh_token"); rerr == nil && rc.Value != "" {
				if tok, terr := a.Auth.RefrescarToken(r.Context(), rc.Value); terr == nil && tok != nil && tok.AccessToken != "" {
					a.setAuthCookies(w, r, tok.AccessToken, tok.RefreshToken, tok.ExpiresIn)
					if p2, err2 := a.Auth.VerificarToken(r.Context(), tok.AccessToken); err2 == nil && p2 != nil {
						perfil = p2
						refreshed = true
					}
				}
			}

			if !refreshed {
				ResponderError(w, http.StatusUnauthorized, "token_invalido", "Tu sesión ha expirado o no es válida.")
				return
			}
		}

		if requiereAprobado && perfil.Estado != store.EstadoAprobado {
			if perfil.Estado == store.EstadoPendiente {
				ResponderError(w, http.StatusForbidden, "cuenta_pendiente", "Tu cuenta está esperando la aprobación de un administrador.")
				return
			}
			ResponderError(w, http.StatusForbidden, "cuenta_suspendida", "Tu cuenta ha sido suspendida. Contacta a un administrador.")
			return
		}

		if requiereAdmin && !perfil.EsAdmin {
			ResponderError(w, http.StatusForbidden, "solo_admin", "Esta acción requiere permisos de administrador.")
			return
		}

		ctx := context.WithValue(r.Context(), usuarioKey, perfil)
		next(w, r.WithContext(ctx))
	}
}

func UsuarioDesdeContexto(ctx context.Context) *store.Perfil {
	val := ctx.Value(usuarioKey)
	if val == nil {
		return nil
	}
	p, _ := val.(*store.Perfil)
	return p
}
