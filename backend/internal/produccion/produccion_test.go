// Tests del dominio F1: tabla de transiciones válidas/inválidas de pieza y
// tarea (ANALISIS §4.1/§4.2), oficio por etapa (§5.8), dato de entrega
// exigido (§5.9), vencidas (§5.10) y visibilidad por cliente (§3.1.3).
package produccion

import "testing"

func TestTransicionesPieza(t *testing.T) {
	validas := [][2]string{
		{borradorT(), enProduccionT()}, {enProduccionT(), enRevisionT()},
		{enRevisionT(), aprobadaT()}, {aprobadaT(), publicadaT()},
		{enRevisionT(), enProduccionT()}, // cambios (§4.1)
		{borradorT(), canceladaT()}, {enProduccionT(), canceladaT()},
		{enRevisionT(), canceladaT()}, {aprobadaT(), canceladaT()},
		// idempotencia §5.32: repetir el mismo estado vale
		{borradorT(), borradorT()}, {aprobadaT(), aprobadaT()},
	}
	for _, c := range validas {
		if !TransicionPiezaValida(c[0], c[1]) {
			t.Errorf("pieza %q→%q debería valer", c[0], c[1])
		}
	}
	invalidas := [][2]string{
		{borradorT(), enRevisionT()}, {borradorT(), aprobadaT()},
		{borradorT(), publicadaT()}, {enProduccionT(), aprobadaT()},
		{enProduccionT(), publicadaT()}, {enRevisionT(), publicadaT()},
		{aprobadaT(), enRevisionT()}, {aprobadaT(), enProduccionT()},
		{publicadaT(), aprobadaT()}, {publicadaT(), enRevisionT()},
		{canceladaT(), borradorT()}, {"invento", aprobadaT()},
	}
	for _, c := range invalidas {
		if TransicionPiezaValida(c[0], c[1]) {
			t.Errorf("pieza %q→%q debería fallar", c[0], c[1])
		}
	}
}

// helpers para no repetir literales (el vocabulario vive en produccion.go)
func borradorT() string     { return PiezaBorrador }
func enProduccionT() string { return PiezaEnProduccion }
func enRevisionT() string   { return PiezaEnRevision }
func aprobadaT() string     { return PiezaAprobada }
func publicadaT() string    { return PiezaPublicada }
func canceladaT() string    { return PiezaCancelada }

func TestTransicionesTarea(t *testing.T) {
	validas := [][2]string{
		{TareaBloqueada, TareaPendiente}, {TareaPendiente, TareaEnCurso},
		{TareaEnCurso, TareaEntregada}, {TareaEntregada, TareaAprobada},
		{TareaEntregada, TareaDevuelta}, {TareaDevuelta, TareaEnCurso},
		{TareaDevuelta, TareaEntregada}, {TareaBloqueada, TareaCancelada},
		{TareaPendiente, TareaCancelada}, {TareaDevuelta, TareaCancelada},
		// idempotencia §5.32
		{TareaEntregada, TareaEntregada}, {TareaAprobada, TareaAprobada},
	}
	for _, c := range validas {
		if !TransicionTareaValida(c[0], c[1]) {
			t.Errorf("tarea %q→%q debería valer", c[0], c[1])
		}
	}
	invalidas := [][2]string{
		// La siguiente se desbloquea solo al APROBAR la anterior (§4.2)
		{TareaBloqueada, TareaEnCurso}, {TareaBloqueada, TareaEntregada},
		{TareaPendiente, TareaEntregada}, {TareaEnCurso, TareaAprobada},
		{TareaEnCurso, TareaDevuelta}, {TareaDevuelta, TareaAprobada},
		{TareaAprobada, TareaDevuelta}, {TareaCancelada, TareaPendiente},
		{TareaAprobada, TareaEnCurso}, {"invento", TareaPendiente},
	}
	for _, c := range invalidas {
		if TransicionTareaValida(c[0], c[1]) {
			t.Errorf("tarea %q→%q debería fallar", c[0], c[1])
		}
	}
}

