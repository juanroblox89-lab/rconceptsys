// Herramientas del asistente en Go (BRIEF F5 §1): llaman a los mismos
// servicios/permisos que la API (permisos.Puede con el usuario que
// pregunta). Nunca ven datos que ese usuario no podría ver en pantalla.
//
// Solo lectura + creación de borradores; nunca aprueba, borra, paga ni
// cambia estados. Cada herramienta devuelve texto ya recortado para el
// modelo (nunca structs crudos con ids ajenos de más).
package asistente

import (
	"fmt"
	"sort"
	"strings"

	"rconceptsys/backend/internal/biblioteca"
	"rconceptsys/backend/internal/cobros"
	"rconceptsys/backend/internal/permisos"
	"rconceptsys/backend/internal/produccion"
	"rconceptsys/backend/internal/ventas"
)

// Datos es lo que las herramientas necesitan del store. El handler lo
// implementa con s.st + s.clientesVisiblesPara + s.mapaUsuarios, para que
// los tests puedan inyectar un falso sin HTTP.
type Datos interface {
	EsAdmin(u permisos.Usuario) bool
	ClientesVisibles(u permisos.Usuario) (map[string]bool, error)
	ListClientes() ([]produccion.Cliente, error)
	GetCliente(id string) (produccion.Cliente, bool, error)
	ListPiezas() ([]produccion.Pieza, error)
	GetPieza(id string) (produccion.Pieza, bool, error)
	ListTareas() ([]produccion.Tarea, error)
	TareasDePieza(piezaID string) ([]produccion.Tarea, error)
	ListLineas() ([]cobros.LineaCobro, error)
	ListLeads() ([]ventas.Lead, error)
	ListFormatos() ([]biblioteca.Formato, error)
	ListHooks() ([]biblioteca.Hook, error)
	NombreUsuario(id string) string
}

// Herramienta es una acción con nombre que el modelo puede pedir.
type Herramienta struct {
	Nombre      string
	Descripcion string
}

// Catalogo es la lista que se le muestra al modelo.
func Catalogo() []Herramienta {
	return []Herramienta{
		{"mis_tareas_hoy", "Qué tiene que hacer hoy el usuario (sus tareas pendientes/en curso/entregadas/devueltas con cliente y pieza)"},
		{"piezas_atrasadas", "Piezas con tareas vencidas de un cliente (nombre del cliente). Solo clientes visibles"},
		{"resumen_mes", "Cuánto lleva el usuario este mes (líneas aprobadas + por confirmar de su periodo)"},
		{"mis_leads", "Leads del vendedor (sus abiertos con próxima acción) o conteo por etapa para admin. Sin oficio ventas → sin acceso"},
		{"ver_pieza", "Guion, formato, estado y estrategia del cliente de una pieza (titulo aproximado). Solo piezas visibles"},
		{"ver_estrategia", "Estrategia guardada de un cliente (nombre aproximado)"},
		{"ver_hooks", "Hooks publicados de la Biblioteca (opcional: palabra de búsqueda)"},
		{"ver_formatos", "Formatos publicados de la Biblioteca (opcional: palabra de búsqueda)"},
		{"guardar_borrador_guion", "Deja el texto como BORRADOR en la pieza (nunca toca el guion aprobado). Requiere id o título de pieza visible"},
		{"proponer_hooks", "Crea hooks como BORRADORES en la Biblioteca (el admin los publica). Títulos separados por línea"},
	}
}

// Ejecutar corre una herramienta con el usuario que pregunta. args son
// strings simples (pieza, cliente, texto, titulos, q). Devuelve texto para
// el modelo. Los errores de permiso se responden como "no tenés acceso",
// sin filtrar existencia (404/403 se unifican en lo ajeno).
func Ejecutar(d Datos, u permisos.Usuario, nombre string, args map[string]string) (string, error) {
	switch nombre {
	case "mis_tareas_hoy":
		return hMisTareas(d, u)
	case "piezas_atrasadas":
		return hPiezasAtrasadas(d, u, strings.TrimSpace(args["cliente"]))
	case "resumen_mes":
		return hResumenMes(d, u)
	case "mis_leads":
		return hMisLeads(d, u)
	case "ver_pieza":
		return hVerPieza(d, u, strings.TrimSpace(args["pieza"]))
	case "ver_estrategia":
		return hVerEstrategia(d, u, strings.TrimSpace(args["cliente"]))
	case "ver_hooks":
		return hVerHooks(d, u, strings.TrimSpace(args["q"]))
	case "ver_formatos":
		return hVerFormatos(d, u, strings.TrimSpace(args["q"]))
	case "guardar_borrador_guion", "proponer_hooks":
		return "", errSoloHandler
	default:
		return "", fmt.Errorf("herramienta desconocida: %s", nombre)
	}
}

