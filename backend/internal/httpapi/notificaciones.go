package httpapi

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"rconceptsys/backend/internal/store"
)

var tiposAviso = map[string]bool{"tarea-nueva": true, "tarea-editada": true, "chat": true, "drive": true, "ria": true, "entrega-hecha": true, "entrega-retirada": true, "entrega-aprobada": true, "entrega-devuelta": true, "vence-manana": true, "vencio": true, "corte-listo": true, "corte-pagado": true, "solicitud": true}
var errPushVencido = errors.New("suscripción vencida")

func (a *API) encolarAviso(ctx context.Context, perfil string, aviso AvisoPush, clave, grupo string, ventana time.Duration) error {
	if perfil == "" {
		return nil
	}
	return a.Store.EncolarNotificacion(ctx, store.Notificacion{PerfilID: perfil, Tipo: aviso.Etiqueta, Titulo: aviso.Titulo, Cuerpo: aviso.Cuerpo, URL: aviso.URL, Grupo: grupo}, clave, ventana)
}
func (a *API) encolarSinEnviar(ctx context.Context, perfil string, aviso AvisoPush, clave string) {
	if e := a.encolarAviso(ctx, perfil, aviso, clave, "", 0); e != nil {
		log.Printf("[avisos] no se pudo encolar %s: %v", aviso.Etiqueta, e)
	}
}

// despacharYa envia en el momento del evento lo que ya esta disponible en la cola.
// Si falla, el aviso queda en la cola y el cron lo reintenta.
func (a *API) despacharYa(ctx context.Context) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 4*time.Second)
	defer cancel()
	if e := a.enviarColaNotificaciones(ctx); e != nil {
		log.Printf("[avisos] envio inmediato incompleto: %v", e)
	}
}

func (a *API) avisar(ctx context.Context, perfil string, aviso AvisoPush, clave string) {
	a.encolarSinEnviar(ctx, perfil, aviso, clave)
	a.despacharYa(ctx)
}
func (a *API) avisarAdmins(ctx context.Context, aviso AvisoPush, clave string) {
	miembros, e := a.Store.ListarEquipo(ctx)
	if e != nil {
		log.Printf("[avisos] no se pudo consultar destinatarios: %v", e)
		return
	}
	for _, m := range miembros {
		if m.EsAdmin {
			a.encolarSinEnviar(ctx, m.ID, aviso, clave)
		}
	}
	a.despacharYa(ctx)
}
func urlTarea(id int64) string { return fmt.Sprintf("/tareas?tarea=%d#tarea-%d", id, id) }

