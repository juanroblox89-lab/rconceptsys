package store

import (
	_ "time/tzdata"
	"sort"
	"time"
)

var LocBogota *time.Location

func init() {
	var err error
	LocBogota, err = time.LoadLocation("America/Bogota")
	if err != nil {
		LocBogota = time.FixedZone("America/Bogota", -5*3600)
	}
}

func InicioDiaBogota(t time.Time) time.Time {
	tBog := t.In(LocBogota)
	return time.Date(tBog.Year(), tBog.Month(), tBog.Day(), 0, 0, 0, 0, LocBogota)
}

func FinDiaBogota(t time.Time) time.Time {
	tBog := t.In(LocBogota)
	return time.Date(tBog.Year(), tBog.Month(), tBog.Day(), 23, 59, 59, 999999999, LocBogota)
}

func InicioSemanaBogota(t time.Time) time.Time {
	tBog := t.In(LocBogota)
	wd := int(tBog.Weekday())
	if wd == 0 {
		wd = 7 // Domingo es 7 en semana que inicia lunes
	}
	lunes := tBog.AddDate(0, 0, -(wd - 1))
	return time.Date(lunes.Year(), lunes.Month(), lunes.Day(), 0, 0, 0, 0, LocBogota)
}

func InicioMesBogota(t time.Time) time.Time {
	tBog := t.In(LocBogota)
	return time.Date(tBog.Year(), tBog.Month(), 1, 0, 0, 0, 0, LocBogota)
}

// CalcularEstadisticasYo genera las estadísticas personales de un miembro
func CalcularEstadisticasYo(
	perfilID string,
	todasTareas []*Tarea,
	tiposMap map[int]*TipoTrabajo,
	filtro FiltroEstadisticasYo,
	ahora time.Time,
) *EstadisticasYoResponse {
	ahoraBog := ahora.In(LocBogota)
	inicioEsteMes := time.Date(ahoraBog.Year(), ahoraBog.Month(), 1, 0, 0, 0, 0, LocBogota)
	finEsteMes := ahoraBog

	resp := &EstadisticasYoResponse{
		PorTipo: make([]*EstadisticaTipoYo, 0),
		Rango:   &RangoEstadisticaYo{},
	}

	if filtro.Desde != nil {
		dStr := filtro.Desde.In(LocBogota).Format("2006-01-02")
		resp.Rango.Desde = &dStr
	}
	if filtro.Hasta != nil {
		hStr := filtro.Hasta.In(LocBogota).Format("2006-01-02")
		resp.Rango.Hasta = &hStr
	}

	porTipoMap := make(map[int]*EstadisticaTipoYo)

	for _, t := range todasTareas {
		if t.AsignadoA != perfilID || t.Estado != EstadoTareaAceptada || t.ResueltaEn == nil {
			continue
		}

		tRes := t.ResueltaEn.In(LocBogota)

		// Determinar minutos y valor
		minutos := 0
		tipo, tipoOk := tiposMap[t.TipoID]
		if !tipoOk && t.Tipo != nil {
			tipo = t.Tipo
		}
		if tipo != nil && tipo.Unidad == "minuto" {
			if t.CantidadAceptada != nil {
				minutos = *t.CantidadAceptada
			} else if t.Cantidad != nil {
				minutos = *t.Cantidad
			}
		}

		valor := int64(0)
		if t.PrecioCongelado != nil {
			valor = *t.PrecioCongelado
		}

		// Acumular Total (todo el tiempo)
		resp.Total.Trabajos++
		resp.Total.Minutos += minutos
		resp.Total.Valor += valor

		// Acumular Este Mes
		if !tRes.Before(inicioEsteMes) && !tRes.After(finEsteMes) {
			resp.EsteMes.Trabajos++
			resp.EsteMes.Minutos += minutos
			resp.EsteMes.Valor += valor
		}

		// Filtrar según el rango solicitado
		if filtro.Desde != nil && tRes.Before(*filtro.Desde) {
			continue
		}
		if filtro.Hasta != nil && tRes.After(*filtro.Hasta) {
			continue
		}

		// Acumular Rango
		resp.Trabajos++
		resp.Minutos += minutos
		resp.Valor += valor

		// Acumular por tipo en el rango
		item, ok := porTipoMap[t.TipoID]
		if !ok {
			nombre := "Trabajo"
			unidad := "trabajo"
			if tipo != nil {
				nombre = tipo.Nombre
				unidad = tipo.Unidad
			}
			item = &EstadisticaTipoYo{
				TipoID: t.TipoID,
				Nombre: nombre,
				Unidad: unidad,
			}
			porTipoMap[t.TipoID] = item
		}
		item.Trabajos++
		item.Minutos += minutos
		item.Valor += valor
	}

	// Ordenar por_tipo: de mayor a menor por trabajos (empate por valor)
	for _, item := range porTipoMap {
		resp.PorTipo = append(resp.PorTipo, item)
	}
	sort.Slice(resp.PorTipo, func(i, j int) bool {
		if resp.PorTipo[i].Trabajos != resp.PorTipo[j].Trabajos {
			return resp.PorTipo[i].Trabajos > resp.PorTipo[j].Trabajos
		}
		return resp.PorTipo[i].Valor > resp.PorTipo[j].Valor
	})

	return resp
}

