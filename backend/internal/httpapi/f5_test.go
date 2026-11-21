package httpapi_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"

	"rconceptsys/backend/internal/store"
)

// pngMinimo es un PNG de 1x1 transparente válido para el detector de MIME.
var pngMinimo = []byte{
	0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A,
	0x00, 0x00, 0x00, 0x0D, 'I', 'H', 'D', 'R',
	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
	0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89,
	0x00, 0x00, 0x00, 0x0A, 'I', 'D', 'A', 'T',
	0x78, 0x9C, 0x63, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01,
	0xE5, 0x27, 0xD4, 0xA2, 0x00, 0x00, 0x00, 0x00, 'I', 'E', 'N', 'D', 0xAE, 0x42, 0x60, 0x82,
}

func subirAdjunto(t *testing.T, routes http.Handler, userID, nombre string, contenido []byte, contentType string) *httptest.ResponseRecorder {
	t.Helper()
	cuerpo := &bytes.Buffer{}
	escritor := multipart.NewWriter(cuerpo)
	cabeceras := textproto.MIMEHeader{}
	cabeceras.Set("Content-Disposition", fmt.Sprintf(`form-data; name="archivo"; filename="%s"`, nombre))
	cabeceras.Set("Content-Type", contentType)
	parte, err := escritor.CreatePart(cabeceras)
	if err != nil {
		t.Fatalf("multipart: %v", err)
	}
	_, _ = parte.Write(contenido)
	_ = escritor.Close()

	req := httptest.NewRequest("POST", "/api/chat/adjuntos", cuerpo)
	req.Header.Set("Content-Type", escritor.FormDataContentType())
	req.Header.Set("X-Demo-User", userID)
	rr := httptest.NewRecorder()
	routes.ServeHTTP(rr, req)
	return rr
}

// --- Bloque 1: barra derecha "Equipo" ---

func TestF5EquipoResumenYPermisos(t *testing.T) {
	routes, _, adminID, editorID, _, _ := setupF2TestEnvironment(t)

	res := doRequest(routes, "GET", "/api/equipo/resumen", editorID, nil)
	if res.Code != http.StatusOK {
		t.Fatalf("resumen: esperado 200, obtenido %d: %s", res.Code, res.Body.String())
	}
	var cfg store.ConfigEquipo
	if err := json.Unmarshal(res.Body.Bytes(), &cfg); err != nil {
		t.Fatalf("json: %v", err)
	}
	if cfg.Nombre == "" {
		t.Fatal("el nombre del equipo no debe venir vacío")
	}
	if cfg.Enlaces == nil {
		t.Fatal("los enlaces deben ser una lista (aunque esté vacía)")
	}
	if cfg.Actividad.Miembros == 0 {
		t.Fatal("la actividad debe contar miembros aprobados")
	}

	// Un trabajador no edita el equipo.
	if r := doRequest(routes, "PATCH", "/api/admin/equipo", editorID, map[string]any{"nombre": "Nuevo"}); r.Code != http.StatusForbidden {
		t.Fatalf("trabajador editando equipo: esperado 403, obtenido %d", r.Code)
	}

	r := doRequest(routes, "PATCH", "/api/admin/equipo", adminID, map[string]any{
		"nombre": "Rohlfing Concept", "descripcion": "Producción de contenido.",
	})
	if r.Code != http.StatusOK {
		t.Fatalf("admin editando equipo: esperado 200, obtenido %d: %s", r.Code, r.Body.String())
	}
	_ = json.Unmarshal(r.Body.Bytes(), &cfg)
	if cfg.Nombre != "Rohlfing Concept" || cfg.Descripcion != "Producción de contenido." {
		t.Fatalf("datos no guardados: %+v", cfg)
	}

	// Enlaces: crear, ordenar, borrar
	e := doRequest(routes, "POST", "/api/admin/equipo/enlaces", adminID, map[string]any{
		"nombre": "Drive del equipo", "url": "https://drive.google.com/drive/folders/abc123",
	})
	if e.Code != http.StatusCreated {
		t.Fatalf("crear enlace: esperado 201, obtenido %d: %s", e.Code, e.Body.String())
	}
	var enlace store.EnlaceEquipo
	_ = json.Unmarshal(e.Body.Bytes(), &enlace)

	inv := doRequest(routes, "POST", "/api/admin/equipo/enlaces", adminID, map[string]any{
		"nombre": "Malo", "url": "http://no-https.example",
	})
	if inv.Code != http.StatusBadRequest {
		t.Fatalf("enlace http: esperado 400, obtenido %d", inv.Code)
	}

	p := doRequest(routes, "PATCH", fmt.Sprintf("/api/admin/equipo/enlaces/%d", enlace.ID), adminID, map[string]any{
		"nombre": "Materiales", "orden": 2,
	})
	if p.Code != http.StatusOK {
		t.Fatalf("editar enlace: esperado 200, obtenido %d: %s", p.Code, p.Body.String())
	}
	_ = json.Unmarshal(p.Body.Bytes(), &enlace)
	if enlace.Nombre != "Materiales" || enlace.Orden != 2 {
		t.Fatalf("enlace no actualizado: %+v", enlace)
	}

	if d := doRequest(routes, "DELETE", fmt.Sprintf("/api/admin/equipo/enlaces/%d", enlace.ID), adminID, nil); d.Code != http.StatusOK {
		t.Fatalf("borrar enlace: esperado 200, obtenido %d", d.Code)
	}
	if d := doRequest(routes, "DELETE", fmt.Sprintf("/api/admin/equipo/enlaces/%d", enlace.ID), adminID, nil); d.Code != http.StatusNotFound {
		t.Fatalf("borrar dos veces: esperado 404, obtenido %d", d.Code)
	}
}

