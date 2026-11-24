package supa

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

type transporteAdjunto func(*http.Request) (*http.Response, error)

func (f transporteAdjunto) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestF10FirmaPrivadaStorage(t *testing.T) {
	const ruta = "12/12345678-90ab-4cde-8fff-0123456789ab/archivo"
	const firma = "/object/sign/asignaciones-adjuntos/" + ruta
	c := New("https://storage.example.test", "doble-service", "doble-anon")
	respuesta := firma + "?token=temporal"
	c.http.Transport = transporteAdjunto(func(r *http.Request) (*http.Response, error) {
		if r.Method != "POST" || r.URL.Path != "/storage/v1"+firma || r.Header.Get("Authorization") != "Bearer doble-service" || r.Header.Get("apikey") != "doble-service" {
			t.Fatalf("petición incorrecta: %s %s", r.Method, r.URL.Path)
		}
		var p map[string]int
		if e := json.NewDecoder(r.Body).Decode(&p); e != nil || p["expiresIn"] != 90 {
			t.Fatalf("caducidad: %v, %v", p, e)
		}
		b, _ := json.Marshal(map[string]string{"signedURL": respuesta})
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(b))), Header: make(http.Header)}, nil
	})
	s := NewSupabaseStore(c)
	ctx := context.Background()
	got, e := s.FirmarObjetoAdjunto(ctx, ruta, "Audio edición & corte.wav", 90)
	if e != nil {
		t.Fatal(e)
	}
	u, e := url.Parse(got)
	if e != nil || u.Host != "storage.example.test" || u.Path != "/storage/v1"+firma || u.Query().Get("token") != "temporal" || u.Query().Get("download") != "Audio edición & corte.wav" {
		t.Fatal(got, e)
	}
	for _, mal := range []string{"https://externo.example" + firma + "?token=temporal", firma, firma + "/otro?token=temporal"} {
		respuesta = mal
		if _, e = s.FirmarObjetoAdjunto(ctx, ruta, "", 90); e == nil {
			t.Fatalf("aceptó firma no válida: %s", mal)
		}
	}
}
