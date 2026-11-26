package httpapi

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode"

	"golang.org/x/text/unicode/norm"

	"rconceptsys/backend/internal/store"
)

const propiedadTareaDrive = "rconcept_tarea"

var errDriveDesconectado = errors.New("conecta el Drive del equipo en Gestión → Equipo")

func urlCarpetaDrive(id string) string { return "https://drive.google.com/drive/folders/" + id }

func (a *API) conexionDrive(ctx context.Context) (*store.ConexionDrive, error) {
	c, err := a.Store.ObtenerConexionDrive(ctx)
	if errors.Is(err, store.ErrNotFound) || (err == nil && (c == nil || c.RefreshToken == "")) {
		return nil, errDriveDesconectado
	}
	return c, err
}

// asegurarArbolDrive verifica la raíz configurada. Si aún no hay una, usa Mi unidad sin crear ramas.
func (a *API) asegurarArbolDrive(ctx context.Context, token string, c *store.ConexionDrive) error {
	id := c.CarpetaRaizID
	if id == "" {
		id = "root"
	}
	raiz, err := a.metadatosCarpeta(ctx, token, id)
	if err != nil {
		return err
	}
	if !raiz.carpetaActiva() {
		return errors.New("raíz de Drive no válida")
	}
	c.CarpetaRaizID, c.CarpetaClientesID = raiz.ID, raiz.ID
	return nil
}

func normalizarNombreCarpetaDrive(nombre string) string {
	return strings.Map(func(r rune) rune {
		if unicode.Is(unicode.Mn, r) {
			return -1
		}
		return r
	}, norm.NFD.String(strings.ToLower(strings.TrimSpace(nombre))))
}

func (a *API) asegurarClienteDrive(ctx context.Context, token, padre string, c *store.Cliente) (*store.Cliente, error) {
	if strings.TrimSpace(c.Nombre) == "" || padre == "" {
		return nil, errors.New("cliente o raíz sin configurar")
	}
	nombre := normalizarNombreCarpetaDrive(c.Nombre)
	actual := textoDrive(c.DriveCarpetaID)
	q := url.Values{
		"q":      {"trashed = false and mimeType = '" + driveCarpetaMime + "' and '" + escaparQueryDrive(padre) + "' in parents"},
		"fields": {"nextPageToken,files(id,name)"}, "orderBy": {"createdTime asc"}, "pageSize": {"1000"},
		"supportsAllDrives": {"true"}, "includeItemsFromAllDrives": {"true"},
	}
	candidata := ""
	for {
		var listado struct {
			Files     []struct{ ID, Name string } `json:"files"`
			Siguiente string                      `json:"nextPageToken"`
		}
		if err := a.pedirDrive(ctx, token, driveAPIBase+"/files?"+q.Encode(), &listado); err != nil {
			return nil, err
		}
		for _, f := range listado.Files {
			if f.ID == "" || normalizarNombreCarpetaDrive(f.Name) != nombre {
				continue
			}
			if f.ID == actual {
				return a.guardarCarpetaCliente(ctx, c, actual)
			}
			if candidata == "" {
				candidata = f.ID
			}
		}
		if listado.Siguiente == "" || (candidata != "" && actual == "") {
			break
		}
		q.Set("pageToken", listado.Siguiente)
	}
	if candidata == "" {
		carpeta, err := a.crearCarpetaDrive(ctx, token, strings.TrimSpace(c.Nombre), padre, nil)
		if err != nil {
			return nil, err
		}
		candidata = carpeta.ID
	}
	return a.guardarCarpetaCliente(ctx, c, candidata)
}

func (a *API) guardarCarpetaCliente(ctx context.Context, c *store.Cliente, carpeta string) (*store.Cliente, error) {
	if !driveIDValido(carpeta) {
		return nil, errors.New("identificador de carpeta no válido")
	}
	misma := textoDrive(c.DriveCarpetaID) == carpeta
	if misma && enlaceReferenciaDriveValido(textoDrive(c.DriveURL)) {
		return c, nil
	}
	campos := map[string]any{"drive_carpeta_id": carpeta, "drive_url": urlCarpetaDrive(carpeta)}
	if !misma {
		// Los IDs previos pertenecían a otra carpeta; no se altera ningún archivo en Drive.
		campos["material_carpeta_id"], campos["producto_carpeta_id"] = nil, nil
	}
	return a.Store.ActualizarCliente(ctx, c.ID, campos)
}

