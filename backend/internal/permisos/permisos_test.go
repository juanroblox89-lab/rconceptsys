// Tests de tabla de la matriz ANALISIS §3.2: cada fila × cada acceso
// (dueno/admin/equipo/pendiente/desactivado). Los casos §5.4 (no quitar el
// último dueño) y §5.5 (admin no toca admin/dueño) se prueban aquí como
// helpers (NoQuitarUltimoDueno, PuedeCambiarAcceso) y además a nivel HTTP en
// internal/httpapi/handler_test.go; se eligió así para cubrir tanto la regla
// como su cableado en los endpoints.
package permisos

import "testing"

// accionesTodas cubre cada fila de la matriz ANALISIS §3.2.
var accionesTodas = []Accion{
	VerPanel, CrearEditarClientes, VerFichaCliente, CrearPiezasAsignar,
	VerTareas, CambiarEstadoTarea, AprobarEntrega, VerCobros, AprobarCobros,
	AjusteCobro, EditarTarifas, CerrarCorte, CRM, BibliotecaLeer,
	BibliotecaCrear, GestionUsuarios, AsistenteIA,
}

func TestDuenoTodo(t *testing.T) {
	u := Usuario{ID: "d", Acceso: AccesoDueno}
	for _, a := range accionesTodas {
		if !Puede(u, a, Recurso{}) {
			t.Errorf("dueño debería poder %q", a)
		}
	}
	if Puede(u, "accion_que_no_existe", Recurso{}) {
		t.Error("dueño no debería poder una acción desconocida (denegar por defecto)")
	}
}

func TestAdminTodoMenosTarifasYCortes(t *testing.T) {
	u := Usuario{ID: "a", Acceso: AccesoAdmin}
	for _, a := range accionesTodas {
		// ANALISIS §7.1: por defecto editar tarifas y cerrar cortes = solo dueño.
		quiere := a != EditarTarifas && a != CerrarCorte
		if Puede(u, a, Recurso{}) != quiere {
			t.Errorf("admin %q = %v, quería %v", a, !quiere, quiere)
		}
	}
	if Puede(u, "accion_que_no_existe", Recurso{}) {
		t.Error("admin no debería poder una acción desconocida (denegar por defecto)")
	}
}

func TestPendienteYDesactivadoNada(t *testing.T) {
	for _, acc := range []Acceso{AccesoPendiente, AccesoDesactivado} {
		u := Usuario{ID: "x", Acceso: acc}
		for _, a := range accionesTodas {
			if Puede(u, a, Recurso{}) {
				t.Errorf("%s no debería poder %q", acc, a)
			}
			if Puede(u, a, Recurso{OwnerID: "x"}) {
				t.Errorf("%s no debería poder %q ni sobre lo suyo", acc, a)
			}
		}
	}
}

// TestEquipoTabla cubre cada fila × equipo: sin recurso, con recurso propio,
// con recurso ajeno, y CRM con/sin oficio de ventas.
func TestEquipoTabla(t *testing.T) {
	propio := Recurso{OwnerID: "e"}
	ajeno := Recurso{OwnerID: "otro"}
	vacio := Recurso{}
	ventas := Usuario{ID: "e", Acceso: AccesoEquipo, Oficios: []string{OficioVentas}}
	base := Usuario{ID: "e", Acceso: AccesoEquipo, Oficios: []string{OficioEdicion}}

	casos := []struct {
		accion                    Accion
		sinRecurso, propio, ajeno bool
		ventasPropio, ventasAjeno bool
	}{
		{VerPanel, false, false, false, false, false},
		{CrearEditarClientes, false, false, false, false, false},
		{VerFichaCliente, false, true, false, true, false},
		{CrearPiezasAsignar, false, false, false, false, false},
		{VerTareas, false, true, false, true, false},
		{CambiarEstadoTarea, false, true, false, true, false},
		{AprobarEntrega, false, false, false, false, false},
		{VerCobros, false, true, false, true, false},
		{AprobarCobros, false, false, false, false, false},
		{AjusteCobro, false, false, false, false, false},
		{EditarTarifas, false, false, false, false, false},
		{CerrarCorte, false, false, false, false, false},
		// CRM: solo con oficio ventas y solo sus leads.
		{CRM, false, false, false, true, false},
		{BibliotecaLeer, true, true, true, true, true},
		// BibliotecaCrear como equipo = proponer (borrador hasta que admin publique).
		{BibliotecaCrear, true, true, true, true, true},
		{GestionUsuarios, false, false, false, false, false},
		// AsistenteIA solo sobre lo que ya puede ver (el recorte lo hace F5).
		{AsistenteIA, true, true, true, true, true},
	}
	for _, c := range casos {
		if got := Puede(base, c.accion, vacio); got != c.sinRecurso {
			t.Errorf("equipo %q sin recurso = %v, quería %v", c.accion, got, c.sinRecurso)
		}
		if got := Puede(base, c.accion, propio); got != c.propio {
			t.Errorf("equipo %q propio = %v, quería %v", c.accion, got, c.propio)
		}
		if got := Puede(base, c.accion, ajeno); got != c.ajeno {
			t.Errorf("equipo %q ajeno = %v, quería %v", c.accion, got, c.ajeno)
		}
		if got := Puede(ventas, c.accion, propio); got != c.ventasPropio {
			t.Errorf("equipo+ventas %q propio = %v, quería %v", c.accion, got, c.ventasPropio)
		}
		if got := Puede(ventas, c.accion, ajeno); got != c.ventasAjeno {
			t.Errorf("equipo+ventas %q ajeno = %v, quería %v", c.accion, got, c.ventasAjeno)
		}
	}
	if Puede(base, "accion_que_no_existe", propio) {
		t.Error("equipo no debería poder una acción desconocida (denegar por defecto)")
	}
}

