// Tests HTTP del contrato F4 con store en memoria + X-Demo-User: CRUD de
// leads (dueño del lead, kanban, próxima acción), duplicados (§5.24),
// mover con transiciones + perdido con motivo, ganado → cliente + 1 sola
// comisión exacta (§7.5, BRIEF F4 §6.3: Valentina + paquete Digital Inicial
// → $23.200), reactivar cliente (§5.25), desactivar vendedor → leads sin
// asignar (§5.26), visitas idempotentes por client_id (§5.23) + fotos, y
// seguridad (equipo sin ventas 403; vendedor no ve ajenos; solo admin
// reasigna).
package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"rconceptsys/backend/internal/cobros"
	"rconceptsys/backend/internal/store"
)

func cuerpoF4(t *testing.T, s *Server, metodo, ruta, demo, cuerpo string, quiere int) map[string]any {
	t.Helper()
	w := llamar(s, metodo, ruta, demo, cuerpo)
	if w.Code != quiere {
		t.Fatalf("%s %s %s = %d (%s), quería %d", metodo, ruta, demo, w.Code, w.Body.String(), quiere)
	}
	var m map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &m); err != nil {
		t.Fatalf("respuesta no JSON: %v (%q)", err, w.Body.String())
	}
	return m
}

func listaF4(t *testing.T, s *Server, demo, ruta, clave string) []any {
	t.Helper()
	w := llamar(s, "GET", ruta, demo, "")
	if w.Code != http.StatusOK {
		t.Fatalf("GET %s %s = %d (%s)", ruta, demo, w.Code, w.Body.String())
	}
	var m map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &m); err != nil {
		t.Fatalf("%s no JSON: %v", clave, err)
	}
	v, _ := m[clave].([]any)
	if v == nil {
		return []any{}
	}
	return v
}

// paqueteDigitalInicial devuelve el id del paquete "Digital Inicial"
// (290.000 → comisión 23.200 al 8 %).
func paqueteDigitalInicial(t *testing.T, s *Server) string {
	t.Helper()
	w := llamar(s, "GET", "/paquetes", "admin", "")
	if w.Code != http.StatusOK {
		t.Fatalf("GET /paquetes = %d (%s)", w.Code, w.Body.String())
	}
	var m map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &m); err != nil {
		t.Fatalf("paquetes no JSON: %v", err)
	}
	for _, item := range m["paquetes"].([]any) {
		p := item.(map[string]any)
		if p["nombre"] == "Digital Inicial" {
			return p["id"].(string)
		}
	}
	t.Fatal("sin paquete Digital Inicial en semillas")
	return ""
}

func TestLeadsSeguridad(t *testing.T) {
	s := servidorPrueba()
	// Equipo sin oficio ventas (Breiner) no ve Ventas → 403.
	if w := llamar(s, "GET", "/leads", "equipo", ""); w.Code != http.StatusForbidden {
		t.Errorf("equipo sin ventas GET /leads = %d, quería 403", w.Code)
	}
	if w := llamar(s, "POST", "/leads", "equipo", `{"negocio":"X"}`); w.Code != http.StatusForbidden {
		t.Errorf("equipo sin ventas POST /leads = %d, quería 403", w.Code)
	}
	// Valentina (vendedora demo) crea el suyo.
	m := cuerpoF4(t, s, "POST", "/leads", "valentina@demo.rconceptsys",
		`{"negocio":"Tienda QA","telefono":"300 999 8877","origen":"visita","municipio":"Rionegro"}`, http.StatusCreated)
	if m["estado"] != "prospecto" {
		t.Errorf("estado = %v, quería prospecto", m["estado"])
	}
	id := m["id"].(string)
	// Breiner no ve el lead ajeno ni por directa (404, sin filtrar).
	if w := llamar(s, "GET", "/leads/"+id, "equipo", ""); w.Code != http.StatusForbidden {
		t.Errorf("equipo sin ventas GET lead = %d, quería 403", w.Code)
	}
	// Admin sí lo ve.
	cuerpoF4(t, s, "GET", "/leads/"+id, "admin", "", http.StatusOK)
	// Solo admin reasigna: Valentina → 403.
	if w := llamar(s, "POST", "/leads/"+id+"/reasignar", "valentina@demo.rconceptsys", `{"vendedor_id":""}`); w.Code != http.StatusForbidden {
		t.Errorf("vendedor reasigna = %d, quería 403", w.Code)
	}
}

