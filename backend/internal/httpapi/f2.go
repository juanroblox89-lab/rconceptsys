// Package httpapi — F2 cobros: handlers de tarifas, paquetes, config,
// líneas de cobro, cortes, comisiones y decisión de canceladas. Mismo patrón
// F0/F1: resolveUser + permisos.Puede + secreto interno X-RC-Internal. Solo
// stdlib.
//
// Reglas que impone cada handler (ANALISIS + BRIEF F2):
//   - §7.1: tarifas, cerrar corte y marcar pagado SOLO dueño.
//   - §5.17: cambiar tarifa crea NUEVA versión (nunca UPDATE); las líneas ya
//     generadas no cambian (monto/tarifa congelados al aprobar).
//   - §2/§5.18: nadie edita una línea (UpdateLineaEstado solo toca estado,
//     motivo, reclamo, corte, periodo); ajustes = líneas nuevas con motivo.
//   - §4.3: por_confirmar → confirmada → aprobada → en_corte → pagada;
//     reclamada con motivo → admin/dueño responde con ajuste.
//   - §5.20: cerrar toma las aprobada del periodo → en_corte; lo no aprobado
//     se arrastra al periodo siguiente. Cerrado no se reabre.
//   - §5.21: revertir pagado solo dueño + actividad.
//   - §5.22: el trabajador ve "llevas $X aprobado, $Y por confirmar".
//   - §7.5: comisión 8 % (configurable) modo una_vez (default) o mensual.
//   - §7.6: decision_pendiente la decide el DUEÑO (pagar → línea; no_pagar).
//   - §5.2: desactivado conserva líneas (nunca se borra el usuario).
//   - §6: cada cambio → actividad.Registrar.
package httpapi

import (
	"bytes"
	"encoding/csv"
	"net/http"
	"strings"

	"rconceptsys/backend/internal/actividad"
	"rconceptsys/backend/internal/cobros"
	"rconceptsys/backend/internal/permisos"
	"rconceptsys/backend/internal/produccion"
	"rconceptsys/backend/internal/store"
)

// rutasF2 registra los endpoints de cobros en el mux.
func (s *Server) rutasF2(mux *http.ServeMux) {
	mux.HandleFunc("GET /tarifas", s.listTarifas)
	mux.HandleFunc("POST /tarifas", s.createTarifa)

	mux.HandleFunc("GET /paquetes", s.listPaquetes)
	mux.HandleFunc("POST /paquetes", s.createPaquete)
	mux.HandleFunc("PATCH /paquetes/{id}", s.patchPaquete)

	mux.HandleFunc("GET /config-cobros", s.getConfig)
	mux.HandleFunc("PATCH /config-cobros", s.patchConfig)

	mux.HandleFunc("GET /lineas", s.listLineas)
	mux.HandleFunc("GET /lineas/{id}", s.getLinea)
	mux.HandleFunc("POST /lineas/ajuste", s.crearAjuste)
	mux.HandleFunc("POST /lineas/{id}/confirmar", s.confirmarLinea)
	mux.HandleFunc("POST /lineas/{id}/reclamar", s.reclamarLinea)
	mux.HandleFunc("POST /lineas/{id}/aprobar", s.aprobarLinea)
	mux.HandleFunc("POST /lineas/{id}/devolver", s.devolverLinea)

	mux.HandleFunc("GET /cortes", s.listCortes)
	mux.HandleFunc("GET /cortes/actual", s.corteActual)
	mux.HandleFunc("GET /cortes/mios", s.corteMio)
	mux.HandleFunc("GET /cortes/{periodo}", s.getCorte)
	mux.HandleFunc("GET /cortes/{periodo}/csv", s.corteCSV)
	mux.HandleFunc("POST /cortes/cerrar", s.cerrarCorte)
	mux.HandleFunc("POST /cortes/{periodo}/pagar", s.pagarCorte)
	mux.HandleFunc("POST /cortes/{periodo}/revertir", s.revertirCorte)

	mux.HandleFunc("POST /comisiones/mensual", s.comisionesMensual)
	mux.HandleFunc("POST /tareas/{id}/decision", s.decisionTarea)
}

// Tipos de notificación F2 (campanita in-app).
const (
	NotiCobroNuevo    = "cobro_nuevo"
	NotiCobroReclamo  = "cobro_reclamado"
	NotiLineaAprobada = "linea_aprobada"
	NotiSinTarifa     = "linea_sin_tarifa"
	NotiCorteCerrado  = "corte_cerrado"
	NotiCobroPagado   = "cobro_pagado"
)

// --- helpers F2 ---

func (s *Server) conLinea(w http.ResponseWriter, id string) (store.LineaCobro, bool) {
	l, existe, err := s.st.GetLinea(id)
	if err != nil {
		errorDatos(w, err)
		return store.LineaCobro{}, false
	}
	if !existe {
		writeError(w, http.StatusNotFound, "línea no encontrada")
		return store.LineaCobro{}, false
	}
	return l, true
}

// puedeVerLinea: dueño, admin y equipo solo la suya — incluidas las
// comisiones propias (ver F22/F28/S5: antes cualquier vendedor veía las
// comisiones de todos).
func puedeVerLinea(u permisos.Usuario, l store.LineaCobro) bool {
	if esAdmin(u) {
		return true
	}
	return l.UsuarioID == u.ID
}

func lineaVista(l store.LineaCobro, usuarios map[string]permisos.Usuario) map[string]any {
	v := map[string]any{
		"id": l.ID, "tarea_id": l.TareaID, "usuario_id": l.UsuarioID,
		"tipo": l.Tipo, "estado": l.Estado, "monto_cop": l.MontoCOP,
		"tarifa_id": l.TarifaID, "unidad": l.Unidad,
		"motivo": l.Motivo, "reclamo_motivo": l.ReclamoMotivo,
		"periodo": l.Periodo, "corte_id": l.CorteID,
		"comision_cliente_id": l.ComisionClienteID,
		"created_at": l.CreatedAt, "updated_at": l.UpdatedAt,
	}
	if l.Cantidad != nil {
		v["cantidad"] = *l.Cantidad
	}
	if u, ok := usuarios[l.UsuarioID]; ok {
		v["usuario_nombre"] = u.Nombre
	}
	return v
}

func (s *Server) mapaUsuarios() map[string]permisos.Usuario {
	out := map[string]permisos.Usuario{}
	us, err := s.st.ListUsuarios()
	if err != nil {
		return out
	}
	for _, u := range us {
		out[u.ID] = u
	}
	return out
}

