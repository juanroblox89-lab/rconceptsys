// Package httpapi — F1 producción: handlers de clientes, piezas, tareas y
// notificaciones. Mismo patrón F0: resolveUser + permisos.Puede + secreto
// interno X-RC-Internal + CORS 3300. Solo stdlib.
//
// Reglas que impone cada handler (ANALISIS):
//   - §3.1.3/§5.29: equipo solo ve clientes donde tiene o tuvo tareas; URL
//     ajena → 403 sin datos.
//   - §5.28: cliente pausado no admite piezas nuevas.
//   - §5.16: el cliente nunca se borra (archivar = fijar archivado_at).
//   - §5.8: asignar/reasignar valida el oficio de la etapa → 422 si no.
//   - §5.9: entregar exige el dato de la etapa → 400 si falta.
//   - §5.10: vencida = fecha límite pasada y no aprobada (flag calculado).
//   - §5.11: cada devolución queda en tarea_eventos.
//   - §5.12: cancelar pieza exige motivo (solo admin); tareas no empezadas se
//     cancelan, aprobadas quedan, en curso/entregadas quedan marcadas
//     (decision_pendiente) para que el admin decida.
//   - §5.13: reasignar en curso valida oficio y registra actividad.
//   - §5.14: updated_at como versión → 409 "esto cambió mientras editabas".
//   - §5.15: grabación de apoyo no bloquea ni espera.
//   - §5.32: idempotencia — repetir la misma acción en el mismo estado = 200
//     sin duplicar eventos ni notificaciones.
//   - §6: cada cambio → actividad.Registrar (quién/qué/antes→después/motivo).
package httpapi

import (
	"net/http"
	"strings"

	"rconceptsys/backend/internal/actividad"
	"rconceptsys/backend/internal/cobros"
	"rconceptsys/backend/internal/permisos"
	"rconceptsys/backend/internal/produccion"
	"rconceptsys/backend/internal/store"
)

// rutasF1 registra los endpoints de producción en el mux.
func (s *Server) rutasF1(mux *http.ServeMux) {
	mux.HandleFunc("GET /clientes", s.listClientes)
	mux.HandleFunc("POST /clientes", s.createCliente)
	mux.HandleFunc("GET /clientes/{id}", s.getCliente)
	mux.HandleFunc("PATCH /clientes/{id}", s.patchCliente)
	mux.HandleFunc("POST /clientes/{id}/archivar", s.archivarCliente)

	mux.HandleFunc("GET /piezas", s.listPiezas)
	mux.HandleFunc("POST /piezas", s.createPieza)
	mux.HandleFunc("GET /piezas/{id}", s.getPieza)
	mux.HandleFunc("PATCH /piezas/{id}", s.patchPieza)
	mux.HandleFunc("POST /piezas/{id}/cancelar", s.cancelarPieza)

	mux.HandleFunc("GET /tareas", s.listTareas)
	mux.HandleFunc("GET /tareas/{id}", s.getTarea)
	mux.HandleFunc("PATCH /tareas/{id}", s.patchTarea)
	mux.HandleFunc("POST /tareas/{id}/empezar", s.empezarTarea)
	mux.HandleFunc("POST /tareas/{id}/entregar", s.entregarTarea)
	mux.HandleFunc("POST /tareas/{id}/aprobar", s.aprobarTarea)
	mux.HandleFunc("POST /tareas/{id}/devolver", s.devolverTarea)
	mux.HandleFunc("GET /tareas/{id}/eventos", s.listTareaEventos)

	mux.HandleFunc("GET /notificaciones", s.listNotificaciones)
	mux.HandleFunc("POST /notificaciones/{id}/leer", s.leerNotificacion)
}

// --- helpers F1 ---

func esAdmin(u permisos.Usuario) bool {
	return u.Acceso == permisos.AccesoDueno || u.Acceso == permisos.AccesoAdmin
}

// clientesVisiblesPara devuelve el set de clientes que ve el usuario.
// Admin/dueño: todos (nil = sin filtro). Equipo: solo donde tiene o tuvo
// tareas (§3.1.3).
func (s *Server) clientesVisiblesPara(u permisos.Usuario) (map[string]bool, error) {
	if esAdmin(u) {
		return nil, nil
	}
	tareas, err := s.st.ListTareas()
	if err != nil {
		return nil, err
	}
	eventos, err := s.st.TodosTareaEventos()
	if err != nil {
		return nil, err
	}
	piezas, err := s.st.ListPiezas()
	if err != nil {
		return nil, err
	}
	return produccion.ClientesVisibles(u.ID, tareas, eventos, piezas), nil
}

func (s *Server) puedeVerCliente(u permisos.Usuario, clienteID string) (bool, error) {
	if esAdmin(u) {
		return true, nil
	}
	vis, err := s.clientesVisiblesPara(u)
	if err != nil {
		return false, err
	}
	return vis[clienteID], nil
}

// conTarea trae la tarea o responde 404/502. ok=false si ya respondió.
func (s *Server) conTarea(w http.ResponseWriter, id string) (store.Tarea, bool) {
	t, existe, err := s.st.GetTarea(id)
	if err != nil {
		errorDatos(w, err)
		return store.Tarea{}, false
	}
	if !existe {
		writeError(w, http.StatusNotFound, "tarea no encontrada")
		return store.Tarea{}, false
	}
	return t, true
}

// conPieza trae la pieza o responde 404/502.
func (s *Server) conPieza(w http.ResponseWriter, id string) (store.Pieza, bool) {
	p, existe, err := s.st.GetPieza(id)
	if err != nil {
		errorDatos(w, err)
		return store.Pieza{}, false
	}
	if !existe {
		writeError(w, http.StatusNotFound, "pieza no encontrada")
		return store.Pieza{}, false
	}
	return p, true
}

// registrarTarea guarda el evento de historial + actividad global, y crea
// notificaciones salvo que sea idempotente (mismoEstado=true → no duplica).
func (s *Server) registrarTarea(actor permisos.Usuario, tareaID, accion string, antes, despues any, comentario string, mismoEstado bool) {
	var c *string
	if comentario != "" {
		c = &comentario
	}
	_, _ = s.st.AddTareaEvento(store.TareaEvento{
		TareaID: tareaID, ActorID: actor.ID, ActorNombre: actor.Nombre,
		Accion: accion, Antes: antes, Despues: despues, Comentario: c,
	})
	_, _ = actividad.Registrar(s.st, actor, accion+"_tarea", tareaID, antes, despues, comentario)
	if mismoEstado {
		return
	}
	_ = mismoEstado
}

// notificar crea una notificación in-app para un usuario.
func (s *Server) notificar(usuarioID, tipo, titulo, detalle, recurso, recursoID string) {
	if usuarioID == "" {
		return
	}
	_, _ = s.st.AddNotificacion(store.Notificacion{
		UsuarioID: usuarioID, Tipo: tipo, Titulo: titulo, Detalle: detalle,
		Recurso: recurso, RecursoID: recursoID,
	})
}

