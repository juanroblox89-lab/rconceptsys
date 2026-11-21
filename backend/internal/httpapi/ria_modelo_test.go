package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestRIARespaldoDirecto(t *testing.T) {
	for _, caso := range []string{"timeout", "503", "530"} {
		t.Run(caso, func(t *testing.T) {
			primario := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if caso == "timeout" {
					select {
					case <-r.Context().Done():
					case <-time.After(200 * time.Millisecond):
					}
					return
				}
				if caso == "530" {
					w.WriteHeader(530)
				} else {
					w.WriteHeader(503)
				}
			}))
			defer primario.Close()
			respaldo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var datos map[string]any
				_ = json.NewDecoder(r.Body).Decode(&datos)
				if r.URL.Path != "/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer "+t.Name() || datos["model"] != modeloRIARespaldo || datos["stream"] != true {
					t.Errorf("petición inesperada al respaldo: %s %v", r.URL.Path, datos)
				}
				w.Header().Set("Content-Type", "text/event-stream")
				for _, c := range []string{"Uno", " dos"} {
					fmt.Fprintf(w, "data: {\"choices\":[{\"delta\":{\"content\":%q}}]}\n\n", c)
					w.(http.Flusher).Flush()
				}
				fmt.Fprint(w, "data: [DONE]\n\n")
			}))
			defer respaldo.Close()
			t.Setenv("NVIDIA_API_KEYS", "")
			t.Setenv("NVIDIA_API_KEY", t.Name())
			t.Setenv("RIA_MODELO_RESPALDO", "")
			m := modeloRIADesdeEntorno()
			m.principal.base = primario.URL
			m.principal.clave = t.Name()
			m.principal.espera = 70 * time.Millisecond
			m.respaldo.base = respaldo.URL
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			var fragmentos []string
			if e := m.responder(ctx, []riaMensajeModelo{{"user", "prueba"}}, func(s string) error { fragmentos = append(fragmentos, s); return nil }); e != nil {
				t.Fatal(e)
			}
			if strings.Join(fragmentos, "") != "Uno dos" || len(fragmentos) != 2 {
				t.Fatalf("fragmentos: %q", fragmentos)
			}
		})
	}
}