// errSoloHandler marca las escrituras que solo corre el handler (necesita
// escribir en el store + actividad; las herramientas aquí son de lectura).
var errSoloHandler = fmt.Errorf("esa acción la ejecuta el servidor")

// --- lectura ---

func hMisTareas(d Datos, u permisos.Usuario) (string, error) {
	tareas, err := d.ListTareas()
	if err != nil {
		return "", err
	}
	piezas, err := d.ListPiezas()
	if err != nil {
		return "", err
	}
	nomPieza := map[string]produccion.Pieza{}
	for _, p := range piezas {
		nomPieza[p.ID] = p
	}
	clientes, err := d.ListClientes()
	if err != nil {
		return "", err
	}
	nomCli := map[string]string{}
	for _, c := range clientes {
		nomCli[c.ID] = c.Nombre
	}
	hoy := produccion.HoyFecha()
	out := []string{}
	for _, t := range tareas {
		if !d.EsAdmin(u) && t.AsignadoID != u.ID {
			continue
		}
		switch t.Estado {
		case produccion.TareaPendiente, produccion.TareaEnCurso, produccion.TareaEntregada, produccion.TareaDevuelta:
		default:
			continue
		}
		p := nomPieza[t.PiezaID]
		venc := ""
		if produccion.EsVencida(t.FechaLimite, t.Estado, hoy) {
			venc = " (vencida)"
		}
		out = append(out, fmt.Sprintf("- %s · %s · %s%s (límite %s)", p.Titulo, nomCli[p.ClienteID], t.Etapa, venc, t.FechaLimite))
	}
	if len(out) == 0 {
		return "No tenés tareas pendientes.", nil
	}
	sort.Strings(out)
	return "Tus tareas pendientes:\n" + strings.Join(out, "\n"), nil
}

func hPiezasAtrasadas(d Datos, u permisos.Usuario, clienteQ string) (string, error) {
	if strings.TrimSpace(clienteQ) == "" {
		return "", fmt.Errorf("decime de qué cliente querés saber")
	}
	clientes, err := d.ListClientes()
	if err != nil {
		return "", err
	}
	var cli *produccion.Cliente
	for _, c := range clientes {
		if strings.Contains(strings.ToLower(c.Nombre), strings.ToLower(clienteQ)) {
			cc := c
			cli = &cc
			break
		}
	}
	if cli == nil {
		return "No encontré ese cliente entre los que podés ver.", nil
	}
	if !d.EsAdmin(u) {
		vis, err := d.ClientesVisibles(u)
		if err != nil {
			return "", err
		}
		if !vis[cli.ID] {
			return "No encontré ese cliente entre los que podés ver.", nil
		}
	}
	piezas, err := d.ListPiezas()
	if err != nil {
		return "", err
	}
	todas, err := d.ListTareas()
	if err != nil {
		return "", err
	}
	hoy := produccion.HoyFecha()
	out := []string{}
	for _, p := range piezas {
		if p.ClienteID != cli.ID {
			continue
		}
		for _, t := range todas {
			if t.PiezaID != p.ID {
				continue
			}
			if produccion.EsVencida(t.FechaLimite, t.Estado, hoy) {
				out = append(out, fmt.Sprintf("- %s · %s (%s, límite %s, %s)", p.Titulo, t.Etapa, d.NombreUsuario(t.AsignadoID), t.FechaLimite, t.Estado))
			}
		}
	}
	if len(out) == 0 {
		return fmt.Sprintf("%s no tiene piezas atrasadas.", cli.Nombre), nil
	}
	sort.Strings(out)
	return fmt.Sprintf("Atrasadas de %s:\n%s", cli.Nombre, strings.Join(out, "\n")), nil
}

