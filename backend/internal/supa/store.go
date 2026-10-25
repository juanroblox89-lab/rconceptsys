package supa

import (
	"context"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"rconceptsys/backend/internal/store"
)

type SupabaseStore struct {
	client *Client
}

func NewSupabaseStore(c *Client) *SupabaseStore {
	return &SupabaseStore{client: c}
}

// Estructuras intermedias para PostgREST
type dbPerfil struct {
	ID       string `json:"id"`
	Correo   string `json:"correo"`
	Nombre   string `json:"nombre"`
	FotoPath string `json:"foto_path"`
	Estado   string `json:"estado"`
	EsAdmin  bool   `json:"es_admin"`
	CreadoEn string `json:"creado_en"`
}

type dbRol struct {
	ID     int    `json:"id"`
	Clave  string `json:"clave"`
	Nombre string `json:"nombre"`
	Color  string `json:"color"`
	Orden  int    `json:"orden"`
	Activo bool   `json:"activo"`
}

type dbPerfilRol struct {
	PerfilID string `json:"perfil_id"`
	RolID    int    `json:"rol_id"`
	Rol      *dbRol `json:"roles"`
}

type dbChatMensaje struct {
	ID        int64     `json:"id"`
	AutorID   string    `json:"autor_id"`
	Cuerpo    string    `json:"cuerpo"`
	CreadoEn  string    `json:"creado_en"`
	EditadoEn *string   `json:"editado_en"`
	BorradoEn *string   `json:"borrado_en"`
	Autor     *dbPerfil `json:"perfiles"`
}

func convertirPerfil(dp *dbPerfil, roles []store.Rol) *store.Perfil {
	if dp == nil {
		return nil
	}
	t, _ := time.Parse(time.RFC3339, dp.CreadoEn)
	var foto *string
	if dp.FotoPath != "" {
		foto = &dp.FotoPath
	}
	return &store.Perfil{
		ID:       dp.ID,
		Correo:   dp.Correo,
		Nombre:   dp.Nombre,
		FotoPath: foto,
		Estado:   store.EstadoPerfil(dp.Estado),
		EsAdmin:  dp.EsAdmin,
		CreadoEn: t,
		Roles:    roles,
	}
}

func (s *SupabaseStore) obtenerRolesDePerfil(ctx context.Context, perfilID string) ([]store.Rol, error) {
	q := url.Values{}
	q.Set("perfil_id", "eq."+perfilID)
	q.Set("select", "rol_id,roles(*)")

	var prs []dbPerfilRol
	err := s.client.REST(ctx, "GET", "perfil_roles", q, nil, "", &prs)
	if err != nil {
		return nil, err
	}

	var res []store.Rol
	for _, pr := range prs {
		if pr.Rol != nil && pr.Rol.Activo {
			res = append(res, store.Rol{
				ID:     pr.Rol.ID,
				Clave:  pr.Rol.Clave,
				Nombre: pr.Rol.Nombre,
				Color:  pr.Rol.Color,
				Orden:  pr.Rol.Orden,
				Activo: pr.Rol.Activo,
			})
		}
	}
	sort.Slice(res, func(i, j int) bool {
		return res[i].Orden < res[j].Orden
	})
	return res, nil
}

func (s *SupabaseStore) ObtenerPerfilPorID(ctx context.Context, id string) (*store.Perfil, error) {
	q := url.Values{}
	q.Set("id", "eq."+id)
	q.Set("select", "*")

	var rows []dbPerfil
	if err := s.client.REST(ctx, "GET", "perfiles", q, nil, "", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}

	roles, _ := s.obtenerRolesDePerfil(ctx, id)
	return convertirPerfil(&rows[0], roles), nil
}

func (s *SupabaseStore) ObtenerPerfilPorCorreo(ctx context.Context, correo string) (*store.Perfil, error) {
	q := url.Values{}
	q.Set("correo", "ilike."+strings.TrimSpace(correo))
	q.Set("select", "*")

	var rows []dbPerfil
	if err := s.client.REST(ctx, "GET", "perfiles", q, nil, "", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}

	roles, _ := s.obtenerRolesDePerfil(ctx, rows[0].ID)
	return convertirPerfil(&rows[0], roles), nil
}

