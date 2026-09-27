// Package permisos concentra la matriz de permisos de ANALISIS.md §3.2 en UNA
// sola función: Puede. Toda regla de "quién puede hacer qué" vive aquí; los
// handlers solo la llaman y agregan los chequeos finos de gestión de usuarios
// (§5.4 último dueño y §5.5 admin no toca admin/dueño) mediante los helpers
// NoQuitarUltimoDueno y PuedeCambiarAcceso, que existen aparte a propósito:
// Puede decide la puerta gruesa (¿este acceso puede esta acción?), los helpers
// deciden el caso fino (¿este actor puede este cambio concreto?). La seguridad
// la da Go, no la interfaz; RLS en Supabase es segunda capa.
package permisos

import (
	"fmt"
	"strings"
)

// Acceso es el nivel de poder en el sistema (uno por persona, ANALISIS §3.1).
type Acceso string

const (
	AccesoDueno       Acceso = "dueno"
	AccesoAdmin       Acceso = "admin"
	AccesoEquipo      Acceso = "equipo"
	AccesoPendiente   Acceso = "pendiente"
	AccesoDesactivado Acceso = "desactivado"
)

// Accion es cada fila de la matriz ANALISIS §3.2 (17 de F0) más las 3 de F1
// (producción: cancelar pieza, reasignar tarea, ver notificaciones propias)
// más las 4 de F2 (cobros: confirmar/reclamar propios, marcar pagado y
// decidir cancelada solo dueño) más las 3 de F3 (biblioteca: publicar/
// rechazar/archivar solo admin/dueño; editar contenido publicado solo
// admin/dueño; ejecutar SOP todo el que lee).
type Accion string

const (
	VerPanel            Accion = "ver_panel"
	CrearEditarClientes Accion = "crear_editar_clientes"
	VerFichaCliente     Accion = "ver_ficha_cliente"
	CrearPiezasAsignar  Accion = "crear_piezas_asignar"
	VerTareas           Accion = "ver_tareas"
	CambiarEstadoTarea  Accion = "cambiar_estado_tarea"
	AprobarEntrega      Accion = "aprobar_entrega"
	VerCobros           Accion = "ver_cobros"
	AprobarCobros       Accion = "aprobar_cobros"
	AjusteCobro         Accion = "ajuste_cobro"
	EditarTarifas       Accion = "editar_tarifas"
	CerrarCorte         Accion = "cerrar_corte"
	CRM                 Accion = "crm"
	BibliotecaLeer      Accion = "biblioteca_leer"
	BibliotecaCrear     Accion = "biblioteca_crear"
	GestionUsuarios     Accion = "gestion_usuarios"
	AsistenteIA         Accion = "asistente_ia"
	// F1 producción (brief F1 §2, ANALISIS §4-5):
	// CancelarPieza = POST /piezas/{id}/cancelar (con motivo).
	// ReasignarTarea = PATCH /tareas/{id} cambiando asignado (con oficio válido).
	// VerNotificaciones = GET /notificaciones (siempre solo las propias).
	CancelarPieza     Accion = "cancelar_pieza"
	ReasignarTarea    Accion = "reasignar_tarea"
	VerNotificaciones Accion = "ver_notificaciones"
	// F2 cobros (brief F2, ANALISIS §4.3 y §7.1):
	// ConfirmarCobro/ReclamarCobro = POST /lineas/{id}/confirmar|reclamar
	// (trabajador sobre la suya; admin/dueño sobre cualquiera).
	// MarcarPagado = POST /cortes/{periodo}/pagar|revertir (solo dueño).
	// DecidirCancelada = POST /tareas/{id}/decision (solo dueño, §7.6).
	ConfirmarCobro   Accion = "confirmar_cobro"
	ReclamarCobro    Accion = "reclamar_cobro"
	MarcarPagado     Accion = "marcar_pagado"
	DecidirCancelada Accion = "decidir_cancelada"
	// F3 biblioteca (brief F3 §1 y §4.4, ANALISIS §3.2 fila Biblioteca):
	// PublicarContenido = publicar/rechazar/archivar un formato, hook,
	// referencia o SOP (solo dueño/admin; el equipo propone y queda en
	// borrador). EditarPublicado = editar un contenido ya publicado
	// (solo dueño/admin; el equipo no edita lo publicado). EjecutarSOP =
	// iniciar/marcar/terminar una ejecución de SOP (todo el que lee la
	// biblioteca, incluso equipo, sobre SOPs publicados).
	BibliotecaPublicar Accion = "biblioteca_publicar"
	BibliotecaEditar   Accion = "biblioteca_editar"
	EjecutarSOP        Accion = "ejecutar_sop"
)

