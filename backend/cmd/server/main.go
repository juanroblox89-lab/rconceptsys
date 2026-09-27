// Backend Go de RConcept Systems v2 (F0). Solo stdlib.
// Sin SUPABASE_URL arranca en modo demo (store en memoria con 4 semillas y
// selector por X-Demo-User); con SUPABASE_URL+SUPABASE_SERVICE_ROLE_KEY usa
// Supabase (REST con service role) y el primer login crea la fila (la primera
// de la tabla nace dueño, las demás pendiente).
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"rconceptsys/backend/internal/httpapi"
	"rconceptsys/backend/internal/permisos"
	"rconceptsys/backend/internal/store"
	"rconceptsys/backend/internal/supa"
)

// authCache evita pegarle a Supabase Auth en cada request con el mismo token
// (60s). Incluye singleflight por token (sin thundering herd a Auth).
type authCache struct {
	mu       sync.Mutex
	m        map[string]authEntry
	inflight map[string]*inflightAuth
}

type authEntry struct {
	userID  string
	expires time.Time
}

type inflightAuth struct {
	done chan struct{}
	uid  string
	err  error
}

func (c *authCache) get(key string) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[key]
	if !ok || time.Now().After(e.expires) {
		delete(c.m, key)
		return "", false
	}
	return e.userID, true
}

func (c *authCache) put(key, userID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.m[key] = authEntry{userID: userID, expires: time.Now().Add(60 * time.Second)}
	if len(c.m) <= 5000 {
		return
	}
	// Tope: saca vencidos y, si sigue lleno, cualquiera hasta 5000.
	ahora := time.Now()
	for k, e := range c.m {
		if ahora.After(e.expires) {
			delete(c.m, k)
		}
		if len(c.m) <= 5000 {
			return
		}
	}
	for k := range c.m {
		delete(c.m, k)
		if len(c.m) <= 5000 {
			return
		}
	}
}

func isUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i, ch := range s {
		switch i {
		case 8, 13, 18, 23:
			if ch != '-' {
				return false
			}
		default:
			if !(ch >= '0' && ch <= '9' || ch >= 'a' && ch <= 'f' || ch >= 'A' && ch <= 'F') {
				return false
			}
		}
	}
	return true
}

// resolverSupabase verifica el Bearer contra Auth (con caché+singleflight) y
// trae la fila; si no existe es el primer ingreso: la crea (dueño si la tabla
// está vacía, pendiente si no).
func resolverSupabase(sb *supa.Client, st store.Store, cache *authCache) httpapi.Resolver {
	return func(r *http.Request) (permisos.Usuario, error) {
		h := r.Header.Get("Authorization")
		if !strings.HasPrefix(h, "Bearer ") {
			return permisos.Usuario{}, httpapi.ErrSinAuth
		}
		token := strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
		if token == "" || len(token) > 8192 {
			return permisos.Usuario{}, httpapi.ErrSinAuth
		}
		sum := sha256.Sum256([]byte(token))
		key := hex.EncodeToString(sum[:])
		if uid, ok := cache.get(key); ok {
			return filaOCrear(r.Context(), sb, st, uid)
		}
		cache.mu.Lock()
		if cache.inflight == nil {
			cache.inflight = map[string]*inflightAuth{}
		}
		if f, ok := cache.inflight[key]; ok {
			cache.mu.Unlock()
			<-f.done
			if f.err != nil {
				return permisos.Usuario{}, f.err
			}
			return filaOCrear(r.Context(), sb, st, f.uid)
		}
		f := &inflightAuth{done: make(chan struct{})}
		cache.inflight[key] = f
		cache.mu.Unlock()

		ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
		uid, err := sb.UserFromToken(ctx, token)
		cancel()
		if err != nil {
			var se *supa.Error
			if errors.As(err, &se) && (se.Status == http.StatusUnauthorized || se.Status == http.StatusForbidden) {
				err = httpapi.ErrSinAuth
			} else {
				log.Printf("backend: auth: %v", err)
				err = httpapi.ErrTransporte
			}
		} else if !isUUID(uid) {
			err = httpapi.ErrSinAuth
		}
		cache.mu.Lock()
		f.uid, f.err = uid, err
		close(f.done)
		delete(cache.inflight, key)
		cache.mu.Unlock()
		if err != nil {
			return permisos.Usuario{}, err
		}
		cache.put(key, uid)
		return filaOCrear(r.Context(), sb, st, uid)
	}
}

// preasignado es una entrada de RC_PREASIGNADOS: email + acceso + oficios.
type preasignado struct {
	email   string
	acceso  permisos.Acceso
	oficios []string
}

