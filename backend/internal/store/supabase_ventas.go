// Supabase — F4 ventas: CRUD REST contra las tablas de 005_ventas.sql.
// Mismo patrón F1/F2/F3 (service role; filtros finos en el handler, no aquí).
// Archivos: GuardarArchivo queda preparado para Storage; en Supabase sin
// bucket guarda error (el modo demo en memoria sí guarda). ObtenerArchivo
// igual.
package store

import (
	"errors"
	"net/http"
	"net/url"

	"rconceptsys/backend/internal/ventas"
)

type leadFila struct {
	ID               string `json:"id"`
	Negocio          string `json:"negocio"`
	ContactoNombre   string `json:"contacto_nombre"`
	Telefono         string `json:"telefono"`
	TelefonoNorm     string `json:"telefono_norm"`
	Direccion        string `json:"direccion"`
	Barrio           string `json:"barrio"`
	Municipio        string `json:"municipio"`
	Rubro            string `json:"rubro"`
	Origen           string `json:"origen"`
	ValorEstimadoCOP int64  `json:"valor_estimado_cop"`
	PaqueteID        string `json:"paquete_id"`
	Notas            string `json:"notas"`
	AccionQue        string `json:"accion_que"`
	AccionFecha      string `json:"accion_fecha"`
	Estado           string `json:"estado"`
	MotivoPerdida    string `json:"motivo_perdida"`
	VendedorID       string `json:"vendedor_id"`
	ClienteID        string `json:"cliente_id"`
	Demo             bool   `json:"demo"`
	CreatedAt        string `json:"created_at"`
	UpdatedAt        string `json:"updated_at"`
	CreatedBy        string `json:"created_by"`
}

func (f leadFila) aLead() ventas.Lead {
	return ventas.Lead{
		ID: f.ID, Negocio: f.Negocio, ContactoNombre: f.ContactoNombre,
		Telefono: f.Telefono, TelefonoNorm: f.TelefonoNorm,
		Direccion: f.Direccion, Barrio: f.Barrio, Municipio: f.Municipio,
		Rubro: f.Rubro, Origen: f.Origen,
		ValorEstimadoCOP: f.ValorEstimadoCOP, PaqueteID: f.PaqueteID,
		Notas: f.Notas, AccionQue: f.AccionQue, AccionFecha: f.AccionFecha,
		Estado: f.Estado, MotivoPerdida: f.MotivoPerdida,
		VendedorID: f.VendedorID, ClienteID: f.ClienteID, Demo: f.Demo,
		CreatedAt: f.CreatedAt, UpdatedAt: f.UpdatedAt, CreatedBy: f.CreatedBy,
	}
}

func filaDeLead(l ventas.Lead) map[string]any {
	return map[string]any{
		"id": l.ID, "negocio": l.Negocio,
		"contacto_nombre": nuloSiVacio(l.ContactoNombre),
		"telefono":        nuloSiVacio(l.Telefono),
		"telefono_norm":   nuloSiVacio(ventas.NormalizarTelefono(l.Telefono)),
		"direccion": nuloSiVacio(l.Direccion), "barrio": nuloSiVacio(l.Barrio),
		"municipio": nuloSiVacio(l.Municipio), "rubro": nuloSiVacio(l.Rubro),
		"origen": nuloSiVacio(l.Origen), "valor_estimado_cop": l.ValorEstimadoCOP,
		"paquete_id": nuloSiVacio(l.PaqueteID), "notas": nuloSiVacio(l.Notas),
		"accion_que": nuloSiVacio(l.AccionQue), "accion_fecha": nuloSiVacio(l.AccionFecha),
		"estado": l.Estado, "motivo_perdida": nuloSiVacio(l.MotivoPerdida),
		"vendedor_id": nuloSiVacio(l.VendedorID),
		"cliente_id":  nuloSiVacio(l.ClienteID),
		"demo": l.Demo, "created_by": nuloSiVacio(l.CreatedBy),
	}
}

func (s *Supabase) ListLeads() ([]ventas.Lead, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "order": {"updated_at.desc"}}
	var filas []leadFila
	if err := s.c.REST(ctx, http.MethodGet, "leads", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []ventas.Lead{}
	for _, f := range filas {
		out = append(out, f.aLead())
	}
	return out, nil
}

func (s *Supabase) GetLead(id string) (ventas.Lead, bool, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "id": {"eq." + id}}
	var filas []leadFila
	if err := s.c.REST(ctx, http.MethodGet, "leads", q, nil, "", &filas); err != nil {
		return ventas.Lead{}, false, err
	}
	if len(filas) == 0 {
		return ventas.Lead{}, false, nil
	}
	return filas[0].aLead(), true, nil
}

func (s *Supabase) CreateLead(l ventas.Lead) (ventas.Lead, error) {
	ctx, cancel := contexto()
	defer cancel()
	if l.ID == "" {
		l.ID = NewUUID()
	}
	var filas []leadFila
	if err := s.c.REST(ctx, http.MethodPost, "leads", nil, filaDeLead(l), "return=representation", &filas); err != nil {
		return ventas.Lead{}, err
	}
	if len(filas) == 0 {
		return l, nil
	}
	return filas[0].aLead(), nil
}

