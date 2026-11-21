package supa

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestActividadEquipoCuentaPerfilesUUID(t *testing.T) {
	servidor := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasSuffix(r.URL.Path, "/perfiles") {
			if r.URL.Query().Get("estado") != "eq.aprobado" {
				t.Error("faltó filtrar aprobados")
			}
			fmt.Fprint(w, `[{"id":"a5e41e2e-25ae-4822-9776-153641f12345"},{"id":"c4627721-484c-427b-8a9b-18812cbe0960"}]`)
			return
		}
		fmt.Fprint(w, `[]`)
	}))
	defer servidor.Close()
	s := NewSupabaseStore(&Client{baseURL: servidor.URL, http: servidor.Client()})
	if got := s.actividadEquipo(context.Background()).Miembros; got != 2 {
		t.Fatalf("miembros: %d, esperaba 2", got)
	}
}