// tarifaParaTarea elige la tarifa activa para una tarea aprobada (§5.17):
// por_minuto si hay minutos, si no por_tarea, si no por_duracion con la
// duración derivada (minutos×60). Devuelve tarifa, tramos, cantidad y monto.
func (s *Server) tarifaParaTarea(t store.Tarea) (store.Tarifa, []store.TarifaTramo, *float64, int64, bool) {
	tarifas, err := s.st.ListTarifas()
	if err != nil {
		return store.Tarifa{}, nil, nil, 0, false
	}
	activas := []store.Tarifa{}
	for _, tf := range tarifas {
		if tf.Activa && tf.Etapa == t.Etapa && cobros.ValidarUnidad(tf.Unidad) {
			activas = append(activas, tf)
		}
	}
	elegir := func(unidad string) (store.Tarifa, bool) {
		for _, tf := range activas {
			if tf.Unidad == unidad {
				return tf, true
			}
		}
		return store.Tarifa{}, false
	}
	// 1. por_minuto con minutos informados.
	if t.Minutos != nil {
		if tf, ok := elegir(cobros.UnidadPorMinuto); ok {
			m, ok := cobros.CalcularMontoTarifa(tf, nil, t.Minutos, nil)
			if ok {
				c := float64(*t.Minutos)
				return tf, nil, &c, m, true
			}
		}
	}
	// 2. por_tarea.
	if tf, ok := elegir(cobros.UnidadPorTarea); ok {
		m, ok := cobros.CalcularMontoTarifa(tf, nil, nil, nil)
		if ok {
			c := 1.0
			return tf, nil, &c, m, true
		}
	}
	// 3. por_duracion con duración derivada de minutos.
	if t.Minutos != nil {
		if tf, ok := elegir(cobros.UnidadPorDuracion); ok {
			tramos, _ := s.st.ListTramos(tf.ID)
			seg := *t.Minutos * 60
			if m, ok := cobros.CalcularMontoTarifa(tf, tramos, nil, &seg); ok {
				c := float64(seg)
				return tf, tramos, &c, m, true
			}
		}
	}
	return store.Tarifa{}, nil, nil, 0, false
}

// generarLineaAprobacion crea la línea de cobro al aprobar una tarea
// (BRIEF F2 §2): idempotente (una tarea → una línea), tarifa congelada.
// Sin tarifa → estado sin_tarifa + aviso al dueño (no se inventa monto).
// La línea nace en el periodo ABIERTO: si el mes en curso ya se cerró, va
// al siguiente abierto (igual que los ajustes, §5.20).
func (s *Server) generarLineaAprobacion(actor permisos.Usuario, t store.Tarea) store.LineaCobro {
	if prev, ok, _ := s.st.LineaDeTarea(t.ID); ok {
		return prev
	}
	periodo := s.periodoAbierto(cobros.PeriodoActual())
	tf, _, cantidad, monto, ok := s.tarifaParaTarea(t)
	usuarioID := t.AsignadoID
	if usuarioID == "" {
		return store.LineaCobro{}
	}
	if !ok {
		l, _ := s.st.CreateLinea(store.LineaCobro{
			TareaID: t.ID, UsuarioID: usuarioID, Tipo: cobros.TipoTarea,
			Estado: cobros.LineaSinTarifa, MontoCOP: 0,
			Periodo: periodo, CreatedBy: actor.ID,
		})
		_, _ = actividad.Registrar(s.st, actor, "linea_sin_tarifa", l.ID,
			map[string]any{"tarea_id": t.ID, "etapa": t.Etapa},
			map[string]any{"estado": l.Estado}, "sin tarifa vigente para la etapa")
		s.notificar(l.UsuarioID, NotiCobroNuevo,
			"Línea sin tarifa", "Etapa "+t.Etapa+": avisamos al dueño", "linea", l.ID)
		for _, u := range s.mapaUsuarios() {
			if u.Acceso == permisos.AccesoDueno {
				s.notificar(u.ID, NotiSinTarifa,
					"Sin tarifa para "+t.Etapa, "Fijá la tarifa para generar el cobro", "linea", l.ID)
			}
		}
		return l
	}
	l, _ := s.st.CreateLinea(store.LineaCobro{
		TareaID: t.ID, UsuarioID: usuarioID, Tipo: cobros.TipoTarea,
		Estado: cobros.LineaPorConfirmar, MontoCOP: monto,
		TarifaID: tf.ID, Unidad: tf.Unidad, Cantidad: cantidad,
		Periodo: periodo, CreatedBy: actor.ID,
	})
	_, _ = actividad.Registrar(s.st, actor, "generar_linea", l.ID,
		nil, map[string]any{
			"tarea_id": t.ID, "usuario_id": usuarioID,
			"monto_cop": monto, "tarifa_id": tf.ID, "unidad": tf.Unidad,
			"estado": l.Estado, "periodo": periodo,
		}, "")
	s.notificar(usuarioID, NotiCobroNuevo,
		"Nuevo cobro", "Etapa "+t.Etapa, "linea", l.ID)
	return l
}

// --- /tarifas (solo dueño, §7.1) ---

func tarifaVista(t store.Tarifa, tramos []store.TarifaTramo) map[string]any {
	return map[string]any{
		"id": t.ID, "etapa": t.Etapa, "unidad": t.Unidad,
		"monto_cop": t.MontoCOP, "vigente_desde": t.VigenteDesde,
		"vigente_hasta": t.VigenteHasta, "version": t.Version,
		"activa": t.Activa, "demo": t.Demo,
		"tramos": tramos,
		"created_at": t.CreatedAt, "updated_at": t.UpdatedAt,
	}
}