// --- Bloque 4: adjuntos y audios en el chat ---

func TestF5ChatAdjuntos(t *testing.T) {
	routes, _, adminID, editorID, _, _ := setupF2TestEnvironment(t)

	subida := subirAdjunto(t, routes, editorID, "foto.png", pngMinimo, "image/png")
	if subida.Code != http.StatusCreated {
		t.Fatalf("subir imagen: esperado 201, obtenido %d: %s", subida.Code, subida.Body.String())
	}
	var adjunto store.ChatAdjunto
	_ = json.Unmarshal(subida.Body.Bytes(), &adjunto)
	if adjunto.Tipo != store.AdjuntoImagen || adjunto.ID == 0 {
		t.Fatalf("adjunto inesperado: %+v", adjunto)
	}
	if adjunto.MensajeID != nil {
		t.Fatal("el adjunto recién subido no debe tener mensaje")
	}

	// Mensaje solo con adjunto (sin texto)
	msg := doRequest(routes, "POST", "/api/chat", editorID, map[string]any{"adjuntos": []int{int(adjunto.ID)}})
	if msg.Code != http.StatusCreated {
		t.Fatalf("mensaje con adjunto: esperado 201, obtenido %d: %s", msg.Code, msg.Body.String())
	}
	var creado store.ChatMensaje
	_ = json.Unmarshal(msg.Body.Bytes(), &creado)
	if len(creado.Adjuntos) != 1 || creado.Adjuntos[0].ID != adjunto.ID {
		t.Fatalf("el mensaje no trae su adjunto: %+v", creado.Adjuntos)
	}

	// El archivo se puede descargar con su tipo
	descarga := doRequest(routes, "GET", fmt.Sprintf("/api/chat/adjuntos/%d/archivo", adjunto.ID), adminID, nil)
	if descarga.Code != http.StatusOK {
		t.Fatalf("descargar adjunto: esperado 200, obtenido %d", descarga.Code)
	}
	if ct := descarga.Header().Get("Content-Type"); !strings.HasPrefix(ct, "image/png") {
		t.Fatalf("content-type inesperado: %q", ct)
	}
	if descarga.Body.Len() != len(pngMinimo) {
		t.Fatalf("el archivo descargado no coincide (%d vs %d bytes)", descarga.Body.Len(), len(pngMinimo))
	}

	// Audio (el nombre y el tipo declarado mandan)
	audio := subirAdjunto(t, routes, editorID, "nota.webm", []byte{0x1A, 0x45, 0xDF, 0xA3, 0x01, 0x02}, "audio/webm")
	if audio.Code != http.StatusCreated {
		t.Fatalf("subir audio: esperado 201, obtenido %d: %s", audio.Code, audio.Body.String())
	}
	var adjAudio store.ChatAdjunto
	_ = json.Unmarshal(audio.Body.Bytes(), &adjAudio)
	if adjAudio.Tipo != store.AdjuntoAudio {
		t.Fatalf("el audio quedó como %q", adjAudio.Tipo)
	}

	// Mensaje vacío sin adjuntos se rechaza
	if r := doRequest(routes, "POST", "/api/chat", editorID, map[string]any{"cuerpo": "   "}); r.Code != http.StatusBadRequest {
		t.Fatalf("mensaje vacío: esperado 400, obtenido %d", r.Code)
	}

	// Un adjunto ya enlazado no se puede reutilizar
	otro := doRequest(routes, "POST", "/api/chat", editorID, map[string]any{"cuerpo": "hola", "adjuntos": []int{int(adjunto.ID)}})
	if otro.Code != http.StatusCreated {
		t.Fatalf("mensaje de texto: esperado 201, obtenido %d", otro.Code)
	}
	var msgOtro store.ChatMensaje
	_ = json.Unmarshal(otro.Body.Bytes(), &msgOtro)
	if len(msgOtro.Adjuntos) != 0 {
		t.Fatal("un adjunto ya usado no debe volver a enlazarse")
	}

	// Los mensajes del chat traen sus adjuntos al listar
	lista := doRequest(routes, "GET", "/api/chat?limite=20", adminID, nil)
	var mensajes []*store.ChatMensaje
	_ = json.Unmarshal(lista.Body.Bytes(), &mensajes)
	encontrado := false
	for _, m := range mensajes {
		if m.ID == creado.ID && len(m.Adjuntos) == 1 {
			encontrado = true
		}
	}
	if !encontrado {
		t.Fatal("el listado del chat debe incluir los adjuntos del mensaje")
	}
}