// tareaVista enriquece la tarea con nombres y vencida calculada.
func tareaVista(t store.Tarea, piezas map[string]store.Pieza, usuarios map[string]permisos.Usuario, clientes map[string]store.Cliente, hoy string) map[string]any {
	v := map[string]any{
		"id": t.ID, "pieza_id": t.PiezaID, "etapa": t.Etapa,
		"asignado_id": t.AsignadoID, "estado": t.Estado,
		"fecha_limite": t.FechaLimite, "material_url": t.MaterialURL,
		"minutos": t.Minutos, "entregable_url": t.EntregableURL,
		"publicado_url":      t.PublicadoURL,
		"decision_pendiente": t.DecisionPendiente,
		"vencida":            produccion.EsVencida(t.FechaLimite, t.Estado, hoy),
		"created_at":         t.CreatedAt, "updated_at": t.UpdatedAt,
	}
	if p, ok := piezas[t.PiezaID]; ok {
		v["pieza_titulo"] = p.Titulo
		v["cliente_id"] = p.ClienteID
		if c, ok := clientes[p.ClienteID]; ok {
			v["cliente_nombre"] = c.Nombre
		}
	}
	if t.AsignadoID != "" {
		if u, ok := usuarios[t.AsignadoID]; ok {
			v["asignado_nombre"] = u.Nombre
		}
	}
	return v
}

func (s *Server) mapasAux() (map[string]store.Pieza, map[string]permisos.Usuario, map[string]store.Cliente, error) {
	piezas := map[string]store.Pieza{}
	if ps, err := s.st.ListPiezas(); err != nil {
		return nil, nil, nil, err
	} else {
		for _, p := range ps {
			piezas[p.ID] = p
		}
	}
	usuarios := map[string]permisos.Usuario{}
	if us, err := s.st.ListUsuarios(); err != nil {
		return nil, nil, nil, err
	} else {
		for _, u := range us {
			usuarios[u.ID] = u
		}
	}
	clientes := map[string]store.Cliente{}
	if cs, err := s.st.ListClientes(true); err != nil {
		return nil, nil, nil, err
	} else {
		for _, c := range cs {
			clientes[c.ID] = c
		}
	}
	return piezas, usuarios, clientes, nil
}

// validaAsignado chequea §5.8 (oficio de la etapa) + §5.2 (acceso que
// puede trabajar): el usuario existe, tiene el oficio y no está
// pendiente/desactivado. "" = sin asignar (válido). Devuelve el usuario
// o responde 404/422.
func (s *Server) validaAsignado(w http.ResponseWriter, etapa, asignadoID string) (permisos.Usuario, bool) {
	if asignadoID == "" {
		return permisos.Usuario{}, true
	}
	u, existe, err := s.st.GetUsuario(asignadoID)
	if err != nil {
		errorDatos(w, err)
		return permisos.Usuario{}, false
	}
	if !existe {
		writeError(w, http.StatusNotFound, "la persona asignada no existe")
		return permisos.Usuario{}, false
	}
	oficio, ok := produccion.OficioDeEtapa(etapa)
	if !ok {
		writeError(w, http.StatusBadRequest, "etapa inválida")
		return permisos.Usuario{}, false
	}
	tiene := false
	for _, o := range u.Oficios {
		if o == oficio {
			tiene = true
			break
		}
	}
	if !tiene {
		writeError(w, http.StatusUnprocessableEntity, "esa persona no tiene el oficio de esta etapa")
		return permisos.Usuario{}, false
	}
	// §5.2: pendiente/desactivado no reciben tareas aunque tengan el oficio.
	if u.Acceso != permisos.AccesoEquipo && u.Acceso != permisos.AccesoAdmin && u.Acceso != permisos.AccesoDueno {
		writeError(w, http.StatusUnprocessableEntity, "esa persona no puede recibir tareas en este momento")
		return permisos.Usuario{}, false
	}
	return u, true
}

// --- /clientes ---

func clienteVista(c store.Cliente) map[string]any {
	return map[string]any{
		"id": c.ID, "nombre": c.Nombre, "logo_url": c.LogoURL,
		"contacto_nombre": c.ContactoNombre, "contacto_telefono": c.ContactoTelefono,
		"contacto_whatsapp": c.ContactoWhatsapp, "paquete": c.Paquete,
		"paquete_id": c.PaqueteID, "vendido_por": c.VendidoPor,
		"formato_recomendado_id": c.FormatoRecomendadoID,
		"hook_recomendado_id":    c.HookRecomendadoID,
		"estado": c.Estado, "drive_url": c.DriveURL, "notas": c.Notas,
		"estrategia": c.Estrategia, "archivado_at": c.ArchivadoAt,
		"created_at": c.CreatedAt, "updated_at": c.UpdatedAt,
	}
}

// validaVendedor chequea F2 §4: el vendedor existe, tiene oficio ventas y no
// está pendiente/desactivado. Responde 404/422 y devuelve false si ya
// respondió.
func (s *Server) validaVendedor(w http.ResponseWriter, vendedorID string) (string, bool) {
	v, existe, err := s.st.GetUsuario(vendedorID)
	if err != nil {
		errorDatos(w, err)
		return "", false
	}
	if !existe {
		writeError(w, http.StatusNotFound, "el vendedor no existe")
		return "", false
	}
	tieneVentas := false
	for _, o := range v.Oficios {
		if o == permisos.OficioVentas {
			tieneVentas = true
			break
		}
	}
	if !tieneVentas {
		writeError(w, http.StatusUnprocessableEntity, "el vendedor debe tener oficio ventas")
		return "", false
	}
	if v.Acceso == permisos.AccesoPendiente || v.Acceso == permisos.AccesoDesactivado {
		writeError(w, http.StatusUnprocessableEntity, "el vendedor no puede ser pendiente ni desactivado")
		return "", false
	}
	return "", true
}

func (s *Server) listClientes(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	inclArch := r.URL.Query().Get("incluir_archivados") == "1"
	clientes, err := s.st.ListClientes(inclArch)
	if err != nil {
		errorDatos(w, err)
		return
	}
	if !esAdmin(u) {
		vis, err := s.clientesVisiblesPara(u)
		if err != nil {
			errorDatos(w, err)
			return
		}
		filtrados := []store.Cliente{}
		for _, c := range clientes {
			if vis[c.ID] {
				filtrados = append(filtrados, c)
			}
		}
		clientes = filtrados
	}
	vista := make([]map[string]any, 0, len(clientes))
	for _, c := range clientes {
		vista = append(vista, clienteVista(c))
	}
	writeJSON(w, http.StatusOK, map[string]any{"clientes": vista})
}

type clienteBody struct {
	Nombre           string `json:"nombre"`
	LogoURL          string `json:"logo_url"`
	ContactoNombre   string `json:"contacto_nombre"`
	ContactoTelefono string `json:"contacto_telefono"`
	ContactoWhatsapp string `json:"contacto_whatsapp"`
	Paquete          string `json:"paquete"`
	// F2: referencia al catálogo + vendedor (BRIEF F2 §4).
	PaqueteID  string `json:"paquete_id"`
	VendidoPor string `json:"vendido_por"`
	// F3: formato y hook recomendados (solo referencia, BRIEF F3 §1).
	FormatoRecomendadoID string `json:"formato_recomendado_id"`
	HookRecomendadoID    string `json:"hook_recomendado_id"`
	Estado               string `json:"estado"`
	DriveURL             string `json:"drive_url"`
	Notas                string `json:"notas"`
	Estrategia           string `json:"estrategia"`
	UpdatedAt            string `json:"updated_at"`
}

