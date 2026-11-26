package store

import (
	"context"
	"crypto/sha256"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	AutorChatRIA            = "ria"
	LimiteHistorialRIAGrupo = 50
	LimiteTextoRIAGrupo     = 600
)

const (
	RIAGrupoIniciada  = "iniciada"
	RIAGrupoCompleta  = "completa"
	RIAGrupoEnCurso   = "en_curso"
	RIAGrupoCupo      = "cupo"
	RIAGrupoDenegada  = "denegada"
	RIAGrupoRetirada  = "retirada"
	RIAGrupoConflicto = "conflicto"
	RIAGrupoInvalida  = "invalida"
)

type InicioRIAGrupo struct {
	Estado              string
	Consulta, Respuesta *ChatMensaje
}

// Proyección deliberadamente sin adjuntos, perfiles ni datos del chat privado.
type TextoRIAGrupo struct {
	EsRIA  bool   `json:"es_ria"`
	Cuerpo string `json:"cuerpo"`
}

type turnoRIAGrupo struct {
	huella              [sha256.Size]byte
	consulta, respuesta *ChatMensaje
	turno               string
	hasta               time.Time
}

func (m *MemoryStore) IniciarRIAGrupo(_ context.Context, perfil, solicitud, turno, comando, dia string, tope int) (InicioRIAGrupo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	ret := func(estado string) (InicioRIAGrupo, error) { return InicioRIAGrupo{Estado: estado}, nil }
	if solicitud == "" || turno == "" || dia == "" || !strings.HasPrefix(comando, "/ria ") || strings.TrimSpace(comando[5:]) == "" || utf8.RuneCountInString(comando) > 2000 {
		return ret(RIAGrupoInvalida)
	}
	p := m.perfiles[perfil]
	if p == nil || p.Estado != EstadoAprobado {
		return ret(RIAGrupoDenegada)
	}
	r := m.riaLocked()
	if r.grupo == nil {
		r.grupo = make(map[[2]string]*turnoRIAGrupo)
	}
	k, u := [2]string{perfil, solicitud}, [2]string{perfil, dia}
	huella := sha256.Sum256([]byte(comando))
	s := r.grupo[k]
	if s != nil {
		if s.huella != huella {
			return ret(RIAGrupoConflicto)
		}
		if s.consulta.BorradoEn != nil {
			return ret(RIAGrupoRetirada)
		}
		if s.respuesta != nil {
			if s.respuesta.BorradoEn != nil {
				return ret(RIAGrupoRetirada)
			}
			return InicioRIAGrupo{Estado: RIAGrupoCompleta, Consulta: m.clonarMensajeChatLocked(s.consulta, false), Respuesta: m.clonarMensajeChatLocked(s.respuesta, false)}, nil
		}
		if s.consulta.Cuerpo != comando {
			return ret(RIAGrupoConflicto)
		}
		if s.hasta.After(time.Now()) {
			return ret(RIAGrupoEnCurso)
		}
	}
	if r.usos[u] >= tope {
		return ret(RIAGrupoCupo)
	}
	r.usos[u]++
	if s == nil {
		q := &ChatMensaje{ID: m.nextMsgID, AutorID: perfil, Cuerpo: comando, CreadoEn: time.Now()}
		m.nextMsgID++
		m.mensajes = append(m.mensajes, q)
		s = &turnoRIAGrupo{consulta: q, huella: huella}
		r.grupo[k] = s
	}
	s.turno, s.hasta = turno, time.Now().Add(90*time.Second)
	return InicioRIAGrupo{Estado: RIAGrupoIniciada, Consulta: m.clonarMensajeChatLocked(s.consulta, false)}, nil
}

func (m *MemoryStore) ContextoRIAGrupo(_ context.Context, antesID int64) ([]TextoRIAGrupo, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	res := make([]TextoRIAGrupo, 0, LimiteHistorialRIAGrupo)
	for i := len(m.mensajes) - 1; i >= 0 && len(res) < LimiteHistorialRIAGrupo; i-- {
		v := m.mensajes[i]
		if v.ID >= antesID || v.BorradoEn != nil || strings.TrimSpace(v.Cuerpo) == "" {
			continue
		}
		res = append(res, TextoRIAGrupo{v.EsRIA, v.Cuerpo})
	}
	for i, j := 0, len(res)-1; i < j; i, j = i+1, j-1 {
		res[i], res[j] = res[j], res[i]
	}
	return res, nil
}

func (m *MemoryStore) FinalizarRIAGrupo(_ context.Context, perfil, solicitud, turno, respuesta string) (*ChatMensaje, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p := m.perfiles[perfil]
	s := m.riaLocked().grupo[[2]string{perfil, solicitud}]
	if p == nil || p.Estado != EstadoAprobado || s == nil || s.respuesta != nil || turno == "" || s.turno != turno || !s.hasta.After(time.Now()) || s.consulta.BorradoEn != nil || sha256.Sum256([]byte(s.consulta.Cuerpo)) != s.huella {
		return nil, ErrConflict
	}
	if strings.TrimSpace(respuesta) == "" || utf8.RuneCountInString(respuesta) > 2000 {
		return nil, ErrValidation
	}
	msg := &ChatMensaje{ID: m.nextMsgID, AutorID: AutorChatRIA, EsRIA: true, Cuerpo: respuesta, CreadoEn: time.Now()}
	m.nextMsgID++
	m.mensajes = append(m.mensajes, msg)
	s.respuesta, s.turno, s.hasta = msg, "", time.Time{}
	return m.clonarMensajeChatLocked(msg, false), nil
}

func (m *MemoryStore) LiberarRIAGrupo(_ context.Context, perfil, solicitud, turno string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.riaLocked().grupo[[2]string{perfil, solicitud}]
	if s != nil && s.turno == turno && s.respuesta == nil {
		s.turno, s.hasta = "", time.Time{}
	}
	return nil
}
