// Supabase — F5 asistente: REST contra las tablas de 006_asistente.sql
// (asistente_conversaciones, asistente_mensajes, asistente_uso).
// guion_borrador vive en piezas (misma tabla F1). Mismo patrón F1–F4
// (service role; filtros finos en el handler, no aquí).
package store

import (
	"net/http"
	"net/url"

	"rconceptsys/backend/internal/asistente"
	"rconceptsys/backend/internal/produccion"
)

type conversacionFila struct {
	ID        string `json:"id"`
	UsuarioID string `json:"usuario_id"`
	Titulo    string `json:"titulo"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

func (f conversacionFila) aConversacion() asistente.Conversacion {
	return asistente.Conversacion{
		ID: f.ID, UsuarioID: f.UsuarioID, Titulo: f.Titulo,
		CreatedAt: f.CreatedAt, UpdatedAt: f.UpdatedAt,
	}
}

func (s *Supabase) ListConversaciones(usuarioID string) ([]Conversacion, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "usuario_id": {"eq." + usuarioID}, "order": {"updated_at.desc"}}
	var filas []conversacionFila
	if err := s.c.REST(ctx, http.MethodGet, "asistente_conversaciones", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []Conversacion{}
	for _, f := range filas {
		out = append(out, f.aConversacion())
	}
	return out, nil
}

func (s *Supabase) CreateConversacion(c Conversacion) (Conversacion, error) {
	if c.ID == "" {
		c.ID = NewUUID()
	}
	ctx, cancel := contexto()
	defer cancel()
	body := map[string]any{
		"id": c.ID, "usuario_id": c.UsuarioID,
		"titulo": nuloSiVacio(c.Titulo),
	}
	var filas []conversacionFila
	if err := s.c.REST(ctx, http.MethodPost, "asistente_conversaciones", nil, body, "return=representation", &filas); err != nil {
		return Conversacion{}, err
	}
	if len(filas) == 0 {
		return Conversacion{}, ErrNoExiste
	}
	return filas[0].aConversacion(), nil
}

func (s *Supabase) TouchConversacion(id string) (Conversacion, error) {
	ctx, cancel := contexto()
	defer cancel()
	body := map[string]any{"titulo": nil}
	var filas []conversacionFila
	_ = body
	// Solo toca updated_at: PATCH vacío con Prefer no lo actualiza en
	// PostgREST; se envía el id (sin cambio) para forzar la fila.
	if err := s.c.REST(ctx, http.MethodPatch, "asistente_conversaciones", url.Values{"id": {"eq." + id}}, map[string]any{"id": id}, "return=representation", &filas); err != nil {
		return Conversacion{}, err
	}
	if len(filas) == 0 {
		return Conversacion{}, ErrNoExiste
	}
	return filas[0].aConversacion(), nil
}

type mensajeFila struct {
	ID             string `json:"id"`
	ConversacionID string `json:"conversacion_id"`
	Rol            string `json:"rol"`
	Contenido      string `json:"contenido"`
	CreatedAt      string `json:"created_at"`
}

func (f mensajeFila) aMensaje() asistente.Mensaje {
	return asistente.Mensaje{
		ID: f.ID, ConversacionID: f.ConversacionID, Rol: f.Rol,
		Contenido: f.Contenido, CreatedAt: f.CreatedAt,
	}
}

func (s *Supabase) ListMensajes(conversacionID string) ([]Mensaje, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "conversacion_id": {"eq." + conversacionID}, "order": {"created_at"}}
	var filas []mensajeFila
	if err := s.c.REST(ctx, http.MethodGet, "asistente_mensajes", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []Mensaje{}
	for _, f := range filas {
		out = append(out, f.aMensaje())
	}
	return out, nil
}

func (s *Supabase) CreateMensaje(m Mensaje) (Mensaje, error) {
	if m.ID == "" {
		m.ID = NewUUID()
	}
	ctx, cancel := contexto()
	defer cancel()
	body := map[string]any{
		"id": m.ID, "conversacion_id": m.ConversacionID,
		"rol": m.Rol, "contenido": m.Contenido,
	}
	var filas []mensajeFila
	if err := s.c.REST(ctx, http.MethodPost, "asistente_mensajes", nil, body, "return=representation", &filas); err != nil {
		return Mensaje{}, err
	}
	if len(filas) == 0 {
		return Mensaje{}, ErrNoExiste
	}
	return filas[0].aMensaje(), nil
}

type usoFila struct {
	UsuarioID string `json:"usuario_id"`
	Dia       string `json:"dia"`
	Conteo    int    `json:"conteo"`
}

func (s *Supabase) UsoHoy(usuarioID, dia string) (int, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"conteo"}, "usuario_id": {"eq." + usuarioID}, "dia": {"eq." + dia}}
	var filas []usoFila
	if err := s.c.REST(ctx, http.MethodGet, "asistente_uso", q, nil, "", &filas); err != nil {
		return 0, err
	}
	if len(filas) == 0 {
		return 0, nil
	}
	return filas[0].Conteo, nil
}

func (s *Supabase) SumarUso(usuarioID, dia string) (int, error) {
	actual, err := s.UsoHoy(usuarioID, dia)
	if err != nil {
		return 0, err
	}
	ctx, cancel := contexto()
	defer cancel()
	if actual == 0 {
		body := map[string]any{"usuario_id": usuarioID, "dia": dia, "conteo": 1}
		var filas []usoFila
		if err := s.c.REST(ctx, http.MethodPost, "asistente_uso", nil, body, "return=representation", &filas); err != nil {
			return 0, err
		}
		return 1, nil
	}
	var filas []usoFila
	if err := s.c.REST(ctx, http.MethodPatch, "asistente_uso",
		url.Values{"usuario_id": {"eq." + usuarioID}, "dia": {"eq." + dia}},
		map[string]any{"conteo": actual + 1}, "return=representation", &filas); err != nil {
		return 0, err
	}
	return actual + 1, nil
}

func (s *Supabase) UpdatePiezaBorrador(id, borrador string) (Pieza, error) {
	ctx, cancel := contexto()
	defer cancel()
	var filas []piezaFila
	if err := s.c.REST(ctx, http.MethodPatch, "piezas", url.Values{"id": {"eq." + id}},
		map[string]any{"guion_borrador": borrador}, "return=representation", &filas); err != nil {
		return produccion.Pieza{}, err
	}
	if len(filas) == 0 {
		return produccion.Pieza{}, ErrNoExiste
	}
	return filas[0].aPieza(), nil
}
