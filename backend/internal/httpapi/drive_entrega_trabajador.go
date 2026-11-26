package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"unicode/utf8"

	"rconceptsys/backend/internal/store"
)

const maxAdjuntosDriveRechazo = 5

// validarAdjuntosDriveRechazo valida los elementos de Google Drive adjuntados al rechazo.
func validarAdjuntosDriveRechazo(datos json.RawMessage) ([]store.ReferenciaDriveTrabajo, error) {
	if len(datos) == 0 || string(datos) == "null" {
		return nil, nil
	}
	var refs []store.ReferenciaDriveTrabajo
	if err := json.Unmarshal(datos, &refs); err != nil {
		return nil, errors.New("Revisa los elementos de Google Drive adjuntados al rechazo.")
	}
	if len(refs) > maxAdjuntosDriveRechazo {
		return nil, errors.New("Puedes adjuntar hasta 5 elementos de Google Drive en un rechazo.")
	}
	vistos := make(map[string]bool, len(refs))
	for i := range refs {
		ref := &refs[i]
		ref.ID = strings.TrimSpace(ref.ID)
		ref.Nombre = strings.TrimSpace(ref.Nombre)
		ref.URL = strings.TrimSpace(ref.URL)
		ref.Tipo = strings.ToLower(strings.TrimSpace(ref.Tipo))
		if ref.Tipo == "" {
			if strings.Contains(ref.URL, "/folders/") {
				ref.Tipo = "carpeta"
			} else {
				ref.Tipo = "archivo"
			}
		}
		if !driveIDValido(ref.ID) || ref.Nombre == "" || utf8.RuneCountInString(ref.Nombre) > 200 || len(ref.URL) > 500 ||
			!enlaceReferenciaDriveValido(ref.URL) || (ref.Tipo != "carpeta" && ref.Tipo != "archivo") {
			return nil, errors.New("Cada elemento de Drive debe tener nombre, tipo (carpeta o archivo) y un enlace https válido de Google Drive.")
		}
		if vistos[ref.ID] {
			return nil, errors.New("No puedes adjuntar el mismo elemento de Drive dos veces.")
		}
		vistos[ref.ID] = true
	}
	return refs, nil
}

// GET /api/tareas/{id}/drive/picker-token
//
// Decisión de seguridad:
// El conector OAuth del equipo (drive_conexion) utiliza el scope completo https://www.googleapis.com/auth/drive,
// necesario en servidor para crear subcarpetas y copiar entregas. Exponer ese access_token al navegador de un
// trabajador permitiría editar o borrar archivos del Drive del equipo (violando la regla de solo selección/lectura).
// Por ello, este endpoint valida que el solicitante sea miembro aprobado asignado a la tarea (o admin), NUNCA
// entrega refresh_token, client_secret ni el access_token maestro del equipo a trabajadores, y entrega únicamente
// la configuración pública del selector (client_id, clave, proyecto_id, scope drive.file) para que el trabajador
// seleccione carpetas o archivos desde su sesión de Google (su Drive o elementos compartidos con él) sin permisos
// de edición sobre el Drive del equipo.
func (a *API) handleTareaDrivePickerToken(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Vary", "Cookie, Authorization")

	yo := UsuarioDesdeContexto(r.Context())
	if yo == nil {
		ResponderError(w, http.StatusUnauthorized, "no_autenticado", "No se encontró el perfil autenticado.")
		return
	}

	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		ResponderError(w, http.StatusBadRequest, "id_invalido", "ID de tarea inválido.")
		return
	}

	tarea, err := a.Store.ObtenerTareaPorID(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		ResponderError(w, http.StatusNotFound, "tarea_no_encontrada", "La tarea no existe.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_tarea", "No se pudo consultar la tarea.")
		return
	}
	if !yo.EsAdmin && tarea.AsignadoA != yo.ID {
		ResponderError(w, http.StatusForbidden, "tarea_ajena", "No tienes acceso a esa tarea.")
		return
	}

	conf := a.F5.Drive
	if strings.TrimSpace(conf.ClientID) == "" || strings.TrimSpace(conf.PickerKey) == "" || strings.TrimSpace(conf.PickerAppID) == "" {
		ResponderError(w, http.StatusServiceUnavailable, "picker_no_configurado", "El selector de Google Drive aún no está configurado.")
		return
	}

	conexion, errConn := a.conexionDrive(r.Context())
	equipoConectado := errConn == nil && conexion != nil

	carpetaID := ""
	if tarea.DriveCarpetaID != nil && driveIDValido(*tarea.DriveCarpetaID) {
		carpetaID = *tarea.DriveCarpetaID
	}

	ResponderJSON(w, http.StatusOK, map[string]any{
		"modo":             "gis_solo_lectura",
		"client_id":        conf.ClientID,
		"clave":            conf.PickerKey,
		"proyecto_id":      conf.PickerAppID,
		"scope":            "https://www.googleapis.com/auth/drive.file",
		"carpeta_id":       carpetaID,
		"carpeta_url":      tarea.DriveCarpetaURL,
		"equipo_conectado": equipoConectado,
	})
}