func (s *Server) listTarifas(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(u, permisos.EditarTarifas, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	tarifas, err := s.st.ListTarifas()
	if err != nil {
		errorDatos(w, err)
		return
	}
	vista := []map[string]any{}
	for _, t := range tarifas {
		tramos, _ := s.st.ListTramos(t.ID)
		vista = append(vista, tarifaVista(t, tramos))
	}
	writeJSON(w, http.StatusOK, map[string]any{"tarifas": vista})
}

type tramoBody struct {
	DesdeSeg int   `json:"desde_seg"`
	HastaSeg *int  `json:"hasta_seg"`
	MontoCOP int64 `json:"monto_cop"`
}

type tarifaBody struct {
	Etapa    string      `json:"etapa"`
	Unidad   string      `json:"unidad"`
	MontoCOP int64       `json:"monto_cop"`
	Tramos   []tramoBody `json:"tramos"`
}

func (s *Server) createTarifa(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.EditarTarifas, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	var body tarifaBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	etapa := strings.TrimSpace(body.Etapa)
	if etapa == "" || !produccion.EtapaValida(etapa) {
		// La tarifa también puede ser por oficio (grabacion, edicion…):
		// se acepta etapa del flujo o un oficio válido.
		if _, esOficio := permisos.NormalizarOficio(etapa); etapa == "" || !esOficio {
			writeError(w, http.StatusBadRequest, "etapa u oficio inválido")
			return
		}
		norm, _ := permisos.NormalizarOficio(etapa)
		etapa = norm
	}
	if !cobros.ValidarUnidad(body.Unidad) {
		writeError(w, http.StatusBadRequest, "unidad inválida (por_tarea, por_minuto o por_duracion)")
		return
	}
	if body.MontoCOP < 0 {
		writeError(w, http.StatusBadRequest, "el monto no puede ser negativo")
		return
	}
	if body.Unidad == cobros.UnidadPorDuracion {
		for _, tr := range body.Tramos {
			if tr.DesdeSeg < 0 || (tr.HastaSeg != nil && *tr.HastaSeg <= tr.DesdeSeg) || tr.MontoCOP < 0 {
				writeError(w, http.StatusBadRequest, "tramo inválido (rango o monto)")
				return
			}
		}
		// F214: los tramos no pueden solaparse (el monto dependería del
		// orden de evaluación).
		for i, a := range body.Tramos {
			finA := 1 << 62
			if a.HastaSeg != nil {
				finA = *a.HastaSeg
			}
			for j, b := range body.Tramos {
				if i == j {
					continue
				}
				finB := 1 << 62
				if b.HastaSeg != nil {
					finB = *b.HastaSeg
				}
				if a.DesdeSeg <= finB && b.DesdeSeg <= finA {
					writeError(w, http.StatusBadRequest, "tramos solapados")
					return
				}
			}
		}
	}
	// §5.17: versiona (desactiva la anterior, nunca la edita). Al fijar
	// tarifa se resuelven las líneas sin_tarifa pendientes de esa etapa
	// (ver F21: antes quedaban en sin_tarifa $0 para siempre).
	t, err := s.st.CreateTarifa(store.Tarifa{
		Etapa: etapa, Unidad: body.Unidad, MontoCOP: body.MontoCOP,
		CreatedBy: actor.ID,
	})
	if err != nil {
		errorDatos(w, err)
		return
	}
	aliased := []store.TarifaTramo{}
	for _, tr := range body.Tramos {
		creado, err := s.st.CreateTramo(store.TarifaTramo{
			TarifaID: t.ID, DesdeSeg: tr.DesdeSeg,
			HastaSeg: tr.HastaSeg, MontoCOP: tr.MontoCOP,
		})
		if err != nil {
			errorDatos(w, err)
			return
		}
		aliased = append(aliased, creado)
	}
	_, _ = actividad.Registrar(s.st, actor, "crear_tarifa", t.ID, nil,
		map[string]any{"etapa": t.Etapa, "unidad": t.Unidad, "monto_cop": t.MontoCOP, "version": t.Version}, "")
	resueltas := s.resolverSinTarifa(actor, t)
	res := tarifaVista(t, aliased)
	if resueltas > 0 {
		res["sin_tarifa_resueltas"] = resueltas
	}
	writeJSON(w, http.StatusCreated, res)
}

// resolverSinTarifa completa las líneas sin_tarifa de la etapa con la
// tarifa recién creada (F21): recalcula monto/cantidad con la tarifa
// vigente y las pasa a por_confirmar en el periodo abierto. Devuelve
// cuántas resolvió. Nunca toca líneas de otros estados.
func (s *Server) resolverSinTarifa(actor permisos.Usuario, tf store.Tarifa) int {
	lineas, err := s.st.ListLineas()
	if err != nil {
		return 0
	}
	tareas := map[string]store.Tarea{}
	if ts, err := s.st.ListTareas(); err == nil {
		for _, t := range ts {
			tareas[t.ID] = t
		}
	}
	n := 0
	for _, l := range lineas {
		if l.Estado != cobros.LineaSinTarifa || l.TareaID == "" {
			continue
		}
		t, ok := tareas[l.TareaID]
		if !ok || t.Etapa != tf.Etapa {
			continue
		}
		tramos, _ := s.st.ListTramos(tf.ID)
		var duracion *int
		var minutos *int
		if t.Minutos != nil {
			minutos = t.Minutos
			seg := *t.Minutos * 60
			duracion = &seg
		}
		monto, ok := cobros.CalcularMontoTarifa(tf, tramos, minutos, duracion)
		if !ok {
			continue
		}
		var cantidad *float64
		if tf.Unidad == cobros.UnidadPorMinuto && minutos != nil {
			c := float64(*minutos)
			cantidad = &c
		} else if tf.Unidad == cobros.UnidadPorDuracion && duracion != nil {
			c := float64(*duracion)
			cantidad = &c
		} else {
			c := 1.0
			cantidad = &c
		}
		if _, err := s.st.UpdateLineaEstado(l.ID, map[string]any{
			"estado": cobros.LineaPorConfirmar, "tarifa_id": tf.ID,
			"unidad": tf.Unidad, "cantidad": *cantidad, "monto_cop": monto,
			"periodo": s.periodoAbierto(cobros.PeriodoActual()),
		}); err != nil {
			continue
		}
		_, _ = actividad.Registrar(s.st, actor, "resolver_sin_tarifa", l.ID,
			map[string]any{"estado": l.Estado, "monto_cop": l.MontoCOP},
			map[string]any{"estado": cobros.LineaPorConfirmar, "monto_cop": monto, "tarifa_id": tf.ID}, "")
		s.notificar(l.UsuarioID, NotiCobroNuevo,
			"Ya hay tarifa para tu cobro", "Etapa "+t.Etapa, "linea", l.ID)
		n++
	}
	return n
}

// --- /paquetes (ver: dueño/admin; editar: solo dueño) ---

func paqueteVista(p store.Paquete) map[string]any {
	return map[string]any{
		"id": p.ID, "nombre": p.Nombre, "precio_cop": p.PrecioCOP,
		"activo": p.Activo, "demo": p.Demo,
		"created_at": p.CreatedAt, "updated_at": p.UpdatedAt,
	}
}

func (s *Server) listPaquetes(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	// El admin crea clientes (necesita el catálogo) y el vendedor elige el
	// paquete al ganar un lead (BRIEF F4 §3: pide paquete del catálogo F2);
	// el resto del equipo no lo ve.
	if !esAdmin(u) && !tieneVentas(u) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	paqs, err := s.st.ListPaquetes()
	if err != nil {
		errorDatos(w, err)
		return
	}
	vista := []map[string]any{}
	for _, p := range paqs {
		vista = append(vista, paqueteVista(p))
	}
	writeJSON(w, http.StatusOK, map[string]any{"paquetes": vista})
}

type paqueteBody struct {
	Nombre    string `json:"nombre"`
	PrecioCOP *int64 `json:"precio_cop"`
	Activo    *bool  `json:"activo"`
}

func (s *Server) createPaquete(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.EditarTarifas, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	var body paqueteBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	if strings.TrimSpace(body.Nombre) == "" {
		writeError(w, http.StatusBadRequest, "el nombre es obligatorio")
		return
	}
	if body.PrecioCOP == nil {
		writeError(w, http.StatusBadRequest, "el precio es obligatorio")
		return
	}
	if *body.PrecioCOP < 0 {
		writeError(w, http.StatusBadRequest, "el precio no puede ser negativo")
		return
	}
	p, err := s.st.CreatePaquete(store.Paquete{
		Nombre: strings.TrimSpace(body.Nombre), PrecioCOP: *body.PrecioCOP,
	})
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "crear_paquete", p.ID, nil,
		map[string]any{"nombre": p.Nombre, "precio_cop": p.PrecioCOP}, "")
	writeJSON(w, http.StatusCreated, paqueteVista(p))
}