func (s *Server) createCliente(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.CrearEditarClientes, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	var body clienteBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	if strings.TrimSpace(body.Nombre) == "" {
		writeError(w, http.StatusBadRequest, "el nombre es obligatorio")
		return
	}
	estado := strings.TrimSpace(body.Estado)
	if estado == "" {
		estado = produccion.ClienteActivo
	}
	if !produccion.EstadoClienteValido(estado) {
		writeError(w, http.StatusBadRequest, "estado inválido")
		return
	}
	// F2: paquete_id debe existir; vendido_por debe tener oficio ventas y
	// un acceso que trabaje (§5.2: pendiente/desactivado → 422).
	paqueteID := strings.TrimSpace(body.PaqueteID)
	if paqueteID != "" {
		if _, existe, err := s.st.GetPaquete(paqueteID); err != nil {
			errorDatos(w, err)
			return
		} else if !existe {
			writeError(w, http.StatusBadRequest, "paquete_id no existe")
			return
		}
	}
	vendidoPor := strings.TrimSpace(body.VendidoPor)
	if vendidoPor != "" {
		if msg, ok := s.validaVendedor(w, vendidoPor); !ok {
			_ = msg
			return
		}
	}
	// F3: vínculo formato/hook recomendado (solo referencia publicada).
	formatoRec := strings.TrimSpace(body.FormatoRecomendadoID)
	hookRec := strings.TrimSpace(body.HookRecomendadoID)
	if !s.validaVinculoBiblio(w, formatoRec, hookRec) {
		return
	}
	c, err := s.st.CreateCliente(store.Cliente{
		Nombre:           strings.TrimSpace(body.Nombre),
		LogoURL:          strings.TrimSpace(body.LogoURL),
		ContactoNombre:   strings.TrimSpace(body.ContactoNombre),
		ContactoTelefono: strings.TrimSpace(body.ContactoTelefono),
		ContactoWhatsapp: strings.TrimSpace(body.ContactoWhatsapp),
		Paquete:          strings.TrimSpace(body.Paquete),
		PaqueteID:        paqueteID,
		VendidoPor:       vendidoPor,
		FormatoRecomendadoID: formatoRec,
		HookRecomendadoID:    hookRec,
		Estado:           estado,
		DriveURL:         strings.TrimSpace(body.DriveURL),
		Notas:            body.Notas,
		Estrategia:       body.Estrategia,
		CreatedBy:        actor.ID,
	})
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "crear_cliente", c.ID, nil,
		map[string]any{"nombre": c.Nombre, "estado": c.Estado}, "")
	// F2 modo una_vez: al crear con vendido_por → comisión inmediata (§7.5).
	if c.VendidoPor != "" {
		if cfg, err := s.st.GetConfig(); err == nil && cfg.ModoComision == cobros.ModoUnaVez {
			s.generarComisiones(actor, cobros.PeriodoActual(), &c)
		}
	}
	writeJSON(w, http.StatusCreated, clienteVista(c))
}

// clienteDetalle arma GET /clientes/{id}: ficha + piezas + historial.
func (s *Server) getCliente(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	c, existe, err := s.st.GetCliente(id)
	if err != nil {
		errorDatos(w, err)
		return
	}
	if !existe {
		writeError(w, http.StatusNotFound, "cliente no encontrado")
		return
	}
	okVer, err := s.puedeVerCliente(u, id)
	if err != nil {
		errorDatos(w, err)
		return
	}
	if !okVer {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	piezas, err := s.st.ListPiezas()
	if err != nil {
		errorDatos(w, err)
		return
	}
	delCliente := []map[string]any{}
	for _, p := range piezas {
		if p.ClienteID != id {
			continue
		}
		delCliente = append(delCliente, map[string]any{
			"id": p.ID, "titulo": p.Titulo, "formato": p.Formato,
			"estado": p.Estado, "fecha_objetivo": p.FechaObjetivo,
		})
	}
	eventos, err := s.st.ListActividad(id)
	if err != nil {
		errorDatos(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"cliente": clienteVista(c), "piezas": delCliente,
		"historial": map[string]any{"eventos": eventos},
	})
}

func (s *Server) patchCliente(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.CrearEditarClientes, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	id := r.PathValue("id")
	c, existe, err := s.st.GetCliente(id)
	if err != nil {
		errorDatos(w, err)
		return
	}
	if !existe {
		writeError(w, http.StatusNotFound, "cliente no encontrado")
		return
	}
	var body clienteBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	// §5.14: control de versión con updated_at.
	if body.UpdatedAt != "" && body.UpdatedAt != c.UpdatedAt {
		writeError(w, http.StatusConflict, "esto cambió mientras editabas")
		return
	}
	cambios := map[string]any{}
	setStr := func(k, v string, actual string) {
		var raw map[string]any
		_ = raw
		_ = k
		_ = v
		_ = actual
	}
	_ = setStr
	needs := func() map[string]any { return cambios }
	_ = needs
	// Solo los campos presentes en el JSON se cambian: re-decodificar crudo.
	var crudo map[string]any
	_ = crudo
	antes := clienteVista(c)
	if strings.TrimSpace(body.Estado) != "" && !produccion.EstadoClienteValido(strings.TrimSpace(body.Estado)) {
		writeError(w, http.StatusBadRequest, "estado inválido")
		return
	}
	// decodeBody ya consumió el body; reconstruir "presente" con un segundo
	// parse sería vacío. En vez de eso: si el valor difiere del actual y no
	// es cero, se toma como cambio (los strings vacíos explícitos también
	// cuentan si el actual no era vacío: se detectan comparando punteros
	// JSON — simplificado: se acepta el body tal cual salvo updated_at).
	cambios = bodyACambiosCliente(body, c)
	// F2: paquete_id debe existir (aquí sí hay store).
	if v, ok := cambios["paquete_id"]; ok {
		if vs := strings.TrimSpace(v.(string)); vs != "" {
			if _, existe, err := s.st.GetPaquete(vs); err != nil {
				errorDatos(w, err)
				return
			} else if !existe {
				writeError(w, http.StatusBadRequest, "paquete_id no existe")
				return
			}
		}
	}
	// F3: vínculo formato/hook recomendado (solo referencia publicada).
	if v, ok := cambios["formato_recomendado_id"]; ok {
		vs, _ := v.(string)
		var hookID string
		if hv, ok := cambios["hook_recomendado_id"]; ok {
			hookID, _ = hv.(string)
		} else {
			hookID = c.HookRecomendadoID
		}
		if !s.validaVinculoBiblio(w, vs, hookID) {
			return
		}
	} else if v, ok := cambios["hook_recomendado_id"]; ok {
		vs, _ := v.(string)
		if !s.validaVinculoBiblio(w, c.FormatoRecomendadoID, vs) {
			return
		}
	}
	// F2: vendido_por se valida (oficio ventas, no pendiente/desactivado).
	if v, ok := cambios["vendido_por"]; ok {
		if vs := strings.TrimSpace(v.(string)); vs != "" {
			if _, ok := s.validaVendedor(w, vs); !ok {
				return
			}
		}
	}
	if len(cambios) == 0 {
		writeJSON(w, http.StatusOK, clienteVista(c))
		return
	}
	act, err := s.st.UpdateCliente(id, cambios)
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "editar_cliente", id,
		antes, clienteVista(act), "")
	writeJSON(w, http.StatusOK, clienteVista(act))
}

