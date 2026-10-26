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

// Modelos DB PostgREST para F2 y F3
type dbCliente struct {
	ID       int    `json:"id"`
	Nombre   string `json:"nombre"`
	Activo   bool   `json:"activo"`
	CreadoEn string `json:"creado_en"`
}

type dbTipoTrabajo struct {
	ID       int    `json:"id"`
	Clave    string `json:"clave"`
	Nombre   string `json:"nombre"`
	RolID    *int   `json:"rol_id"`
	Precio   int    `json:"precio"`
	Unidad   string `json:"unidad"`
	Activo   bool   `json:"activo"`
	Orden    int    `json:"orden"`
	CreadoEn string `json:"creado_en"`
	Rol      *dbRol `json:"roles"`
}

type dbTarea struct {
	ID                      int64          `json:"id"`
	TipoID                  int            `json:"tipo_id"`
	ClienteID               *int           `json:"cliente_id"`
	Titulo                  string         `json:"titulo"`
	Descripcion             *string        `json:"descripcion"`
	AsignadoA               string         `json:"asignado_a"`
	CreadoPor               string         `json:"creado_por"`
	Estado                  string         `json:"estado"`
	FechaLimite             *string        `json:"fecha_limite"`
	NotaPersona             *string        `json:"nota_persona"`
	MotivoRechazo           *string        `json:"motivo_rechazo"`
	Cantidad                *int           `json:"cantidad"`
	CantidadAceptada        *int           `json:"cantidad_aceptada"`
	PrecioUnitarioCongelado *int64         `json:"precio_unitario_congelado"`
	PrecioCongelado         *int64         `json:"precio_congelado"`
	FacturaID               *int64         `json:"factura_id"`
	CreadaEn                string         `json:"creada_en"`
	HechaEn                 *string        `json:"hecha_en"`
	ResueltaEn              *string        `json:"resuelta_en"`
	ResueltaPor             *string        `json:"resuelta_por"`
	Tipo                    *dbTipoTrabajo `json:"tipos_trabajo"`
	Cliente                 *dbCliente     `json:"clientes"`
	Asignado                *dbPerfil      `json:"asignado"`
	Creador                 *dbPerfil      `json:"creador"`
}

type dbFactura struct {
	ID        int64     `json:"id"`
	PerfilID  string    `json:"perfil_id"`
	Estado    string    `json:"estado"`
	CreadaEn  string    `json:"creada_en"`
	PagadaEn  *string   `json:"pagada_en"`
	PagadaPor *string   `json:"pagada_por"`
	Perfil    *dbPerfil `json:"perfiles"`
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

	var res []*store.ChatMensaje = make([]*store.ChatMensaje, 0)
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

// ==========================================
// F2: Métodos de SupabaseStore
// ==========================================

func convertirTipoTrabajo(dt *dbTipoTrabajo) *store.TipoTrabajo {
	if dt == nil {
		return nil
	}
	t, _ := time.Parse(time.RFC3339, dt.CreadoEn)
	unidad := dt.Unidad
	if unidad == "" {
		unidad = "trabajo"
	}
	res := &store.TipoTrabajo{
		ID:       dt.ID,
		Clave:    dt.Clave,
		Nombre:   dt.Nombre,
		RolID:    dt.RolID,
		Precio:   dt.Precio,
		Unidad:   unidad,
		Activo:   dt.Activo,
		Orden:    dt.Orden,
		CreadoEn: t,
	}
	if dt.Rol != nil {
		res.Rol = &store.Rol{
			ID:     dt.Rol.ID,
			Clave:  dt.Rol.Clave,
			Nombre: dt.Rol.Nombre,
			Color:  dt.Rol.Color,
			Orden:  dt.Rol.Orden,
			Activo: dt.Rol.Activo,
		}
	}
	return res
}

func convertirCliente(dc *dbCliente) *store.Cliente {
	if dc == nil {
		return nil
	}
	t, _ := time.Parse(time.RFC3339, dc.CreadoEn)
	return &store.Cliente{
		ID:       dc.ID,
		Nombre:   dc.Nombre,
		Activo:   dc.Activo,
		CreadoEn: t,
	}
}

func parseTimePtr(s *string) *time.Time {
	if s == nil || *s == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339, *s)
	if err != nil {
		return nil
	}
	return &t
}

