package httpapi

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"rconceptsys/backend/internal/store"
)

func construirWebMOpusSintetico(paquetes [][]byte) []byte {
	vint := func(id uint64, esID bool, tam int) []byte {
		var out []byte
		if esID {
			switch {
			case id <= 0xff:
				out = append(out, byte(id))
			case id <= 0xffff:
				out = append(out, byte(id>>8), byte(id))
			case id <= 0xffffff:
				out = append(out, byte(id>>16), byte(id>>8), byte(id))
			default:
				out = append(out, byte(id>>24), byte(id>>16), byte(id>>8), byte(id))
			}
			return out
		}
		if tam < 0 {
			return []byte{0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff}
		}
		if tam < 0x7f {
			return []byte{byte(0x80 | tam)}
		}
		if tam < 0x3fff {
			return []byte{byte(0x40 | (tam >> 8)), byte(tam)}
		}
		return []byte{byte(0x20 | (tam >> 16)), byte(tam >> 8), byte(tam)}
	}
	elem := func(id uint64, payload []byte, indef bool) []byte {
		var b bytes.Buffer
		b.Write(vint(id, true, 0))
		if indef {
			b.Write(vint(0, false, -1))
		} else {
			b.Write(vint(0, false, len(payload)))
		}
		b.Write(payload)
		return b.Bytes()
	}

	var ebmlBody bytes.Buffer
	ebmlBody.Write(elem(0x4282, []byte("webm"), false))
	ebml := elem(0x1a45dfa3, ebmlBody.Bytes(), false)

	opusHead := make([]byte, 19)
	copy(opusHead[:8], "OpusHead")
	opusHead[8] = 1
	opusHead[9] = 1
	binary.LittleEndian.PutUint16(opusHead[10:12], 312)
	binary.LittleEndian.PutUint32(opusHead[12:16], 48000)

	var trackEntry bytes.Buffer
	trackEntry.Write(elem(0xd7, []byte{1}, false))
	trackEntry.Write(elem(0x83, []byte{2}, false))
	trackEntry.Write(elem(0x86, []byte("A_OPUS"), false))
	trackEntry.Write(elem(0x63a2, opusHead, false))
	tracks := elem(0x1654ae6b, elem(0xae, trackEntry.Bytes(), false), false)

	var clusterBody bytes.Buffer
	clusterBody.Write(elem(0xe7, []byte{0}, false))
	for _, pkt := range paquetes {
		var blk bytes.Buffer
		blk.WriteByte(0x81) // track 1
		blk.Write([]byte{0, 0, 0x80})
		blk.Write(pkt)
		clusterBody.Write(elem(0xa3, blk.Bytes(), false))
	}
	// Simula un Cluster indefinido como el producido por MediaRecorder en navegadores.
	cluster := elem(0x1f43b675, clusterBody.Bytes(), true)

	var segBody bytes.Buffer
	segBody.Write(tracks)
	segBody.Write(cluster)
	seg := elem(0x18538067, segBody.Bytes(), true)

	return append(ebml, seg...)
}