// --- Bloque 2: Recientes y Asignaciones ---

func TestF5AsignacionesRecientesYNovedad(t *testing.T) {
	routes, _, adminID, editorID, _, _ := setupF2TestEnvironment(t)
	crearTareaF4(t, routes, adminID, editorID, "Editar reel de prueba")

	res := doRequest(routes, "GET", "/api/admin/asignaciones/recientes", adminID, nil)
	if res.Code != http.StatusOK {
		t.Fatalf("recientes: esperado 200, obtenido %d: %s", res.Code, res.Body.String())
	}
	var recientes struct {
		Asignaciones []*store.AsignacionResumen `json:"asignaciones"`
		Nuevas       int                        `json:"nuevas"`
	}
	_ = json.Unmarshal(res.Body.Bytes(), &recientes)
	if len(recientes.Asignaciones) != 1 || !recientes.Asignaciones[0].Novedad || recientes.Nuevas != 1 {
		t.Fatalf("recientes inesperadas: %+v", recientes)
	}

	// Un trabajador no ve la página de asignaciones
	if r := doRequest(routes, "GET", "/api/admin/asignaciones", editorID, nil); r.Code != http.StatusForbidden {
		t.Fatalf("trabajador en asignaciones: esperado 403, obtenido %d", r.Code)
	}

	// Marcar visto apaga la novedad
	if r := doRequest(routes, "POST", "/api/admin/asignaciones/vistas", adminID, map[string]any{}); r.Code != http.StatusOK {
		t.Fatalf("marcar vistas: esperado 200, obtenido %d: %s", r.Code, r.Body.String())
	}
	res = doRequest(routes, "GET", "/api/admin/asignaciones/recientes", adminID, nil)
	_ = json.Unmarshal(res.Body.Bytes(), &recientes)
	if recientes.Asignaciones[0].Novedad || recientes.Nuevas != 0 {
		t.Fatalf("la novedad debería estar apagada: %+v", recientes)
	}

	// Filtro por persona y por estado
	filtrada := doRequest(routes, "GET", "/api/admin/asignaciones?persona="+editorID+"&estado=pendiente", adminID, nil)
	var lista struct {
		Asignaciones []*store.AsignacionResumen `json:"asignaciones"`
	}
	_ = json.Unmarshal(filtrada.Body.Bytes(), &lista)
	if len(lista.Asignaciones) != 1 {
		t.Fatalf("filtro por persona/estado: %d resultados", len(lista.Asignaciones))
	}
	vacia := doRequest(routes, "GET", "/api/admin/asignaciones?estado=aceptada", adminID, nil)
	_ = json.Unmarshal(vacia.Body.Bytes(), &lista)
	if len(lista.Asignaciones) != 0 {
		t.Fatalf("filtro por estado aceptada debería venir vacío: %d", len(lista.Asignaciones))
	}
}

// --- Bloque 6: fichas de cliente y piezas ---