func (s *SupabaseStore) CrearOActualizarPerfil(ctx context.Context, perfil *store.Perfil) error {
	payload := map[string]any{
		"id":       perfil.ID,
		"correo":   perfil.Correo,
		"nombre":   perfil.Nombre,
		"estado":   string(perfil.Estado),
		"es_admin": perfil.EsAdmin,
	}
	if perfil.FotoPath != nil {
		payload["foto_path"] = *perfil.FotoPath
	}

	q := url.Values{}
	q.Set("on_conflict", "id")
	return s.client.REST(ctx, "POST", "perfiles", q, payload, "resolution=merge-duplicates", nil)
}

func (s *SupabaseStore) ActualizarNombre(ctx context.Context, id string, nombre string) (*store.Perfil, error) {
	q := url.Values{}
	q.Set("id", "eq."+id)

	payload := map[string]any{
		"nombre": strings.TrimSpace(nombre),
	}
	var rows []dbPerfil
	if err := s.client.REST(ctx, "PATCH", "perfiles", q, payload, "return=representation", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	roles, _ := s.obtenerRolesDePerfil(ctx, id)
	return convertirPerfil(&rows[0], roles), nil
}

func (s *SupabaseStore) ActualizarFoto(ctx context.Context, id string, fotoPath string) (*store.Perfil, error) {
	q := url.Values{}
	q.Set("id", "eq."+id)

	payload := map[string]any{
		"foto_path": fotoPath,
	}
	var rows []dbPerfil
	if err := s.client.REST(ctx, "PATCH", "perfiles", q, payload, "return=representation", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	roles, _ := s.obtenerRolesDePerfil(ctx, id)
	return convertirPerfil(&rows[0], roles), nil
}

func (s *SupabaseStore) ListarEquipo(ctx context.Context) ([]*store.Perfil, error) {
	q := url.Values{}
	q.Set("estado", "eq.aprobado")
	q.Set("order", "nombre.asc")
	q.Set("select", "*")

	var rows []dbPerfil
	if err := s.client.REST(ctx, "GET", "perfiles", q, nil, "", &rows); err != nil {
		return nil, err
	}

	var equipo []*store.Perfil
	for i := range rows {
		roles, _ := s.obtenerRolesDePerfil(ctx, rows[i].ID)
		equipo = append(equipo, convertirPerfil(&rows[i], roles))
	}
	return equipo, nil
}

func (s *SupabaseStore) ObtenerMiembroEquipo(ctx context.Context, id string) (*store.Perfil, error) {
	q := url.Values{}
	q.Set("id", "eq."+id)
	q.Set("estado", "eq.aprobado")
	q.Set("select", "*")

	var rows []dbPerfil
	if err := s.client.REST(ctx, "GET", "perfiles", q, nil, "", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}

	roles, _ := s.obtenerRolesDePerfil(ctx, id)
	return convertirPerfil(&rows[0], roles), nil
}

func (s *SupabaseStore) ListarMensajesChat(ctx context.Context, antesID int64, despuesID int64, limite int) ([]*store.ChatMensaje, error) {
	if limite <= 0 || limite > 100 {
		limite = 40
	}

	q := url.Values{}
	q.Set("borrado_en", "is.null")
	if despuesID > 0 {
		q.Set("id", "gt."+strconv.FormatInt(despuesID, 10))
		q.Set("order", "id.asc")
	} else {
		if antesID > 0 {
			q.Set("id", "lt."+strconv.FormatInt(antesID, 10))
		}
		q.Set("order", "id.desc")
	}
	q.Set("limit", strconv.Itoa(limite))
	q.Set("select", "id,autor_id,cuerpo,creado_en,editado_en,borrado_en,perfiles(*)")

	var rows []dbChatMensaje
	if err := s.client.REST(ctx, "GET", "chat_mensajes", q, nil, "", &rows); err != nil {
		return nil, err
	}

	var res []*store.ChatMensaje
	for i := range rows {
		item := &rows[i]
		t, _ := time.Parse(time.RFC3339, item.CreadoEn)
		var editT *time.Time
		if item.EditadoEn != nil {
			et, _ := time.Parse(time.RFC3339, *item.EditadoEn)
			editT = &et
		}

		var autor *store.Perfil
		if item.Autor != nil {
			roles, _ := s.obtenerRolesDePerfil(ctx, item.Autor.ID)
			autor = convertirPerfil(item.Autor, roles)
		}

		res = append(res, &store.ChatMensaje{
			ID:        item.ID,
			AutorID:   item.AutorID,
			Autor:     autor,
			Cuerpo:    item.Cuerpo,
			CreadoEn:  t,
			EditadoEn: editT,
		})
	}
	return res, nil
}

func (s *SupabaseStore) CrearMensajeChat(ctx context.Context, autorID string, cuerpo string) (*store.ChatMensaje, error) {
	payload := map[string]any{
		"autor_id": autorID,
		"cuerpo":   cuerpo,
	}

	q := url.Values{}
	q.Set("select", "id,autor_id,cuerpo,creado_en,editado_en,borrado_en,perfiles(*)")

	var rows []dbChatMensaje
	if err := s.client.REST(ctx, "POST", "chat_mensajes", q, payload, "return=representation", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrValidation
	}

	item := &rows[0]
	t, _ := time.Parse(time.RFC3339, item.CreadoEn)
	roles, _ := s.obtenerRolesDePerfil(ctx, item.AutorID)
	autor := convertirPerfil(item.Autor, roles)

	return &store.ChatMensaje{
		ID:       item.ID,
		AutorID:  item.AutorID,
		Autor:    autor,
		Cuerpo:   item.Cuerpo,
		CreadoEn: t,
	}, nil
}

func (s *SupabaseStore) ListarRoles(ctx context.Context, soloActivos bool) ([]*store.Rol, error) {
	q := url.Values{}
	if soloActivos {
		q.Set("activo", "eq.true")
	}
	q.Set("order", "orden.asc")
	q.Set("select", "*")

	var rows []dbRol
	if err := s.client.REST(ctx, "GET", "roles", q, nil, "", &rows); err != nil {
		return nil, err
	}

	var lista []*store.Rol
	for i := range rows {
		r := &rows[i]
		lista = append(lista, &store.Rol{
			ID:     r.ID,
			Clave:  r.Clave,
			Nombre: r.Nombre,
			Color:  r.Color,
			Orden:  r.Orden,
			Activo: r.Activo,
		})
	}
	return lista, nil
}

func (s *SupabaseStore) CrearRol(ctx context.Context, rol *store.Rol) (*store.Rol, error) {
	payload := map[string]any{
		"clave":  rol.Clave,
		"nombre": rol.Nombre,
		"color":  rol.Color,
		"orden":  rol.Orden,
		"activo": rol.Activo,
	}

	var rows []dbRol
	q := url.Values{}
	q.Set("select", "*")
	if err := s.client.REST(ctx, "POST", "roles", q, payload, "return=representation", &rows); err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "23505") {
			return nil, store.ErrConflict
		}
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrValidation
	}
	r := &rows[0]
	return &store.Rol{
		ID:     r.ID,
		Clave:  r.Clave,
		Nombre: r.Nombre,
		Color:  r.Color,
		Orden:  r.Orden,
		Activo: r.Activo,
	}, nil
}