// TestNoQuitarUltimoDueno cubre ANALISIS §5.4 a nivel helper
// (el cableado HTTP está en handler_test.go).
func TestNoQuitarUltimoDueno(t *testing.T) {
	casos := []struct {
		nombre         string
		actual, nuevo  Acceso
		desactiva      bool
		duenos         int
		quiereBloquear bool
	}{
		{"dueño a equipo siendo único", AccesoDueno, AccesoEquipo, false, 1, true},
		{"desactivar único dueño", AccesoDueno, "", true, 1, true},
		{"dueño a equipo con otro dueño", AccesoDueno, AccesoEquipo, false, 2, false},
		{"desactivar dueño con otro dueño", AccesoDueno, "", true, 2, false},
		{"dueño sigue dueño", AccesoDueno, AccesoDueno, false, 1, false},
		{"equipo a admin", AccesoEquipo, AccesoAdmin, false, 1, false},
		{"admin se desactiva", AccesoAdmin, "", true, 1, false},
	}
	for _, c := range casos {
		if got := NoQuitarUltimoDueno(c.actual, c.nuevo, c.desactiva, c.duenos); got != c.quiereBloquear {
			t.Errorf("%s: bloquear = %v, quería %v", c.nombre, got, c.quiereBloquear)
		}
	}
}

// TestPuedeCambiarAcceso cubre ANALISIS §5.5 a nivel helper
// (el cableado HTTP está en handler_test.go).
func TestPuedeCambiarAcceso(t *testing.T) {
	casos := []struct {
		nombre               string
		actor, actual, nuevo Acceso
		quiere               bool
	}{
		{"dueño cambia lo que sea", AccesoDueno, AccesoAdmin, AccesoEquipo, true},
		{"dueño toca a otro dueño", AccesoDueno, AccesoDueno, AccesoEquipo, true},
		{"admin aprueba pendiente a equipo", AccesoAdmin, AccesoPendiente, AccesoEquipo, true},
		{"admin cambia oficios de equipo", AccesoAdmin, AccesoEquipo, "", true},
		{"admin nombra admin", AccesoAdmin, AccesoPendiente, AccesoAdmin, false},
		{"admin nombra dueño", AccesoAdmin, AccesoEquipo, AccesoDueno, false},
		{"admin toca a otro admin", AccesoAdmin, AccesoAdmin, AccesoEquipo, false},
		{"admin toca a dueño", AccesoAdmin, AccesoDueno, AccesoEquipo, false},
		{"admin desactiva admin", AccesoAdmin, AccesoAdmin, AccesoDesactivado, false},
		{"equipo no cambia nada", AccesoEquipo, AccesoPendiente, AccesoEquipo, false},
		{"pendiente no cambia nada", AccesoPendiente, AccesoEquipo, AccesoEquipo, false},
		{"desactivado no cambia nada", AccesoDesactivado, AccesoEquipo, AccesoEquipo, false},
	}
	for _, c := range casos {
		if got := PuedeCambiarAcceso(c.actor, c.actual, c.nuevo); got != c.quiere {
			t.Errorf("%s: = %v, quería %v", c.nombre, got, c.quiere)
		}
	}
}

// TestNormalizarOficios: la API habla en minúsculas sin tildes aunque el
// análisis (§3.1) nombre los oficios con tilde y "estrategia/guion".
func TestNormalizarOficios(t *testing.T) {
	casos := map[string]string{
		"grabacion": "grabacion", "grabación": "grabacion",
		"edicion": "edicion", "Edición": "edicion",
		"diseno": "diseno", "diseño": "diseno",
		"estrategia": "estrategia", "estrategia/guion": "estrategia",
		"guion": "estrategia", "Publicación (community)": "publicacion",
		"community": "publicacion", "VENTAS": "ventas",
	}
	for in, quiere := range casos {
		got, ok := NormalizarOficio(in)
		if !ok || got != quiere {
			t.Errorf("NormalizarOficio(%q) = %q,%v; quería %q,true", in, got, ok, quiere)
		}
	}
	if _, ok := NormalizarOficio("astronauta"); ok {
		t.Error("oficio inventado debería ser inválido")
	}
	got, err := NormalizarOficios([]string{"Edición", "edicion", "ventas"})
	if err != nil {
		t.Fatalf("NormalizarOficios: %v", err)
	}
	if len(got) != 2 || got[0] != "edicion" || got[1] != "ventas" {
		t.Errorf("NormalizarOficios no deduplicó: %v", got)
	}
	if _, err := NormalizarOficios([]string{"ventas", "nada"}); err == nil {
		t.Error("NormalizarOficios debería fallar con oficio inválido")
	}
}
