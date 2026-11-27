package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"rconceptsys/backend/internal/store"
)

func TestF10AdjuntosPermisosYSubida(t *testing.T) {
	m := store.NewMemoryStore()
	ctx := context.Background()
	for _, id := range []string{"admin", "editor", "otro"} {
		if e := m.CrearOActualizarPerfil(ctx, &store.Perfil{ID: id, Correo: id + "@example.test", Estado: store.EstadoAprobado, EsAdmin: id == "admin"}); e != nil {
			t.Fatal(e)
		}
	}
	crear := func() int64 {
		v, e := m.CrearTarea(ctx, &store.Tarea{Titulo: "Prueba", TipoID: 2, AsignadoA: "editor", CreadoPor: "admin"})
		if e != nil {
			t.Fatal(e)
		}
		return v.ID
	}
	id, otra := crear(), crear()
	h := NewAPI(m, NewDemoAuthVerifier(m, nil), true).Routes()
	user := fmt.Sprintf("/api/tareas/%d", id)
	admin := fmt.Sprintf("/api/admin/tareas/%d/adjuntos", id)
	pet := func(method, path, who string, body []byte) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, bytes.NewReader(body))
		if who != "" {
			r.Header.Set("X-Demo-User", who)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	check := func(w *httptest.ResponseRecorder, c int) {
		t.Helper()
		if w.Code != c {
			t.Fatalf("HTTP %d, esperaba %d: %s", w.Code, c, w.Body.String())
		}
	}
	for _, p := range []string{"/detalle", "/adjuntos", "/adjuntos/" + nuevoIntentoAdjunto() + "/firma"} {
		check(pet("GET", user+p, "otro", nil), 403)
		check(pet("GET", user+p, "", nil), 401)
	}
	check(pet("POST", admin, "editor", nil), 403)
	check(pet("GET", "/api/cron/adjuntos", "", nil), 401)
	reservar := func(uuid, nombre, tipo string, tamano int, resumir bool) []byte {
		b, _ := json.Marshal(map[string]any{"id": uuid, "nombre": nombre, "tipo": tipo, "tamano": tamano, "resumir": resumir})
		return b
	}
	for _, c := range []struct {
		n, tip  string
		limite  int
		mensaje string
	}{
		{"foto.heic", "imagen", 10, "La imagen supera el límite de 10 MB."},
		{"clip.mov", "video", 50, "El video supera el límite de 50 MB."},
		{"voz.webm", "audio", 25, "El audio supera el límite de 25 MB."},
	} {
		errTam := pet("POST", admin, "admin", reservar(nuevoIntentoAdjunto(), c.n, c.tip, c.limite*mibAdjunto+1, false))
		check(errTam, 413)
		if !strings.Contains(errTam.Body.String(), c.mensaje) {
			t.Fatalf("mensaje de tamaño incorrecto para %s: %s", c.tip, errTam.Body.String())
		}
		uuid := nuevoIntentoAdjunto()
		check(pet("POST", admin, "admin", reservar(uuid, c.n, c.tip, c.limite*mibAdjunto, false)), 200)
		check(pet("DELETE", admin+"/"+uuid, "admin", nil), 204)
	}
	for _, c := range []struct{ n, tip string }{{"x.svg", "imagen"}, {"x.wav", "video"}, {"x.exe", "audio"}, {"x.mp3", "imagen"}} {
		check(pet("POST", admin, "admin", reservar(nuevoIntentoAdjunto(), c.n, c.tip, 80, false)), 415)
	}
	uuid := nuevoIntentoAdjunto()
	check(pet("POST", admin, "admin", reservar(uuid, "voz.wav", "audio", 20, true)), 200)
	check(pet("POST", admin+"/"+uuid+"/finalizar", "admin", nil), 409)
	check(pet("PUT", admin+"/"+uuid+"/partes/0", "admin", make([]byte, 21)), 400)
	check(pet("PUT", admin+"/"+uuid+"/partes/0", "admin", make([]byte, 20)), 204)
	check(pet("POST", admin+"/"+uuid+"/finalizar", "admin", nil), 415)
	check(pet("GET", user+"/adjuntos/"+uuid+"/firma", "editor", nil), 404)
	audio := []byte("RIFF\x0c\x00\x00\x00WAVEfmt \x00\x00\x00\x00")
	check(pet("PUT", admin+"/"+uuid+"/partes/0", "admin", audio), 204)
	check(pet("POST", admin+"/"+uuid+"/finalizar", "admin", nil), 201)
	check(pet("POST", admin+"/"+uuid+"/finalizar", "admin", nil), 200)
	check(pet("GET", fmt.Sprintf("/api/tareas/%d/adjuntos/%s/firma", otra, uuid), "editor", nil), 404)
	check(pet("GET", user+"/adjuntos/"+uuid+"/firma", "otro", nil), 403)
	check(pet("POST", user+"/adjuntos/"+uuid+"/reintentar", "otro", nil), 403)
	lista := pet("GET", user+"/adjuntos", "editor", nil)
	check(lista, 200)
	if strings.Contains(lista.Body.String(), "/archivo") || !strings.Contains(lista.Body.String(), "pendiente") {
		t.Fatal(lista.Body.String())
	}
	detalle := pet("GET", user+"/detalle", "editor", nil)
	check(detalle, 200)
	if strings.Contains(detalle.Body.String(), "admin@example.test") {
		t.Fatal("el detalle expone el correo del administrador")
	}
	check(pet("GET", user+"/adjuntos/"+uuid+"/firma?descargar=1", "admin", nil), 200)
	medio := pet("GET", user+"/adjuntos/"+uuid+"/medio", "editor", nil)
	check(medio, 200)
	if !bytes.Equal(medio.Body.Bytes(), audio) {
		t.Fatal("audio cambiado")
	}
	// Usa concurrencia real para verificar el cupo; la migración hace lo mismo con lock y UNIQUE.
	var wg sync.WaitGroup
	var aceptados atomic.Int32
	for range 12 {
		wg.Go(func() {
			r := pet("POST", admin, "admin", reservar(nuevoIntentoAdjunto(), "f.png", "imagen", 20, false))
			switch r.Code {
			case 200:
				aceptados.Add(1)
			case 409:
			default:
				t.Errorf("reserva: %d", r.Code)
			}
		})
	}
	wg.Wait()
	if aceptados.Load() != 9 {
		t.Fatalf("aceptados: %d", aceptados.Load())
	}
	check(pet("DELETE", admin+"/"+uuid, "editor", nil), 403)
	check(pet("DELETE", admin+"/"+uuid, "admin", nil), 204)
	check(pet("GET", user+"/adjuntos/"+uuid+"/firma", "editor", nil), 404)
}