func TestF5ClientesYPiezas(t *testing.T) {
	routes, _, adminID, editorID, _, _ := setupF2TestEnvironment(t)

	c := doRequest(routes, "POST", "/api/admin/clientes", adminID, map[string]any{"nombre": "Tizón Dorado"})
	if c.Code != http.StatusCreated {
		t.Fatalf("crear cliente: %d %s", c.Code, c.Body.String())
	}
	var cliente store.Cliente
	_ = json.Unmarshal(c.Body.Bytes(), &cliente)

	ficha := doRequest(routes, "PATCH", fmt.Sprintf("/api/admin/clientes/%d", cliente.ID), adminID, map[string]any{
		"paquete":   "TV",
		"drive_url": "https://drive.google.com/drive/folders/1tizon123456",
		"notas":     "Habla de tú, sin precios en pantalla.",
	})
	if ficha.Code != http.StatusOK {
		t.Fatalf("ficha: esperado 200, obtenido %d: %s", ficha.Code, ficha.Body.String())
	}
	_ = json.Unmarshal(ficha.Body.Bytes(), &cliente)
	if cliente.Paquete == nil || *cliente.Paquete != "TV" || cliente.DriveURL == nil || cliente.Notas == nil {
		t.Fatalf("ficha incompleta: %+v", cliente)
	}

	badDrive := doRequest(routes, "PATCH", fmt.Sprintf("/api/admin/clientes/%d", cliente.ID), adminID, map[string]any{
		"drive_url": "http://no-seguro.example",
	})
	if badDrive.Code != http.StatusBadRequest {
		t.Fatalf("drive_url sin https: esperado 400, obtenido %d", badDrive.Code)
	}

	p := doRequest(routes, "POST", "/api/admin/piezas", adminID, map[string]any{
		"cliente_id": cliente.ID, "nombre": "Reel Día del Padre", "formato": "Reel",
	})
	if p.Code != http.StatusCreated {
		t.Fatalf("crear pieza: esperado 201, obtenido %d: %s", p.Code, p.Body.String())
	}
	var pieza store.Pieza
	_ = json.Unmarshal(p.Body.Bytes(), &pieza)
	if pieza.Etapa != "guion" {
		t.Fatalf("la pieza debe nacer en guion, quedó %q", pieza.Etapa)
	}

	// La tarea se puede colgar de la pieza y lo devuelve en la respuesta
	tarea := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"fecha_limite": "2026-12-05",
		"cliente_id":   cliente.ID,
		"tipo_id":      2, "asignado_a": editorID, "titulo": "Editar reel día del padre", "pieza_id": pieza.ID,
	})
	if tarea.Code != http.StatusCreated {
		t.Fatalf("tarea con pieza: esperado 201, obtenido %d: %s", tarea.Code, tarea.Body.String())
	}
	var creada store.Tarea
	_ = json.Unmarshal(tarea.Body.Bytes(), &creada)
	if creada.PiezaID == nil || *creada.PiezaID != pieza.ID {
		t.Fatalf("la tarea no quedó en la pieza: %+v", creada.PiezaID)
	}
	if creada.Pieza == nil || creada.Pieza.Nombre != "Reel Día del Padre" {
		t.Fatalf("la tarea debe traer el nombre de la pieza: %+v", creada.Pieza)
	}

	// Avanzar de etapa y validar etapas inválidas
	avance := doRequest(routes, "PATCH", fmt.Sprintf("/api/admin/piezas/%d", pieza.ID), adminID, map[string]any{"etapa": "edicion"})
	if avance.Code != http.StatusOK {
		t.Fatalf("cambiar etapa: esperado 200, obtenido %d: %s", avance.Code, avance.Body.String())
	}
	_ = json.Unmarshal(avance.Body.Bytes(), &pieza)
	if pieza.Etapa != "edicion" || len(pieza.Tareas) != 1 {
		t.Fatalf("etapa/tareas inesperadas: etapa=%q tareas=%d", pieza.Etapa, len(pieza.Tareas))
	}

	mala := doRequest(routes, "PATCH", fmt.Sprintf("/api/admin/piezas/%d", pieza.ID), adminID, map[string]any{"etapa": "inventada"})
	if mala.Code != http.StatusBadRequest {
		t.Fatalf("etapa inválida: esperado 400, obtenido %d", mala.Code)
	}

	// Las tareas de siempre siguen funcionando sin pieza
	sinPieza := doRequest(routes, "POST", "/api/admin/tareas", adminID, map[string]any{
		"fecha_limite": "2026-12-05",
		"cliente_id":   1,
		"tipo_id":      2, "asignado_a": editorID, "titulo": "Tarea sin pieza",
	})
	if sinPieza.Code != http.StatusCreated {
		t.Fatalf("tarea sin pieza: esperado 201, obtenido %d", sinPieza.Code)
	}
}

