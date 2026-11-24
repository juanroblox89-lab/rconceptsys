package supa

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"rconceptsys/backend/internal/store"
)

// ==========================================================
// F5: Store de Supabase (PostgREST) para equipo, adjuntos del
// chat, asignaciones, Drive, piezas, cortes y avisos push.
// ==========================================================

const claveConfigEquipo = "equipo"

// configEquipoJSON es el valor jsonb guardado en public.configuracion.
type configEquipoJSON struct {
	Nombre        string                `json:"nombre"`
	Descripcion   string                `json:"descripcion"`
	Enlaces       []*store.EnlaceEquipo `json:"enlaces"`
	ActualizadoEn *string               `json:"actualizado_en,omitempty"`
}

type dbAdjunto struct {
	ID          int64   `json:"id"`
	MensajeID   *int64  `json:"mensaje_id"`
	AutorID     string  `json:"autor_id"`
	Tipo        string  `json:"tipo"`
	Nombre      string  `json:"nombre"`
	Mime        string  `json:"mime"`
	Tamano      int64   `json:"tamano"`
	DuracionSeg *int    `json:"duracion_seg"`
	Ancho       *int    `json:"ancho"`
	Alto        *int    `json:"alto"`
	StoragePath *string `json:"storage_path"`
	URLExterna  *string `json:"url_externa"`
	CreadoEn    string  `json:"creado_en"`
}

func convertirAdjunto(d *dbAdjunto) *store.ChatAdjunto {
	if d == nil {
		return nil
	}
	t, _ := time.Parse(time.RFC3339, d.CreadoEn)
	return &store.ChatAdjunto{
		ID:          d.ID,
		MensajeID:   d.MensajeID,
		AutorID:     d.AutorID,
		Tipo:        d.Tipo,
		Nombre:      d.Nombre,
		Mime:        d.Mime,
		Tamano:      d.Tamano,
		DuracionSeg: d.DuracionSeg,
		Ancho:       d.Ancho,
		Alto:        d.Alto,
		StoragePath: d.StoragePath,
		URLExterna:  d.URLExterna,
		CreadoEn:    t,
	}
}

type dbPiezaCorta struct {
	ID     int    `json:"id"`
	Nombre string `json:"nombre"`
	Etapa  string `json:"etapa"`
}

type dbPieza struct {
	ID               int        `json:"id"`
	ClienteID        *int       `json:"cliente_id"`
	Nombre           string     `json:"nombre"`
	Formato          string     `json:"formato"`
	Etapa            string     `json:"etapa"`
	FechaPublicacion *string    `json:"fecha_publicacion"`
	Notas            *string    `json:"notas"`
	DriveCarpetaURL  *string    `json:"drive_carpeta_url"`
	CreadoPor        string     `json:"creado_por"`
	CreadoEn         string     `json:"creado_en"`
	ActualizadoEn    string     `json:"actualizado_en"`
	Cliente          *dbCliente `json:"clientes"`
	Tareas           []*dbTarea `json:"tareas"`
}

func convertirPieza(dp *dbPieza) *store.Pieza {
	if dp == nil {
		return nil
	}
	creada, _ := time.Parse(time.RFC3339, dp.CreadoEn)
	actualizada, _ := time.Parse(time.RFC3339, dp.ActualizadoEn)
	p := &store.Pieza{
		ID:               dp.ID,
		ClienteID:        dp.ClienteID,
		Cliente:          convertirCliente(dp.Cliente),
		Nombre:           dp.Nombre,
		Formato:          dp.Formato,
		Etapa:            dp.Etapa,
		FechaPublicacion: dp.FechaPublicacion,
		Notas:            dp.Notas,
		DriveCarpetaURL:  dp.DriveCarpetaURL,
		CreadoPor:        dp.CreadoPor,
		CreadoEn:         creada,
		ActualizadoEn:    actualizada,
	}
	if len(dp.Tareas) > 0 {
		p.Tareas = make([]*store.Tarea, 0, len(dp.Tareas))
		for _, t := range dp.Tareas {
			p.Tareas = append(p.Tareas, convertirTarea(t))
		}
	}
	return p
}

type dbCorte struct {
	ID        int64           `json:"id"`
	Periodo   string          `json:"periodo"`
	Desde     string          `json:"desde"`
	Hasta     string          `json:"hasta"`
	Estado    string          `json:"estado"`
	Total     int64           `json:"total"`
	CreadoEn  string          `json:"creado_en"`
	CreadoPor *string         `json:"creado_por"`
	Lineas    []*dbLineaCorte `json:"corte_lineas"`
}

type dbLineaCorte struct {
	CorteID   int64     `json:"corte_id"`
	PerfilID  string    `json:"perfil_id"`
	Total     int64     `json:"total"`
	Tareas    int       `json:"tareas"`
	PagadaEn  *string   `json:"pagada_en"`
	PagadaPor *string   `json:"pagada_por"`
	Perfil    *dbPerfil `json:"perfiles"`
}

