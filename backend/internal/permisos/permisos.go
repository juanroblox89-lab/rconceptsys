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

// Accion es cada fila de la matriz ANALISIS §3.2.
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
		BibliotecaCrear, GestionUsuarios, AsistenteIA:
		return true
	}
	return false
}

// Puede implementa exactamente la matriz de ANALISIS §3.2.
//
//   - dueno: todo.
//   - admin: todo menos EditarTarifas y CerrarCorte (por defecto hasta que Juan
//     decida, ANALISIS §7.1; propuesta: solo dueño). GestionUsuarios en true es
//     la puerta gruesa: el detalle (solo aprobar pendientes a equipo y cambiar
//     oficios de equipo, nunca tocar admin/dueño) lo aplica el handler con
//     PuedeCambiarAcceso, no aquí.
//   - equipo: BibliotecaLeer, BibliotecaCrear (como propuesta: queda en
//     borrador hasta que un admin publique) y AsistenteIA (solo sobre lo que ya
//     puede ver); lo "solo suyo" (ficha de cliente, tareas, estado de tarea,
//     cobros) exige Recurso.OwnerID == su id; CRM exige además oficio ventas.
//   - pendiente y desactivado: nada (false en todo).
//   - Acción desconocida: false (denegar por defecto).
func Puede(u Usuario, accion Accion, recurso Recurso) bool {
	switch u.Acceso {
	case AccesoDueno:
		return esAccionConocida(accion)
	case AccesoAdmin:
		switch accion {
		case EditarTarifas, CerrarCorte:
			return false
		default:
			return esAccionConocida(accion)
		}
	case AccesoEquipo:
		switch accion {
		case BibliotecaLeer, BibliotecaCrear, AsistenteIA:
			return true
		case VerFichaCliente, VerTareas, CambiarEstadoTarea, VerCobros:
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
