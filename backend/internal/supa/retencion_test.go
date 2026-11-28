package supa

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"reflect"
	"strings"
	"testing"
)

type transportePurga func(*http.Request) (*http.Response, error)

func (f transportePurga) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestPurgaStorageAntesDeMarca(t *testing.T) {
	for _, caso := range []struct {
		nombre            string
		status            int
		marca, rutaValida bool
		pasos             []string
		count             int
	}{
		{"bien", 200, true, true, []string{"reclamo", "storage", "marca", "reclamo", "asignaciones"}, 1},
		{"fallo storage", 503, false, true, []string{"reclamo", "storage", "asignaciones"}, 0},
		{"marca no confirmada", 200, false, true, []string{"reclamo", "storage", "marca", "asignaciones"}, 0},
		{"ruta fuera de contrato", 200, false, false, []string{"reclamo", "asignaciones"}, 0},
	} {
		t.Run(caso.nombre, func(t *testing.T) {
			var pasos []string
			var intento string
			reclamos := 0
			ruta := "00000000-0000-4000-8000-000000000001/123-voz.webm"
			if !caso.rutaValida {
				ruta = "https://drive.google.com/drive/folders/qa"
			}
			c := New("http://127.0.0.1:1", "sintetico", "")
			c.http.Transport = transportePurga(func(r *http.Request) (*http.Response, error) {
				var in struct {
					Intento  string   `json:"p_intento"`
					Bucket   string   `json:"p_bucket"`
					ID       string   `json:"p_id"`
					Prefixes []string `json:"prefixes"`
				}
				if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
					t.Fatal(err)
				}
				status, body := 200, "[]"
				switch r.URL.Path {
				case "/rest/v1/rpc/rc_reclamar_purga_chat":
					pasos = append(pasos, "reclamo")
					reclamos++
					if reclamos == 1 {
						intento = in.Intento
						body = `[{"id":"7","ruta":"` + ruta + `"}]`
					}
				case "/rest/v1/rpc/rc_reclamar_purga_asignacion":
					pasos = append(pasos, "asignaciones")
				case "/storage/v1/object/chat":
					pasos = append(pasos, "storage")
					status = caso.status
					if r.Method != "DELETE" || !reflect.DeepEqual(in.Prefixes, []string{ruta}) {
						t.Fatalf("DELETE distinto: %+v", in)
					}
				case "/rest/v1/rpc/rc_marcar_purga":
					pasos = append(pasos, "marca")
					body = "false"
					if caso.marca {
						body = "true"
					}
					if in.ID != "7" || in.Bucket != "chat" || in.Intento != intento || intento == "" {
						t.Fatalf("marca distinta: %+v", in)
					}
				default:
					t.Fatalf("solicitud inesperada: %s", r.URL.Path)
				}
				return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
			})
			s := &SupabaseStore{client: c}
			conteo, err := s.PurgarRetencion(context.Background())
			if (err == nil) != (caso.count == 1) || conteo.Chat != caso.count || conteo.Asignaciones != 0 || !reflect.DeepEqual(pasos, caso.pasos) {
				t.Fatalf("purga %+v, error %v, pasos %v", conteo, err, pasos)
			}
		})
	}
}
