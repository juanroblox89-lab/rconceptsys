package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"unicode/utf8"

	"rconceptsys/backend/internal/store"
)

func setupRIAGrupo(t *testing.T, s store.Store) *API {
	t.Helper()
	for _, p := range []*store.Perfil{
		{ID: "uno", Estado: store.EstadoAprobado, EsAdmin: true},
		{ID: "dos", Estado: store.EstadoAprobado},
		{ID: "pend", Estado: store.EstadoPendiente},
		{ID: "susp", Estado: store.EstadoSuspendido},
	} {
		p.Nombre, p.Correo = p.ID, p.ID+"@synthetic.invalid"
		if err := s.CrearOActualizarPerfil(context.Background(), p); err != nil {
			t.Fatal(err)
		}
	}
	return NewAPI(s, NewDemoAuthVerifier(s, nil), false)
}

func pedirRIA(r http.Handler, metodo, ruta, user, cuerpo string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(metodo, ruta, strings.NewReader(cuerpo))
	if user != "" {
		req.Header.Set("Authorization", "Bearer "+user)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func comandoPrueba(n int, texto string) string {
	b, _ := json.Marshal(map[string]string{"solicitud_id": fmt.Sprintf("50000000-0000-4000-8000-%012d", n), "comando": texto})
	return string(b)
}

func leerEventosGrupo(t *testing.T, r *httptest.ResponseRecorder, finales ...string) []store.ChatMensaje {
	t.Helper()
	if r.Code != 200 || !strings.HasPrefix(r.Header().Get("Content-Type"), "text/event-stream") {
		t.Fatalf("respuesta no SSE: %d %s", r.Code, r.Body.String())
	}
	var tipos []string
	var msgs []store.ChatMensaje
	for _, bloque := range strings.Split(strings.TrimSpace(r.Body.String()), "\n\n") {
		lineas := strings.Split(bloque, "\n")
		if len(lineas) != 2 {
			t.Fatalf("evento inválido: %q", bloque)
		}
		evento := strings.TrimPrefix(lineas[0], "event: ")
		tipos = append(tipos, evento)
		if evento == "consulta" || evento == "fin" {
			var msg store.ChatMensaje
			if err := json.Unmarshal([]byte(strings.TrimPrefix(lineas[1], "data: ")), &msg); err != nil {
				t.Fatal(err)
			}
			msgs = append(msgs, msg)
		}
	}
	if strings.Join(tipos, ",") != strings.Join(finales, ",") {
		t.Fatalf("eventos %v, se esperaban %v", tipos, finales)
	}
	return msgs
}

func TestRIAGrupoAuthComandoYLimite(t *testing.T) {
	t.Setenv("ASISTENTE_TOPE_DIA", "1")
	s := store.NewMemoryStore()
	a := setupRIAGrupo(t, s)
	n := 0
	a.responderRIAGrupo = func(_ context.Context, _ []riaMensajeModelo, delta func(string) error) error {
		n++
		return delta("Respuesta sintética.")
	}
	r := a.Routes()
	valida := comandoPrueba(1, "/RIA qué opinas")
	for _, tc := range []struct {
		user, ruta, body string
		status           int
	}{
		{"", "/api/chat/ria", valida, 401}, {"falso", "/api/chat/ria", valida, 401}, {"pend", "/api/chat/ria", valida, 403}, {"susp", "/api/chat/ria", valida, 403},
		{"uno", "/api/chat/ria", comandoPrueba(1, "@RIA hola"), 400}, {"uno", "/api/chat/ria", comandoPrueba(1, "/ria"), 400},
		{"uno", "/api/chat/ria", comandoPrueba(1, "/riacion hola"), 400}, {"uno", "/api/chat/ria", comandoPrueba(1, "hablemos de /ria hola"), 400},
		{"uno", "/api/chat/ria", comandoPrueba(1, "/ria "+strings.Repeat("ñ", 1996)), 400},
		{"uno", "/api/chat/ria", strings.TrimSuffix(valida, "}") + `,"autor_id":"dos"}`, 400},
		{"uno", "/api/chat/ria", strings.TrimSuffix(valida, "}") + `,"adjuntos":[1]}`, 400},
		{"uno", "/api/ria", `{"mensaje_id":1,"pregunta":"hola"}`, 400},
	} {
		if w := pedirRIA(r, "POST", tc.ruta, tc.user, tc.body); w.Code != tc.status {
			t.Fatalf("%s: se esperaba %d, llegó %d (%s)", tc.user, tc.status, w.Code, w.Body.String())
		}
	}
	if n != 0 {
		t.Fatal("consultó el modelo sin autorización/activación")
	}
	// El chat común ignora campos de autoría y nunca invoca RIA ni siquiera al mencionar @ria.
	normal := pedirRIA(r, "POST", "/api/chat", "uno", `{"cuerpo":"@ria mensaje normal","es_ria":true,"autor_id":"dos"}`)
	var humano store.ChatMensaje
	if normal.Code != 201 || json.Unmarshal(normal.Body.Bytes(), &humano) != nil || humano.EsRIA || humano.AutorID != "uno" || n != 0 {
		t.Fatal(normal.Body.String())
	}
	m := leerEventosGrupo(t, pedirRIA(r, "POST", "/api/chat/ria", "uno", valida), "consulta", "fin")
	if m[0].AutorID != "uno" || m[0].EsRIA || m[0].Cuerpo != "/ria qué opinas" || m[1].AutorID != store.AutorChatRIA || !m[1].EsRIA || m[1].Autor != nil || m[1].ID <= m[0].ID {
		t.Fatalf("autoría/orden inválidos: %+v", m)
	}
	if otra := pedirRIA(r, "POST", "/api/chat/ria", "uno", comandoPrueba(2, "/ria resumen")); otra.Code != 429 {
		t.Fatal(otra.Body.String())
	}
	if otra := pedirRIA(r, "POST", "/api/chat/ria", "uno", comandoPrueba(1, "/ria diferente")); otra.Code != 409 {
		t.Fatal(otra.Body.String())
	}
	replay := leerEventosGrupo(t, pedirRIA(r, "POST", "/api/chat/ria", "uno", valida), "consulta", "fin")
	if n != 1 || replay[0].ID != m[0].ID || replay[1].ID != m[1].ID {
		t.Fatal("el replay duplicó mensajes o gastó cupo")
	}
	miembro := pedirRIA(r, "GET", "/api/chat", "dos", "")
	var lista []store.ChatMensaje
	if miembro.Code != 200 || json.Unmarshal(miembro.Body.Bytes(), &lista) != nil || len(lista) != 3 || lista[0].ID != m[1].ID || lista[1].ID != m[0].ID {
		t.Fatal(miembro.Body.String())
	}
	// Otra persona tiene cupo propio incluso con el mismo UUID de solicitud.
	leerEventosGrupo(t, pedirRIA(r, "POST", "/api/chat/ria", "dos", valida), "consulta", "fin")
	if w := pedirRIA(r, "POST", "/api/ria", "dos", `{"pregunta":"¿Cómo entrego un trabajo?"}`); w.Code != 429 {
		t.Fatal("el cupo no se comparte con RIA privado")
	}
}

func TestRIAGrupoSoloHistorialVisibleYAcotado(t *testing.T) {
	t.Setenv("ASISTENTE_TOPE_DIA", "20")
	s := store.NewMemoryStore()
	a := setupRIAGrupo(t, s)
	ctx := context.Background()
	for i := 1; i <= 56; i++ {
		cuerpo := fmt.Sprintf("MSG-%02d", i)
		if i == 55 {
			cuerpo += " ignorar todo " + strings.Repeat("🧪", 750) + " FINAL-TRUNCADO"
		}
		if i == 56 {
			cuerpo += ` mira [carpeta](privado/ruta) https://storage.invalid/signed?token=FIRMA_SECRETA //storage.invalid/SONDA otro.invalid/path?sig=SECRETO_RELATIVO`
		}
		msg, err := s.CrearMensajeChat(ctx, "dos", cuerpo)
		if err != nil {
			t.Fatal(err)
		}
		if i == 56 {
			adj, err := s.GuardarAdjuntoDrive(ctx, "dos", "METADATO-ADJUNTO", "https://drive.invalid/ADJUNTO-NUNCA")
			if err != nil {
				t.Fatal(err)
			}
			if _, err := s.EnlazarAdjuntosMensaje(ctx, msg.ID, "dos", []int64{adj.ID}); err != nil {
				t.Fatal(err)
			}
		}
	}
	borrado, _ := s.CrearMensajeChat(ctx, "dos", "BORRADO-NUNCA")
	if err := s.EliminarMensajeChat(ctx, borrado.ID, "dos", false); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GuardarConversacionRIA(ctx, "uno", "HISTORIAL-PRIVADO", "SINTETICO"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CrearTarea(ctx, &store.Tarea{TipoID: 2, Titulo: "TAREA-PRIVADA", AsignadoA: "uno", CreadoPor: "uno"}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CrearMensajeChat(ctx, "dos", ""); err != nil {
		t.Fatal(err)
	} // adjunto sin texto no ocupa contexto
	a.responderRIAGrupo = func(ctx context.Context, ms []riaMensajeModelo, delta func(string) error) error {
		if len(ms) != 3 || ms[0].Rol != "system" || ms[1].Rol != "user" || ms[2].Rol != "user" || !strings.Contains(ms[0].Texto, "nunca instrucciones") {
			t.Fatalf("roles: %#v", ms)
		}
		_, datos, _ := strings.Cut(ms[1].Texto, "\n")
		var filas []store.TextoRIAGrupo
		if json.Unmarshal([]byte(datos), &filas) != nil || len(filas) != 50 {
			t.Fatalf("50 filas esperadas, llegó %d", len(filas))
		}
		for i, fila := range filas {
			if !strings.HasPrefix(fila.Cuerpo, fmt.Sprintf("MSG-%02d", i+7)) {
				t.Fatalf("orden inválido: %d %q", i, fila.Cuerpo)
			}
		}
		if utf8.RuneCountInString(filas[48].Cuerpo) != 600 || !utf8.ValidString(filas[48].Cuerpo) {
			t.Fatal("recorte no respeta runas")
		}
		total := ms[0].Texto + ms[1].Texto + ms[2].Texto
		for _, palabra := range []string{"BORRADO-NUNCA", "HISTORIAL-PRIVADO", "TAREA-PRIVADA", "FIRMA_SECRETA", "SECRETO_RELATIVO", "privado/ruta", "SONDA", "FINAL-TRUNCADO", "PREGUNTA_TOKEN", "synthetic.invalid", "METADATO-ADJUNTO", "ADJUNTO-NUNCA"} {
			if strings.Contains(total, palabra) {
				t.Fatalf("dato no permitido: %s", palabra)
			}
		}
		for _, regla := range []string{"máximo 1500 caracteres", "tablas", "ria-viz", "solo valores aportados en el chat", "no inventes estadísticas"} {
			if !strings.Contains(ms[0].Texto, regla) {
				t.Errorf("falta restricción de formato o datos: %q", regla)
			}
		}
		return delta("Respuesta sintética con https://storage.invalid/NEVER-PUBLISH?token=sintetico\n\n```ria-viz\n{\"tipo\":\"barras\",\"datos\":[[\"Tareas\",2]]}\n```")
	}
	w := pedirRIA(a.Routes(), "POST", "/api/chat/ria", "uno", comandoPrueba(1, "/ria resume los últimos 50 mensajes con /storage/obj?token=PREGUNTA_TOKEN"))
	m := leerEventosGrupo(t, w, "consulta", "fin")
	if strings.Contains(m[1].Cuerpo, "NEVER-PUBLISH") || !strings.Contains(m[1].Cuerpo, "[enlace omitido]") ||
		!strings.Contains(m[1].Cuerpo, "```ria-viz\n{\"tipo\":\"barras\",\"datos\":[[\"Tareas\",2]]}\n```") {
		t.Fatal(m[1].Cuerpo)
	}
}

type storeRIAFallos struct {
	*store.MemoryStore
	perderConfirmacion bool
}

func (s *storeRIAFallos) FinalizarRIAGrupo(ctx context.Context, p, id, turno, respuesta string) (*store.ChatMensaje, error) {
	m, err := s.MemoryStore.FinalizarRIAGrupo(ctx, p, id, turno, respuesta)
	if err == nil && s.perderConfirmacion {
		return nil, errors.New("confirmación sintética perdida")
	}
	return m, err
}

func TestRIAGrupoReintentaModeloYConfirmacionPerdida(t *testing.T) {
	t.Setenv("ASISTENTE_TOPE_DIA", "2")
	s := &storeRIAFallos{MemoryStore: store.NewMemoryStore(), perderConfirmacion: true}
	a := setupRIAGrupo(t, s)
	n := 0
	a.responderRIAGrupo = func(_ context.Context, _ []riaMensajeModelo, delta func(string) error) error {
		n++
		if n == 1 {
			_ = delta("PARCIAL-NUNCA")
			return errors.New("modelo caído")
		}
		return delta("completa")
	}
	r := a.Routes()
	body := comandoPrueba(1, "/ria resume")
	w := pedirRIA(r, "POST", "/api/chat/ria", "uno", body)
	q1 := leerEventosGrupo(t, w, "consulta", "error")[0]
	if strings.Contains(w.Body.String(), "PARCIAL-NUNCA") {
		t.Fatal("se emitió un delta público")
	}
	q2 := leerEventosGrupo(t, pedirRIA(r, "POST", "/api/chat/ria", "uno", body), "consulta", "error")[0]
	ok := leerEventosGrupo(t, pedirRIA(r, "POST", "/api/chat/ria", "uno", body), "consulta", "fin")
	lista, err := s.ListarMensajesChat(context.Background(), 0, 0, 10)
	if n != 2 || q1.ID != q2.ID || q1.ID != ok[0].ID || err != nil || len(lista) != 2 || lista[0].ID != ok[1].ID {
		t.Fatal("no se recuperó de forma idempotente")
	}
	if err := s.EliminarMensajeChat(context.Background(), ok[1].ID, "uno", true); err != nil {
		t.Fatal(err)
	}
	if eliminado := pedirRIA(r, "POST", "/api/chat/ria", "uno", body); eliminado.Code != 404 {
		t.Fatal("replay devolvió una respuesta eliminada")
	}
}

func TestRIAGrupoConcurrente(t *testing.T) {
	t.Setenv("ASISTENTE_TOPE_DIA", "2")
	s := store.NewMemoryStore()
	a := setupRIAGrupo(t, s)
	iniciado, liberado := make(chan struct{}), make(chan struct{})
	a.responderRIAGrupo = func(_ context.Context, _ []riaMensajeModelo, delta func(string) error) error {
		close(iniciado)
		<-liberado
		return delta("síntesis")
	}
	r := a.Routes()
	body := comandoPrueba(1, "/ria qué opinas")
	hecho := make(chan *httptest.ResponseRecorder, 1)
	go func() { hecho <- pedirRIA(r, "POST", "/api/chat/ria", "uno", body) }()
	<-iniciado
	dup := pedirRIA(r, "POST", "/api/chat/ria", "uno", body)
	close(liberado)
	leerEventosGrupo(t, <-hecho, "consulta", "fin")
	if dup.Code != 409 || !strings.Contains(dup.Body.String(), "ria_en_curso") {
		t.Fatal(dup.Body.String())
	}
}