// parsePreasignados parsea RC_PREASIGNADOS ("email:acceso:oficio1+oficio2,
// email2:..."). Robusto: ignora entradas rotas en vez de fallar.
func parsePreasignados(raw string) []preasignado {
	out := []preasignado{}
	for _, parte := range strings.Split(raw, ",") {
		parte = strings.TrimSpace(parte)
		if parte == "" {
			continue
		}
		campos := strings.Split(parte, ":")
		if len(campos) < 2 {
			continue
		}
		email := strings.TrimSpace(campos[0])
		acceso := permisos.Acceso(strings.TrimSpace(campos[1]))
		switch acceso {
		case permisos.AccesoDueno, permisos.AccesoAdmin, permisos.AccesoEquipo:
		default:
			continue
		}
		oficios := []string{}
		if len(campos) >= 3 && strings.TrimSpace(campos[2]) != "" {
			if norm, err := permisos.NormalizarOficios(strings.Split(strings.TrimSpace(campos[2]), "+")); err == nil {
				oficios = norm
			}
		}
		out = append(out, preasignado{email: email, acceso: acceso, oficios: oficios})
	}
	return out
}

// preasignadoPara devuelve el acceso/oficios preasignados para un email
// (case-insensitive) o false si no hay.
func preasignadoPara(lista []preasignado, email string) (permisos.Acceso, []string, bool) {
	for _, p := range lista {
		if strings.EqualFold(p.email, email) {
			return p.acceso, p.oficios, true
		}
	}
	return "", nil, false
}

// filaOCrear trae la fila del usuario; si no existe la crea (primer ingreso).
// RC_PREASIGNADOS se aplica al primer login: el email preasignado nace con
// ese acceso+oficios en vez de pendiente (BRIEF F2 §7: jestalvz@gmail.com =
// admin + edición). Ese email no cuenta como "primer usuario = dueño": si la
// tabla está vacía y el email tiene preasignado, se respeta el preasignado.
func filaOCrear(ctx context.Context, sb *supa.Client, st store.Store, uid string) (permisos.Usuario, error) {
	u, ok, err := st.GetUsuario(uid)
	if err != nil {
		return permisos.Usuario{}, httpapi.ErrTransporte
	}
	if ok {
		return u, nil
	}
	usuarios, err := st.ListUsuarios()
	if err != nil {
		return permisos.Usuario{}, httpapi.ErrTransporte
	}
	email, nombre := "", ""
	func() {
		c, cancel := context.WithTimeout(ctx, 8*time.Second)
		defer cancel()
		email, nombre, _ = sb.AdminGetUser(c, uid)
	}()
	acceso := permisos.AccesoPendiente
	oficios := []string{}
	if len(usuarios) == 0 {
		acceso = permisos.AccesoDueno // primera fila del sistema
	}
	// Preasignados por email (RC_PREASIGNADOS): pisan el default, incluido
	// el caso "primera fila" (ese email no cuenta como primer dueño).
	if acc, ofis, ok := preasignadoPara(parsePreasignados(os.Getenv("RC_PREASIGNADOS")), email); ok {
		acceso, oficios = acc, ofis
	}
	if nombre == "" {
		nombre = "Nuevo usuario"
		if i := strings.Index(email, "@"); i > 0 {
			nombre = email[:i]
		}
	}
	u, err = st.CreateUsuario(store.Usuario{
		ID: uid, Nombre: nombre, Email: email,
		Acceso: acceso, Oficios: oficios,
	})
	if err != nil {
		return permisos.Usuario{}, httpapi.ErrTransporte
	}
	log.Printf("backend: primer ingreso %s como %s", uid[:8], acceso)
	return u, nil
}

func main() {
	sb := supa.FromEnv()
	var st store.Store
	var resolve httpapi.Resolver
	if sb == nil {
		st = store.NuevaMemoria()
		resolve = func(r *http.Request) (permisos.Usuario, error) {
			return httpapi.DemoResolve(st, r)
		}
		log.Print("backend rconcept: modo demo (sin SUPABASE_URL)")
	} else {
		st = store.NuevoSupabase(sb)
		cache := &authCache{m: map[string]authEntry{}}
		resolve = resolverSupabase(sb, st, cache)
		log.Print("backend rconcept: Supabase configurado")
	}
	secreto := strings.TrimSpace(os.Getenv("RC_INTERNAL_SECRET"))
	if secreto == "" && os.Getenv("VERCEL") != "" {
		log.Fatal("RC_INTERNAL_SECRET requerido en producción")
	}
	puerto := strings.TrimSpace(os.Getenv("PORT"))
	if puerto == "" {
		puerto = "8095"
	}
	srv := httpapi.Nuevo(st, resolve, secreto)
	log.Printf("backend rconcept: escuchando en :%s", puerto)
	if err := http.ListenAndServe(":"+puerto, srv.Handler()); err != nil {
		log.Fatal(err)
	}
}