// CalcularEstadisticasAdmin genera las estadísticas globales para administradores
func CalcularEstadisticasAdmin(
	todasTareas []*Tarea,
	perfilesMap map[string]*Perfil,
	clientesMap map[int]*Cliente,
	tiposMap map[int]*TipoTrabajo,
	filtro FiltroEstadisticasAdmin,
) *EstadisticasAdminResponse {
	desdeBog := filtro.Desde.In(LocBogota)
	hastaBog := filtro.Hasta.In(LocBogota)

	resp := &EstadisticasAdminResponse{
		Rango: RangoEstadisticasAdmin{
			Desde:   desdeBog.Format("2006-01-02"),
			Hasta:   hastaBog.Format("2006-01-02"),
			Agrupar: filtro.Agrupar,
		},
		Totales:    TotalesAdmin{},
		Serie:      make([]*PuntoSerieAdmin, 0),
		PorPersona: make([]*ItemPersonaEstadistica, 0),
		PorCliente: make([]*ItemClienteEstadistica, 0),
		PorTipo:    make([]*ItemTipoEstadistica, 0),
	}

	personasSet := make(map[string]bool)
	clientesSet := make(map[int]bool)

	type serieVal struct {
		trabajos int
		minutos  int
		valor    int64
	}
	serieMap := make(map[string]*serieVal)

	porPersonaMap := make(map[string]*ItemPersonaEstadistica)
	porClienteMap := make(map[int]*ItemClienteEstadistica)
	var clienteSinCliente *ItemClienteEstadistica
	porTipoMap := make(map[int]*ItemTipoEstadistica)

	ahoraBog := time.Now().In(LocBogota)
	inicioEsteMes := time.Date(ahoraBog.Year(), ahoraBog.Month(), 1, 0, 0, 0, 0, LocBogota)
	finEsteMes := ahoraBog

	var esteMesPersona TotalesYo
	var totalPersona TotalesYo

	for _, t := range todasTareas {
		if t.Estado != EstadoTareaAceptada || t.ResueltaEn == nil {
			continue
		}

		tRes := t.ResueltaEn.In(LocBogota)

		// Tipo de trabajo
		tipo, tipoOk := tiposMap[t.TipoID]
		if !tipoOk && t.Tipo != nil {
			tipo = t.Tipo
		}

		// Minutos
		minutos := 0
		if tipo != nil && tipo.Unidad == "minuto" {
			if t.CantidadAceptada != nil {
				minutos = *t.CantidadAceptada
			} else if t.Cantidad != nil {
				minutos = *t.Cantidad
			}
		}

		// Valor
		valor := int64(0)
		if t.PrecioCongelado != nil {
			valor = *t.PrecioCongelado
		}

		// Si se filtra por persona, acumulamos este_mes y total de esa persona
		if filtro.PersonaID != nil && t.AsignadoA == *filtro.PersonaID {
			totalPersona.Trabajos++
			totalPersona.Minutos += minutos
			totalPersona.Valor += valor

			if !tRes.Before(inicioEsteMes) && !tRes.After(finEsteMes) {
				esteMesPersona.Trabajos++
				esteMesPersona.Minutos += minutos
				esteMesPersona.Valor += valor
			}
		}

		// Filtro de rango de fechas
		if tRes.Before(desdeBog) || tRes.After(hastaBog) {
			continue
		}

		// Filtros combinables
		if filtro.PersonaID != nil && t.AsignadoA != *filtro.PersonaID {
			continue
		}
		if filtro.SinCliente {
			if t.ClienteID != nil {
				continue
			}
		} else if filtro.ClienteID != nil {
			if t.ClienteID == nil || *t.ClienteID != *filtro.ClienteID {
				continue
			}
		}
		if filtro.TipoID != nil && t.TipoID != *filtro.TipoID {
			continue
		}

		// Totales
		resp.Totales.Trabajos++
		resp.Totales.Minutos += minutos
		resp.Totales.Valor += valor

		personasSet[t.AsignadoA] = true
		if t.ClienteID != nil {
			clientesSet[*t.ClienteID] = true
		}

		// Serie
		var bucketKey string
		switch filtro.Agrupar {
		case "semana":
			bucketKey = InicioSemanaBogota(tRes).Format("2006-01-02")
		case "mes":
			bucketKey = InicioMesBogota(tRes).Format("2006-01-02")
		default: // "dia"
			bucketKey = tRes.Format("2006-01-02")
		}

		sv, svOk := serieMap[bucketKey]
		if !svOk {
			sv = &serieVal{}
			serieMap[bucketKey] = sv
		}
		sv.trabajos++
		sv.minutos += minutos
		sv.valor += valor

		// Por persona (los admins no tienen tareas)
		pItem, pOk := porPersonaMap[t.AsignadoA]
		if !pOk {
			nombre := "Miembro"
			var foto *string
			if p, ok := perfilesMap[t.AsignadoA]; ok {
				nombre = p.Nombre
				foto = p.FotoPath
			} else if t.Asignado != nil {
				nombre = t.Asignado.Nombre
				foto = t.Asignado.FotoPath
			}
			pItem = &ItemPersonaEstadistica{
				PerfilID: t.AsignadoA,
				Nombre:   nombre,
				Foto:     foto,
			}
			porPersonaMap[t.AsignadoA] = pItem
		}
		pItem.Trabajos++
		pItem.Minutos += minutos
		pItem.Valor += valor

		// Por cliente (tareas sin cliente se agrupan como "Sin cliente")
		if t.ClienteID == nil {
			if clienteSinCliente == nil {
				clienteSinCliente = &ItemClienteEstadistica{
					ClienteID: nil,
					Nombre:    "Sin cliente",
				}
			}
			clienteSinCliente.Trabajos++
			clienteSinCliente.Minutos += minutos
			clienteSinCliente.Valor += valor
		} else {
			cID := *t.ClienteID
			cItem, cOk := porClienteMap[cID]
			if !cOk {
				nombre := "Cliente"
				if c, ok := clientesMap[cID]; ok {
					nombre = c.Nombre
				} else if t.Cliente != nil {
					nombre = t.Cliente.Nombre
				}
				cItem = &ItemClienteEstadistica{
					ClienteID: &cID,
					Nombre:    nombre,
				}
				porClienteMap[cID] = cItem
			}
			cItem.Trabajos++
			cItem.Minutos += minutos
			cItem.Valor += valor
		}

		// Por tipo
		tItem, tOk := porTipoMap[t.TipoID]
		if !tOk {
			nombre := "Trabajo"
			unidad := "trabajo"
			if tipo != nil {
				nombre = tipo.Nombre
				unidad = tipo.Unidad
			}
			tItem = &ItemTipoEstadistica{
				TipoID: t.TipoID,
				Nombre: nombre,
				Unidad: unidad,
			}
			porTipoMap[t.TipoID] = tItem
		}
		tItem.Trabajos++
		tItem.Minutos += minutos
		tItem.Valor += valor
	}

	resp.Totales.Personas = len(personasSet)
	resp.Totales.Clientes = len(clientesSet)

	// Construir serie continua con huecos en 0
	switch filtro.Agrupar {
	case "semana":
		curr := InicioSemanaBogota(desdeBog)
		end := InicioSemanaBogota(hastaBog)
		for !curr.After(end) {
			k := curr.Format("2006-01-02")
			p := &PuntoSerieAdmin{Fecha: k}
			if sv, ok := serieMap[k]; ok {
				p.Trabajos = sv.trabajos
				p.Minutos = sv.minutos
				p.Valor = sv.valor
			}
			resp.Serie = append(resp.Serie, p)
			curr = curr.AddDate(0, 0, 7)
		}
	case "mes":
		curr := InicioMesBogota(desdeBog)
		end := InicioMesBogota(hastaBog)
		for !curr.After(end) {
			k := curr.Format("2006-01-02")
			p := &PuntoSerieAdmin{Fecha: k}
			if sv, ok := serieMap[k]; ok {
				p.Trabajos = sv.trabajos
				p.Minutos = sv.minutos
				p.Valor = sv.valor
			}
			resp.Serie = append(resp.Serie, p)
			curr = curr.AddDate(0, 1, 0)
		}
	default: // "dia"
		curr := InicioDiaBogota(desdeBog)
		end := InicioDiaBogota(hastaBog)
		for !curr.After(end) {
			k := curr.Format("2006-01-02")
			p := &PuntoSerieAdmin{Fecha: k}
			if sv, ok := serieMap[k]; ok {
				p.Trabajos = sv.trabajos
				p.Minutos = sv.minutos
				p.Valor = sv.valor
			}
			resp.Serie = append(resp.Serie, p)
			curr = curr.AddDate(0, 0, 1)
		}
	}

	// Ordenar y limitar PorPersona (máx 20, hay_mas)
	for _, p := range porPersonaMap {
		resp.PorPersona = append(resp.PorPersona, p)
	}
	sort.Slice(resp.PorPersona, func(i, j int) bool {
		if resp.PorPersona[i].Trabajos != resp.PorPersona[j].Trabajos {
			return resp.PorPersona[i].Trabajos > resp.PorPersona[j].Trabajos
		}
		return resp.PorPersona[i].Valor > resp.PorPersona[j].Valor
	})
	if len(resp.PorPersona) > 20 {
		resp.HayMas.PorPersona = true
		resp.PorPersona = resp.PorPersona[:20]
	}

	// Ordenar y limitar PorCliente (máx 20, hay_mas; incluye Sin cliente si existe)
	if clienteSinCliente != nil {
		resp.PorCliente = append(resp.PorCliente, clienteSinCliente)
	}
	for _, c := range porClienteMap {
		resp.PorCliente = append(resp.PorCliente, c)
	}
	sort.Slice(resp.PorCliente, func(i, j int) bool {
		if resp.PorCliente[i].Trabajos != resp.PorCliente[j].Trabajos {
			return resp.PorCliente[i].Trabajos > resp.PorCliente[j].Trabajos
		}
		return resp.PorCliente[i].Valor > resp.PorCliente[j].Valor
	})
	if len(resp.PorCliente) > 20 {
		resp.HayMas.PorCliente = true
		resp.PorCliente = resp.PorCliente[:20]
	}

	// Ordenar y limitar PorTipo (máx 20, hay_mas)
	for _, tp := range porTipoMap {
		resp.PorTipo = append(resp.PorTipo, tp)
	}
	sort.Slice(resp.PorTipo, func(i, j int) bool {
		if resp.PorTipo[i].Trabajos != resp.PorTipo[j].Trabajos {
			return resp.PorTipo[i].Trabajos > resp.PorTipo[j].Trabajos
		}
		return resp.PorTipo[i].Valor > resp.PorTipo[j].Valor
	})
	if len(resp.PorTipo) > 20 {
		resp.HayMas.PorTipo = true
		resp.PorTipo = resp.PorTipo[:20]
	}

	if filtro.PersonaID != nil {
		resp.EsteMes = &esteMesPersona
		resp.Total = &totalPersona
	}

	return resp
}