// bodyACambiosCliente traduce el body a cambios parciales: cada campo no
// vacío que difiera del actual, más estado válido.
func bodyACambiosCliente(body clienteBody, c store.Cliente) map[string]any {
	cambios := map[string]any{}
	if body.Nombre != "" && body.Nombre != c.Nombre {
		cambios["nombre"] = strings.TrimSpace(body.Nombre)
	}
	if body.LogoURL != c.LogoURL && (body.LogoURL != "" || c.LogoURL != "") {
		cambios["logo_url"] = strings.TrimSpace(body.LogoURL)
	}
	if body.ContactoNombre != c.ContactoNombre && (body.ContactoNombre != "" || c.ContactoNombre != "") {
		cambios["contacto_nombre"] = strings.TrimSpace(body.ContactoNombre)
	}
	if body.ContactoTelefono != c.ContactoTelefono && (body.ContactoTelefono != "" || c.ContactoTelefono != "") {
		cambios["contacto_telefono"] = strings.TrimSpace(body.ContactoTelefono)
	}
	if body.ContactoWhatsapp != c.ContactoWhatsapp && (body.ContactoWhatsapp != "" || c.ContactoWhatsapp != "") {
		cambios["contacto_whatsapp"] = strings.TrimSpace(body.ContactoWhatsapp)
	}
	if body.Paquete != c.Paquete && (body.Paquete != "" || c.Paquete != "") {
		cambios["paquete"] = strings.TrimSpace(body.Paquete)
	}
	// F2: paquete_id y vendido_por se validan igual que al crear (§5.27: el
	// cambio no altera comisiones ya generadas). La existencia del paquete
	// la valida patchCliente (aquí no hay store).
	if body.PaqueteID != c.PaqueteID && (body.PaqueteID != "" || c.PaqueteID != "") {
		cambios["paquete_id"] = strings.TrimSpace(body.PaqueteID)
	}
	if body.VendidoPor != c.VendidoPor && (body.VendidoPor != "" || c.VendidoPor != "") {
		cambios["vendido_por"] = strings.TrimSpace(body.VendidoPor)
	}
	// F3: formato/hook recomendado (solo referencia a contenido publicado).
	if body.FormatoRecomendadoID != c.FormatoRecomendadoID && (body.FormatoRecomendadoID != "" || c.FormatoRecomendadoID != "") {
		cambios["formato_recomendado_id"] = strings.TrimSpace(body.FormatoRecomendadoID)
	}
	if body.HookRecomendadoID != c.HookRecomendadoID && (body.HookRecomendadoID != "" || c.HookRecomendadoID != "") {
		cambios["hook_recomendado_id"] = strings.TrimSpace(body.HookRecomendadoID)
	}
	if e := strings.TrimSpace(body.Estado); e != "" && e != c.Estado {
		cambios["estado"] = e
	}
	if body.DriveURL != c.DriveURL && (body.DriveURL != "" || c.DriveURL != "") {
		cambios["drive_url"] = strings.TrimSpace(body.DriveURL)
	}
	if body.Notas != c.Notas && (body.Notas != "" || c.Notas != "") {
		cambios["notas"] = body.Notas
	}
	if body.Estrategia != c.Estrategia && (body.Estrategia != "" || c.Estrategia != "") {
		cambios["estrategia"] = body.Estrategia
	}
	return cambios
}

func (s *Server) archivarCliente(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.CrearEditarClientes, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	id := r.PathValue("id")
	c, existe, err := s.st.GetCliente(id)
	if err != nil {
		errorDatos(w, err)
		return
	}
	if !existe {
		writeError(w, http.StatusNotFound, "cliente no encontrado")
		return
	}
	if c.ArchivadoAt != "" {
		writeJSON(w, http.StatusOK, map[string]any{"archivada": true, "cliente": clienteVista(c)})
		return
	}
	act, err := s.st.ArchivarCliente(id)
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "archivar_cliente", id,
		map[string]any{"archivado_at": ""},
		map[string]any{"archivado_at": act.ArchivadoAt}, "")
	writeJSON(w, http.StatusOK, map[string]any{"archivada": true, "cliente": clienteVista(act)})
}

// --- /piezas ---

func piezaVista(p store.Pieza, nombreCliente string) map[string]any {
	return map[string]any{
		"id": p.ID, "cliente_id": p.ClienteID, "cliente_nombre": nombreCliente,
		"titulo": p.Titulo, "formato": p.Formato, "guion": p.Guion,
		"guion_borrador": p.GuionBorrador,
		"formato_recomendado_id": p.FormatoRecomendadoID,
		"hook_recomendado_id":    p.HookRecomendadoID,
		"fecha_objetivo": p.FechaObjetivo, "estado": p.Estado,
		"motivo_cancelacion": p.MotivoCancelacion,
		"created_at":         p.CreatedAt, "updated_at": p.UpdatedAt,
	}
}

func (s *Server) listPiezas(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	fCliente, fEstado, fAsignado := q.Get("cliente"), q.Get("estado"), q.Get("asignado")
	piezas, err := s.st.ListPiezas()
	if err != nil {
		errorDatos(w, err)
		return
	}
	todas, err := s.st.ListTareas()
	if err != nil {
		errorDatos(w, err)
		return
	}
	clientes, err := s.st.ListClientes(true)
	if err != nil {
		errorDatos(w, err)
		return
	}
	nombreCli := map[string]string{}
	for _, c := range clientes {
		nombreCli[c.ID] = c.Nombre
	}
	porPieza := map[string][]store.Tarea{}
	for _, t := range todas {
		porPieza[t.PiezaID] = append(porPieza[t.PiezaID], t)
	}
	// Equipo: solo piezas de sus clientes (§3.1.3). Sin Puede de lista:
	// el filtro por dueño lo hace el handler.
	var vis map[string]bool
	if !esAdmin(u) {
		vis, err = s.clientesVisiblesPara(u)
		if err != nil {
			errorDatos(w, err)
			return
		}
	}
	hoy := produccion.HoyFecha()
	vista := []map[string]any{}
	for _, p := range piezas {
		if vis != nil && !vis[p.ClienteID] {
			continue
		}
		if fCliente != "" && p.ClienteID != fCliente {
			continue
		}
		if fEstado != "" && p.Estado != fEstado {
			continue
		}
		if fAsignado != "" {
			hay := false
			for _, t := range porPieza[p.ID] {
				if t.AsignadoID == fAsignado {
					hay = true
					break
				}
			}
			if !hay {
				continue
			}
		}
		v := piezaVista(p, nombreCli[p.ClienteID])
		v["vencida"] = piezaVencida(p, porPieza[p.ID], hoy)
		vista = append(vista, v)
	}
	writeJSON(w, http.StatusOK, map[string]any{"piezas": vista})
}

// piezaVencida: alguna tarea con límite pasado y no aprobada.
func piezaVencida(p store.Pieza, tareas []store.Tarea, hoy string) bool {
	if p.Estado == produccion.PiezaCancelada || p.Estado == produccion.PiezaPublicada {
		return false
	}
	for _, t := range tareas {
		if produccion.EsVencida(t.FechaLimite, t.Estado, hoy) {
			return true
		}
	}
	return false
}

