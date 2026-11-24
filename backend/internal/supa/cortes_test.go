package supa

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestCortesRelacionDelParticipante(t *testing.T) {
	const corte = `[{"id":7,"periodo":"mes","corte_lineas":[{"perfil_id":"miembro","pagada_por":"admin","perfiles":{"id":"miembro","nombre":"Lina"}}]}]`
	c := New("https://supabase.example.test", "prueba", "prueba")
	body := "[]"
	c.http.Transport = transporteAdjunto(func(r *http.Request) (*http.Response, error) {
		status, respuesta := 200, body
		if r.URL.Path != "/rest/v1/cortes" || r.Method != "GET" {
			t.Fatalf("petición inesperada: %s %s", r.Method, r.URL.Path)
		}
		if !strings.Contains(r.URL.Query().Get("select"), "perfiles!corte_lineas_perfil_id_fkey(") {
			status, respuesta = 300, `{"code":"PGRST201","message":"Could not embed because more than one relationship was found"}`
		}
		return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(respuesta)), Header: make(http.Header)}, nil
	})
	s := NewSupabaseStore(c)
	ctx := context.Background()
	if lista, err := s.ListarCortes(ctx); err != nil || lista == nil || len(lista) != 0 {
		t.Fatalf("lista vacía válida: %#v, %v", lista, err)
	}
	body = corte
	lista, err := s.ListarCortes(ctx)
	if err != nil || len(lista) != 1 || len(lista[0].Lineas) != 1 || lista[0].Lineas[0].Perfil == nil || lista[0].Lineas[0].Perfil.ID != "miembro" {
		t.Fatalf("el listado no resolvió el perfil del participante: %#v, %v", lista, err)
	}
	v, err := s.ObtenerCorte(ctx, 7)
	if err != nil || len(v.Lineas) != 1 || v.Lineas[0].Perfil == nil || v.Lineas[0].Perfil.Nombre != "Lina" {
		t.Fatalf("el detalle no resolvió el perfil del participante: %#v, %v", v, err)
	}
}