func (s *Server) patchPaquete(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.EditarTarifas, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	id := r.PathValue("id")
	p, existe, err := s.st.GetPaquete(id)
	if err != nil {
		errorDatos(w, err)
		return
	}
	if !existe {
		writeError(w, http.StatusNotFound, "paquete no encontrado")
		return
	}
	var body paqueteBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	cambios := map[string]any{}
	if strings.TrimSpace(body.Nombre) != "" {
		cambios["nombre"] = strings.TrimSpace(body.Nombre)
	}
	// Precio 0 es válido (paquete bonificado): solo se toca si vino.
	if body.PrecioCOP != nil {
		if *body.PrecioCOP < 0 {
			writeError(w, http.StatusBadRequest, "el precio no puede ser negativo")
			return
		}
		cambios["precio_cop"] = *body.PrecioCOP
	}
	if body.Activo != nil {
		cambios["activo"] = *body.Activo
	}
	antes := paqueteVista(p)
	act, err := s.st.UpdatePaquete(id, cambios)
	if err != nil {
		errorDatos(w, err)
		return
	}
	// §5.27: el cambio NO altera comisiones ya generadas (congeladas).
	_, _ = actividad.Registrar(s.st, actor, "editar_paquete", id,
		antes, paqueteVista(act), "")
	writeJSON(w, http.StatusOK, paqueteVista(act))
}

// --- /config-cobros (solo dueño) ---

func (s *Server) getConfig(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(u, permisos.EditarTarifas, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	c, err := s.st.GetConfig()
	if err != nil {
		errorDatos(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"porcentaje_comision": c.PorcentajeComision, "modo_comision": c.ModoComision,
	})
}

type configBody struct {
	PorcentajeComision *float64 `json:"porcentaje_comision"`
	ModoComision       string   `json:"modo_comision"`
}

func (s *Server) patchConfig(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.EditarTarifas, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	var body configBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	actual, err := s.st.GetConfig()
	if err != nil {
		errorDatos(w, err)
		return
	}
	antes := map[string]any{
		"porcentaje_comision": actual.PorcentajeComision, "modo_comision": actual.ModoComision,
	}
	if body.PorcentajeComision != nil {
		if *body.PorcentajeComision < 0 || *body.PorcentajeComision > 100 {
			writeError(w, http.StatusBadRequest, "el porcentaje debe estar entre 0 y 100")
			return
		}
		actual.PorcentajeComision = *body.PorcentajeComision
	}
	if strings.TrimSpace(body.ModoComision) != "" {
		if !cobros.ValidarModo(strings.TrimSpace(body.ModoComision)) {
			writeError(w, http.StatusBadRequest, "modo inválido (una_vez o mensual)")
			return
		}
		actual.ModoComision = strings.TrimSpace(body.ModoComision)
	}
	act, err := s.st.UpdateConfig(actual)
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "config_cobros", "config",
		antes, map[string]any{
			"porcentaje_comision": act.PorcentajeComision, "modo_comision": act.ModoComision,
		}, "")
	writeJSON(w, http.StatusOK, map[string]any{
		"porcentaje_comision": act.PorcentajeComision, "modo_comision": act.ModoComision,
	})
}

// --- /lineas ---

func (s *Server) listLineas(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(u, permisos.VerCobros, permisos.Recurso{OwnerID: u.ID}) && !esAdmin(u) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	q := r.URL.Query()
	fPeriodo, fUsuario, fEstado := q.Get("periodo"), q.Get("usuario_id"), q.Get("estado")
	if fPeriodo != "" && !cobros.ValidarPeriodo(fPeriodo) {
		writeError(w, http.StatusBadRequest, "periodo inválido (YYYY-MM)")
		return
	}
	// Equipo: solo lo suyo, incluidas sus comisiones (ver F22/F28/S5).
	fTipo := ""
	if esAdmin(u) {
		fTipo = q.Get("tipo")
	} else {
		if fTipoQ := q.Get("tipo"); fTipoQ == cobros.TipoComision {
			fTipo = fTipoQ
		}
		if fUsuario != "" && fUsuario != u.ID {
			fUsuario = u.ID
		}
	}
	lineas, err := s.st.ListLineas()
	if err != nil {
		errorDatos(w, err)
		return
	}
	usuarios := s.mapaUsuarios()
	out := []map[string]any{}
	for _, l := range lineas {
		if !esAdmin(u) {
			if l.UsuarioID != u.ID {
				continue
			}
			if fTipo == cobros.TipoComision && l.Tipo != cobros.TipoComision {
				continue
			}
		}
		if fPeriodo != "" && l.Periodo != fPeriodo {
			continue
		}
		if fUsuario != "" && l.UsuarioID != fUsuario {
			continue
		}
		if fEstado != "" && l.Estado != fEstado {
			continue
		}
		if fTipo != "" && l.Tipo != fTipo {
			continue
		}
		out = append(out, lineaVista(l, usuarios))
	}
	writeJSON(w, http.StatusOK, map[string]any{"lineas": out})
}

func (s *Server) getLinea(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	l, ok := s.conLinea(w, r.PathValue("id"))
	if !ok {
		return
	}
	if !puedeVerLinea(u, l) {
		// No revelar existencia a quien no puede verla (§3.2: equipo solo
		// lo suyo; el vendedor-ventas sí ve comisiones).
		writeError(w, http.StatusNotFound, "línea no encontrada")
		return
	}
	writeJSON(w, http.StatusOK, lineaVista(l, s.mapaUsuarios()))
}

// moverLinea aplica una transición de estado con actividad + notificación.
// mismaLinea=true (ya estaba en ese estado) → 200 idempotente sin duplicar.
func (s *Server) moverLinea(w http.ResponseWriter, actor permisos.Usuario, l store.LineaCobro, a string, accion string, motivo string, extra map[string]any) {
	if !cobros.TransicionLineaValida(l.Estado, a) {
		writeError(w, http.StatusBadRequest, "esa transición de estado no es válida")
		return
	}
	if l.Estado == a {
		writeJSON(w, http.StatusOK, lineaVista(l, s.mapaUsuarios()))
		return
	}
	cambios := map[string]any{"estado": a}
	if motivo != "" && (accion == "reclamar" || accion == "devolver") {
		if accion == "reclamar" {
			cambios["reclamo_motivo"] = motivo
		} else {
			cambios["motivo"] = motivo
		}
	}
	for k, v := range extra {
		cambios[k] = v
	}
	act, err := s.st.UpdateLineaEstado(l.ID, cambios)
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, accion+"_linea", l.ID,
		map[string]any{"estado": l.Estado}, map[string]any{"estado": act.Estado}, motivo)
	writeJSON(w, http.StatusOK, lineaVista(act, s.mapaUsuarios()))
}