// --- Bloque 7: corte de pagos ---

func TestF5CorteDePagos(t *testing.T) {
	routes, _, adminID, editorID, _, _ := setupF2TestEnvironment(t)
	creada := crearTareaF4(t, routes, adminID, editorID, "Editar video para el corte")

	if r := doRequest(routes, "POST", fmt.Sprintf("/api/tareas/%d/hecha", creada.ID), editorID, map[string]any{"nota": "Listo"}); r.Code != http.StatusOK {
		t.Fatalf("marcar hecha: %d %s", r.Code, r.Body.String())
	}
	if r := doRequest(routes, "POST", fmt.Sprintf("/api/admin/tareas/%d/aceptar", creada.ID), adminID, nil); r.Code != http.StatusOK {
		t.Fatalf("aceptar: %d %s", r.Code, r.Body.String())
	}

	// Sin tareas aprobadas no hay corte vacío: primero se crea con el periodo del mes.
	corte := doRequest(routes, "POST", "/api/admin/cortes", adminID, map[string]any{"periodo": "mes"})
	if corte.Code != http.StatusCreated {
		t.Fatalf("crear corte: esperado 201, obtenido %d: %s", corte.Code, corte.Body.String())
	}
	var c store.Corte
	_ = json.Unmarshal(corte.Body.Bytes(), &c)
	if c.Estado != "cerrado" || c.Total <= 0 || len(c.Lineas) != 1 {
		t.Fatalf("corte inesperado: %+v", c)
	}
	if c.Lineas[0].Total != 75000 {
		t.Fatalf("el total por persona debe ser el precio congelado (75000), quedó %d", c.Lineas[0].Total)
	}
	if c.Lineas[0].PerfilID != editorID || c.Lineas[0].PagadaEn != nil {
		t.Fatalf("línea inesperada: %+v", c.Lineas[0])
	}

	// Repetir el mismo periodo choca
	if r := doRequest(routes, "POST", "/api/admin/cortes", adminID, map[string]any{"periodo": "mes"}); r.Code != http.StatusConflict {
		t.Fatalf("corte duplicado: esperado 409, obtenido %d: %s", r.Code, r.Body.String())
	}

	// Exportaciones
	csv := doRequest(routes, "GET", fmt.Sprintf("/api/admin/cortes/%d/csv", c.ID), adminID, nil)
	if csv.Code != http.StatusOK || !strings.Contains(csv.Body.String(), "Eduardo Editor") || !strings.Contains(csv.Body.String(), "75000") {
		t.Fatalf("csv inesperado (%d): %s", csv.Code, csv.Body.String())
	}
	pdf := doRequest(routes, "GET", fmt.Sprintf("/api/admin/cortes/%d/pdf", c.ID), adminID, nil)
	if pdf.Code != http.StatusOK || !strings.HasPrefix(pdf.Body.String(), "%PDF-1.4") || !strings.Contains(pdf.Body.String(), "%%EOF") {
		t.Fatalf("pdf inesperado (%d): %q", pdf.Code, pdf.Body.String()[:min(40, pdf.Body.Len())])
	}

	// Marcar pagado
	pago := doRequest(routes, "POST", fmt.Sprintf("/api/admin/cortes/%d/lineas/%s/pagar", c.ID, editorID), adminID, nil)
	if pago.Code != http.StatusOK {
		t.Fatalf("pagar línea: esperado 200, obtenido %d: %s", pago.Code, pago.Body.String())
	}
	_ = json.Unmarshal(pago.Body.Bytes(), &c)
	if c.Lineas[0].PagadaEn == nil {
		t.Fatal("la línea debe quedar marcada como pagada")
	}

	// Un trabajador no puede ver cortes
	if r := doRequest(routes, "GET", "/api/admin/cortes", editorID, nil); r.Code != http.StatusForbidden {
		t.Fatalf("cortes para trabajador: esperado 403, obtenido %d", r.Code)
	}

	// Un rango sin tareas aprobadas no genera un corte vacío
	vacio := doRequest(routes, "POST", "/api/admin/cortes", adminID, map[string]any{
		"desde": "2020-01-01", "hasta": "2020-01-15",
	})
	if vacio.Code != http.StatusBadRequest {
		t.Fatalf("corte sin tareas: esperado 400, obtenido %d: %s", vacio.Code, vacio.Body.String())
	}
}

// --- Bloque 8: avisos push ---

