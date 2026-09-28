// Package cobros concentra el dominio F2 (tarifas, líneas de cobro, cortes,
// comisión de ventas): tipos, máquinas de estados (ANALISIS §4.3), cálculo de
// montos (§5.17), periodo mensual (§7.4) y comisión 8 % (§7.5). Solo stdlib.
// La seguridad (quién puede qué) vive en permisos.Puede; aquí solo "qué
// transiciones existen" y "cuánto vale cada cosa". Los handlers (httpapi)
// llaman a este paquete + Puede + Store.
package cobros

import (
	"math"
	"time"
)

// --- Unidades de tarifa (BRIEF F2 §1) ---

const (
	UnidadPorTarea    = "por_tarea"
	UnidadPorMinuto   = "por_minuto"
	UnidadPorDuracion = "por_duracion"
)

// ValidarUnidad dice si la unidad pertenece al vocabulario.
func ValidarUnidad(u string) bool {
	return u == UnidadPorTarea || u == UnidadPorMinuto || u == UnidadPorDuracion
}

// --- Tarifas (ANALISIS §5.17) ---

// Tarifa = (etapa/oficio de tarea, unidad, monto COP, vigencia).
// Edición con historial: cambiar una tarifa crea una NUEVA fila (nueva
// versión) y desactiva la anterior; nunca se edita la vigente.
// VigenteHasta "" = vigente indefinidamente. Demo = ejemplo demo (§7.3).
type Tarifa struct {
	ID            string `json:"id"`
	Etapa         string `json:"etapa"`
	Unidad        string `json:"unidad"`
	MontoCOP      int64  `json:"monto_cop"`
	VigenteDesde  string `json:"vigente_desde,omitempty"`
	VigenteHasta  string `json:"vigente_hasta,omitempty"`
	Version       int    `json:"version"`
	Activa        bool   `json:"activa"`
	Demo          bool   `json:"demo,omitempty"`
	CreatedAt     string `json:"created_at,omitempty"`
	UpdatedAt     string `json:"updated_at,omitempty"`
	CreatedBy     string `json:"created_by,omitempty"`
}

// TarifaTramo es un tramo por duración de una tarifa por_duracion
// (BRIEF F2 §1: ej. los 6 del sitio). HastaSeg nil = abierto ("+61").
type TarifaTramo struct {
	ID       string `json:"id"`
	TarifaID string `json:"tarifa_id"`
	DesdeSeg int    `json:"desde_seg"`
	HastaSeg *int   `json:"hasta_seg,omitempty"`
	MontoCOP int64  `json:"monto_cop"`
}

// CalcularMontoTarifa devuelve el monto congelado para una tarea aprobada
// (§5.17): por_tarea = monto fijo; por_minuto = monto × minutos (minutos nil
// → ok=false, falta el dato); por_duracion = tramo que contenga duracionSeg
// (si hay tramos y ninguno calza, se usa el monto base; sin dato de duración
// y con tramos → ok=false). Sin tramos en por_duracion se usa el monto base.
func CalcularMontoTarifa(t Tarifa, tramos []TarifaTramo, minutos *int, duracionSeg *int) (int64, bool) {
	switch t.Unidad {
	case UnidadPorTarea:
		return t.MontoCOP, true
	case UnidadPorMinuto:
		if minutos == nil || *minutos < 0 {
			return 0, false
		}
		return t.MontoCOP * int64(*minutos), true
	case UnidadPorDuracion:
		if len(tramos) == 0 {
			return t.MontoCOP, true
		}
		if duracionSeg == nil || *duracionSeg < 0 {
			return 0, false
		}
		seg := *duracionSeg
		for _, tr := range tramos {
			if seg < tr.DesdeSeg {
				continue
			}
			if tr.HastaSeg != nil && seg > *tr.HastaSeg {
				continue
			}
			return tr.MontoCOP, true
		}
		return t.MontoCOP, true
	}
	return 0, false
}

// --- Paquetes (BRIEF F2 §4) ---