func (s *SupabaseStore) ActualizarRol(ctx context.Context, id int, campos map[string]any) (*store.Rol, error) {
	q := url.Values{}
	q.Set("id", fmt.Sprintf("eq.%d", id))
	q.Set("select", "*")

	var rows []dbRol
	if err := s.client.REST(ctx, "PATCH", "roles", q, campos, "return=representation", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	r := &rows[0]
	return &store.Rol{
		ID:     r.ID,
		Clave:  r.Clave,
		Nombre: r.Nombre,
		Color:  r.Color,
		Orden:  r.Orden,
		Activo: r.Activo,
	}, nil
}

func (s *SupabaseStore) ListarMiembros(ctx context.Context, filtro store.FiltroMiembros) ([]*store.Perfil, error) {
	q := url.Values{}
	if filtro.Estado != nil {
		q.Set("estado", "eq."+string(*filtro.Estado))
	}
	q.Set("order", "creado_en.asc")
	q.Set("select", "*")

	var rows []dbPerfil
	if err := s.client.REST(ctx, "GET", "perfiles", q, nil, "", &rows); err != nil {
		return nil, err
	}

	var res []*store.Perfil
	for i := range rows {
		roles, _ := s.obtenerRolesDePerfil(ctx, rows[i].ID)
		res = append(res, convertirPerfil(&rows[i], roles))
	}
	return res, nil
}

func (s *SupabaseStore) AprobarMiembro(ctx context.Context, id string) (*store.Perfil, error) {
	return s.cambiarEstado(ctx, id, store.EstadoAprobado)
}

func (s *SupabaseStore) SuspenderMiembro(ctx context.Context, id string) (*store.Perfil, error) {
	return s.cambiarEstado(ctx, id, store.EstadoSuspendido)
}

func (s *SupabaseStore) ReactivarMiembro(ctx context.Context, id string) (*store.Perfil, error) {
	return s.cambiarEstado(ctx, id, store.EstadoAprobado)
}

func (s *SupabaseStore) cambiarEstado(ctx context.Context, id string, estado store.EstadoPerfil) (*store.Perfil, error) {
	q := url.Values{}
	q.Set("id", "eq."+id)
	q.Set("select", "*")

	payload := map[string]any{"estado": string(estado)}
	var rows []dbPerfil
	if err := s.client.REST(ctx, "PATCH", "perfiles", q, payload, "return=representation", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	roles, _ := s.obtenerRolesDePerfil(ctx, id)
	return convertirPerfil(&rows[0], roles), nil
}

func (s *SupabaseStore) AsignarRolesMiembro(ctx context.Context, id string, rolIDs []int) (*store.Perfil, error) {
	// Borrar roles previos
	delQ := url.Values{}
	delQ.Set("perfil_id", "eq."+id)
	_ = s.client.REST(ctx, "DELETE", "perfil_roles", delQ, nil, "", nil)

	// Insertar nuevos
	if len(rolIDs) > 0 {
		var ins []map[string]any
		for _, rID := range rolIDs {
			ins = append(ins, map[string]any{
				"perfil_id": id,
				"rol_id":    rID,
			})
		}
		_ = s.client.REST(ctx, "POST", "perfil_roles", url.Values{}, ins, "", nil)
	}

	return s.ObtenerPerfilPorID(ctx, id)
}

func (s *SupabaseStore) contarAdmins(ctx context.Context) (int, error) {
	q := url.Values{}
	q.Set("es_admin", "eq.true")
	q.Set("estado", "eq.aprobado")
	q.Set("select", "id")

	var rows []map[string]any
	if err := s.client.REST(ctx, "GET", "perfiles", q, nil, "", &rows); err != nil {
		return 0, err
	}
	return len(rows), nil
}

func (s *SupabaseStore) CambiarEsAdmin(ctx context.Context, id string, esAdmin bool) (*store.Perfil, error) {
	if !esAdmin {
		actual, err := s.ObtenerPerfilPorID(ctx, id)
		if err != nil {
			return nil, err
		}
		if actual.EsAdmin {
			cnt, err := s.contarAdmins(ctx)
			if err != nil {
				return nil, err
			}
			if cnt <= 1 {
				return nil, store.ErrLastAdmin
			}
		}
	}

	q := url.Values{}
	q.Set("id", "eq."+id)
	q.Set("select", "*")

	payload := map[string]any{"es_admin": esAdmin}
	var rows []dbPerfil
	if err := s.client.REST(ctx, "PATCH", "perfiles", q, payload, "return=representation", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	roles, _ := s.obtenerRolesDePerfil(ctx, id)
	return convertirPerfil(&rows[0], roles), nil
}

func (s *SupabaseStore) GuardarAvatar(ctx context.Context, nombreArchivo string, datos []byte, contentType string) (string, error) {
	if err := s.client.UploadStorage(ctx, "avatares", nombreArchivo, datos, contentType); err != nil {
		return "", err
	}
	return fmt.Sprintf("%s/storage/v1/object/public/avatares/%s", s.client.baseURL, nombreArchivo), nil
}

// SupabaseAuthVerifier valida JWTs contra Supabase Auth
type SupabaseAuthVerifier struct {
	client      *Client
	store       store.Store
	adminEmails []string
	cacheMu     sync.RWMutex
	tokenCache  map[string]*tokenCacheEntry
}

type tokenCacheEntry struct {
	perfil   *store.Perfil
	expiraEn time.Time
}

func NewSupabaseAuthVerifier(c *Client, s store.Store, adminEmails []string) *SupabaseAuthVerifier {
	return &SupabaseAuthVerifier{
		client:      c,
		store:       s,
		adminEmails: adminEmails,
		tokenCache:  make(map[string]*tokenCacheEntry),
	}
}

func (v *SupabaseAuthVerifier) esAdminEmail(email string) bool {
	eNorm := strings.ToLower(strings.TrimSpace(email))
	for _, admin := range v.adminEmails {
		if strings.ToLower(strings.TrimSpace(admin)) == eNorm {
			return true
		}
	}
	return false
}

func (v *SupabaseAuthVerifier) VerificarToken(ctx context.Context, token string) (*store.Perfil, error) {
	v.cacheMu.RLock()
	entry, ok := v.tokenCache[token]
	v.cacheMu.RUnlock()
	if ok && entry.expiraEn.After(time.Now()) {
		return entry.perfil, nil
	}

	userData, err := v.client.AuthUser(ctx, token)
	if err != nil {
		return nil, store.ErrUnauthorized
	}

	id, _ := userData["id"].(string)
	email, _ := userData["email"].(string)
	if id == "" {
		return nil, store.ErrUnauthorized
	}

	p, err := v.store.ObtenerPerfilPorID(ctx, id)
	if err != nil {
		p = &store.Perfil{
			ID:       id,
			Correo:   email,
			Nombre:   email,
			Estado:   store.EstadoPendiente,
			EsAdmin:  false,
			CreadoEn: time.Now(),
		}
		_ = v.store.CrearOActualizarPerfil(ctx, p)
	}

	if v.esAdminEmail(p.Correo) && (!p.EsAdmin || p.Estado != store.EstadoAprobado) {
		p.EsAdmin = true
		p.Estado = store.EstadoAprobado
		_ = v.store.CrearOActualizarPerfil(ctx, p)
	}

	v.cacheMu.Lock()
	v.tokenCache[token] = &tokenCacheEntry{
		perfil:   p,
		expiraEn: time.Now().Add(10 * time.Second),
	}
	v.cacheMu.Unlock()

	return p, nil
}

func (v *SupabaseAuthVerifier) RefrescarToken(ctx context.Context, refreshToken string) (*TokenResponse, error) {
	return v.client.TokenRefresh(ctx, refreshToken)
}

func (v *SupabaseAuthVerifier) Login(ctx context.Context, email, password string) (*TokenResponse, *store.Perfil, error) {
	tok, err := v.client.TokenPassword(ctx, email, password)
	if err != nil {
		return nil, nil, store.ErrUnauthorized
	}

	p, err := v.VerificarToken(ctx, tok.AccessToken)
	if err != nil {
		return nil, nil, err
	}
	return tok, p, nil
}

func (v *SupabaseAuthVerifier) Registro(ctx context.Context, email, password, nombre string) (*store.Perfil, error) {
	// Verificar si ya existe en la base
	eNorm := strings.ToLower(strings.TrimSpace(email))
	if _, err := v.store.ObtenerPerfilPorCorreo(ctx, eNorm); err == nil {
		return nil, store.ErrConflict
	}

	// Crear usuario en Supabase Auth Admin API (email_confirm: true, sin emails)
	userID, err := v.client.AdminCreateUser(ctx, eNorm, password, nombre)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "already") || strings.Contains(strings.ToLower(err.Error()), "registered") {
			return nil, store.ErrConflict
		}
		return nil, err
	}

	esAdmin := v.esAdminEmail(eNorm)
	estado := store.EstadoPendiente
	if esAdmin {
		estado = store.EstadoAprobado
	}

	perfil := &store.Perfil{
		ID:       userID,
		Correo:   eNorm,
		Nombre:   strings.TrimSpace(nombre),
		Estado:   estado,
		EsAdmin:  esAdmin,
		CreadoEn: time.Now(),
	}

	if err := v.store.CrearOActualizarPerfil(ctx, perfil); err != nil {
		return nil, err
	}

	return perfil, nil
}