func TestWebMValidacionYReempaqueOggOpus(t *testing.T) {
	// TOC 0xf8 => CELT 20 ms (960 samples), 1 frame
	pkt1 := []byte{0xf8, 0x11, 0x22, 0x33}
	pkt2 := []byte{0xf8, 0x44, 0x55, 0x66}
	webm := construirWebMOpusSintetico([][]byte{pkt1, pkt2})

	f, ok := formatoAsignacion("grabacion.webm", "audio")
	if !ok || !validarMedioAdjunto(webm, f) {
		t.Fatalf("debió validar WebM de audio Opus con Segment y Cluster indefinidos")
	}
	fVideo, ok := formatoAsignacion("grabacion.webm", "video")
	if !ok || validarMedioAdjunto(webm, fVideo) {
		t.Fatalf("un WebM solo audio no debe pasar como video")
	}

	ogg, err := reempacarWebMaOggOpus(webm)
	if err != nil {
		t.Fatalf("error reempacando WebM->Ogg: %v", err)
	}
	if !bytes.HasPrefix(ogg, []byte("OggS")) || !bytes.Contains(ogg, []byte("OpusHead")) || !bytes.Contains(ogg, []byte("OpusTags")) {
		t.Fatalf("cabecera Ogg Opus inválida")
	}
	fOgg, _ := formatoAsignacion("salida.ogg", "audio")
	if !validarMedioAdjunto(ogg, fOgg) {
		t.Fatalf("el Ogg Opus reempacado no pasó validarMedioAdjunto")
	}
	// Verificar que también valida el formato real en disco si se pasó por env de prueba
	if ruta := os.Getenv("RC_TEST_WEBM_REAL"); ruta != "" {
		raw, err := os.ReadFile(ruta)
		if err != nil {
			t.Fatal(err)
		}
		if !validarMedioAdjunto(raw, f) {
			t.Fatalf("WebM real %s no pasó validarMedioAdjunto", ruta)
		}
		oggReal, err := reempacarWebMaOggOpus(raw)
		if err != nil || !validarMedioAdjunto(oggReal, fOgg) {
			t.Fatalf("WebM real %s falló reempaque Ogg: %v", ruta, err)
		}
		if outPath := os.Getenv("RC_TEST_OGG_OUT"); outPath != "" {
			if err := os.WriteFile(outPath, oggReal, 0600); err != nil {
				t.Fatal(err)
			}
		}
	}
}