type etapaBody struct {
	Etapa       string `json:"etapa"`
	AsignadoID  string `json:"asignado_id"`
	FechaLimite string `json:"fecha_limite"`
}

type piezaBody struct {
	ClienteID     string      `json:"cliente_id"`
	Titulo        string      `json:"titulo"`
	Formato       string      `json:"formato"`
	Guion         string      `json:"guion"`
	GuionBorrador *string     `json:"guion_borrador"`
	FechaObjetivo string      `json:"fecha_objetivo"`
	Etapas        []etapaBody `json:"etapas"`
	Estado        string      `json:"estado"`
	// F3: formato y hook vinculados (solo referencia, BRIEF F3 §1).
	FormatoRecomendadoID string `json:"formato_recomendado_id"`
	HookRecomendadoID    string `json:"hook_recomendado_id"`
	UpdatedAt            string `json:"updated_at"`
}

func (s *Server) createPieza(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.CrearPiezasAsignar, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	var body piezaBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	if strings.TrimSpace(body.ClienteID) == "" || strings.TrimSpace(body.Titulo) == "" {
		writeError(w, http.StatusBadRequest, "cliente y título son obligatorios")
		return
	}
	cliente, existe, err := s.st.GetCliente(strings.TrimSpace(body.ClienteID))
	if err != nil {
		errorDatos(w, err)
		return
	}
	if !existe {
		writeError(w, http.StatusNotFound, "cliente no encontrado")
		return
	}
	// §5.28: pausado no admite piezas nuevas.
	if cliente.Estado == produccion.ClientePausado {
		writeError(w, http.StatusBadRequest, "el cliente está pausado y no admite piezas nuevas")
		return
	}
	if body.FechaObjetivo != "" && !produccion.FechaValida(body.FechaObjetivo) {
		writeError(w, http.StatusBadRequest, "fecha objetivo inválida (YYYY-MM-DD)")
		return
	}
	// Validar etapas antes de crear nada (§5.8 + §5.2 en validaAsignado).
	for _, e := range body.Etapas {
		if !produccion.EtapaValida(e.Etapa) {
			writeError(w, http.StatusBadRequest, "etapa inválida: "+e.Etapa)
			return
		}
		if e.FechaLimite != "" && !produccion.FechaValida(e.FechaLimite) {
			writeError(w, http.StatusBadRequest, "fecha límite inválida (YYYY-MM-DD)")
			return
		}
		if _, ok := s.validaAsignado(w, e.Etapa, strings.TrimSpace(e.AsignadoID)); !ok {
			return
		}
	}
	// F3: vínculo formato/hook (solo referencia a contenido publicado).
	formatoRecP := strings.TrimSpace(body.FormatoRecomendadoID)
	hookRecP := strings.TrimSpace(body.HookRecomendadoID)
	if !s.validaVinculoBiblio(w, formatoRecP, hookRecP) {
		return
	}
	p, err := s.st.CreatePieza(store.Pieza{
		ClienteID: cliente.ID, Titulo: strings.TrimSpace(body.Titulo),
		Formato: body.Formato, Guion: body.Guion,
		FechaObjetivo: body.FechaObjetivo,
		FormatoRecomendadoID: formatoRecP,
		HookRecomendadoID:    hookRecP,
		Estado:        produccion.PiezaBorrador, CreatedBy: actor.ID,
	})
	if err != nil {
		errorDatos(w, err)
		return
	}
	// La primera etapa bloqueante nace pendiente; las demás bloqueadas.
	// El apoyo nace pendiente si tiene asignado (flujo libre, §5.15).
	creadas := []map[string]any{}
	primeraBloqueante := true
	for _, e := range body.Etapas {
		estado := produccion.TareaBloqueada
		if produccion.EsApoyo(e.Etapa) {
			if strings.TrimSpace(e.AsignadoID) != "" {
				estado = produccion.TareaPendiente
			}
		} else if primeraBloqueante {
			estado = produccion.TareaPendiente
			primeraBloqueante = false
		}
		t, err := s.st.CreateTarea(store.Tarea{
			PiezaID: p.ID, Etapa: e.Etapa,
			AsignadoID:  strings.TrimSpace(e.AsignadoID),
			Estado:      estado,
			FechaLimite: e.FechaLimite, CreatedBy: actor.ID,
		})
		if err != nil {
			errorDatos(w, err)
			return
		}
		_, _ = s.st.AddTareaEvento(store.TareaEvento{
			TareaID: t.ID, ActorID: actor.ID, ActorNombre: actor.Nombre,
			Accion:  "crear",
			Despues: map[string]any{"estado": estado, "asignado_id": t.AsignadoID},
		})
		if t.AsignadoID != "" {
			s.notificar(t.AsignadoID, produccion.NotiAsignada,
				"Nueva tarea: "+p.Titulo, "Etapa "+t.Etapa, "tarea", t.ID)
		}
		creadas = append(creadas, tareaVistaSimple(t))
	}
	_, _ = actividad.Registrar(s.st, actor, "crear_pieza", p.ID,
		nil, map[string]any{"titulo": p.Titulo, "cliente_id": p.ClienteID}, "")
	writeJSON(w, http.StatusCreated, map[string]any{"pieza": piezaVista(p, cliente.Nombre), "tareas": creadas})
}

func tareaVistaSimple(t store.Tarea) map[string]any {
	return map[string]any{
		"id": t.ID, "pieza_id": t.PiezaID, "etapa": t.Etapa,
		"asignado_id": t.AsignadoID, "estado": t.Estado,
		"fecha_limite": t.FechaLimite, "updated_at": t.UpdatedAt,
	}
}

