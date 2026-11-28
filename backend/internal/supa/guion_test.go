package supa

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"rconceptsys/backend/internal/store"
)

func TestCrearTareaPersisteGuion(t *testing.T) {
	c := New("https://supabase.example.test", "demo", "demo")
	const guion = "Escena 1\nLocución"
	c.http.Transport = transporteAdjunto(func(r *http.Request) (*http.Response, error) {
		var datos map[string]any
		if r.Method != http.MethodPost || r.URL.Path != "/rest/v1/tareas" || json.NewDecoder(r.Body).Decode(&datos) != nil || datos["guion"] != guion {
			t.Fatalf("Creación: %s %s; %v", r.Method, r.URL, datos)
		}
		body := `[{"id":91,"estado":"pendiente","guion":"Escena 1\nLocución"}]`
		return &http.Response{StatusCode: 201, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
	})
	tarea, err := NewSupabaseStore(c).CrearTarea(context.Background(), &store.Tarea{Guion: guion})
	if err != nil || tarea == nil || tarea.Guion != guion {
		t.Fatalf("CrearTarea = %+v, %v", tarea, err)
	}
}