func convertirCorte(dc *dbCorte) *store.Corte {
	if dc == nil {
		return nil
	}
	t, _ := time.Parse(time.RFC3339, dc.CreadoEn)
	c := &store.Corte{
		ID:        dc.ID,
		Periodo:   dc.Periodo,
		Desde:     dc.Desde,
		Hasta:     dc.Hasta,
		Estado:    dc.Estado,
		Total:     dc.Total,
		CreadoEn:  t,
		CreadoPor: dc.CreadoPor,
		Lineas:    make([]*store.LineaCorte, 0, len(dc.Lineas)),
	}
	sort.Slice(dc.Lineas, func(i, j int) bool {
		ni, nj := "", ""
		if dc.Lineas[i].Perfil != nil {
			ni = strings.ToLower(dc.Lineas[i].Perfil.Nombre)
		}
		if dc.Lineas[j].Perfil != nil {
			nj = strings.ToLower(dc.Lineas[j].Perfil.Nombre)
		}
		return ni < nj
	})
	for _, l := range dc.Lineas {
		linea := &store.LineaCorte{
			PerfilID:  l.PerfilID,
			Total:     l.Total,
			Tareas:    l.Tareas,
			PagadaEn:  parseTimePtr(l.PagadaEn),
			PagadaPor: l.PagadaPor,
		}
		if l.Perfil != nil {
			linea.Perfil = convertirPerfil(l.Perfil, nil)
		}
		c.Lineas = append(c.Lineas, linea)
	}
	return c
}

type dbConexionDrive struct {
	Correo            string  `json:"correo"`
	RefreshToken      string  `json:"refresh_token"`
	CarpetaRaizID     string  `json:"carpeta_raiz_id"`
	CarpetaClientesID string  `json:"carpeta_clientes_id"`
	ConectadoEn       string  `json:"conectado_en"`
	ConectadoPor      *string `json:"conectado_por"`
}

type dbSuscripcionPush struct {
	ID        int64   `json:"id"`
	PerfilID  string  `json:"perfil_id"`
	Endpoint  string  `json:"endpoint"`
	P256DH    string  `json:"p256dh"`
	Auth      string  `json:"auth"`
	UserAgent *string `json:"user_agent"`
	CreadoEn  string  `json:"creado_en"`
}

// ---------- Equipo (barra derecha) ----------

func (s *SupabaseStore) leerConfigEquipo(ctx context.Context) (*configEquipoJSON, error) {
	q := url.Values{}
	q.Set("clave", "eq."+claveConfigEquipo)
	q.Set("select", "clave,valor,actualizado_en")

	var rows []struct {
		Valor         json.RawMessage `json:"valor"`
		ActualizadoEn string          `json:"actualizado_en"`
	}
	if err := s.client.REST(ctx, "GET", "configuracion", q, nil, "", &rows); err != nil {
		return nil, err
	}
	cfg := &configEquipoJSON{
		Nombre:      "RConcept Systems",
		Descripcion: "Producción de contenido para clientes.",
		Enlaces:     []*store.EnlaceEquipo{},
	}
	if len(rows) == 0 {
		return cfg, nil
	}
	if len(rows[0].Valor) > 0 {
		var guardado configEquipoJSON
		if err := json.Unmarshal(rows[0].Valor, &guardado); err == nil {
			if strings.TrimSpace(guardado.Nombre) != "" {
				cfg.Nombre = guardado.Nombre
			}
			cfg.Descripcion = guardado.Descripcion
			if guardado.Enlaces != nil {
				cfg.Enlaces = guardado.Enlaces
			}
			cfg.ActualizadoEn = guardado.ActualizadoEn
		}
	}
	if cfg.ActualizadoEn == nil && rows[0].ActualizadoEn != "" {
		cfg.ActualizadoEn = &rows[0].ActualizadoEn
	}
	return cfg, nil
}

func (s *SupabaseStore) guardarConfigEquipo(ctx context.Context, cfg *configEquipoJSON) error {
	ahora := time.Now().UTC().Format(time.RFC3339)
	cfg.ActualizadoEn = &ahora
	valor, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	q := url.Values{}
	q.Set("on_conflict", "clave")
	payload := []map[string]any{{
		"clave":          claveConfigEquipo,
		"valor":          json.RawMessage(valor),
		"actualizado_en": ahora,
	}}
	return s.client.REST(ctx, "POST", "configuracion", q, payload, "resolution=merge-duplicates,return=minimal", nil)
}

func (s *SupabaseStore) actividadEquipo(ctx context.Context) store.ActividadEquipo {
	act := store.ActividadEquipo{}
	contar := func(tabla string, filtros map[string]string) int {
		q := url.Values{}
		q.Set("select", "id")
		q.Set("limit", "1000")
		for k, v := range filtros {
			q.Set(k, v)
		}
		// PostgREST entrega UUID en perfiles e IDs numéricos en otras tablas.
		var rows []json.RawMessage
		if err := s.client.REST(ctx, "GET", tabla, q, nil, "", &rows); err != nil {
			return 0
		}
		return len(rows)
	}
	act.Mensajes = contar("chat_mensajes", map[string]string{"borrado_en": "is.null"})
	act.Miembros = contar("perfiles", map[string]string{"estado": "eq.aprobado"})
	act.Tareas = contar("tareas", nil)

	q := url.Values{}
	q.Set("select", "id")
	q.Set("limit", "5000")
	var adjuntosRows []struct {
		ID int64 `json:"id"`
	}
	if err := s.client.REST(ctx, "GET", "chat_adjuntos", q, nil, "", &adjuntosRows); err == nil {
		act.Archivos += len(adjuntosRows)
	}

	qT := url.Values{}
	qT.Set("select", "id")
	qT.Set("enlace_medios", "not.is.null")
	var conEnlace []struct {
		ID int64 `json:"id"`
	}
	if err := s.client.REST(ctx, "GET", "tareas", qT, nil, "", &conEnlace); err == nil {
		act.Archivos += len(conEnlace)
	}
	return act
}

