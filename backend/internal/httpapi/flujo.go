package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"rconceptsys/backend/internal/store"
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
	var datos map[string]any
	if leerJSONCuerpo(r, 16*1024, &datos) != nil {
		ResponderError(w, 400, "datos_invalidos", "Revisa los datos del trabajo.")
		return
	}
	campos := map[string]any{}
	forzar, _ := datos["forzar"].(bool)
	var nuevaCarpeta string
	for k, v := range datos {
		switch k {
		case "forzar":
			if _, ok := v.(bool); !ok {
				ResponderError(w, 400, "datos_invalidos", "Revisa la confirmación de rol.")
				return
			}
		case "drive_crear":
			s, ok := v.(string)
			if !ok || strings.TrimSpace(s) == "" || len([]rune(s)) > 80 || datos["drive_carpeta_id"] != nil {
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
		f, e := a.crearCarpetaDeTrabajo(r.Context(), t.ClienteID, nuevaCarpeta)
		if e != nil {
			ResponderError(w, 400, "carpeta_invalida", e.Error())
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
	a.enviarAvisoA(r.Context(), actualizado.AsignadoA, AvisoPush{Titulo: "Trabajo actualizado · " + FechaEntrega(actualizado.FechaLimite, time.Now()), Cuerpo: datosAvisoTarea(actualizado), URL: fmt.Sprintf("/tareas?tarea=%d#tarea-%d", id, id), Etiqueta: "tarea-editada"})
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
	if clienteID == nil {
		return fmt.Errorf("Primero elige un cliente con carpeta de Drive.")
	}
	c, err := a.Store.ObtenerClientePorID(ctx, *clienteID)
	if err != nil || c.DriveCarpetaID == nil {
		return fmt.Errorf("Configura primero la carpeta de Drive del cliente.")
	}
	token, err := a.tokenDrive(ctx)
	if err != nil {
		return fmt.Errorf("Conecta el Drive del equipo para comprobar la carpeta.")
	}
	var f struct {
		Mime    string   `json:"mimeType"`
		Parents []string `json:"parents"`
		Trashed bool     `json:"trashed"`
	}
	if a.pedirDrive(ctx, token, driveAPIBase+"/files/"+url.PathEscape(carpetaID)+"?fields=mimeType,parents,trashed", &f) != nil || f.Trashed || f.Mime != driveCarpetaMime {
		return fmt.Errorf("No pudimos comprobar esa carpeta de Drive.")
	}
	for _, p := range f.Parents {
		if p == *c.DriveCarpetaID {
			return nil
		}
	}
	return fmt.Errorf("La carpeta del trabajo debe estar dentro de la carpeta del cliente.")
}

func (a *API) crearCarpetaDeTrabajo(ctx context.Context, clienteID *int, nombre string) (*DriveArchivo, error) {
	if clienteID == nil {
		return nil, fmt.Errorf("Primero elige un cliente con carpeta de Drive.")
	}
	c, err := a.Store.ObtenerClientePorID(ctx, *clienteID)
	if err != nil || c.DriveCarpetaID == nil {
		return nil, fmt.Errorf("Configura primero la carpeta de Drive del cliente.")
	}
	tok, err := a.tokenDrive(ctx)
	if err != nil {
		return nil, fmt.Errorf("Conecta el Drive del equipo para crear la carpeta.")
	}
	f, err := a.asegurarSubcarpeta(ctx, tok, nombre, *c.DriveCarpetaID)
	if err != nil {
		return nil, fmt.Errorf("No pudimos crear la carpeta en Drive. Puedes reintentar.")
	}
	return f, nil
}

// Crea o reutiliza una subcarpeta por nombre: reintentar no duplica Material/Producto.
func (a *API) asegurarSubcarpeta(ctx context.Context, token, nombre, parent string) (*DriveArchivo, error) {
	q := url.Values{"q": {"trashed = false and mimeType = '" + driveCarpetaMime + "' and name = '" + escaparQueryDrive(nombre) + "' and '" + escaparQueryDrive(parent) + "' in parents"}, "fields": {"files(id,name,webViewLink)"}}
	var lista struct {
		Files []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
			Link string `json:"webViewLink"`
		} `json:"files"`
	}
	if err := a.pedirDrive(ctx, token, driveAPIBase+"/files?"+q.Encode(), &lista); err != nil {
		return nil, err
	}
	if len(lista.Files) > 0 {
		f := lista.Files[0]
		return &DriveArchivo{ID: f.ID, Nombre: f.Name, Enlace: "https://drive.google.com/drive/folders/" + f.ID, EsCarpeta: true}, nil
	}
	return a.crearCarpetaDrive(ctx, token, nombre, parent)
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
	token, err := a.tokenDrive(r.Context())
	if err != nil {
		ResponderError(w, 400, "drive_no_conectado", "Primero conecta el Drive del equipo desde Gestión.")
		return
	}
	parent := req.CarpetaID
	if req.Crear {
		conexion, e := a.Store.ObtenerConexionDrive(r.Context())
		if e != nil {
			ResponderError(w, 400, "drive_no_conectado", "Conecta el Drive del equipo.")
			return
		}
		raiz := conexion.CarpetaRaizID
		if raiz == "" {
			raiz = "root"
		}
		f, e := a.asegurarSubcarpeta(r.Context(), token, c.Nombre, raiz)
		if e != nil {
			ResponderError(w, 502, "drive_error", "No pudimos crear la carpeta del cliente.")
			return
		}
		parent = f.ID
	} else {
		if !driveIDValido(parent) {
			ResponderError(w, 400, "carpeta_invalida", "Selecciona una carpeta de Drive.")
			return
		}
		var f struct {
			Mime    string `json:"mimeType"`
			Trashed bool   `json:"trashed"`
		}
		if a.pedirDrive(r.Context(), token, driveAPIBase+"/files/"+url.PathEscape(parent)+"?fields=mimeType,trashed", &f) != nil || f.Mime != driveCarpetaMime || f.Trashed {
			ResponderError(w, 400, "carpeta_invalida", "No pudimos comprobar esa carpeta.")
			return
		}
	}
	material, e := a.asegurarSubcarpeta(r.Context(), token, "Material del lugar", parent)
	if e != nil {
		ResponderError(w, 502, "drive_error", "No pudimos preparar Material del lugar. Puedes reintentar.")
		return
	}
	producto, e := a.asegurarSubcarpeta(r.Context(), token, "Producto", parent)
	if e != nil {
		ResponderError(w, 502, "drive_error", "No pudimos preparar Producto. Puedes reintentar.")
		return
	}
	actual, e := a.Store.ActualizarCliente(r.Context(), id, map[string]any{"drive_carpeta_id": parent, "drive_url": "https://drive.google.com/drive/folders/" + parent, "material_carpeta_id": material.ID, "producto_carpeta_id": producto.ID})
	if e != nil {
		ResponderError(w, 500, "error_guardar", "Las carpetas están preparadas, pero no pudimos guardar la ficha. Reintenta.")
		return
	}
	ResponderJSON(w, 200, actual)
}
