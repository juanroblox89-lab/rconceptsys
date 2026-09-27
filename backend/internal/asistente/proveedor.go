// Cadena mínima de proveedores de IA (BRIEF F5 §1, adaptada del patrón de
// Globe backend/internal/agent/providers.go): 9router primero
// (NINEROUTER_BASE_URL + NINEROUTER_API_KEY, modelo NINEROUTER_MODEL,
// default oc/big-pickle(xhigh)) → respaldo OpenAI-compatible opcional por
// env (OPENAI_COMPAT_BASE_URL + OPENAI_COMPAT_API_KEY + OPENAI_COMPAT_MODEL).
// Ninguna clave en el repo: solo .env.example con los nombres.
//
// Particularidades del gateway (del brief): stream:false (no streaming),
// User-Agent: Go-http-client/1.1 (es el default de net/http, no se
// sobreescribe), max_tokens >= 16 (mínimo del gateway). Timeout 30 s con
// mensaje amable (lo aplica el handler; Proveer respeta el contexto).
//
// Sin claves configuradas → Configurado() = false y el handler responde
// "no disponible"; el resto del sistema funciona igual (ANALISIS §5.31).
// Solo stdlib.
package asistente

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const modeloDefault = "oc/big-pickle(xhigh)"

// TimeoutLLM es el tope de una llamada al proveedor (brief: 30 s).
const TimeoutLLM = 30 * time.Second

type proveedor struct {
	nombre   string // "9router" | "respaldo"
	endpoint string // .../chat/completions
	clave    string
	modelo   string
}

// La clave NUNCA se loguea en claro (mismo cuidado que Globe).
func (p proveedor) String() string {
	return fmt.Sprintf("{nombre:%s endpoint:%s modelo:%s clave:***}", p.nombre, p.endpoint, p.modelo)
}

// getenv es sobreescribible en tests.
var getenv = func(k string) string { return "" }

// SetGetenv instala un lector falso (tests) o nil (restaura el real).
func SetGetenv(f func(string) string) {
	if f == nil {
		getenv = getenvOS
		return
	}
	getenv = f
}

// En producción getenv lee el entorno real; se instala en init para que
// los tests puedan inyectar valores falsos sin tocar el paquete os aquí.
func init() {
	getenv = getenvOS
}

func chatEndpoint(base string) string {
	base = strings.TrimSpace(base)
	if strings.HasSuffix(base, "/chat/completions") {
		return base
	}
	return strings.TrimRight(base, "/") + "/chat/completions"
}

// Config devuelve la cadena en orden (primero 9router, después respaldo).
// Omite el que no tenga base+clave (sin claves → cadena vacía).
func cadena() []proveedor {
	out := []proveedor{}
	if base, clave := strings.TrimSpace(getenv("NINEROUTER_BASE_URL")), strings.TrimSpace(getenv("NINEROUTER_API_KEY")); base != "" && clave != "" {
		if strings.HasPrefix(base, "http://") || strings.HasPrefix(base, "https://") {
			m := strings.TrimSpace(getenv("NINEROUTER_MODEL"))
			if m == "" {
				m = modeloDefault
			}
			out = append(out, proveedor{nombre: "9router", endpoint: chatEndpoint(base), clave: clave, modelo: m})
		}
	}
	if base, clave := strings.TrimSpace(getenv("OPENAI_COMPAT_BASE_URL")), strings.TrimSpace(getenv("OPENAI_COMPAT_API_KEY")); base != "" && clave != "" {
		if strings.HasPrefix(base, "http://") || strings.HasPrefix(base, "https://") {
			m := strings.TrimSpace(getenv("OPENAI_COMPAT_MODEL"))
			if m == "" {
				m = modeloDefault
			}
			out = append(out, proveedor{nombre: "respaldo", endpoint: chatEndpoint(base), clave: clave, modelo: m})
		}
	}
	return out
}

// Configurado dice si hay al menos un proveedor con base+clave.
func Configurado() bool { return len(cadena()) > 0 }

// clientHTTP es sobreescribible en tests (proveedor falso = RoundTripper).
var clientHTTP = &http.Client{Timeout: TimeoutLLM}

// completarUna hace UN intento no-streaming OpenAI-compatible:
// {"model","messages","stream":false,"max_tokens":>=16}.
func completarUna(ctx context.Context, p proveedor, msgs []MensajeLLM) (string, error) {
	cuerpo, err := json.Marshal(map[string]any{
		"model":      p.modelo,
		"messages":   msgs,
		"stream":     false,
		"max_tokens": 1024,
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.endpoint, bytes.NewReader(cuerpo))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+p.clave)
	req.Header.Set("Content-Type", "application/json")
	// User-Agent: Go-http-client/1.1 es el default de net/http; no se toca.
	resp, err := clientHTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return "", fmt.Errorf("%s: código HTTP inesperado: %d (%s)", p.nombre, resp.StatusCode, strings.TrimSpace(string(b)))
	}
	var cr struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&cr); err != nil || len(cr.Choices) == 0 {
		return "", fmt.Errorf("%s: respuesta inválida", p.nombre)
	}
	texto := strings.TrimSpace(cr.Choices[0].Message.Content)
	if texto == "" {
		return "", fmt.Errorf("%s: respuesta vacía", p.nombre)
	}
	return texto, nil
}

// Completar prueba la cadena en orden y devuelve el primer texto útil.
// Si ningún proveedor responde, devuelve error (el handler lo traduce al
// mensaje amable "no disponible"). Respeta el contexto (timeout 30 s).
func Completar(ctx context.Context, msgs []MensajeLLM) (string, error) {
	prov := cadena()
	if len(prov) == 0 {
		return "", fmt.Errorf("asistente no disponible (sin claves configuradas)")
	}
	var ultimo error
	for _, p := range prov {
		texto, err := completarUna(ctx, p, msgs)
		if err == nil {
			return texto, nil
		}
		ultimo = err
	}
	if ultimo == nil {
		ultimo = fmt.Errorf("sin proveedores")
	}
	return "", ultimo
}
