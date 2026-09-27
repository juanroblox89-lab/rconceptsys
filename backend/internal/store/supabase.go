// Implementación de store.Store contra Supabase (PostgREST con service role,
// solo server-side). Tablas F0: usuarios y actividad. Tablas F1:
// clientes, piezas, tareas, tarea_eventos, notificaciones (migración
// 002_produccion.sql). RLS queda como segunda capa (anon sin acceso); toda
// consulta ya viene filtrada por el user_id verificado.
package store

import (
	"context"
	"net/http"
	"net/url"
	"time"

	"rconceptsys/backend/internal/cobros"
	"rconceptsys/backend/internal/produccion"
	"rconceptsys/backend/internal/supa"
)

// Supabase implementa Store contra PostgREST. c no debe ser nil
// (main lo garantiza con supa.FromEnv).
type Supabase struct{ c *supa.Client }

// NuevoSupabase crea el store Supabase.
func NuevoSupabase(c *supa.Client) *Supabase { return &Supabase{c: c} }

func contexto() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 10*time.Second)
}

type usuarioFila struct {
	ID        string   `json:"id"`
	Nombre    string   `json:"nombre"`
	Email     string   `json:"email"`
	Foto      *string  `json:"foto"`
	Telefono  *string  `json:"telefono"`
	Acceso    Acceso   `json:"acceso"`
	Oficios   []string `json:"oficios"`
	CreatedAt string   `json:"created_at"`
	UpdatedAt string   `json:"updated_at"`
}

func (f usuarioFila) aUsuario() Usuario {
	oficios := f.Oficios
	if oficios == nil {
		oficios = []string{}
	}
	return Usuario{
		ID: f.ID, Nombre: f.Nombre, Email: f.Email,
		Foto: f.Foto, Telefono: f.Telefono, Acceso: f.Acceso,
		Oficios: oficios, CreatedAt: f.CreatedAt, UpdatedAt: f.UpdatedAt,
	}
}

func filaDe(u Usuario) map[string]any {
	oficios := u.Oficios
	if oficios == nil {
		oficios = []string{}
	}
	return map[string]any{
		"id": u.ID, "nombre": u.Nombre, "email": u.Email,
		"foto": u.Foto, "telefono": u.Telefono,
		"acceso": string(u.Acceso), "oficios": oficios,
	}
}

func (s *Supabase) ListUsuarios() ([]Usuario, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "order": {"created_at"}}
	var filas []usuarioFila
	if err := s.c.REST(ctx, http.MethodGet, "usuarios", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := make([]Usuario, 0, len(filas))
	for _, f := range filas {
		out = append(out, f.aUsuario())
	}
	return out, nil
}

func (s *Supabase) leerUno(q url.Values) (Usuario, bool, error) {
	ctx, cancel := contexto()
	defer cancel()
	var filas []usuarioFila
	if err := s.c.REST(ctx, http.MethodGet, "usuarios", q, nil, "", &filas); err != nil {
		return Usuario{}, false, err
	}
	if len(filas) == 0 {
		return Usuario{}, false, nil
	}
	return filas[0].aUsuario(), true, nil
}

// GetUsuario trae un usuario por id (id = auth.users.id).
func (s *Supabase) GetUsuario(id string) (Usuario, bool, error) {
	return s.leerUno(url.Values{"select": {"*"}, "id": {"eq." + id}})
}

// GetUsuarioByEmail trae un usuario por email (comparación exacta).
func (s *Supabase) GetUsuarioByEmail(email string) (Usuario, bool, error) {
	return s.leerUno(url.Values{"select": {"*"}, "email": {"eq." + email}})
}

// CreateUsuario inserta la fila (el id suele ser el de auth.users).
func (s *Supabase) CreateUsuario(u Usuario) (Usuario, error) {
	if u.ID == "" {
		u.ID = NewUUID()
	}
	ctx, cancel := contexto()
	defer cancel()
	var filas []usuarioFila
	if err := s.c.REST(ctx, http.MethodPost, "usuarios", nil, filaDe(u), "return=representation", &filas); err != nil {
		return Usuario{}, err
	}
	if len(filas) == 0 {
		return Usuario{}, ErrNoExiste
	}
	return filas[0].aUsuario(), nil
}

// UpdateUsuario: acceso == "" conserva; oficios == nil conserva (non-nil
// reemplaza). Sin filas afectadas → ErrNoExiste.
func (s *Supabase) UpdateUsuario(id string, acceso Acceso, oficios []string) (Usuario, error) {
	body := map[string]any{"updated_at": Ahora()}
	if acceso != "" {
		body["acceso"] = string(acceso)
	}
	if oficios != nil {
		body["oficios"] = oficios
	}
	ctx, cancel := contexto()
	defer cancel()
	var filas []usuarioFila
	q := url.Values{"id": {"eq." + id}}
	if err := s.c.REST(ctx, http.MethodPatch, "usuarios", q, body, "return=representation", &filas); err != nil {
		return Usuario{}, err
	}
	if len(filas) == 0 {
		return Usuario{}, ErrNoExiste
	}
	return filas[0].aUsuario(), nil
}

// Desactivar pasa el acceso a desactivado.
func (s *Supabase) Desactivar(id string) (Usuario, error) {
	return s.UpdateUsuario(id, "desactivado", nil)
}

type eventoFila struct {
	ID          string  `json:"id"`
	Cuando      string  `json:"cuando"`
	ActorID     string  `json:"actor_id"`
	ActorNombre string  `json:"actor_nombre"`
	Accion      string  `json:"accion"`
	Recurso     string  `json:"recurso"`
	RecursoID   string  `json:"recurso_id"`
	Antes       any     `json:"antes"`
	Despues     any     `json:"despues"`
	Motivo      *string `json:"motivo"`
}

