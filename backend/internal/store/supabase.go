// Implementación de store.Store contra Supabase (PostgREST con service role,
// solo server-side). Tablas: usuarios y actividad. RLS queda como segunda capa
// (anon sin acceso); toda consulta ya viene filtrada por el user_id verificado.
package store

import (
	"context"
	"net/http"
	"net/url"
	"time"

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
