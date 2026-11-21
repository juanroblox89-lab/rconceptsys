package httpapi

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestRIARotaClavesYReintenta(t *testing.T) {
	var intentos []string
	var mu sync.Mutex
	servidor := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clave := r.Header.Get("Authorization")
		mu.Lock()
		intentos = append(intentos, clave)
		mu.Unlock()
		switch clave {
		case "Bearer mock-a":
			w.WriteHeader(429)
			return
		case "Bearer mock-b":
			w.WriteHeader(503)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"Listo\"}}]}\n\ndata: [DONE]\n\n")
	}))
	defer servidor.Close()
	t.Setenv("NINEROUTER_BASE_URL", "")
	t.Setenv("NVIDIA_API_KEYS", "mock-a, mock-b,mock-a")
	t.Setenv("NVIDIA_API_KEY", "mock-c")
	m := modeloRIADesdeEntorno()
	m.respaldo.base = servidor.URL
	turnoNVIDIA.Store(0)
	for i := 0; i < 3; i++ {
		if e := m.responder(context.Background(), nil, func(string) error { return nil }); e != nil {
			t.Fatal(e)
		}
	}
	esperado := []string{"Bearer mock-a", "Bearer mock-b", "Bearer mock-c", "Bearer mock-b", "Bearer mock-c", "Bearer mock-c"}
	t.Setenv("NVIDIA_API_KEYS", " , ")
	m = modeloRIADesdeEntorno()
	m.respaldo.base = servidor.URL
	if e := m.responder(context.Background(), nil, func(string) error { return nil }); e != nil {
		t.Fatal(e)
	}
	esperado = append(esperado, "Bearer mock-c")
	mu.Lock()
	defer mu.Unlock()
	if !reflect.DeepEqual(intentos, esperado) {
		t.Fatal("se alteró el orden round-robin, la deduplicación o el uso de la clave singular")
	}
}

func TestRIANVIDIATimeoutYAgotamiento(t *testing.T) {
	for _, todosFallan := range []bool{false, true} {
		nombre := "timeout y éxito"
		if todosFallan {
			nombre = "todas fallan"
		}
		t.Run(nombre, func(t *testing.T) {
			const primera, segunda = "mock-lenta", "mock-siguiente"
			intentos := make(chan string, 4)
			servidor := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _ = io.Copy(io.Discard, r.Body)
				clave := r.Header.Get("Authorization")
				intentos <- clave
				if clave == "Bearer "+primera {
					w.Header().Set("Content-Type", "text/event-stream")
					w.(http.Flusher).Flush() // Abrió SSE, pero no empezó a responder.
					<-r.Context().Done()
					return
				}
				if todosFallan {
					http.Error(w, clave, http.StatusServiceUnavailable)
					return
				}
				w.Header().Set("Content-Type", "text/event-stream")
				fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"Listo\"}}]}\n\ndata: [DONE]\n\n")
			}))
			defer servidor.Close()
			t.Setenv("NINEROUTER_BASE_URL", "")
			t.Setenv("NVIDIA_API_KEYS", primera+", "+segunda)
			t.Setenv("NVIDIA_API_KEY", segunda)
			m := modeloRIADesdeEntorno()
			m.respaldo.base = servidor.URL
			m.respaldo.espera = 80 * time.Millisecond
			turnoNVIDIA.Store(0)
			ctx, cancelar := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancelar()
			var salida strings.Builder
			err := m.responder(ctx, nil, func(delta string) error { salida.WriteString(delta); return nil })
			if len(intentos) != 2 || <-intentos != "Bearer "+primera || <-intentos != "Bearer "+segunda {
				t.Fatal("el timeout debe avanzar exactamente una vez a la siguiente clave")
			}
			if todosFallan {
				if err == nil || strings.Contains(err.Error(), segunda) || salida.Len() != 0 {
					t.Fatal("se esperaba un error sin credenciales ni texto emitido")
				}
			} else if err != nil || salida.String() != "Listo" {
				t.Fatal("la segunda clave no completó la respuesta tras el timeout")
			}
		})
	}
}