func (f eventoFila) aEvento() Evento {
	return Evento{
		ID: f.ID, Cuando: f.Cuando, ActorID: f.ActorID,
		ActorNombre: f.ActorNombre, Accion: f.Accion, Recurso: f.Recurso,
		RecursoID: f.RecursoID, Antes: f.Antes, Despues: f.Despues,
		Motivo: f.Motivo,
	}
}

// ListActividad trae del más reciente al más viejo. F0: la tabla es chica y
// el filtro (?recurso=<tipo|id>) se aplica aquí en vez de armar un or PostgREST.
func (s *Supabase) ListActividad(filtro string) ([]Evento, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "order": {"cuando.desc"}}
	var filas []eventoFila
	if err := s.c.REST(ctx, http.MethodGet, "actividad", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []Evento{}
	for _, f := range filas {
		if filtro != "" && f.Recurso != filtro && f.RecursoID != filtro {
			continue
		}
		out = append(out, f.aEvento())
	}
	return out, nil
}

// AddActividad inserta el evento (asigna id y cuando si vienen vacíos).
func (s *Supabase) AddActividad(e Evento) (Evento, error) {
	if e.ID == "" {
		e.ID = NewUUID()
	}
	if e.Cuando == "" {
		e.Cuando = Ahora()
	}
	ctx, cancel := contexto()
	defer cancel()
	body := map[string]any{
		"id": e.ID, "actor_id": e.ActorID, "actor_nombre": e.ActorNombre,
		"accion": e.Accion, "recurso": e.Recurso, "recurso_id": e.RecursoID,
		"antes": e.Antes, "despues": e.Despues, "motivo": e.Motivo,
	}
	var filas []eventoFila
	if err := s.c.REST(ctx, http.MethodPost, "actividad", nil, body, "return=representation", &filas); err != nil {
		return Evento{}, err
	}
	if len(filas) == 0 {
		return e, nil
	}
	return filas[0].aEvento(), nil
}

// CountDuenos cuenta cuántos usuarios tienen acceso dueño (§5.4).
func (s *Supabase) CountDuenos() (int, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"id"}, "acceso": {"eq.dueno"}}
	var filas []map[string]any
	if err := s.c.REST(ctx, http.MethodGet, "usuarios", q, nil, "", &filas); err != nil {
		return 0, err
	}
	return len(filas), nil
}

// --- F1 producción (Supabase REST, service role) ---
// Los nombres de columna son los de 002_produccion.sql (snake_case). Los
// filtros de listado los aplica el handler sobre el resultado, no aquí:
// la tabla es chica en F1.

func nuloSiVacio(s string) any {
	if s == "" {
		return nil
	}
	return s
}

type clienteFila struct {
	ID               string `json:"id"`
	Nombre           string `json:"nombre"`
	LogoURL          string `json:"logo_url"`
	ContactoNombre   string `json:"contacto_nombre"`
	ContactoTelefono string `json:"contacto_telefono"`
	ContactoWhatsapp string `json:"contacto_whatsapp"`
	Paquete          string `json:"paquete"`
	PaqueteID        string `json:"paquete_id"`
	VendidoPor       string `json:"vendido_por"`
	FormatoRec       string `json:"formato_recomendado_id"`
	HookRec          string `json:"hook_recomendado_id"`
	Estado           string `json:"estado"`
	DriveURL         string `json:"drive_url"`
	Notas            string `json:"notas"`
	Estrategia       string `json:"estrategia"`
	ArchivadoAt      string `json:"archivado_at"`
	CreatedAt        string `json:"created_at"`
	UpdatedAt        string `json:"updated_at"`
	CreatedBy        string `json:"created_by"`
}

func (f clienteFila) aCliente() produccion.Cliente {
	return produccion.Cliente{
		ID: f.ID, Nombre: f.Nombre, LogoURL: f.LogoURL,
		ContactoNombre: f.ContactoNombre, ContactoTelefono: f.ContactoTelefono,
		ContactoWhatsapp: f.ContactoWhatsapp, Paquete: f.Paquete,
		PaqueteID: f.PaqueteID, VendidoPor: f.VendidoPor,
		FormatoRecomendadoID: f.FormatoRec, HookRecomendadoID: f.HookRec,
		Estado: f.Estado, DriveURL: f.DriveURL, Notas: f.Notas,
		Estrategia: f.Estrategia, ArchivadoAt: f.ArchivadoAt,
		CreatedAt: f.CreatedAt, UpdatedAt: f.UpdatedAt, CreatedBy: f.CreatedBy,
	}
}

func filaDeCliente(c produccion.Cliente) map[string]any {
	return map[string]any{
		"id": c.ID, "nombre": c.Nombre, "logo_url": nuloSiVacio(c.LogoURL),
		"contacto_nombre":   nuloSiVacio(c.ContactoNombre),
		"contacto_telefono": nuloSiVacio(c.ContactoTelefono),
		"contacto_whatsapp": nuloSiVacio(c.ContactoWhatsapp),
		"paquete":           nuloSiVacio(c.Paquete), "estado": c.Estado,
		"paquete_id":  nuloSiVacio(c.PaqueteID),
		"vendido_por": nuloSiVacio(c.VendidoPor),
		"formato_recomendado_id": nuloSiVacio(c.FormatoRecomendadoID),
		"hook_recomendado_id":    nuloSiVacio(c.HookRecomendadoID),
		"drive_url": nuloSiVacio(c.DriveURL), "notas": nuloSiVacio(c.Notas),
		"estrategia":   nuloSiVacio(c.Estrategia),
		"created_by":   nuloSiVacio(c.CreatedBy),
		"archivado_at": nuloSiVacio(c.ArchivadoAt),
	}
}

