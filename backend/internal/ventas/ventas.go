// Package ventas concentra el dominio F4 (CRM: leads, visitas en la calle,
// lead → cliente): tipos, máquinas de estados (ANALISIS §4.4), duplicados por
// teléfono normalizado + nombre parecido (§5.24), reactivación de clientes
// archivados (§5.25), próxima acción vencida y métricas simples.
// Solo stdlib. La seguridad (quién puede qué) vive en permisos.Puede; aquí
// solo "qué estados existen", "qué transiciones existen" y normalizaciones.
// Los handlers (httpapi) llaman a este paquete + Puede + Store.
package ventas

import (
	"strings"
	"unicode"
)

// --- Leads (ANALISIS §4.4, BRIEF F4 §1) ---

// Estados de lead: Prospecto → En contacto → Propuesta enviada →
// Negociación → Ganado | Perdido (perdido con motivo).
const (
	LeadProspecto   = "prospecto"
	LeadEnContacto  = "en_contacto"
	LeadPropuesta   = "propuesta_enviada"
	LeadNegociacion = "negociacion"
	LeadGanado      = "ganado"
	LeadPerdido     = "perdido"
)

// EsEstadoLead dice si el estado pertenece al vocabulario.
func EsEstadoLead(e string) bool {
	switch e {
	case LeadProspecto, LeadEnContacto, LeadPropuesta,
		LeadNegociacion, LeadGanado, LeadPerdido:
		return true
	}
	return false
}

// transicionesLead: avance lineal + perdido con motivo desde cualquier
// estado abierto. Ganado/perdido son finales. Repetir el mismo estado es
// válido (idempotencia §5.32: 200 sin duplicar).
var transicionesLead = map[string][]string{
	LeadProspecto:   {LeadEnContacto, LeadPerdido},
	LeadEnContacto:  {LeadPropuesta, LeadPerdido},
	LeadPropuesta:   {LeadNegociacion, LeadPerdido},
	LeadNegociacion: {LeadGanado, LeadPerdido},
}

// TransicionLeadValida dice si se puede pasar de un estado a otro.
// Igual-estado = válido (idempotencia §5.32).
func TransicionLeadValida(de, a string) bool {
	if de == a {
		return true
	}
	for _, d := range transicionesLead[de] {
		if d == a {
			return true
		}
	}
	return false
}

// LeadAbierto dice si el lead sigue en juego (no ganado ni perdido).
// Al desactivar a un vendedor (§5.26) solo los abiertos pasan a sin asignar.
func LeadAbierto(e string) bool {
	return e != LeadGanado && e != LeadPerdido
}

// Origenes válidos de lead (BRIEF F4 §1): visita, referido, redes, llamada.
func OrigenValido(o string) bool {
	switch o {
	case "", "visita", "referido", "redes", "llamada":
		return true
	}
	return false
}

// Lead es un negocio en seguimiento. VendedorID "" = sin asignar (BRIEF F4
// §1: al desactivar al vendedor sus leads abiertos quedan sin asignar para
// que el admin los reasigne). ClienteID = enlace al cliente creado al ganar.
type Lead struct {
	ID               string `json:"id"`
	Negocio          string `json:"negocio"`
	ContactoNombre   string `json:"contacto_nombre,omitempty"`
	Telefono         string `json:"telefono,omitempty"`
	TelefonoNorm     string `json:"telefono_norm,omitempty"`
	Direccion        string `json:"direccion,omitempty"`
	Barrio           string `json:"barrio,omitempty"`
	Municipio        string `json:"municipio,omitempty"`
	Rubro            string `json:"rubro,omitempty"`
	Origen           string `json:"origen,omitempty"`
	ValorEstimadoCOP int64  `json:"valor_estimado_cop,omitempty"`
	PaqueteID        string `json:"paquete_id,omitempty"`
	Notas            string `json:"notas,omitempty"`
	AccionQue        string `json:"accion_que,omitempty"`
	// AccionFecha en YYYY-MM-DD (igual que fecha_limite F1). "" = sin fecha.
	AccionFecha   string `json:"accion_fecha,omitempty"`
	Estado        string `json:"estado"`
	MotivoPerdida string `json:"motivo_perdida,omitempty"`
	VendedorID    string `json:"vendedor_id,omitempty"`
	ClienteID     string `json:"cliente_id,omitempty"`
	Demo          bool   `json:"demo,omitempty"`
	CreatedAt     string `json:"created_at,omitempty"`
	UpdatedAt     string `json:"updated_at,omitempty"`
	CreatedBy     string `json:"created_by,omitempty"`
}