func TestOficioDeEtapa(t *testing.T) {
	casos := map[string]string{
		EtapaGrabPrincipal: "grabacion", EtapaGrabApoyo: "grabacion",
		EtapaEdicion: "edicion", EtapaDiseno: "diseno", EtapaPublicacion: "publicacion",
	}
	for etapa, quiere := range casos {
		got, ok := OficioDeEtapa(etapa)
		if !ok || got != quiere {
			t.Errorf("OficioDeEtapa(%q) = %q,%v; quería %q,true", etapa, got, ok, quiere)
		}
	}
	if _, ok := OficioDeEtapa("invento"); ok {
		t.Error("etapa inventada debería ser inválida")
	}
}

func TestValidarEntrega(t *testing.T) {
	min := 10
	bien := map[string]EntregaDatos{
		EtapaGrabPrincipal: {MaterialURL: "https://x", Minutos: &min},
		EtapaGrabApoyo:     {Minutos: &min},
		EtapaEdicion:       {EntregableURL: "https://x"},
		EtapaDiseno:        {EntregableURL: "https://x"},
		EtapaPublicacion:   {PublicadoURL: "https://x"},
	}
	for etapa, d := range bien {
		if msg, ok := ValidarEntrega(etapa, d); !ok {
			t.Errorf("entrega %q completa rechazada: %s", etapa, msg)
		}
	}
	// §5.9: cada etapa sin su dato se rechaza
	casosMal := []struct {
		etapa string
		d     EntregaDatos
	}{
		{EtapaGrabPrincipal, EntregaDatos{Minutos: &min}},
		{EtapaGrabPrincipal, EntregaDatos{MaterialURL: "https://x"}},
		{EtapaGrabApoyo, EntregaDatos{}},
		{EtapaEdicion, EntregaDatos{}},
		{EtapaDiseno, EntregaDatos{}},
		{EtapaPublicacion, EntregaDatos{EntregableURL: "https://x"}},
	}
	for _, c := range casosMal {
		if _, ok := ValidarEntrega(c.etapa, c.d); ok {
			t.Errorf("entrega %q incompleta debería fallar", c.etapa)
		}
	}
	// F111: minutos negativos se rechazan (pasaban en demo, 500 en real).
	neg := -5
	for _, etapa := range []string{EtapaGrabPrincipal, EtapaGrabApoyo} {
		d := EntregaDatos{MaterialURL: "https://x", Minutos: &neg}
		if _, ok := ValidarEntrega(etapa, d); ok {
			t.Errorf("entrega %q con minutos negativos debería fallar", etapa)
		}
	}
}

func TestEsVencida(t *testing.T) {
	if !EsVencida("2020-01-01", TareaEnCurso, "2026-09-27") {
		t.Error("pasada y en curso debería vencer")
	}
	if EsVencida("2020-01-01", TareaAprobada, "2026-09-27") {
		t.Error("aprobada no vence (§5.10)")
	}
	if EsVencida("2020-01-01", TareaCancelada, "2026-09-27") {
		t.Error("cancelada no vence")
	}
	if EsVencida("2099-01-01", TareaEnCurso, "2026-09-27") {
		t.Error("futura no vence")
	}
	if EsVencida("", TareaEnCurso, "2026-09-27") {
		t.Error("sin fecha no vence")
	}
}

func TestClientesVisibles(t *testing.T) {
	piezas := []Pieza{
		{ID: "p1", ClienteID: "c1"}, {ID: "p2", ClienteID: "c2"},
	}
	tareas := []Tarea{
		{ID: "t1", PiezaID: "p1", AsignadoID: "yo"},
		{ID: "t2", PiezaID: "p2", AsignadoID: "otro"},
	}
	eventos := []TareaEvento{
		{TareaID: "t2", Despues: map[string]any{"asignado_id": "yo"}}, // tuvo tarea en c2
	}
	vis := ClientesVisibles("yo", tareas, eventos, piezas)
	if !vis["c1"] || !vis["c2"] {
		t.Errorf("debería ver c1 (actual) y c2 (tuvo): %v", vis)
	}
	if len(vis) != 2 {
		t.Errorf("no debería ver más: %v", vis)
	}
}