func (s *Supabase) ListClientes(incluirArchivados bool) ([]produccion.Cliente, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "order": {"nombre"}}
	var filas []clienteFila
	if err := s.c.REST(ctx, http.MethodGet, "clientes", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []produccion.Cliente{}
	for _, f := range filas {
		if f.ArchivadoAt != "" && !incluirArchivados {
			continue
		}
		out = append(out, f.aCliente())
	}
	return out, nil
}

func (s *Supabase) GetCliente(id string) (produccion.Cliente, bool, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "id": {"eq." + id}}
	var filas []clienteFila
	if err := s.c.REST(ctx, http.MethodGet, "clientes", q, nil, "", &filas); err != nil {
		return produccion.Cliente{}, false, err
	}
	if len(filas) == 0 {
		return produccion.Cliente{}, false, nil
	}
	return filas[0].aCliente(), true, nil
}

func (s *Supabase) CreateCliente(c produccion.Cliente) (produccion.Cliente, error) {
	if c.ID == "" {
		c.ID = NewUUID()
	}
	if c.Estado == "" {
		c.Estado = produccion.ClienteActivo
	}
	ctx, cancel := contexto()
	defer cancel()
	var filas []clienteFila
	if err := s.c.REST(ctx, http.MethodPost, "clientes", nil, filaDeCliente(c), "return=representation", &filas); err != nil {
		return produccion.Cliente{}, err
	}
	if len(filas) == 0 {
		return produccion.Cliente{}, ErrNoExiste
	}
	return filas[0].aCliente(), nil
}

func (s *Supabase) UpdateCliente(id string, cambios map[string]any) (produccion.Cliente, error) {
	ctx, cancel := contexto()
	defer cancel()
	var filas []clienteFila
	if err := s.c.REST(ctx, http.MethodPatch, "clientes", url.Values{"id": {"eq." + id}}, cambios, "return=representation", &filas); err != nil {
		return produccion.Cliente{}, err
	}
	if len(filas) == 0 {
		return produccion.Cliente{}, ErrNoExiste
	}
	return filas[0].aCliente(), nil
}

func (s *Supabase) ArchivarCliente(id string) (produccion.Cliente, error) {
	return s.UpdateCliente(id, map[string]any{"archivado_at": Ahora()})
}

type piezaFila struct {
	ID                string `json:"id"`
	ClienteID         string `json:"cliente_id"`
	Titulo            string `json:"titulo"`
	Formato           string `json:"formato"`
	Guion             string `json:"guion"`
	FechaObjetivo     string `json:"fecha_objetivo"`
	Estado            string `json:"estado"`
	MotivoCancelacion string `json:"motivo_cancelacion"`
	FormatoRec        string `json:"formato_recomendado_id"`
	HookRec           string `json:"hook_recomendado_id"`
	CreatedAt         string `json:"created_at"`
	UpdatedAt         string `json:"updated_at"`
	CreatedBy         string `json:"created_by"`
}

func (f piezaFila) aPieza() produccion.Pieza {
	return produccion.Pieza{
		ID: f.ID, ClienteID: f.ClienteID, Titulo: f.Titulo,
		Formato: f.Formato, Guion: f.Guion, FechaObjetivo: f.FechaObjetivo,
		Estado: f.Estado, MotivoCancelacion: f.MotivoCancelacion,
		FormatoRecomendadoID: f.FormatoRec, HookRecomendadoID: f.HookRec,
		CreatedAt: f.CreatedAt, UpdatedAt: f.UpdatedAt, CreatedBy: f.CreatedBy,
	}
}

func filaDePieza(p produccion.Pieza) map[string]any {
	return map[string]any{
		"id": p.ID, "cliente_id": p.ClienteID, "titulo": p.Titulo,
		"formato": p.Formato, "guion": p.Guion,
		"fecha_objetivo": nuloSiVacio(p.FechaObjetivo), "estado": p.Estado,
		"motivo_cancelacion": nuloSiVacio(p.MotivoCancelacion),
		"formato_recomendado_id": nuloSiVacio(p.FormatoRecomendadoID),
		"hook_recomendado_id":    nuloSiVacio(p.HookRecomendadoID),
		"created_by":             nuloSiVacio(p.CreatedBy),
	}
}

func (s *Supabase) ListPiezas() ([]produccion.Pieza, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "order": {"created_at.desc"}}
	var filas []piezaFila
	if err := s.c.REST(ctx, http.MethodGet, "piezas", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []produccion.Pieza{}
	for _, f := range filas {
		out = append(out, f.aPieza())
	}
	return out, nil
}

func (s *Supabase) GetPieza(id string) (produccion.Pieza, bool, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "id": {"eq." + id}}
	var filas []piezaFila
	if err := s.c.REST(ctx, http.MethodGet, "piezas", q, nil, "", &filas); err != nil {
		return produccion.Pieza{}, false, err
	}
	if len(filas) == 0 {
		return produccion.Pieza{}, false, nil
	}
	return filas[0].aPieza(), true, nil
}

func (s *Supabase) CreatePieza(p produccion.Pieza) (produccion.Pieza, error) {
	if p.ID == "" {
		p.ID = NewUUID()
	}
	if p.Estado == "" {
		p.Estado = produccion.PiezaBorrador
	}
	ctx, cancel := contexto()
	defer cancel()
	var filas []piezaFila
	if err := s.c.REST(ctx, http.MethodPost, "piezas", nil, filaDePieza(p), "return=representation", &filas); err != nil {
		return produccion.Pieza{}, err
	}
	if len(filas) == 0 {
		return produccion.Pieza{}, ErrNoExiste
	}
	return filas[0].aPieza(), nil
}