// Recurso es el objeto concreto sobre el que se pide permiso. Para las
// acciones "solo lo suyo" (ficha de cliente, tareas, cobros, CRM), OwnerID es
// el id del usuario dueño del recurso: el equipo solo pasa si OwnerID == su
// id. Con Recurso vacío esas acciones dan false para equipo (el handler de
// listado filtra por dueño en F1+).
// Oficios está reservado para F1+ (p. ej. asignar tareas por oficio); sin uso
// en F0.
type Recurso struct {
	Tipo    string
	ID      string
	OwnerID string
	Oficios []string
}

// Usuario es el modelo de persona (contrato API F0). created_at/updated_at van
// como string RFC3339 para no pelear con los formatos de PostgREST.
// Foto y Telefono son *string: serializan null cuando no hay (contrato
// string|null que espera el frontend).
type Usuario struct {
	ID        string   `json:"id"`
	Nombre    string   `json:"nombre"`
	Email     string   `json:"email"`
	Foto      *string  `json:"foto"`
	Telefono  *string  `json:"telefono"`
	Acceso    Acceso   `json:"acceso"`
	Oficios   []string `json:"oficios"`
	CreatedAt string   `json:"created_at,omitempty"`
	UpdatedAt string   `json:"updated_at,omitempty"`
}

// Oficios válidos en API y store: minúsculas sin tildes. ANALISIS §3.1 los
// nombra con tilde ("grabación", "edición", "diseño") y "estrategia/guion";
// NormalizarOficio hace esa traducción y este es el único lugar donde existen
// las formas con tilde.
const (
	OficioGrabacion   = "grabacion"
	OficioEdicion     = "edicion"
	OficioDiseno      = "diseno"
	OficioEstrategia  = "estrategia"
	OficioPublicacion = "publicacion"
	OficioVentas      = "ventas"
)

var aliasOficios = map[string]string{
	"grabacion": "grabacion", "grabación": "grabacion",
	"edicion": "edicion", "edición": "edicion",
	"diseno": "diseno", "diseño": "diseno",
	"estrategia": "estrategia", "estrategia/guion": "estrategia",
	"estrategia/guión": "estrategia", "estrategia/guion/": "estrategia",
	"guion": "estrategia", "guión": "estrategia",
	"publicacion": "publicacion", "publicación": "publicacion",
	"publicacion (community)": "publicacion", "publicación (community)": "publicacion",
	"community": "publicacion",
	"ventas":    "ventas",
}

// NormalizarOficio traduce una forma libre (con o sin tilde, "estrategia/guion",
// "community", mayúsculas) al valor canónico. Devuelve false si no es un oficio
// conocido.
func NormalizarOficio(s string) (string, bool) {
	n, ok := aliasOficios[strings.ToLower(strings.TrimSpace(s))]
	return n, ok
}

// NormalizarOficios normaliza, valida y deduplica una lista, preservando orden.
// Devuelve error indicando el primer valor inválido.
func NormalizarOficios(in []string) ([]string, error) {
	out := []string{}
	vistos := map[string]bool{}
	for _, s := range in {
		n, ok := NormalizarOficio(s)
		if !ok {
			return nil, fmt.Errorf("oficio inválido: %q", s)
		}
		if !vistos[n] {
			vistos[n] = true
			out = append(out, n)
		}
	}
	if out == nil {
		out = []string{}
	}
	return out, nil
}

func tieneOficio(oficios []string, oficio string) bool {
	for _, o := range oficios {
		if strings.ToLower(strings.TrimSpace(o)) == oficio {
			return true
		}
	}
	return false
}

func esAccionConocida(a Accion) bool {
	switch a {
	case VerPanel, CrearEditarClientes, VerFichaCliente, CrearPiezasAsignar,
		VerTareas, CambiarEstadoTarea, AprobarEntrega, VerCobros, AprobarCobros,
		AjusteCobro, EditarTarifas, CerrarCorte, CRM, BibliotecaLeer,
		BibliotecaCrear, GestionUsuarios, AsistenteIA,
		CancelarPieza, ReasignarTarea, VerNotificaciones,
		ConfirmarCobro, ReclamarCobro, MarcarPagado, DecidirCancelada,
		BibliotecaPublicar, BibliotecaEditar, EjecutarSOP:
		return true
	}
	return false
}

