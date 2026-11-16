package httpapi

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"rconceptsys/backend/internal/store"
)

// ==========================================================
// F5: conector de Google Drive (una sola cuenta del equipo).
//
// Flujo: un admin abre Gestión → "Conectar Drive", se genera un
// state de un solo uso, Google devuelve el código a
// /api/drive/callback, el backend cambia el código por un refresh
// token y lo guarda en public.drive_conexion (solo service_role).
// Con ese token se crean subcarpetas por tarea y se copian las
// entregas. Si faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET la
// pantalla muestra "falta configurar" y no se inventa nada.
// ==========================================================

const (
	driveScope       = "https://www.googleapis.com/auth/drive"
	driveAuthURL     = "https://accounts.google.com/o/oauth2/v2/auth"
	driveTokenURL    = "https://oauth2.googleapis.com/token"
	driveAPIBase     = "https://www.googleapis.com/drive/v3"
	driveUploadBase  = "https://www.googleapis.com/upload/drive/v3"
	driveCarpetaMime = "application/vnd.google-apps.folder"
)

// DriveArchivo es un archivo o carpeta del Drive del equipo.
type DriveArchivo struct {
	ID           string `json:"id"`
	Nombre       string `json:"nombre"`
	Mime         string `json:"mime"`
	Icono        string `json:"icono,omitempty"`
	Miniatura    string `json:"miniatura,omitempty"`
	Enlace       string `json:"enlace,omitempty"`
	Tamano       int64  `json:"tamano,omitempty"`
	ModificadoEn string `json:"modificado_en,omitempty"`
	EsCarpeta    bool   `json:"es_carpeta"`
}

// redirectURI calcula la URL de retorno de Google.
func (a *API) redirectURI(r *http.Request) string {
	if u := strings.TrimSpace(a.F5.Drive.RedirectURI); u != "" {
		return u
	}
	esquema := "https"
	if r.TLS == nil && r.Header.Get("X-Forwarded-Proto") != "https" {
		esquema = "http"
	}
	return fmt.Sprintf("%s://%s/api/drive/callback", esquema, r.Host)
}

// GET /api/admin/drive
func (a *API) handleAdminGetDrive(w http.ResponseWriter, r *http.Request) {
	resp := map[string]any{
		"configurado":     a.F5.Drive.Configurado(),
		"conectado":       false,
		"correo":          "",
		"carpeta_raiz_id": "",
		"conectado_en":    nil,
	}
	conexion, err := a.Store.ObtenerConexionDrive(r.Context())
	if err == nil && conexion != nil {
		resp["conectado"] = true
		resp["correo"] = conexion.Correo
		resp["carpeta_raiz_id"] = conexion.CarpetaRaizID
		resp["conectado_en"] = conexion.ConectadoEn
	}
	ResponderJSON(w, http.StatusOK, resp)
}

// POST /api/admin/drive/conectar
func (a *API) handleAdminPostDriveConectar(w http.ResponseWriter, r *http.Request) {
	yo := a.usuarioActual(r)
	if !a.F5.Drive.Configurado() {
		ResponderError(w, http.StatusBadRequest, "drive_no_configurado",
			"Faltan las credenciales de Google Cloud. Pídele a Juan que cree GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.")
		return
	}

	estado := make([]byte, 24)
	if _, err := rand.Read(estado); err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_estado", "No se pudo iniciar la conexión con Google.")
		return
	}
	state := hex.EncodeToString(estado)
	a.F5.GuardarEstadoOAuth(state, yo.ID)

	q := url.Values{}
	q.Set("client_id", a.F5.Drive.ClientID)
	q.Set("redirect_uri", a.redirectURI(r))
	q.Set("response_type", "code")
	q.Set("scope", driveScope)
	q.Set("access_type", "offline")
	q.Set("prompt", "consent")
	q.Set("include_granted_scopes", "true")
	q.Set("state", state)

	ResponderJSON(w, http.StatusOK, map[string]string{
		"url": driveAuthURL + "?" + q.Encode(),
	})
}