func (s *Supabase) UpdatePieza(id string, cambios map[string]any) (produccion.Pieza, error) {
	ctx, cancel := contexto()
	defer cancel()
	var filas []piezaFila
	if err := s.c.REST(ctx, http.MethodPatch, "piezas", url.Values{"id": {"eq." + id}}, cambios, "return=representation", &filas); err != nil {
		return produccion.Pieza{}, err
	}
	if len(filas) == 0 {
		return produccion.Pieza{}, ErrNoExiste
	}
	return filas[0].aPieza(), nil
}

type tareaFila struct {
	ID                string `json:"id"`
	PiezaID           string `json:"pieza_id"`
	Etapa             string `json:"etapa"`
	AsignadoID        string `json:"asignado_id"`
	Estado            string `json:"estado"`
	FechaLimite       string `json:"fecha_limite"`
	MaterialURL       string `json:"material_url"`
	Minutos           *int   `json:"minutos"`
	EntregableURL     string `json:"entregable_url"`
	PublicadoURL      string `json:"publicado_url"`
	DecisionPendiente bool   `json:"decision_pendiente"`
	CreatedAt         string `json:"created_at"`
	UpdatedAt         string `json:"updated_at"`
	CreatedBy         string `json:"created_by"`
}

func (f tareaFila) aTarea() produccion.Tarea {
	return produccion.Tarea{
		ID: f.ID, PiezaID: f.PiezaID, Etapa: f.Etapa, AsignadoID: f.AsignadoID,
		Estado: f.Estado, FechaLimite: f.FechaLimite, MaterialURL: f.MaterialURL,
		Minutos: f.Minutos, EntregableURL: f.EntregableURL,
		PublicadoURL: f.PublicadoURL, DecisionPendiente: f.DecisionPendiente,
		CreatedAt: f.CreatedAt, UpdatedAt: f.UpdatedAt, CreatedBy: f.CreatedBy,
	}
}

func filaDeTarea(t produccion.Tarea) map[string]any {
	return map[string]any{
		"id": t.ID, "pieza_id": t.PiezaID, "etapa": t.Etapa,
		"asignado_id": nuloSiVacio(t.AsignadoID), "estado": t.Estado,
		"fecha_limite": nuloSiVacio(t.FechaLimite),
		"material_url": nuloSiVacio(t.MaterialURL), "minutos": t.Minutos,
		"entregable_url": nuloSiVacio(t.EntregableURL),
		"publicado_url":  nuloSiVacio(t.PublicadoURL),
		"created_by":     nuloSiVacio(t.CreatedBy),
	}
}

func (s *Supabase) ListTareas() ([]produccion.Tarea, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "order": {"created_at"}}
	var filas []tareaFila
	if err := s.c.REST(ctx, http.MethodGet, "tareas", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []produccion.Tarea{}
	for _, f := range filas {
		out = append(out, f.aTarea())
	}
	return out, nil
}

func (s *Supabase) GetTarea(id string) (produccion.Tarea, bool, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "id": {"eq." + id}}
	var filas []tareaFila
	if err := s.c.REST(ctx, http.MethodGet, "tareas", q, nil, "", &filas); err != nil {
		return produccion.Tarea{}, false, err
	}
	if len(filas) == 0 {
		return produccion.Tarea{}, false, nil
	}
	return filas[0].aTarea(), true, nil
}

func (s *Supabase) CreateTarea(t produccion.Tarea) (produccion.Tarea, error) {
	if t.ID == "" {
		t.ID = NewUUID()
	}
	if t.Estado == "" {
		t.Estado = produccion.TareaBloqueada
	}
	ctx, cancel := contexto()
	defer cancel()
	var filas []tareaFila
	if err := s.c.REST(ctx, http.MethodPost, "tareas", nil, filaDeTarea(t), "return=representation", &filas); err != nil {
		return produccion.Tarea{}, err
	}
	if len(filas) == 0 {
		return produccion.Tarea{}, ErrNoExiste
	}
	return filas[0].aTarea(), nil
}

func (s *Supabase) UpdateTarea(id string, cambios map[string]any) (produccion.Tarea, error) {
	ctx, cancel := contexto()
	defer cancel()
	var filas []tareaFila
	if err := s.c.REST(ctx, http.MethodPatch, "tareas", url.Values{"id": {"eq." + id}}, cambios, "return=representation", &filas); err != nil {
		return produccion.Tarea{}, err
	}
	if len(filas) == 0 {
		return produccion.Tarea{}, ErrNoExiste
	}
	return filas[0].aTarea(), nil
}

func (s *Supabase) TareasDePieza(piezaID string) ([]produccion.Tarea, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "pieza_id": {"eq." + piezaID}, "order": {"created_at"}}
	var filas []tareaFila
	if err := s.c.REST(ctx, http.MethodGet, "tareas", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []produccion.Tarea{}
	for _, f := range filas {
		out = append(out, f.aTarea())
	}
	return out, nil
}

type tareaEventoFila struct {
	ID          string  `json:"id"`
	TareaID     string  `json:"tarea_id"`
	Cuando      string  `json:"cuando"`
	ActorID     string  `json:"actor_id"`
	ActorNombre string  `json:"actor_nombre"`
	Accion      string  `json:"accion"`
	Antes       any     `json:"antes"`
	Despues     any     `json:"despues"`
	Comentario  *string `json:"comentario"`
}

func (f tareaEventoFila) aEvento() produccion.TareaEvento {
	return produccion.TareaEvento{
		ID: f.ID, TareaID: f.TareaID, Cuando: f.Cuando, ActorID: f.ActorID,
		ActorNombre: f.ActorNombre, Accion: f.Accion, Antes: f.Antes,
		Despues: f.Despues, Comentario: f.Comentario,
	}
}

