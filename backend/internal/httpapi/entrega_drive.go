package httpapi

import (
	"context"
	"errors"
	"net/url"
	"slices"
	"strings"
	"unicode/utf8"

	"rconceptsys/backend/internal/store"
)

const maxElementosEntregaDrive = 4

var errEntregaDrivePermisos = errors.New("No pudimos verificar el acceso a un elemento. Compártelo con el Drive del equipo y elígelo en Google Drive o desde la carpeta del trabajo.")

// idElementoEntrega usa el ID del recurso, no una subcadena ni la URL completa.
func idElementoEntrega(enlace string) string {
	u, err := url.Parse(enlace)
	if err != nil || u.Port() != "" {
		return ""
	}
	if id := u.Query().Get("id"); (u.Path == "/open" || u.Path == "/uc" || u.Path == "/download") && driveIDValido(id) {
		return id
	}
	partes := strings.Split(strings.Trim(u.Path, "/"), "/")
	for i := 0; i+1 < len(partes); i++ {
		if (partes[i] == "folders" || partes[i] == "d") && driveIDValido(partes[i+1]) {
			return partes[i+1]
		}
	}
	return ""
}

func (a *API) validarEntregaDrive(ctx context.Context, tarea *store.Tarea, elementos []store.ReferenciaDriveTrabajo, tokenSelector string) ([]store.ReferenciaDriveTrabajo, error) {
	if len(elementos) < 1 || len(elementos) > maxElementosEntregaDrive {
		return nil, errors.New("Elige entre uno y cuatro archivos o carpetas de Google Drive.")
	}
	vistos := make(map[string]bool, len(elementos))
	for i := range elementos {
		e := &elementos[i]
		limpio, ok := validarEnlaceDrive(&e.URL)
		if !ok || limpio == nil || idElementoEntrega(*limpio) == "" || idElementoEntrega(*limpio) != e.ID {
			return nil, errors.New("Cada elemento debe tener un enlace válido de Google Drive.")
		}
		if vistos[e.ID] {
			return nil, errors.New("No puedes entregar el mismo elemento de Drive dos veces.")
		}
		vistos[e.ID] = true
		e.Nombre, e.URL, e.Ruta = strings.TrimSpace(e.Nombre), *limpio, ""
		if e.Nombre == "" || utf8.RuneCountInString(e.Nombre) > 200 || (e.Tipo != "carpeta" && e.Tipo != "archivo") {
			return nil, errors.New("Revisa el nombre y el tipo de los elementos de Drive.")
		}
	}
	tokenEquipo, err := a.tokenDrive(ctx)
	if err != nil || tokenEquipo == "" {
		return nil, errEntregaDrivePermisos
	}
	raices := raicesCarpetaPermitidasTarea(tarea)
	anteriores := []store.ReferenciaDriveTrabajo(nil)
	if tarea.BorradorEntrega != nil && tarea.BorradorEntrega.PerfilID == tarea.AsignadoA {
		anteriores = tarea.BorradorEntrega.EntregaDrive
	}
	for i := range elementos {
		e := &elementos[i]
		meta, err := a.metadatosCarpeta(ctx, tokenEquipo, e.ID)
		// Los accesos directos son referencias indirectas que pueden saltar el árbol.
		if err != nil || meta.ID != e.ID || meta.EnPapelera || meta.Mime == "" || meta.Mime == "application/vnd.google-apps.shortcut" {
			return nil, errEntregaDrivePermisos
		}
		permitido := raices[e.ID] || slices.ContainsFunc(tarea.DriveReferencias, func(r store.ReferenciaDriveTrabajo) bool { return r.ID == e.ID }) ||
			slices.ContainsFunc(anteriores, func(r store.ReferenciaDriveTrabajo) bool { return r.ID == e.ID })
		for _, padre := range meta.Padres {
			if !permitido && a.carpetaDentroDeRaicesTarea(ctx, tokenEquipo, padre, raices) {
				permitido = true
			}
		}
		if !permitido && tokenSelector != "" && len(tokenSelector) <= 4096 && !strings.ContainsAny(tokenSelector, " \r\n\t") && tokenSelector != tokenEquipo {
			// Se usa solo para una lectura puntual en Google. No se guarda ni se devuelve.
			seleccion, err := a.metadatosCarpeta(ctx, tokenSelector, e.ID)
			permitido = err == nil && seleccion.ID == e.ID && !seleccion.EnPapelera
		}
		if !permitido {
			return nil, errEntregaDrivePermisos
		}
		e.Tipo = "archivo"
		if meta.Mime == driveCarpetaMime {
			e.Tipo = "carpeta"
		}
	}
	return elementos, nil
}
