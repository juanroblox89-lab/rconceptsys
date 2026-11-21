package httpapi

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"time"
)

const modeloRIARespaldo = "nvidia/nemotron-3.5-super-vl-120b-a12b"
const baseNVIDIA = "https://integrate.api.nvidia.com/v1"

type riaMensajeModelo struct {
	Rol   string `json:"role"`
	Texto string `json:"content"`
}
type riaProveedor struct {
	base, clave, modelo string
	nvidia              bool
	espera              time.Duration
}
type riaModelo struct {
	principal, respaldo riaProveedor
	cliente             *http.Client
	clavesNVIDIA        []string
}

var turnoNVIDIA atomic.Uint64

func unirClavesNVIDIA(lista, singular string) []string {
	var claves []string
	vistas := map[string]bool{}
	for _, raw := range append(strings.Split(lista, ","), singular) {
		k := strings.TrimSpace(raw)
		if k != "" && !vistas[k] {
			claves = append(claves, k)
			vistas[k] = true
		}
	}
	return claves
}

func modeloRIADesdeEntorno() riaModelo {
	respaldo := strings.TrimSpace(os.Getenv("RIA_MODELO_RESPALDO"))
	if respaldo == "" {
		respaldo = modeloRIARespaldo
	}
	return riaModelo{
		principal:    riaProveedor{base: strings.TrimSpace(os.Getenv("NINEROUTER_BASE_URL")), clave: strings.TrimSpace(os.Getenv("NINEROUTER_API_KEY")), modelo: "ag/claude-sonnet-5-5-low", espera: 6 * time.Second},
		respaldo:     riaProveedor{base: baseNVIDIA, modelo: respaldo, nvidia: true, espera: 12 * time.Second},
		clavesNVIDIA: unirClavesNVIDIA(os.Getenv("NVIDIA_API_KEYS"), os.Getenv("NVIDIA_API_KEY")),
		cliente:      &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }},
	}
}

func (m riaModelo) responder(ctx context.Context, mensajes []riaMensajeModelo, emitir func(string) error) error {
	emitio, reintentar, err := m.leer(ctx, m.principal, mensajes, emitir)
	if err == nil || emitio || !reintentar || ctx.Err() != nil {
		return err
	}
	claves := m.clavesNVIDIA
	if len(claves) == 0 && m.respaldo.clave != "" {
		claves = []string{m.respaldo.clave}
	}
	if len(claves) == 0 {
		return errors.New("respaldo no configurado")
	}
	inicio := int((turnoNVIDIA.Add(1) - 1) % uint64(len(claves)))
	for i := range claves {
		p := m.respaldo
		p.clave = claves[(inicio+i)%len(claves)]
		emitio, _, err = m.leer(ctx, p, mensajes, emitir)
		if err == nil || emitio || ctx.Err() != nil {
			return err
		}
	}
	return err
}

func (m riaModelo) leer(ctx context.Context, p riaProveedor, mensajes []riaMensajeModelo, emitir func(string) error) (emitio, reintentar bool, err error) {
	if p.base == "" || p.clave == "" {
		return false, true, errors.New("proveedor no configurado")
	}
	parametros := map[string]any{"model": p.modelo, "messages": mensajes, "stream": true, "max_tokens": 4096}
	if p.nvidia {
		parametros["chat_template_kwargs"] = map[string]bool{"enable_thinking": false}
	} else {
		parametros["reasoning_effort"] = "low"
	}
	raw, err := json.Marshal(parametros)
	if err != nil {
		return false, false, err
	}
	vida, cancel := context.WithCancel(ctx)
	defer cancel()
	// Presupuesto hasta el primer fragmento útil, incluso si el proveedor envía cabeceras o razonamiento antes.
	espera := p.espera
	if espera <= 0 {
		espera = 6 * time.Second
	}
	reloj := time.AfterFunc(espera, cancel)
	defer reloj.Stop()
	base := strings.TrimRight(p.base, "/")
	if !strings.HasSuffix(base, "/v1") {
		base += "/v1"
	}
	req, err := http.NewRequestWithContext(vida, http.MethodPost, base+"/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return false, true, err
	}
	req.Header.Set("Authorization", "Bearer "+p.clave)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	res, err := m.cliente.Do(req)
	if err != nil {
		return false, true, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return false, res.StatusCode >= 500 || res.StatusCode == 429 || res.StatusCode == 408 || res.StatusCode == 401 || res.StatusCode == 403, fmt.Errorf("estado del proveedor: %d", res.StatusCode)
	}
	if !strings.HasPrefix(res.Header.Get("Content-Type"), "text/event-stream") {
		return false, true, errors.New("el proveedor no inició SSE")
	}
	s := bufio.NewScanner(res.Body)
	s.Buffer(make([]byte, 4096), 256*1024)
	var puntos int
	for s.Scan() {
		linea := s.Text()
		if !strings.HasPrefix(linea, "data:") {
			continue
		}
		dato := strings.TrimSpace(strings.TrimPrefix(linea, "data:"))
		if dato == "[DONE]" {
			if emitio {
				return true, false, nil
			}
			return false, true, errors.New("respuesta vacía")
		}
		var d struct {
			Choices []struct {
				Delta struct {
					Texto string `json:"content"`
				} `json:"delta"`
				Fin *string `json:"finish_reason"`
			} `json:"choices"`
			Error json.RawMessage `json:"error"`
		}
		if json.Unmarshal([]byte(dato), &d) != nil {
			continue
		}
		if len(d.Error) > 0 && string(d.Error) != "null" {
			return emitio, !emitio, errors.New("error del proveedor durante SSE")
		}
		if len(d.Choices) == 0 {
			continue
		}
		c := d.Choices[0]
		if c.Delta.Texto != "" {
			puntos += len([]rune(c.Delta.Texto))
			if puntos > 20000 {
				return emitio, false, errors.New("respuesta demasiado larga")
			}
			if !emitio {
				reloj.Stop()
			}
			if e := emitir(c.Delta.Texto); e != nil {
				return emitio, false, e
			}
			emitio = true
		}
		if c.Fin != nil && emitio {
			return true, false, nil
		}
	}
	if err := s.Err(); err != nil {
		return emitio, !emitio, err
	}
	return emitio, !emitio, errors.New("la respuesta se interrumpió")
}