func raicesCarpetaPermitidasTarea(t *store.Tarea) map[string]bool {
	raices := make(map[string]bool)
	if t == nil {
		return raices
	}
	if t.DriveCarpetaID != nil && driveIDValido(*t.DriveCarpetaID) {
		raices[*t.DriveCarpetaID] = true
	}
	for _, ref := range t.DriveReferencias {
		if ref.Tipo == "carpeta" && driveIDValido(ref.ID) {
			raices[ref.ID] = true
		}
	}
	return raices
}

func (a *API) carpetaDentroDeRaicesTarea(ctx context.Context, token, carpetaID string, raices map[string]bool) bool {
	if raices[carpetaID] {
		return true
	}
	actual := carpetaID
	visitados := make(map[string]bool, 6)
	for range 5 {
		if visitados[actual] {
			return false
		}
		visitados[actual] = true
		meta, err := a.metadatosCarpeta(ctx, token, actual)
		if err != nil || !meta.carpetaActiva() || len(meta.Padres) == 0 {
			return false
		}
		encontrado := false
		for _, p := range meta.Padres {
			if raices[p] {
				return true
			}
			actual = p
			encontrado = true
			break
		}
		if !encontrado {
			return false
		}
	}
	return false
}

// GET /api/tareas/{id}/drive/archivos?carpeta=
// Proxy de solo lectura estrictamente acotado a las carpetas autorizadas de la tarea;
// nunca expone tokens de Google Drive al trabajador.
func (a *API) handleTareaDriveArchivos(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	yo := UsuarioDesdeContexto(r.Context())
	if yo == nil {
		ResponderError(w, http.StatusUnauthorized, "no_autenticado", "No se encontró el perfil autenticado.")
		return
	}

	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		ResponderError(w, http.StatusBadRequest, "id_invalido", "ID de tarea inválido.")
		return
	}

	tarea, err := a.Store.ObtenerTareaPorID(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		ResponderError(w, http.StatusNotFound, "tarea_no_encontrada", "La tarea no existe.")
		return
	}
	if err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_tarea", "No se pudo consultar la tarea.")
		return
	}
	if !yo.EsAdmin && tarea.AsignadoA != yo.ID {
		ResponderError(w, http.StatusForbidden, "tarea_ajena", "No tienes acceso a esa tarea.")
		return
	}

	raices := raicesCarpetaPermitidasTarea(tarea)
	carpeta := strings.TrimSpace(r.URL.Query().Get("carpeta"))
	if carpeta == "" {
		if tarea.DriveCarpetaID != nil && driveIDValido(*tarea.DriveCarpetaID) {
			carpeta = *tarea.DriveCarpetaID
		} else {
			res := make([]DriveArchivo, 0, len(tarea.DriveReferencias))
			for _, ref := range tarea.DriveReferencias {
				if ref.Tipo == "carpeta" && driveIDValido(ref.ID) {
					res = append(res, DriveArchivo{
						ID:        ref.ID,
						Nombre:    ref.Nombre,
						Mime:      driveCarpetaMime,
						Enlace:    ref.URL,
						EsCarpeta: true,
					})
				}
			}
			ResponderJSON(w, http.StatusOK, res)
			return
		}
	}

	if !driveIDValido(carpeta) {
		ResponderError(w, http.StatusBadRequest, "carpeta_invalida", "ID de carpeta inválido.")
		return
	}

	token, err := a.tokenDrive(r.Context())
	if err != nil {
		ResponderError(w, http.StatusConflict, "drive_no_conectado", "El Drive del equipo no está conectado.")
		return
	}

	if !a.carpetaDentroDeRaicesTarea(r.Context(), token, carpeta, raices) {
		ResponderError(w, http.StatusForbidden, "carpeta_no_autorizada", "Solo puedes ver carpetas autorizadas para esta tarea.")
		return
	}

	q := url.Values{}
	q.Set("q", fmt.Sprintf("trashed = false and '%s' in parents", escaparQueryDrive(carpeta)))
	q.Set("fields", "files(id,name,mimeType,size,iconLink,thumbnailLink,webViewLink,modifiedTime)")
	q.Set("pageSize", "60")
	q.Set("orderBy", "folder,name")
	q.Set("supportsAllDrives", "true")
	q.Set("includeItemsFromAllDrives", "true")

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
		ResponderError(w, http.StatusBadGateway, "drive_error", "No pudimos consultar la carpeta de Drive. Inténtalo de nuevo.")
		return
	}

	res := make([]DriveArchivo, 0, len(resp.Files))
	for _, f := range resp.Files {
		var tam int64
		if f.Size != "" {
			_, _ = fmt.Sscan(f.Size, &tam)
		}
		esCarpeta := f.MimeType == driveCarpetaMime
		enlace := strings.TrimSpace(f.WebViewLink)
		if enlace == "" {
			if esCarpeta {
				enlace = urlCarpetaDrive(f.ID)
			} else {
				enlace = "https://drive.google.com/open?id=" + f.ID
			}
		}
		res = append(res, DriveArchivo{
			ID:           f.ID,
			Nombre:       f.Name,
			Mime:         f.MimeType,
			Icono:        f.IconLink,
			Miniatura:    f.ThumbnailLink,
			Enlace:       enlace,
			Tamano:       tam,
			ModificadoEn: f.ModifiedTime,
			EsCarpeta:    esCarpeta,
		})
	}
	ResponderJSON(w, http.StatusOK, res)
}
