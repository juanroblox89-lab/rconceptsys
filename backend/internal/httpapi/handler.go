// Package httpapi expone el contrato API F0: GET /health, /me, /usuarios,
// POST /usuarios/{id}/aprobar, PATCH /usuarios/{id},
// POST /usuarios/{id}/desactivar y GET /actividad.
// Todos los endpoints salvo /health pasan por resolveUser (inyectado por main:
// demo con X-Demo-User o Supabase con Bearer verificado) + permisos.Puede +
// secreto interno X-RC-Internal. CORS abierto solo para el preview local
// (localhost:3300). Solo stdlib.
package httpapi

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"rconceptsys/backend/internal/actividad"
	"rconceptsys/backend/internal/permisos"
	"rconceptsys/backend/internal/store"
)

// ErrSinAuth: el resolver lo devuelve cuando no hay credencial válida → 401.
// ErrTransporte: falla temporal verificando la sesión → 502 reintentable.
var (
	ErrSinAuth    = errors.New("sin auth")
	ErrTransporte = errors.New("transporte")
)

// Resolver devuelve el usuario autenticado del request (lo provee main).
type Resolver func(r *http.Request) (permisos.Usuario, error)

// Server agrupa las dependencias de los handlers.
type Server struct {
	st      store.Store
	resolve Resolver
	interno string
}

// Nuevo crea el Server. secretoInterno es RC_INTERNAL_SECRET ("" = no exigir).
func Nuevo(st store.Store, resolve Resolver, secretoInterno string) *Server {
	return &Server{st: st, resolve: resolve, interno: secretoInterno}
}

// Orígenes permitidos para consumo directo (preview local).
var origenesPermitidos = map[string]bool{
	"http://localhost:3300": true,
	"http://127.0.0.1:3300": true,
}

// Handler arma el mux con sus middlewares (CORS fuera, secreto interno dentro).
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.health)
	mux.HandleFunc("GET /me", s.me)
	mux.HandleFunc("GET /usuarios", s.listUsuarios)
	mux.HandleFunc("POST /usuarios/{id}/aprobar", s.aprobar)
	mux.HandleFunc("PATCH /usuarios/{id}", s.patch)
	mux.HandleFunc("POST /usuarios/{id}/desactivar", s.desactivar)
	mux.HandleFunc("GET /actividad", s.listActividad)
	s.rutasF1(mux)
	s.rutasF2(mux)
	return corsMiddleware(requireInterno(s.interno, mux))
}

