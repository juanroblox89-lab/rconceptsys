package httpapi

import (
	"net/http/httptest"
	"testing"
)

func TestDriveRetornoPublico(t *testing.T) {
	a := &API{F5: NuevoEstadoF5()}
	a.F5.Drive.RedirectURI = ""
	for _, c := range []struct{ host, proto, want string }{
		{"preview.example.com", "https", "https://preview.example.com/api/drive/callback"},
		{"localhost:3312", "http", "http://localhost:3312/api/drive/callback"},
		{"internal.services.vercel-infra.com", "https", ""},
		{"bad.example.com, preview.example.com", "https", ""},
		{"preview.example.com", "http", ""},
		{"", "", ""},
	} {
		r := httptest.NewRequest("GET", "http://internal.services.vercel-infra.com/api/drive/callback", nil)
		r.Header.Set("X-Forwarded-Host", c.host)
		r.Header.Set("X-Forwarded-Proto", c.proto)
		if got := a.redirectURI(r); got != c.want {
			t.Errorf("%s/%s: %q, esperaba %q", c.host, c.proto, got, c.want)
		}
	}
	a.F5.Drive.RedirectURI = "https://public.example.com/api/drive/callback"
	if got := a.redirectURI(httptest.NewRequest("GET", "http://internal.invalid", nil)); got != a.F5.Drive.RedirectURI {
		t.Fatal("la variable explícita debe prevalecer")
	}
}