func (s *SupabaseStore) ObtenerConfigEquipo(ctx context.Context) (*store.ConfigEquipo, error) {
	cfg, err := s.leerConfigEquipo(ctx)
	if err != nil {
		return nil, err
	}
	res := &store.ConfigEquipo{
		Nombre:      cfg.Nombre,
		Descripcion: cfg.Descripcion,
		Enlaces:     cfg.Enlaces,
		Actividad:   s.actividadEquipo(ctx),
	}
	if res.Enlaces == nil {
		res.Enlaces = []*store.EnlaceEquipo{}
	}
	if cfg.ActualizadoEn != nil {
		if t, err := time.Parse(time.RFC3339, *cfg.ActualizadoEn); err == nil {
			res.ActualizadoEn = &t
		}
	}
	return res, nil
}

func (s *SupabaseStore) ActualizarConfigEquipo(ctx context.Context, nombre, descripcion *string) (*store.ConfigEquipo, error) {
	cfg, err := s.leerConfigEquipo(ctx)
	if err != nil {
		return nil, err
	}
	if nombre != nil {
		n := strings.TrimSpace(*nombre)
		if len([]rune(n)) < 2 || len([]rune(n)) > 80 {
			return nil, fmt.Errorf("%w: el nombre del equipo debe tener entre 2 y 80 caracteres", store.ErrValidation)
		}
		cfg.Nombre = n
	}
	if descripcion != nil {
		d := strings.TrimSpace(*descripcion)
		if len([]rune(d)) > 300 {
			return nil, fmt.Errorf("%w: la descripción no puede superar 300 caracteres", store.ErrValidation)
		}
		cfg.Descripcion = d
	}
	if err := s.guardarConfigEquipo(ctx, cfg); err != nil {
		return nil, err
	}
	return s.ObtenerConfigEquipo(ctx)
}

func (s *SupabaseStore) CrearEnlaceEquipo(ctx context.Context, nombre, url string) (*store.EnlaceEquipo, error) {
	n := strings.TrimSpace(nombre)
	u := strings.TrimSpace(url)
	if len([]rune(n)) < 1 || len([]rune(n)) > 40 {
		return nil, fmt.Errorf("%w: el nombre del enlace debe tener entre 1 y 40 caracteres", store.ErrValidation)
	}
	if len(u) < 8 || len(u) > 500 || !strings.HasPrefix(u, "https://") {
		return nil, fmt.Errorf("%w: el enlace debe ser una URL https de máximo 500 caracteres", store.ErrValidation)
	}
	cfg, err := s.leerConfigEquipo(ctx)
	if err != nil {
		return nil, err
	}
	if len(cfg.Enlaces) >= 12 {
		return nil, fmt.Errorf("%w: ya hay 12 enlaces, quita uno antes de agregar otro", store.ErrValidation)
	}
	maxID := 0
	for _, e := range cfg.Enlaces {
		if e.ID > maxID {
			maxID = e.ID
		}
	}
	nuevo := &store.EnlaceEquipo{ID: maxID + 1, Nombre: n, URL: u, Orden: maxID + 1, CreadoEn: time.Now()}
	cfg.Enlaces = append(cfg.Enlaces, nuevo)
	if err := s.guardarConfigEquipo(ctx, cfg); err != nil {
		return nil, err
	}
	return nuevo, nil
}

func (s *SupabaseStore) ActualizarEnlaceEquipo(ctx context.Context, id int, campos map[string]any) (*store.EnlaceEquipo, error) {
	cfg, err := s.leerConfigEquipo(ctx)
	if err != nil {
		return nil, err
	}
	var encontrado *store.EnlaceEquipo
	for _, e := range cfg.Enlaces {
		if e.ID != id {
			continue
		}
		if v, ok := campos["nombre"]; ok {
			str, ok := v.(string)
			if !ok {
				return nil, store.ErrValidation
			}
			str = strings.TrimSpace(str)
			if len([]rune(str)) < 1 || len([]rune(str)) > 40 {
				return nil, fmt.Errorf("%w: el nombre del enlace debe tener entre 1 y 40 caracteres", store.ErrValidation)
			}
			e.Nombre = str
		}
		if v, ok := campos["url"]; ok {
			str, ok := v.(string)
			if !ok {
				return nil, store.ErrValidation
			}
			str = strings.TrimSpace(str)
			if len(str) < 8 || len(str) > 500 || !strings.HasPrefix(str, "https://") {
				return nil, fmt.Errorf("%w: el enlace debe ser una URL https de máximo 500 caracteres", store.ErrValidation)
			}
			e.URL = str
		}
		if v, ok := campos["orden"]; ok {
			switch n := v.(type) {
			case int:
				e.Orden = n
			case float64:
				e.Orden = int(n)
			default:
				return nil, store.ErrValidation
			}
		}
		encontrado = e
	}
	if encontrado == nil {
		return nil, store.ErrNotFound
	}
	if err := s.guardarConfigEquipo(ctx, cfg); err != nil {
		return nil, err
	}
	return encontrado, nil
}

func (s *SupabaseStore) EliminarEnlaceEquipo(ctx context.Context, id int) error {
	cfg, err := s.leerConfigEquipo(ctx)
	if err != nil {
		return err
	}
	nuevos := make([]*store.EnlaceEquipo, 0, len(cfg.Enlaces))
	for _, e := range cfg.Enlaces {
		if e.ID != id {
			nuevos = append(nuevos, e)
		}
	}
	if len(nuevos) == len(cfg.Enlaces) {
		return store.ErrNotFound
	}
	cfg.Enlaces = nuevos
	return s.guardarConfigEquipo(ctx, cfg)
}

// ---------- Chat con adjuntos ----------