func (s *Supabase) UpdateLead(id string, cambios map[string]any) (ventas.Lead, error) {
	ctx, cancel := contexto()
	defer cancel()
	body := map[string]any{}
	for k, v := range cambios {
		body[k] = v
	}
	// desarchivar es lógica de memoria demo; en Supabase se traduce a
	// limpiar archivado_at del cliente (no aplica a leads): se ignora.
	delete(body, "desarchivar")
	if tel, ok := cambios["telefono"].(string); ok {
		body["telefono_norm"] = ventas.NormalizarTelefono(tel)
	}
	var filas []leadFila
	if err := s.c.REST(ctx, http.MethodPatch, "leads", url.Values{"id": {"eq." + id}}, body, "return=representation", &filas); err != nil {
		return ventas.Lead{}, err
	}
	if len(filas) == 0 {
		return ventas.Lead{}, ErrNoExiste
	}
	return filas[0].aLead(), nil
}

func (s *Supabase) LeadsAbiertosDe(vendedorID string) ([]ventas.Lead, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "vendedor_id": {"eq." + vendedorID}}
	var filas []leadFila
	if err := s.c.REST(ctx, http.MethodGet, "leads", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []ventas.Lead{}
	for _, f := range filas {
		if ventas.LeadAbierto(f.Estado) {
			out = append(out, f.aLead())
		}
	}
	return out, nil
}

type leadEventoFila struct {
	ID          string  `json:"id"`
	LeadID      string  `json:"lead_id"`
	Cuando      string  `json:"cuando"`
	ActorID     string  `json:"actor_id"`
	ActorNombre string  `json:"actor_nombre"`
	Accion      string  `json:"accion"`
	Antes       any     `json:"antes"`
	Despues     any     `json:"despues"`
	Motivo      *string `json:"motivo"`
}

func (s *Supabase) ListLeadEventos(leadID string) ([]ventas.LeadEvento, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "lead_id": {"eq." + leadID}, "order": {"cuando"}}
	var filas []leadEventoFila
	if err := s.c.REST(ctx, http.MethodGet, "lead_eventos", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []ventas.LeadEvento{}
	for _, f := range filas {
		out = append(out, ventas.LeadEvento{
			ID: f.ID, LeadID: f.LeadID, Cuando: f.Cuando,
			ActorID: f.ActorID, ActorNombre: f.ActorNombre,
			Accion: f.Accion, Antes: f.Antes, Despues: f.Despues,
			Motivo: f.Motivo,
		})
	}
	return out, nil
}

func (s *Supabase) AddLeadEvento(e ventas.LeadEvento) (ventas.LeadEvento, error) {
	ctx, cancel := contexto()
	defer cancel()
	if e.ID == "" {
		e.ID = NewUUID()
	}
	body := map[string]any{
		"id": e.ID, "lead_id": e.LeadID, "actor_id": nuloSiVacio(e.ActorID),
		"actor_nombre": e.ActorNombre, "accion": e.Accion,
		"antes": e.Antes, "despues": e.Despues, "motivo": e.Motivo,
	}
	var filas []leadEventoFila
	if err := s.c.REST(ctx, http.MethodPost, "lead_eventos", nil, body, "return=representation", &filas); err != nil {
		return ventas.LeadEvento{}, err
	}
	if len(filas) > 0 {
		f := filas[0]
		return ventas.LeadEvento{
			ID: f.ID, LeadID: f.LeadID, Cuando: f.Cuando,
			ActorID: f.ActorID, ActorNombre: f.ActorNombre,
			Accion: f.Accion, Antes: f.Antes, Despues: f.Despues,
			Motivo: f.Motivo,
		}, nil
	}
	return e, nil
}

type visitaFila struct {
	ID        string   `json:"id"`
	LeadID    string   `json:"lead_id"`
	Vendedor  string   `json:"vendedor_id"`
	ClientID  string   `json:"client_id"`
	Latitud   *float64 `json:"latitud"`
	Longitud  *float64 `json:"longitud"`
	Notas     string   `json:"notas"`
	Resultado string   `json:"resultado"`
	Fotos     int      `json:"fotos"`
	Cuando    string   `json:"cuando"`
	CreatedAt string   `json:"created_at"`
	CreatedBy string   `json:"created_by"`
}

func (f visitaFila) aVisita() ventas.Visita {
	return ventas.Visita{
		ID: f.ID, LeadID: f.LeadID, Vendedor: f.Vendedor,
		ClientID: f.ClientID, Latitud: f.Latitud, Longitud: f.Longitud,
		Notas: f.Notas, Resultado: f.Resultado, Fotos: f.Fotos,
		Cuando: f.Cuando, CreatedAt: f.CreatedAt, CreatedBy: f.CreatedBy,
	}
}

