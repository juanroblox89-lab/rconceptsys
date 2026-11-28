package supa

import (
	"context"
	"errors"
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
	RespuestaAID *int64    `json:"respuesta_a_id"`
	EsRIA        bool      `json:"es_ria"`
	ID           int64     `json:"id"`
	AutorID      string    `json:"autor_id"`
	Cuerpo       string    `json:"cuerpo"`
	CreadoEn     string    `json:"creado_en"`
	EditadoEn    *string   `json:"editado_en"`
	BorradoEn    *string   `json:"borrado_en"`
	Autor        *dbPerfil `json:"perfiles"`
}

// Modelos DB PostgREST para F2 y F3
type dbCliente struct {
	DriveReferencias      []store.ReferenciaDrive `json:"drive_referencias"`
	DriveReferenciaID     *string                 `json:"drive_referencia_id"`
	DriveReferenciaNombre *string                 `json:"drive_referencia_nombre"`
	DriveReferenciaURL    *string                 `json:"drive_referencia_url"`
	FotoURL               *string                 `json:"foto_url"`
	DriveCarpetaID        *string                 `json:"drive_carpeta_id"`
	MaterialCarpetaID     *string                 `json:"material_carpeta_id"`
	ProductoCarpetaID     *string                 `json:"producto_carpeta_id"`
	ID                    int                     `json:"id"`
	Nombre                string                  `json:"nombre"`
	Activo                bool                    `json:"activo"`
	Paquete               *string                 `json:"paquete"`
	DriveURL              *string                 `json:"drive_url"`
	Notas                 *string                 `json:"notas"`
	CreadoEn              string                  `json:"creado_en"`
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
	ID                      int64                          `json:"id"`
	TipoID                  int                            `json:"tipo_id"`
	ClienteID               *int                           `json:"cliente_id"`
	PiezaID                 *int                           `json:"pieza_id"`
	Titulo                  string                         `json:"titulo"`
	Descripcion             *string                        `json:"descripcion"`
	Guion                   string                         `json:"guion"`
	AsignadoA               string                         `json:"asignado_a"`
	CreadoPor               string                         `json:"creado_por"`
	AsignadorID             *string                        `json:"asignador_id"`
	Estado                  string                         `json:"estado"`
	FechaLimite             *string                        `json:"fecha_limite"`
	NotaPersona             *string                        `json:"nota_persona"`
	MetodoEntrega           *string                        `json:"metodo_entrega"`
	EnlaceMedios            *string                        `json:"enlace_medios"`
	EntregaNombre           *string                        `json:"entrega_nombre"`
	EntregaTipo             *string                        `json:"entrega_tipo"`
	EntregaDrive            []store.ReferenciaDriveTrabajo `json:"entrega_drive"`
	DriveCarpetaID          *string                        `json:"drive_carpeta_id"`
	DriveCarpetaURL         *string                        `json:"drive_carpeta_url"`
	DriveReferencias        []store.ReferenciaDriveTrabajo `json:"drive_referencias"`
	MotivoRechazo           *string                        `json:"motivo_rechazo"`
	Cantidad                *int                           `json:"cantidad"`
	CantidadAceptada        *int                           `json:"cantidad_aceptada"`
	PrecioUnitarioCongelado *int64                         `json:"precio_unitario_congelado"`
	PrecioCongelado         *int64                         `json:"precio_congelado"`
	FacturaID               *int64                         `json:"factura_id"`
	CreadaEn                string                         `json:"creada_en"`
	HechaEn                 *string                        `json:"hecha_en"`
	ResueltaEn              *string                        `json:"resuelta_en"`
	ResueltaPor             *string                        `json:"resuelta_por"`
	Tipo                    *dbTipoTrabajo                 `json:"tipos_trabajo"`
	Cliente                 *dbCliente                     `json:"clientes"`
	Pieza                   *dbPiezaCorta                  `json:"piezas"`
	Asignado                *dbPerfil                      `json:"asignado"`
	Creador                 *dbPerfil                      `json:"creador"`
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
	if perfil.Celular != "" {
		payload["celular"] = perfil.Celular
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

func parsearTiempoSupa(raw string) time.Time {
	if t, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		return t
	}
	t, _ := time.Parse(time.RFC3339, raw)
	return t
}

func (s *SupabaseStore) convertirChatMensaje(ctx context.Context, item *dbChatMensaje, conservarBorrado bool) *store.ChatMensaje {
	t := parsearTiempoSupa(item.CreadoEn)
	var editT *time.Time
	if item.EditadoEn != nil {
		et := parsearTiempoSupa(*item.EditadoEn)
		editT = &et
	}
	var borradoT *time.Time
	if conservarBorrado && item.BorradoEn != nil {
		bt := parsearTiempoSupa(*item.BorradoEn)
		borradoT = &bt
	}

	var autor *store.Perfil
	if item.Autor != nil && !item.EsRIA {
		roles, _ := s.obtenerRolesDePerfil(ctx, item.Autor.ID)
		autor = convertirPerfil(item.Autor, roles)
	}

	autorID := item.AutorID
	if item.EsRIA {
		autorID = store.AutorChatRIA
	}
	return &store.ChatMensaje{
		RespuestaAID: item.RespuestaAID,
		EsRIA:        item.EsRIA,
		ID:           item.ID,
		AutorID:      autorID,
		Autor:        autor,
		Cuerpo:       item.Cuerpo,
		CreadoEn:     t,
		EditadoEn:    editT,
		BorradoEn:    borradoT,
	}
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
	q.Set("select", "*,perfiles!chat_mensajes_autor_id_fkey(*)")

	var rows []dbChatMensaje
	if err := s.client.REST(ctx, "GET", "chat_mensajes", q, nil, "", &rows); err != nil {
		return nil, err
	}

	res := make([]*store.ChatMensaje, 0, len(rows))
	for i := range rows {
		res = append(res, s.convertirChatMensaje(ctx, &rows[i], false))
	}
	s.adjuntosPorMensajes(ctx, res)
	s.citasChat(ctx, res)
	return res, nil
}

func (s *SupabaseStore) ObtenerMensajeChatPorID(ctx context.Context, id int64, incluirBorrado bool) (*store.ChatMensaje, error) {
	q := url.Values{}
	q.Set("id", "eq."+strconv.FormatInt(id, 10))
	if !incluirBorrado {
		q.Set("borrado_en", "is.null")
	}
	q.Set("select", "*,perfiles!chat_mensajes_autor_id_fkey(*)")

	var rows []dbChatMensaje
	if err := s.client.REST(ctx, "GET", "chat_mensajes", q, nil, "", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	msg := s.convertirChatMensaje(ctx, &rows[0], incluirBorrado)
	s.adjuntosPorMensajes(ctx, []*store.ChatMensaje{msg})
	s.citasChat(ctx, []*store.ChatMensaje{msg})
	return msg, nil
}

func (s *SupabaseStore) EditarMensajeChat(ctx context.Context, id int64, autorID string, cuerpo string) (*store.ChatMensaje, error) {
	actual, err := s.ObtenerMensajeChatPorID(ctx, id, false)
	if err != nil {
		return nil, err
	}
	if actual.EsRIA || actual.AutorID != autorID {
		return nil, store.ErrForbidden
	}
	c := strings.TrimSpace(cuerpo)
	long := len([]rune(c))
	if long > 2000 || (long == 0 && len(actual.Adjuntos) == 0) {
		return nil, store.ErrValidation
	}

	q := url.Values{}
	q.Set("id", "eq."+strconv.FormatInt(id, 10))
	q.Set("autor_id", "eq."+autorID)
	q.Set("es_ria", "eq.false")
	q.Set("borrado_en", "is.null")
	q.Set("select", "*,perfiles!chat_mensajes_autor_id_fkey(*)")

	payload := map[string]any{
		"cuerpo":     c,
		"editado_en": time.Now().UTC().Format(time.RFC3339Nano),
	}
	var rows []dbChatMensaje
	if err := s.client.REST(ctx, "PATCH", "chat_mensajes", q, payload, "return=representation", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	msg := s.convertirChatMensaje(ctx, &rows[0], false)
	s.adjuntosPorMensajes(ctx, []*store.ChatMensaje{msg})
	s.citasChat(ctx, []*store.ChatMensaje{msg})
	return msg, nil
}

func (s *SupabaseStore) EliminarMensajeChat(ctx context.Context, id int64, actorID string, esAdmin bool) error {
	actual, err := s.ObtenerMensajeChatPorID(ctx, id, false)
	if err != nil {
		return err
	}
	if !esAdmin && (actual.EsRIA || actual.AutorID != actorID) {
		return store.ErrForbidden
	}

	q := url.Values{}
	q.Set("id", "eq."+strconv.FormatInt(id, 10))
	q.Set("borrado_en", "is.null")
	if !esAdmin {
		q.Set("autor_id", "eq."+actorID)
		q.Set("es_ria", "eq.false")
	}

	var rows []dbChatMensaje
	payload := map[string]any{
		"borrado_en": time.Now().UTC().Format(time.RFC3339Nano),
	}
	if err := s.client.REST(ctx, "PATCH", "chat_mensajes", q, payload, "return=representation", &rows); err != nil {
		return err
	}
	if len(rows) == 0 {
		return store.ErrNotFound
	}
	return nil
}

func (s *SupabaseStore) RestaurarMensajeChat(ctx context.Context, id int64, actorID string, esAdmin bool, ventana time.Duration) (*store.ChatMensaje, error) {
	actual, err := s.ObtenerMensajeChatPorID(ctx, id, true)
	if err != nil {
		return nil, err
	}
	if actual.BorradoEn == nil {
		return nil, store.ErrNotFound
	}
	if !esAdmin && (actual.EsRIA || actual.AutorID != actorID) {
		return nil, store.ErrForbidden
	}
	if time.Since(*actual.BorradoEn) > ventana {
		return nil, store.ErrConflict
	}

	q := url.Values{}
	q.Set("id", "eq."+strconv.FormatInt(id, 10))
	q.Set("borrado_en", "not.is.null")
	if !esAdmin {
		q.Set("autor_id", "eq."+actorID)
		q.Set("es_ria", "eq.false")
	}
	q.Set("select", "*,perfiles!chat_mensajes_autor_id_fkey(*)")

	var rows []dbChatMensaje
	payload := map[string]any{
		"borrado_en": nil,
	}
	if err := s.client.REST(ctx, "PATCH", "chat_mensajes", q, payload, "return=representation", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	msg := s.convertirChatMensaje(ctx, &rows[0], false)
	s.adjuntosPorMensajes(ctx, []*store.ChatMensaje{msg})
	s.citasChat(ctx, []*store.ChatMensaje{msg})
	return msg, nil
}

func (s *SupabaseStore) CrearMensajeChat(ctx context.Context, autorID string, cuerpo string) (*store.ChatMensaje, error) {
	payload := map[string]any{
		"autor_id": autorID,
		"cuerpo":   cuerpo,
	}

	q := url.Values{}
	q.Set("select", "*,perfiles!chat_mensajes_autor_id_fkey(*)")

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
		ID:                dc.ID,
		DriveReferencias:  store.ReferenciasDeCliente(dc.DriveReferencias, dc.DriveReferenciaID, dc.DriveReferenciaNombre, dc.DriveReferenciaURL),
		DriveReferenciaID: dc.DriveReferenciaID, DriveReferenciaNombre: dc.DriveReferenciaNombre, DriveReferenciaURL: dc.DriveReferenciaURL,
		FotoURL: dc.FotoURL, DriveCarpetaID: dc.DriveCarpetaID, MaterialCarpetaID: dc.MaterialCarpetaID, ProductoCarpetaID: dc.ProductoCarpetaID,
		Nombre:   dc.Nombre,
		Activo:   dc.Activo,
		Paquete:  dc.Paquete,
		DriveURL: dc.DriveURL,
		Notas:    dc.Notas,
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
		Guion:                   dt.Guion,
		AsignadoA:               dt.AsignadoA,
		CreadoPor:               dt.CreadoPor,
		AsignadorID:             dt.AsignadorID,
		Estado:                  store.EstadoTarea(dt.Estado),
		FechaLimite:             dt.FechaLimite,
		NotaPersona:             dt.NotaPersona,
		MetodoEntrega:           dt.MetodoEntrega,
		EnlaceMedios:            dt.EnlaceMedios,
		EntregaNombre:           dt.EntregaNombre,
		EntregaTipo:             dt.EntregaTipo,
		EntregaDrive:            dt.EntregaDrive,
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
		PiezaID:                 dt.PiezaID,
		DriveCarpetaID:          dt.DriveCarpetaID,
		DriveCarpetaURL:         dt.DriveCarpetaURL,
		DriveReferencias:        dt.DriveReferencias,
	}
	if dt.Pieza != nil {
		res.Pieza = &store.PiezaCorta{ID: dt.Pieza.ID, Nombre: dt.Pieza.Nombre, Etapa: dt.Pieza.Etapa}
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
		"tipo_id":          t.TipoID,
		"cliente_id":       t.ClienteID,
		"pieza_id":         t.PiezaID,
		"titulo":           strings.TrimSpace(t.Titulo),
		"descripcion":      t.Descripcion,
		"guion":            t.Guion,
		"asignado_a":       t.AsignadoA,
		"creado_por":       t.CreadoPor,
		"asignador_id":     t.CreadoPor,
		"estado":           store.EstadoTareaPendiente,
		"fecha_limite":     t.FechaLimite,
		"cantidad":         t.Cantidad,
		"drive_carpeta_id": t.DriveCarpetaID, "drive_carpeta_url": t.DriveCarpetaURL,
		"drive_referencias": t.DriveReferencias,
	}
	var rows []dbTarea
	q := url.Values{}
	q.Set("select", "*,tipos_trabajo(*,roles(*)),clientes(*),piezas(id,nombre,etapa),asignado:perfiles!tareas_asignado_a_fkey(*),creador:perfiles!tareas_creado_por_fkey(*)")
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
	q.Set("select", "*,tipos_trabajo(*,roles(*)),clientes(*),piezas(id,nombre,etapa),asignado:perfiles!tareas_asignado_a_fkey(*),creador:perfiles!tareas_creado_por_fkey(*)")

	var rows []dbTarea
	if err := s.client.REST(ctx, "GET", "tareas", q, nil, "", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	res := convertirTarea(&rows[0])
	s.hidratarExtrasTareas(ctx, []*store.Tarea{res})
	return res, nil
}

func (s *SupabaseStore) ListarTareas(ctx context.Context, filtro store.FiltroTareas) ([]*store.Tarea, error) {
	q := url.Values{}
	q.Set("select", "*,tipos_trabajo(*,roles(*)),clientes(*),piezas(id,nombre,etapa),asignado:perfiles!tareas_asignado_a_fkey(*),creador:perfiles!tareas_creado_por_fkey(*)")
	if filtro.Estado != nil {
		q.Set("estado", fmt.Sprintf("eq.%s", *filtro.Estado))
	}
	if filtro.AsignadoA != nil {
		q.Set("asignado_a", fmt.Sprintf("eq.%s", *filtro.AsignadoA))
	}
	if filtro.ClienteID != nil {
		q.Set("cliente_id", fmt.Sprintf("eq.%d", *filtro.ClienteID))
	}
	q.Set("order", "creada_en.desc,id.desc")
	if filtro.ConCarpetaDrive {
		q.Set("drive_carpeta_id", "not.is.null")
	}
	if filtro.ClienteID == nil && !filtro.ConCarpetaDrive {
		var rows []dbTarea
		if err := s.client.REST(ctx, "GET", "tareas", q, nil, "", &rows); err != nil {
			return nil, err
		}
		res := make([]*store.Tarea, 0, len(rows))
		for i := range rows {
			res = append(res, convertirTarea(&rows[i]))
		}
		s.hidratarExtrasTareas(ctx, res)
		return res, nil
	}
	const pagina = 500
	res := []*store.Tarea{}
	q.Set("limit", strconv.Itoa(pagina))
	for offset := 0; ; {
		q.Set("offset", strconv.Itoa(offset))
		var rows []dbTarea
		if err := s.client.REST(ctx, "GET", "tareas", q, nil, "", &rows); err != nil {
			return nil, err
		}
		if len(rows) == 0 {
			s.hidratarExtrasTareas(ctx, res)
			return res, nil
		}
		for i := range rows {
			res = append(res, convertirTarea(&rows[i]))
		}
		offset += len(rows)
	}
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

func mapearErrorRPCTarea(err error) error {
	if err == nil {
		return nil
	}
	var se *Error
	if errors.As(err, &se) {
		msg := se.Body
		switch {
		case strings.Contains(msg, "P0001") || strings.Contains(msg, "tarea_ajena") || strings.Contains(msg, "no_autorizado"):
			return store.ErrForbidden
		case strings.Contains(msg, "P0002") || strings.Contains(msg, "tarea_no_encontrada"):
			return store.ErrNotFound
		case strings.Contains(msg, "P0003") || strings.Contains(msg, "no_reversible") || strings.Contains(msg, "estado_invalido"):
			return fmt.Errorf("%w: %s", store.ErrConflict, msg)
		case strings.Contains(msg, "P0005") || strings.Contains(msg, "cantidad_invalida") || strings.Contains(msg, "motivo_invalido") || strings.Contains(msg, "nota_larga"):
			return fmt.Errorf("%w: %s", store.ErrValidation, msg)
		}
	}
	return err
}

func (s *SupabaseStore) MarcarTareaHecha(ctx context.Context, id int64, asignadoID string, nota *string, cantidad *int, enlaceMedios *string) (*store.Tarea, error) {
	return s.EntregarTarea(ctx, id, asignadoID, store.EntregaInput{
		Nota:         nota,
		Cantidad:     cantidad,
		EnlaceMedios: enlaceMedios,
	})
}

func (s *SupabaseStore) EntregarTarea(ctx context.Context, id int64, asignadoID string, entrada store.EntregaInput) (*store.Tarea, error) {
	payload := map[string]any{
		"p_tarea":          id,
		"p_perfil":         asignadoID,
		"p_metodo":         nil,
		"p_nota":           nil,
		"p_cantidad":       nil,
		"p_enlace":         nil,
		"p_entrega_nombre": nil,
		"p_entrega_tipo":   nil,
	}
	if m := strings.TrimSpace(entrada.Metodo); m != "" {
		payload["p_metodo"] = m
	}
	if entrada.Nota != nil {
		payload["p_nota"] = *entrada.Nota
	}
	if entrada.Cantidad != nil {
		payload["p_cantidad"] = *entrada.Cantidad
	}
	if entrada.EnlaceMedios != nil {
		payload["p_enlace"] = *entrada.EnlaceMedios
	}
	if entrada.EntregaNombre != nil {
		payload["p_entrega_nombre"] = *entrada.EntregaNombre
	}
	if entrada.EntregaTipo != nil {
		payload["p_entrega_tipo"] = *entrada.EntregaTipo
	}
	var res map[string]any
	rpc := "rc_entregar_tarea"
	if len(entrada.EntregaDrive) > 0 {
		rpc = "rc_entregar_tarea_drive"
		payload["p_elementos"] = entrada.EntregaDrive
	}
	if err := s.client.RPC(ctx, rpc, payload, &res); err != nil {
		return nil, mapearErrorRPCTarea(err)
	}
	return s.ObtenerTareaPorID(ctx, id)
}

func (s *SupabaseStore) RevertirEntregaTarea(ctx context.Context, id int64, asignadoID string) (*store.ResultadoReversionEntrega, error) {
	var res struct {
		HechaEnAnterior *string `json:"hecha_en_anterior"`
	}
	if err := s.client.RPC(ctx, "rc_revertir_entrega_tarea", map[string]any{
		"p_tarea":  id,
		"p_perfil": asignadoID,
	}, &res); err != nil {
		return nil, mapearErrorRPCTarea(err)
	}
	t, err := s.ObtenerTareaPorID(ctx, id)
	if err != nil {
		return nil, err
	}
	var hechaAnt *time.Time
	if res.HechaEnAnterior != nil && *res.HechaEnAnterior != "" {
		parsed := parsearTiempoSupa(*res.HechaEnAnterior)
		if !parsed.IsZero() {
			hechaAnt = &parsed
		}
	}
	return &store.ResultadoReversionEntrega{
		Tarea:           t,
		HechaEnAnterior: hechaAnt,
	}, nil
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
		return nil, mapearErrorRPCTarea(err)
	}
	return s.ObtenerTareaPorID(ctx, id)
}

func (s *SupabaseStore) PedirDeNuevoTarea(ctx context.Context, id int64, adminID string, motivo string) (*store.Tarea, error) {
	q := url.Values{
		"id": {fmt.Sprintf("eq.%d", id)}, "estado": {"eq.aceptada"},
		"select": {"*,tipos_trabajo(*,roles(*)),clientes(*),piezas(id,nombre,etapa),asignado:perfiles!tareas_asignado_a_fkey(*),creador:perfiles!tareas_creado_por_fkey(*)"},
	}
	// La reapertura usa resuelta_por como actor y lo limpia en el mismo PATCH.
	// Es la misma fila: el guion se devuelve en la representación sin reescribirlo.
	payload := map[string]any{"estado": store.EstadoTareaPendiente, "resuelta_por": adminID, "motivo_reapertura": strings.TrimSpace(motivo)}
	var rows []dbTarea
	if err := s.client.REST(ctx, "PATCH", "tareas", q, payload, "return=representation", &rows); err != nil {
		var fallo *Error
		if errors.As(err, &fallo) {
			switch {
			case fallo.Status == 409 && strings.Contains(fallo.Body, "purga_en_curso"):
				return nil, store.ErrPurgaEnCurso
			case fallo.Status == 409 && strings.Contains(fallo.Body, "corte_pagado"):
				return nil, store.ErrCortePagado
			case strings.Contains(fallo.Body, "no_autorizado"):
				return nil, store.ErrForbidden
			case strings.Contains(fallo.Body, "motivo_invalido"):
				return nil, store.ErrValidation
			}
		}
		return nil, err
	}
	if len(rows) == 0 {
		if _, err := s.ObtenerTareaPorID(ctx, id); err != nil {
			return nil, err
		}
		return nil, store.ErrConflict
	}
	return convertirTarea(&rows[0]), nil
}

func (s *SupabaseStore) RechazarTarea(ctx context.Context, id int64, adminID string, motivo string) (*store.Tarea, error) {
	return s.RechazarTareaConDetalle(ctx, id, adminID, motivo, nil)
}

func (s *SupabaseStore) RechazarTareaConDetalle(ctx context.Context, id int64, adminID string, motivo string, driveAdjuntos []store.ReferenciaDriveTrabajo) (*store.Tarea, error) {
	if driveAdjuntos == nil {
		driveAdjuntos = []store.ReferenciaDriveTrabajo{}
	}
	var res map[string]any
	if err := s.client.RPC(ctx, "rc_rechazar_tarea", map[string]any{
		"p_tarea":          id,
		"p_admin":          adminID,
		"p_motivo":         motivo,
		"p_drive_adjuntos": driveAdjuntos,
	}, &res); err != nil {
		return nil, mapearErrorRPCTarea(err)
	}
	return s.ObtenerTareaPorID(ctx, id)
}

type dbEntregaTarea struct {
	ID            int64                          `json:"id"`
	TareaID       int64                          `json:"tarea_id"`
	PerfilID      string                         `json:"perfil_id"`
	Metodo        *string                        `json:"metodo_entrega"`
	EnlaceMedios  *string                        `json:"enlace_medios"`
	EntregaNombre *string                        `json:"entrega_nombre"`
	EntregaTipo   *string                        `json:"entrega_tipo"`
	EntregaDrive  []store.ReferenciaDriveTrabajo `json:"entrega_drive"`
	Nota          *string                        `json:"nota"`
	Cantidad      *int                           `json:"cantidad"`
	Estado        string                         `json:"estado"`
	CreadaEn      string                         `json:"creada_en"`
	RetiradaEn    *string                        `json:"retirada_en"`
}

type dbTareaHistorial struct {
	ID            int64                          `json:"id"`
	TareaID       int64                          `json:"tarea_id"`
	ActorID       *string                        `json:"actor_id"`
	Evento        string                         `json:"evento"`
	Detalle       string                         `json:"detalle"`
	MetodoEntrega *string                        `json:"metodo_entrega"`
	EnlaceMedios  *string                        `json:"enlace_medios"`
	EntregaNombre *string                        `json:"entrega_nombre"`
	EntregaTipo   *string                        `json:"entrega_tipo"`
	EntregaDrive  []store.ReferenciaDriveTrabajo `json:"entrega_drive"`
	Nota          *string                        `json:"nota"`
	Motivo        *string                        `json:"motivo"`
	Cantidad      *int                           `json:"cantidad"`
	DriveAdjuntos []store.ReferenciaDriveTrabajo `json:"drive_adjuntos"`
	CreadoEn      string                         `json:"creado_en"`
	Actor         *dbPerfil                      `json:"actor"`
}

func vistaAdjuntosDeLista(lista []*store.AdjuntoAsignacion) map[int64][]*store.VistaAdjuntoTarea {
	porHist := make(map[int64][]*store.VistaAdjuntoTarea)
	for _, a := range lista {
		if a.HistorialID == nil || a.EstadoArchivo != "listo" {
			continue
		}
		porHist[*a.HistorialID] = append(porHist[*a.HistorialID], &store.VistaAdjuntoTarea{
			Conservar:     a.Conservar,
			PurgadoEn:     a.PurgadoEn,
			ID:            a.ID,
			Tipo:          a.Tipo,
			Nombre:        a.Nombre,
			Tamano:        a.Tamano,
			Mime:          a.Mime,
			DuracionMS:    a.DuracionMS,
			Resumir:       a.Resumir,
			EstadoResumen: a.EstadoResumen,
			Resumen:       a.Resumen,
			Transcripcion: a.Transcripcion,
			ErrorResumen:  a.ErrorResumen,
		})
	}
	return porHist
}

func (s *SupabaseStore) hidratarExtrasTareas(ctx context.Context, tareas []*store.Tarea) {
	if len(tareas) == 0 {
		return
	}
	var idsBorrador []int64
	var idsRechazadas []int64
	for _, t := range tareas {
		if t.Estado == store.EstadoTareaPendiente || t.Estado == store.EstadoTareaRechazada {
			idsBorrador = append(idsBorrador, t.ID)
		}
		if t.Estado == store.EstadoTareaRechazada {
			idsRechazadas = append(idsRechazadas, t.ID)
		}
	}
	if len(idsBorrador) > 0 {
		q := url.Values{}
		q.Set("tarea_id", "in.("+listaIDs(idsBorrador)+")")
		// Incluir reabierta para que un borrador más viejo no reaparezca después de reabrir.
		q.Set("estado", "in.(retirada,rechazada,reabierta)")
		q.Set("order", "id.desc")
		var rows []dbEntregaTarea
		if err := s.client.REST(ctx, "GET", "tarea_entregas", q, nil, "", &rows); err == nil {
			porTarea := make(map[int64]*store.EntregaTarea)
			for i := range rows {
				r := rows[i]
				if _, ya := porTarea[r.TareaID]; ya {
					continue
				}
				metodo := ""
				if r.Metodo != nil {
					metodo = *r.Metodo
				}
				var ret *time.Time
				if r.RetiradaEn != nil {
					pt := parsearTiempoSupa(*r.RetiradaEn)
					ret = &pt
				}
				porTarea[r.TareaID] = &store.EntregaTarea{
					ID:            r.ID,
					TareaID:       r.TareaID,
					PerfilID:      r.PerfilID,
					Metodo:        metodo,
					EnlaceMedios:  r.EnlaceMedios,
					EntregaNombre: r.EntregaNombre,
					EntregaTipo:   r.EntregaTipo,
					EntregaDrive:  r.EntregaDrive,
					Nota:          r.Nota,
					Cantidad:      r.Cantidad,
					Estado:        r.Estado,
					CreadaEn:      parsearTiempoSupa(r.CreadaEn),
					RetiradaEn:    ret,
				}
			}
			for _, t := range tareas {
				if e, ok := porTarea[t.ID]; ok && e.Estado != "reabierta" && e.PerfilID == t.AsignadoA {
					t.BorradorEntrega = e
				}
			}
		}
	}
	if len(idsRechazadas) > 0 {
		q := url.Values{}
		q.Set("tarea_id", "in.("+listaIDs(idsRechazadas)+")")
		q.Set("evento", "eq.entrega_rechazada")
		q.Set("order", "id.desc")
		var rows []dbTareaHistorial
		if err := s.client.REST(ctx, "GET", "tarea_historial", q, nil, "", &rows); err == nil && len(rows) > 0 {
			aq := url.Values{}
			aq.Set("tarea_id", "in.("+listaIDs(idsRechazadas)+")")
			aq.Set("origen", "eq.rechazo")
			aq.Set("estado_archivo", "eq.listo")
			aq.Set("order", "cupo.asc")
			var adjRows []*store.AdjuntoAsignacion
			_ = s.client.REST(ctx, "GET", tablaAdjuntos, aq, nil, "", &adjRows)
			porHist := vistaAdjuntosDeLista(adjRows)
			rechazoPorTarea := make(map[int64]*store.RechazoEvento)
			for i := range rows {
				r := rows[i]
				if _, ya := rechazoPorTarea[r.TareaID]; ya {
					continue
				}
				motivo := ""
				if r.Motivo != nil {
					motivo = *r.Motivo
				}
				rechazoPorTarea[r.TareaID] = &store.RechazoEvento{
					HistorialID:   r.ID,
					Motivo:        motivo,
					DriveAdjuntos: r.DriveAdjuntos,
					Adjuntos:      porHist[r.ID],
					CreadoEn:      parsearTiempoSupa(r.CreadoEn),
				}
			}
			for _, t := range tareas {
				if r, ok := rechazoPorTarea[t.ID]; ok {
					t.RechazoActual = r
				}
			}
		}
	}
}

func (s *SupabaseStore) ObtenerHistorialTarea(ctx context.Context, tareaID int64) ([]*store.TareaHistorialItem, error) {
	q := url.Values{}
	q.Set("tarea_id", "eq."+strconv.FormatInt(tareaID, 10))
	q.Set("select", "*,actor:perfiles!tarea_historial_actor_id_fkey(id,nombre)")
	q.Set("order", "id.asc")

	var rows []dbTareaHistorial
	if err := s.client.REST(ctx, "GET", "tarea_historial", q, nil, "", &rows); err != nil {
		return nil, err
	}
	adjList, _ := s.ListarAdjuntosPorOrigen(ctx, tareaID, "rechazo", nil)
	porHist := vistaAdjuntosDeLista(adjList)

	out := make([]*store.TareaHistorialItem, 0, len(rows))
	for i := range rows {
		r := rows[i]
		item := &store.TareaHistorialItem{
			ID:            r.ID,
			TareaID:       r.TareaID,
			ActorID:       r.ActorID,
			Evento:        r.Evento,
			Detalle:       r.Detalle,
			MetodoEntrega: r.MetodoEntrega,
			EnlaceMedios:  r.EnlaceMedios,
			EntregaNombre: r.EntregaNombre,
			EntregaTipo:   r.EntregaTipo,
			EntregaDrive:  r.EntregaDrive,
			Nota:          r.Nota,
			Motivo:        r.Motivo,
			Cantidad:      r.Cantidad,
			DriveAdjuntos: r.DriveAdjuntos,
			CreadoEn:      parsearTiempoSupa(r.CreadoEn),
		}
		if r.Actor != nil {
			item.ActorNombre = r.Actor.Nombre
		}
		if r.Evento == "entrega_rechazada" {
			item.Adjuntos = porHist[r.ID]
		}
		out = append(out, item)
	}
	return out, nil
}

func (s *SupabaseStore) AdminsVieronTareaDesde(ctx context.Context, tareaID int64, desde *time.Time) ([]string, error) {
	q := url.Values{}
	q.Set("tarea_id", "eq."+strconv.FormatInt(tareaID, 10))
	q.Set("select", "perfil_id,visto_en,perfiles!inner(id,es_admin,estado)")
	if desde != nil {
		q.Set("visto_en", "gte."+desde.UTC().Format(time.RFC3339Nano))
	}
	var rows []struct {
		PerfilID string `json:"perfil_id"`
		Perfil   struct {
			EsAdmin bool   `json:"es_admin"`
			Estado  string `json:"estado"`
		} `json:"perfiles"`
	}
	if err := s.client.REST(ctx, "GET", "asignaciones_vistas", q, nil, "", &rows); err != nil {
		return nil, err
	}
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		if r.Perfil.EsAdmin && r.Perfil.Estado == string(store.EstadoAprobado) {
			out = append(out, r.PerfilID)
		}
	}
	return out, nil
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
	q.Set("estado", "in.(pendiente,rechazada)")
	q.Set("select", "*,tipos_trabajo(*,roles(*)),clientes(*),piezas(id,nombre,etapa),asignado:perfiles!tareas_asignado_a_fkey(*),creador:perfiles!tareas_creado_por_fkey(*)")

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
	q.Set("select", "*,tipos_trabajo(*,roles(*)),clientes(*),piezas(id,nombre,etapa),asignado:perfiles!tareas_asignado_a_fkey(*),creador:perfiles!tareas_creado_por_fkey(*)")
	q.Set("order", "id.asc")

	var rows []dbTarea
	if err := s.client.REST(ctx, "GET", "tareas", q, nil, "", &rows); err != nil {
		return err
	}
	var total int64 = 0
	lineas := make([]*store.Tarea, len(rows))
	for i := range rows {
		t := convertirTarea(&rows[i])
		t.Guion = "" // Las instrucciones del pedido no son un dato de facturación.
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
		if filtro.PersonaID != nil {
			q.Set("asignado_a", fmt.Sprintf("eq.%s", *filtro.PersonaID))
		} else {
			q.Set("resuelta_en", fmt.Sprintf("gte.%s", desdeBog.Format(time.RFC3339)))
			q.Set("resuelta_en", fmt.Sprintf("lte.%s", hastaBog.Format(time.RFC3339)))
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

func (v *SupabaseAuthVerifier) Registro(ctx context.Context, email, password, nombre string, celulares ...string) (*store.Perfil, error) {
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

	if len(celulares) > 0 {
		perfil.Celular = celulares[0]
	}
	if err := v.store.CrearOActualizarPerfil(ctx, perfil); err != nil {
		return nil, err
	}

	return perfil, nil
}