func (s *SupabaseStore) GuardarAdjuntoChat(ctx context.Context, autorID, tipo, nombre, mime string, tamano int64, duracionSeg *int, datos []byte) (*store.ChatAdjunto, error) {
	switch tipo {
	case store.AdjuntoImagen, store.AdjuntoVideo, store.AdjuntoAudio, store.AdjuntoArchivo, store.AdjuntoDrive:
	default:
		return nil, fmt.Errorf("%w: tipo de adjunto no válido", store.ErrValidation)
	}

	objectPath := fmt.Sprintf("%s/%d-%s", autorID, time.Now().UnixNano(), sanitizarNombre(nombre))
	if err := s.client.UploadStorage(ctx, "chat", objectPath, datos, mime); err != nil {
		return nil, err
	}

	payload := map[string]any{
		"autor_id":     autorID,
		"tipo":         tipo,
		"nombre":       strings.TrimSpace(nombre),
		"mime":         mime,
		"tamano":       tamano,
		"duracion_seg": duracionSeg,
		"storage_path": objectPath,
	}
	q := url.Values{}
	q.Set("select", "*")
	var rows []dbAdjunto
	if err := s.client.REST(ctx, "POST", "chat_adjuntos", q, payload, "return=representation", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrValidation
	}
	return convertirAdjunto(&rows[0]), nil
}

// GuardarAdjuntoDrive registra una carpeta de Drive compartida en el chat.
func (s *SupabaseStore) GuardarAdjuntoDrive(ctx context.Context, autorID, nombre, enlaceDrive string) (*store.ChatAdjunto, error) {
	limpio := strings.TrimSpace(nombre)
	if len([]rune(limpio)) < 1 || len([]rune(limpio)) > 200 {
		return nil, fmt.Errorf("%w: el nombre de la carpeta debe tener entre 1 y 200 caracteres", store.ErrValidation)
	}
	enlace := strings.TrimSpace(enlaceDrive)
	if len(enlace) < 10 || len(enlace) > 800 {
		return nil, fmt.Errorf("%w: el enlace de Drive no es válido", store.ErrValidation)
	}
	payload := map[string]any{
		"autor_id":    autorID,
		"tipo":        store.AdjuntoDrive,
		"nombre":      limpio,
		"mime":        "application/vnd.google-apps.folder",
		"tamano":      0,
		"url_externa": enlace,
	}
	q := url.Values{}
	q.Set("select", "*")
	var rows []dbAdjunto
	if err := s.client.REST(ctx, "POST", "chat_adjuntos", q, payload, "return=representation", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrValidation
	}
	return convertirAdjunto(&rows[0]), nil
}

// sanitizarNombre deja solo caracteres seguros para una ruta de Storage.
func sanitizarNombre(nombre string) string {
	limpio := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			return r
		case r == '.' || r == '-' || r == '_':
			return r
		default:
			return '-'
		}
	}, nombre)
	limpio = strings.Trim(limpio, "-")
	if len(limpio) > 80 {
		limpio = limpio[len(limpio)-80:]
	}
	if limpio == "" {
		limpio = "archivo"
	}
	return limpio
}