// confirmarLinea: por_confirmar → confirmada (dueño de la línea o admin).
func (s *Server) confirmarLinea(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	l, ok := s.conLinea(w, r.PathValue("id"))
	if !ok {
		return
	}
	if !esAdmin(actor) {
		if !permisos.Puede(actor, permisos.ConfirmarCobro, permisos.Recurso{OwnerID: actor.ID}) || l.UsuarioID != actor.ID {
			writeError(w, http.StatusForbidden, "no autorizado")
			return
		}
	}
	s.moverLinea(w, actor, l, cobros.LineaConfirmada, "confirmar", "", nil)
}

type motivoBody struct {
	Motivo string `json:"motivo"`
}

// reclamarLinea: → reclamada con motivo (dueño de la línea o admin).
func (s *Server) reclamarLinea(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	l, ok := s.conLinea(w, r.PathValue("id"))
	if !ok {
		return
	}
	if !esAdmin(actor) {
		if !permisos.Puede(actor, permisos.ReclamarCobro, permisos.Recurso{OwnerID: actor.ID}) || l.UsuarioID != actor.ID {
			writeError(w, http.StatusForbidden, "no autorizado")
			return
		}
	}
	var body motivoBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	if strings.TrimSpace(body.Motivo) == "" {
		writeError(w, http.StatusBadRequest, "el motivo es obligatorio para reclamar")
		return
	}
	motivo := strings.TrimSpace(body.Motivo)
	// mueve y después avisa: moverLinea responde 400 si la transición no
	// es válida o 502 si falló el store (en esos casos NO hay reclamo real
	// y no se avisa). Solo avisa si el reclamo quedó registrado.
	registrado := cobros.TransicionLineaValida(l.Estado, cobros.LineaReclamada) && l.Estado != cobros.LineaReclamada
	s.moverLinea(w, actor, l, cobros.LineaReclamada, "reclamar", motivo, nil)
	if !registrado {
		return
	}
	if actual, existe, err := s.st.GetLinea(l.ID); err != nil || !existe || actual.Estado != cobros.LineaReclamada {
		return
	}
	for _, u := range s.mapaUsuarios() {
		if u.Acceso == permisos.AccesoDueno || u.Acceso == permisos.AccesoAdmin {
			s.notificar(u.ID, NotiCobroReclamo,
				"Cobro reclamado", motivo, "linea", l.ID)
		}
	}
}

// aprobarLinea: confirmada|reclamada → aprobada (admin/dueño).
func (s *Server) aprobarLinea(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.AprobarCobros, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	l, ok := s.conLinea(w, r.PathValue("id"))
	if !ok {
		return
	}
	if l.Estado == cobros.LineaAprobada {
		writeJSON(w, http.StatusOK, lineaVista(l, s.mapaUsuarios()))
		return
	}
	if l.Estado != cobros.LineaConfirmada && l.Estado != cobros.LineaReclamada {
		writeError(w, http.StatusBadRequest, "solo se puede aprobar una línea confirmada o reclamada")
		return
	}
	s.moverLinea(w, actor, l, cobros.LineaAprobada, "aprobar", "", nil)
	s.notificar(l.UsuarioID, NotiLineaAprobada,
		"Cobro aprobado", "Ya entró al corte", "linea", l.ID)
}

type comentarioBody struct {
	Comentario string `json:"comentario"`
}

// devolverLinea: confirmada|reclamada → por_confirmar (admin/dueño).
func (s *Server) devolverLinea(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.AprobarCobros, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	l, ok := s.conLinea(w, r.PathValue("id"))
	if !ok {
		return
	}
	var body comentarioBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	if strings.TrimSpace(body.Comentario) == "" {
		writeError(w, http.StatusBadRequest, "el comentario es obligatorio para devolver")
		return
	}
	s.moverLinea(w, actor, l, cobros.LineaPorConfirmar, "devolver", strings.TrimSpace(body.Comentario), nil)
}

type ajusteBody struct {
	UsuarioID string `json:"usuario_id"`
	MontoCOP  int64  `json:"monto_cop"`
	Motivo    string `json:"motivo"`
	Periodo   string `json:"periodo"`
}

// crearAjuste: línea nueva positiva o negativa con motivo (admin/dueño).
// Nunca edita (§5.18). En periodos cerrados va al siguiente abierto (§5.20).
func (s *Server) crearAjuste(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.AjusteCobro, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	var body ajusteBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	if strings.TrimSpace(body.UsuarioID) == "" {
		writeError(w, http.StatusBadRequest, "usuario_id es obligatorio")
		return
	}
	if _, existe, err := s.st.GetUsuario(strings.TrimSpace(body.UsuarioID)); err != nil {
		errorDatos(w, err)
		return
	} else if !existe {
		writeError(w, http.StatusNotFound, "usuario no encontrado")
		return
	}
	if body.MontoCOP == 0 {
		writeError(w, http.StatusBadRequest, "el monto no puede ser cero")
		return
	}
	if strings.TrimSpace(body.Motivo) == "" {
		writeError(w, http.StatusBadRequest, "el motivo es obligatorio para el ajuste")
		return
	}
	periodo := strings.TrimSpace(body.Periodo)
	if periodo == "" {
		periodo = cobros.PeriodoActual()
	}
	if !cobros.ValidarPeriodo(periodo) {
		writeError(w, http.StatusBadRequest, "periodo inválido (YYYY-MM)")
		return
	}
	periodo = s.periodoAbierto(periodo)
	l, err := s.st.CreateLinea(store.LineaCobro{
		UsuarioID: strings.TrimSpace(body.UsuarioID), Tipo: cobros.TipoAjuste,
		Estado: cobros.LineaAprobada, MontoCOP: body.MontoCOP,
		Motivo: strings.TrimSpace(body.Motivo),
		Periodo: periodo, CreatedBy: actor.ID,
	})
	if err != nil {
		errorDatos(w, err)
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "ajuste_linea", l.ID, nil,
		map[string]any{
			"usuario_id": l.UsuarioID, "monto_cop": l.MontoCOP,
			"motivo": l.Motivo, "periodo": periodo,
		}, strings.TrimSpace(body.Motivo))
	s.notificar(l.UsuarioID, NotiLineaAprobada,
		"Ajuste en tus cobros", strings.TrimSpace(body.Motivo), "linea", l.ID)
	writeJSON(w, http.StatusCreated, lineaVista(l, s.mapaUsuarios()))
}

