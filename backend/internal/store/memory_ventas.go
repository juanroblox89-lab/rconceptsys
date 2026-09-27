// Memoria — F4 ventas: semillas demo + CRUD de leads/visitas en memoria.
// Valentina (vendedora demo con oficio ventas, BRIEF F4 §6.3) + 2 leads de
// ejemplo + fotos en memoria con tope MaxFotoBytes.
package store

import (
	"strings"

	"rconceptsys/backend/internal/ventas"
)

// UUID estables de las semillas demo F4.
const (
	SemillaValentinaID = "55555555-5555-4555-8555-555555555555"
	SemillaLeadTizon   = "c7000000-0000-4000-8000-000000000001"
	SemillaLeadKantel  = "c7000000-0000-4000-8000-000000000002"
)

// semillasF4 carga a Valentina + 2 leads demo. Sin mutex: solo la llama
// NuevaMemoria antes de publicar el store.
func (m *Memoria) semillasF4(fija string) {
	m.leads[SemillaLeadTizon] = ventas.Lead{
		ID: SemillaLeadTizon, Negocio: "El Tizón Dorado",
		ContactoNombre: "Don Tizón", Telefono: "300 111 2233",
		TelefonoNorm:   ventas.NormalizarTelefono("300 111 2233"),
		Direccion: "Calle 10 #5-20", Barrio: "Centro", Municipio: "Rionegro",
		Rubro: "Restaurante", Origen: "visita",
		AccionQue: "Llevar propuesta Digital Inicial", AccionFecha: "2026-10-05",
		Estado: ventas.LeadEnContacto, VendedorID: SemillaValentinaID,
		Demo: true, CreatedAt: fija, UpdatedAt: fija, CreatedBy: SemillaDuenoID,
	}
	m.leads[SemillaLeadKantel] = ventas.Lead{
		ID: SemillaLeadKantel, Negocio: "Kantel",
		ContactoNombre: "Kantel", Telefono: "311 555 6677",
		TelefonoNorm:   ventas.NormalizarTelefono("311 555 6677"),
		Municipio: "Medellín", Rubro: "Tecnología", Origen: "redes",
		AccionQue: "Primera llamada", AccionFecha: "2026-10-03",
		Estado: ventas.LeadProspecto, VendedorID: SemillaValentinaID,
		Demo: true, CreatedAt: fija, UpdatedAt: fija, CreatedBy: SemillaValentinaID,
	}
	m.ordenLead = append(m.ordenLead, SemillaLeadTizon, SemillaLeadKantel)
}

func clonarLead(l ventas.Lead) ventas.Lead { return l }

func clonarVisita(v ventas.Visita) ventas.Visita {
	out := v
	if v.Latitud != nil {
		x := *v.Latitud
		out.Latitud = &x
	}
	if v.Longitud != nil {
		x := *v.Longitud
		out.Longitud = &x
	}
	return out
}

func (m *Memoria) ListLeads() ([]ventas.Lead, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []ventas.Lead{}
	for _, id := range m.ordenLead {
		out = append(out, clonarLead(m.leads[id]))
	}
	return out, nil
}

func (m *Memoria) GetLead(id string) (ventas.Lead, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	l, ok := m.leads[id]
	if !ok {
		return ventas.Lead{}, false, nil
	}
	return clonarLead(l), true, nil
}

func (m *Memoria) CreateLead(l ventas.Lead) (ventas.Lead, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if l.ID == "" {
		l.ID = NewUUID()
	}
	if l.Estado == "" {
		l.Estado = ventas.LeadProspecto
	}
	if l.TelefonoNorm == "" && l.Telefono != "" {
		l.TelefonoNorm = ventas.NormalizarTelefono(l.Telefono)
	}
	if l.CreatedAt == "" {
		l.CreatedAt = Ahora()
	}
	l.UpdatedAt = Ahora()
	if _, existe := m.leads[l.ID]; !existe {
		m.ordenLead = append(m.ordenLead, l.ID)
	}
	m.leads[l.ID] = l
	return clonarLead(l), nil
}

func aplicaLead(l ventas.Lead, cambios map[string]any) ventas.Lead {
	str := func(k string) (string, bool) {
		v, ok := cambios[k].(string)
		return v, ok
	}
	if v, ok := str("negocio"); ok {
		l.Negocio = v
	}
	if v, ok := str("contacto_nombre"); ok {
		l.ContactoNombre = v
	}
	if v, ok := str("telefono"); ok {
		l.Telefono = v
		l.TelefonoNorm = ventas.NormalizarTelefono(v)
	}
	if v, ok := str("direccion"); ok {
		l.Direccion = v
	}
	if v, ok := str("barrio"); ok {
		l.Barrio = v
	}
	if v, ok := str("municipio"); ok {
		l.Municipio = v
	}
	if v, ok := str("rubro"); ok {
		l.Rubro = v
	}
	if v, ok := str("origen"); ok {
		l.Origen = v
	}
	if v, ok := cambios["valor_estimado_cop"]; ok {
		switch n := v.(type) {
		case int64:
			l.ValorEstimadoCOP = n
		case float64:
			l.ValorEstimadoCOP = int64(n)
		case int:
			l.ValorEstimadoCOP = int64(n)
		}
	}
	if v, ok := str("paquete_id"); ok {
		l.PaqueteID = v
	}
	if v, ok := str("notas"); ok {
		l.Notas = v
	}
	if v, ok := str("accion_que"); ok {
		l.AccionQue = v
	}
	if v, ok := str("accion_fecha"); ok {
		l.AccionFecha = v
	}
	if v, ok := str("estado"); ok {
		l.Estado = v
	}
	if v, ok := str("motivo_perdida"); ok {
		l.MotivoPerdida = v
	}
	if v, ok := str("vendedor_id"); ok {
		l.VendedorID = v
	}
	if v, ok := str("cliente_id"); ok {
		l.ClienteID = v
	}
	return l
}