func (s *Server) getPieza(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	p, ok := s.conPieza(w, r.PathValue("id"))
	if !ok {
		return
	}
	okVer, err := s.puedeVerCliente(u, p.ClienteID)
	if err != nil {
		errorDatos(w, err)
		return
	}
	if !okVer {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	tareas, err := s.st.TareasDePieza(p.ID)
	if err != nil {
		errorDatos(w, err)
		return
	}
	clientes, err := s.st.ListClientes(true)
	if err != nil {
		errorDatos(w, err)
		return
	}
	nombre := ""
	for _, c := range clientes {
		if c.ID == p.ClienteID {
			nombre = c.Nombre
		}
	}
	usuarios, err := s.st.ListUsuarios()
	if err != nil {
		errorDatos(w, err)
		return
	}
	nomUs := map[string]string{}
	for _, x := range usuarios {
		nomUs[x.ID] = x.Nombre
	}
	hoy := produccion.HoyFecha()
	vt := make([]map[string]any, 0, len(tareas))
	for _, t := range tareas {
		v := tareaVistaSimple(t)
		v["asignado_nombre"] = nomUs[t.AsignadoID]
		v["material_url"] = t.MaterialURL
		v["minutos"] = t.Minutos
		v["entregable_url"] = t.EntregableURL
		v["publicado_url"] = t.PublicadoURL
		v["decision_pendiente"] = t.DecisionPendiente
		v["vencida"] = produccion.EsVencida(t.FechaLimite, t.Estado, hoy)
		vt = append(vt, v)
	}
	writeJSON(w, http.StatusOK, map[string]any{"pieza": piezaVista(p, nombre), "tareas": vt})
}

func (s *Server) patchPieza(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.CrearPiezasAsignar, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	p, ok := s.conPieza(w, r.PathValue("id"))
	if !ok {
		return
	}
	var body piezaBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	if body.UpdatedAt != "" && body.UpdatedAt != p.UpdatedAt {
		writeError(w, http.StatusConflict, "esto cambió mientras editabas")
		return
	}
	cambios := map[string]any{}
	if body.Titulo != "" && body.Titulo != p.Titulo {
		cambios["titulo"] = strings.TrimSpace(body.Titulo)
	}
	if body.Formato != p.Formato && (body.Formato != "" || p.Formato != "") {
		cambios["formato"] = body.Formato
	}
	if body.Guion != p.Guion && (body.Guion != "" || p.Guion != "") {
		cambios["guion"] = body.Guion
	}
	// F5: adopción/limpieza del borrador del asistente (solo admin/dueño,
	// que ya pasaron Puede CrearPiezasAsignar arriba; el asistente nunca
	// escribe aquí, solo vía UpdatePiezaBorrador + actividad).
	if body.GuionBorrador != nil && *body.GuionBorrador != p.GuionBorrador {
		cambios["guion_borrador"] = *body.GuionBorrador
	}
	if body.FechaObjetivo != p.FechaObjetivo && (body.FechaObjetivo != "" || p.FechaObjetivo != "") {
		if !produccion.FechaValida(body.FechaObjetivo) {
			writeError(w, http.StatusBadRequest, "fecha objetivo inválida (YYYY-MM-DD)")
			return
		}
		cambios["fecha_objetivo"] = body.FechaObjetivo
	}
	if e := strings.TrimSpace(body.Estado); e != "" && e != p.Estado {
		if !produccion.EstadoPiezaValido(e) {
			writeError(w, http.StatusBadRequest, "estado inválido")
			return
		}
		if e == produccion.PiezaCancelada {
			writeError(w, http.StatusBadRequest, "para cancelar usá el botón Cancelar con motivo")
			return
		}
		if !produccion.TransicionPiezaValida(p.Estado, e) {
			writeError(w, http.StatusBadRequest, "esa transición de estado no es válida")
			return
		}
		cambios["estado"] = e
	}
	// F3: vínculo formato/hook (solo referencia a contenido publicado).
	if fr, hr := strings.TrimSpace(body.FormatoRecomendadoID), strings.TrimSpace(body.HookRecomendadoID); fr != p.FormatoRecomendadoID || hr != p.HookRecomendadoID {
		if !s.validaVinculoBiblio(w, fr, hr) {
			return
		}
		if fr != p.FormatoRecomendadoID {
			cambios["formato_recomendado_id"] = fr
		}
		if hr != p.HookRecomendadoID {
			cambios["hook_recomendado_id"] = hr
		}
	}
	if len(cambios) == 0 {
		clientes, err := s.st.ListClientes(true)
		if err != nil {
			errorDatos(w, err)
			return
		}
		nombre := ""
		for _, c := range clientes {
			if c.ID == p.ClienteID {
				nombre = c.Nombre
			}
		}
		writeJSON(w, http.StatusOK, piezaVista(p, nombre))
		return
	}
	antes := map[string]any{"estado": p.Estado, "titulo": p.Titulo}
	act, err := s.st.UpdatePieza(p.ID, cambios)
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "editar_pieza", p.ID,
		antes, map[string]any{"estado": act.Estado, "titulo": act.Titulo}, "")
	clientes, err := s.st.ListClientes(true)
	if err != nil {
		errorDatos(w, err)
		return
	}
	nombre := ""
	for _, c := range clientes {
		if c.ID == act.ClienteID {
			nombre = c.Nombre
		}
	}
	writeJSON(w, http.StatusOK, piezaVista(act, nombre))
}

type cancelarBody struct {
	Motivo string `json:"motivo"`
}

// cancelarPieza: §5.12. Motivo obligatorio, solo admin/dueño. Tareas no
// empezadas (bloqueada/pendiente) → cancelada; aprobadas quedan;
// devuelta → cancelada sin cobro (se cobra al aprobar: §5.11, nunca se
// aprobó); en curso/entregadas → decision_pendiente para que el admin decida.
func (s *Server) cancelarPieza(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.CancelarPieza, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	p, ok := s.conPieza(w, r.PathValue("id"))
	if !ok {
		return
	}
	var body cancelarBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	if strings.TrimSpace(body.Motivo) == "" {
		writeError(w, http.StatusBadRequest, "el motivo es obligatorio para cancelar")
		return
	}
	if p.Estado == produccion.PiezaCancelada {
		writeJSON(w, http.StatusOK, map[string]any{"cancelada": true})
		return
	}
	antes := map[string]any{"estado": p.Estado}
	act, err := s.st.UpdatePieza(p.ID, map[string]any{
		"estado": produccion.PiezaCancelada, "motivo_cancelacion": strings.TrimSpace(body.Motivo),
	})
	if err != nil {
		errorDatos(w, err)
		return
	}
	tareas, err := s.st.TareasDePieza(p.ID)
	if err != nil {
		errorDatos(w, err)
		return
	}
	resumen := map[string]int{"canceladas": 0, "conservadas": 0, "pendientes_decision": 0}
	for _, t := range tareas {
		switch t.Estado {
		case produccion.TareaBloqueada, produccion.TareaPendiente, produccion.TareaDevuelta:
			_, _ = s.st.UpdateTarea(t.ID, map[string]any{"estado": produccion.TareaCancelada})
			s.registrarTarea(actor, t.ID, "cancelar", map[string]any{"estado": t.Estado},
				map[string]any{"estado": produccion.TareaCancelada}, strings.TrimSpace(body.Motivo), false)
			resumen["canceladas"]++
		case produccion.TareaAprobada, produccion.TareaCancelada:
			resumen["conservadas"]++
		default: // en curso / entregada: el admin decide después (§5.12)
			_, _ = s.st.UpdateTarea(t.ID, map[string]any{"decision_pendiente": true})
			s.registrarTarea(actor, t.ID, "marcar_decision", map[string]any{"estado": t.Estado},
				map[string]any{"estado": t.Estado, "decision_pendiente": true}, strings.TrimSpace(body.Motivo), false)
			resumen["pendientes_decision"]++
		}
	}
	_, _ = actividad.Registrar(s.st, actor, "cancelar_pieza", p.ID,
		antes, map[string]any{"estado": act.Estado}, strings.TrimSpace(body.Motivo))
	writeJSON(w, http.StatusOK, map[string]any{"cancelada": true, "tareas": resumen})
}

// --- /tareas ---

