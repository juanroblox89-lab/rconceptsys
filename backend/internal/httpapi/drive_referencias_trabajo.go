package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"unicode/utf8"

	"rconceptsys/backend/internal/store"
)

const (
	maxReferenciasTrabajo     = 3
	maxProfundidadPadresDrive = 12
)

func enlaceReferenciaDriveValido(enlace string) bool {
	u, err := url.Parse(enlace)
	return err == nil && u.Scheme == "https" && u.User == nil &&
		(strings.EqualFold(u.Host, "drive.google.com") || strings.EqualFold(u.Host, "docs.google.com")) &&
		u.Path != "" && u.Path != "/"
}

func validarReferenciasTrabajo(datos json.RawMessage) ([]store.ReferenciaDriveTrabajo, error) {
	var refs []store.ReferenciaDriveTrabajo
	if err := json.Unmarshal(datos, &refs); err != nil || refs == nil {
		return nil, errors.New("Selecciona una lista de referencias de Google Drive.")
	}
	if len(refs) > maxReferenciasTrabajo {
		return nil, errors.New("Puedes añadir hasta 3 referencias de Drive por asignación.")
	}
	ids := make(map[string]bool, len(refs))
	for i := range refs {
		ref := &refs[i]
		ref.ID = strings.TrimSpace(ref.ID)
		ref.Nombre = strings.TrimSpace(ref.Nombre)
		ref.URL = strings.TrimSpace(ref.URL)
		ref.Ruta = strings.TrimSpace(ref.Ruta)
		if !driveIDValido(ref.ID) || ref.Nombre == "" || utf8.RuneCountInString(ref.Nombre) > 500 ||
			utf8.RuneCountInString(ref.Ruta) > 1000 || len(ref.URL) > 2048 ||
			!enlaceReferenciaDriveValido(ref.URL) || (ref.Tipo != "carpeta" && ref.Tipo != "archivo") {
			return nil, errors.New("Cada referencia debe ser un archivo o carpeta con un enlace válido de Google Drive.")
		}
		if ids[ref.ID] {
			return nil, errors.New("No puedes añadir la misma referencia de Drive dos veces.")
		}
		ids[ref.ID] = true
	}
	return refs, nil
}

func referenciasInicialesTrabajo(cliente *store.Cliente) []store.ReferenciaDriveTrabajo {
	refs := []store.ReferenciaDriveTrabajo{}
	if cliente != nil && driveIDValido(textoDrive(cliente.DriveCarpetaID)) {
		id := *cliente.DriveCarpetaID
		enlace := strings.TrimSpace(textoDrive(cliente.DriveURL))
		if !enlaceReferenciaDriveValido(enlace) || len(enlace) > 2048 {
			enlace = urlCarpetaDrive(id)
		}
		refs = append(refs, store.ReferenciaDriveTrabajo{
			ID: id, Nombre: "Carpeta de " + cliente.Nombre, URL: enlace, Tipo: "carpeta",
		})
	}
	return refs
}

func esNombreGenericoDrive(nombre string) bool {
	n := strings.TrimSpace(nombre)
	if n == "" {
		return true
	}
	switch strings.ToLower(n) {
	case "carpeta del trabajo", "carpeta de drive", "archivo de drive", "referencia de drive":
		return true
	}
	return strings.HasPrefix(strings.ToLower(n), "carpeta de ")
}

func nombreRootDriveVisible(nombre string) string {
	n := strings.TrimSpace(nombre)
	if n == "" || strings.EqualFold(n, "My Drive") {
		return "Mi unidad"
	}
	return n
}

func nombreVisibleNodoDrive(id, nombre string, padres []string, driveID, rootID, rootNombre string) string {
	n := strings.TrimSpace(nombre)
	if (rootID != "" && id == rootID) || id == "root" || (len(padres) == 0 && driveID == "" && strings.EqualFold(n, "My Drive")) {
		if rootNombre != "" {
			return nombreRootDriveVisible(rootNombre)
		}
		return nombreRootDriveVisible(n)
	}
	return n
}