// GET /api/drive/callback?code=&state=
func (a *API) handleDriveCallback(w http.ResponseWriter, r *http.Request) {
	state := strings.TrimSpace(r.URL.Query().Get("state"))
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	errorGoogle := strings.TrimSpace(r.URL.Query().Get("error"))

	if errorGoogle != "" {
		http.Redirect(w, r, "/admin?drive=cancelado", http.StatusFound)
		return
	}
	adminID, ok := a.F5.ConsumirEstadoOAuth(state)
	if !ok || code == "" {
		http.Redirect(w, r, "/admin?drive=estado_invalido", http.StatusFound)
		return
	}
	if !a.F5.Drive.Configurado() {
		http.Redirect(w, r, "/admin?drive=sin_configurar", http.StatusFound)
		return
	}

	token, err := a.intercambiarCodigoDrive(r.Context(), code, a.redirectURI(r))
	if err != nil || strings.TrimSpace(token.RefreshToken) == "" {
		http.Redirect(w, r, "/admin?drive=error", http.StatusFound)
		return
	}

	correo := a.correoDrive(r.Context(), token.AccessToken)

	conexion := &store.ConexionDrive{
		Correo:        correo,
		RefreshToken:  token.RefreshToken,
		CarpetaRaizID: strings.TrimSpace(a.F5.Drive.CarpetaRaiz),
		ConectadoEn:   time.Now(),
		ConectadoPor:  &adminID,
	}
	if err := a.Store.GuardarConexionDrive(r.Context(), conexion); err != nil {
		http.Redirect(w, r, "/admin?drive=error_guardar", http.StatusFound)
		return
	}
	http.Redirect(w, r, "/admin?drive=conectado", http.StatusFound)
}

// POST /api/admin/drive/desconectar
func (a *API) handleAdminPostDriveDesconectar(w http.ResponseWriter, r *http.Request) {
	if err := a.Store.EliminarConexionDrive(r.Context()); err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_desconectar", "No se pudo desconectar Drive.")
		return
	}
	ResponderJSON(w, http.StatusOK, map[string]string{"mensaje": "Drive desconectado."})
}

// GET /api/admin/drive/archivos?carpeta=&buscar=
func (a *API) handleAdminGetDriveArchivos(w http.ResponseWriter, r *http.Request) {
	token, err := a.tokenDrive(r.Context())
	if err != nil {
		ResponderError(w, http.StatusBadRequest, "drive_no_conectado", "Primero conecta el Drive del equipo desde Gestión.")
		return
	}

	carpeta := strings.TrimSpace(r.URL.Query().Get("carpeta"))
	buscar := strings.TrimSpace(r.URL.Query().Get("buscar"))

	partes := []string{"trashed = false"}
	if buscar != "" {
		partes = append(partes, fmt.Sprintf("name contains '%s'", escaparQueryDrive(buscar)))
	} else if carpeta != "" {
		partes = append(partes, fmt.Sprintf("'%s' in parents", escaparQueryDrive(carpeta)))
	} else {
		partes = append(partes, "mimeType = '"+driveCarpetaMime+"'")
	}

	q := url.Values{}
	q.Set("q", strings.Join(partes, " and "))
	q.Set("fields", "files(id,name,mimeType,size,iconLink,thumbnailLink,webViewLink,modifiedTime)")
	q.Set("pageSize", "60")
	q.Set("orderBy", "modifiedTime desc")

	var resp struct {
		Files []struct {
			ID            string `json:"id"`
			Name          string `json:"name"`
			MimeType      string `json:"mimeType"`
			Size          string `json:"size"`
			IconLink      string `json:"iconLink"`
			ThumbnailLink string `json:"thumbnailLink"`
			WebViewLink   string `json:"webViewLink"`
			ModifiedTime  string `json:"modifiedTime"`
		} `json:"files"`
	}
	if err := a.pedirDrive(r.Context(), token, driveAPIBase+"/files?"+q.Encode(), &resp); err != nil {
		ResponderError(w, http.StatusBadGateway, "drive_error", "Google no respondió. Inténtalo de nuevo en un momento.")
		return
	}

	res := make([]DriveArchivo, 0, len(resp.Files))
	for _, f := range resp.Files {
		var tam int64
		if f.Size != "" {
			_, _ = fmt.Sscan(f.Size, &tam)
		}
		res = append(res, DriveArchivo{
			ID:           f.ID,
			Nombre:       f.Name,
			Mime:         f.MimeType,
			Icono:        f.IconLink,
			Miniatura:    f.ThumbnailLink,
			Enlace:       f.WebViewLink,
			Tamano:       tam,
			ModificadoEn: f.ModifiedTime,
			EsCarpeta:    f.MimeType == driveCarpetaMime,
		})
	}
	ResponderJSON(w, http.StatusOK, res)
}

