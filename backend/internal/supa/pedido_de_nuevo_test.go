package supa

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"rconceptsys/backend/internal/store"
)

func TestPedirDeNuevoRESTCondicional(t *testing.T) {
	for _, caso := range []struct {
		nombre string
		status int
		body   string
		err    error
	}{
		{"éxito", 200, `[{"id":91,"estado":"pendiente","guion":"Escena 1\nLocución"}]`, nil},
		{"conflicto", 200, `[]`, store.ErrConflict},
		{"pagada", 409, `{"code":"PT409","message":"corte_pagado"}`, store.ErrCortePagado},
	} {
		t.Run(caso.nombre, func(t *testing.T) {
			c := New("https://supabase.example.test", "demo", "demo")
			patches := 0
			c.http.Transport = transporteAdjunto(func(r *http.Request) (*http.Response, error) {
				status, body := caso.status, caso.body
				if r.Method == "PATCH" {
					patches++
					q := r.URL.Query()
					if r.URL.Path != "/rest/v1/tareas" || q.Get("id") != "eq.91" || q.Get("estado") != "eq.aceptada" || r.Header.Get("Prefer") != "return=representation" {
						t.Fatalf("PATCH sin guarda: %s %s", r.Method, r.URL)
					}
					var datos map[string]string
					if err := json.NewDecoder(r.Body).Decode(&datos); err != nil || datos["estado"] != "pendiente" || datos["resuelta_por"] != "admin" || datos["motivo_reapertura"] != "Rehacer" || len(datos) != 3 {
						t.Fatalf("PATCH incorrecto: %v / %v", datos, err)
					}
				} else if caso.err == store.ErrConflict && r.Method == "GET" && r.URL.Path == "/rest/v1/tareas" {
					body = `[{"id":91,"estado":"cancelada"}]`
				} else {
					t.Fatalf("Petición inesperada: %s %s", r.Method, r.URL)
				}
				return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
			})
			trabajo, err := NewSupabaseStore(c).PedirDeNuevoTarea(context.Background(), 91, "admin", " Rehacer ")
			if !errors.Is(err, caso.err) || patches != 1 || (err == nil && (trabajo.ID != 91 || trabajo.Estado != store.EstadoTareaPendiente || trabajo.Guion != "Escena 1\nLocución")) {
				t.Fatalf("Reapertura = %+v, %v; PATCH = %d", trabajo, err, patches)
			}
		})
	}
}