type dobleResumenF10 struct {
	orden                 []string
	principal, asr, texto error
}

func (d *dobleResumenF10) Gemini(ctx context.Context, _ *store.AdjuntoAsignacion, _ []byte) (resultadoAudio, error) {
	d.orden = append(d.orden, "9router")
	if _, ok := ctx.Deadline(); !ok {
		panic("sin plazo Gemini")
	}
	return resultadoAudio{"Audio demo", []string{"Uno", "Dos", "Tres"}}, d.principal
}
func (d *dobleResumenF10) NVIDIA(ctx context.Context, _ *store.AdjuntoAsignacion, _ []byte) (string, error) {
	d.orden = append(d.orden, "nvidia")
	if _, ok := ctx.Deadline(); !ok {
		panic("sin plazo ASR")
	}
	return "Audio demo", d.asr
}
func (d *dobleResumenF10) RespaldoTexto(ctx context.Context, _ string) ([]string, error) {
	d.orden = append(d.orden, "texto RIA")
	if _, ok := ctx.Deadline(); !ok {
		panic("sin plazo texto")
	}
	return []string{"Uno", "Dos", "Tres"}, d.texto
}

func TestF10ColaConRespaldoYPersistencia(t *testing.T) {
	fallo := errors.New("fallo simulado")
	for _, c := range []struct {
		nombre string
		motor  *dobleResumenF10
		orden  []string
		quiere string
	}{
		{"principal", &dobleResumenF10{}, []string{"9router"}, "9router"},
		{"respaldo", &dobleResumenF10{principal: fallo}, []string{"9router", "nvidia", "texto RIA"}, "nvidia"},
		{"todos fallan", &dobleResumenF10{principal: fallo, asr: fallo}, []string{"9router", "nvidia"}, ""},
		{"falla resumen de texto", &dobleResumenF10{principal: fallo, texto: fallo}, []string{"9router", "nvidia", "texto RIA"}, ""},
	} {
		t.Run(c.nombre, func(t *testing.T) {
			ctx := context.Background()
			m := store.NewMemoryStore()
			autor := "editor"
			if e := m.CrearOActualizarPerfil(ctx, &store.Perfil{ID: autor, Estado: store.EstadoAprobado, Correo: "editor@example.test"}); e != nil {
				t.Fatal(e)
			}
			tarea, e := m.CrearTarea(ctx, &store.Tarea{Titulo: "Demo", TipoID: 2, AsignadoA: autor, CreadoPor: autor})
			if e != nil {
				t.Fatal(e)
			}
			b := []byte("audio sintético")
			id := nuevoIntentoAdjunto()
			ruta := fmt.Sprintf("%d/%s/archivo", tarea.ID, id)
			v, e := m.ReservarAdjunto(ctx, &store.AdjuntoAsignacion{ID: id, TareaID: tarea.ID, Nombre: "demo.wav", Tipo: "audio", Mime: "audio/wav", Tamano: len(b), Ruta: ruta, Resumir: true})
			if e != nil {
				t.Fatal(e)
			}
			if e = m.GuardarObjetoAdjunto(ctx, ruta, v.Mime, b, false); e != nil {
				t.Fatal(e)
			}
			v.EstadoArchivo, v.EstadoResumen = "listo", "pendiente"
			if _, e = m.CambiarAdjunto(ctx, v, store.FiltroAdjunto{Archivo: "subiendo"}); e != nil {
				t.Fatal(e)
			}
			a := NewAPI(m, NewDemoAuthVerifier(m, nil), true)
			if e = a.procesarResumenPendiente(ctx, c.motor); e != nil {
				t.Fatal(e)
			}
			if !reflect.DeepEqual(c.motor.orden, c.orden) {
				t.Fatal(c.motor.orden)
			}
			v, e = m.ObtenerAdjunto(ctx, tarea.ID, id)
			if e != nil {
				t.Fatal(e)
			}
			if c.quiere == "" {
				if v.EstadoResumen != "fallido" || len(v.Resumen) != 0 || v.Transcripcion != nil {
					t.Fatal(v)
				}
				r := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/tareas/%d/adjuntos/%s/reintentar", tarea.ID, id), nil)
				r.Header.Set("X-Demo-User", autor)
				w := httptest.NewRecorder()
				a.Routes().ServeHTTP(w, r)
				if w.Code != 202 {
					t.Fatalf("%d: %s", w.Code, w.Body.String())
				}
				if e = a.procesarResumenPendiente(ctx, &dobleResumenF10{}); e != nil {
					t.Fatal(e)
				}
				v, e = m.ObtenerAdjunto(ctx, tarea.ID, id)
				if e != nil || v.EstadoResumen != "listo" {
					t.Fatalf("reintento: %+v %v", v, e)
				}
			} else if v.EstadoResumen != "listo" || len(v.Resumen) != 3 || v.Proveedor == nil || *v.Proveedor != c.quiere {
				t.Fatal(v)
			}
			datos, e := m.LeerObjetoAdjunto(ctx, ruta, len(b))
			if e != nil || !bytes.Equal(datos, b) {
				t.Fatal("se perdió el adjunto")
			}
		})
	}
}
