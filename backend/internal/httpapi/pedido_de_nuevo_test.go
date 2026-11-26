package httpapi_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode/utf8"

	"rconceptsys/backend/internal/store"
)

func prepararTrabajoReapertura(t *testing.T, s *store.MemoryStore, admin, asignado string, estado store.EstadoTarea, fecha *string) *store.Tarea {
	t.Helper()
	ctx := context.Background()
	clienteID := 1
	trabajo, err := s.CrearTarea(ctx, &store.Tarea{TipoID: 2, ClienteID: &clienteID, Titulo: "Video demo", AsignadoA: asignado, CreadoPor: admin, FechaLimite: fecha})
	if err != nil {
		t.Fatal(err)
	}
	switch estado {
	case store.EstadoTareaCancelada:
		trabajo, err = s.CancelarTarea(ctx, trabajo.ID, admin)
	case store.EstadoTareaHecha, store.EstadoTareaAceptada:
		nota := "Primera entrega"
		link := "https://drive.google.com/file/d/referencia-demo/view"
		trabajo, err = s.EntregarTarea(ctx, trabajo.ID, asignado, store.EntregaInput{Metodo: "drive", EnlaceMedios: &link, Nota: &nota})
		if err == nil && estado == store.EstadoTareaAceptada {
			trabajo, err = s.AceptarTarea(ctx, trabajo.ID, admin, nil)
		}
	}
	if err != nil {
		t.Fatal(err)
	}
	return trabajo
}

func rutaReapertura(id int64) string { return fmt.Sprintf("/api/admin/tareas/%d/pedir-de-nuevo", id) }

func contarAvisos(t *testing.T, s *store.MemoryStore, perfil, tipo string) []store.Notificacion {
	t.Helper()
	avisos, _, err := s.BandejaNotificaciones(context.Background(), perfil)
	if err != nil {
		t.Fatal(err)
	}
	var encontrados []store.Notificacion
	for _, n := range avisos {
		if n.Tipo == tipo {
			encontrados = append(encontrados, n)
		}
	}
	return encontrados
}

func TestPedirDeNuevoReabreYDescuentaFactura(t *testing.T) {
	rutas, s, admin, editor, _, _ := setupF2TestEnvironment(t)
	ctx := context.Background()
	const otro = "otro-admin"
	if err := s.CrearOActualizarPerfil(ctx, &store.Perfil{ID: otro, Correo: "otro@example.test", Estado: store.EstadoAprobado, EsAdmin: true}); err != nil {
		t.Fatal(err)
	}
	pasada := "2000-01-01"
	trabajo := prepararTrabajoReapertura(t, s, admin, editor, store.EstadoTareaAceptada, &pasada)
	queda := prepararTrabajoReapertura(t, s, admin, editor, store.EstadoTareaAceptada, nil)
	antes, err := s.ObtenerFacturaPorID(ctx, *trabajo.FacturaID)
	if err != nil || antes.Total <= 0 || len(antes.Lineas) != 2 {
		t.Fatalf("Factura inicial: %+v / %v", antes, err)
	}
	motivo := "Cambiar la música"
	r := doRequest(rutas, "POST", rutaReapertura(trabajo.ID), admin, map[string]string{"motivo": "  " + motivo + "  "})
	var devuelta store.Tarea
	if r.Code != http.StatusOK || json.Unmarshal(r.Body.Bytes(), &devuelta) != nil {
		t.Fatalf("Reapertura: %d %s", r.Code, r.Body)
	}
	hoy := time.Now().In(store.LocBogota).Format("2006-01-02")
	if devuelta.Estado != store.EstadoTareaPendiente || devuelta.FacturaID != nil || devuelta.CantidadAceptada != nil || devuelta.PrecioCongelado != nil || devuelta.PrecioUnitarioCongelado != nil || devuelta.ResueltaEn != nil || devuelta.ResueltaPor != nil || devuelta.HechaEn != nil || devuelta.EnlaceMedios != nil || devuelta.BorradorEntrega != nil || devuelta.FechaLimite == nil || *devuelta.FechaLimite != hoy {
		t.Fatalf("Trabajo reabierto incorrecto: %s", r.Body)
	}
	despues, err := s.ObtenerFacturaPorID(ctx, *trabajo.FacturaID)
	if err != nil || despues.Total != antes.Total-*trabajo.PrecioCongelado || len(despues.Lineas) != 1 || despues.Lineas[0].ID != queda.ID {
		t.Fatalf("Total y líneas inesperados: %+v / %v", despues, err)
	}
	reintento := doRequest(rutas, "POST", rutaReapertura(trabajo.ID), admin, nil)
	if reintento.Code != 409 {
		t.Fatalf("Debe rechazar el reintento: %d", reintento.Code)
	}
	hist, err := s.ObtenerHistorialTarea(ctx, trabajo.ID)
	if err != nil || len(hist) != 3 {
		t.Fatalf("Historial: %+v %v", hist, err)
	}
	h := hist[2]
	if h.Evento != "pedido_de_nuevo" || h.Motivo == nil || *h.Motivo != motivo || h.ActorID == nil || *h.ActorID != admin || h.CreadoEn.IsZero() || !reflect.DeepEqual(h.EnlaceMedios, trabajo.EnlaceMedios) || hist[0].EnlaceMedios == nil {
		t.Fatalf("Evento incorrecto o entrega perdida: %+v", h)
	}
	for _, perfil := range []string{editor, otro} {
		ns := contarAvisos(t, s, perfil, "pedido-de-nuevo")
		if len(ns) != 1 || !strings.HasPrefix(ns[0].Cuerpo, motivo+" · Cliente de prueba · ") || ns[0].URL != fmt.Sprintf("/tareas?tarea=%d#tarea-%d", trabajo.ID, trabajo.ID) || ns[0].FinalizadaEn != nil {
			t.Fatalf("Avisos de %s: %+v", perfil, ns)
		}
	}
	if ns := contarAvisos(t, s, admin, "pedido-de-nuevo"); len(ns) != 0 {
		t.Fatalf("El actor no debe recibir avisos: %+v", ns)
	}
}