func convertirTarea(dt *dbTarea) *store.Tarea {
	if dt == nil {
		return nil
	}
	creadaEn, _ := time.Parse(time.RFC3339, dt.CreadaEn)
	res := &store.Tarea{
		ID:                      dt.ID,
		TipoID:                  dt.TipoID,
		ClienteID:               dt.ClienteID,
		Titulo:                  dt.Titulo,
		Descripcion:             dt.Descripcion,
		AsignadoA:               dt.AsignadoA,
		CreadoPor:               dt.CreadoPor,
		Estado:                  store.EstadoTarea(dt.Estado),
		FechaLimite:             dt.FechaLimite,
		NotaPersona:             dt.NotaPersona,
		MotivoRechazo:           dt.MotivoRechazo,
		Cantidad:                dt.Cantidad,
		CantidadAceptada:        dt.CantidadAceptada,
		PrecioUnitarioCongelado: dt.PrecioUnitarioCongelado,
		PrecioCongelado:         dt.PrecioCongelado,
		FacturaID:               dt.FacturaID,
		CreadaEn:                creadaEn,
		HechaEn:                 parseTimePtr(dt.HechaEn),
		ResueltaEn:              parseTimePtr(dt.ResueltaEn),
		ResueltaPor:             dt.ResueltaPor,
		Tipo:                    convertirTipoTrabajo(dt.Tipo),
		Cliente:                 convertirCliente(dt.Cliente),
	}
	if dt.Asignado != nil {
		res.Asignado = convertirPerfil(dt.Asignado, nil)
	}
	if dt.Creador != nil {
		res.Creador = convertirPerfil(dt.Creador, nil)
	}
	return res
}

func (s *SupabaseStore) ListarTiposTrabajo(ctx context.Context, soloActivos bool) ([]*store.TipoTrabajo, error) {
	q := url.Values{}
	q.Set("select", "*,roles(*)")
	if soloActivos {
		q.Set("activo", "eq.true")
	}
	q.Set("order", "orden.asc,id.asc")

	var rows []dbTipoTrabajo
	if err := s.client.REST(ctx, "GET", "tipos_trabajo", q, nil, "", &rows); err != nil {
		return nil, err
	}
	res := make([]*store.TipoTrabajo, len(rows))
	for i := range rows {
		res[i] = convertirTipoTrabajo(&rows[i])
	}
	return res, nil
}

func (s *SupabaseStore) ObtenerTipoTrabajoPorID(ctx context.Context, id int) (*store.TipoTrabajo, error) {
	q := url.Values{}
	q.Set("id", fmt.Sprintf("eq.%d", id))
	q.Set("select", "*,roles(*)")

	var rows []dbTipoTrabajo
	if err := s.client.REST(ctx, "GET", "tipos_trabajo", q, nil, "", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	return convertirTipoTrabajo(&rows[0]), nil
}

func (s *SupabaseStore) CrearTipoTrabajo(ctx context.Context, t *store.TipoTrabajo) (*store.TipoTrabajo, error) {
	unidad := "trabajo"
	if t.Unidad != "" {
		unidad = t.Unidad
	}
	payload := map[string]any{
		"clave":  strings.ToLower(strings.TrimSpace(t.Clave)),
		"nombre": strings.TrimSpace(t.Nombre),
		"rol_id": t.RolID,
		"precio": t.Precio,
		"unidad": unidad,
		"activo": t.Activo,
		"orden":  t.Orden,
	}
	var rows []dbTipoTrabajo
	q := url.Values{}
	q.Set("select", "*,roles(*)")
	if err := s.client.REST(ctx, "POST", "tipos_trabajo", q, payload, "return=representation", &rows); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "23505") || strings.Contains(strings.ToLower(err.Error()), "duplicate") || strings.Contains(strings.ToLower(err.Error()), "conflict") {
			return nil, store.ErrConflict
		}
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	return convertirTipoTrabajo(&rows[0]), nil
}

