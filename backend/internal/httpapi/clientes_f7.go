package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"rconceptsys/backend/internal/store"
)

const maxFotoCliente = 1024 * 1024

func (a *API) clienteF7(w http.ResponseWriter, r *http.Request) *store.Cliente {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		ResponderError(w, 400, "id_invalido", "Selecciona un cliente válido.")
		return nil
	}
	c, err := a.Store.ObtenerClientePorID(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		ResponderError(w, 404, "cliente_no_encontrado", "No encontramos ese cliente.")
		return nil
	}
	if err != nil {
		ResponderError(w, 500, "error_cliente", "No pudimos cargar la ficha.")
		return nil
	}
	return c
}

type estadisticasCliente struct {
	Total         int        `json:"total"`
	Activos       int        `json:"activos"`
	Entregados    int        `json:"entregados"`
	PorRevisar    int        `json:"por_revisar"`
	Aprobados     int        `json:"aprobados"`
	Cancelados    int        `json:"cancelados"`
	UltimaEntrega *time.Time `json:"ultima_entrega"`
}

func (a *API) handleGetFichaCliente(w http.ResponseWriter, r *http.Request) {
	c := a.clienteF7(w, r)
	if c == nil {
		return
	}
	filtro := store.FiltroTareas{ClienteID: &c.ID}
	if yo := a.usuarioActual(r); !yo.EsAdmin {
		filtro.AsignadoA = &yo.ID
	}
	trabajos, err := a.Store.ListarTareas(r.Context(), filtro)
	if err != nil {
		ResponderError(w, 500, "error_trabajos", "No pudimos cargar los trabajos del cliente.")
		return
	}
	if trabajos == nil {
		trabajos = []*store.Tarea{}
	}
	stats := estadisticasCliente{Total: len(trabajos)}
	for _, t := range trabajos {
		switch t.Estado {
		case store.EstadoTareaPendiente, store.EstadoTareaRechazada:
			stats.Activos++
		case store.EstadoTareaAceptada:
			stats.Aprobados++
		case store.EstadoTareaHecha:
			stats.PorRevisar++
		case store.EstadoTareaCancelada:
			stats.Cancelados++
		}
		if t.HechaEn != nil {
			stats.Entregados++
			if stats.UltimaEntrega == nil || t.HechaEn.After(*stats.UltimaEntrega) {
				stats.UltimaEntrega = t.HechaEn
			}
		}
	}
	ResponderJSON(w, 200, map[string]any{"cliente": c, "trabajos": trabajos, "estadisticas": stats})
}

func tipoFotoCliente(datos []byte) (string, string) {
	mime := http.DetectContentType(datos)
	return mime, map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[mime]
}

func (a *API) handleAdminPostClienteFoto(w http.ResponseWriter, r *http.Request) {
	c := a.clienteF7(w, r)
	if c == nil {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxFotoCliente+16*1024)
	if err := r.ParseMultipartForm(maxFotoCliente + 16*1024); err != nil {
		ResponderError(w, 400, "foto_invalida", "Elige una imagen de hasta 1 MB.")
		return
	}
	defer r.MultipartForm.RemoveAll()
	f, _, err := r.FormFile("foto")
	if err != nil {
		ResponderError(w, 400, "foto_requerida", "Adjunta una imagen desde tus archivos.")
		return
	}
	defer f.Close()
	datos, err := io.ReadAll(io.LimitReader(f, maxFotoCliente+1))
	if err != nil || len(datos) == 0 || len(datos) > maxFotoCliente {
		ResponderError(w, 400, "foto_invalida", "Elige una imagen de hasta 1 MB.")
		return
	}
	mime, ext := tipoFotoCliente(datos)
	if ext == "" {
		ResponderError(w, 400, "formato_invalido", "La imagen debe ser JPEG, PNG o WebP.")
		return
	}
	var aleatorio [16]byte
	if _, err = rand.Read(aleatorio[:]); err != nil {
		ResponderError(w, 500, "error_foto", "No pudimos preparar la foto.")
		return
	}
	archivo := hex.EncodeToString(aleatorio[:]) + ext
	ruta := fmt.Sprintf("/api/admin/clientes/%d/foto/%s", c.ID, archivo)
	if err = a.Store.GuardarFotoCliente(r.Context(), c.ID, archivo, mime, datos); err != nil {
		ResponderError(w, 500, "error_foto", "No pudimos guardar la foto.")
		return
	}
	actual, err := a.Store.ActualizarCliente(r.Context(), c.ID, map[string]any{"foto_url": ruta})
	if err != nil {
		ResponderError(w, 500, "error_foto", "No pudimos vincular la foto a la ficha.")
		return
	}
	ResponderJSON(w, 200, actual)
}