func TestLeadsDuplicados(t *testing.T) {
	s := servidorPrueba()
	// La semilla Tizón (300 111 2233, Valentina) ya existe: crear con el
	// mismo teléfono avisa "ya lo tiene Fulano" sin bloquear.
	m := cuerpoF4(t, s, "POST", "/leads", "admin",
		`{"negocio":"Tizón Sucursal","telefono":"+57 300-111-2233","origen":"llamada"}`, http.StatusCreated)
	dups, ok := m["duplicados"].([]any)
	if !ok || len(dups) == 0 {
		t.Fatalf("sin aviso de duplicado: %v", m)
	}
	d := dups[0].(map[string]any)
	if d["vendedor_nombre"] != "Valentina" {
		t.Errorf("duplicado vendedor = %v, quería Valentina", d)
	}
	// Nombre parecido sin teléfono igual también avisa.
	m2 := cuerpoF4(t, s, "POST", "/leads", "admin",
		`{"negocio":"el tizon dorado","telefono":"999","origen":"redes"}`, http.StatusCreated)
	if _, ok := m2["duplicados"].([]any); !ok {
		t.Errorf("nombre parecido debería avisar: %v", m2)
	}
}

func TestLeadMoverYPerder(t *testing.T) {
	s := servidorPrueba()
	m := cuerpoF4(t, s, "POST", "/leads", "valentina@demo.rconceptsys",
		`{"negocio":"Mover QA","origen":"visita"}`, http.StatusCreated)
	id := m["id"].(string)
	// Salto prospecto → propuesta inválido.
	if w := llamar(s, "POST", "/leads/"+id+"/mover", "valentina@demo.rconceptsys", `{"estado":"propuesta_enviada"}`); w.Code != http.StatusBadRequest {
		t.Errorf("salto de etapa = %d, quería 400", w.Code)
	}
	// Avance válido + idempotencia (repetir = 200).
	cuerpoF4(t, s, "POST", "/leads/"+id+"/mover", "valentina@demo.rconceptsys", `{"estado":"en_contacto"}`, http.StatusOK)
	cuerpoF4(t, s, "POST", "/leads/"+id+"/mover", "valentina@demo.rconceptsys", `{"estado":"en_contacto"}`, http.StatusOK)
	// Perder sin motivo → 400; con motivo → 200.
	if w := llamar(s, "POST", "/leads/"+id+"/mover", "valentina@demo.rconceptsys", `{"estado":"perdido"}`); w.Code != http.StatusBadRequest {
		t.Errorf("perder sin motivo = %d, quería 400", w.Code)
	}
	cuerpoF4(t, s, "POST", "/leads/"+id+"/mover", "valentina@demo.rconceptsys", `{"estado":"perdido","motivo_perdida":"muy caro"}`, http.StatusOK)
}

// llevarANegociacion crea un lead de Valentina y lo avanza hasta negociación.
func llevarANegociacion(t *testing.T, s *Server, negocio string) string {
	t.Helper()
	m := cuerpoF4(t, s, "POST", "/leads", "valentina@demo.rconceptsys",
		`{"negocio":"`+negocio+`","telefono":"310 000 1122","origen":"visita"}`, http.StatusCreated)
	id := m["id"].(string)
	for _, e := range []string{"en_contacto", "propuesta_enviada", "negociacion"} {
		cuerpoF4(t, s, "POST", "/leads/"+id+"/mover", "valentina@demo.rconceptsys", `{"estado":"`+e+`"}`, http.StatusOK)
	}
	return id
}

