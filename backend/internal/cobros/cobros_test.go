// Tests del dominio F2: tabla de estados de línea, cálculo de montos,
// periodos y comisión 8 % con redondeo COP.
package cobros

import (
	"testing"
	"time"
)

func TestTransicionLinea(t *testing.T) {
	casos := []struct {
		de, a string
		ok    bool
	}{
		{"por_confirmar", "confirmada", true},
		{"por_confirmar", "reclamada", true},
		{"por_confirmar", "aprobada", false},
		{"confirmada", "aprobada", true},
		{"confirmada", "por_confirmar", true},
		{"reclamada", "aprobada", true},
		{"reclamada", "en_corte", false},
		{"sin_tarifa", "por_confirmar", true},
		{"sin_tarifa", "aprobada", false},
		{"aprobada", "en_corte", true},
		{"en_corte", "pagada", true},
		{"pagada", "en_corte", true}, // revertir: solo dueño (§5.21)
		{"pagada", "por_confirmar", false},
		{"aprobada", "aprobada", true}, // idempotencia
	}
	for _, c := range casos {
		if got := TransicionLineaValida(c.de, c.a); got != c.ok {
			t.Errorf("TransicionLineaValida(%q,%q) = %v, quería %v", c.de, c.a, got, c.ok)
		}
	}
}

func TestEsEstadoLinea(t *testing.T) {
	for _, e := range []string{"por_confirmar", "confirmada", "aprobada", "en_corte", "pagada", "reclamada", "sin_tarifa"} {
		if !EsEstadoLinea(e) {
			t.Errorf("EsEstadoLinea(%q) = false", e)
		}
	}
	if EsEstadoLinea("pagado") {
		t.Error("EsEstadoLinea(pagado) debería ser false")
	}
}

func TestCalcularMontoTarifa(t *testing.T) {
	fija := Tarifa{Unidad: UnidadPorTarea, MontoCOP: 80000}
	if m, ok := CalcularMontoTarifa(fija, nil, nil, nil); !ok || m != 80000 {
		t.Errorf("por_tarea = %d,%v", m, ok)
	}
	porMin := Tarifa{Unidad: UnidadPorMinuto, MontoCOP: 2000}
	min := 15
	if m, ok := CalcularMontoTarifa(porMin, nil, &min, nil); !ok || m != 30000 {
		t.Errorf("por_minuto 15 = %d,%v", m, ok)
	}
	if _, ok := CalcularMontoTarifa(porMin, nil, nil, nil); ok {
		t.Error("por_minuto sin minutos debería fallar")
	}
	porDur := Tarifa{Unidad: UnidadPorDuracion, MontoCOP: 80000}
	hasta := 180
	tramos := []TarifaTramo{{DesdeSeg: 10, HastaSeg: &hasta, MontoCOP: 45000}}
	seg := 60
	if m, ok := CalcularMontoTarifa(porDur, tramos, nil, &seg); !ok || m != 45000 {
		t.Errorf("por_duracion 60s = %d,%v", m, ok)
	}
	if _, ok := CalcularMontoTarifa(porDur, tramos, nil, nil); ok {
		t.Error("por_duracion sin duración debería fallar")
	}
	segFuera := 99999
	if m, ok := CalcularMontoTarifa(porDur, tramos, nil, &segFuera); !ok || m != 80000 {
		t.Errorf("por_duracion fuera de tramos usa base = %d,%v", m, ok)
	}
	if _, ok := CalcularMontoTarifa(Tarifa{Unidad: "otra"}, nil, nil, nil); ok {
		t.Error("unidad inválida debería fallar")
	}
}

func TestComisionPara(t *testing.T) {
	// 8 % exactos de los paquetes del brief.
	if c := ComisionPara(300000, 8); c != 24000 {
		t.Errorf("comisión 300000 = %d, quería 24000", c)
	}
	if c := ComisionPara(1299000, 8); c != 103920 {
		t.Errorf("comisión 1299000 = %d, quería 103920", c)
	}
	// Redondeo al peso: 499000 × 8 % = 39920 exacto; 7.5 % de 100 = 8.
	if c := ComisionPara(100, 7.5); c != 8 {
		t.Errorf("redondeo 7.5%% de 100 = %d, quería 8", c)
	}
}

func TestPeriodos(t *testing.T) {
	if p := PeriodoDe(time.Date(2026, 9, 27, 0, 0, 0, 0, time.UTC)); p != "2026-09" {
		t.Errorf("PeriodoDe = %q, quería 2026-09", p)
	}
	// F29: 30-sep 19:30 Bogotá (= 1-oct 00:30 UTC) sigue siendo septiembre.
	if p := PeriodoDe(time.Date(2026, 10, 1, 0, 30, 0, 0, time.UTC)); p != "2026-09" {
		t.Errorf("PeriodoDe borde Bogotá = %q, quería 2026-09", p)
	}
	if s := PeriodoSiguiente("2026-12"); s != "2027-01" {
		t.Errorf("PeriodoSiguiente(2026-12) = %q", s)
	}
	for _, p := range []string{"", "2026-09", "2027-01"} {
		if !ValidarPeriodo(p) {
			t.Errorf("ValidarPeriodo(%q) = false", p)
		}
	}
	for _, p := range []string{"2026-13", "2026-9", "09-2026", "2026/09"} {
		if ValidarPeriodo(p) {
			t.Errorf("ValidarPeriodo(%q) = true", p)
		}
	}
}
