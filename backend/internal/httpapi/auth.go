package httpapi

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"

	"rconceptsys/backend/internal/store"
)

type contextKey string

const usuarioKey contextKey = "usuario_autenticado"

type AuthVerifier interface {
	VerificarToken(ctx context.Context, token string) (*store.Perfil, error)
}

type DemoAuthVerifier struct {
	Store       store.Store
	AdminEmails []string
	cacheMu     sync.RWMutex
	tokenCache  map[string]*tokenCacheEntry
}

type tokenCacheEntry struct {
	perfil    *store.Perfil
	expiraEn  time.Time
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
	// Verificar caché rápido en memoria (unos segundos)
	v.cacheMu.RLock()
	entry, ok := v.tokenCache[token]
	v.cacheMu.RUnlock()
	if ok && entry.expiraEn.After(time.Now()) {
		return entry.perfil, nil
	}

	// Si el token tiene formato Bearer o demo o id de usuario
	userID := token
	if strings.HasPrefix(token, "Bearer ") {
		userID = strings.TrimPrefix(token, "Bearer ")
	}

	p, err := v.Store.ObtenerPerfilPorID(ctx, userID)
	if err != nil {
		// Probar por correo
		p, err = v.Store.ObtenerPerfilPorCorreo(ctx, userID)
	}
	if err != nil {
		return nil, store.ErrUnauthorized
	}

	// Comprobar si su correo está en ADMIN_EMAILS y debe promoverse a admin
	if v.esAdminEmail(p.Correo) && (!p.EsAdmin || p.Estado != store.EstadoAprobado) {
		p.EsAdmin = true
		p.Estado = store.EstadoAprobado
		_ = v.Store.CrearOActualizarPerfil(ctx, p)
	}

	// Guardar en cache 5 segundos
	v.cacheMu.Lock()
	v.tokenCache[token] = &tokenCacheEntry{
		perfil:   p,
		expiraEn: time.Now().Add(5 * time.Second),
	}
	v.cacheMu.Unlock()

	return p, nil
}

// Middleware de autenticación y resolución de usuario
func (a *API) MiddlewareAuth(next http.HandlerFunc, requiereAprobado bool, requiereAdmin bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		demoUserHeader := r.Header.Get("X-Demo-User")

		var token string
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
				token = parts[1]
			} else {
				token = authHeader
			}
		} else if demoUserHeader != "" {
			token = demoUserHeader
		}

		if token == "" {
			ResponderError(w, http.StatusUnauthorized, "no_autenticado", "Por favor inicia sesión para continuar.")
			return
		}

		perfil, err := a.Auth.VerificarToken(r.Context(), token)
		if err != nil || perfil == nil {
			ResponderError(w, http.StatusUnauthorized, "token_invalido", "Tu sesión ha expirado o no es válida.")
			return
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

		// Inyectar perfil en el contexto
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