func TestGanarLeadComisionUnica(t *testing.T) {
	s := servidorPrueba()
	id := llevarANegociacion(t, s, "Negocio Comisión Única XYZ")
	paq := paqueteDigitalInicial(t, s)
	// Sin paquete → 400.
	if w := llamar(s, "POST", "/leads/"+id+"/ganar", "valentina@demo.rconceptsys", `{}`); w.Code != http.StatusBadRequest {
		t.Errorf("ganar sin paquete = %d, quería 400", w.Code)
	}
	m := cuerpoF4(t, s, "POST", "/leads/"+id+"/ganar", "valentina@demo.rconceptsys",
		`{"paquete_id":"`+paq+`"}`, http.StatusOK)
	if m["estado"] != "ganado" {
		t.Fatalf("estado = %v, quería ganado", m["estado"])
	}
	clienteID, _ := m["cliente_id"].(string)
	if clienteID == "" {
		t.Fatal("sin cliente enlazado")
	}
	// Cliente creado con paquete_id y vendido_por = Valentina.
	w := llamar(s, "GET", "/clientes/"+clienteID, "admin", "")
	if w.Code != http.StatusOK {
		t.Fatalf("GET cliente = %d (%s)", w.Code, w.Body.String())
	}
	var c map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &c); err != nil {
		t.Fatalf("cliente no JSON: %v", err)
	}
	cli, _ := c["cliente"].(map[string]any)
	if cli["vendido_por"] != store.SemillaValentinaID {
		t.Errorf("vendido_por = %v, quería Valentina", cli["vendido_por"])
	}
	if cli["paquete_id"] != paq {
		t.Errorf("paquete_id = %v", cli["paquete_id"])
	}
	// Comisión exacta: 290.000 × 8 % = 23.200, una sola vez.
	lineas := listaF4(t, s, "admin", "/lineas?tipo=comision", "lineas")
	n := 0
	for _, item := range lineas {
		l := item.(map[string]any)
		if l["comision_cliente_id"] == clienteID {
			n++
			if l["monto_cop"] != float64(23200) {
				t.Errorf("comisión = %v, quería 23200", l["monto_cop"])
			}
			if l["tipo"] != cobros.TipoComision {
				t.Errorf("tipo = %v", l["tipo"])
			}
		}
	}
	if n != 1 {
		t.Fatalf("comisiones del cliente = %d, quería 1", n)
	}
	// Repetir /ganar no duplica (idempotencia §5.32).
	cuerpoF4(t, s, "POST", "/leads/"+id+"/ganar", "valentina@demo.rconceptsys",
		`{"paquete_id":"`+paq+`"}`, http.StatusOK)
	lineas2 := listaF4(t, s, "admin", "/lineas?tipo=comision", "lineas")
	n2 := 0
	for _, item := range lineas2 {
		if item.(map[string]any)["comision_cliente_id"] == clienteID {
			n2++
		}
	}
	if n2 != 1 {
		t.Errorf("repetir ganar duplicó comisión: %d", n2)
	}
}