func (s *Server) listTareas(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	fAsignado, fEstado, fCliente, vista := q.Get("asignado"), q.Get("estado"), q.Get("cliente"), q.Get("vista")
	tareas, err := s.st.ListTareas()
	if err != nil {
		errorDatos(w, err)
		return
	}
	piezas, usuarios, clientes, err := s.mapasAux()
	if err != nil {
		errorDatos(w, err)
		return
	}
	hoy := produccion.HoyFecha()
	out := []map[string]any{}
	for _, t := range tareas {
		// Equipo: solo las suyas (admin ve todas). §3.2 fila VerTareas.
		if !esAdmin(u) && t.AsignadoID != u.ID {
			continue
		}
		if fAsignado != "" && t.AsignadoID != fAsignado {
			continue
		}
		if fEstado != "" && t.Estado != fEstado {
			continue
		}
		if p, ok := piezas[t.PiezaID]; ok {
			if fCliente != "" && p.ClienteID != fCliente {
				continue
			}
		}
		v := tareaVista(t, piezas, usuarios, clientes, hoy)
		if !pasaVista(v, t, piezas, vista, hoy) {
			continue
		}
		out = append(out, v)
	}
	writeJSON(w, http.StatusOK, map[string]any{"tareas": out})
}

// pasaVista filtra Mis tareas: hoy / semana / vencidas / por_revisar
// (entregadas esperando revisión). "" = sin filtro.
func pasaVista(v map[string]any, t store.Tarea, piezas map[string]store.Pieza, vista, hoy string) bool {
	switch vista {
	case "", "todas":
		return true
	case "hoy":
		if t.Estado == produccion.TareaAprobada || t.Estado == produccion.TareaCancelada {
			return false
		}
		// Lo que ya está en curso también es trabajo de hoy, aunque venza después.
		return t.Estado == produccion.TareaEnCurso || t.FechaLimite == "" || t.FechaLimite <= hoy
	case "semana":
		if t.Estado == produccion.TareaAprobada || t.Estado == produccion.TareaCancelada {
			return false
		}
		return t.FechaLimite == "" || t.FechaLimite <= produccion.HoyMas(7)
	case "vencidas":
		return produccion.EsVencida(t.FechaLimite, t.Estado, hoy)
	case "por_revisar":
		return t.Estado == produccion.TareaEntregada
	}
	return true
}