func (m *Memoria) UpdateLead(id string, cambios map[string]any) (ventas.Lead, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	l, ok := m.leads[id]
	if !ok {
		return ventas.Lead{}, ErrNoExiste
	}
	l = aplicaLead(l, cambios)
	l.UpdatedAt = Ahora()
	m.leads[id] = l
	return clonarLead(l), nil
}

func (m *Memoria) LeadsAbiertosDe(vendedorID string) ([]ventas.Lead, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []ventas.Lead{}
	for _, id := range m.ordenLead {
		l := m.leads[id]
		if l.VendedorID == vendedorID && ventas.LeadAbierto(l.Estado) {
			out = append(out, clonarLead(l))
		}
	}
	return out, nil
}

func (m *Memoria) ListLeadEventos(leadID string) ([]ventas.LeadEvento, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []ventas.LeadEvento{}
	for _, e := range m.leadEventos {
		if e.LeadID == leadID {
			out = append(out, e)
		}
	}
	return out, nil
}

func (m *Memoria) AddLeadEvento(e ventas.LeadEvento) (ventas.LeadEvento, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if e.ID == "" {
		e.ID = NewUUID()
	}
	if e.Cuando == "" {
		e.Cuando = Ahora()
	}
	m.leadEventos = append(m.leadEventos, e)
	return e, nil
}

func (m *Memoria) ListVisitas() ([]ventas.Visita, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []ventas.Visita{}
	for _, id := range m.ordenVisita {
		out = append(out, clonarVisita(m.visitas[id]))
	}
	return out, nil
}

func (m *Memoria) GetVisita(id string) (ventas.Visita, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	v, ok := m.visitas[id]
	if !ok {
		return ventas.Visita{}, false, nil
	}
	return clonarVisita(v), true, nil
}

// CreateVisita ignora duplicados por ClientID (§5.23): si ya existe una
// visita con ese client_id, devuelve la existente sin crear otra.
func (m *Memoria) CreateVisita(v ventas.Visita) (ventas.Visita, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if strings.TrimSpace(v.ClientID) != "" {
		for _, id := range m.ordenVisita {
			if m.visitas[id].ClientID == v.ClientID {
				return clonarVisita(m.visitas[id]), nil
			}
		}
	}
	if v.ID == "" {
		v.ID = NewUUID()
	}
	if v.CreatedAt == "" {
		v.CreatedAt = Ahora()
	}
	if _, existe := m.visitas[v.ID]; !existe {
		m.ordenVisita = append(m.ordenVisita, v.ID)
	}
	m.visitas[v.ID] = v
	return clonarVisita(v), nil
}

func (m *Memoria) VisitaPorClientID(clientID string) (ventas.Visita, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if strings.TrimSpace(clientID) == "" {
		return ventas.Visita{}, false, nil
	}
	for _, id := range m.ordenVisita {
		if m.visitas[id].ClientID == clientID {
			return clonarVisita(m.visitas[id]), true, nil
		}
	}
	return ventas.Visita{}, false, nil
}

func (m *Memoria) VisitasDeLead(leadID string) ([]ventas.Visita, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []ventas.Visita{}
	for _, id := range m.ordenVisita {
		if m.visitas[id].LeadID == leadID {
			out = append(out, clonarVisita(m.visitas[id]))
		}
	}
	return out, nil
}

func (m *Memoria) ContarFotosVisita(visitaID string) (int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	n := 0
	for _, f := range m.archivos {
		if f.visitaID == visitaID {
			n++
		}
	}
	return n, nil
}

// --- archivos (BRIEF F4 §2) ---

type archivoGuardado struct {
	id       string
	nombre   string
	datos    []byte
	visitaID string
}

func (m *Memoria) GuardarArchivo(nombre string, datos []byte) (string, error) {
	if !ventas.FotoTamanoValido(len(datos)) {
		return "", ErrFotoGrande
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	id := NewUUID()
	cp := append([]byte{}, datos...)
	m.archivos[id] = archivoGuardado{id: id, nombre: nombre, datos: cp}
	return id, nil
}

func (m *Memoria) ObtenerArchivo(id string) ([]byte, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	f, ok := m.archivos[id]
	if !ok {
		return nil, false, nil
	}
	return append([]byte{}, f.datos...), true, nil
}

// EnlazarArchivo asocia un archivo guardado a una visita (contador de
// fotos en la vista). Solo memoria demo.
func (m *Memoria) EnlazarArchivo(visitaID, archivoID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if f, ok := m.archivos[archivoID]; ok {
		f.visitaID = visitaID
		m.archivos[archivoID] = f
	}
	if v, ok := m.visitas[visitaID]; ok {
		v.Fotos++
		m.visitas[visitaID] = v
	}
}