func TestBorradorResumenSinGuardarTrabajoYReusoSinDuplicado(t *testing.T) {
	m := store.NewMemoryStore()
	ctx := context.Background()
	_ = m.CrearOActualizarPerfil(ctx, &store.Perfil{ID: "admin-1", Correo: "admin@example.test", Estado: store.EstadoAprobado, EsAdmin: true})
	_ = m.CrearOActualizarPerfil(ctx, &store.Perfil{ID: "ed-1", Correo: "ed@example.test", Estado: store.EstadoAprobado, EsAdmin: false})
	_ = m.CrearOActualizarPerfil(ctx, &store.Perfil{ID: "otro-1", Correo: "otro@example.test", Estado: store.EstadoAprobado, EsAdmin: false})

	var llamadasIA atomic.Int32
	srvIA := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		llamadasIA.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{
				"message": map[string]any{
					"content": `{"transcripcion":"Organizar cuatro clips antes del viernes.","resumen":["Organizar cuatro clips.","Revisar color y audio.","Entregar antes del viernes."]}`,
				},
			}},
		})
	}))
	defer srvIA.Close()

	t.Setenv("NINEROUTER_BASE_URL", srvIA.URL)
	t.Setenv("NINEROUTER_API_KEY", "clave-prueba-no-real")
	t.Setenv("NVIDIA_API_KEY", "")
	t.Setenv("NVIDIA_API_KEYS", "")

	api := NewAPI(m, NewDemoAuthVerifier(m, nil), true)
	routes := api.Routes()

	webm := construirWebMOpusSintetico([][]byte{{0xf8, 0x11, 0x22}, {0xf8, 0x33, 0x44}})

	enviarMultipart := func(who string, archivo []byte, nombre string) *httptest.ResponseRecorder {
		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)
		_ = mw.WriteField("nombre", nombre)
		_ = mw.WriteField("tipo", "audio")
		fw, _ := mw.CreateFormFile("archivo", nombre)
		_, _ = fw.Write(archivo)
		_ = mw.Close()

		req := httptest.NewRequest(http.MethodPost, "/api/admin/adjuntos/resumen-borrador", &buf)
		req.Header.Set("Content-Type", mw.FormDataContentType())
		if who != "" {
			req.Header.Set("X-Demo-User", who)
		}
		rr := httptest.NewRecorder()
		routes.ServeHTTP(rr, req)
		return rr
	}

	// 1. Permisos: sin sesión 401, trabajador no admin 403
	if rr := enviarMultipart("", webm, "nota.webm"); rr.Code != 401 {
		t.Fatalf("sin sesión esperaba 401, obtuvo %d", rr.Code)
	}
	if rr := enviarMultipart("ed-1", webm, "nota.webm"); rr.Code != 403 {
		t.Fatalf("no admin esperaba 403, obtuvo %d", rr.Code)
	}

	// 2. Contenido inválido rechazado con 415 sin llamar a IA
	if rr := enviarMultipart("admin-1", []byte("no-es-webm"), "nota.webm"); rr.Code != 415 {
		t.Fatalf("contenido inválido esperaba 415, obtuvo %d", rr.Code)
	}
	if llamadasIA.Load() != 0 {
		t.Fatalf("no debió llamar a IA en archivo inválido")
	}

	// 3. Borrador WebM válido -> resume inmediatamente SIN crear tareas ni adjuntos
	rr := enviarMultipart("admin-1", webm, "nota.webm")
	if rr.Code != 200 {
		t.Fatalf("resumen borrador esperaba 200, obtuvo %d: %s", rr.Code, rr.Body.String())
	}
	var resp struct {
		EstadoResumen   string                  `json:"estado_resumen"`
		Resumen         []string                `json:"resumen"`
		Transcripcion   string                  `json:"transcripcion"`
		BorradorResumen *borradorResumenAplicar `json:"borrador_resumen"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.EstadoResumen != "listo" || len(resp.Resumen) != 3 || resp.Transcripcion == "" || resp.BorradorResumen == nil || resp.BorradorResumen.Token == "" {
		t.Fatalf("respuesta borrador incompleta: %+v", resp)
	}
	tareas, _ := m.ListarTareas(ctx, store.FiltroTareas{})
	if len(tareas) != 0 {
		t.Fatalf("el resumen de borrador NO debe guardar tareas por sorpresa, hay %d", len(tareas))
	}
	if llamadasIA.Load() != 1 {
		t.Fatalf("esperaba 1 llamada a IA, hubo %d", llamadasIA.Load())
	}

	// 4. Borrador por partes (>2 MiB simulado) también funciona y limpia sus fragmentos temporales
	borradorID := nuevoIntentoAdjunto()
	partBody := bytes.NewReader(webm)
	reqPart := httptest.NewRequest(http.MethodPut, "/api/admin/adjuntos/borrador/"+borradorID+"/partes/0", partBody)
	reqPart.Header.Set("X-Demo-User", "admin-1")
	rrPart := httptest.NewRecorder()
	routes.ServeHTTP(rrPart, reqPart)
	if rrPart.Code != 204 {
		t.Fatalf("parte borrador esperaba 204, obtuvo %d: %s", rrPart.Code, rrPart.Body.String())
	}
	finMeta, _ := json.Marshal(map[string]any{"nombre": "largo.webm", "tipo": "audio", "tamano": len(webm)})
	reqFinB := httptest.NewRequest(http.MethodPost, "/api/admin/adjuntos/borrador/"+borradorID+"/resumir", bytes.NewReader(finMeta))
	reqFinB.Header.Set("X-Demo-User", "admin-1")
	rrFinB := httptest.NewRecorder()
	routes.ServeHTTP(rrFinB, reqFinB)
	if rrFinB.Code != 200 {
		t.Fatalf("resumir borrador por partes esperaba 200, obtuvo %d: %s", rrFinB.Code, rrFinB.Body.String())
	}
	if _, err := m.LeerObjetoAdjunto(ctx, rutaParteBorrador("admin-1", borradorID, 0), len(webm)); err == nil {
		t.Fatalf("las partes temporales del borrador deben limpiarse tras resumir")
	}

	// 5. Al guardar el trabajo y finalizar el adjunto, reutiliza el token del borrador sin duplicar llamada IA
	tarea, err := m.CrearTarea(ctx, &store.Tarea{Titulo: "Editar clips", TipoID: 2, AsignadoA: "ed-1", CreadoPor: "admin-1"})
	if err != nil {
		t.Fatal(err)
	}
	adjID := nuevoIntentoAdjunto()
	resBody, _ := json.Marshal(map[string]any{"id": adjID, "nombre": "nota.webm", "tipo": "audio", "tamano": len(webm), "resumir": true})
	reqRes := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/admin/tareas/%d/adjuntos", tarea.ID), bytes.NewReader(resBody))
	reqRes.Header.Set("X-Demo-User", "admin-1")
	rrRes := httptest.NewRecorder()
	routes.ServeHTTP(rrRes, reqRes)
	if rrRes.Code != 200 {
		t.Fatalf("reservar esperaba 200, obtuvo %d", rrRes.Code)
	}

	reqP := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/admin/tareas/%d/adjuntos/%s/partes/0", tarea.ID, adjID), bytes.NewReader(webm))
	reqP.Header.Set("X-Demo-User", "admin-1")
	rrP := httptest.NewRecorder()
	routes.ServeHTTP(rrP, reqP)
	if rrP.Code != 204 {
		t.Fatalf("subir parte esperaba 204, obtuvo %d", rrP.Code)
	}

	// Token alterado no debe aplicarse; token válido sí debe aplicar estado listo inmediato
	llamadasAntes := llamadasIA.Load()
	finValido, _ := json.Marshal(map[string]any{"borrador_resumen": resp.BorradorResumen})
	reqFin := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/admin/tareas/%d/adjuntos/%s/finalizar", tarea.ID, adjID), bytes.NewReader(finValido))
	reqFin.Header.Set("X-Demo-User", "admin-1")
	rrFin := httptest.NewRecorder()
	routes.ServeHTTP(rrFin, reqFin)
	if rrFin.Code != 201 {
		t.Fatalf("finalizar esperaba 201, obtuvo %d: %s", rrFin.Code, rrFin.Body.String())
	}
	var guardado vistaAdjunto
	_ = json.Unmarshal(rrFin.Body.Bytes(), &guardado)
	if guardado.EstadoResumen != "listo" || len(guardado.Resumen) != 3 {
		t.Fatalf("esperaba resumen listo inmediato al finalizar desde borrador: %+v", guardado)
	}
	if llamadasIA.Load() != llamadasAntes {
		t.Fatalf("finalizar con borrador verificado no debió volver a llamar a IA")
	}
}

func TestProcesarResumenGuardadoPermisosErroresSinDuplicado(t *testing.T) {
	m := store.NewMemoryStore()
	ctx := context.Background()
	_ = m.CrearOActualizarPerfil(ctx, &store.Perfil{ID: "admin-1", Correo: "admin@example.test", Estado: store.EstadoAprobado, EsAdmin: true})
	_ = m.CrearOActualizarPerfil(ctx, &store.Perfil{ID: "ed-1", Correo: "ed@example.test", Estado: store.EstadoAprobado, EsAdmin: false})
	_ = m.CrearOActualizarPerfil(ctx, &store.Perfil{ID: "otro-1", Correo: "otro@example.test", Estado: store.EstadoAprobado, EsAdmin: false})
	tarea, _ := m.CrearTarea(ctx, &store.Tarea{Titulo: "Audio pendiente", TipoID: 2, AsignadoA: "ed-1", CreadoPor: "admin-1"})
	webm := construirWebMOpusSintetico([][]byte{{0xf8, 0x11, 0x22}, {0xf8, 0x33, 0x44}})

	var llamadasIA atomic.Int32
	var modoRespuesta atomic.Value
	modoRespuesta.Store("silencio")

	srvIA := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		llamadasIA.Add(1)
		time.Sleep(40 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		switch modoRespuesta.Load().(string) {
		case "silencio":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"choices": []map[string]any{{"message": map[string]any{"content": `{"transcripcion":"","resumen":[]}`}}},
			})
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{
				"choices": []map[string]any{{"message": map[string]any{"content": `{"transcripcion":"Grabación lista para editar.","resumen":["Audio claro.","Revisar volumen.","Entregar mañana."]}`}}},
			})
		}
	}))
	defer srvIA.Close()

	t.Setenv("NINEROUTER_BASE_URL", srvIA.URL)
	t.Setenv("NINEROUTER_API_KEY", "clave-prueba")
	t.Setenv("NVIDIA_API_KEY", "")
	t.Setenv("NVIDIA_API_KEYS", "")

	api := NewAPI(m, NewDemoAuthVerifier(m, nil), true)
	routes := api.Routes()

	adjID := nuevoIntentoAdjunto()
	v, _ := m.ReservarAdjunto(ctx, &store.AdjuntoAsignacion{ID: adjID, TareaID: tarea.ID, Nombre: "voz.webm", Tipo: "audio", Mime: "audio/webm", Tamano: len(webm), Ruta: fmt.Sprintf("%d/%s/archivo", tarea.ID, adjID), Resumir: true})
	_ = m.GuardarObjetoAdjunto(ctx, v.Ruta, v.Mime, webm, false)
	v.EstadoArchivo, v.EstadoResumen = "listo", "pendiente"
	_, _ = m.CambiarAdjunto(ctx, v, store.FiltroAdjunto{Archivo: "subiendo"})

	pet := func(method, path, who string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, nil)
		if who != "" {
			req.Header.Set("X-Demo-User", who)
		}
		rr := httptest.NewRecorder()
		routes.ServeHTTP(rr, req)
		return rr
	}

	procPath := fmt.Sprintf("/api/tareas/%d/adjuntos/%s/procesar-resumen", tarea.ID, adjID)
	reintPath := fmt.Sprintf("/api/tareas/%d/adjuntos/%s/reintentar", tarea.ID, adjID)

	// 1. Permisos
	if rr := pet("POST", procPath, ""); rr.Code != 401 {
		t.Fatalf("sin sesión esperaba 401, obtuvo %d", rr.Code)
	}
	if rr := pet("POST", procPath, "otro-1"); rr.Code != 403 {
		t.Fatalf("otro miembro esperaba 403, obtuvo %d", rr.Code)
	}

	// 2. Silencio -> estado fallido + error legible en español
	rrSil := pet("POST", procPath, "admin-1")
	if rrSil.Code != 200 {
		t.Fatalf("procesar silencio esperaba 200 con estado fallido, obtuvo %d: %s", rrSil.Code, rrSil.Body.String())
	}
	var resSil vistaAdjunto
	_ = json.Unmarshal(rrSil.Body.Bytes(), &resSil)
	if resSil.EstadoResumen != "fallido" || resSil.ErrorResumen == nil || !strings.Contains(*resSil.ErrorResumen, "voz clara") {
		t.Fatalf("error legible esperado para silencio, obtuvo: %+v", resSil)
	}

	// 3. Reintentar + 5 llamadas concurrentes a procesar-resumen -> IA llamada EXACTAMENTE 1 vez más
	if rr := pet("POST", reintPath, "ed-1"); rr.Code != 202 {
		t.Fatalf("reintentar por asignado esperaba 202, obtuvo %d", rr.Code)
	}
	modoRespuesta.Store("ok")
	llamadasAntes := llamadasIA.Load()
	var wg sync.WaitGroup
	for range 5 {
		wg.Go(func() {
			r := pet("POST", procPath, "admin-1")
			if r.Code != 200 {
				t.Errorf("concurrencia procesar-resumen código %d", r.Code)
			}
		})
	}
	wg.Wait()
	if llamadasIA.Load() != llamadasAntes+1 {
		t.Fatalf("esperaba 1 sola llamada a IA bajo concurrencia, hubo %d", llamadasIA.Load()-llamadasAntes)
	}
	final, _ := m.ObtenerAdjunto(ctx, tarea.ID, adjID)
	if final.EstadoResumen != "listo" || len(final.Resumen) != 3 {
		t.Fatalf("esperaba resumen listo tras reintento concurrente: %+v", final)
	}
}

func TestRespaldoNVIDIAOmniWebM(t *testing.T) {
	webm := construirWebMOpusSintetico([][]byte{{0xf8, 0x11, 0x22}, {0xf8, 0x33, 0x44}})

	var recibidoOgg bool
	srv9r := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(503)
	}))
	defer srv9r.Close()

	srvNV := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Model    string `json:"model"`
			Messages []struct {
				Content []struct {
					Type     string `json:"type"`
					AudioURL *struct {
						URL string `json:"url"`
					} `json:"audio_url"`
				} `json:"content"`
			} `json:"messages"`
		}
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &body)
		if body.Model != modeloAudioNVIDIA {
			t.Errorf("modelo NVIDIA inesperado: %s", body.Model)
		}
		for _, c := range body.Messages[0].Content {
			if c.Type == "audio_url" && c.AudioURL != nil && strings.HasPrefix(c.AudioURL.URL, "data:audio/ogg;base64,") {
				recibidoOgg = true
			}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{
				"message": map[string]any{
					"content": `{"transcripcion":"Entregar el corte final el viernes.","resumen":["Revisar los clips.","Ajustar nivel de voz.","Entregar el viernes."]}`,
				},
			}},
		})
	}))
	defer srvNV.Close()

	t.Setenv("NINEROUTER_BASE_URL", srv9r.URL)
	t.Setenv("NINEROUTER_API_KEY", "k-9r")
	t.Setenv("NVIDIA_API_KEY", "k-nv")
	t.Setenv("NVIDIA_API_KEYS", "")

	p := audioDesdeEntorno()
	p.baseASR = srvNV.URL
	r, prov, err := resumenAudio(context.Background(), p, &store.AdjuntoAsignacion{Nombre: "grab.webm", Tipo: "audio", Mime: "audio/webm"}, webm)
	if err != nil || prov != "nvidia" || !recibidoOgg || len(r.Resumen) != 3 {
		t.Fatalf("respaldo NVIDIA Omni falló: prov=%q recibidoOgg=%v err=%v res=%+v", prov, recibidoOgg, err, r)
	}
}

func TestResumenAudioSondaRealWebM(t *testing.T) {
	if os.Getenv("RC_SONDA_REAL") != "1" {
		t.Skip("sonda real opt-in")
	}
	vozPath := os.Getenv("RC_SONDA_WEBM_VOZ")
	silPath := os.Getenv("RC_SONDA_WEBM_SILENCIO")
	if vozPath == "" || silPath == "" {
		t.Fatal("define RC_SONDA_WEBM_VOZ y RC_SONDA_WEBM_SILENCIO")
	}
	voz, err := os.ReadFile(vozPath)
	if err != nil {
		t.Fatal(err)
	}
	sil, err := os.ReadFile(silPath)
	if err != nil {
		t.Fatal(err)
	}
	p := audioDesdeEntorno()
	ctx, fin := context.WithTimeout(context.Background(), 60*time.Second)
	defer fin()

	r, prov, err := resumenAudio(ctx, p, &store.AdjuntoAsignacion{Nombre: "sintetico.webm", Tipo: "audio", Mime: "audio/webm"}, voz)
	if err != nil {
		t.Fatalf("sonda voz real falló (%s): %v", prov, err)
	}
	t.Logf("Sonda voz real OK -> proveedor=%s transcripcion=%q viñetas=%d", prov, r.Transcripcion, len(r.Resumen))

	_, _, errSil := resumenAudio(ctx, p, &store.AdjuntoAsignacion{Nombre: "silencio.webm", Tipo: "audio", Mime: "audio/webm"}, sil)
	if errSil == nil {
		t.Fatalf("sonda silencio debió fallar con error legible de sin voz")
	}
	t.Logf("Sonda silencio real OK -> error legible=%q", mensajeErrorResumen(errSil))
}

func TestFlujoHTTPRealBorradorYGuardadoWebM(t *testing.T) {
	if os.Getenv("RC_SONDA_REAL") != "1" {
		t.Skip("flujo HTTP real opt-in")
	}
	vozPath := os.Getenv("RC_SONDA_WEBM_VOZ")
	if vozPath == "" {
		t.Fatal("define RC_SONDA_WEBM_VOZ")
	}
	webm, err := os.ReadFile(vozPath)
	if err != nil {
		t.Fatal(err)
	}

	m := store.NewMemoryStore()
	ctx := context.Background()
	_ = m.CrearOActualizarPerfil(ctx, &store.Perfil{ID: "admin-1", Correo: "admin@example.test", Estado: store.EstadoAprobado, EsAdmin: true})
	_ = m.CrearOActualizarPerfil(ctx, &store.Perfil{ID: "ed-1", Correo: "ed@example.test", Estado: store.EstadoAprobado, EsAdmin: false})
	api := NewAPI(m, NewDemoAuthVerifier(m, nil), true)
	srv := httptest.NewServer(api.Routes())
	defer srv.Close()

	// 1. Borrador HTTP multipart real sin crear tarea
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("nombre", "Grabación-real.webm")
	_ = mw.WriteField("tipo", "audio")
	fw, _ := mw.CreateFormFile("archivo", "Grabación-real.webm")
	_, _ = fw.Write(webm)
	_ = mw.Close()

	reqB, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/admin/adjuntos/resumen-borrador", &buf)
	reqB.Header.Set("Content-Type", mw.FormDataContentType())
	reqB.Header.Set("X-Demo-User", "admin-1")
	resB, err := http.DefaultClient.Do(reqB)
	if err != nil {
		t.Fatal(err)
	}
	defer resB.Body.Close()
	if resB.StatusCode != 200 {
		b, _ := io.ReadAll(resB.Body)
		t.Fatalf("borrador HTTP %d: %s", resB.StatusCode, string(b))
	}
	var outB struct {
		EstadoResumen string   `json:"estado_resumen"`
		Resumen       []string `json:"resumen"`
		Transcripcion string   `json:"transcripcion"`
	}
	_ = json.NewDecoder(resB.Body).Decode(&outB)
	if outB.EstadoResumen != "listo" || len(outB.Resumen) < 3 || !strings.Contains(strings.ToLower(outB.Transcripcion), "azul") {
		t.Fatalf("borrador real inesperado: %+v", outB)
	}
	tareas, _ := m.ListarTareas(ctx, store.FiltroTareas{})
	if len(tareas) != 0 {
		t.Fatalf("borrador creó tarea inesperadamente")
	}

	// 2. Adjunto guardado pendiente -> PATCH resumir=true -> POST procesar-resumen -> listo
	tarea, _ := m.CrearTarea(ctx, &store.Tarea{Titulo: "Trabajo real WebM", TipoID: 2, AsignadoA: "ed-1", CreadoPor: "admin-1"})
	adjID := nuevoIntentoAdjunto()
	doJSON := func(method, url, who string, body any) (int, []byte) {
		var rdr io.Reader
		if body != nil {
			b, _ := json.Marshal(body)
			rdr = bytes.NewReader(b)
		}
		req, _ := http.NewRequest(method, url, rdr)
		req.Header.Set("X-Demo-User", who)
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		out, _ := io.ReadAll(res.Body)
		return res.StatusCode, out
	}

	c, _ := doJSON("POST", fmt.Sprintf("%s/api/admin/tareas/%d/adjuntos", srv.URL, tarea.ID), "admin-1", map[string]any{
		"id": adjID, "nombre": "Grabación-guardada.webm", "tipo": "audio", "tamano": len(webm), "resumir": false,
	})
	if c != 200 {
		t.Fatalf("reservar %d", c)
	}
	reqPut, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("%s/api/admin/tareas/%d/adjuntos/%s/partes/0", srv.URL, tarea.ID, adjID), bytes.NewReader(webm))
	reqPut.Header.Set("X-Demo-User", "admin-1")
	resPut, err := http.DefaultClient.Do(reqPut)
	if err != nil || resPut.StatusCode != 204 {
		t.Fatalf("subir parte %v", err)
	}
	_ = resPut.Body.Close()

	c, _ = doJSON("POST", fmt.Sprintf("%s/api/admin/tareas/%d/adjuntos/%s/finalizar", srv.URL, tarea.ID, adjID), "admin-1", nil)
	if c != 201 {
		t.Fatalf("finalizar %d", c)
	}
	c, _ = doJSON("PATCH", fmt.Sprintf("%s/api/admin/tareas/%d/adjuntos/%s", srv.URL, tarea.ID, adjID), "admin-1", map[string]bool{"resumir": true})
	if c != 200 {
		t.Fatalf("patch resumir %d", c)
	}
	c, bodyProc := doJSON("POST", fmt.Sprintf("%s/api/tareas/%d/adjuntos/%s/procesar-resumen", srv.URL, tarea.ID, adjID), "admin-1", nil)
	if c != 200 {
		t.Fatalf("procesar-resumen %d: %s", c, string(bodyProc))
	}
	var outProc vistaAdjunto
	_ = json.Unmarshal(bodyProc, &outProc)
	if outProc.EstadoResumen != "listo" || len(outProc.Resumen) < 3 || outProc.Transcripcion == nil {
		t.Fatalf("procesar-resumen real incompleto: %+v", outProc)
	}
	t.Logf("Flujo HTTP real borrador+guardado OK: %d viñetas", len(outProc.Resumen))
}