func TestPedirDeNuevoGuardas(t *testing.T) {
	rutas, s, admin, editor, _, _ := setupF2TestEnvironment(t)
	ctx := context.Background()
	for _, estado := range []store.EstadoTarea{store.EstadoTareaHecha, store.EstadoTareaPendiente, store.EstadoTareaCancelada} {
		trabajo := prepararTrabajoReapertura(t, s, admin, editor, estado, nil)
		r := doRequest(rutas, "POST", rutaReapertura(trabajo.ID), admin, nil)
		if r.Code != 409 || !strings.Contains(r.Body.String(), "Solo puedes pedir de nuevo un trabajo ya aprobado.") {
			t.Fatalf("Estado %s: %d %s", estado, r.Code, r.Body)
		}
	}
	trabajo := prepararTrabajoReapertura(t, s, admin, editor, store.EstadoTareaAceptada, nil)
	if r := doRequest(rutas, "POST", rutaReapertura(trabajo.ID), editor, nil); r.Code != 403 {
		t.Fatalf("No se rechazó al trabajador: %d %s", r.Code, r.Body)
	}
	pagada, err := s.MarcarFacturaPagada(ctx, *trabajo.FacturaID, admin)
	if err != nil {
		t.Fatal(err)
	}
	r := doRequest(rutas, "POST", rutaReapertura(trabajo.ID), admin, nil)
	if r.Code != 409 || !strings.Contains(r.Body.String(), "Ese trabajo ya está incluido en un corte pagado.") {
		t.Fatalf("Factura pagada: %d %s", r.Code, r.Body)
	}
	actual, _ := s.ObtenerTareaPorID(ctx, trabajo.ID)
	historia, _ := s.ObtenerHistorialTarea(ctx, trabajo.ID)
	factura, _ := s.ObtenerFacturaPorID(ctx, *trabajo.FacturaID)
	if !reflect.DeepEqual(trabajo, actual) || len(historia) != 2 || !reflect.DeepEqual(pagada, factura) || len(contarAvisos(t, s, editor, "pedido-de-nuevo")) != 0 {
		t.Fatal("La operación bloqueada cambió trabajo, historial, factura o avisos")
	}
}

func TestPedirDeNuevoBloqueaCierreHistoricoPagado(t *testing.T) {
	rutas, s, admin, editor, _, _ := setupF2TestEnvironment(t)
	ctx := context.Background()
	trabajo := prepararTrabajoReapertura(t, s, admin, editor, store.EstadoTareaAceptada, nil)
	fecha := trabajo.ResueltaEn.In(time.Local).Format("2006-01-02")
	corte, err := s.CrearCorte(ctx, "personalizado", fecha, fecha, admin)
	if err != nil {
		t.Fatal(err)
	}
	pagado, err := s.MarcarLineaCortePagada(ctx, corte.ID, editor, admin)
	if err != nil {
		t.Fatal(err)
	}
	r := doRequest(rutas, "POST", rutaReapertura(trabajo.ID), admin, nil)
	actual, _ := s.ObtenerCorte(ctx, corte.ID)
	if r.Code != 409 || !reflect.DeepEqual(pagado, actual) {
		t.Fatalf("Cierre pagado: %d %s", r.Code, r.Body)
	}
}