func hResumenMes(d Datos, u permisos.Usuario) (string, error) {
	lineas, err := d.ListLineas()
	if err != nil {
		return "", err
	}
	per := cobros.PeriodoActual()
	var ap, pc int64
	for _, l := range lineas {
		if l.UsuarioID != u.ID || l.Periodo != per {
			continue
		}
		switch l.Estado {
		case cobros.LineaAprobada, cobros.LineaEnCorte, cobros.LineaPagada:
			ap += l.MontoCOP
		case cobros.LineaPorConfirmar, cobros.LineaConfirmada, cobros.LineaReclamada:
			pc += l.MontoCOP
		}
	}
	return fmt.Sprintf("Este mes (%s): $%d aprobado, $%d por confirmar.", per, ap, pc), nil
}

// hMisLeads: "¿qué tengo hoy?" para ventas (próximas acciones del
// vendedor) y conteo por etapa. Equipo sin oficio ventas → sin acceso
// (igual que GET /leads: 403); vendedor solo los suyos; admin todo.
func hMisLeads(d Datos, u permisos.Usuario) (string, error) {
	if !permisos.Puede(u, permisos.CRM, permisos.Recurso{OwnerID: u.ID}) && !d.EsAdmin(u) {
		return "No tenés acceso a Ventas (oficio ventas).", nil
	}
	leads, err := d.ListLeads()
	if err != nil {
		return "", err
	}
	hoy := produccion.HoyFecha()
	mios := []ventas.Lead{}
	for _, l := range leads {
		if !d.EsAdmin(u) && l.VendedorID != u.ID {
			continue
		}
		if ventas.LeadAbierto(l.Estado) {
			mios = append(mios, l)
		}
	}
	if len(mios) == 0 {
		return "No tenés leads abiertos.", nil
	}
	porEtapa := map[string]int{}
	out := []string{}
	for _, l := range mios {
		porEtapa[l.Estado]++
		marca := ""
		if l.AccionFecha != "" && l.AccionFecha <= hoy {
			marca = " (acción: " + l.AccionQue + " " + l.AccionFecha + ")"
		}
		out = append(out, fmt.Sprintf("- %s · %s%s", l.Negocio, l.Estado, marca))
	}
	sort.Strings(out)
	res := []string{}
	for _, e := range []string{ventas.LeadProspecto, ventas.LeadEnContacto, ventas.LeadPropuesta, ventas.LeadNegociacion} {
		if porEtapa[e] > 0 {
			res = append(res, fmt.Sprintf("%d en %s", porEtapa[e], e))
		}
	}
	return fmt.Sprintf("Tus leads abiertos (%s):\n%s", strings.Join(res, ", "), strings.Join(out, "\n")), nil
}

func piezaVisible(d Datos, u permisos.Usuario, p produccion.Pieza) bool {
	if d.EsAdmin(u) {
		return true
	}
	vis, err := d.ClientesVisibles(u)
	if err != nil {
		return false
	}
	return vis[p.ClienteID]
}

func buscarPieza(d Datos, u permisos.Usuario, q string) (produccion.Pieza, bool, error) {
	piezas, err := d.ListPiezas()
	if err != nil {
		return produccion.Pieza{}, false, err
	}
	qq := strings.ToLower(q)
	for _, p := range piezas {
		if p.ID == q {
			if !piezaVisible(d, u, p) {
				return produccion.Pieza{}, false, nil
			}
			return p, true, nil
		}
	}
	for _, p := range piezas {
		if qq != "" && strings.Contains(strings.ToLower(p.Titulo), qq) && piezaVisible(d, u, p) {
			return p, true, nil
		}
	}
	return produccion.Pieza{}, false, nil
}

func buscarCliente(d Datos, u permisos.Usuario, q string) (produccion.Cliente, bool, error) {
	clientes, err := d.ListClientes()
	if err != nil {
		return produccion.Cliente{}, false, err
	}
	qq := strings.ToLower(strings.TrimSpace(q))
	for _, c := range clientes {
		if c.ID == q {
			if !d.EsAdmin(u) {
				vis, err := d.ClientesVisibles(u)
				if err != nil {
					return produccion.Cliente{}, false, err
				}
				if !vis[c.ID] {
					return produccion.Cliente{}, false, nil
				}
			}
			return c, true, nil
		}
	}
	for _, c := range clientes {
		if qq != "" && strings.Contains(strings.ToLower(c.Nombre), qq) {
			if !d.EsAdmin(u) {
				vis, err := d.ClientesVisibles(u)
				if err != nil {
					return produccion.Cliente{}, false, err
				}
				if !vis[c.ID] {
					continue
				}
			}
			return c, true, nil
		}
	}
	return produccion.Cliente{}, false, nil
}