func (a *API) tokenDriveConClave(ctx context.Context) (token, claveConn string, err error) {
	c, err := a.conexionDrive(ctx)
	if err != nil {
		return "", "", err
	}
	tok, err := a.refrescarTokenDrive(ctx, c)
	if err != nil {
		return "", "", err
	}
	clave := fmt.Sprintf("%s|%s|%d", strings.TrimSpace(c.Correo), strings.TrimSpace(c.CarpetaRaizID), c.ConectadoEn.UnixNano())
	return tok.AccessToken, clave, nil
}

func (a *API) metadatosElementoDriveCacheado(ctx context.Context, token, claveConn, id string) (cacheElementoDrive, error) {
	claveCache := claveConn + "|file|" + id
	if a.F5 != nil {
		if item, ok := a.F5.obtenerMetaDriveCache(claveCache); ok {
			return item, nil
		}
	}
	meta, err := a.metadatosCarpeta(ctx, token, id)
	if err != nil {
		return cacheElementoDrive{}, err
	}
	item := cacheElementoDrive{
		Nombre:     strings.TrimSpace(meta.Nombre),
		Mime:       meta.Mime,
		EnPapelera: meta.EnPapelera,
		Padres:     append([]string{}, meta.Padres...),
		DriveID:    strings.TrimSpace(meta.DriveID),
		Enlace:     strings.TrimSpace(meta.WebViewLink),
	}
	if a.F5 != nil && !item.EnPapelera && item.Nombre != "" {
		a.F5.guardarMetaDriveCache(claveCache, item)
	}
	return item, nil
}

func (a *API) rootDriveCacheado(ctx context.Context, token, claveConn string) (id, nombre string) {
	claveCache := claveConn + "|root"
	if a.F5 != nil {
		if r, ok := a.F5.obtenerRootDriveCache(claveCache); ok {
			return r.ID, r.Nombre
		}
	}
	var root struct {
		ID     string `json:"id"`
		Nombre string `json:"name"`
	}
	if err := a.pedirDrive(ctx, token, driveAPIBase+"/files/root?supportsAllDrives=true&fields=id,name", &root); err != nil {
		return "", ""
	}
	rID := strings.TrimSpace(root.ID)
	rNombre := nombreRootDriveVisible(root.Nombre)
	if a.F5 != nil && rID != "" {
		a.F5.guardarRootDriveCache(claveCache, cacheRootDrive{ID: rID, Nombre: rNombre})
	}
	return rID, rNombre
}

func (a *API) nombreUnidadCompartidaCacheado(ctx context.Context, token, claveConn, driveID string) string {
	if !driveIDValido(driveID) {
		return ""
	}
	claveCache := claveConn + "|drive|" + driveID
	if a.F5 != nil {
		if item, ok := a.F5.obtenerMetaDriveCache(claveCache); ok {
			return item.Nombre
		}
	}
	var unidad struct {
		ID     string `json:"id"`
		Nombre string `json:"name"`
	}
	if err := a.pedirDrive(ctx, token, driveAPIBase+"/drives/"+url.PathEscape(driveID)+"?fields=id,name", &unidad); err != nil {
		return ""
	}
	nombre := strings.TrimSpace(unidad.Nombre)
	if a.F5 != nil && nombre != "" {
		a.F5.guardarMetaDriveCache(claveCache, cacheElementoDrive{Nombre: nombre})
	}
	return nombre
}

