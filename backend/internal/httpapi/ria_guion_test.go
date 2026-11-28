package httpapi

import (
	"context"
	"strings"
	"testing"
	"unicode/utf8"

	"rconceptsys/backend/internal/store"
)

func TestContextoRIAGuionLimitadoPorPermisos(t *testing.T) {
	ctx := context.Background()
	s := store.NewMemoryStore()
	api := NewAPI(s, nil, true)
	for _, id := range []string{"admin", "editor", "otro"} {
		if err := s.CrearOActualizarPerfil(ctx, &store.Perfil{ID: id, Estado: store.EstadoAprobado, EsAdmin: id == "admin"}); err != nil {
			t.Fatal(err)
		}
	}
	const inicio = "Escena QA visible"
	const final = "final_solo_en_detalle"
	guion := inicio + "\n" + strings.Repeat("🎬", 250) + final
	if _, err := s.CrearTarea(ctx, &store.Tarea{TipoID: 2, AsignadoA: "editor", CreadoPor: "admin", Titulo: "Video QA", Guion: guion}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CrearTarea(ctx, &store.Tarea{TipoID: 2, AsignadoA: "otro", CreadoPor: "admin", Titulo: "Video ajeno", Guion: "contenido_solo_de_otro"}); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		id      string
		visible bool
	}{{"editor", true}, {"otro", false}, {"admin", true}} {
		p, err := s.ObtenerPerfilPorID(ctx, tc.id)
		if err != nil {
			t.Fatal(err)
		}
		m, err := api.contextoRIA(ctx, p, "¿Qué dice la apertura?")
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(m[1].Texto, inicio) != tc.visible || strings.Contains(m[1].Texto, final) || (tc.id == "editor" && strings.Contains(m[1].Texto, "contenido_solo_de_otro")) {
			t.Errorf("Contexto incorrecto para %s: %s", tc.id, m[1].Texto)
		}
	}
	if s := extractoGuionRIA(guion); utf8.RuneCountInString(s) != 180 || !strings.HasSuffix(s, "…") {
		t.Fatalf("Extracto no se recortó: %q", s)
	}
}
