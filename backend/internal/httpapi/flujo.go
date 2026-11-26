package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"rconceptsys/backend/internal/store"
	"slices"
	"strconv"
	"strings"
	"time"
)

// FechaEntrega usa días civiles de Bogotá, no intervalos de 24 h desde la hora actual.
func FechaEntrega(fecha *string, ahora time.Time) string {
	if fecha == nil || *fecha == "" {
		return "sin fecha"
	}
	d, err := time.ParseInLocation("2006-01-02", *fecha, store.LocBogota)
	if err != nil {
		return "sin fecha"
	}
	dias := int(d.Sub(store.InicioDiaBogota(ahora)).Hours() / 24)
	switch dias {
	case 0:
		return "para hoy"
	case 1:
		return "para mañana"
	case 2:
		return "para pasado mañana"
	}
	diasSemana := []string{"domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"}
	if dias < 0 {
		return "venció el " + diasSemana[d.Weekday()] + fmt.Sprintf(" %d", d.Day())
	}
	return "para el " + diasSemana[d.Weekday()] + fmt.Sprintf(" %d", d.Day())
}

func (a *API) handleAdminGetTarea(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		ResponderError(w, 400, "id_invalido", "No encontramos ese trabajo.")
		return
	}
	t, err := a.Store.ObtenerTareaPorID(r.Context(), id)
	if err == store.ErrNotFound {
		ResponderError(w, 404, "tarea_no_encontrada", "No encontramos ese trabajo.")
		return
	}
	if err != nil {
		ResponderError(w, 500, "error_trabajo", "No pudimos cargar ese trabajo.")
		return
	}
	if hist, e := a.Store.ObtenerHistorialTarea(r.Context(), id); e == nil {
		t.Historial = hist
	}
	if t.Estado == store.EstadoTareaHecha {
		if yo := a.usuarioActual(r); yo != nil {
			_ = a.Store.MarcarAsignacionesVistas(r.Context(), yo.ID, []int64{id})
		}
	}
	a.enriquecerTareasReferencias(r.Context(), []*store.Tarea{t})
	ResponderJSON(w, 200, t)
}