// periodoAbierto: si el periodo tiene corte cerrado/pagado, avanza al
// siguiente abierto (§5.20: en cortes cerrados los ajustes van al siguiente).
func (s *Server) periodoAbierto(periodo string) string {
	for i := 0; i < 24; i++ {
		c, ok, err := s.st.GetCorteByPeriodo(periodo)
		if err != nil || !ok || c.Estado == cobros.CorteAbierto {
			return periodo
		}
		periodo = cobros.PeriodoSiguiente(periodo)
	}
	return periodo
}

// --- /cortes (cerrar/pagar/revertir: solo dueño, §7.1) ---

func (s *Server) listCortes(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !esAdmin(u) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	cortes, err := s.st.ListCortes()
	if err != nil {
		errorDatos(w, err)
		return
	}
	vista := []map[string]any{}
	for _, c := range cortes {
		vista = append(vista, corteVista(c))
	}
	writeJSON(w, http.StatusOK, map[string]any{"cortes": vista})
}

func corteVista(c store.Corte) map[string]any {
	return map[string]any{
		"id": c.ID, "periodo": c.Periodo, "estado": c.Estado,
		"cerrado_at": c.CerradoAt, "created_at": c.CreatedAt,
	}
}

// resumenCorte arma la vista en vivo: por persona, total aprobado,
// por confirmar, reclamado, en_corte, pagado + sin_tarifa (§5.22).
// Recibe al lector para recortar "lo ajeno": admin/dueño ven todo; el
// equipo solo sus líneas (y sus comisiones si es vendedor-ventas).
func (s *Server) resumenCortePara(periodo string, u permisos.Usuario) map[string]any {
	lineas, _ := s.st.ListLineas()
	usuarios := s.mapaUsuarios()
	porPersona := map[string]map[string]any{}
	orden := []string{}
	suma := func(uid, campo string, monto int64) {
		p, ok := porPersona[uid]
		if !ok {
			nombre := uid
			if u, ok := usuarios[uid]; ok {
				nombre = u.Nombre
			}
			p = map[string]any{
				"usuario_id": uid, "usuario_nombre": nombre,
				"aprobado": int64(0), "por_confirmar": int64(0),
				"reclamado": int64(0), "en_corte": int64(0),
				"pagado": int64(0), "sin_tarifa": 0,
			}
			porPersona[uid] = p
			orden = append(orden, uid)
		}
		switch campo {
		case "sin_tarifa":
			p[campo] = p[campo].(int) + 1
		default:
			p[campo] = p[campo].(int64) + monto
		}
	}
	detalle := []map[string]any{}
	for _, l := range lineas {
		if l.Periodo != periodo {
			continue
		}
		// Equipo: solo lo suyo (las comisiones ajenas no son su cobro;
		// ver F22/F28/S5).
		if !esAdmin(u) && l.UsuarioID != u.ID {
			continue
		}
		detalle = append(detalle, lineaVista(l, usuarios))
		switch l.Estado {
		case cobros.LineaAprobada:
			suma(l.UsuarioID, "aprobado", l.MontoCOP)
		case cobros.LineaPorConfirmar, cobros.LineaConfirmada:
			suma(l.UsuarioID, "por_confirmar", l.MontoCOP)
		case cobros.LineaReclamada:
			suma(l.UsuarioID, "reclamado", l.MontoCOP)
		case cobros.LineaEnCorte:
			suma(l.UsuarioID, "en_corte", l.MontoCOP)
		case cobros.LineaPagada:
			suma(l.UsuarioID, "pagado", l.MontoCOP)
		case cobros.LineaSinTarifa:
			suma(l.UsuarioID, "sin_tarifa", 0)
		}
	}
	personas := []map[string]any{}
	for _, uid := range orden {
		personas = append(personas, porPersona[uid])
	}
	return map[string]any{
		"periodo": periodo, "por_persona": personas, "lineas": detalle,
	}
}

func (s *Server) corteActual(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !esAdmin(u) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	periodo := strings.TrimSpace(r.URL.Query().Get("periodo"))
	if periodo == "" {
		periodo = cobros.PeriodoActual()
	}
	if !cobros.ValidarPeriodo(periodo) {
		writeError(w, http.StatusBadRequest, "periodo inválido (YYYY-MM)")
		return
	}
	res := s.resumenCortePara(periodo, u)
	if c, ok, _ := s.st.GetCorteByPeriodo(periodo); ok {
		res["corte"] = corteVista(c)
	} else {
		res["corte"] = map[string]any{"periodo": periodo, "estado": cobros.CorteAbierto}
	}
	writeJSON(w, http.StatusOK, res)
}

// corteMio: historial del trabajador (§5.22: "llevas $X aprobado este mes,
// $Y por confirmar" + historial de sus cortes). Mismo resumen pero recortado
// a sus líneas; incluye el estado del corte del periodo si existe.
func (s *Server) corteMio(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(u, permisos.VerCobros, permisos.Recurso{OwnerID: u.ID}) && !esAdmin(u) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	periodo := strings.TrimSpace(r.URL.Query().Get("periodo"))
	if periodo == "" {
		periodo = cobros.PeriodoActual()
	}
	if !cobros.ValidarPeriodo(periodo) {
		writeError(w, http.StatusBadRequest, "periodo inválido (YYYY-MM)")
		return
	}
	res := s.resumenCortePara(periodo, u)
	if c, ok, _ := s.st.GetCorteByPeriodo(periodo); ok {
		res["corte"] = corteVista(c)
	} else {
		res["corte"] = map[string]any{"periodo": periodo, "estado": cobros.CorteAbierto}
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) getCorte(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !esAdmin(u) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	periodo := r.PathValue("periodo")
	if !cobros.ValidarPeriodo(periodo) || periodo == "" {
		writeError(w, http.StatusBadRequest, "periodo inválido (YYYY-MM)")
		return
	}
	c, ok, err := s.st.GetCorteByPeriodo(periodo)
	if err != nil {
		errorDatos(w, err)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "corte no encontrado")
		return
	}
	res := s.resumenCortePara(periodo, u)
	res["corte"] = corteVista(c)
	writeJSON(w, http.StatusOK, res)
}

type cerrarBody struct {
	Periodo string `json:"periodo"`
}