func (s *SupabaseStore) ActualizarTipoTrabajo(ctx context.Context, id int, campos map[string]any) (*store.TipoTrabajo, error) {
	q := url.Values{}
	q.Set("id", fmt.Sprintf("eq.%d", id))
	q.Set("select", "*,roles(*)")

	var rows []dbTipoTrabajo
	if err := s.client.REST(ctx, "PATCH", "tipos_trabajo", q, campos, "return=representation", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	return convertirTipoTrabajo(&rows[0]), nil
}

func (s *SupabaseStore) CrearTarea(ctx context.Context, t *store.Tarea) (*store.Tarea, error) {
	payload := map[string]any{
		"tipo_id":      t.TipoID,
		"cliente_id":   t.ClienteID,
		"titulo":       strings.TrimSpace(t.Titulo),
		"descripcion":  t.Descripcion,
		"asignado_a":   t.AsignadoA,
		"creado_por":   t.CreadoPor,
		"estado":       store.EstadoTareaPendiente,
		"fecha_limite": t.FechaLimite,
		"cantidad":     t.Cantidad,
	}
	var rows []dbTarea
	q := url.Values{}
	q.Set("select", "*,tipos_trabajo(*,roles(*)),clientes(*),asignado:perfiles!tareas_asignado_a_fkey(*),creador:perfiles!tareas_creado_por_fkey(*)")
	if err := s.client.REST(ctx, "POST", "tareas", q, payload, "return=representation", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	return convertirTarea(&rows[0]), nil
}

func (s *SupabaseStore) ObtenerTareaPorID(ctx context.Context, id int64) (*store.Tarea, error) {
	q := url.Values{}
	q.Set("id", fmt.Sprintf("eq.%d", id))
	q.Set("select", "*,tipos_trabajo(*,roles(*)),clientes(*),asignado:perfiles!tareas_asignado_a_fkey(*),creador:perfiles!tareas_creado_por_fkey(*)")

	var rows []dbTarea
	if err := s.client.REST(ctx, "GET", "tareas", q, nil, "", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	return convertirTarea(&rows[0]), nil
}

func (s *SupabaseStore) ListarTareas(ctx context.Context, filtro store.FiltroTareas) ([]*store.Tarea, error) {
	q := url.Values{}
	q.Set("select", "*,tipos_trabajo(*,roles(*)),clientes(*),asignado:perfiles!tareas_asignado_a_fkey(*),creador:perfiles!tareas_creado_por_fkey(*)")
	if filtro.Estado != nil {
		q.Set("estado", fmt.Sprintf("eq.%s", *filtro.Estado))
	}
	if filtro.AsignadoA != nil {
		q.Set("asignado_a", fmt.Sprintf("eq.%s", *filtro.AsignadoA))
	}
	if filtro.ClienteID != nil {
		q.Set("cliente_id", fmt.Sprintf("eq.%d", *filtro.ClienteID))
	}
	q.Set("order", "creada_en.desc")

	var rows []dbTarea
	if err := s.client.REST(ctx, "GET", "tareas", q, nil, "", &rows); err != nil {
		return nil, err
	}
	res := make([]*store.Tarea, len(rows))
	for i := range rows {
		res[i] = convertirTarea(&rows[i])
	}
	return res, nil
}

func (s *SupabaseStore) ContarTareasPorRevisar(ctx context.Context) (int, error) {
	q := url.Values{}
	q.Set("estado", "eq.hecha")
	q.Set("select", "id")

	var rows []struct {
		ID int64 `json:"id"`
	}
	if err := s.client.REST(ctx, "GET", "tareas", q, nil, "", &rows); err != nil {
		return 0, err
	}
	return len(rows), nil
}

func (s *SupabaseStore) MarcarTareaHecha(ctx context.Context, id int64, asignadoID string, nota *string, cantidad *int) (*store.Tarea, error) {
	tarea, err := s.ObtenerTareaPorID(ctx, id)
	if err != nil {
		return nil, err
	}
	if tarea.AsignadoA != asignadoID {
		return nil, store.ErrForbidden
	}
	if tarea.Estado != store.EstadoTareaPendiente && tarea.Estado != store.EstadoTareaRechazada {
		return nil, fmt.Errorf("%w: la tarea no está en estado pendiente ni rechazada", store.ErrValidation)
	}

	payload := map[string]any{
		"estado":         store.EstadoTareaHecha,
		"hecha_en":       time.Now().Format(time.RFC3339),
		"nota_persona":   nota,
		"motivo_rechazo": nil,
	}

	if tarea.Tipo != nil && tarea.Tipo.Unidad == "minuto" {
		if cantidad == nil || *cantidad < 1 || *cantidad > 1440 {
			return nil, fmt.Errorf("%w: los minutos deben estar entre 1 y 1440", store.ErrValidation)
		}
		payload["cantidad"] = *cantidad
	} else {
		payload["cantidad"] = nil
	}

	q := url.Values{}
	q.Set("id", fmt.Sprintf("eq.%d", id))
	q.Set("select", "*,tipos_trabajo(*,roles(*)),clientes(*),asignado:perfiles!tareas_asignado_a_fkey(*),creador:perfiles!tareas_creado_por_fkey(*)")

	var rows []dbTarea
	if err := s.client.REST(ctx, "PATCH", "tareas", q, payload, "return=representation", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	return convertirTarea(&rows[0]), nil
}

func (s *SupabaseStore) AceptarTarea(ctx context.Context, id int64, adminID string, cantidad *int) (*store.Tarea, error) {
	payload := map[string]any{
		"p_tarea": id,
		"p_admin": adminID,
	}
	if cantidad != nil {
		payload["p_cantidad"] = *cantidad
	}
	var res map[string]any
	if err := s.client.RPC(ctx, "aceptar_tarea", payload, &res); err != nil {
		return nil, err
	}
	return s.ObtenerTareaPorID(ctx, id)
}

func (s *SupabaseStore) RechazarTarea(ctx context.Context, id int64, adminID string, motivo string) (*store.Tarea, error) {
	tarea, err := s.ObtenerTareaPorID(ctx, id)
	if err != nil {
		return nil, err
	}
	if tarea.Estado != store.EstadoTareaHecha {
		return nil, fmt.Errorf("%w: solo se pueden rechazar tareas en estado hecha", store.ErrValidation)
	}

	payload := map[string]any{
		"estado":         store.EstadoTareaRechazada,
		"motivo_rechazo": motivo,
		"resuelta_en":    time.Now().Format(time.RFC3339),
		"resuelta_por":   adminID,
	}
	q := url.Values{}
	q.Set("id", fmt.Sprintf("eq.%d", id))
	q.Set("select", "*,tipos_trabajo(*,roles(*)),clientes(*),asignado:perfiles!tareas_asignado_a_fkey(*),creador:perfiles!tareas_creado_por_fkey(*)")

	var rows []dbTarea
	if err := s.client.REST(ctx, "PATCH", "tareas", q, payload, "return=representation", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	return convertirTarea(&rows[0]), nil
}

func (s *SupabaseStore) CancelarTarea(ctx context.Context, id int64, adminID string) (*store.Tarea, error) {
	tarea, err := s.ObtenerTareaPorID(ctx, id)
	if err != nil {
		return nil, err
	}
	if tarea.Estado != store.EstadoTareaPendiente && tarea.Estado != store.EstadoTareaRechazada {
		return nil, fmt.Errorf("%w: solo se pueden cancelar tareas en estado pendiente o rechazada", store.ErrValidation)
	}

	payload := map[string]any{
		"estado":       store.EstadoTareaCancelada,
		"resuelta_en":  time.Now().Format(time.RFC3339),
		"resuelta_por": adminID,
	}
	q := url.Values{}
	q.Set("id", fmt.Sprintf("eq.%d", id))
	q.Set("select", "*,tipos_trabajo(*,roles(*)),clientes(*),asignado:perfiles!tareas_asignado_a_fkey(*),creador:perfiles!tareas_creado_por_fkey(*)")

	var rows []dbTarea
	if err := s.client.REST(ctx, "PATCH", "tareas", q, payload, "return=representation", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	return convertirTarea(&rows[0]), nil
}

func (s *SupabaseStore) cargarLineasFactura(ctx context.Context, f *store.Factura) error {
	q := url.Values{}
	q.Set("factura_id", fmt.Sprintf("eq.%d", f.ID))
	q.Set("estado", "eq.aceptada")
	q.Set("select", "*,tipos_trabajo(*,roles(*)),clientes(*),asignado:perfiles!tareas_asignado_a_fkey(*),creador:perfiles!tareas_creado_por_fkey(*)")
	q.Set("order", "id.asc")

	var rows []dbTarea
	if err := s.client.REST(ctx, "GET", "tareas", q, nil, "", &rows); err != nil {
		return err
	}
	var total int64 = 0
	lineas := make([]*store.Tarea, len(rows))
	for i := range rows {
		t := convertirTarea(&rows[i])
		lineas[i] = t
		if t.PrecioCongelado != nil {
			total += *t.PrecioCongelado
		}
	}
	f.Lineas = lineas
	f.Total = total
	return nil
}

func (s *SupabaseStore) ObtenerFacturaAbierta(ctx context.Context, perfilID string) (*store.Factura, error) {
	q := url.Values{}
	q.Set("perfil_id", fmt.Sprintf("eq.%s", perfilID))
	q.Set("estado", "eq.abierta")
	q.Set("select", "*,perfiles:perfiles!facturas_perfil_id_fkey(*)")

	var rows []dbFactura
	if err := s.client.REST(ctx, "GET", "facturas", q, nil, "", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}

	creadaEn, _ := time.Parse(time.RFC3339, rows[0].CreadaEn)
	f := &store.Factura{
		ID:        rows[0].ID,
		PerfilID:  rows[0].PerfilID,
		Estado:    store.EstadoFactura(rows[0].Estado),
		CreadaEn:  creadaEn,
		PagadaEn:  parseTimePtr(rows[0].PagadaEn),
		PagadaPor: rows[0].PagadaPor,
		Perfil:    convertirPerfil(rows[0].Perfil, nil),
	}
	if err := s.cargarLineasFactura(ctx, f); err != nil {
		return nil, err
	}
	return f, nil
}

func (s *SupabaseStore) ListarFacturasPerfil(ctx context.Context, perfilID string) ([]*store.Factura, error) {
	q := url.Values{}
	q.Set("perfil_id", fmt.Sprintf("eq.%s", perfilID))
	q.Set("select", "*,perfiles:perfiles!facturas_perfil_id_fkey(*)")
	q.Set("order", "creada_en.desc")

	var rows []dbFactura
	if err := s.client.REST(ctx, "GET", "facturas", q, nil, "", &rows); err != nil {
		return nil, err
	}
	res := make([]*store.Factura, len(rows))
	for i := range rows {
		creadaEn, _ := time.Parse(time.RFC3339, rows[i].CreadaEn)
		f := &store.Factura{
			ID:        rows[i].ID,
			PerfilID:  rows[i].PerfilID,
			Estado:    store.EstadoFactura(rows[i].Estado),
			CreadaEn:  creadaEn,
			PagadaEn:  parseTimePtr(rows[i].PagadaEn),
			PagadaPor: rows[i].PagadaPor,
			Perfil:    convertirPerfil(rows[i].Perfil, nil),
		}
		_ = s.cargarLineasFactura(ctx, f)
		res[i] = f
	}
	return res, nil
}

func (s *SupabaseStore) ObtenerFacturaPorID(ctx context.Context, id int64) (*store.Factura, error) {
	q := url.Values{}
	q.Set("id", fmt.Sprintf("eq.%d", id))
	q.Set("select", "*,perfiles:perfiles!facturas_perfil_id_fkey(*)")

	var rows []dbFactura
	if err := s.client.REST(ctx, "GET", "facturas", q, nil, "", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	creadaEn, _ := time.Parse(time.RFC3339, rows[0].CreadaEn)
	f := &store.Factura{
		ID:        rows[0].ID,
		PerfilID:  rows[0].PerfilID,
		Estado:    store.EstadoFactura(rows[0].Estado),
		CreadaEn:  creadaEn,
		PagadaEn:  parseTimePtr(rows[0].PagadaEn),
		PagadaPor: rows[0].PagadaPor,
		Perfil:    convertirPerfil(rows[0].Perfil, nil),
	}
	if err := s.cargarLineasFactura(ctx, f); err != nil {
		return nil, err
	}
	return f, nil
}

func (s *SupabaseStore) ListarResumenFacturasAdmin(ctx context.Context) ([]*store.ResumenFacturasPersona, error) {
	miembros, err := s.ListarMiembros(ctx, store.FiltroMiembros{})
	if err != nil {
		return nil, err
	}

	var res []*store.ResumenFacturasPersona
	for _, m := range miembros {
		if m.Estado != store.EstadoAprobado || m.EsAdmin {
			continue
		}
		facts, err := s.ListarFacturasPerfil(ctx, m.ID)
		if err != nil {
			return nil, err
		}
		item := &store.ResumenFacturasPersona{
			PerfilID: m.ID,
			Perfil:   m,
			Pagadas:  make([]*store.Factura, 0),
		}
		for _, f := range facts {
			if f.Estado == store.EstadoFacturaAbierta {
				item.FacturaAbierta = f
				item.TotalPendiente = f.Total
			} else if f.Estado == store.EstadoFacturaPagada {
				item.Pagadas = append(item.Pagadas, f)
				item.TotalPagado += f.Total
			}
		}
		res = append(res, item)
	}
	return res, nil
}

func (s *SupabaseStore) MarcarFacturaPagada(ctx context.Context, id int64, adminID string) (*store.Factura, error) {
	f, err := s.ObtenerFacturaPorID(ctx, id)
	if err != nil {
		return nil, err
	}
	if f.Estado != store.EstadoFacturaAbierta {
		return nil, fmt.Errorf("%w: solo se puede marcar pagada una factura abierta", store.ErrValidation)
	}

	payload := map[string]any{
		"estado":     store.EstadoFacturaPagada,
		"pagada_en":  time.Now().Format(time.RFC3339),
		"pagada_por": adminID,
	}
	q := url.Values{}
	q.Set("id", fmt.Sprintf("eq.%d", id))
	q.Set("select", "*,perfiles:perfiles!facturas_perfil_id_fkey(*)")

	var rows []dbFactura
	if err := s.client.REST(ctx, "PATCH", "facturas", q, payload, "return=representation", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	creadaEn, _ := time.Parse(time.RFC3339, rows[0].CreadaEn)
	res := &store.Factura{
		ID:        rows[0].ID,
		PerfilID:  rows[0].PerfilID,
		Estado:    store.EstadoFactura(rows[0].Estado),
		CreadaEn:  creadaEn,
		PagadaEn:  parseTimePtr(rows[0].PagadaEn),
		PagadaPor: rows[0].PagadaPor,
		Perfil:    convertirPerfil(rows[0].Perfil, nil),
	}
	if err := s.cargarLineasFactura(ctx, res); err != nil {
		return nil, err
	}
	return res, nil
}

// ==========================================
// F3: Implementación Clientes (Supabase)
// ==========================================

func (s *SupabaseStore) ListarClientes(ctx context.Context, soloActivos bool) ([]*store.Cliente, error) {
	q := url.Values{}
	q.Set("select", "*")
	if soloActivos {
		q.Set("activo", "eq.true")
	}
	q.Set("order", "nombre.asc")

	var rows []dbCliente
	if err := s.client.REST(ctx, "GET", "clientes", q, nil, "", &rows); err != nil {
		return nil, err
	}
	res := make([]*store.Cliente, len(rows))
	for i := range rows {
		res[i] = convertirCliente(&rows[i])
	}
	return res, nil
}

func (s *SupabaseStore) ObtenerClientePorID(ctx context.Context, id int) (*store.Cliente, error) {
	q := url.Values{}
	q.Set("id", fmt.Sprintf("eq.%d", id))
	q.Set("select", "*")

	var rows []dbCliente
	if err := s.client.REST(ctx, "GET", "clientes", q, nil, "", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	return convertirCliente(&rows[0]), nil
}

func (s *SupabaseStore) CrearCliente(ctx context.Context, nombre string) (*store.Cliente, error) {
	nombreLimpio := strings.TrimSpace(nombre)
	if len(nombreLimpio) < 1 || len(nombreLimpio) > 80 {
		return nil, fmt.Errorf("%w: el nombre del cliente debe tener entre 1 y 80 caracteres", store.ErrValidation)
	}

	payload := map[string]any{
		"nombre": nombreLimpio,
		"activo": true,
	}
	var rows []dbCliente
	q := url.Values{}
	q.Set("select", "*")
	if err := s.client.REST(ctx, "POST", "clientes", q, payload, "return=representation", &rows); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate") || strings.Contains(strings.ToLower(err.Error()), "unique") || strings.Contains(err.Error(), "23505") {
			return nil, fmt.Errorf("%w: ya existe un cliente con ese nombre", store.ErrConflict)
		}
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	return convertirCliente(&rows[0]), nil
}

func (s *SupabaseStore) ActualizarCliente(ctx context.Context, id int, campos map[string]any) (*store.Cliente, error) {
	q := url.Values{}
	q.Set("id", fmt.Sprintf("eq.%d", id))
	q.Set("select", "*")

	var rows []dbCliente
	if err := s.client.REST(ctx, "PATCH", "clientes", q, campos, "return=representation", &rows); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate") || strings.Contains(strings.ToLower(err.Error()), "unique") || strings.Contains(err.Error(), "23505") {
			return nil, fmt.Errorf("%w: ya existe un cliente con ese nombre", store.ErrConflict)
		}
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	return convertirCliente(&rows[0]), nil
}

// ==========================================
// F3: Implementación Estadísticas (Supabase)
// ==========================================

func (s *SupabaseStore) ObtenerEstadisticasYo(ctx context.Context, perfilID string, filtro store.FiltroEstadisticasYo) (*store.EstadisticasYoResponse, error) {
	var todasTareas []*store.Tarea
	limit := 1000
	offset := 0

	for {
		q := url.Values{}
		q.Set("asignado_a", fmt.Sprintf("eq.%s", perfilID))
		q.Set("estado", "eq.aceptada")
		q.Set("select", "*,tipos_trabajo(*,roles(*)),clientes(*)")
		q.Set("order", "resuelta_en.desc")
		q.Set("limit", fmt.Sprintf("%d", limit))
		q.Set("offset", fmt.Sprintf("%d", offset))

		var rows []dbTarea
		if err := s.client.REST(ctx, "GET", "tareas", q, nil, "", &rows); err != nil {
			return nil, err
		}
		if len(rows) == 0 {
			break
		}
		for i := range rows {
			todasTareas = append(todasTareas, convertirTarea(&rows[i]))
		}
		if len(rows) < limit {
			break
		}
		offset += limit
	}

	tipos, err := s.ListarTiposTrabajo(ctx, false)
	if err != nil {
		return nil, err
	}
	tiposMap := make(map[int]*store.TipoTrabajo)
	for _, tp := range tipos {
		tiposMap[tp.ID] = tp
	}

	return store.CalcularEstadisticasYo(perfilID, todasTareas, tiposMap, filtro, time.Now()), nil
}

func (s *SupabaseStore) ObtenerEstadisticasAdmin(ctx context.Context, filtro store.FiltroEstadisticasAdmin) (*store.EstadisticasAdminResponse, error) {
	var todasTareas []*store.Tarea
	limit := 1000
	offset := 0

	desdeBog := store.InicioDiaBogota(filtro.Desde)
	hastaBog := store.FinDiaBogota(filtro.Hasta)

	for {
		q := url.Values{}
		q.Set("estado", "eq.aceptada")
		q.Set("resuelta_en", fmt.Sprintf("gte.%s", desdeBog.Format(time.RFC3339)))
		q.Set("resuelta_en", fmt.Sprintf("lte.%s", hastaBog.Format(time.RFC3339)))
		if filtro.PersonaID != nil {
			q.Set("asignado_a", fmt.Sprintf("eq.%s", *filtro.PersonaID))
		}
		if filtro.SinCliente {
			q.Set("cliente_id", "is.null")
		} else if filtro.ClienteID != nil {
			q.Set("cliente_id", fmt.Sprintf("eq.%d", *filtro.ClienteID))
		}
		if filtro.TipoID != nil {
			q.Set("tipo_id", fmt.Sprintf("eq.%d", *filtro.TipoID))
		}
		q.Set("select", "*,tipos_trabajo(*,roles(*)),clientes(*),asignado:perfiles!tareas_asignado_a_fkey(*)")
		q.Set("order", "resuelta_en.asc")
		q.Set("limit", fmt.Sprintf("%d", limit))
		q.Set("offset", fmt.Sprintf("%d", offset))

		var rows []dbTarea
		if err := s.client.REST(ctx, "GET", "tareas", q, nil, "", &rows); err != nil {
			return nil, err
		}
		if len(rows) == 0 {
			break
		}
		for i := range rows {
			todasTareas = append(todasTareas, convertirTarea(&rows[i]))
		}
		if len(rows) < limit {
			break
		}
		offset += limit
	}

	perfilesMap := make(map[string]*store.Perfil)
	clientesMap := make(map[int]*store.Cliente)
	tiposMap := make(map[int]*store.TipoTrabajo)

	if tipos, err := s.ListarTiposTrabajo(ctx, false); err == nil {
		for _, tp := range tipos {
			tiposMap[tp.ID] = tp
		}
	}
	if clientes, err := s.ListarClientes(ctx, false); err == nil {
		for _, c := range clientes {
			clientesMap[c.ID] = c
		}
	}
	if miembros, err := s.ListarMiembros(ctx, store.FiltroMiembros{}); err == nil {
		for _, m := range miembros {
			perfilesMap[m.ID] = m
		}
	}

	return store.CalcularEstadisticasAdmin(todasTareas, perfilesMap, clientesMap, tiposMap, filtro), nil
}

// SupabaseAuthVerifier valida JWTs contra Supabase Auth
type SupabaseAuthVerifier struct {
	client           *Client
	store            store.Store
	adminEmails      []string
	trabajadorEmails []string
	cacheMu          sync.RWMutex
	tokenCache       map[string]*tokenCacheEntry
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

// HabilitarTrabajadores registra correos que quedan aprobados (sin ser admin) en cuanto se registran.
func (v *SupabaseAuthVerifier) HabilitarTrabajadores(emails []string) {
	v.trabajadorEmails = emails
}

func (v *SupabaseAuthVerifier) esTrabajadorEmail(email string) bool {
	eNorm := strings.ToLower(strings.TrimSpace(email))
	for _, t := range v.trabajadorEmails {
		if strings.ToLower(strings.TrimSpace(t)) == eNorm {
			return true
		}
	}
	return false
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

	// Correo habilitado como trabajador: pasa de pendiente a aprobado (nunca reactiva a un suspendido)
	if v.esTrabajadorEmail(p.Correo) && p.Estado == store.EstadoPendiente {
		if aprobado, err := v.store.AprobarMiembro(ctx, p.ID); err == nil && aprobado != nil {
			p = aprobado
		}
	}

	// Refrescar para garantizar que el estado y roles sean los más actualizados
	if fresco, err := v.store.ObtenerPerfilPorID(ctx, id); err == nil && fresco != nil {
		p = fresco
	}

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
	if esAdmin || v.esTrabajadorEmail(eNorm) {
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