func (a *API) resolverReferenciaDriveConToken(ctx context.Context, token, claveConn, id string) (store.ReferenciaDriveTrabajo, error) {
	if !driveIDValido(id) {
		return store.ReferenciaDriveTrabajo{}, errors.New("elige un archivo o carpeta de Drive")
	}
	item, err := a.metadatosElementoDriveCacheado(ctx, token, claveConn, id)
	if err != nil || item.EnPapelera || item.Nombre == "" {
		return store.ReferenciaDriveTrabajo{}, errors.New("el Drive del equipo no puede abrir esa referencia; compártela con la cuenta conectada o elige otra")
	}

	rootID, rootNombre := a.rootDriveCacheado(ctx, token, claveConn)
	nombre := nombreVisibleNodoDrive(id, item.Nombre, item.Padres, item.DriveID, rootID, rootNombre)
	if nombre == "" {
		nombre = item.Nombre
	}

	tipo := "archivo"
	enlace := "https://drive.google.com/open?id=" + id
	if item.Mime == driveCarpetaMime {
		tipo = "carpeta"
		enlace = urlCarpetaDrive(id)
	}
	if enlaceReferenciaDriveValido(item.Enlace) && len(item.Enlace) <= 2048 {
		enlace = item.Enlace
	}

	ancestros := make([]string, 0, 6)
	visitados := map[string]bool{id: true}
	actual := item
	for paso := 0; paso < maxProfundidadPadresDrive && len(actual.Padres) > 0; paso++ {
		padreID := strings.TrimSpace(actual.Padres[0])
		if padreID == "" || visitados[padreID] {
			break
		}
		visitados[padreID] = true

		if rootID != "" && padreID == rootID {
			ancestros = append(ancestros, rootNombre)
			break
		}

		padre, err := a.metadatosElementoDriveCacheado(ctx, token, claveConn, padreID)
		if err != nil {
			if actual.DriveID != "" && padreID == actual.DriveID {
				if nombreDrive := a.nombreUnidadCompartidaCacheado(ctx, token, claveConn, actual.DriveID); nombreDrive != "" {
					ancestros = append(ancestros, nombreDrive)
				}
			}
			break
		}
		if padre.EnPapelera {
			break
		}
		nombrePadre := nombreVisibleNodoDrive(padreID, padre.Nombre, padre.Padres, padre.DriveID, rootID, rootNombre)
		if nombrePadre != "" {
			ancestros = append(ancestros, nombrePadre)
		}
		actual = padre
	}

	for i, j := 0, len(ancestros)-1; i < j; i, j = i+1, j-1 {
		ancestros[i], ancestros[j] = ancestros[j], ancestros[i]
	}

	return store.ReferenciaDriveTrabajo{
		ID:     id,
		Nombre: nombre,
		URL:    enlace,
		Tipo:   tipo,
		Ruta:   strings.Join(ancestros, " / "),
	}, nil
}

func (a *API) resolverReferenciaDrive(ctx context.Context, id string) (store.ReferenciaDriveTrabajo, error) {
	if !driveIDValido(id) {
		return store.ReferenciaDriveTrabajo{}, errors.New("elige un archivo o carpeta de Drive")
	}
	token, claveConn, err := a.tokenDriveConClave(ctx)
	if err != nil {
		return store.ReferenciaDriveTrabajo{}, errors.New("primero conecta el Drive del equipo desde Gestión")
	}
	return a.resolverReferenciaDriveConToken(ctx, token, claveConn, id)
}

// GET /api/admin/drive/referencia?id=...
func (a *API) handleAdminGetDriveReferencia(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if !driveIDValido(id) {
		ResponderError(w, http.StatusBadRequest, "referencia_invalida", "Selecciona un archivo o carpeta válido de Drive.")
		return
	}
	token, claveConn, err := a.tokenDriveConClave(r.Context())
	if err != nil {
		responderFalloDrive(w, err)
		return
	}
	ref, err := a.resolverReferenciaDriveConToken(r.Context(), token, claveConn, id)
	if err != nil {
		ResponderError(w, http.StatusUnprocessableEntity, "referencia_invalida", err.Error())
		return
	}
	ResponderJSON(w, http.StatusOK, ref)
}

func (a *API) enriquecerReferenciasTrabajo(ctx context.Context, refs []store.ReferenciaDriveTrabajo) []store.ReferenciaDriveTrabajo {
	if len(refs) == 0 {
		return refs
	}
	token, claveConn, err := a.tokenDriveConClave(ctx)
	if err != nil {
		return refs
	}
	res := make([]store.ReferenciaDriveTrabajo, len(refs))
	copy(res, refs)
	for i := range res {
		if !driveIDValido(res[i].ID) {
			continue
		}
		if res[i].Ruta != "" && !esNombreGenericoDrive(res[i].Nombre) {
			continue
		}
		if resuelta, err := a.resolverReferenciaDriveConToken(ctx, token, claveConn, res[i].ID); err == nil {
			res[i].Nombre = resuelta.Nombre
			res[i].Ruta = resuelta.Ruta
			if resuelta.Tipo != "" {
				res[i].Tipo = resuelta.Tipo
			}
			if res[i].URL == "" && resuelta.URL != "" {
				res[i].URL = resuelta.URL
			}
		}
	}
	return res
}