func TestF5PushSuscripcion(t *testing.T) {
	routes, _, _, editorID, _, _ := setupF2TestEnvironment(t)

	clave := doRequest(routes, "GET", "/api/push/clave", editorID, nil)
	if clave.Code != http.StatusOK {
		t.Fatalf("clave: esperado 200, obtenido %d", clave.Code)
	}
	var cfg struct {
		Configurado bool   `json:"configurado"`
		Clave       string `json:"clave"`
	}
	_ = json.Unmarshal(clave.Body.Bytes(), &cfg)
	if cfg.Configurado || cfg.Clave != "" {
		t.Fatal("sin VAPID configurado, clave debe ir vacía y configurado=false")
	}

	sub := doRequest(routes, "POST", "/api/push/suscribir", editorID, map[string]any{
		"endpoint": "https://fcm.googleapis.com/fcm/send/ejemplo-123",
		"p256dh":   "BOrEU4mZ1nEjemploDeClave",
		"auth":     "auth-ejemplo",
	})
	if sub.Code != http.StatusCreated {
		t.Fatalf("suscribir: esperado 201, obtenido %d: %s", sub.Code, sub.Body.String())
	}

	estado := doRequest(routes, "GET", "/api/push/estado", editorID, nil)
	var est struct {
		Configurado bool `json:"configurado"`
		Suscrito    bool `json:"suscrito"`
	}
	_ = json.Unmarshal(estado.Body.Bytes(), &est)
	if !est.Suscrito {
		t.Fatal("el estado debe decir que está suscrito")
	}

	// Suscripción inválida
	if r := doRequest(routes, "POST", "/api/push/suscribir", editorID, map[string]any{
		"endpoint": "http://no-https.example/send", "p256dh": "x", "auth": "y",
	}); r.Code != http.StatusBadRequest {
		t.Fatalf("endpoint http: esperado 400, obtenido %d", r.Code)
	}

	baja := doRequest(routes, "DELETE", "/api/push/suscribir", editorID, map[string]any{
		"endpoint": "https://fcm.googleapis.com/fcm/send/ejemplo-123",
	})
	if baja.Code != http.StatusOK {
		t.Fatalf("dar de baja: esperado 200, obtenido %d", baja.Code)
	}
	estado = doRequest(routes, "GET", "/api/push/estado", editorID, nil)
	_ = json.Unmarshal(estado.Body.Bytes(), &est)
	if est.Suscrito {
		t.Fatal("tras darse de baja, suscrito debe ser false")
	}
}

// --- Bloque 5: conector de Drive sin credenciales ---

func TestF5DriveSinCredenciales(t *testing.T) {
	t.Setenv("GOOGLE_CLIENT_ID", "")
	t.Setenv("GOOGLE_CLIENT_SECRET", "")
	api, s := configurarTestAPI()
	routes := api.Routes()

	adminID := "admin-drive"
	_ = s.CrearOActualizarPerfil(t.Context(), &store.Perfil{
		ID: adminID, Correo: "juan@rconcept.com", Nombre: "Admin Drive",
		Estado: store.EstadoAprobado, EsAdmin: true,
	})

	estado := doRequest(routes, "GET", "/api/admin/drive", adminID, nil)
	if estado.Code != http.StatusOK {
		t.Fatalf("estado drive: %d %s", estado.Code, estado.Body.String())
	}
	var est map[string]any
	_ = json.Unmarshal(estado.Body.Bytes(), &est)
	if est["configurado"] != false || est["conectado"] != false {
		t.Fatalf("sin credenciales debe decir configurado=false: %+v", est)
	}

	conectar := doRequest(routes, "POST", "/api/admin/drive/conectar", adminID, nil)
	if conectar.Code != http.StatusBadRequest || !strings.Contains(conectar.Body.String(), "drive_no_configurado") {
		t.Fatalf("conectar sin credenciales: esperado 400 drive_no_configurado, obtenido %d: %s", conectar.Code, conectar.Body.String())
	}

	archivos := doRequest(routes, "GET", "/api/admin/drive/archivos", adminID, nil)
	if archivos.Code != http.StatusBadRequest {
		t.Fatalf("archivos sin conexión: esperado 400, obtenido %d", archivos.Code)
	}

	// Callback con state inválido redirige a /admin sin romper
	cb := doRequest(routes, "GET", "/api/drive/callback?state=inventado&code=abc", "", nil)
	if cb.Code != http.StatusFound || !strings.Contains(cb.Header().Get("Location"), "drive=") {
		t.Fatalf("callback inválido: %d %q", cb.Code, cb.Header().Get("Location"))
	}
}
