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
		ventana := time.Duration(0)
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
	a.despacharYa(ctx)
}

func (a *API) avisarEntregaAdmins(ctx context.Context, t *store.Tarea, persona string) {
	clave := ""
	if t.HechaEn != nil {
		clave = fmt.Sprintf("entrega:%d:%s", t.ID, t.HechaEn.UTC().Format(time.RFC3339Nano))
	}
	a.avisarAdmins(ctx, AvisoPush{Titulo: persona + " hizo una entrega", Cuerpo: datosAvisoTarea(t), URL: fmt.Sprintf("/trabajos/%d?desde=tareas", t.ID), Etiqueta: "entrega-hecha"}, clave)
}

func (a *API) avisarEntregaRetiradaAdmins(ctx context.Context, t *store.Tarea, persona string, hechaAnterior *time.Time) {
	if t == nil {
		return
	}
	admins, err := a.Store.AdminsVieronTareaDesde(ctx, t.ID, hechaAnterior)
	if err != nil || len(admins) == 0 {
		return
	}
	aviso := AvisoPush{
		Titulo:   persona + " retiró su entrega",
		Cuerpo:   datosAvisoTarea(t),
		URL:      fmt.Sprintf("/trabajos/%d?desde=tareas", t.ID),
		Etiqueta: "entrega-retirada",
	}
	clave := fmt.Sprintf("retiro:%d:%d", t.ID, time.Now().UTC().UnixNano())
	for _, adminID := range admins {
		a.encolarSinEnviar(ctx, adminID, aviso, clave)
	}
	a.despacharYa(ctx)
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

func (a *API) avisarPedidoDeNuevo(ctx context.Context, tarea *store.Tarea, actorID, motivo string) {
	cuerpo := datosAvisoTarea(tarea)
	if motivo != "" {
		cuerpo = motivo + " · " + cuerpo
	}
	cuerpo = cuerpoAvisoConGuion(cuerpo, tarea)
	clave := fmt.Sprintf("pedido-de-nuevo:%d:%d", tarea.ID, time.Now().UnixNano())
	aviso := AvisoPush{Titulo: "Te pidieron rehacer un trabajo", Cuerpo: cuerpo, URL: urlTarea(tarea.ID), Etiqueta: "pedido-de-nuevo"}
	miembros, err := a.Store.ListarEquipo(ctx)
	if err != nil {
		log.Printf("[avisos] destinatarios de reapertura: %v", err)
	}
	for _, m := range miembros {
		if m.EsAdmin && m.ID != actorID && m.ID != tarea.AsignadoA {
			avisoAdmin := aviso
			avisoAdmin.Titulo = "Se pidió rehacer un trabajo"
			a.encolarSinEnviar(ctx, m.ID, avisoAdmin, clave)
		}
	}
	if tarea.AsignadoA != "" && tarea.AsignadoA != actorID {
		a.avisar(ctx, tarea.AsignadoA, aviso, clave)
	} else {
		a.despacharYa(ctx)
	}
}

func (a *API) avisarCambioAsignacion(ctx context.Context, tarea *store.Tarea, anteriorID, actorID string) {
	evento := fmt.Sprintf("reasignacion:%d:%d", tarea.ID, time.Now().UnixNano())
	if anteriorID != "" && anteriorID != actorID {
		// La tarea ya no es visible para el anterior asignado; el enlace lleva a su lista.
		a.encolarSinEnviar(ctx, anteriorID, AvisoPush{Titulo: "Este trabajo pasó a otra persona", Cuerpo: datosAvisoTarea(tarea), URL: "/tareas", Etiqueta: "tarea-cancelada"}, evento)
	}
	if tarea.AsignadoA != actorID {
		a.avisarTareaNueva(ctx, tarea, evento)
	} else {
		a.despacharYa(ctx)
	}
}

func (a *API) avisarPedidoActualizado(ctx context.Context, tarea *store.Tarea, actorID, detalle string) {
	if tarea == nil || tarea.AsignadoA == "" || tarea.AsignadoA == actorID {
		return
	}
	clave := fmt.Sprintf("pedido-act:%d:%s", tarea.ID, tarea.AsignadoA)
	if !a.F5.puedeAvisarPedido(clave, 15*time.Second) {
		return
	}
	cuerpo := datosAvisoTarea(tarea)
	if detalle != "" {
		cuerpo = recortar(detalle+" · "+cuerpo, 160)
	}
	claveEvento := fmt.Sprintf("%s:%d", clave, time.Now().Unix()/15)
	a.avisar(ctx, tarea.AsignadoA, AvisoPush{
		Titulo:   "Pedido actualizado",
		Cuerpo:   cuerpo,
		URL:      fmt.Sprintf("/trabajos/%d?desde=tareas", tarea.ID),
		Etiqueta: "tarea-editada",
	}, claveEvento)
}

func (a *API) avisarAdjuntoPedido(ctx context.Context, tareaID int64, actor *store.Perfil, adj *store.AdjuntoAsignacion) {
	if adj == nil {
		return
	}
	tarea, err := a.Store.ObtenerTareaPorID(ctx, tareaID)
	if err != nil || tarea == nil {
		return
	}
	actorID := ""
	if actor != nil {
		actorID = actor.ID
	}
	detalle := "Nuevo adjunto en el pedido"
	switch adj.Tipo {
	case "audio":
		detalle = "Nuevo audio adjunto"
	case "imagen":
		detalle = "Nueva imagen adjunta"
	case "video":
		detalle = "Nuevo video adjunto"
	}
	if adj.Nombre != "" {
		detalle += " (" + adj.Nombre + ")"
	}
	a.avisarPedidoActualizado(ctx, tarea, actorID, detalle)
}