func textoDrive(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// contextoArbolDrive se llama bajo DriveMu y solo completa una estructura que no esté preparada.
func (a *API) contextoArbolDrive(ctx context.Context) (*store.ConexionDrive, string, error) {
	c, err := a.conexionDrive(ctx)
	if err != nil {
		return nil, "", err
	}
	tok, err := a.refrescarTokenDrive(ctx, c)
	if err != nil {
		return nil, "", err
	}
	if c.CarpetaRaizID == "" || c.CarpetaClientesID != c.CarpetaRaizID {
		if err := a.asegurarArbolDrive(ctx, tok.AccessToken, c); err != nil {
			return nil, "", err
		}
		if err := a.Store.GuardarConexionDrive(ctx, c); err != nil {
			return nil, "", err
		}
	}
	return c, tok.AccessToken, nil
}

func (a *API) prepararAltaClienteDrive(ctx context.Context, cliente *store.Cliente) (*store.Cliente, error) {
	a.F5.DriveMu.Lock()
	defer a.F5.DriveMu.Unlock()
	c, tok, err := a.contextoArbolDrive(ctx)
	if err != nil {
		return nil, err
	}
	return a.asegurarClienteDrive(ctx, tok, c.CarpetaClientesID, cliente)
}

// organizarClientesDrive anota fallos por ficha: volver a organizar no duplica carpetas.
func (a *API) organizarClientesDrive(ctx context.Context, token, padre string) (int, []int, error) {
	clientes, err := a.Store.ListarClientes(ctx, false)
	if err != nil {
		return 0, nil, err
	}
	var listos int
	pendientes := []int{}
	for _, c := range clientes {
		if _, err := a.asegurarClienteDrive(ctx, token, padre, c); err != nil {
			pendientes = append(pendientes, c.ID)
		} else {
			listos++
		}
	}
	return listos, pendientes, nil
}

func (a *API) handleAdminOrganizarDrive(w http.ResponseWriter, r *http.Request) {
	a.F5.DriveMu.Lock()
	defer a.F5.DriveMu.Unlock()
	ctx := r.Context()
	c, err := a.conexionDrive(ctx)
	if err != nil {
		responderFalloDrive(w, err)
		return
	}
	token, err := a.refrescarTokenDrive(ctx, c)
	if err != nil {
		responderFalloDrive(w, err)
		return
	}
	if err := a.asegurarArbolDrive(ctx, token.AccessToken, c); err != nil {
		responderFalloDrive(w, err)
		return
	}
	if err := a.Store.GuardarConexionDrive(ctx, c); err != nil {
		responderFalloDrive(w, err)
		return
	}
	listos, pendientes, err := a.organizarClientesDrive(ctx, token.AccessToken, c.CarpetaClientesID)
	if err != nil {
		responderFalloDrive(w, err)
		return
	}
	ResponderJSON(w, http.StatusOK, map[string]any{"clientes_listos": listos, "clientes_pendientes": pendientes})
}

func responderFalloDrive(w http.ResponseWriter, err error) {
	if errors.Is(err, errDriveDesconectado) {
		ResponderError(w, http.StatusConflict, "drive_no_conectado", "Conecta el Drive del equipo en Gestión → Equipo.")
		return
	}
	ResponderError(w, http.StatusBadGateway, "drive_error", "No pudimos preparar Google Drive. Intenta otra vez desde Gestión → Equipo.")
}

func nombreCarpetaTrabajo(t *store.Tarea) string {
	fecha := textoDrive(t.FechaLimite)
	if _, err := time.Parse("2006-01-02", fecha); err != nil {
		creada := t.CreadaEn
		if creada.IsZero() {
			creada = time.Now()
		}
		fecha = creada.In(store.LocBogota).Format("2006-01-02")
	}
	tipo, descripcion := "Trabajo", strings.TrimSpace(textoDrive(t.Descripcion))
	if t.Tipo != nil {
		tipo = t.Tipo.Nombre
	}
	if descripcion == "" {
		descripcion = t.Titulo
	}
	return fecha + " " + tipo + " · " + recortarRunasDrive(strings.Join(strings.Fields(descripcion), " "), 80)
}

func recortarRunasDrive(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

func (a *API) padreDeTrabajoDrive(ctx context.Context, c *store.ConexionDrive, token string, clienteID *int) (string, error) {
	if clienteID == nil {
		return c.CarpetaRaizID, nil
	}
	cliente, err := a.Store.ObtenerClientePorID(ctx, *clienteID)
	if err != nil {
		return "", err
	}
	// Verifica que el cliente siga en la raíz del equipo antes de crear una carpeta operativa.
	actual, err := a.asegurarClienteDrive(ctx, token, c.CarpetaClientesID, cliente)
	if err != nil {
		return "", err
	}
	return textoDrive(actual.DriveCarpetaID), nil
}

func (a *API) crearCarpetaDeTrabajo(ctx context.Context, t *store.Tarea) (*DriveArchivo, error) {
	a.F5.DriveMu.Lock()
	defer a.F5.DriveMu.Unlock()
	c, tok, err := a.contextoArbolDrive(ctx)
	if err != nil {
		return nil, err
	}
	padre, err := a.padreDeTrabajoDrive(ctx, c, tok, t.ClienteID)
	if err != nil {
		return nil, err
	}
	// La identidad de cada trabajo es su ID: dos tareas con el mismo título no comparten material.
	f, err := a.asegurarCarpetaMarcada(ctx, tok, nombreCarpetaTrabajo(t), padre, strconv.FormatInt(t.ID, 10))
	if err != nil {
		return nil, err
	}
	if err := a.asegurarSubcarpetasTrabajo(ctx, tok, f.ID); err != nil {
		return nil, err
	}
	return f, nil
}

func (a *API) asegurarSubcarpetasTrabajo(ctx context.Context, tok, padre string) error {
	for _, nombre := range []string{"Material", "Entregas"} {
		if _, err := a.asegurarSubcarpeta(ctx, tok, nombre, padre); err != nil {
			return err
		}
	}
	return nil
}

func (a *API) asegurarSubcarpeta(ctx context.Context, token, nombre, padre string) (*DriveArchivo, error) {
	return a.asegurarCarpetaMarcada(ctx, token, nombre, padre, "")
}

func (a *API) asegurarCarpetaMarcada(ctx context.Context, token, nombre, padre, tarea string) (*DriveArchivo, error) {
	criterio := "name = '" + escaparQueryDrive(nombre) + "'"
	if tarea != "" {
		criterio = "appProperties has { key='" + propiedadTareaDrive + "' and value='" + tarea + "' }"
	}
	q := url.Values{"q": {"trashed = false and mimeType = '" + driveCarpetaMime + "' and " + criterio + " and '" + escaparQueryDrive(padre) + "' in parents"},
		"fields": {"nextPageToken,files(id,name)"}, "orderBy": {"createdTime asc"}}
	for {
		var lista struct {
			Files     []struct{ ID, Name string } `json:"files"`
			Siguiente string                      `json:"nextPageToken"`
		}
		if err := a.pedirDrive(ctx, token, driveAPIBase+"/files?"+q.Encode(), &lista); err != nil {
			return nil, err
		}
		if len(lista.Files) > 0 {
			f := lista.Files[0]
			return &DriveArchivo{ID: f.ID, Nombre: f.Name, Enlace: urlCarpetaDrive(f.ID), EsCarpeta: true}, nil
		}
		if lista.Siguiente == "" {
			break
		}
		q.Set("pageToken", lista.Siguiente)
	}
	props := map[string]string(nil)
	if tarea != "" {
		props = map[string]string{propiedadTareaDrive: tarea}
	}
	return a.crearCarpetaDrive(ctx, token, nombre, padre, props)
}

type metadatosCarpetaDrive struct {
	ID          string            `json:"id"`
	Nombre      string            `json:"name"`
	Mime        string            `json:"mimeType"`
	EnPapelera  bool              `json:"trashed"`
	Padres      []string          `json:"parents"`
	DriveID     string            `json:"driveId"`
	WebViewLink string            `json:"webViewLink"`
	Propiedades map[string]string `json:"appProperties"`
	Propia      bool              `json:"ownedByMe"`
	DeLaApp     bool              `json:"isAppAuthorized"`
}

func (a *API) metadatosCarpeta(ctx context.Context, token, id string) (metadatosCarpetaDrive, error) {
	var f metadatosCarpetaDrive
	err := a.pedirDrive(ctx, token, driveAPIBase+"/files/"+url.PathEscape(id)+"?supportsAllDrives=true&fields=id,name,mimeType,trashed,parents,driveId,webViewLink,appProperties,ownedByMe,isAppAuthorized", &f)
	return f, err
}

func (f metadatosCarpetaDrive) carpetaActiva() bool {
	return f.ID != "" && f.Mime == driveCarpetaMime && !f.EnPapelera
}

func (f metadatosCarpetaDrive) carpetaEn(padre string) bool {
	return padre != "" && f.carpetaActiva() && len(f.Padres) == 1 && f.Padres[0] == padre
}

type movimientoDrive struct {
	TareaID   int64  `json:"tarea_id"`
	CarpetaID string `json:"carpeta_id"`
	Nombre    string `json:"nombre"`
	DestinoID string `json:"destino_id"`
	Destino   string `json:"destino"`
}

type planDrive struct {
	Movimientos []movimientoDrive `json:"movimientos"`
	Omitidas    []int64           `json:"omitidas"`
}

// planearMovimientosDrive es solo lectura, incluso si la estructura aún no existe.
func (a *API) planearMovimientosDrive(ctx context.Context, token string, c *store.ConexionDrive) (planDrive, string, error) {
	plan := planDrive{Movimientos: []movimientoDrive{}, Omitidas: []int64{}}
	unidad, err := a.metadatosCarpeta(ctx, token, "root")
	if err != nil {
		return plan, "", err
	}
	if unidad.ID == "" || c.CarpetaRaizID == "" || c.CarpetaClientesID == "" {
		return plan, "", errors.New("estructura sin organizar")
	}
	raiz, err := a.metadatosCarpeta(ctx, token, c.CarpetaRaizID)
	if err != nil || !raiz.carpetaActiva() {
		return plan, "", errors.New("raíz no válida")
	}
	clientes := raiz
	if c.CarpetaClientesID != c.CarpetaRaizID {
		clientes, err = a.metadatosCarpeta(ctx, token, c.CarpetaClientesID)
		if err != nil || clientes.Nombre != "Clientes" || !clientes.carpetaEn(raiz.ID) {
			return plan, "", errors.New("rama Clientes no válida")
		}
	}
	tareas, err := a.Store.ListarTareas(ctx, store.FiltroTareas{ConCarpetaDrive: true})
	if err != nil {
		return plan, "", err
	}
	compartidas := map[string]int{}
	for _, t := range tareas {
		compartidas[textoDrive(t.DriveCarpetaID)]++
	}
	destinos := map[int]metadatosCarpetaDrive{}
	for _, t := range tareas {
		id := textoDrive(t.DriveCarpetaID)
		if !driveIDValido(id) || compartidas[id] != 1 {
			plan.Omitidas = append(plan.Omitidas, t.ID)
			continue
		}
		f, err := a.metadatosCarpeta(ctx, token, id)
		if err != nil {
			plan.Omitidas = append(plan.Omitidas, t.ID)
			continue
		}
		if !f.carpetaEn(unidad.ID) {
			continue
		}
		if !carpetaDeTareaRegistrada(t, f) {
			plan.Omitidas = append(plan.Omitidas, t.ID)
			continue
		}
		destino, ruta := raiz, raiz.Nombre
		if t.ClienteID != nil {
			var ok bool
			destino, ok = destinos[*t.ClienteID]
			if !ok && t.Cliente != nil && driveIDValido(textoDrive(t.Cliente.DriveCarpetaID)) {
				destino, _ = a.metadatosCarpeta(ctx, token, *t.Cliente.DriveCarpetaID)
				destinos[*t.ClienteID] = destino
			}
			if t.Cliente == nil || normalizarNombreCarpetaDrive(destino.Nombre) != normalizarNombreCarpetaDrive(t.Cliente.Nombre) || !destino.carpetaEn(clientes.ID) {
				plan.Omitidas = append(plan.Omitidas, t.ID)
				continue
			}
			if clientes.ID != raiz.ID {
				ruta += "/" + clientes.Nombre
			}
			ruta += "/" + destino.Nombre
		}
		if destino.ID == unidad.ID || destino.ID == f.ID {
			continue
		}
		plan.Movimientos = append(plan.Movimientos, movimientoDrive{t.ID, id, f.Nombre, destino.ID, ruta})
	}
	return plan, unidad.ID, nil
}

func carpetaDeTareaRegistrada(t *store.Tarea, f metadatosCarpetaDrive) bool {
	if t == nil || !f.Propia || f.ID != textoDrive(t.DriveCarpetaID) {
		return false
	}
	if m := f.Propiedades[propiedadTareaDrive]; m != "" {
		return m == strconv.FormatInt(t.ID, 10)
	}
	// F5 no grababa appProperties. Solo admitir el patrón exacto del creador histórico,
	// con ID/URL registrados y atribución de la app en Google; no buscar por nombre en Mi unidad.
	return f.DeLaApp && f.Nombre == fmt.Sprintf("T-%d %s", t.ID, recortar(t.Titulo, 60)) && textoDrive(t.DriveCarpetaURL) == urlCarpetaDrive(f.ID)
}

func (a *API) moverCarpetaDrive(ctx context.Context, token, raiz string, m movimientoDrive) error {
	q := url.Values{"addParents": {m.DestinoID}, "removeParents": {raiz}, "fields": {"id,parents"}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPatch, driveAPIBase+"/files/"+url.PathEscape(m.CarpetaID)+"?"+q.Encode(), bytes.NewBufferString("{}"))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res, err := a.F5.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("Drive mover carpeta: HTTP %d", res.StatusCode)
	}
	return nil
}

func (a *API) handleAdminMigrarCarpetasDrive(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Huella string `json:"huella"`
	}
	if leerJSONCuerpo(r, 2048, &req) != nil {
		ResponderError(w, 400, "datos_invalidos", "Simula primero los movimientos de Drive.")
		return
	}
	a.F5.DriveMu.Lock()
	defer a.F5.DriveMu.Unlock()
	ctx := r.Context()
	c, err := a.conexionDrive(ctx)
	if err != nil {
		responderFalloDrive(w, err)
		return
	}
	if c.CarpetaClientesID == "" {
		ResponderError(w, 409, "drive_sin_organizar", "Organiza primero el Drive del equipo.")
		return
	}
	tok, err := a.refrescarTokenDrive(ctx, c)
	if err != nil {
		responderFalloDrive(w, err)
		return
	}
	plan, raiz, err := a.planearMovimientosDrive(ctx, tok.AccessToken, c)
	if err != nil {
		responderFalloDrive(w, err)
		return
	}
	serial, _ := json.Marshal(plan)
	adminID := a.usuarioActual(r).ID
	// Ligada al admin, a la conexión y al plan: no basta con calcular el hash del JSON.
	mac := hmac.New(sha256.New, []byte(c.RefreshToken))
	_, _ = fmt.Fprintf(mac, "f8-plan\n%s\n%s\n%s\n%s", adminID, c.ConectadoEn.UTC().Format(time.RFC3339Nano), raiz, serial)
	huella := hex.EncodeToString(mac.Sum(nil))
	if req.Huella == "" {
		ResponderJSON(w, 200, map[string]any{"huella": huella, "movimientos": plan.Movimientos, "omitidas": plan.Omitidas})
		return
	}
	if !hmac.Equal([]byte(req.Huella), []byte(huella)) {
		ResponderError(w, 409, "plan_cambio", "El plan cambió. Simula otra vez antes de mover las carpetas.")
		return
	}
	movidas, fallidas := []movimientoDrive{}, []movimientoDrive{}
	for _, m := range plan.Movimientos {
		t, err := a.Store.ObtenerTareaPorID(ctx, m.TareaID)
		f, fErr := a.metadatosCarpeta(ctx, tok.AccessToken, m.CarpetaID)
		if err != nil || fErr != nil || !f.carpetaEn(raiz) || !carpetaDeTareaRegistrada(t, f) {
			fallidas = append(fallidas, m)
			continue
		}
		d, dErr := a.metadatosCarpeta(ctx, tok.AccessToken, m.DestinoID)
		if dErr != nil || (t.ClienteID == nil && (d.ID != c.CarpetaRaizID || !d.carpetaActiva())) ||
			(t.ClienteID != nil && (t.Cliente == nil || textoDrive(t.Cliente.DriveCarpetaID) != m.DestinoID || normalizarNombreCarpetaDrive(d.Nombre) != normalizarNombreCarpetaDrive(t.Cliente.Nombre) || !d.carpetaEn(c.CarpetaClientesID))) {
			fallidas = append(fallidas, m)
			continue
		}
		if err := a.moverCarpetaDrive(ctx, tok.AccessToken, raiz, m); err != nil {
			fallidas = append(fallidas, m)
			continue
		}
		log.Printf("drive F8: tarea %d movida por admin %s", m.TareaID, adminID)
		movidas = append(movidas, m)
	}
	ResponderJSON(w, 200, map[string]any{"movidas": movidas, "fallidas": fallidas})
}
