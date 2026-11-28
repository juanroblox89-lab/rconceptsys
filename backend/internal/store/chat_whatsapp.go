package store

import (
	"context"
	"errors"
	"strings"
	"time"
)

// NuevaCitaChat resume únicamente un mensaje que sigue visible en el chat público.
func NuevaCitaChat(autor, cuerpo string, esRIA bool) *CitaChat {
	if esRIA {
		autor = "RIA"
	} else if autor == "" {
		autor = "Miembro"
	}
	extracto := strings.Join(strings.Fields(cuerpo), " ")
	if extracto == "" {
		extracto = "Mensaje con adjunto"
	}
	if r := []rune(extracto); len(r) > 120 {
		extracto = string(r[:119]) + "…"
	}
	return &CitaChat{Autor: autor, Extracto: extracto}
}

func (m *MemoryStore) citaChatLocked(id *int64) *CitaChat {
	if id == nil {
		return nil
	}
	for _, original := range m.mensajes {
		if original.ID == *id && original.BorradoEn == nil {
			autor := ""
			if p := m.perfiles[original.AutorID]; p != nil {
				autor = p.Nombre
			}
			return NuevaCitaChat(autor, original.Cuerpo, original.EsRIA)
		}
	}
	return nil
}

func (m *MemoryStore) EnviarChat(_ context.Context, autorID, cuerpo string, respuesta *int64, adjuntos []int64) (*ChatMensaje, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p := m.perfiles[autorID]
	if p == nil || p.Estado != EstadoAprobado {
		return nil, ErrForbidden
	}
	cuerpo = strings.TrimSpace(cuerpo)
	if len([]rune(cuerpo)) > 2000 || len(adjuntos) > 10 || (cuerpo == "" && len(adjuntos) == 0) {
		return nil, ErrValidation
	}
	if respuesta != nil {
		if m.citaChatLocked(respuesta) == nil {
			return nil, ErrValidation
		}
		id := *respuesta
		respuesta = &id
	}
	vistos := make(map[int64]bool, len(adjuntos))
	for _, id := range adjuntos {
		a := m.adjuntos[id]
		if vistos[id] || a == nil || a.AutorID != autorID || a.MensajeID != nil || a.PurgadoEn != nil {
			return nil, ErrValidation
		}
		vistos[id] = true
	}
	msg := &ChatMensaje{ID: m.nextMsgID, AutorID: autorID, Cuerpo: cuerpo, CreadoEn: time.Now(), RespuestaAID: respuesta}
	m.nextMsgID++
	m.mensajes = append(m.mensajes, msg)
	for _, id := range adjuntos {
		m.adjuntos[id].MensajeID = &msg.ID
	}
	return m.clonarMensajeChatLocked(msg, false), nil
}

func (a *ChatAdjunto) EsMedioRetenible() bool {
	return a.Descargable() && a.URLExterna == nil && (a.Tipo == AdjuntoAudio || a.Tipo == AdjuntoImagen || a.Tipo == AdjuntoVideo)
}

func (m *MemoryStore) ConservarChat(_ context.Context, id int64, actor string, conservar bool) (*ChatAdjunto, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	a := m.adjuntos[id]
	p := m.perfiles[actor]
	if !a.EsMedioRetenible() || a.MensajeID == nil || m.citaChatLocked(a.MensajeID) == nil {
		return nil, ErrConflict
	}
	if p == nil || p.Estado != EstadoAprobado || (!conservar && !p.EsAdmin && a.AutorID != actor) {
		return nil, ErrForbidden
	}
	a.Conservar = conservar
	res := *a
	return &res, nil
}

func (m *MemoryStore) ConservarAsignacion(_ context.Context, tarea int64, id, actor string, conservar bool) (*AdjuntoAsignacion, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	t, a, p := m.tareas[tarea], m.adjuntosAsignacion[id], m.perfiles[actor]
	if t == nil || a == nil || a.TareaID != tarea || a.EstadoArchivo != "listo" || a.PurgadoEn != nil {
		return nil, ErrConflict
	}
	if p == nil || p.Estado != EstadoAprobado || (!p.EsAdmin && (!conservar || t.AsignadoA != actor)) {
		return nil, ErrForbidden
	}
	a.Conservar = conservar
	return copiarAdjunto(a), nil
}

// PurgarRetencion en memoria simula Storage bajo el mismo lock que protege los metadatos.
func (m *MemoryStore) PurgarRetencion(ctx context.Context) (ConteoPurga, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return ConteoPurga{}, err
	}
	ahora := time.Now().UTC()
	antes := ahora.Add(-15 * 24 * time.Hour)
	var c ConteoPurga
	for id, a := range m.adjuntos {
		if c.Chat == LotePurga {
			break
		}
		if !a.Conservar && a.EsMedioRetenible() && a.CreadoEn.Before(antes) {
			delete(m.archivosAdjuntos, id)
			marca := ahora
			a.PurgadoEn = &marca
			c.Chat++
		}
	}
	for _, a := range m.adjuntosAsignacion {
		if c.Asignaciones == LotePurga {
			break
		}
		t := m.tareas[a.TareaID]
		if t == nil || (t.Estado != EstadoTareaAceptada && t.Estado != EstadoTareaCancelada) || t.ResueltaEn == nil || !t.ResueltaEn.Before(antes) {
			continue
		}
		if a.Conservar || a.PurgadoEn != nil || a.EstadoArchivo != "listo" || a.Ruta == "" || !a.CreadoEn.Before(antes) || a.EstadoResumen == "pendiente" || a.EstadoResumen == "procesando" {
			continue
		}
		delete(m.objetosAsignacion, a.Ruta)
		marca := ahora
		a.PurgadoEn = &marca
		c.Asignaciones++
	}
	return c, nil
}

var ErrPurgaEnCurso = errors.New("limpieza de archivos en curso")

const LotePurga = 10

type ConteoPurga struct {
	Chat         int
	Asignaciones int
}

type StoreRetencion interface {
	ConservarChat(context.Context, int64, string, bool) (*ChatAdjunto, error)
	ConservarAsignacion(context.Context, int64, string, string, bool) (*AdjuntoAsignacion, error)
	PurgarRetencion(context.Context) (ConteoPurga, error)
}