func (s *Supabase) ListVisitas() ([]ventas.Visita, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "order": {"created_at.desc"}}
	var filas []visitaFila
	if err := s.c.REST(ctx, http.MethodGet, "visitas", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []ventas.Visita{}
	for _, f := range filas {
		out = append(out, f.aVisita())
	}
	return out, nil
}

func (s *Supabase) GetVisita(id string) (ventas.Visita, bool, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "id": {"eq." + id}}
	var filas []visitaFila
	if err := s.c.REST(ctx, http.MethodGet, "visitas", q, nil, "", &filas); err != nil {
		return ventas.Visita{}, false, err
	}
	if len(filas) == 0 {
		return ventas.Visita{}, false, nil
	}
	return filas[0].aVisita(), true, nil
}

func (s *Supabase) CreateVisita(v ventas.Visita) (ventas.Visita, error) {
	ctx, cancel := contexto()
	defer cancel()
	// Idempotencia: primero buscar por client_id (§5.23).
	if v.ClientID != "" {
		if prev, existe, err := s.VisitaPorClientID(v.ClientID); err == nil && existe {
			return prev, nil
		}
	}
	if v.ID == "" {
		v.ID = NewUUID()
	}
	body := map[string]any{
		"id": v.ID, "lead_id": v.LeadID, "vendedor_id": v.Vendedor,
		"client_id": nuloSiVacio(v.ClientID),
		"latitud": v.Latitud, "longitud": v.Longitud,
		"notas": nuloSiVacio(v.Notas), "resultado": v.Resultado,
		"cuando": nuloSiVacio(v.Cuando), "created_by": nuloSiVacio(v.CreatedBy),
	}
	var filas []visitaFila
	if err := s.c.REST(ctx, http.MethodPost, "visitas", nil, body, "return=representation", &filas); err != nil {
		// Carrera offline: otro request creó el mismo client_id (UNIQUE) →
		// devolver el existente en vez de fallar (§5.23).
		if v.ClientID != "" {
			if prev, existe, err2 := s.VisitaPorClientID(v.ClientID); err2 == nil && existe {
				return prev, nil
			}
		}
		return ventas.Visita{}, err
	}
	if len(filas) == 0 {
		return v, nil
	}
	return filas[0].aVisita(), nil
}

func (s *Supabase) VisitaPorClientID(clientID string) (ventas.Visita, bool, error) {
	ctx, cancel := contexto()
	defer cancel()
	if clientID == "" {
		return ventas.Visita{}, false, nil
	}
	q := url.Values{"select": {"*"}, "client_id": {"eq." + clientID}}
	var filas []visitaFila
	if err := s.c.REST(ctx, http.MethodGet, "visitas", q, nil, "", &filas); err != nil {
		return ventas.Visita{}, false, err
	}
	if len(filas) == 0 {
		return ventas.Visita{}, false, nil
	}
	return filas[0].aVisita(), true, nil
}

func (s *Supabase) VisitasDeLead(leadID string) ([]ventas.Visita, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{"select": {"*"}, "lead_id": {"eq." + leadID}, "order": {"created_at"}}
	var filas []visitaFila
	if err := s.c.REST(ctx, http.MethodGet, "visitas", q, nil, "", &filas); err != nil {
		return nil, err
	}
	out := []ventas.Visita{}
	for _, f := range filas {
		out = append(out, f.aVisita())
	}
	return out, nil
}

func (s *Supabase) ContarFotosVisita(visitaID string) (int, error) {
	ctx, cancel := contexto()
	defer cancel()
	q := url.Values{
		"select": {"id"}, "visita_id": {"eq." + visitaID},
	}
	var filas []map[string]any
	if err := s.c.REST(ctx, http.MethodGet, "visita_fotos", q, nil, "", &filas); err != nil {
		return 0, err
	}
	return len(filas), nil
}

// EnlazarArchivo registra la foto en visita_fotos (Storage lo guarda el
// bucket; aquí solo el enlace). Sin bucket configurado no se usa.
func (s *Supabase) EnlazarArchivo(visitaID, archivoID string) {
	ctx, cancel := contexto()
	defer cancel()
	body := map[string]any{"visita_id": visitaID, "ruta": archivoID}
	var filas []map[string]any
	_ = s.c.REST(ctx, http.MethodPost, "visita_fotos", nil, body, "return=representation", &filas)
}

// GuardarArchivo en Supabase: preparada para Storage (BRIEF F4 §2). Sin
// bucket configurado devuelve error (el frontend ya comprimió a ~500 KB;
// el modo demo en memoria sí guarda).
func (s *Supabase) GuardarArchivo(nombre string, datos []byte) (string, error) {
	if !ventas.FotoTamanoValido(len(datos)) {
		return "", ErrFotoGrande
	}
	return "", errors.New("sin bucket de Storage configurado")
}

func (s *Supabase) ObtenerArchivo(id string) ([]byte, bool, error) {
	return nil, false, errors.New("sin bucket de Storage configurado")
}