// Paquete es una entrada del catálogo con precio. Lo edita el dueño.
// Cambio de precio o de paquete del cliente no altera comisiones ya
// generadas (§5.27: la comisión congela el monto al generarse).
type Paquete struct {
	ID        string `json:"id"`
	Nombre    string `json:"nombre"`
	PrecioCOP int64  `json:"precio_cop"`
	Activo    bool   `json:"activo"`
	Demo      bool   `json:"demo,omitempty"`
	CreatedAt string `json:"created_at,omitempty"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

// --- Líneas de cobro (ANALISIS §4.3) ---

const (
	TipoTarea    = "tarea"
	TipoAjuste   = "ajuste"
	TipoComision = "comision"
)

// Estados de línea (§4.3 + sin_tarifa de BRIEF F2 §1).
const (
	LineaPorConfirmar = "por_confirmar"
	LineaConfirmada   = "confirmada"
	LineaAprobada     = "aprobada"
	LineaEnCorte      = "en_corte"
	LineaPagada       = "pagada"
	LineaReclamada    = "reclamada"
	LineaSinTarifa    = "sin_tarifa"
)

// LineaCobro es un cobro inmutable generado por el sistema (§2): al aprobar
// la tarea se congela monto/tarifa_id/unidad/cantidad. Los ajustes son líneas
// nuevas con motivo, nunca edición (§5.18). Periodo = YYYY-MM al que
// pertenece (arrastrable al cerrar, §5.20).
type LineaCobro struct {
	ID                string   `json:"id"`
	TareaID           string   `json:"tarea_id,omitempty"`
	UsuarioID         string   `json:"usuario_id"`
	Tipo              string   `json:"tipo"`
	Estado            string   `json:"estado"`
	MontoCOP          int64    `json:"monto_cop"`
	TarifaID          string   `json:"tarifa_id,omitempty"`
	Unidad            string   `json:"unidad,omitempty"`
	Cantidad          *float64 `json:"cantidad,omitempty"`
	Motivo            string   `json:"motivo,omitempty"`
	ReclamoMotivo     string   `json:"reclamo_motivo,omitempty"`
	Periodo           string   `json:"periodo"`
	CorteID           string   `json:"corte_id,omitempty"`
	ComisionClienteID string   `json:"comision_cliente_id,omitempty"`
	CreatedAt         string   `json:"created_at,omitempty"`
	UpdatedAt         string   `json:"updated_at,omitempty"`
	CreatedBy         string   `json:"created_by,omitempty"`
}

// EsEstadoLinea dice si el estado pertenece al vocabulario.
func EsEstadoLinea(e string) bool {
	switch e {
	case LineaPorConfirmar, LineaConfirmada, LineaAprobada, LineaEnCorte,
		LineaPagada, LineaReclamada, LineaSinTarifa:
		return true
	}
	return false
}

// transicionesLinea: por_confirmar → confirmada → aprobada → en_corte →
// pagada; reclamada desde por_confirmar/confirmada (trabajador con motivo),
// y vuelve a por_confirmar (devolver) o avanza a aprobada (admin resuelve);
// sin_tarifa → por_confirmar cuando el dueño fija la tarifa (§4.3 + BRIEF §1).
var transicionesLinea = map[string][]string{
	LineaPorConfirmar: {LineaConfirmada, LineaReclamada},
	LineaConfirmada:   {LineaAprobada, LineaReclamada, LineaPorConfirmar},
	LineaReclamada:    {LineaPorConfirmar, LineaAprobada},
	LineaSinTarifa:    {LineaPorConfirmar},
	LineaAprobada:     {LineaEnCorte},
	LineaEnCorte:      {LineaPagada},
	LineaPagada:       {LineaEnCorte}, // revertir pagado: solo dueño (§5.21)
}

// TransicionLineaValida dice si se puede pasar de un estado a otro.
// Igual-estado = válido (idempotencia §5.32).
func TransicionLineaValida(de, a string) bool {
	if de == a {
		return true
	}
	for _, d := range transicionesLinea[de] {
		if d == a {
			return true
		}
	}
	return false
}

// --- Cortes (ANALISIS §5.20, §5.21; §7.4) ---

const (
	CorteAbierto       = "abierto"
	CorteCerrado       = "cerrado"
	CortePagadoParcial = "pagado_parcial"
	CortePagado        = "pagado"
)

// Corte es el corte mensual de un periodo YYYY-MM. Cerrado no se reabre
// (§5.20); si hubo error se corrige con un ajuste en el corte actual.
type Corte struct {
	ID        string `json:"id"`
	Periodo   string `json:"periodo"`
	Estado    string `json:"estado"`
	CerradoAt string `json:"cerrado_at,omitempty"`
	CreatedBy string `json:"created_by,omitempty"`
	CreatedAt string `json:"created_at,omitempty"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

// --- Config de cobros (BRIEF F2 §4; §7.5) ---

const (
	ModoUnaVez  = "una_vez"
	ModoMensual = "mensual"
)

// ConfigCobros es la fila única: % de comisión (default 8) y modo
// (una_vez default, o mensual: una línea por mes por cliente activo).
type ConfigCobros struct {
	PorcentajeComision float64 `json:"porcentaje_comision"`
	ModoComision       string  `json:"modo_comision"`
}

// ValidarModo dice si el modo de comisión es válido.
func ValidarModo(m string) bool { return m == ModoUnaVez || m == ModoMensual }

// ComisionPara calcula paquete.precio × % con redondeo al peso entero
// (BRIEF F2 §7: comisión 8 % exacta y redondeo COP).
func ComisionPara(precioCOP int64, porcentaje float64) int64 {
	return int64(math.Round(float64(precioCOP) * porcentaje / 100))
}

// --- Periodos (BRIEF F2 §3; §7.4) ---

// zonaBogota es America/Bogota sin depender de la base tzdata del host
// (UTC-5 fijo, sin horario de verano). Los periodos y el "hoy" se calculan
// acá (ver F29: con UTC un trabajo de las 19:30 en Bogotá caía al mes
// siguiente y el trabajador veía $0).
func zonaBogota() *time.Location { return time.FixedZone("America/Bogota", -5*3600) }

// PeriodoDe devuelve el periodo YYYY-MM de un instante (mes calendario).
func PeriodoDe(t time.Time) string { return t.In(zonaBogota()).Format("2006-01") }

// PeriodoActual devuelve el periodo del mes en curso.
func PeriodoActual() string { return PeriodoDe(time.Now()) }

// PeriodoSiguiente devuelve el YYYY-MM siguiente (para el arrastre §5.20).
func PeriodoSiguiente(periodo string) string {
	t, err := time.Parse("2006-01", periodo)
	if err != nil {
		return periodo
	}
	return t.AddDate(0, 1, 0).Format("2006-01")
}

// ValidarPeriodo acepta "" (sin filtro) o YYYY-MM.
func ValidarPeriodo(p string) bool {
	if p == "" {
		return true
	}
	if len(p) != 7 || p[4] != '-' {
		return false
	}
	m := p[5:]
	if m < "01" || m > "12" {
		return false
	}
	for i, ch := range p {
		if i == 4 {
			continue
		}
		if ch < '0' || ch > '9' {
			return false
		}
	}
	return true
}