// POST /api/admin/tareas/{id}/drive-carpeta  {crear: true} o {carpeta_id, enlace}
func (a *API) handleAdminPostTareaDriveCarpeta(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		ResponderError(w, http.StatusBadRequest, "id_invalido", "ID de tarea inválido.")
		return
	}
	var req struct {
		CarpetaID string `json:"carpeta_id"`
		Enlace    string `json:"enlace"`
		Crear     bool   `json:"crear"`
	}
	_ = leerJSONCuerpo(r, 1024*8, &req)

	tarea, err := a.Store.ObtenerTareaPorID(r.Context(), id)
	if err == store.ErrNotFound {
		ResponderError(w, http.StatusNotFound, "tarea_no_encontrada", "La tarea no existe.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_tarea", "No se pudo consultar la tarea.")
		return
	}

	carpetaID := strings.TrimSpace(req.CarpetaID)
	enlace := strings.TrimSpace(req.Enlace)

	if req.Crear {
		token, err := a.tokenDrive(r.Context())
		if err != nil {
			ResponderError(w, http.StatusBadRequest, "drive_no_conectado", "Primero conecta el Drive del equipo desde Gestión.")
			return
		}
		nombre := fmt.Sprintf("T-%d %s", tarea.ID, recortar(tarea.Titulo, 60))
		archivo, err := a.crearCarpetaDrive(r.Context(), token, nombre, strings.TrimSpace(a.F5.Drive.CarpetaRaiz))
		if err != nil {
			ResponderError(w, http.StatusBadGateway, "drive_error", "No se pudo crear la carpeta en Drive.")
			return
		}
		carpetaID = archivo.ID
		enlace = archivo.Enlace
	} else if carpetaID == "" {
		if enlace == "" && tarea.DriveCarpetaID != nil {
			carpetaID = *tarea.DriveCarpetaID
		}
		if carpetaID == "" && enlace != "" {
			carpetaID = idDeEnlaceDrive(enlace)
		}
		if carpetaID == "" {
			ResponderError(w, http.StatusBadRequest, "carpeta_requerida", "Indica la carpeta de Drive o pide crearla.")
			return
		}
		if enlace == "" {
			enlace = "https://drive.google.com/drive/folders/" + carpetaID
		}
	}

	actualizada, err := a.Store.ActualizarCarpetaDriveTarea(r.Context(), id, carpetaID, enlace)
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_carpeta", "No se pudo guardar la carpeta de la tarea.")
		return
	}
	ResponderJSON(w, http.StatusOK, actualizada)
}

// ---------- Utilidades de Google ----------

type tokenDriveResp struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	Scope        string `json:"scope"`
}

func (a *API) intercambiarCodigoDrive(ctx context.Context, code, redirect string) (*tokenDriveResp, error) {
	form := url.Values{}
	form.Set("code", code)
	form.Set("client_id", a.F5.Drive.ClientID)
	form.Set("client_secret", a.F5.Drive.ClientSecret)
	form.Set("redirect_uri", redirect)
	form.Set("grant_type", "authorization_code")

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, driveTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := a.F5.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google token: HTTP %d", res.StatusCode)
	}
	var tok tokenDriveResp
	if err := json.NewDecoder(res.Body).Decode(&tok); err != nil {
		return nil, err
	}
	return &tok, nil
}

// tokenDrive renueva el access token con el refresh token guardado.
func (a *API) tokenDrive(ctx context.Context) (string, error) {
	conexion, err := a.Store.ObtenerConexionDrive(ctx)
	if err != nil || conexion == nil || conexion.RefreshToken == "" {
		return "", fmt.Errorf("drive no conectado")
	}
	if !a.F5.Drive.Configurado() {
		return "", fmt.Errorf("drive sin credenciales")
	}
	form := url.Values{}
	form.Set("client_id", a.F5.Drive.ClientID)
	form.Set("client_secret", a.F5.Drive.ClientSecret)
	form.Set("refresh_token", conexion.RefreshToken)
	form.Set("grant_type", "refresh_token")

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, driveTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := a.F5.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("google refresh: HTTP %d", res.StatusCode)
	}
	var tok tokenDriveResp
	if err := json.NewDecoder(res.Body).Decode(&tok); err != nil {
		return "", err
	}
	return tok.AccessToken, nil
}

func (a *API) correoDrive(ctx context.Context, token string) string {
	q := url.Values{}
	q.Set("fields", "emailAddress")
	var resp struct {
		EmailAddress string `json:"emailAddress"`
	}
	if err := a.pedirDrive(ctx, token, driveAPIBase+"/about?"+q.Encode(), &resp); err != nil {
		return ""
	}
	return resp.EmailAddress
}