// cerrarCorte (solo dueño): aprobada del periodo → en_corte; lo no aprobado
// (por_confirmar/confirmada/reclamada/sin_tarifa) se arrastra al periodo
// siguiente (§5.20). Cerrado no se reabre.
func (s *Server) cerrarCorte(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.CerrarCorte, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	var body cerrarBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	periodo := strings.TrimSpace(body.Periodo)
	if periodo == "" {
		periodo = cobros.PeriodoActual()
	}
	if !cobros.ValidarPeriodo(periodo) {
		writeError(w, http.StatusBadRequest, "periodo inválido (YYYY-MM)")
		return
	}
	if c, ok, _ := s.st.GetCorteByPeriodo(periodo); ok && c.Estado != cobros.CorteAbierto {
		writeError(w, http.StatusBadRequest, "el corte ya está cerrado y no se reabre")
		return
	}
	corte, err := s.st.CreateCorte(store.Corte{
		Periodo: periodo, Estado: cobros.CorteCerrado,
		CerradoAt: store.Ahora(), CreatedBy: actor.ID,
	})
	if err != nil {
		errorDatos(w, err)
		return
	}
	siguiente := cobros.PeriodoSiguiente(periodo)
	lineas, err := s.st.ListLineas()
	if err != nil {
		errorDatos(w, err)
		return
	}
	enCorte, arrastradas := 0, 0
	for _, l := range lineas {
		if l.Periodo != periodo {
			continue
		}
		switch l.Estado {
		case cobros.LineaAprobada:
			if _, err := s.st.UpdateLineaEstado(l.ID, map[string]any{
				"estado": cobros.LineaEnCorte, "corte_id": corte.ID,
			}); err == nil {
				enCorte++
			}
		case cobros.LineaPorConfirmar, cobros.LineaConfirmada,
			cobros.LineaReclamada, cobros.LineaSinTarifa:
			if _, err := s.st.UpdateLineaEstado(l.ID, map[string]any{"periodo": siguiente}); err == nil {
				arrastradas++
			}
		}
	}
	_, _ = actividad.Registrar(s.st, actor, "cerrar_corte", corte.ID,
		map[string]any{"periodo": periodo},
		map[string]any{"estado": corte.Estado, "en_corte": enCorte, "arrastradas": arrastradas}, "")
	for _, l := range lineas {
		if l.Periodo == periodo {
			s.notificar(l.UsuarioID, NotiCorteCerrado,
				"Corte "+periodo+" cerrado", "", "corte", corte.ID)
			break
		}
	}
	res := s.resumenCortePara(periodo, actor)
	res["corte"] = corteVista(corte)
	res["en_corte"] = enCorte
	res["arrastradas"] = arrastradas
	writeJSON(w, http.StatusOK, res)
}

type pagarBody struct {
	UsuarioID string `json:"usuario_id"`
}

// pagarCorte (solo dueño): en_corte → pagada, todo o por persona.
func (s *Server) pagarCorte(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.MarcarPagado, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	periodo := r.PathValue("periodo")
	c, ok, err := s.st.GetCorteByPeriodo(periodo)
	if err != nil {
		errorDatos(w, err)
		return
	}
	if !ok || c.Estado == cobros.CorteAbierto {
		writeError(w, http.StatusBadRequest, "el corte no está cerrado")
		return
	}
	var body pagarBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	filtro := strings.TrimSpace(body.UsuarioID)
	lineas, err := s.st.ListLineas()
	if err != nil {
		errorDatos(w, err)
		return
	}
	pagadas := 0
	for _, l := range lineas {
		if l.CorteID != c.ID || l.Estado != cobros.LineaEnCorte {
			continue
		}
		if filtro != "" && l.UsuarioID != filtro {
			continue
		}
		if _, err := s.st.UpdateLineaEstado(l.ID, map[string]any{"estado": cobros.LineaPagada}); err == nil {
			pagadas++
			s.notificar(l.UsuarioID, NotiCobroPagado,
				"Cobro pagado", "Corte "+periodo, "linea", l.ID)
		}
	}
	_, _ = actividad.Registrar(s.st, actor, "marcar_pagado", c.ID,
		map[string]any{"periodo": periodo},
		map[string]any{"pagadas": pagadas, "usuario_id": filtro}, "")
	s.actualizarEstadoCorte(c)
	writeJSON(w, http.StatusOK, map[string]any{"pagadas": pagadas, "periodo": periodo})
}

// revertirCorte (solo dueño): pagada → en_corte + actividad (§5.21).
func (s *Server) revertirCorte(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.MarcarPagado, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	periodo := r.PathValue("periodo")
	c, ok, err := s.st.GetCorteByPeriodo(periodo)
	if err != nil {
		errorDatos(w, err)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "corte no encontrado")
		return
	}
	var body pagarBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	filtro := strings.TrimSpace(body.UsuarioID)
	lineas, err := s.st.ListLineas()
	if err != nil {
		errorDatos(w, err)
		return
	}
	revertidas := 0
	for _, l := range lineas {
		if l.CorteID != c.ID || l.Estado != cobros.LineaPagada {
			continue
		}
		if filtro != "" && l.UsuarioID != filtro {
			continue
		}
		if _, err := s.st.UpdateLineaEstado(l.ID, map[string]any{"estado": cobros.LineaEnCorte}); err == nil {
			revertidas++
		}
	}
	_, _ = actividad.Registrar(s.st, actor, "revertir_pagado", c.ID,
		map[string]any{"periodo": periodo},
		map[string]any{"revertidas": revertidas, "usuario_id": filtro}, "")
	s.actualizarEstadoCorte(c)
	writeJSON(w, http.StatusOK, map[string]any{"revertidas": revertidas, "periodo": periodo})
}

// actualizarEstadoCorte recalcula pagado_parcial/pagado según líneas.
func (s *Server) actualizarEstadoCorte(c store.Corte) {
	lineas, err := s.st.ListLineas()
	if err != nil {
		return
	}
	total, pagadas := 0, 0
	for _, l := range lineas {
		if l.CorteID != c.ID {
			continue
		}
		total++
		if l.Estado == cobros.LineaPagada {
			pagadas++
		}
	}
	estado := cobros.CorteCerrado
	if total > 0 && pagadas == total {
		estado = cobros.CortePagado
	} else if pagadas > 0 {
		estado = cobros.CortePagadoParcial
	}
	_, _ = s.st.UpdateCorte(c.ID, map[string]any{"estado": estado})
}

// corteCSV exporta el corte como CSV (dueño/admin).
func (s *Server) corteCSV(w http.ResponseWriter, r *http.Request) {
	u, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !esAdmin(u) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	periodo := r.PathValue("periodo")
	if !cobros.ValidarPeriodo(periodo) || periodo == "" {
		writeError(w, http.StatusBadRequest, "periodo inválido (YYYY-MM)")
		return
	}
	lineas, err := s.st.ListLineas()
	if err != nil {
		errorDatos(w, err)
		return
	}
	usuarios := s.mapaUsuarios()
	var buf bytes.Buffer
	cw := csv.NewWriter(&buf)
	_ = cw.Write([]string{"periodo", "usuario", "tipo", "estado", "monto_cop", "motivo"})
	for _, l := range lineas {
		if l.Periodo != periodo {
			continue
		}
		nombre := l.UsuarioID
		if us, ok := usuarios[l.UsuarioID]; ok {
			nombre = us.Nombre
		}
		_ = cw.Write([]string{
			l.Periodo, nombre, l.Tipo, l.Estado,
			int64a(l.MontoCOP), l.Motivo,
		})
	}
	cw.Flush()
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=\"corte-"+periodo+".csv\"")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(buf.Bytes())
}