func (a *API) handleGetClienteFoto(w http.ResponseWriter, r *http.Request) {
	c := a.clienteF7(w, r)
	if c == nil {
		return
	}
	archivo := r.PathValue("archivo")
	if c.FotoURL == nil || *c.FotoURL != fmt.Sprintf("/api/admin/clientes/%d/foto/%s", c.ID, archivo) || strings.ContainsAny(archivo, "/\\") {
		ResponderError(w, 404, "foto_no_encontrada", "No encontramos esa foto.")
		return
	}
	datos, err := a.Store.LeerFotoCliente(r.Context(), c.ID, archivo)
	if err != nil {
		ResponderError(w, 404, "foto_no_encontrada", "No encontramos esa foto.")
		return
	}
	mime, ext := tipoFotoCliente(datos)
	if ext == "" {
		ResponderError(w, 404, "foto_no_encontrada", "No encontramos esa foto.")
		return
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Cache-Control", "private, no-store")
	_, _ = w.Write(datos)
}

func (a *API) handleAdminDrivePickerToken(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Vary", "Cookie, Authorization")
	conf := a.F5.Drive
	conexion, err := a.conexionDrive(r.Context())
	if err != nil {
		responderFalloDrive(w, err)
		return
	}
	if !conf.Configurado() || conf.PickerKey == "" || conf.PickerAppID == "" {
		ResponderError(w, 503, "picker_no_configurado", "El selector de Google Drive aún no está configurado.")
		return
	}
	if conexion.CarpetaClientesID == "" || conexion.CarpetaRaizID == "" {
		ResponderError(w, 409, "drive_sin_organizar", "Organiza el Drive del equipo en Gestión → Equipo.")
		return
	}
	tok, err := a.refrescarTokenDrive(r.Context(), conexion)
	if err != nil || tok.ExpiresIn <= 0 {
		responderFalloDrive(w, err)
		return
	}
	padre := conexion.CarpetaRaizID
	if id := r.URL.Query().Get("cliente_id"); id != "" {
		clienteID, err := strconv.Atoi(id)
		if err != nil || clienteID <= 0 {
			ResponderError(w, 400, "cliente_invalido", "Selecciona un cliente válido.")
			return
		}
		cliente, err := a.Store.ObtenerClientePorID(r.Context(), clienteID)
		if err != nil {
			ResponderError(w, 404, "cliente_no_encontrado", "No encontramos al cliente.")
			return
		}
		if id := textoDrive(cliente.DriveCarpetaID); driveIDValido(id) {
			if f, err := a.metadatosCarpeta(r.Context(), tok.AccessToken, id); err == nil && f.carpetaEn(conexion.CarpetaClientesID) {
				padre = id
			}
		}
	}
	// Nunca serializar tokenDriveResp: contiene el campo refresh_token.
	ResponderJSON(w, 200, map[string]any{"access_token": tok.AccessToken, "expires_in": tok.ExpiresIn, "carpeta_id": padre, "clave": conf.PickerKey, "proyecto_id": conf.PickerAppID})
}

func (a *API) referenciaDriveCliente(ctx context.Context, id string) (nombre, enlace string, err error) {
	if !driveIDValido(id) {
		return "", "", errors.New("elige un archivo o carpeta de Drive")
	}
	token, err := a.tokenDrive(ctx)
	if err != nil {
		return "", "", errors.New("primero conecta el Drive del equipo desde Gestión")
	}
	var archivo struct {
		Nombre    string `json:"name"`
		Tipo      string `json:"mimeType"`
		Eliminado bool   `json:"trashed"`
	}
	err = a.pedirDrive(ctx, token, driveAPIBase+"/files/"+url.PathEscape(id)+"?supportsAllDrives=true&fields=name,mimeType,trashed", &archivo)
	if err != nil || archivo.Eliminado || strings.TrimSpace(archivo.Nombre) == "" {
		return "", "", errors.New("el Drive del equipo no puede abrir esa referencia; compártela con la cuenta conectada o elige otra")
	}
	enlace = "https://drive.google.com/open?id=" + id
	if archivo.Tipo == driveCarpetaMime {
		enlace = "https://drive.google.com/drive/folders/" + id
	}
	return archivo.Nombre, enlace, nil
}