// LeadEvento es una entrada inmutable del historial del lead (ANALISIS §6):
// quién, qué, cuándo, antes → después, motivo. No se edita ni se borra.
type LeadEvento struct {
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

// EsVencida: próxima acción con fecha pasada y lead aún abierto (igual que
// tareas F1 §5.10: compara lexicográfico con YYYY-MM-DD). Ganado/perdido
// nunca vencen.
func EsVencida(accionFecha, estado, hoy string) bool {
	if accionFecha == "" || !LeadAbierto(estado) {
		return false
	}
	return accionFecha < hoy
}

// FechaValida acepta "" (sin fecha) o YYYY-MM-DD (igual que F1).
func FechaValida(f string) bool {
	if f == "" {
		return true
	}
	if len(f) != 10 || f[4] != '-' || f[7] != '-' {
		return false
	}
	for i, ch := range f {
		if i == 4 || i == 7 {
			continue
		}
		if ch < '0' || ch > '9' {
			return false
		}
	}
	return true
}

// NormalizarTelefono deja solo dígitos (BRIEF F4 §1, §5.24): los duplicados
// se buscan por teléfono normalizado. "+57 300 123-4567" → "3001234567":
// el indicativo país 57 se quita (números colombianos: 10 dígitos; con 57
// son 12), para que "300 111 2233" y "+57 300-111-2233" matcheen.
func NormalizarTelefono(t string) string {
	var b strings.Builder
	for _, r := range t {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	d := b.String()
	if len(d) == 12 && strings.HasPrefix(d, "57") {
		return d[2:]
	}
	return d
}

// sinTildes baja a minúsculas y quita tildes/ñ para comparar nombres
// parecidos (§5.24: "normaliza tildes/mayúsculas").
func sinTildes(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	reemplazos := map[rune]rune{
		'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u',
		'ñ': 'n', 'à': 'a', 'è': 'e', 'ì': 'i', 'ò': 'o', 'ù': 'u',
		'â': 'a', 'ê': 'e', 'î': 'i', 'ô': 'o', 'û': 'u',
	}
	var b strings.Builder
	for _, r := range s {
		if n, ok := reemplazos[r]; ok {
			b.WriteRune(n)
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// palabras parte un nombre normalizado en palabras significativas (sin
// artículos/preposiciones comunes) para el match parecido.
func palabras(s string) []string {
	corta := map[string]bool{
		"el": true, "la": true, "los": true, "las": true, "de": true,
		"del": true, "y": true, "en": true, "un": true, "una": true,
	}
	out := []string{}
	for _, w := range strings.Fields(sinTildes(s)) {
		if w == "" || corta[w] {
			continue
		}
		out = append(out, w)
	}
	return out
}

// NombreParecido dice si dos nombres de negocio se parecen (§5.24): alguna
// palabra significativa en común de 4+ letras ("Tizón Dorado" ~
// "el tizon"). No es perfecto a propósito: es un aviso, no un bloqueo.
func NombreParecido(a, b string) bool {
	pa, pb := palabras(a), palabras(b)
	set := map[string]bool{}
	for _, w := range pa {
		if len(w) >= 4 {
			set[w] = true
		}
	}
	for _, w := range pb {
		if len(w) >= 4 && set[w] {
			return true
		}
	}
	return false
}

// EsDuplicado dice si un lead candidato duplica a uno existente (§5.24):
// mismo teléfono normalizado (no vacío) O nombre parecido.
func EsDuplicado(candidato, existente Lead) bool {
	ct := NormalizarTelefono(candidato.Telefono)
	et := NormalizarTelefono(existente.Telefono)
	if ct != "" && ct == et {
		return true
	}
	if strings.TrimSpace(candidato.Negocio) == "" || strings.TrimSpace(existente.Negocio) == "" {
		return false
	}
	return NombreParecido(candidato.Negocio, existente.Negocio)
}

// --- Visitas (BRIEF F4 §2) ---

// Resultados de visita: interesado / no interesado / volver.
const (
	VisitaInteresado   = "interesado"
	VisitaNoInteresado = "no_interesado"
	VisitaVolver       = "volver"
)

// ResultadoVisitaValido dice si el resultado pertenece al vocabulario.
func ResultadoVisitaValido(r string) bool {
	switch r {
	case VisitaInteresado, VisitaNoInteresado, VisitaVolver:
		return true
	}
	return false
}

// Visita es un registro de calle. LeadID "" = la visita creó el lead ahí
// mismo (el handler crea ambos). ClientID = idempotencia offline (§5.23):
// UUID generado en el celular; el backend ignora duplicados.
type Visita struct {
	ID        string  `json:"id"`
	LeadID    string  `json:"lead_id"`
	Vendedor  string  `json:"vendedor_id"`
	ClientID  string  `json:"client_id,omitempty"`
	Latitud   *float64 `json:"latitud,omitempty"`
	Longitud  *float64 `json:"longitud,omitempty"`
	Notas     string  `json:"notas,omitempty"`
	Resultado string  `json:"resultado"`
	Fotos     int     `json:"fotos,omitempty"`
	Cuando    string  `json:"cuando,omitempty"`
	CreatedAt string  `json:"created_at,omitempty"`
	CreatedBy string  `json:"created_by,omitempty"`
}

// esLetraDigitoGuion dice si el rune sirve en un client_id (UUID u otro id
// de cliente; se acepta generoso pero sin espacios ni inyecciones).
func esLetraDigitoGuion(r rune) bool {
	return r == '-' || r == '_' ||
		(r >= '0' && r <= '9') ||
		(r >= 'a' && r <= 'z') ||
		(r >= 'A' && r <= 'Z')
}

// ClientIDValido acepta "" (visita online sin id) o un id de 1–64 letras,
// dígitos, guiones y guion bajo (el UUID del celular pasa; §5.23).
func ClientIDValido(id string) bool {
	if id == "" {
		return true
	}
	if len(id) > 64 {
		return false
	}
	for _, r := range id {
		if !esLetraDigitoGuion(r) && !unicode.IsLetter(r) {
			return false
		}
	}
	return true
}

// --- Archivos (BRIEF F4 §2) ---

// MaxFotoBytes = ~500 KB por foto tras comprimir en el cliente con canvas.
// El backend rechaza lo que supere el tope (el cliente ya comprimió).
const MaxFotoBytes = 500 * 1024

// FotoTamanoValido dice si el tamaño en bytes cabe en el tope demo.
func FotoTamanoValido(n int) bool { return n >= 0 && n <= MaxFotoBytes }