func idReferenciaLegadaTarea(t *store.Tarea) string {
	if t == nil {
		return ""
	}
	if id := strings.TrimSpace(textoDrive(t.DriveCarpetaID)); driveIDValido(id) {
		return id
	}
	if enlace := strings.TrimSpace(textoDrive(t.DriveCarpetaURL)); enlace != "" {
		if id := idDeEnlaceDrive(enlace); driveIDValido(id) {
			return id
		}
	}
	return ""
}

func (a *API) enriquecerTareasReferencias(ctx context.Context, tareas []*store.Tarea) {
	necesita := false
	for _, t := range tareas {
		if t == nil {
			continue
		}
		if t.DriveReferencias != nil {
			for _, ref := range t.DriveReferencias {
				if driveIDValido(ref.ID) && (ref.Ruta == "" || esNombreGenericoDrive(ref.Nombre)) {
					necesita = true
					break
				}
			}
		} else if idReferenciaLegadaTarea(t) != "" && t.DriveCarpetaNombre == nil {
			necesita = true
		}
		if necesita {
			break
		}
	}
	if !necesita {
		return
	}

	token, claveConn, err := a.tokenDriveConClave(ctx)
	if err != nil {
		return
	}
	porID := make(map[string]store.ReferenciaDriveTrabajo)
	resolver := func(id string) (store.ReferenciaDriveTrabajo, bool) {
		if cached, ok := porID[id]; ok {
			return cached, cached.ID != ""
		}
		res, err := a.resolverReferenciaDriveConToken(ctx, token, claveConn, id)
		if err != nil {
			porID[id] = store.ReferenciaDriveTrabajo{}
			return store.ReferenciaDriveTrabajo{}, false
		}
		porID[id] = res
		return res, true
	}

	for _, t := range tareas {
		if t == nil {
			continue
		}
		if t.DriveReferencias != nil {
			for i := range t.DriveReferencias {
				ref := &t.DriveReferencias[i]
				if !driveIDValido(ref.ID) || (ref.Ruta != "" && !esNombreGenericoDrive(ref.Nombre)) {
					continue
				}
				if res, ok := resolver(ref.ID); ok {
					ref.Nombre = res.Nombre
					ref.Ruta = res.Ruta
					if res.Tipo != "" {
						ref.Tipo = res.Tipo
					}
					if ref.URL == "" && res.URL != "" {
						ref.URL = res.URL
					}
				}
			}
			continue
		}
		if id := idReferenciaLegadaTarea(t); id != "" && t.DriveCarpetaNombre == nil {
			if res, ok := resolver(id); ok {
				nombre := res.Nombre
				t.DriveCarpetaNombre = &nombre
				if res.Ruta != "" {
					ruta := res.Ruta
					t.DriveCarpetaRuta = &ruta
				}
			}
		}
	}
}

func (a *API) enriquecerClienteReferencias(ctx context.Context, c *store.Cliente) {
	if c == nil || len(c.DriveReferencias) == 0 {
		return
	}
	necesita := false
	for _, r := range c.DriveReferencias {
		if driveIDValido(r.ID) && (r.Ruta == "" || esNombreGenericoDrive(r.Nombre)) {
			necesita = true
			break
		}
	}
	if !necesita {
		return
	}
	token, claveConn, err := a.tokenDriveConClave(ctx)
	if err != nil {
		return
	}
	for i := range c.DriveReferencias {
		r := &c.DriveReferencias[i]
		if !driveIDValido(r.ID) || (r.Ruta != "" && !esNombreGenericoDrive(r.Nombre)) {
			continue
		}
		if res, err := a.resolverReferenciaDriveConToken(ctx, token, claveConn, r.ID); err == nil {
			r.Nombre = res.Nombre
			r.Ruta = res.Ruta
			if r.URL == "" && res.URL != "" {
				r.URL = res.URL
			}
		}
	}
}