func hVerPieza(d Datos, u permisos.Usuario, q string) (string, error) {
	if strings.TrimSpace(q) == "" {
		return "", fmt.Errorf("decime de qué pieza querés saber")
	}
	p, ok, err := buscarPieza(d, u, q)
	if err != nil {
		return "", err
	}
	if !ok {
		return "No encontré esa pieza entre las que podés ver.", nil
	}
	cli, _, _ := d.GetCliente(p.ClienteID)
	var sb strings.Builder
	fmt.Fprintf(&sb, "Pieza: %s\nCliente: %s\nEstado: %s\nFormato: %s\n", p.Titulo, cli.Nombre, p.Estado, p.Formato)
	if p.Guion != "" {
		fmt.Fprintf(&sb, "Guion aprobado: %s\n", p.Guion)
	}
	if cli.Estrategia != "" {
		fmt.Fprintf(&sb, "Estrategia del cliente: %s", cli.Estrategia)
	}
	return sb.String(), nil
}

func hVerEstrategia(d Datos, u permisos.Usuario, q string) (string, error) {
	if strings.TrimSpace(q) == "" {
		return "", fmt.Errorf("decime de qué cliente querés saber")
	}
	c, ok, err := buscarCliente(d, u, q)
	if err != nil {
		return "", err
	}
	if !ok {
		return "No encontré ese cliente entre los que podés ver.", nil
	}
	if strings.TrimSpace(c.Estrategia) == "" {
		return fmt.Sprintf("%s todavía no tiene estrategia cargada.", c.Nombre), nil
	}
	return fmt.Sprintf("Estrategia de %s: %s", c.Nombre, c.Estrategia), nil
}

func hVerHooks(d Datos, u permisos.Usuario, q string) (string, error) {
	if !permisos.Puede(u, permisos.BibliotecaLeer, permisos.Recurso{}) {
		return "No tenés acceso a la Biblioteca.", nil
	}
	hooks, err := d.ListHooks()
	if err != nil {
		return "", err
	}
	qq := strings.ToLower(strings.TrimSpace(q))
	out := []string{}
	for _, h := range hooks {
		if h.Estado != biblioteca.EstadoPublicado {
			continue
		}
		if qq != "" && !strings.Contains(strings.ToLower(h.Titulo+" "+h.Categoria+" "+h.Psicologia+" "+strings.Join(h.Etiquetas, " ")), qq) {
			continue
		}
		out = append(out, "- "+h.Titulo)
		if len(out) >= 10 {
			break
		}
	}
	if len(out) == 0 {
		return "No hay hooks publicados con ese criterio.", nil
	}
	sort.Strings(out)
	return "Hooks publicados:\n" + strings.Join(out, "\n"), nil
}

func hVerFormatos(d Datos, u permisos.Usuario, q string) (string, error) {
	if !permisos.Puede(u, permisos.BibliotecaLeer, permisos.Recurso{}) {
		return "No tenés acceso a la Biblioteca.", nil
	}
	fs, err := d.ListFormatos()
	if err != nil {
		return "", err
	}
	qq := strings.ToLower(strings.TrimSpace(q))
	out := []string{}
	for _, f := range fs {
		if f.Estado != biblioteca.EstadoPublicado {
			continue
		}
		if qq != "" && !strings.Contains(strings.ToLower(f.Nombre+" "+f.Objetivo+" "+strings.Join(f.Etiquetas, " ")), qq) {
			continue
		}
		out = append(out, fmt.Sprintf("- %s: %s", f.Nombre, f.Objetivo))
		if len(out) >= 10 {
			break
		}
	}
	if len(out) == 0 {
		return "No hay formatos publicados con ese criterio.", nil
	}
	sort.Strings(out)
	return "Formatos publicados:\n" + strings.Join(out, "\n"), nil
}