// Puede implementa exactamente la matriz de ANALISIS §3.2 (17 acciones F0)
// más las 3 de F1 producción:
//
//   - CancelarPieza y ReasignarTarea: solo dueño/admin (el motivo obligatorio y
//     la validación de oficio del nuevo asignado viven en el handler, no aquí).
//
//   - VerNotificaciones: dueño/admin todo; equipo solo las propias
//     (Recurso.OwnerID == su id), igual que VerTareas/VerCobros.
//
//   - dueno: todo.
//
//   - admin: todo menos EditarTarifas, CerrarCorte, MarcarPagado y
//     DecidirCancelada (ANALISIS §7.1: tarifas, cortes y pagado solo dueño;
//     §7.6: pieza cancelada con trabajo en curso la decide el dueño).
//     GestionUsuarios en true es la puerta gruesa: el detalle lo aplica el
//     handler con PuedeCambiarAcceso, no aquí.
//
//   - equipo: BibliotecaLeer, BibliotecaCrear (como propuesta), EjecutarSOP
//     y AsistenteIA (solo sobre lo que ya puede ver); BibliotecaPublicar y
//     BibliotecaEditar siempre false (BRIEF F3 §4.4: equipo no publica ni
//     rechaza ni edita lo publicado); lo "solo suyo" (ficha de cliente,
//     tareas, estado de tarea, cobros, confirmar/reclamar cobro,
//     notificaciones) exige Recurso.OwnerID == su id; CRM exige además
//     oficio ventas.
//
//   - pendiente y desactivado: nada (false en todo).
//
//   - Acción desconocida: false (denegar por defecto).
func Puede(u Usuario, accion Accion, recurso Recurso) bool {
	switch u.Acceso {
	case AccesoDueno:
		return esAccionConocida(accion)
	case AccesoAdmin:
		switch accion {
		case EditarTarifas, CerrarCorte, MarcarPagado, DecidirCancelada:
			return false
		default:
			return esAccionConocida(accion)
		}
	case AccesoEquipo:
		switch accion {
		case BibliotecaLeer, BibliotecaCrear, AsistenteIA, EjecutarSOP:
			return true
		case VerFichaCliente, VerTareas, CambiarEstadoTarea, VerCobros, VerNotificaciones,
			ConfirmarCobro, ReclamarCobro:
			return recurso.OwnerID != "" && recurso.OwnerID == u.ID
		case CRM:
			return tieneOficio(u.Oficios, OficioVentas) &&
				recurso.OwnerID != "" && recurso.OwnerID == u.ID
		default:
			return false
		}
	default: // pendiente, desactivado o acceso desconocido: sin permisos
		return false
	}
}

// NoQuitarUltimoDueno implementa ANALISIS §5.4: siempre debe existir al menos
// un dueño. Devuelve true si el cambio debe BLOQUEARSE (el handler responde
// 409 "no se puede quitar el último dueño"). desactiva=true es el caso de
// POST /usuarios/{id}/desactivar; accesoNuevo cubre PATCH/aprobar.
func NoQuitarUltimoDueno(accesoActual, accesoNuevo Acceso, desactiva bool, totalDuenos int) bool {
	if accesoActual != AccesoDueno {
		return false
	}
	if totalDuenos > 1 {
		return false
	}
	if desactiva {
		return true
	}
	return accesoNuevo != "" && accesoNuevo != AccesoDueno
}

// PuedeCambiarAcceso implementa el chequeo fino de ANALISIS §5.5 (lo usa el
// handler, no Puede): un admin no puede subirse a dueño, ni nombrar admins, ni
// modificar a usuarios que ya son admin o dueño. El dueño puede todo (el caso
// del último dueño lo frena NoQuitarUltimoDueno aparte). Cualquier otro acceso
// no puede cambiar nada. objetivoNuevo == "" significa "sin cambio de acceso"
// (p. ej. solo oficios): permitido si el objetivo es tocable por el actor.
func PuedeCambiarAcceso(actor, objetivoActual, objetivoNuevo Acceso) bool {
	switch actor {
	case AccesoDueno:
		return true
	case AccesoAdmin:
		if objetivoActual == AccesoDueno || objetivoActual == AccesoAdmin {
			return false
		}
		if objetivoNuevo == AccesoDueno || objetivoNuevo == AccesoAdmin {
			return false
		}
		return true
	default:
		return false
	}
}