// requireInterno exige X-RC-Internal cuando hay secreto configurado
// (obligatorio en Vercel, opcional en local). /health va exento.
func requireInterno(secreto string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if secreto != "" && r.URL.Path != "/health" {
			if subtle.ConstantTimeCompare([]byte(r.Header.Get("X-RC-Internal")), []byte(secreto)) != 1 {
				writeError(w, http.StatusForbidden, "prohibido")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origen := r.Header.Get("Origin")
		if origenesPermitidos[origen] {
			w.Header().Set("Access-Control-Allow-Origin", origen)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Demo-User, X-RC-Internal")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, codigo int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(codigo)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, codigo int, msg string) {
	writeJSON(w, codigo, map[string]string{"error": msg})
}

// decodeBody lee un JSON opcional: cuerpo vacío deja v intacto; JSON roto → error.
func decodeBody(r *http.Request, v any) error {
	data, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		return err
	}
	if len(strings.TrimSpace(string(data))) == 0 {
		return nil
	}
	return json.Unmarshal(data, v)
}

// DemoResolve resuelve por cabecera X-Demo-User (modo demo, sin Supabase):
// acepta id, email o acceso ("dueno"/"admin"/"equipo"/"pendiente"). Sin
// cabecera o sin coincidencia → ErrSinAuth (401). Documentado también en
// backend/README.md.
func DemoResolve(st store.Store, r *http.Request) (permisos.Usuario, error) {
	sel := strings.TrimSpace(r.Header.Get("X-Demo-User"))
	if sel == "" {
		return permisos.Usuario{}, ErrSinAuth
	}
	usuarios, err := st.ListUsuarios()
	if err != nil {
		return permisos.Usuario{}, err
	}
	for _, u := range usuarios {
		if u.ID == sel || strings.EqualFold(u.Email, sel) || strings.EqualFold(string(u.Acceso), sel) {
			return u, nil
		}
	}
	return permisos.Usuario{}, ErrSinAuth
}

// usuarioActual resuelve y mapea errores a 401/502. ok=false si ya respondió.
func (s *Server) usuarioActual(w http.ResponseWriter, r *http.Request) (u permisos.Usuario, ok bool) {
	u, err := s.resolve(r)
	if err == nil {
		return u, true
	}
	if errors.Is(err, ErrTransporte) {
		writeError(w, http.StatusBadGateway, "no pude verificar tu sesión, probá de nuevo")
		return permisos.Usuario{}, false
	}
	writeError(w, http.StatusUnauthorized, "no autenticado")
	return permisos.Usuario{}, false
}

// errorDatos responde 502 ante fallas del store (reintentable).
func errorDatos(w http.ResponseWriter, err error) {
	writeError(w, http.StatusBadGateway, "no pude leer tus datos en este momento, probá de nuevo")
	_ = err
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- /me ---

type modulo struct {
	ID         string `json:"id"`
	Titulo     string `json:"titulo"`
	Ruta       string `json:"ruta"`
	Habilitado bool   `json:"habilitado"`
}

// ordenModulos es la lista completa y en orden que espera el frontend: los no
// permitidos van con habilitado=false (el frontend oculta o muestra
// "Llega en F1/F2"). En F0 inicio siempre habilitado; equipo y mi-perfil
// según acceso. F1 habilita produccion y clientes (ver modulosPara).
var ordenModulos = []modulo{
	{ID: "inicio", Titulo: "Inicio", Ruta: "/inicio"},
	{ID: "produccion", Titulo: "Producción", Ruta: "/produccion"},
	{ID: "cobros", Titulo: "Cobros", Ruta: "/cobros"},
	{ID: "clientes", Titulo: "Clientes", Ruta: "/clientes"},
	{ID: "ventas", Titulo: "Ventas", Ruta: "/ventas"},
	{ID: "biblioteca", Titulo: "Biblioteca", Ruta: "/biblioteca"},
	{ID: "equipo", Titulo: "Equipo", Ruta: "/equipo"},
	{ID: "mi-perfil", Titulo: "Mi perfil", Ruta: "/mi-perfil"},
}

func modulosPara(u permisos.Usuario) []modulo {
	veEquipo := u.Acceso == permisos.AccesoDueno || u.Acceso == permisos.AccesoAdmin
	vePerfil := veEquipo || u.Acceso == permisos.AccesoEquipo
	out := make([]modulo, 0, len(ordenModulos))
	for _, m := range ordenModulos {
		switch m.ID {
		case "inicio":
			m.Habilitado = true
		case "equipo":
			m.Habilitado = veEquipo
		case "mi-perfil":
			m.Habilitado = vePerfil
		case "produccion", "clientes":
			// F1: admin/dueño todo; equipo ve sus clientes (lectura, el
			// backend filtra) y el tablero solo con sus piezas.
			m.Habilitado = veEquipo || u.Acceso == permisos.AccesoEquipo
		case "cobros":
			// F2: dueño/admin todo; equipo solo sus líneas (el backend
			// filtra por usuario).
			m.Habilitado = veEquipo || u.Acceso == permisos.AccesoEquipo
		default:
			m.Habilitado = false
		}
		out = append(out, m)
	}
	return out
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if u.Acceso == permisos.AccesoDesactivado {
		writeError(w, http.StatusForbidden, "acceso desactivado")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"usuario": u,
		"modulos": modulosPara(u),
	})
}

// --- /usuarios ---

func (s *Server) listUsuarios(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(u, permisos.GestionUsuarios, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	usuarios, err := s.st.ListUsuarios()
	if err != nil {
		errorDatos(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"usuarios": usuarios})
}

// cambioBody es el cuerpo de aprobar y PATCH.
type cambioBody struct {
	Acceso  string   `json:"acceso"`
	Oficios []string `json:"oficios"`
	Motivo  string   `json:"motivo"`
}

func (s *Server) contarDuenos(w http.ResponseWriter) (int, bool) {
	n, err := s.st.CountDuenos()
	if err != nil {
		errorDatos(w, err)
		return 0, false
	}
	return n, true
}

func (s *Server) aprobar(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.GestionUsuarios, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	var body cambioBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	nuevo := permisos.Acceso(strings.TrimSpace(body.Acceso))
	if nuevo == "" {
		nuevo = permisos.AccesoEquipo
	}
	if nuevo != permisos.AccesoEquipo && nuevo != permisos.AccesoAdmin {
		writeError(w, http.StatusBadRequest, "acceso inválido para aprobar (equipo o admin)")
		return
	}
	// §5.5: un admin solo aprueba como equipo.
	if nuevo == permisos.AccesoAdmin && actor.Acceso == permisos.AccesoAdmin {
		writeError(w, http.StatusForbidden, "solo el dueño puede aprobar como admin")
		return
	}
	id := r.PathValue("id")
	obj, existe, err := s.st.GetUsuario(id)
	if err != nil {
		errorDatos(w, err)
		return
	}
	if !existe {
		writeError(w, http.StatusNotFound, "usuario no encontrado")
		return
	}
	if obj.Acceso != permisos.AccesoPendiente {
		writeError(w, http.StatusBadRequest, "solo se puede aprobar un usuario pendiente")
		return
	}
	oficios := obj.Oficios
	if body.Oficios != nil {
		norm, err := permisos.NormalizarOficios(body.Oficios)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		oficios = norm
	}
	antes := map[string]any{"acceso": string(obj.Acceso), "oficios": obj.Oficios}
	act, err := s.st.UpdateUsuario(id, nuevo, oficios)
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "aprobar_usuario", id,
		antes, map[string]any{"acceso": string(act.Acceso), "oficios": act.Oficios},
		strings.TrimSpace(body.Motivo))
	writeJSON(w, http.StatusOK, act)
}

func accesoValido(a permisos.Acceso) bool {
	switch a {
	case permisos.AccesoDueno, permisos.AccesoAdmin, permisos.AccesoEquipo,
		permisos.AccesoPendiente, permisos.AccesoDesactivado:
		return true
	}
	return false
}

func (s *Server) patch(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.GestionUsuarios, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	var body cambioBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	id := r.PathValue("id")
	obj, existe, err := s.st.GetUsuario(id)
	if err != nil {
		errorDatos(w, err)
		return
	}
	if !existe {
		writeError(w, http.StatusNotFound, "usuario no encontrado")
		return
	}
	var nuevoAcceso permisos.Acceso
	cambiaAcceso := false
	if strings.TrimSpace(body.Acceso) != "" {
		nuevoAcceso = permisos.Acceso(strings.TrimSpace(body.Acceso))
		if !accesoValido(nuevoAcceso) {
			writeError(w, http.StatusBadRequest, "acceso inválido")
			return
		}
		cambiaAcceso = nuevoAcceso != obj.Acceso
	}
	cambiaOficios := body.Oficios != nil
	if !cambiaAcceso && !cambiaOficios {
		writeJSON(w, http.StatusOK, obj)
		return
	}
	if strings.TrimSpace(body.Motivo) == "" {
		writeError(w, http.StatusBadRequest, "el motivo es obligatorio para cambiar acceso u oficios")
		return
	}
	// §5.5: el chequeo fino vive aquí, no en Puede (documentado en permisos).
	tocado := permisos.Acceso("")
	if cambiaAcceso {
		tocado = nuevoAcceso
	}
	if !permisos.PuedeCambiarAcceso(actor.Acceso, obj.Acceso, tocado) {
		writeError(w, http.StatusForbidden, "solo el dueño puede cambiar accesos de admin o dueño")
		return
	}
	// §5.4: no quitar ni desactivar al último dueño.
	if cambiaAcceso {
		n, ok := s.contarDuenos(w)
		if !ok {
			return
		}
		if permisos.NoQuitarUltimoDueno(obj.Acceso, nuevoAcceso, false, n) {
			writeError(w, http.StatusConflict, "no se puede quitar el último dueño")
			return
		}
	}
	var oficios []string
	if cambiaOficios {
		norm, err := permisos.NormalizarOficios(body.Oficios)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		oficios = norm
	}
	antes := map[string]any{"acceso": string(obj.Acceso), "oficios": obj.Oficios}
	guardarAcceso := permisos.Acceso("")
	if cambiaAcceso {
		guardarAcceso = nuevoAcceso
	}
	act, err := s.st.UpdateUsuario(id, guardarAcceso, oficios)
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "cambiar_acceso_oficios", id,
		antes, map[string]any{"acceso": string(act.Acceso), "oficios": act.Oficios},
		strings.TrimSpace(body.Motivo))
	writeJSON(w, http.StatusOK, act)
}

func (s *Server) desactivar(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.GestionUsuarios, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	var body cambioBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	id := r.PathValue("id")
	obj, existe, err := s.st.GetUsuario(id)
	if err != nil {
		errorDatos(w, err)
		return
	}
	if !existe {
		writeError(w, http.StatusNotFound, "usuario no encontrado")
		return
	}
	if obj.Acceso == permisos.AccesoDesactivado {
		writeError(w, http.StatusBadRequest, "el usuario ya está desactivado")
		return
	}
	// §5.5: un admin puede desactivar equipo/pendiente, nunca admin/dueño.
	if !permisos.PuedeCambiarAcceso(actor.Acceso, obj.Acceso, permisos.AccesoDesactivado) {
		writeError(w, http.StatusForbidden, "solo el dueño puede desactivar a un admin o dueño")
		return
	}
	// §5.4: no desactivar al último dueño.
	n, ok := s.contarDuenos(w)
	if !ok {
		return
	}
	if permisos.NoQuitarUltimoDueno(obj.Acceso, "", true, n) {
		writeError(w, http.StatusConflict, "no se puede quitar el último dueño")
		return
	}
	act, err := s.st.Desactivar(id)
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "desactivar_usuario", id,
		map[string]any{"acceso": string(obj.Acceso)},
		map[string]any{"acceso": string(act.Acceso)},
		strings.TrimSpace(body.Motivo))
	writeJSON(w, http.StatusOK, act)
}

// --- /actividad ---

func (s *Server) listActividad(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(u, permisos.GestionUsuarios, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	eventos, err := s.st.ListActividad(strings.TrimSpace(r.URL.Query().Get("recurso")))
	if err != nil {
		errorDatos(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"eventos": eventos})
}
