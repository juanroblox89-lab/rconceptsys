package httpapi

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"rconceptsys/backend/internal/store"
)

type destinoDrive struct {
	titulo, ruta  string
	destinatarios map[string]bool
	admins        map[string]bool
}
type cambioDrive struct {
	FileID  string `json:"fileId"`
	Removed bool   `json:"removed"`
	Time    string `json:"time"`
	File    struct {
		Name    string   `json:"name"`
		Parents []string `json:"parents"`
		Trashed bool     `json:"trashed"`
	} `json:"file"`
}

func (a *API) revisarCambiosDrive(ctx context.Context) error {
	if !a.F5.Drive.Configurado() {
		return nil
	}
	conexion, err := a.Store.ObtenerConexionDrive(ctx)
	if errors.Is(err, store.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	clave := "drive:" + fmt.Sprintf("%x", sha256.Sum256([]byte(conexion.RefreshToken)))
	cursor, tomado, err := a.Store.BloquearControlNotificaciones(ctx, clave)
	if err != nil || !tomado {
		return err
	}
	original := cursor
	terminar := func(siguiente string, e error) error {
		if e != nil {
			siguiente = original
		}
		return errors.Join(e, a.Store.GuardarControlNotificaciones(ctx, clave, siguiente))
	}
	token, err := a.tokenDrive(ctx)
	if err != nil {
		return terminar(cursor, err)
	}
	if cursor == "" {
		var r struct {
			StartPageToken string `json:"startPageToken"`
		}
		err = a.pedirDrive(ctx, token, driveAPIBase+"/changes/startPageToken", &r)
		return terminar(r.StartPageToken, err)
	}
	destinos, err := a.destinosDrive(ctx)
	if err != nil {
		return terminar(cursor, err)
	}
	// Una página por ejecución mantiene acotado el tiempo de trabajo. No avanzamos si falla algún aviso.
	q := url.Values{"pageToken": {cursor}, "pageSize": {"40"}, "fields": {"nextPageToken,newStartPageToken,changes(fileId,removed,time,file(name,parents,trashed))"}, "includeRemoved": {"false"}}
	var r struct {
		Next    string        `json:"nextPageToken"`
		Start   string        `json:"newStartPageToken"`
		Cambios []cambioDrive `json:"changes"`
	}
	if err = a.pedirDrive(ctx, token, driveAPIBase+"/changes?"+q.Encode(), &r); err != nil {
		return terminar(cursor, err)
	}
	for _, c := range r.Cambios {
		if c.Removed || c.File.Trashed || c.File.Name == "" {
			continue
		}
		for _, padre := range c.File.Parents {
			d, ok := destinos[padre]
			if !ok {
				continue
			}
			aviso := AvisoPush{Titulo: "Cambio en Drive · " + d.titulo, Cuerpo: recortar(c.File.Name, 120), URL: d.ruta, Etiqueta: "drive"}
			for perfil := range d.destinatarios {
				n := aviso
				retorno := d.ruta
				if !d.admins[perfil] && (retorno == "/clientes" || strings.HasPrefix(retorno, "/clientes/")) {
					retorno = "/tareas"
					n.URL = retorno
				}
				if c.FileID != "" && driveIDValido(c.FileID) {
					n.URL = "/drive-cambio?archivo=" + url.QueryEscape(c.FileID) + "&volver=" + url.QueryEscape(retorno)
				}
				e := a.encolarAviso(ctx, perfil, n, fmt.Sprintf("drive:%s:%s:%s", padre, c.FileID, c.Time), padre, 2*time.Minute)
				if e != nil {
					return terminar(cursor, e)
				}
			}
		}
	}
	siguiente := r.Next
	if siguiente == "" {
		siguiente = r.Start
	}
	if siguiente == "" {
		siguiente = cursor
	}
	return terminar(siguiente, nil)
}

func (a *API) destinosDrive(ctx context.Context) (map[string]destinoDrive, error) {
	equipo, e := a.Store.ListarEquipo(ctx)
	if e != nil {
		return nil, e
	}
	admins := map[string]bool{}
	miembros := map[string]bool{}
	for _, m := range equipo {
		miembros[m.ID] = true
		if m.EsAdmin {
			admins[m.ID] = true
		}
	}
	tareas, e := a.Store.ListarTareas(ctx, store.FiltroTareas{})
	if e != nil {
		return nil, e
	}
	clientes, e := a.Store.ListarClientes(ctx, false)
	if e != nil {
		return nil, e
	}
	destinos := map[string]destinoDrive{}
	acceso := func() map[string]bool {
		m := map[string]bool{}
		for id := range admins {
			m[id] = true
		}
		return m
	}
	porCliente := map[int]map[string]bool{}
	for _, t := range tareas {
		if t.Estado == store.EstadoTareaCancelada {
			continue
		}
		if t.ClienteID != nil {
			if porCliente[*t.ClienteID] == nil {
				porCliente[*t.ClienteID] = acceso()
			}
			if miembros[t.AsignadoA] {
				porCliente[*t.ClienteID][t.AsignadoA] = true
			}
		}
		if t.DriveCarpetaID != nil {
			d, ok := destinos[*t.DriveCarpetaID]
			if !ok {
				d = destinoDrive{datosAvisoTarea(t), urlTarea(t.ID), acceso(), admins}
			}
			if miembros[t.AsignadoA] {
				d.destinatarios[t.AsignadoA] = true
			}
			destinos[*t.DriveCarpetaID] = d
		}
	}
	for _, c := range clientes {
		p := porCliente[c.ID]
		if p == nil {
			p = acceso()
		}
		for _, f := range []struct {
			id     *string
			sufijo string
		}{{c.DriveCarpetaID, ""}, {c.MaterialCarpetaID, " · Material del lugar"}, {c.ProductoCarpetaID, " · Producto"}} {
			if f.id != nil {
				destinos[*f.id] = destinoDrive{c.Nombre + f.sufijo, fmt.Sprintf("/clientes/%d", c.ID), p, admins}
			}
		}
	}
	return destinos, nil
}
