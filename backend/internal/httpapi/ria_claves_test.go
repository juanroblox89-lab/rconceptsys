package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestRIARotaClavesYReintenta(t *testing.T) {
	var intentos []string
	servidor := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clave := r.Header.Get("Authorization")
		intentos = append(intentos, clave)
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
	if !reflect.DeepEqual(intentos, esperado) {
		t.Errorf("intentos inesperados: %v", intentos)
	}
	t.Setenv("NVIDIA_API_KEYS", "")
	m = modeloRIADesdeEntorno()
	m.respaldo.base = servidor.URL
	if e := m.responder(context.Background(), nil, func(string) error { return nil }); e != nil {
		t.Fatal(e)
	}
	if intentos[len(intentos)-1] != "Bearer mock-c" {
		t.Fatal("no se usó la variable singular")
	}
}