func TestGanarLeadReactivar(t *testing.T) {
	s := servidorPrueba()
	paq := paqueteDigitalInicial(t, s)
	// Cliente archivado con el mismo teléfono del futuro lead.
	w := llamar(s, "POST", "/clientes", "admin",
		`{"nombre":"Vuelve Pronto","contacto_telefono":"312 444 7788","paquete_id":"`+paq+`"}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("crear cliente = %d (%s)", w.Code, w.Body.String())
	}
	var creado map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &creado); err != nil {
		t.Fatalf("cliente no JSON: %v", err)
	}
	cid := creado["id"].(string)
	if w := llamar(s, "POST", "/clientes/"+cid+"/archivar", "admin", ""); w.Code != http.StatusOK {
		t.Fatalf("archivar = %d (%s)", w.Code, w.Body.String())
	}
	id := llevarANegociacion(t, s, "Vuelve Pronto")
	// Cambiar el teléfono del lead al del cliente archivado (mismo negocio
	// ya avisa por nombre; aquí se fuerza el match por teléfono).
	cuerpoF4(t, s, "PATCH", "/leads/"+id, "valentina@demo.rconceptsys",
		`{"telefono":"312 444 7788"}`, http.StatusOK)
	w = llamar(s, "POST", "/leads/"+id+"/ganar", "valentina@demo.rconceptsys", `{"paquete_id":"`+paq+`"}`)
	if w.Code != http.StatusConflict {
		t.Fatalf("ganar con previo = %d (%s), quería 409", w.Code, w.Body.String())
	}
	var m map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &m); err != nil {
		t.Fatalf("409 no JSON: %v", err)
	}
	react, ok := m["reactivar"].(map[string]any)
	if !ok || react["id"] != cid {
		t.Fatalf("sin oferta de reactivar: %v", m)
	}
	// Reactivar en vez de crear otro: el lead queda ganado con ese cliente.
	m2 := cuerpoF4(t, s, "POST", "/leads/"+id+"/ganar", "valentina@demo.rconceptsys",
		`{"paquete_id":"`+paq+`","reactivar_id":"`+cid+`"}`, http.StatusOK)
	if m2["cliente_id"] != cid || m2["estado"] != "ganado" {
		t.Errorf("reactivar = %v", m2)
	}
}

func TestDesactivarVendedorLiberaLeads(t *testing.T) {
	s := servidorPrueba()
	// Los 2 leads semilla de Valentina están abiertos.
	if w := llamar(s, "POST", "/usuarios/"+store.SemillaValentinaID+"/desactivar", "dueno", `{"motivo":"se fue"}`); w.Code != http.StatusOK {
		t.Fatalf("desactivar Valentina = %d (%s)", w.Code, w.Body.String())
	}
	leads := listaF4(t, s, "admin", "/leads", "leads")
	sinAsignar := 0
	for _, item := range leads {
		l := item.(map[string]any)
		if l["vendedor_id"] == "" {
			sinAsignar++
		}
	}
	if sinAsignar < 2 {
		t.Errorf("leads sin asignar = %d, quería ≥2 (§5.26)", sinAsignar)
	}
	// Los ganados/perdidos no se tocan: aquí todos eran abiertos.
}

func TestVisitaIdempotenteYFotos(t *testing.T) {
	s := servidorPrueba()
	m := cuerpoF4(t, s, "POST", "/leads", "valentina@demo.rconceptsys",
		`{"negocio":"Visita QA","origen":"visita"}`, http.StatusCreated)
	id := m["id"].(string)
	cid := "11111111-2222-4333-8444-555555555555"
	v1 := cuerpoF4(t, s, "POST", "/visitas", "valentina@demo.rconceptsys",
		`{"lead_id":"`+id+`","resultado":"interesado","client_id":"`+cid+`","notas":"fui hoy"}`, http.StatusCreated)
	// Repetir con el mismo client_id (reintento offline) = 200 con la MISMA
	// visita, sin duplicar.
	v2 := cuerpoF4(t, s, "POST", "/visitas", "valentina@demo.rconceptsys",
		`{"lead_id":"`+id+`","resultado":"interesado","client_id":"`+cid+`","notas":"fui hoy"}`, http.StatusOK)
	if v1["id"] != v2["id"] {
		t.Errorf("client_id repetido creó otra visita: %v vs %v", v1["id"], v2["id"])
	}
	vs := listaF4(t, s, "admin", "/visitas", "visitas")
	n := 0
	for _, item := range vs {
		if item.(map[string]any)["client_id"] == cid {
			n++
		}
	}
	if n != 1 {
		t.Errorf("visitas con client_id = %d, quería 1", n)
	}
	// Foto pequeña OK; foto gigante → 413.
	vid := v1["id"].(string)
	cuerpoF4(t, s, "POST", "/visitas/"+vid+"/fotos", "valentina@demo.rconceptsys",
		`{"datos":"aGk=","nombre":"foto.jpg"}`, http.StatusCreated)
	gigante := strings.Repeat("A", 700*1024)
	if w := llamar(s, "POST", "/visitas/"+vid+"/fotos", "valentina@demo.rconceptsys",
		`{"datos":"`+gigante+`","nombre":"g.jpg"}`); w.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("foto gigante = %d, quería 413", w.Code)
	}
	// Visita creando el lead ahí mismo (sin lead_id).
	v3 := cuerpoF4(t, s, "POST", "/visitas", "valentina@demo.rconceptsys",
		`{"negocio":"Negocio Calle","resultado":"volver","municipio":"Medellín"}`, http.StatusCreated)
	if v3["lead_id"] == "" || v3["lead_id"] == id {
		t.Errorf("la visita debería crear su propio lead: %v", v3)
	}
}

func TestVentasMetricasYModulos(t *testing.T) {
	s := servidorPrueba()
	m := cuerpoF4(t, s, "GET", "/ventas/metricas", "admin", "", http.StatusOK)
	if _, ok := m["por_etapa"]; !ok {
		t.Errorf("sin por_etapa: %v", m)
	}
	if _, ok := m["tasa_conversion_mes"]; !ok {
		t.Errorf("sin tasa_conversion_mes: %v", m)
	}
	if w := llamar(s, "GET", "/ventas/metricas", "equipo", ""); w.Code != http.StatusForbidden {
		t.Errorf("equipo sin ventas métricas = %d, quería 403", w.Code)
	}
	// /me: Valentina ve ventas; Breiner no; admin sí.
	w := llamar(s, "GET", "/me", "valentina@demo.rcontacto", "")
	_ = w
	w = llamar(s, "GET", "/me", "valentina@demo.rconceptsys", "")
	var me map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &me); err != nil {
		t.Fatalf("me no JSON: %v", err)
	}
	for _, item := range me["modulos"].([]any) {
		mm := item.(map[string]any)
		if mm["id"] == "ventas" && mm["habilitado"] != true {
			t.Error("Valentina debería ver ventas habilitado")
		}
	}
	w = llamar(s, "GET", "/me", "equipo", "")
	if err := json.Unmarshal(w.Body.Bytes(), &me); err != nil {
		t.Fatalf("me equipo no JSON: %v", err)
	}
	for _, item := range me["modulos"].([]any) {
		mm := item.(map[string]any)
		if mm["id"] == "ventas" && mm["habilitado"] == true {
			t.Error("Breiner (sin ventas) no debería ver ventas habilitado")
		}
	}
}
