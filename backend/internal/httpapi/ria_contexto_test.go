package httpapi

import (
	"context"
	"rconceptsys/backend/internal/store"
	"strings"
	"testing"
)

func TestRIAContextoRespetaAlcance(t *testing.T) {
	ctx := context.Background()
	m := store.NewMemoryStore()
	a := NewAPI(m, nil, true)
	editor := &store.Perfil{ID: "editor", Estado: store.EstadoAprobado, Roles: []store.Rol{{Clave: "editor", Nombre: "Editor"}}}
	otro := &store.Perfil{ID: "otro", Estado: store.EstadoAprobado, EsAdmin: true}
	for _, p := range []*store.Perfil{editor, otro} {
		if e := m.CrearOActualizarPerfil(ctx, p); e != nil {
			t.Fatal(e)
		}
	}
	for _, tarea := range []*store.Tarea{{TipoID: 2, Titulo: "SOLO-EDITOR", AsignadoA: "editor", CreadoPor: "otro"}, {TipoID: 2, Titulo: "SOLO-OTRO", AsignadoA: "otro", CreadoPor: "otro"}} {
		if _, e := m.CrearTarea(ctx, tarea); e != nil {
			t.Fatal(e)
		}
	}
	if _, e := m.GuardarConversacionRIA(ctx, "otro", "SOLO-HISTORIAL", "secreto ajeno"); e != nil {
		t.Fatal(e)
	}
	datos := func(p *store.Perfil, equipo bool) string {
		t.Helper()
		ms, e := a.contextoRIA(ctx, p, equipo, "Consulta de prueba")
		if e != nil {
			t.Fatal(e)
		}
		var r strings.Builder
		for _, v := range ms {
			r.WriteString(v.Texto)
		}
		return r.String()
	}
	privado := datos(editor, false)
	if !strings.Contains(privado, "SOLO-EDITOR") || !strings.Contains(privado, "Manual de edición") || strings.Contains(privado, "SOLO-OTRO") || strings.Contains(privado, "/api/admin/") || strings.Contains(privado, "SOLO-HISTORIAL") {
		t.Fatal("El contexto del editor no respetó el alcance")
	}
	publico := datos(otro, true)
	if strings.Contains(publico, "SOLO-EDITOR") || strings.Contains(publico, "SOLO-OTRO") || strings.Contains(publico, "SOLO-HISTORIAL") || strings.Contains(publico, "/api/admin/") {
		t.Fatal("Se incluyeron datos privados en el chat público")
	}
	if !strings.Contains(datos(otro, false), "/api/admin/") {
		t.Fatal("Falta el manual admin para el administrador")
	}
}