func (a *API) handleNotificaciones(w http.ResponseWriter, r *http.Request) {
	ns, noLeidas, e := a.Store.BandejaNotificaciones(r.Context(), a.usuarioActual(r).ID)
	if e != nil {
		ResponderError(w, 503, "avisos_no_disponibles", "No pudimos cargar tus avisos. Inténtalo de nuevo.")
		return
	}
	type entrada struct {
		ID       int64      `json:"id"`
		Tipo     string     `json:"tipo"`
		Titulo   string     `json:"titulo"`
		Cuerpo   string     `json:"cuerpo"`
		URL      string     `json:"url"`
		LeidaEn  *time.Time `json:"leida_en"`
		CreadaEn time.Time  `json:"creada_en"`
	}
	res := make([]entrada, 0, len(ns))
	for _, n := range ns {
		res = append(res, entrada{n.ID, n.Tipo, n.Titulo, n.Cuerpo, n.URL, n.LeidaEn, n.ActualizadaEn})
	}
	ResponderJSON(w, 200, map[string]any{"notificaciones": res, "no_leidas": noLeidas})
}
func (a *API) handleLeerNotificaciones(w http.ResponseWriter, r *http.Request) {
	var id int64
	if s := r.PathValue("id"); s != "" {
		v, e := strconv.ParseInt(s, 10, 64)
		if e != nil || v <= 0 {
			ResponderError(w, 400, "aviso_invalido", "No encontramos ese aviso.")
			return
		}
		id = v
	}
	if e := a.Store.LeerNotificaciones(r.Context(), a.usuarioActual(r).ID, id); e != nil {
		ResponderError(w, 503, "aviso_no_actualizado", "No pudimos marcar los avisos como leídos.")
		return
	}
	ResponderJSON(w, 200, map[string]string{"mensaje": "Avisos leídos."})
}
func (a *API) handlePreferenciasNotificaciones(w http.ResponseWriter, r *http.Request) {
	perfil := a.usuarioActual(r).ID
	if r.Method == http.MethodGet {
		p, e := a.Store.PreferenciasNotificaciones(r.Context(), perfil)
		if e != nil {
			ResponderError(w, 503, "preferencias_no_disponibles", "No pudimos cargar tus preferencias.")
			return
		}
		if p.TiposSilenciados == nil {
			p.TiposSilenciados = []string{}
		}
		ResponderJSON(w, 200, p)
		return
	}
	var p store.PreferenciasNotificaciones
	if leerJSONCuerpo(r, 8192, &p) != nil || len(p.TiposSilenciados) > len(tiposAviso) {
		ResponderError(w, 400, "preferencias_invalidas", "Revisa tus preferencias de avisos.")
		return
	}
	for _, tipo := range p.TiposSilenciados {
		if !tiposAviso[tipo] {
			ResponderError(w, 400, "preferencias_invalidas", "Selecciona tipos de aviso válidos.")
			return
		}
	}
	if p.SilencioDesde != "" || p.SilencioHasta != "" {
		_, e1 := time.Parse("15:04", p.SilencioDesde)
		_, e2 := time.Parse("15:04", p.SilencioHasta)
		if e1 != nil || e2 != nil || len(p.SilencioDesde) != 5 || len(p.SilencioHasta) != 5 || p.SilencioDesde == p.SilencioHasta {
			ResponderError(w, 400, "horario_invalido", "Indica dos horas distintas para el horario de silencio.")
			return
		}
	}
	if e := a.Store.GuardarPreferenciasNotificaciones(r.Context(), perfil, p); e != nil {
		ResponderError(w, 503, "preferencias_no_guardadas", "No pudimos guardar tus preferencias.")
		return
	}
	if p.TiposSilenciados == nil {
		p.TiposSilenciados = []string{}
	}
	ResponderJSON(w, 200, p)
}

func finSilencio(p store.PreferenciasNotificaciones, ahora time.Time) *time.Time {
	desde, e1 := time.Parse("15:04", p.SilencioDesde)
	hasta, e2 := time.Parse("15:04", p.SilencioHasta)
	if e1 != nil || e2 != nil || desde.Equal(hasta) {
		return nil
	}
	local := ahora.In(store.LocBogota)
	inicio := time.Date(local.Year(), local.Month(), local.Day(), desde.Hour(), desde.Minute(), 0, 0, store.LocBogota)
	fin := time.Date(local.Year(), local.Month(), local.Day(), hasta.Hour(), hasta.Minute(), 0, 0, store.LocBogota)
	if inicio.After(fin) {
		if local.Before(fin) {
			inicio = inicio.AddDate(0, 0, -1)
		} else {
			fin = fin.AddDate(0, 0, 1)
		}
	}
	if !local.Before(inicio) && local.Before(fin) {
		return &fin
	}
	return nil
}