func (s *Supabase) ListTareaEventos(tareaID string) ([]produccion.TareaEvento, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "tarea_id": {"eq." + tareaID}, "order": {"cuando"}}
	var filas []tareaEventoFila
	if err := s.c.REST(ctx, http.MethodGet, "tarea_eventos", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []produccion.TareaEvento{}
	for _, f := range filas {
		out = append(out, f.aEvento())
	}
	return out, nil
}

func (s *Supabase) TodosTareaEventos() ([]produccion.TareaEvento, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"tarea_id,despues"}}
	var filas []tareaEventoFila
	if err := s.c.REST(ctx, http.MethodGet, "tarea_eventos", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []produccion.TareaEvento{}
	for _, f := range filas {
		out = append(out, f.aEvento())
	}
	return out, nil
}

func (s *Supabase) AddTareaEvento(e produccion.TareaEvento) (produccion.TareaEvento, error) {
	if e.ID == "" {
		e.ID = NewUUID()
	}
	ctx, cancel := contexto()
	defer cancel()
	body := map[string]any{
		"id": e.ID, "tarea_id": e.TareaID, "actor_id": nuloSiVacio(e.ActorID),
		"actor_nombre": nuloSiVacio(e.ActorNombre), "accion": e.Accion,
		"antes": e.Antes, "despues": e.Despues, "comentario": e.Comentario,
	}
	var filas []tareaEventoFila
	if err := s.c.REST(ctx, http.MethodPost, "tarea_eventos", nil, body, "return=representation", &filas); err != nil {
		return produccion.TareaEvento{}, err
	}
	if len(filas) == 0 {
		return e, nil
	}
	return filas[0].aEvento(), nil
}

type notiFila struct {
	ID        string `json:"id"`
	UsuarioID string `json:"usuario_id"`
	Tipo      string `json:"tipo"`
	Titulo    string `json:"titulo"`
	Detalle   string `json:"detalle"`
	Leida     bool   `json:"leida"`
	Recurso   string `json:"recurso"`
	RecursoID string `json:"recurso_id"`
	CreatedAt string `json:"created_at"`
}

func (f notiFila) aNoti() produccion.Notificacion {
	return produccion.Notificacion{
		ID: f.ID, UsuarioID: f.UsuarioID, Tipo: f.Tipo, Titulo: f.Titulo,
		Detalle: f.Detalle, Leida: f.Leida, Recurso: f.Recurso,
		RecursoID: f.RecursoID, CreatedAt: f.CreatedAt,
	}
}

func (s *Supabase) ListNotificaciones(usuarioID string) ([]produccion.Notificacion, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "usuario_id": {"eq." + usuarioID}, "order": {"created_at.desc"}}
	var filas []notiFila
	if err := s.c.REST(ctx, http.MethodGet, "notificaciones", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []produccion.Notificacion{}
	for _, f := range filas {
		out = append(out, f.aNoti())
	}
	return out, nil
}

func (s *Supabase) AddNotificacion(n produccion.Notificacion) (produccion.Notificacion, error) {
	if n.ID == "" {
		n.ID = NewUUID()
	}
	ctx, cancel := contexto()
	defer cancel()
	body := map[string]any{
		"id": n.ID, "usuario_id": n.UsuarioID, "tipo": n.Tipo,
		"titulo": n.Titulo, "detalle": nuloSiVacio(n.Detalle),
		"recurso": nuloSiVacio(n.Recurso), "recurso_id": nuloSiVacio(n.RecursoID),
	}
	var filas []notiFila
	if err := s.c.REST(ctx, http.MethodPost, "notificaciones", nil, body, "return=representation", &filas); err != nil {
		return produccion.Notificacion{}, err
	}
	if len(filas) == 0 {
		return n, nil
	}
	return filas[0].aNoti(), nil
}

func (s *Supabase) MarcarLeida(usuarioID, id string) (produccion.Notificacion, error) {
	actual, existe, err := s.getNoti(id)
	if err != nil {
		return produccion.Notificacion{}, err
	}
	if !existe || actual.UsuarioID != usuarioID {
		return produccion.Notificacion{}, ErrNoExiste
	}
	ctx, cancel := contexto()
	defer cancel()
	var filas []notiFila
	if err := s.c.REST(ctx, http.MethodPatch, "notificaciones", url.Values{"id": {"eq." + id}}, map[string]any{"leida": true}, "return=representation", &filas); err != nil {
		return produccion.Notificacion{}, err
	}
	if len(filas) == 0 {
		return produccion.Notificacion{}, ErrNoExiste
	}
	return filas[0].aNoti(), nil
}

func (s *Supabase) getNoti(id string) (produccion.Notificacion, bool, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "id": {"eq." + id}}
	var filas []notiFila
	if err := s.c.REST(ctx, http.MethodGet, "notificaciones", q, nil, "", &filas); err != nil {
		return produccion.Notificacion{}, false, err
	}
	if len(filas) == 0 {
		return produccion.Notificacion{}, false, nil
	}
	return filas[0].aNoti(), true, nil
}

// --- F2 cobros (Supabase REST, service role) ---
// Columnas según 003_cobros.sql (snake_case). Los filtros de listado los
// aplica el handler sobre el resultado, como en F1.

