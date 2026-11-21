package httpapi

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"strings"
	"time"
	"unicode"

	"rconceptsys/backend/internal/store"
)

func mencionaPersona(texto, nombre string) bool {
	texto = strings.ToLower(texto)
	nombre = strings.ToLower(strings.TrimSpace(nombre))
	if nombre == "" {
		return false
	}
	partes := strings.Fields(nombre)
	candidatos := []string{nombre, strings.Join(partes, "_")}
	if len(partes) > 0 {
		candidatos = append(candidatos, partes[0])
	}
	for _, c := range candidatos {
		for i := 0; i < len(texto); {
			p := strings.Index(texto[i:], "@"+c)
			if p < 0 {
				break
			}
			p += i
			i = p + 1 + len(c)
			previo := []rune(texto[:p])
			posterior := []rune(texto[i:])
			palabra := func(r rune) bool { return unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' }
			if (len(previo) == 0 || !palabra(previo[len(previo)-1])) && (len(posterior) == 0 || !palabra(posterior[0])) {
				return true
			}
		}
	}
	return false
}
func (a *API) avisarChat(ctx context.Context, autor *store.Perfil, msg *store.ChatMensaje) {
	equipo, e := a.Store.ListarEquipo(ctx)
	if e != nil {
		log.Printf("[avisos] destinatarios del chat: %v", e)
		return
	}
	cuerpo := recortar(msg.Cuerpo, 160)
	if cuerpo == "" {
		cuerpo = "Compartió un archivo"
	}
	ruta := fmt.Sprintf("/?mensaje=%d#mensaje-%d", msg.ID, msg.ID)
	for _, p := range equipo {
		if p.ID == autor.ID {
			continue
		}
		n := AvisoPush{Titulo: autor.Nombre, Cuerpo: cuerpo, URL: ruta, Etiqueta: "chat"}
		grupo := "equipo"
		ventana := 35 * time.Second
		if mencionaPersona(msg.Cuerpo, p.Nombre) {
			n.Titulo = autor.Nombre + " te mencionó"
			n.Etiqueta = "mencion"
			grupo = ""
			ventana = 0
		}
		if e := a.encolarAviso(ctx, p.ID, n, fmt.Sprintf("mensaje:%d", msg.ID), grupo, ventana); e != nil {
			log.Printf("[avisos] chat: %v", e)
		}
	}
}

func (a *API) avisarEntregaAdmins(ctx context.Context, t *store.Tarea, persona string) {
	clave := ""
	if t.HechaEn != nil {
		clave = fmt.Sprintf("entrega:%d:%s", t.ID, t.HechaEn.UTC().Format(time.RFC3339Nano))
	}
	a.avisarAdmins(ctx, AvisoPush{Titulo: persona + " hizo una entrega", Cuerpo: datosAvisoTarea(t), URL: urlTarea(t.ID), Etiqueta: "entrega-hecha"}, clave)
}
func rutaCorte(id int64) string { return fmt.Sprintf("/factura?corte=%d#corte-%d", id, id) }
func (a *API) avisarCorte(ctx context.Context, id int64, perfil string, pagado bool, periodo string) {
	tipo, titulo := "corte-listo", "Tu corte está listo"
	if pagado {
		tipo, titulo = "corte-pagado", "Tu corte fue pagado"
	}
	a.avisar(ctx, perfil, AvisoPush{Titulo: titulo, Cuerpo: periodo, URL: rutaCorte(id), Etiqueta: tipo}, fmt.Sprintf("%s:%d", tipo, id))
}
func (a *API) avisarSolicitud(ctx context.Context, p *store.Perfil) {
	if p.Estado != store.EstadoPendiente {
		return
	}
	a.avisarAdmins(ctx, AvisoPush{Titulo: "Nueva solicitud para unirse", Cuerpo: p.Nombre, URL: "/admin?pestana=miembros&solicitud=" + url.QueryEscape(p.ID) + "#solicitud-" + url.PathEscape(p.ID), Etiqueta: "solicitud"}, "solicitud:"+p.ID)
}