func (s *SupabaseStore) ObtenerAdjuntoChat(ctx context.Context, id int64) (*store.ChatAdjunto, error) {
	q := url.Values{}
	q.Set("id", fmt.Sprintf("eq.%d", id))
	q.Set("select", "*")
	var rows []dbAdjunto
	if err := s.client.REST(ctx, "GET", "chat_adjuntos", q, nil, "", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	return convertirAdjunto(&rows[0]), nil
}

func (s *SupabaseStore) LeerArchivoAdjunto(ctx context.Context, id int64) ([]byte, error) {
	a, err := s.ObtenerAdjuntoChat(ctx, id)
	if err != nil {
		return nil, err
	}
	if a.StoragePath == nil || *a.StoragePath == "" {
		return nil, store.ErrNotFound
	}
	return s.client.DownloadStorage(ctx, "chat", *a.StoragePath)
}

func (s *SupabaseStore) EnlazarAdjuntosMensaje(ctx context.Context, mensajeID int64, autorID string, ids []int64) ([]*store.ChatAdjunto, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	if len(ids) > 10 {
		return nil, fmt.Errorf("%w: máximo 10 adjuntos por mensaje", store.ErrValidation)
	}
	for _, id := range ids {
		a, err := s.ObtenerAdjuntoChat(ctx, id)
		if err != nil || a.AutorID != autorID || a.MensajeID != nil {
			return nil, fmt.Errorf("%w: adjunto no válido", store.ErrValidation)
		}
	}
	q := url.Values{}
	q.Set("id", "in.("+listaIDs(ids)+")")
	q.Set("select", "*")
	payload := map[string]any{"mensaje_id": mensajeID}
	var rows []dbAdjunto
	if err := s.client.REST(ctx, "PATCH", "chat_adjuntos", q, payload, "return=representation", &rows); err != nil {
		return nil, err
	}
	res := make([]*store.ChatAdjunto, 0, len(rows))
	for i := range rows {
		res = append(res, convertirAdjunto(&rows[i]))
	}
	return res, nil
}

func listaIDs(ids []int64) string {
	partes := make([]string, 0, len(ids))
	for _, id := range ids {
		partes = append(partes, strconv.FormatInt(id, 10))
	}
	return strings.Join(partes, ",")
}

// adjuntosPorMensajes trae los adjuntos de una lista de mensajes.
func (s *SupabaseStore) adjuntosPorMensajes(ctx context.Context, mensajes []*store.ChatMensaje) {
	if len(mensajes) == 0 {
		return
	}
	ids := make([]int64, 0, len(mensajes))
	for _, m := range mensajes {
		ids = append(ids, m.ID)
	}
	q := url.Values{}
	q.Set("mensaje_id", "in.("+listaIDs(ids)+")")
	q.Set("select", "*")
	q.Set("order", "id.asc")
	var rows []dbAdjunto
	if err := s.client.REST(ctx, "GET", "chat_adjuntos", q, nil, "", &rows); err != nil {
		return
	}
	porMensaje := make(map[int64][]*store.ChatAdjunto)
	for i := range rows {
		a := convertirAdjunto(&rows[i])
		if a.MensajeID != nil {
			porMensaje[*a.MensajeID] = append(porMensaje[*a.MensajeID], a)
		}
	}
	for _, m := range mensajes {
		if lista, ok := porMensaje[m.ID]; ok {
			m.Adjuntos = lista
		}
	}
}

// ---------- Asignaciones (admin) ----------

func (s *SupabaseStore) ListarAsignaciones(ctx context.Context, filtro store.FiltroAsignaciones) ([]*store.AsignacionResumen, error) {
	q := url.Values{}
	q.Set("select", "*,tipos_trabajo(*,roles(*)),clientes(*),piezas(id,nombre,etapa),asignado:perfiles!tareas_asignado_a_fkey(*),creador:perfiles!tareas_creado_por_fkey(*)")
	if filtro.PersonaID != nil {
		q.Set("asignado_a", "eq."+*filtro.PersonaID)
	}
	if filtro.Estado != nil {
		q.Set("estado", "eq."+string(*filtro.Estado))
	}
	if filtro.Desde != nil {
		q.Set("creada_en", "gte."+filtro.Desde.UTC().Format(time.RFC3339))
	}
	if filtro.Hasta != nil {
		q.Set("creada_en", "lte."+filtro.Hasta.UTC().Format(time.RFC3339))
	}
	q.Set("order", "greatest(creada_en,coalesce(resuelta_en,creada_en),coalesce(hecha_en,creada_en)).desc")
	if filtro.Limite > 0 {
		q.Set("limit", strconv.Itoa(filtro.Limite))
	}

	var rows []dbTarea
	if err := s.client.REST(ctx, "GET", "tareas", q, nil, "", &rows); err != nil {
		// El orden con greatest() puede no existir en PostgREST: se reintenta simple.
		q.Del("order")
		q.Set("order", "creada_en.desc")
		rows = nil
		if err2 := s.client.REST(ctx, "GET", "tareas", q, nil, "", &rows); err2 != nil {
			return nil, err2
		}
	}

	res := make([]*store.AsignacionResumen, 0, len(rows))
	for i := range rows {
		res = append(res, &store.AsignacionResumen{Tarea: convertirTarea(&rows[i])})
	}

	if filtro.VistasDe != "" && len(res) > 0 {
		ids := make([]int64, 0, len(res))
		for _, a := range res {
			ids = append(ids, a.Tarea.ID)
		}
		vq := url.Values{}
		vq.Set("perfil_id", "eq."+filtro.VistasDe)
		vq.Set("tarea_id", "in.("+listaIDs(ids)+")")
		vq.Set("select", "tarea_id,visto_en")
		var vistas []struct {
			TareaID int64  `json:"tarea_id"`
			VistoEn string `json:"visto_en"`
		}
		if err := s.client.REST(ctx, "GET", "asignaciones_vistas", vq, nil, "", &vistas); err == nil {
			porTarea := make(map[int64]time.Time, len(vistas))
			for _, v := range vistas {
				if t, err := time.Parse(time.RFC3339, v.VistoEn); err == nil {
					porTarea[v.TareaID] = t
				}
			}
			for _, a := range res {
				ultima, visto := porTarea[a.Tarea.ID]
				if !visto {
					a.Novedad = true
					continue
				}
				a.Novedad = movimientoTareaSupa(a.Tarea).After(ultima)
			}
		}
	}
	return res, nil
}

func movimientoTareaSupa(t *store.Tarea) time.Time {
	if t == nil {
		return time.Time{}
	}
	ultimo := t.CreadaEn
	if t.HechaEn != nil && t.HechaEn.After(ultimo) {
		ultimo = *t.HechaEn
	}
	if t.ResueltaEn != nil && t.ResueltaEn.After(ultimo) {
		ultimo = *t.ResueltaEn
	}
	return ultimo
}

func (s *SupabaseStore) MarcarAsignacionesVistas(ctx context.Context, perfilID string, ids []int64) error {
	if len(ids) == 0 {
		// Marcar todas: se toma la lista actual de asignaciones.
		lista, err := s.ListarAsignaciones(ctx, store.FiltroAsignaciones{Limite: 200})
		if err != nil {
			return err
		}
		for _, a := range lista {
			ids = append(ids, a.Tarea.ID)
		}
	}
	if len(ids) == 0 {
		return nil
	}
	ahora := time.Now().UTC().Format(time.RFC3339)
	payload := make([]map[string]any, 0, len(ids))
	for _, id := range ids {
		payload = append(payload, map[string]any{
			"perfil_id": perfilID,
			"tarea_id":  id,
			"visto_en":  ahora,
		})
	}
	q := url.Values{}
	q.Set("on_conflict", "perfil_id,tarea_id")
	return s.client.REST(ctx, "POST", "asignaciones_vistas", q, payload, "resolution=merge-duplicates,return=minimal", nil)
}

// ---------- Google Drive ----------

func (s *SupabaseStore) ObtenerConexionDrive(ctx context.Context) (*store.ConexionDrive, error) {
	q := url.Values{}
	q.Set("select", "*")
	q.Set("limit", "1")
	var rows []dbConexionDrive
	if err := s.client.REST(ctx, "GET", "drive_conexion", q, nil, "", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	t, _ := time.Parse(time.RFC3339, rows[0].ConectadoEn)
	return &store.ConexionDrive{
		Correo:            rows[0].Correo,
		RefreshToken:      rows[0].RefreshToken,
		CarpetaRaizID:     rows[0].CarpetaRaizID,
		CarpetaClientesID: rows[0].CarpetaClientesID,
		ConectadoEn:       t,
		ConectadoPor:      rows[0].ConectadoPor,
	}, nil
}

func (s *SupabaseStore) GuardarConexionDrive(ctx context.Context, c *store.ConexionDrive) error {
	if c == nil || strings.TrimSpace(c.RefreshToken) == "" {
		return store.ErrValidation
	}
	payload := map[string]any{
		"correo":              c.Correo,
		"refresh_token":       c.RefreshToken,
		"carpeta_raiz_id":     c.CarpetaRaizID,
		"carpeta_clientes_id": c.CarpetaClientesID,
		"conectado_en":        c.ConectadoEn.UTC().Format(time.RFC3339),
		"conectado_por":       c.ConectadoPor,
	}
	q := url.Values{}
	q.Set("on_conflict", "id")
	// Fila única con id = 1
	payload["id"] = 1
	return s.client.REST(ctx, "POST", "drive_conexion", q, payload, "resolution=merge-duplicates,return=minimal", nil)
}

func (s *SupabaseStore) EliminarConexionDrive(ctx context.Context) error {
	q := url.Values{}
	q.Set("id", "eq.1")
	return s.client.REST(ctx, "DELETE", "drive_conexion", q, nil, "return=minimal", nil)
}

func (s *SupabaseStore) ActualizarCarpetaDriveTarea(ctx context.Context, tareaID int64, carpetaID, carpetaURL string) (*store.Tarea, error) {
	q := url.Values{}
	q.Set("id", fmt.Sprintf("eq.%d", tareaID))
	payload := map[string]any{"drive_carpeta_id": nil, "drive_carpeta_url": nil}
	if strings.TrimSpace(carpetaID) != "" {
		payload["drive_carpeta_id"] = strings.TrimSpace(carpetaID)
		payload["drive_carpeta_url"] = strings.TrimSpace(carpetaURL)
	}
	var rows []dbTarea
	if err := s.client.REST(ctx, "PATCH", "tareas", q, payload, "return=representation", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	return s.ObtenerTareaPorID(ctx, tareaID)
}

// ---------- Piezas ----------

func (s *SupabaseStore) ListarPiezas(ctx context.Context, filtro store.FiltroPiezas) ([]*store.Pieza, error) {
	q := url.Values{}
	q.Set("select", "*,clientes(*),tareas(*,tipos_trabajo(*,roles(*)),clientes(*),piezas(id,nombre,etapa),asignado:perfiles!tareas_asignado_a_fkey(*),creador:perfiles!tareas_creado_por_fkey(*))")
	if filtro.ClienteID != nil {
		q.Set("cliente_id", fmt.Sprintf("eq.%d", *filtro.ClienteID))
	}
	if filtro.Etapa != nil {
		q.Set("etapa", "eq."+*filtro.Etapa)
	}
	q.Set("order", "actualizado_en.desc")

	var rows []dbPieza
	if err := s.client.REST(ctx, "GET", "piezas", q, nil, "", &rows); err != nil {
		return nil, err
	}
	res := make([]*store.Pieza, 0, len(rows))
	for i := range rows {
		res = append(res, convertirPieza(&rows[i]))
	}
	return res, nil
}

func (s *SupabaseStore) ObtenerPieza(ctx context.Context, id int) (*store.Pieza, error) {
	q := url.Values{}
	q.Set("id", fmt.Sprintf("eq.%d", id))
	q.Set("select", "*,clientes(*),tareas(*,tipos_trabajo(*,roles(*)),clientes(*),piezas(id,nombre,etapa),asignado:perfiles!tareas_asignado_a_fkey(*),creador:perfiles!tareas_creado_por_fkey(*))")
	var rows []dbPieza
	if err := s.client.REST(ctx, "GET", "piezas", q, nil, "", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	return convertirPieza(&rows[0]), nil
}

func (s *SupabaseStore) CrearPieza(ctx context.Context, p *store.Pieza) (*store.Pieza, error) {
	nombre := strings.TrimSpace(p.Nombre)
	if len([]rune(nombre)) < 2 || len([]rune(nombre)) > 120 {
		return nil, fmt.Errorf("%w: el nombre de la pieza debe tener entre 2 y 120 caracteres", store.ErrValidation)
	}
	etapa := p.Etapa
	if etapa == "" {
		etapa = "guion"
	}
	etapa, ok := store.EtapaPiezaValida(etapa)
	if !ok {
		return nil, fmt.Errorf("%w: la etapa no es válida", store.ErrValidation)
	}
	formato := strings.TrimSpace(p.Formato)
	if formato == "" {
		formato = "Reel"
	}
	payload := map[string]any{
		"cliente_id": p.ClienteID,
		"nombre":     nombre,
		"formato":    formato,
		"etapa":      etapa,
		"creado_por": p.CreadoPor,
	}
	q := url.Values{}
	q.Set("select", "id")
	var rows []struct {
		ID int `json:"id"`
	}
	if err := s.client.REST(ctx, "POST", "piezas", q, payload, "return=representation", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrValidation
	}
	return s.ObtenerPieza(ctx, rows[0].ID)
}

func (s *SupabaseStore) ActualizarPieza(ctx context.Context, id int, campos map[string]any) (*store.Pieza, error) {
	payload := map[string]any{}
	for k, v := range campos {
		switch k {
		case "nombre", "etapa", "formato", "fecha_publicacion", "notas", "drive_carpeta_url", "cliente_id":
			if k == "etapa" {
				if s, ok := v.(string); ok {
					etapa, valida := store.EtapaPiezaValida(s)
					if !valida {
						return nil, fmt.Errorf("%w: la etapa no es válida", store.ErrValidation)
					}
					payload[k] = etapa
					continue
				}
				return nil, store.ErrValidation
			}
			if k == "nombre" {
				str, ok := v.(string)
				if !ok {
					return nil, store.ErrValidation
				}
				str = strings.TrimSpace(str)
				if len([]rune(str)) < 2 || len([]rune(str)) > 120 {
					return nil, fmt.Errorf("%w: el nombre de la pieza debe tener entre 2 y 120 caracteres", store.ErrValidation)
				}
				payload[k] = str
				continue
			}
			payload[k] = v
		}
	}
	if len(payload) == 0 {
		return s.ObtenerPieza(ctx, id)
	}
	payload["actualizado_en"] = time.Now().UTC().Format(time.RFC3339)

	q := url.Values{}
	q.Set("id", fmt.Sprintf("eq.%d", id))
	if err := s.client.REST(ctx, "PATCH", "piezas", q, payload, "return=minimal", nil); err != nil {
		return nil, err
	}
	return s.ObtenerPieza(ctx, id)
}

// ---------- Cortes de pago ----------

func (s *SupabaseStore) ListarCortes(ctx context.Context) ([]*store.Corte, error) {
	q := url.Values{}
	q.Set("select", "*,corte_lineas(*,perfiles(*))")
	q.Set("order", "creado_en.desc")
	var rows []dbCorte
	if err := s.client.REST(ctx, "GET", "cortes", q, nil, "", &rows); err != nil {
		return nil, err
	}
	res := make([]*store.Corte, 0, len(rows))
	for i := range rows {
		res = append(res, convertirCorte(&rows[i]))
	}
	return res, nil
}

func (s *SupabaseStore) ObtenerCorte(ctx context.Context, id int64) (*store.Corte, error) {
	q := url.Values{}
	q.Set("id", fmt.Sprintf("eq.%d", id))
	q.Set("select", "*,corte_lineas(*,perfiles(*))")
	var rows []dbCorte
	if err := s.client.REST(ctx, "GET", "cortes", q, nil, "", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	return convertirCorte(&rows[0]), nil
}

func (s *SupabaseStore) CrearCorte(ctx context.Context, periodo, desde, hasta, creadoPor string) (*store.Corte, error) {
	d, err := time.ParseInLocation("2006-01-02", desde, time.Local)
	if err != nil {
		return nil, fmt.Errorf("%w: la fecha inicial no es válida", store.ErrValidation)
	}
	h, err := time.ParseInLocation("2006-01-02", hasta, time.Local)
	if err != nil {
		return nil, fmt.Errorf("%w: la fecha final no es válida", store.ErrValidation)
	}
	if h.Before(d) {
		return nil, fmt.Errorf("%w: la fecha final no puede ser anterior a la inicial", store.ErrValidation)
	}

	// Tareas aprobadas dentro del rango (resuelta_en del último día incluido).
	q := url.Values{}
	q.Set("estado", "eq.aceptada")
	q.Set("resuelta_en", "gte."+d.UTC().Format(time.RFC3339))
	q.Set("and", "(resuelta_en.lte."+time.Date(h.Year(), h.Month(), h.Day(), 23, 59, 59, 0, time.UTC).Format(time.RFC3339)+")")
	q.Set("select", "id,asignado_a,precio_congelado,resuelta_en")
	var tareas []struct {
		ID              int64  `json:"id"`
		AsignadoA       string `json:"asignado_a"`
		PrecioCongelado *int64 `json:"precio_congelado"`
	}
	if err := s.client.REST(ctx, "GET", "tareas", q, nil, "", &tareas); err != nil {
		return nil, err
	}
	if len(tareas) == 0 {
		return nil, fmt.Errorf("%w: no hay tareas aprobadas en ese periodo", store.ErrValidation)
	}

	porPersona := make(map[string]*store.LineaCorte)
	for _, t := range tareas {
		l, ok := porPersona[t.AsignadoA]
		if !ok {
			l = &store.LineaCorte{PerfilID: t.AsignadoA}
			porPersona[t.AsignadoA] = l
		}
		if t.PrecioCongelado != nil {
			l.Total += *t.PrecioCongelado
		}
		l.Tareas++
	}
	var total int64
	for _, l := range porPersona {
		total += l.Total
	}

	payload := map[string]any{
		"periodo":    periodo,
		"desde":      desde,
		"hasta":      hasta,
		"estado":     "cerrado",
		"total":      total,
		"creado_por": creadoPor,
	}
	qc := url.Values{}
	qc.Set("select", "id")
	var creado []struct {
		ID int64 `json:"id"`
	}
	if err := s.client.REST(ctx, "POST", "cortes", qc, payload, "return=representation", &creado); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") || strings.Contains(err.Error(), "23505") {
			return nil, fmt.Errorf("%w: ya existe un corte con ese mismo periodo", store.ErrConflict)
		}
		return nil, err
	}
	if len(creado) == 0 {
		return nil, store.ErrValidation
	}
	corteID := creado[0].ID

	lineas := make([]map[string]any, 0, len(porPersona))
	for perfilID, l := range porPersona {
		lineas = append(lineas, map[string]any{
			"corte_id":  corteID,
			"perfil_id": perfilID,
			"total":     l.Total,
			"tareas":    l.Tareas,
		})
	}
	if err := s.client.REST(ctx, "POST", "corte_lineas", url.Values{}, lineas, "return=minimal", nil); err != nil {
		return nil, err
	}
	return s.ObtenerCorte(ctx, corteID)
}

func (s *SupabaseStore) MarcarLineaCortePagada(ctx context.Context, corteID int64, perfilID, adminID string) (*store.Corte, error) {
	q := url.Values{}
	q.Set("corte_id", fmt.Sprintf("eq.%d", corteID))
	q.Set("perfil_id", "eq."+perfilID)
	payload := map[string]any{
		"pagada_en":  time.Now().UTC().Format(time.RFC3339),
		"pagada_por": adminID,
	}
	if err := s.client.REST(ctx, "PATCH", "corte_lineas", q, payload, "return=minimal", nil); err != nil {
		return nil, err
	}
	return s.ObtenerCorte(ctx, corteID)
}

// ---------- Avisos push ----------

func (s *SupabaseStore) GuardarSuscripcionPush(ctx context.Context, sp *store.SuscripcionPush) (*store.SuscripcionPush, error) {
	if sp == nil || strings.TrimSpace(sp.Endpoint) == "" || strings.TrimSpace(sp.P256DH) == "" || strings.TrimSpace(sp.Auth) == "" {
		return nil, fmt.Errorf("%w: la suscripción está incompleta", store.ErrValidation)
	}
	payload := map[string]any{
		"perfil_id":  sp.PerfilID,
		"endpoint":   sp.Endpoint,
		"p256dh":     sp.P256DH,
		"auth":       sp.Auth,
		"user_agent": sp.UserAgent,
	}
	q := url.Values{}
	q.Set("on_conflict", "endpoint")
	q.Set("select", "*")
	var rows []dbSuscripcionPush
	if err := s.client.REST(ctx, "POST", "push_suscripciones", q, payload, "resolution=merge-duplicates,return=representation", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, store.ErrValidation
	}
	r := rows[0]
	t, _ := time.Parse(time.RFC3339, r.CreadoEn)
	return &store.SuscripcionPush{
		ID:        r.ID,
		PerfilID:  r.PerfilID,
		Endpoint:  r.Endpoint,
		P256DH:    r.P256DH,
		Auth:      r.Auth,
		UserAgent: r.UserAgent,
		CreadoEn:  t,
	}, nil
}

func (s *SupabaseStore) EliminarSuscripcionPush(ctx context.Context, endpoint string) error {
	q := url.Values{}
	q.Set("endpoint", "eq."+endpoint)
	return s.client.REST(ctx, "DELETE", "push_suscripciones", q, nil, "return=minimal", nil)
}

func (s *SupabaseStore) ListarSuscripcionesPush(ctx context.Context, perfilID string) ([]*store.SuscripcionPush, error) {
	q := url.Values{}
	q.Set("select", "*")
	if perfilID != "" {
		q.Set("perfil_id", "eq."+perfilID)
	}
	var rows []dbSuscripcionPush
	if err := s.client.REST(ctx, "GET", "push_suscripciones", q, nil, "", &rows); err != nil {
		return nil, err
	}
	res := make([]*store.SuscripcionPush, 0, len(rows))
	for i := range rows {
		r := rows[i]
		t, _ := time.Parse(time.RFC3339, r.CreadoEn)
		res = append(res, &store.SuscripcionPush{
			ID: r.ID, PerfilID: r.PerfilID, Endpoint: r.Endpoint,
			P256DH: r.P256DH, Auth: r.Auth, UserAgent: r.UserAgent, CreadoEn: t,
		})
	}
	return res, nil
}

// RegistrarAvisoEnviado devuelve true la primera vez que se registra la clave.
func (s *SupabaseStore) RegistrarAvisoEnviado(ctx context.Context, clave string) (bool, error) {
	q := url.Values{}
	q.Set("select", "clave")
	q.Set("clave", "eq."+clave)
	var rows []struct {
		Clave string `json:"clave"`
	}
	if err := s.client.REST(ctx, "GET", "push_enviados", q, nil, "", &rows); err != nil {
		return false, err
	}
	if len(rows) > 0 {
		return false, nil
	}
	payload := map[string]any{"clave": clave}
	if err := s.client.REST(ctx, "POST", "push_enviados", url.Values{}, payload, "return=minimal", nil); err != nil {
		// Choque de clave única: otro proceso ya lo registró.
		if strings.Contains(strings.ToLower(err.Error()), "unique") || strings.Contains(err.Error(), "23505") {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (s *SupabaseStore) TareasPorVencer(ctx context.Context, fecha string) ([]*store.Tarea, error) {
	q := url.Values{}
	q.Set("select", "*,tipos_trabajo(*,roles(*)),clientes(*),piezas(id,nombre,etapa),asignado:perfiles!tareas_asignado_a_fkey(*),creador:perfiles!tareas_creado_por_fkey(*)")
	q.Set("fecha_limite", "eq."+fecha)
	q.Set("estado", "in.(pendiente,rechazada)")
	var rows []dbTarea
	if err := s.client.REST(ctx, "GET", "tareas", q, nil, "", &rows); err != nil {
		return nil, err
	}
	res := make([]*store.Tarea, 0, len(rows))
	for i := range rows {
		res = append(res, convertirTarea(&rows[i]))
	}
	return res, nil
}
