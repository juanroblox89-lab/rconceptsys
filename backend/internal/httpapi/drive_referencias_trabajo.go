package httpapi

import (
	"encoding/json"
	"errors"
	"net/url"
	"strings"
	"unicode/utf8"

	"rconceptsys/backend/internal/store"
)

const maxReferenciasTrabajo = 3

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
		ref.Nombre = strings.TrimSpace(ref.Nombre)
		ref.URL = strings.TrimSpace(ref.URL)
		if !driveIDValido(ref.ID) || ref.Nombre == "" || utf8.RuneCountInString(ref.Nombre) > 500 || len(ref.URL) > 2048 ||
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