type tarifaFila struct {
	ID           string `json:"id"`
	Etapa        string `json:"etapa"`
	Unidad       string `json:"unidad"`
	MontoCOP     int64  `json:"monto_cop"`
	VigenteDesde string `json:"vigente_desde"`
	VigenteHasta string `json:"vigente_hasta"`
	Version      int    `json:"version"`
	Activa       bool   `json:"activa"`
	Demo         bool   `json:"demo"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
	CreatedBy    string `json:"created_by"`
}

func (f tarifaFila) aTarifa() cobros.Tarifa {
	return cobros.Tarifa{
		ID: f.ID, Etapa: f.Etapa, Unidad: f.Unidad, MontoCOP: f.MontoCOP,
		VigenteDesde: f.VigenteDesde, VigenteHasta: f.VigenteHasta,
		Version: f.Version, Activa: f.Activa, Demo: f.Demo,
		CreatedAt: f.CreatedAt, UpdatedAt: f.UpdatedAt, CreatedBy: f.CreatedBy,
	}
}

func (s *Supabase) ListTarifas() ([]cobros.Tarifa, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "order": {"created_at"}}
	var filas []tarifaFila
	if err := s.c.REST(ctx, http.MethodGet, "tarifas", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []cobros.Tarifa{}
	for _, f := range filas {
		out = append(out, f.aTarifa())
	}
	return out, nil
}

func (s *Supabase) GetTarifa(id string) (cobros.Tarifa, bool, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "id": {"eq." + id}}
	var filas []tarifaFila
	if err := s.c.REST(ctx, http.MethodGet, "tarifas", q, nil, "", &filas); err != nil {
		return cobros.Tarifa{}, false, err
	}
	if len(filas) == 0 {
		return cobros.Tarifa{}, false, nil
	}
	return filas[0].aTarifa(), true, nil
}

// CreateTarifa versiona en dos pasos: desactiva la activa (etapa+unidad) y
// luego inserta la nueva con version+1.
func (s *Supabase) CreateTarifa(t cobros.Tarifa) (cobros.Tarifa, error) {
	if t.ID == "" {
		t.ID = NewUUID()
	}
	previas, err := s.ListTarifas()
	if err != nil {
		return cobros.Tarifa{}, err
	}
	version := 1
	for _, p := range previas {
		if p.Activa && p.Etapa == t.Etapa && p.Unidad == t.Unidad {
			_, _ = s.cerrarTarifaREST(p.ID)
			if p.Version >= version {
				version = p.Version + 1
			}
		}
	}
	t.Version = version
	t.Activa = true
	ctx, cancel := contexto()
	defer cancel()
	body := map[string]any{
		"id": t.ID, "etapa": t.Etapa, "unidad": t.Unidad,
		"monto_cop": t.MontoCOP, "version": t.Version, "activa": true,
		"demo": t.Demo, "created_by": nuloSiVacio(t.CreatedBy),
	}
	var filas []tarifaFila
	if err := s.c.REST(ctx, http.MethodPost, "tarifas", nil, body, "return=representation", &filas); err != nil {
		return cobros.Tarifa{}, err
	}
	if len(filas) == 0 {
		return cobros.Tarifa{}, ErrNoExiste
	}
	return filas[0].aTarifa(), nil
}

func (s *Supabase) cerrarTarifaREST(id string) (tarifaFila, error) {
	ctx, cancel := contexto()
	defer cancel()
	var filas []tarifaFila
	body := map[string]any{"activa": false, "vigente_hasta": Ahora()}
	if err := s.c.REST(ctx, http.MethodPatch, "tarifas", url.Values{"id": {"eq." + id}}, body, "return=representation", &filas); err != nil {
		return tarifaFila{}, err
	}
	if len(filas) == 0 {
		return tarifaFila{}, ErrNoExiste
	}
	return filas[0], nil
}

type tramoFila struct {
	ID       string `json:"id"`
	TarifaID string `json:"tarifa_id"`
	DesdeSeg int    `json:"desde_seg"`
	HastaSeg *int   `json:"hasta_seg"`
	MontoCOP int64  `json:"monto_cop"`
}

func (s *Supabase) ListTramos(tarifaID string) ([]cobros.TarifaTramo, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "tarifa_id": {"eq." + tarifaID}, "order": {"desde_seg"}}
	var filas []tramoFila
	if err := s.c.REST(ctx, http.MethodGet, "tarifa_tramos", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []cobros.TarifaTramo{}
	for _, f := range filas {
		out = append(out, cobros.TarifaTramo{
			ID: f.ID, TarifaID: f.TarifaID, DesdeSeg: f.DesdeSeg,
			HastaSeg: f.HastaSeg, MontoCOP: f.MontoCOP,
		})
	}
	return out, nil
}

func (s *Supabase) CreateTramo(tr cobros.TarifaTramo) (cobros.TarifaTramo, error) {
	if tr.ID == "" {
		tr.ID = NewUUID()
	}
	ctx, cancel := contexto()
	defer cancel()
	body := map[string]any{
		"id": tr.ID, "tarifa_id": tr.TarifaID, "desde_seg": tr.DesdeSeg,
		"hasta_seg": tr.HastaSeg, "monto_cop": tr.MontoCOP,
	}
	var filas []tramoFila
	if err := s.c.REST(ctx, http.MethodPost, "tarifa_tramos", nil, body, "return=representation", &filas); err != nil {
		return cobros.TarifaTramo{}, err
	}
	if len(filas) == 0 {
		return tr, nil
	}
	f := filas[0]
	return cobros.TarifaTramo{
		ID: f.ID, TarifaID: f.TarifaID, DesdeSeg: f.DesdeSeg,
		HastaSeg: f.HastaSeg, MontoCOP: f.MontoCOP,
	}, nil
}

type paqueteFila struct {
	ID        string `json:"id"`
	Nombre    string `json:"nombre"`
	PrecioCOP int64  `json:"precio_cop"`
	Activo    bool   `json:"activo"`
	Demo      bool   `json:"demo"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

func (f paqueteFila) aPaquete() cobros.Paquete {
	return cobros.Paquete{
		ID: f.ID, Nombre: f.Nombre, PrecioCOP: f.PrecioCOP,
		Activo: f.Activo, Demo: f.Demo,
		CreatedAt: f.CreatedAt, UpdatedAt: f.UpdatedAt,
	}
}

func (s *Supabase) ListPaquetes() ([]cobros.Paquete, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "order": {"nombre"}}
	var filas []paqueteFila
	if err := s.c.REST(ctx, http.MethodGet, "paquetes", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []cobros.Paquete{}
	for _, f := range filas {
		out = append(out, f.aPaquete())
	}
	return out, nil
}

func (s *Supabase) GetPaquete(id string) (cobros.Paquete, bool, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "id": {"eq." + id}}
	var filas []paqueteFila
	if err := s.c.REST(ctx, http.MethodGet, "paquetes", q, nil, "", &filas); err != nil {
		return cobros.Paquete{}, false, err
	}
	if len(filas) == 0 {
		return cobros.Paquete{}, false, nil
	}
	return filas[0].aPaquete(), true, nil
}