func (a *API) pedirDrive(ctx context.Context, token, urlCompleta string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, urlCompleta, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := a.F5.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(res.Body)
		return fmt.Errorf("drive HTTP %d: %s", res.StatusCode, recortar(string(b), 200))
	}
	return json.NewDecoder(res.Body).Decode(out)
}

func (a *API) crearCarpetaDrive(ctx context.Context, token, nombre, padreID string) (*DriveArchivo, error) {
	cuerpo := map[string]any{
		"name":     nombre,
		"mimeType": driveCarpetaMime,
	}
	if padreID != "" {
		cuerpo["parents"] = []string{padreID}
	}
	b, err := json.Marshal(cuerpo)
	if err != nil {
		return nil, err
	}
	q := url.Values{}
	q.Set("fields", "id,name,mimeType,webViewLink")
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, driveAPIBase+"/files?"+q.Encode(), bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res, err := a.F5.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		b, _ := io.ReadAll(res.Body)
		return nil, fmt.Errorf("drive crear carpeta HTTP %d: %s", res.StatusCode, recortar(string(b), 200))
	}
	var out struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		MimeType    string `json:"mimeType"`
		WebViewLink string `json:"webViewLink"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return nil, err
	}
	return &DriveArchivo{ID: out.ID, Nombre: out.Name, Mime: out.MimeType, Enlace: out.WebViewLink, EsCarpeta: true}, nil
}

// copiarArchivoDrive copia un archivo del Drive del equipo a una carpeta destino.
func (a *API) copiarArchivoDrive(ctx context.Context, token, archivoID, carpetaID, nombre string) (*DriveArchivo, error) {
	cuerpo := map[string]any{"parents": []string{carpetaID}}
	if nombre != "" {
		cuerpo["name"] = nombre
	}
	b, err := json.Marshal(cuerpo)
	if err != nil {
		return nil, err
	}
	urlCopia := fmt.Sprintf("%s/files/%s/copy?fields=id,name,mimeType,webViewLink", driveAPIBase, url.PathEscape(archivoID))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, urlCopia, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res, err := a.F5.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		bb, _ := io.ReadAll(res.Body)
		return nil, fmt.Errorf("drive copiar HTTP %d: %s", res.StatusCode, recortar(string(bb), 200))
	}
	var out struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		MimeType    string `json:"mimeType"`
		WebViewLink string `json:"webViewLink"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return nil, err
	}
	return &DriveArchivo{ID: out.ID, Nombre: out.Name, Mime: out.MimeType, Enlace: out.WebViewLink}, nil
}

// SincronizarEntregaConDrive copia a la subcarpeta de la tarea el archivo
// entregado. Es best effort: nunca bloquea la entrega de la persona.
func (a *API) SincronizarEntregaConDrive(ctx context.Context, tarea *store.Tarea) {
	if tarea == nil || tarea.EnlaceMedios == nil || tarea.DriveCarpetaID == nil {
		return
	}
	archivoID := idDeArchivoDrive(*tarea.EnlaceMedios)
	if archivoID == "" || archivoID == *tarea.DriveCarpetaID {
		// El enlace es de carpeta o no se pudo leer: no hay nada que copiar.
		return
	}
	token, err := a.tokenDrive(ctx)
	if err != nil {
		return
	}
	_, _ = a.copiarArchivoDrive(ctx, token, archivoID, *tarea.DriveCarpetaID, "")
}

var (
	reArchivoDrive = regexp.MustCompile(`/file/d/([A-Za-z0-9_-]{10,})`)
	reCarpetaDrive = regexp.MustCompile(`/folders/([A-Za-z0-9_-]{10,})`)
	reIDQuery      = regexp.MustCompile(`[?&]id=([A-Za-z0-9_-]{10,})`)
)

// idDeArchivoDrive saca el id de un enlace de archivo de Google Drive.
func idDeArchivoDrive(enlace string) string {
	if m := reArchivoDrive.FindStringSubmatch(enlace); len(m) == 2 {
		return m[1]
	}
	if m := reIDQuery.FindStringSubmatch(enlace); len(m) == 2 {
		return m[1]
	}
	return ""
}

// idDeEnlaceDrive saca el id de una carpeta o archivo de Drive.
func idDeEnlaceDrive(enlace string) string {
	if m := reCarpetaDrive.FindStringSubmatch(enlace); len(m) == 2 {
		return m[1]
	}
	return idDeArchivoDrive(enlace)
}

func escaparQueryDrive(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, `\`, `\\`), `'`, `\'`)
}

func recortar(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}