func int64a(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	dig := []byte{}
	for n > 0 {
		dig = append([]byte{byte('0' + n%10)}, dig...)
		n /= 10
	}
	if neg {
		dig = append([]byte{'-'}, dig...)
	}
	return string(dig)
}

// --- comisiones ---

type mensualBody struct {
	Periodo string `json:"periodo"`
}

// comisionesMensual genera la comisión de cada cliente activo con vendedor
// (modo mensual). Idempotente por (vendedor, cliente, periodo).
// En modo una_vez responde 400 (usar la generación al crear el cliente).
func (s *Server) comisionesMensual(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.AprobarCobros, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	cfg, err := s.st.GetConfig()
	if err != nil {
		errorDatos(w, err)
		return
	}
	if cfg.ModoComision != cobros.ModoMensual {
		writeError(w, http.StatusBadRequest, "el modo de comisión es una_vez (esta acción es para modo mensual)")
		return
	}
	var body mensualBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	periodo := strings.TrimSpace(body.Periodo)
	if periodo == "" {
		periodo = cobros.PeriodoActual()
	}
	if !cobros.ValidarPeriodo(periodo) {
		writeError(w, http.StatusBadRequest, "periodo inválido (YYYY-MM)")
		return
	}
	n := s.generarComisiones(actor, periodo, nil)
	writeJSON(w, http.StatusOK, map[string]any{"generadas": n, "periodo": periodo})
}

// generarComisiones crea líneas de comisión para clientes activos con
// vendedor. Si soloCliente != nil, solo ese cliente. Devuelve cuántas creó.
// Idempotente: no duplica (vendedor, cliente, periodo). Nace en el periodo
// ABIERTO (§5.20): si el mes pedido ya se cerró, va al siguiente abierto.
func (s *Server) generarComisiones(actor permisos.Usuario, periodo string, soloCliente *store.Cliente) int {
	cfg, err := s.st.GetConfig()
	if err != nil {
		return 0
	}
	periodo = s.periodoAbierto(periodo)
	clientes, err := s.st.ListClientes(false)
	if err != nil {
		return 0
	}
	paqs := map[string]store.Paquete{}
	if ps, err := s.st.ListPaquetes(); err == nil {
		for _, p := range ps {
			paqs[p.ID] = p
		}
	}
	lineas, err := s.st.ListLineas()
	if err != nil {
		return 0
	}
	existe := map[string]bool{}
	for _, l := range lineas {
		if l.Tipo == cobros.TipoComision && l.Periodo == periodo && l.ComisionClienteID != "" {
			existe[l.UsuarioID+"\x00"+l.ComisionClienteID] = true
		}
	}
	creadas := 0
	for _, c := range clientes {
		if soloCliente != nil && c.ID != soloCliente.ID {
			continue
		}
		if c.Estado != produccion.ClienteActivo || c.VendidoPor == "" || c.PaqueteID == "" {
			continue
		}
		p, ok := paqs[c.PaqueteID]
		if !ok {
			continue
		}
		if existe[c.VendidoPor+"\x00"+c.ID] {
			continue
		}
		monto := cobros.ComisionPara(p.PrecioCOP, cfg.PorcentajeComision)
		l, err := s.st.CreateLinea(store.LineaCobro{
			UsuarioID: c.VendidoPor, Tipo: cobros.TipoComision,
			Estado: cobros.LineaAprobada, MontoCOP: monto,
			Motivo: "Comisión venta " + c.Nombre + " (" + p.Nombre + ")",
			Periodo: periodo, ComisionClienteID: c.ID, CreatedBy: actor.ID,
		})
		if err != nil {
			continue
		}
		_, _ = actividad.Registrar(s.st, actor, "generar_comision", l.ID, nil,
			map[string]any{
				"usuario_id": l.UsuarioID, "cliente_id": c.ID,
				"monto_cop": monto, "periodo": periodo,
			}, "")
		s.notificar(l.UsuarioID, NotiCobroNuevo,
			"Comisión por venta", c.Nombre, "linea", l.ID)
		creadas++
	}
	return creadas
}

// --- decisión de canceladas (solo dueño, §7.6) ---

type decisionBody struct {
	Decision string `json:"decision"`
	Motivo   string `json:"motivo"`
}

// decisionTarea: pagar → crea la línea con la tarifa (o sin_tarifa);
// no_pagar → registra el motivo. Limpia decision_pendiente en ambos casos.
func (s *Server) decisionTarea(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.usuarioActual(w, r)
	if !ok {
		return
	}
	if !permisos.Puede(actor, permisos.DecidirCancelada, permisos.Recurso{}) {
		writeError(w, http.StatusForbidden, "no autorizado")
		return
	}
	t, ok := s.conTarea(w, r.PathValue("id"))
	if !ok {
		return
	}
	if !t.DecisionPendiente {
		writeError(w, http.StatusBadRequest, "la tarea no está pendiente de decisión")
		return
	}
	var body decisionBody
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "cuerpo inválido")
		return
	}
	d := strings.TrimSpace(body.Decision)
	if d != "pagar" && d != "no_pagar" {
		writeError(w, http.StatusBadRequest, "decisión inválida (pagar o no_pagar)")
		return
	}
	if strings.TrimSpace(body.Motivo) == "" {
		writeError(w, http.StatusBadRequest, "el motivo es obligatorio para decidir")
		return
	}
	motivo := strings.TrimSpace(body.Motivo)
	act, err := s.st.UpdateTarea(t.ID, map[string]any{"decision_pendiente": false})
	if err != nil {
		errorDatos(w, err)
		return
	}
	if d == "pagar" {
		linea := s.generarLineaAprobacion(actor, act)
		_, _ = actividad.Registrar(s.st, actor, "decidir_pagar", t.ID,
			map[string]any{"decision_pendiente": true},
			map[string]any{"decision_pendiente": false, "linea_id": linea.ID}, motivo)
		writeJSON(w, http.StatusOK, map[string]any{
			"tarea": tareaVistaSimple(act), "linea_id": linea.ID,
		})
		return
	}
	_, _ = actividad.Registrar(s.st, actor, "decidir_no_pagar", t.ID,
		map[string]any{"decision_pendiente": true},
		map[string]any{"decision_pendiente": false}, motivo)
	writeJSON(w, http.StatusOK, map[string]any{"tarea": tareaVistaSimple(act)})
}