func (a *API) handleAdminPatchTarea(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		ResponderError(w, 400, "id_invalido", "No encontramos ese trabajo.")
		return
	}
	t, err := a.Store.ObtenerTareaPorID(r.Context(), id)
	if err != nil {
		ResponderError(w, 404, "tarea_no_encontrada", "No encontramos ese trabajo.")
		return
	}
	var datos map[string]json.RawMessage
	if leerJSONCuerpo(r, 16*1024, &datos) != nil {
		ResponderError(w, 400, "datos_invalidos", "Revisa los datos del trabajo.")
		return
	}
	campos := map[string]any{}
	var forzar bool
	var nuevaCarpeta string
	for k, raw := range datos {
		if k == "drive_referencias" {
			refs, err := validarReferenciasTrabajo(raw)
			if err != nil {
				ResponderError(w, 400, "referencias_invalidas", err.Error())
				return
			}
			refs = a.enriquecerReferenciasTrabajo(r.Context(), refs)
			if t.DriveReferencias == nil || !slices.Equal(refs, t.DriveReferencias) {
				campos[k] = refs
			}
			continue
		}
		var v any
		if json.Unmarshal(raw, &v) != nil {
			ResponderError(w, 400, "datos_invalidos", "Revisa los datos del trabajo.")
			return
		}
		switch k {
		case "forzar":
			var ok bool
			if forzar, ok = v.(bool); !ok {
				ResponderError(w, 400, "datos_invalidos", "Revisa la confirmación de rol.")
				return
			}
		case "drive_crear":
			s, ok := v.(string)
			if !ok || strings.TrimSpace(s) == "" || len([]rune(s)) > 80 || (datos["drive_carpeta_id"] != nil && string(datos["drive_carpeta_id"]) != "null") {
				ResponderError(w, 400, "carpeta_invalida", "Elige una sola carpeta y usa un nombre de hasta 80 caracteres.")
				return
			}
			nuevaCarpeta = strings.TrimSpace(s)
		case "tipo_id":
			n, ok := v.(float64)
			if !ok || n != float64(int(n)) {
				ResponderError(w, 400, "tipo_invalido", "Selecciona un tipo de trabajo.")
				return
			}
			tipo, e := a.Store.ObtenerTipoTrabajoPorID(r.Context(), int(n))
			if e != nil || !tipo.Activo {
				ResponderError(w, 400, "tipo_invalido", "Selecciona un tipo de trabajo activo.")
				return
			}
			campos[k] = int(n)
		case "asignado_a":
			s, ok := v.(string)
			if !ok {
				ResponderError(w, 400, "persona_invalida", "Selecciona una persona.")
				return
			}
			p, e := a.Store.ObtenerPerfilPorID(r.Context(), s)
			if e != nil || p.Estado != store.EstadoAprobado || p.EsAdmin {
				ResponderError(w, 400, "persona_invalida", "Selecciona una persona aprobada del equipo.")
				return
			}
			campos[k] = s
		case "descripcion", "fecha_limite":
			s, ok := v.(string)
			if !ok || len([]rune(s)) > 1000 {
				ResponderError(w, 400, "texto_invalido", "Revisa la descripción y la fecha.")
				return
			}
			if k == "fecha_limite" {
				if _, e := time.Parse("2006-01-02", s); e != nil {
					ResponderError(w, 400, "fecha_invalida", "Selecciona una fecha de entrega válida.")
					return
				}
			}
			campos[k] = strings.TrimSpace(s)
		case "drive_carpeta_id":
			s, ok := v.(string)
			if !ok || !driveIDValido(s) {
				ResponderError(w, 400, "carpeta_invalida", "Selecciona una carpeta válida de Drive.")
				return
			}
			if e := a.verificarCarpetaCliente(r.Context(), t.ClienteID, s); e != nil {
				ResponderError(w, 400, "carpeta_invalida", e.Error())
				return
			}
			campos[k] = s
			campos["drive_carpeta_url"] = "https://drive.google.com/drive/folders/" + s
		default:
			ResponderError(w, 400, "campo_no_permitido", "Ese dato no se puede cambiar desde aquí.")
			return
		}
	}
	if t.Estado != store.EstadoTareaPendiente && t.Estado != store.EstadoTareaRechazada {
		ResponderError(w, 409, "trabajo_cerrado", "Solo puedes editar trabajos pendientes o devueltos.")
		return
	}
	if campos["tipo_id"] != nil || campos["asignado_a"] != nil {
		tipoID, personaID := t.TipoID, t.AsignadoA
		if v, ok := campos["tipo_id"].(int); ok {
			tipoID = v
		}
		if v, ok := campos["asignado_a"].(string); ok {
			personaID = v
		}
		if !forzar && (tipoID != t.TipoID || personaID != t.AsignadoA) {
			tipo, e1 := a.Store.ObtenerTipoTrabajoPorID(r.Context(), tipoID)
			persona, e2 := a.Store.ObtenerPerfilPorID(r.Context(), personaID)
			if e1 != nil || e2 != nil {
				ResponderError(w, 400, "datos_invalidos", "Revisa el tipo de trabajo y la persona.")
				return
			}
			if tipo.RolID != nil {
				coincide := false
				for _, rol := range persona.Roles {
					if rol.ID == *tipo.RolID {
						coincide = true
						break
					}
				}
				if !coincide {
					ResponderError(w, 422, "rol_no_coincide", "La persona no tiene el rol de este trabajo.")
					return
				}
			}
		}
	}
	if nuevaCarpeta != "" {
		copia := *t
		if v, ok := campos["tipo_id"].(int); ok {
			copia.Tipo, _ = a.Store.ObtenerTipoTrabajoPorID(r.Context(), v)
		}
		if v, ok := campos["descripcion"].(string); ok {
			copia.Descripcion = &v
		}
		if v, ok := campos["fecha_limite"].(string); ok {
			copia.FechaLimite = &v
		}
		f, e := a.crearCarpetaDeTrabajo(r.Context(), &copia)
		if e != nil {
			responderFalloDrive(w, e)
			return
		}
		campos["drive_carpeta_id"], campos["drive_carpeta_url"] = f.ID, f.Enlace
	}
	for k, v := range campos {
		switch k {
		case "tipo_id":
			if v == t.TipoID {
				delete(campos, k)
			}
		case "asignado_a":
			if v == t.AsignadoA {
				delete(campos, k)
			}
		case "descripcion":
			if t.Descripcion != nil && v == *t.Descripcion {
				delete(campos, k)
			}
		case "fecha_limite":
			if t.FechaLimite != nil && v == *t.FechaLimite {
				delete(campos, k)
			}
		case "drive_carpeta_id":
			if t.DriveCarpetaID != nil && v == *t.DriveCarpetaID {
				delete(campos, k)
			}
		case "drive_carpeta_url":
			if t.DriveCarpetaURL != nil && v == *t.DriveCarpetaURL {
				delete(campos, k)
			}
		}
	}
	if len(campos) == 0 {
		ResponderJSON(w, 200, t)
		return
	}
	actualizado, err := a.Store.ActualizarTarea(r.Context(), id, campos)
	if err == store.ErrConflict {
		ResponderError(w, 409, "trabajo_cerrado", "Solo puedes editar trabajos pendientes o devueltos.")
		return
	}
	if err != nil {
		ResponderError(w, 500, "error_guardar", "No pudimos guardar los cambios.")
		return
	}
	yo := a.usuarioActual(r)
	actorID := ""
	if yo != nil {
		actorID = yo.ID
	}
	if nuevo, ok := campos["asignado_a"].(string); ok && nuevo != t.AsignadoA {
		a.avisarCambioAsignacion(r.Context(), actualizado, t.AsignadoA, actorID)
	} else {
		a.avisarPedidoActualizado(r.Context(), actualizado, actorID, "Cambios en el pedido")
	}
	a.enriquecerTareasReferencias(r.Context(), []*store.Tarea{actualizado})
	ResponderJSON(w, 200, actualizado)
}