func (a *API) enviarColaNotificaciones(ctx context.Context) error {
	if !a.F5.Push.Configurado() {
		return nil
	}
	entradas, e := a.Store.ReclamarNotificaciones(ctx, 12)
	if e != nil {
		return e
	}
	var fallos error
	for _, n := range entradas {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		p, e := a.Store.PreferenciasNotificaciones(ctx, n.PerfilID)
		var proximo *time.Time
		if e == nil && !p.Silencia(n.Tipo) {
			if n.Tipo != "mencion" {
				proximo = finSilencio(p, time.Now())
			}
			if proximo == nil {
				e = a.enviarADispositivos(ctx, n)
			}
		}
		if e != nil && n.Intentos < 8 {
			t := time.Now().Add(time.Minute * time.Duration(1<<min(n.Intentos-1, 6)))
			proximo = &t
		}
		if e != nil && n.Intentos >= 8 {
			log.Printf("[avisos] %d agotó reintentos: %v", n.ID, e)
		}
		fallos = errors.Join(fallos, a.Store.ResolverNotificacion(ctx, n, proximo))
	}
	return fallos
}
func (a *API) enviarADispositivos(ctx context.Context, n store.Notificacion) error {
	subs, e := a.Store.ListarSuscripcionesPush(ctx, n.PerfilID)
	if e != nil {
		return e
	}
	var fallos error
	for _, s := range subs {
		entregada, e := a.Store.NotificacionEntregada(ctx, n.ID, s.ID)
		if e != nil {
			fallos = errors.Join(fallos, e)
			continue
		}
		if entregada {
			continue
		}
		intento, cancel := context.WithTimeout(ctx, 4*time.Second)
		e = a.enviarPush(intento, s, AvisoPush{Titulo: n.Titulo, Cuerpo: n.Cuerpo, URL: n.URL, Etiqueta: fmt.Sprintf("aviso-%d", n.ID)})
		cancel()
		if errors.Is(e, errPushVencido) {
			continue
		}
		if e == nil {
			e = a.Store.RegistrarNotificacionEntregada(ctx, n.ID, s.ID)
		}
		fallos = errors.Join(fallos, e)
	}
	return fallos
}

func (a *API) handleCronNotificaciones(w http.ResponseWriter, r *http.Request) {
	secreto := strings.TrimSpace(os.Getenv("CRON_SECRET"))
	if secreto == "" || subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte("Bearer "+secreto)) != 1 {
		ResponderError(w, 401, "cron_no_autorizado", "No tienes acceso a esta operación.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 22*time.Second)
	defer cancel()
	var fallos error
	for _, trabajo := range []func(context.Context) error{a.encolarVencimientos, a.revisarCambiosDrive, a.enviarColaNotificaciones} {
		paso, terminar := context.WithTimeout(ctx, 7*time.Second)
		fallos = errors.Join(fallos, trabajo(paso))
		terminar()
	}
	if fallos != nil {
		log.Printf("[avisos] cron: %v", fallos)
		ResponderError(w, 503, "cron_incompleto", "Quedaron avisos por procesar.")
		return
	}
	ResponderJSON(w, 200, map[string]bool{"procesado": true})
}

func (a *API) encolarVencimientos(ctx context.Context) error {
	hoy := store.InicioDiaBogota(time.Now())
	manana := hoy.AddDate(0, 0, 1).Format("2006-01-02")
	tareas, e := a.Store.TareasPorVencer(ctx, manana)
	if e != nil {
		return e
	}
	var fallos error
	for _, t := range tareas {
		aviso := AvisoPush{Titulo: "Vence mañana", Cuerpo: datosAvisoTarea(t), URL: urlTarea(t.ID), Etiqueta: "vence-manana"}
		fallos = errors.Join(fallos, a.encolarAviso(ctx, t.AsignadoA, aviso, fmt.Sprintf("vence:%d:%s", t.ID, manana), "", 0))
	}
	vencidas, e := a.Store.TareasVencidas(ctx, hoy.Format("2006-01-02"))
	if e != nil {
		return errors.Join(fallos, e)
	}
	if len(vencidas) == 0 {
		return fallos
	}
	miembros, e := a.Store.ListarEquipo(ctx)
	if e != nil {
		return errors.Join(fallos, e)
	}
	for _, t := range vencidas {
		clave := fmt.Sprintf("vencio:%d:%s", t.ID, *t.FechaLimite)
		aviso := AvisoPush{Titulo: "Venció el trabajo", Cuerpo: datosAvisoTarea(t), URL: urlTarea(t.ID), Etiqueta: "vencio"}
		fallos = errors.Join(fallos, a.encolarAviso(ctx, t.AsignadoA, aviso, clave, "", 0))
		aviso.URL = fmt.Sprintf("/trabajos/%d?desde=asignaciones", t.ID)
		for _, m := range miembros {
			if m.EsAdmin {
				fallos = errors.Join(fallos, a.encolarAviso(ctx, m.ID, aviso, clave, "", 0))
			}
		}
	}
	return fallos
}