func (s *Supabase) CreatePaquete(p cobros.Paquete) (cobros.Paquete, error) {
	if p.ID == "" {
		p.ID = NewUUID()
	}
	ctx, cancel := contexto()
	defer cancel()
	body := map[string]any{
		"id": p.ID, "nombre": p.Nombre, "precio_cop": p.PrecioCOP,
		"activo": true, "demo": p.Demo,
	}
	var filas []paqueteFila
	if err := s.c.REST(ctx, http.MethodPost, "paquetes", nil, body, "return=representation", &filas); err != nil {
		return cobros.Paquete{}, err
	}
	if len(filas) == 0 {
		return cobros.Paquete{}, ErrNoExiste
	}
	return filas[0].aPaquete(), nil
}

func (s *Supabase) UpdatePaquete(id string, cambios map[string]any) (cobros.Paquete, error) {
	ctx, cancel := contexto()
	defer cancel()
	var filas []paqueteFila
	if err := s.c.REST(ctx, http.MethodPatch, "paquetes", url.Values{"id": {"eq." + id}}, cambios, "return=representation", &filas); err != nil {
		return cobros.Paquete{}, err
	}
	if len(filas) == 0 {
		return cobros.Paquete{}, ErrNoExiste
	}
	return filas[0].aPaquete(), nil
}

type configFila struct {
	Porcentaje float64 `json:"porcentaje_comision"`
	Modo       string  `json:"modo_comision"`
}

func (s *Supabase) GetConfig() (cobros.ConfigCobros, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"porcentaje_comision,modo_comision"}, "id": {"eq.true"}}
	var filas []configFila
	if err := s.c.REST(ctx, http.MethodGet, "config_cobros", q, nil, "", &filas); err != nil {
		return cobros.ConfigCobros{}, err
	}
	if len(filas) == 0 {
		return cobros.ConfigCobros{PorcentajeComision: 8, ModoComision: cobros.ModoUnaVez}, nil
	}
	return cobros.ConfigCobros{PorcentajeComision: filas[0].Porcentaje, ModoComision: filas[0].Modo}, nil
}

func (s *Supabase) UpdateConfig(c cobros.ConfigCobros) (cobros.ConfigCobros, error) {
	ctx, cancel := contexto()
	defer cancel()
	body := map[string]any{
		"porcentaje_comision": c.PorcentajeComision, "modo_comision": c.ModoComision,
	}
	var filas []configFila
	if err := s.c.REST(ctx, http.MethodPatch, "config_cobros", url.Values{"id": {"eq.true"}}, body, "return=representation", &filas); err != nil {
		return cobros.ConfigCobros{}, err
	}
	return c, nil
}

type lineaFila struct {
	ID                string   `json:"id"`
	TareaID           string   `json:"tarea_id"`
	UsuarioID         string   `json:"usuario_id"`
	Tipo              string   `json:"tipo"`
	Estado            string   `json:"estado"`
	MontoCOP          int64    `json:"monto_cop"`
	TarifaID          string   `json:"tarifa_id"`
	Unidad            string   `json:"unidad"`
	Cantidad          *float64 `json:"cantidad"`
	Motivo            string   `json:"motivo"`
	ReclamoMotivo     string   `json:"reclamo_motivo"`
	Periodo           string   `json:"periodo"`
	CorteID           string   `json:"corte_id"`
	ComisionClienteID string   `json:"comision_cliente_id"`
	CreatedAt         string   `json:"created_at"`
	UpdatedAt         string   `json:"updated_at"`
	CreatedBy         string   `json:"created_by"`
}

func (f lineaFila) aLinea() cobros.LineaCobro {
	return cobros.LineaCobro{
		ID: f.ID, TareaID: f.TareaID, UsuarioID: f.UsuarioID, Tipo: f.Tipo,
		Estado: f.Estado, MontoCOP: f.MontoCOP, TarifaID: f.TarifaID,
		Unidad: f.Unidad, Cantidad: f.Cantidad, Motivo: f.Motivo,
		ReclamoMotivo: f.ReclamoMotivo, Periodo: f.Periodo, CorteID: f.CorteID,
		ComisionClienteID: f.ComisionClienteID,
		CreatedAt: f.CreatedAt, UpdatedAt: f.UpdatedAt, CreatedBy: f.CreatedBy,
	}
}

func filaDeLinea(l cobros.LineaCobro) map[string]any {
	return map[string]any{
		"id": l.ID, "tarea_id": nuloSiVacio(l.TareaID), "usuario_id": l.UsuarioID,
		"tipo": l.Tipo, "estado": l.Estado, "monto_cop": l.MontoCOP,
		"tarifa_id": nuloSiVacio(l.TarifaID), "unidad": nuloSiVacio(l.Unidad),
		"cantidad": l.Cantidad, "motivo": nuloSiVacio(l.Motivo),
		"reclamo_motivo": nuloSiVacio(l.ReclamoMotivo), "periodo": l.Periodo,
		"corte_id": nuloSiVacio(l.CorteID),
		"comision_cliente_id": nuloSiVacio(l.ComisionClienteID),
		"created_by":          nuloSiVacio(l.CreatedBy),
	}
}