func TestPedirDeNuevoValidaCuerpoYConcurrencia(t *testing.T) {
	rutas, s, admin, editor, _, _ := setupF2TestEnvironment(t)
	fecha := "2099-12-30"
	trabajo := prepararTrabajoReapertura(t, s, admin, editor, store.EstadoTareaAceptada, &fecha)
	for _, caso := range []struct {
		cuerpo any
		codigo int
	}{
		{map[string]string{"motivo": strings.Repeat("🪄", 501)}, 400},
		{`{}` + strings.Repeat(" ", 32768), 413},
		{`{} {}`, 400},
	} {
		if r := doRequest(rutas, "POST", rutaReapertura(trabajo.ID), admin, caso.cuerpo); r.Code != caso.codigo {
			t.Fatalf("Esperado %d: %d %s", caso.codigo, r.Code, r.Body)
		}
	}
	var wg sync.WaitGroup
	codigos := make(chan int, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codigos <- doRequest(rutas, "POST", rutaReapertura(trabajo.ID), admin, map[string]string{"motivo": strings.Repeat("🪄", 500)}).Code
		}()
	}
	wg.Wait()
	if <-codigos+<-codigos != 200+409 {
		t.Fatal("Solo un PATCH lógico debe ganar")
	}
	hist, _ := s.ObtenerHistorialTarea(context.Background(), trabajo.ID)
	actual, _ := s.ObtenerTareaPorID(context.Background(), trabajo.ID)
	ns := contarAvisos(t, s, editor, "pedido-de-nuevo")
	if len(hist) != 3 || len(ns) != 1 || !utf8.ValidString(ns[0].Cuerpo) || utf8.RuneCountInString(ns[0].Cuerpo) != 160 || actual.FechaLimite == nil || *actual.FechaLimite != fecha {
		t.Fatal("La concurrencia, el recorte Unicode o la fecha futura no se conservaron")
	}
}

func TestReasignarActualizarYCancelarAvisos(t *testing.T) {
	rutas, s, admin, editor, cam, _ := setupF2TestEnvironment(t)
	trabajo := prepararTrabajoReapertura(t, s, admin, editor, store.EstadoTareaPendiente, nil)
	ruta := fmt.Sprintf("/api/admin/tareas/%d", trabajo.ID)
	for _, cuerpo := range []map[string]any{
		{"asignado_a": cam, "forzar": true, "fecha_limite": "2099-01-01"},
		{"asignado_a": cam, "fecha_limite": "2099-01-01"},
	} {
		if r := doRequest(rutas, "PATCH", ruta, admin, cuerpo); r.Code != 200 {
			t.Fatalf("PATCH: %d %s", r.Code, r.Body)
		}
	}
	if anteriores := contarAvisos(t, s, editor, "tarea-cancelada"); len(anteriores) != 1 || anteriores[0].Titulo != "Este trabajo pasó a otra persona" {
		t.Fatalf("Avisos al anterior: %+v", anteriores)
	}
	if len(contarAvisos(t, s, cam, "tarea-nueva")) != 1 || len(contarAvisos(t, s, cam, "tarea-editada")) != 0 {
		t.Fatal("Una reasignación debe emitir solo trabajo nuevo al nuevo asignado")
	}
	if r := doRequest(rutas, "PATCH", ruta, admin, map[string]string{"fecha_limite": "2099-01-02"}); r.Code != 200 || len(contarAvisos(t, s, cam, "tarea-editada")) != 1 {
		t.Fatalf("Aviso único de fecha: %d %s", r.Code, r.Body)
	}
	if r := doRequest(rutas, "POST", ruta+"/cancelar", admin, nil); r.Code != 200 {
		t.Fatalf("Cancelar: %d %s", r.Code, r.Body)
	}
	if avisos := contarAvisos(t, s, cam, "tarea-cancelada"); len(avisos) != 1 || avisos[0].Titulo != "Se canceló un trabajo" {
		t.Fatalf("Avisos de cancelación: %+v", avisos)
	}
}

func TestSilenciarAvisosDeReaperturaYCancelacion(t *testing.T) {
	rutas, s, admin, editor, _, _ := setupF2TestEnvironment(t)
	prefs := store.PreferenciasNotificaciones{TiposSilenciados: []string{"pedido-de-nuevo", "tarea-cancelada"}}
	if r := doRequest(rutas, "PUT", "/api/notificaciones/preferencias", editor, prefs); r.Code != 200 {
		t.Fatalf("Preferencias: %d %s", r.Code, r.Body)
	}
	trabajo := prepararTrabajoReapertura(t, s, admin, editor, store.EstadoTareaAceptada, nil)
	if r := doRequest(rutas, "POST", rutaReapertura(trabajo.ID), admin, nil); r.Code != 200 {
		t.Fatalf("Reabrir: %d %s", r.Code, r.Body)
	}
	if r := doRequest(rutas, "POST", fmt.Sprintf("/api/admin/tareas/%d/cancelar", trabajo.ID), admin, nil); r.Code != 200 {
		t.Fatalf("Cancelar: %d %s", r.Code, r.Body)
	}
	if len(contarAvisos(t, s, editor, "pedido-de-nuevo"))+len(contarAvisos(t, s, editor, "tarea-cancelada")) != 0 {
		t.Fatal("No deben encolarse tipos silenciados")
	}
}