func (s *Server) getTarea(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	t, ok := s.conTarea(w, r.PathValue("id"))
	if !ok {
		return
	}
	if !esAdmin(u) && t.AsignadoID != u.ID {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	piezas, usuarios, clientes, err := s.mapasAux()
	if err != nil {
		errorDatos(w, err)
		return
	}
	eventos, err := s.st.ListTareaEventos(t.ID)
	if err != nil {
		errorDatos(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"tarea":   tareaVista(t, piezas, usuarios, clientes, produccion.HoyFecha()),
		"eventos": eventos,
	})
}

type tareaPatchBody struct {
	AsignadoID string `json:"asignado_id"`
	UpdatedAt  string `json:"updated_at"`
}

// patchTarea = reasignar (§5.13): solo admin/dueño, valida oficio (§5.8),
// registra actividad y notifica al nuevo asignado.
func (s *Server) patchTarea(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.ReasignarTarea, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	t, ok := s.conTarea(w, r.PathValue("id"))
	if !ok {
		return
	}
	var body tareaPatchBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	if body.UpdatedAt != "" && body.UpdatedAt != t.UpdatedAt {
		writeError(w, http.StatusConflict, "esto cambió mientras editabas")
		return
	}
	nuevo := strings.TrimSpace(body.AsignadoID)
	if nuevo == t.AsignadoID {
		writeJSON(w, http.StatusOK, tareaVistaSimple(t))
		return
	}
	// §5.8 + §5.2 en validaAsignado (oficio + acceso que trabaja).
	if _, ok := s.validaAsignado(w, t.Etapa, nuevo); !ok {
		return
	}
	antes := map[string]any{"asignado_id": t.AsignadoID, "estado": t.Estado}
	act, err := s.st.UpdateTarea(t.ID, map[string]any{"asignado_id": nuevo})
	if err != nil {
		errorDatos(w, err)
		return
	}
	despues := map[string]any{"asignado_id": act.AsignadoID, "estado": act.Estado}
	s.registrarTarea(actor, t.ID, "reasignar", antes, despues, "", false)
	if nuevo != "" {
		s.notificar(nuevo, produccion.NotiAsignada, "Te asignaron una tarea",
			"Etapa "+t.Etapa, "tarea", t.ID)
	}
	writeJSON(w, http.StatusOK, tareaVistaSimple(act))
}

// empezarTarea: pendiente/devuelta → en curso. Solo el asignado o admin.
// Idempotente: si ya está en curso, 200 sin duplicar.
func (s *Server) empezarTarea(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	t, ok := s.conTarea(w, r.PathValue("id"))
	if !ok {
		return
	}
	if !esAdmin(actor) && t.AsignadoID != actor.ID {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	if !permisos.Puede(actor, permisos.CambiarEstadoTarea, permisos.Recurso{OwnerID: t.AsignadoID}) && !esAdmin(actor) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	if t.Estado == produccion.TareaEnCurso {
		writeJSON(w, http.StatusOK, tareaVistaSimple(t))
		return
	}
	if !produccion.TransicionTareaValida(t.Estado, produccion.TareaEnCurso) {
		writeError(w, http.StatusBadRequest, "esa transición de estado no es válida")
		return
	}
	act, err := s.st.UpdateTarea(t.ID, map[string]any{"estado": produccion.TareaEnCurso})
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.registrarTarea(actor, t.ID, "empezar",
		map[string]any{"estado": t.Estado}, map[string]any{"estado": act.Estado}, "", false)
	writeJSON(w, http.StatusOK, tareaVistaSimple(act))
}

type entregarBody struct {
	MaterialURL   string `json:"material_url"`
	Minutos       *int   `json:"minutos"`
	EntregableURL string `json:"entregable_url"`
	PublicadoURL  string `json:"publicado_url"`
}

// entregarTarea: en curso/devuelta → entregada. Exige el dato de la etapa
// (§5.9). Solo el asignado o admin. Idempotente con los mismos datos.
func (s *Server) entregarTarea(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	t, ok := s.conTarea(w, r.PathValue("id"))
	if !ok {
		return
	}
	if !esAdmin(actor) && t.AsignadoID != actor.ID {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	var body entregarBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	// El front manda minutos ya como número (Mis tareas lo convierte y
	// valida entero ≥ 0 en cliente). Si vino string, Minutos queda nil y
	// ValidarEntrega responde 400 con el mensaje de §5.9.
	d := produccion.EntregaDatos{
		MaterialURL:   strings.TrimSpace(body.MaterialURL),
		Minutos:       body.Minutos,
		EntregableURL: strings.TrimSpace(body.EntregableURL),
		PublicadoURL:  strings.TrimSpace(body.PublicadoURL),
	}
	if msg, ok := produccion.ValidarEntrega(t.Etapa, d); !ok {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	if t.Estado == produccion.TareaEntregada && mismosDatos(t, d) {
		writeJSON(w, http.StatusOK, tareaVistaSimple(t))
		return
	}
	if !produccion.TransicionTareaValida(t.Estado, produccion.TareaEntregada) {
		writeError(w, http.StatusBadRequest, "esa transición de estado no es válida")
		return
	}
	cambios := map[string]any{"estado": produccion.TareaEntregada}
	if d.MaterialURL != "" {
		cambios["material_url"] = d.MaterialURL
	}
	if d.Minutos != nil {
		cambios["minutos"] = *d.Minutos
	}
	if d.EntregableURL != "" {
		cambios["entregable_url"] = d.EntregableURL
	}
	if d.PublicadoURL != "" {
		cambios["publicado_url"] = d.PublicadoURL
	}
	act, err := s.st.UpdateTarea(t.ID, cambios)
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.registrarTarea(actor, t.ID, "entregar",
		map[string]any{"estado": t.Estado}, map[string]any{"estado": act.Estado}, "", false)
	// Aviso a los admins (para la cola de Revisión).
	usuarios, err := s.st.ListUsuarios()
	if err == nil {
		for _, x := range usuarios {
			if esAdmin(x) {
				s.notificar(x.ID, produccion.NotiEntregada,
					"Entrega para revisar", "Etapa "+t.Etapa, "tarea", t.ID)
			}
		}
	}
	writeJSON(w, http.StatusOK, tareaVistaSimple(act))
}

func mismosDatos(t store.Tarea, d produccion.EntregaDatos) bool {
	if d.MaterialURL != "" && d.MaterialURL != t.MaterialURL {
		return false
	}
	if d.EntregableURL != "" && d.EntregableURL != t.EntregableURL {
		return false
	}
	if d.PublicadoURL != "" && d.PublicadoURL != t.PublicadoURL {
		return false
	}
	if d.Minutos != nil && (t.Minutos == nil || *d.Minutos != *t.Minutos) {
		return false
	}
	return true
}

// aprobarTarea: entregada → aprobada (solo admin/dueño). Desbloquea la
// siguiente etapa bloqueante (§4.2); el apoyo no bloquea (§5.15); publicar
// exige pieza aprobada. Idempotente.
func (s *Server) aprobarTarea(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.AprobarEntrega, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	t, ok := s.conTarea(w, r.PathValue("id"))
	if !ok {
		return
	}
	if t.Estado == produccion.TareaAprobada {
		writeJSON(w, http.StatusOK, tareaVistaSimple(t))
		return
	}
	if !produccion.TransicionTareaValida(t.Estado, produccion.TareaAprobada) {
		writeError(w, http.StatusBadRequest, "esa transición de estado no es válida")
		return
	}
	act, err := s.st.UpdateTarea(t.ID, map[string]any{"estado": produccion.TareaAprobada})
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.registrarTarea(actor, t.ID, "aprobar",
		map[string]any{"estado": t.Estado}, map[string]any{"estado": act.Estado}, "", false)
	if t.AsignadoID != "" {
		s.notificar(t.AsignadoID, produccion.NotiAprobada,
			"Tarea aprobada", "Etapa "+t.Etapa, "tarea", t.ID)
	}
	// F2: al aprobar se genera SOLA la línea de cobro con la tarifa vigente
	// congelada (BRIEF F2 §2). Devuelta N veces → una sola línea al final
	// (idempotencia por tarea). Sin tarifa → sin_tarifa + aviso al dueño.
	if t.AsignadoID != "" {
		s.generarLineaAprobacion(actor, act)
	}
	// Desbloquear la siguiente etapa bloqueante de la misma pieza (§4.2).
	// El apoyo nunca bloquea (§5.15): aprobarlo no desbloquea nada.
	if !produccion.EsApoyo(t.Etapa) {
		s.desbloquearSiguiente(t.PiezaID, t.Etapa, actor)
	}
	writeJSON(w, http.StatusOK, tareaVistaSimple(act))
}

// desbloquearSiguiente pasa la primera bloqueada posterior a pendiente.
func (s *Server) desbloquearSiguiente(piezaID, etapaAprobada string, actor permisos.Usuario) {
	tareas, err := s.st.TareasDePieza(piezaID)
	if err != nil {
		return
	}
	idx := -1
	for i, e := range produccion.OrdenBloqueante {
		if e == etapaAprobada {
			idx = i
			break
		}
	}
	if idx < 0 {
		return
	}
	for _, sig := range produccion.OrdenBloqueante[idx+1:] {
		for _, t := range tareas {
			if t.Etapa == sig && t.Estado == produccion.TareaBloqueada {
				_, _ = s.st.UpdateTarea(t.ID, map[string]any{"estado": produccion.TareaPendiente})
				s.registrarTarea(actor, t.ID, "desbloquear",
					map[string]any{"estado": produccion.TareaBloqueada},
					map[string]any{"estado": produccion.TareaPendiente}, "", false)
				if t.AsignadoID != "" {
					s.notificar(t.AsignadoID, produccion.NotiAsignada,
						"Tarea desbloqueada", "Etapa "+t.Etapa, "tarea", t.ID)
				}
				return
			}
		}
	}
}

type devolverBody struct {
	Comentario string `json:"comentario"`
}

// devolverTarea: entregada → devuelta con comentario (solo admin/dueño).
// Cada devolución queda en el historial (§5.11).
func (s *Server) devolverTarea(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.AprobarEntrega, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	t, ok := s.conTarea(w, r.PathValue("id"))
	if !ok {
		return
	}
	var body devolverBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	if strings.TrimSpace(body.Comentario) == "" {
		writeError(w, http.StatusBadRequest, "el comentario es obligatorio para devolver")
		return
	}
	if !produccion.TransicionTareaValida(t.Estado, produccion.TareaDevuelta) {
		writeError(w, http.StatusBadRequest, "esa transición de estado no es válida")
		return
	}
	act, err := s.st.UpdateTarea(t.ID, map[string]any{"estado": produccion.TareaDevuelta})
	if err != nil {
		errorDatos(w, err)
		return
	}
	s.registrarTarea(actor, t.ID, "devolver",
		map[string]any{"estado": t.Estado}, map[string]any{"estado": act.Estado},
		strings.TrimSpace(body.Comentario), false)
	if t.AsignadoID != "" {
		s.notificar(t.AsignadoID, produccion.NotiDevuelta,
			"Tarea devuelta", strings.TrimSpace(body.Comentario), "tarea", t.ID)
	}
	writeJSON(w, http.StatusOK, tareaVistaSimple(act))
}

func (s *Server) listTareaEventos(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	t, ok := s.conTarea(w, r.PathValue("id"))
	if !ok {
		return
	}
	if !esAdmin(u) && t.AsignadoID != u.ID {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	eventos, err := s.st.ListTareaEventos(t.ID)
	if err != nil {
		errorDatos(w, err)
		return
	}
	if eventos == nil {
		eventos = []store.TareaEvento{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"eventos": eventos})
}

// --- /notificaciones ---

func (s *Server) listNotificaciones(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(u, permisos.VerNotificaciones, permisos.Recurso{OwnerID: u.ID}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	notis, err := s.st.ListNotificaciones(u.ID)
	if err != nil {
		errorDatos(w, err)
		return
	}
	if notis == nil {
		notis = []store.Notificacion{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"notificaciones": notis})
}

func (s *Server) leerNotificacion(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(u, permisos.VerNotificaciones, permisos.Recurso{OwnerID: u.ID}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	n, err := s.st.MarcarLeida(u.ID, r.PathValue("id"))
	if err == store.ErrNoExiste {
		writeError(w, http.StatusNotFound, "notificación no encontrada")
		return
	}
	if err != nil {
		errorDatos(w, err)
		return
	}
	writeJSON(w, http.StatusOK, n)
}