func (s *Supabase) CreateLinea(l cobros.LineaCobro) (cobros.LineaCobro, error) {
	if l.ID == "" {
		l.ID = NewUUID()
	}
	ctx, cancel := contexto()
	defer cancel()
	var filas []lineaFila
	if err := s.c.REST(ctx, http.MethodPost, "lineas_cobro", nil, filaDeLinea(l), "return=representation", &filas); err != nil {
		return cobros.LineaCobro{}, err
	}
	if len(filas) == 0 {
		return l, nil
	}
	return filas[0].aLinea(), nil
}

func (s *Supabase) GetLinea(id string) (cobros.LineaCobro, bool, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "id": {"eq." + id}}
	var filas []lineaFila
	if err := s.c.REST(ctx, http.MethodGet, "lineas_cobro", q, nil, "", &filas); err != nil {
		return cobros.LineaCobro{}, false, err
	}
	if len(filas) == 0 {
		return cobros.LineaCobro{}, false, nil
	}
	return filas[0].aLinea(), true, nil
}

func (s *Supabase) ListLineas() ([]cobros.LineaCobro, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "order": {"created_at.desc"}}
	var filas []lineaFila
	if err := s.c.REST(ctx, http.MethodGet, "lineas_cobro", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []cobros.LineaCobro{}
	for _, f := range filas {
		out = append(out, f.aLinea())
	}
	return out, nil
}

// UpdateLineaEstado solo envía estado/motivo/reclamo/corte/periodo (§2).
func (s *Supabase) UpdateLineaEstado(id string, cambios map[string]any) (cobros.LineaCobro, error) {
	permitido := map[string]bool{
		"estado": true, "motivo": true, "reclamo_motivo": true,
		"corte_id": true, "periodo": true,
	}
	body := map[string]any{}
	for k, v := range cambios {
		if permitido[k] {
			body[k] = v
		}
	}
	ctx, cancel := contexto()
	defer cancel()
	var filas []lineaFila
	if err := s.c.REST(ctx, http.MethodPatch, "lineas_cobro", url.Values{"id": {"eq." + id}}, body, "return=representation", &filas); err != nil {
		return cobros.LineaCobro{}, err
	}
	if len(filas) == 0 {
		return cobros.LineaCobro{}, ErrNoExiste
	}
	return filas[0].aLinea(), nil
}

func (s *Supabase) LineaDeTarea(tareaID string) (cobros.LineaCobro, bool, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "tarea_id": {"eq." + tareaID}, "tipo": {"eq.tarea"}}
	var filas []lineaFila
	if err := s.c.REST(ctx, http.MethodGet, "lineas_cobro", q, nil, "", &filas); err != nil {
		return cobros.LineaCobro{}, false, err
	}
	if len(filas) == 0 {
		return cobros.LineaCobro{}, false, nil
	}
	return filas[0].aLinea(), true, nil
}

type corteFila struct {
	ID        string `json:"id"`
	Periodo   string `json:"periodo"`
	Estado    string `json:"estado"`
	CerradoAt string `json:"cerrado_at"`
	CreatedBy string `json:"created_by"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

func (f corteFila) aCorte() cobros.Corte {
	return cobros.Corte{
		ID: f.ID, Periodo: f.Periodo, Estado: f.Estado, CerradoAt: f.CerradoAt,
		CreatedBy: f.CreatedBy, CreatedAt: f.CreatedAt, UpdatedAt: f.UpdatedAt,
	}
}

func (s *Supabase) ListCortes() ([]cobros.Corte, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "order": {"periodo.desc"}}
	var filas []corteFila
	if err := s.c.REST(ctx, http.MethodGet, "cortes", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []cobros.Corte{}
	for _, f := range filas {
		out = append(out, f.aCorte())
	}
	return out, nil
}

func (s *Supabase) GetCorteByPeriodo(periodo string) (cobros.Corte, bool, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "periodo": {"eq." + periodo}}
	var filas []corteFila
	if err := s.c.REST(ctx, http.MethodGet, "cortes", q, nil, "", &filas); err != nil {
		return cobros.Corte{}, false, err
	}
	if len(filas) == 0 {
		return cobros.Corte{}, false, nil
	}
	return filas[0].aCorte(), true, nil
}

func (s *Supabase) CreateCorte(c cobros.Corte) (cobros.Corte, error) {
	if c.ID == "" {
		c.ID = NewUUID()
	}
	if c.Estado == "" {
		c.Estado = cobros.CorteCerrado
	}
	ctx, cancel := contexto()
	defer cancel()
	body := map[string]any{
		"id": c.ID, "periodo": c.Periodo, "estado": c.Estado,
		"cerrado_at": nuloSiVacio(c.CerradoAt),
		"created_by": nuloSiVacio(c.CreatedBy),
	}
	var filas []corteFila
	if err := s.c.REST(ctx, http.MethodPost, "cortes", nil, body, "return=representation", &filas); err != nil {
		return cobros.Corte{}, err
	}
	if len(filas) == 0 {
		return c, nil
	}
	return filas[0].aCorte(), nil
}

func (s *Supabase) UpdateCorte(id string, cambios map[string]any) (cobros.Corte, error) {
	ctx, cancel := contexto()
	defer cancel()
	var filas []corteFila
	if err := s.c.REST(ctx, http.MethodPatch, "cortes", url.Values{"id": {"eq." + id}}, cambios, "return=representation", &filas); err != nil {
		return cobros.Corte{}, err
	}
	if len(filas) == 0 {
		return cobros.Corte{}, ErrNoExiste
	}
	return filas[0].aCorte(), nil
}