func datosAvisoTarea(t *store.Tarea) string {
	var partes []string
	if t.Cliente != nil {
		partes = append(partes, t.Cliente.Nombre)
	}
	if t.Tipo != nil {
		partes = append(partes, t.Tipo.Nombre)
	}
	if len(partes) == 0 {
		return recortar(t.Titulo, 90)
	}
	return recortar(strings.Join(partes, " · "), 150)
}

func driveIDValido(s string) bool {
	if len(s) < 3 || len(s) > 160 {
		return false
	}
	for _, c := range s {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '-') {
			return false
		}
	}
	return true
}

func (a *API) verificarCarpetaCliente(ctx context.Context, clienteID *int, carpetaID string) error {
	a.F5.DriveMu.Lock()
	defer a.F5.DriveMu.Unlock()
	c, token, err := a.contextoArbolDrive(ctx)
	if err != nil {
		return fmt.Errorf("Conecta el Drive del equipo para comprobar la carpeta.")
	}
	padre, err := a.padreDeTrabajoDrive(ctx, c, token, clienteID)
	if err != nil {
		return fmt.Errorf("No pudimos preparar la carpeta del cliente.")
	}
	f, err := a.metadatosCarpeta(ctx, token, carpetaID)
	if err != nil || !f.carpetaEn(padre) || f.Nombre == "Material del lugar" || f.Nombre == "Producto" {
		return fmt.Errorf("Elige una carpeta de trabajo dentro de la carpeta correspondiente.")
	}
	return nil
}

func (a *API) handleAdminClienteDrive(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		ResponderError(w, 400, "id_invalido", "Elige un cliente.")
		return
	}
	c, err := a.Store.ObtenerClientePorID(r.Context(), id)
	if err != nil {
		ResponderError(w, 404, "cliente_no_encontrado", "No encontramos ese cliente.")
		return
	}
	var req struct {
		Crear     bool   `json:"crear"`
		CarpetaID string `json:"carpeta_id"`
	}
	if leerJSONCuerpo(r, 8192, &req) != nil {
		ResponderError(w, 400, "datos_invalidos", "Elige una carpeta o crea una nueva.")
		return
	}
	a.F5.DriveMu.Lock()
	defer a.F5.DriveMu.Unlock()
	ctx := r.Context()
	conexion, token, err := a.contextoArbolDrive(ctx)
	if err != nil {
		responderFalloDrive(w, err)
		return
	}
	var actual *store.Cliente
	if req.Crear {
		actual, err = a.asegurarClienteDrive(ctx, token, conexion.CarpetaClientesID, c)
	} else {
		if !driveIDValido(req.CarpetaID) {
			ResponderError(w, 400, "carpeta_invalida", "Selecciona una carpeta válida.")
			return
		}
		f, e := a.metadatosCarpeta(ctx, token, req.CarpetaID)
		if e != nil || !f.carpetaEn(conexion.CarpetaClientesID) || normalizarNombreCarpetaDrive(f.Nombre) != normalizarNombreCarpetaDrive(c.Nombre) {
			ResponderError(w, 400, "carpeta_invalida", "Elige la carpeta del cliente dentro de la raíz de Drive del equipo.")
			return
		}
		actual, err = a.guardarCarpetaCliente(ctx, c, f.ID)
	}
	if err != nil {
		responderFalloDrive(w, err)
		return
	}
	ResponderJSON(w, 200, actual)
}
