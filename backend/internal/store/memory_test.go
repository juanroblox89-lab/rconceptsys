package store_test

import (
	"context"
	"testing"

	"rconceptsys/backend/internal/store"
)

func TestMemoryStoreBasics(t *testing.T) {
	ctx := context.Background()
	s := store.NewMemoryStore()

	// 1. Roles iniciales
	roles, err := s.ListarRoles(ctx, true)
	if err != nil {
		t.Fatalf("error listando roles: %v", err)
	}
	if len(roles) != 3 {
		t.Fatalf("esperaba 3 roles por defecto, obtuve %d", len(roles))
	}

	// 2. Crear perfil
	p1 := &store.Perfil{
		ID:      "u-1",
		Correo:  "admin@rconcept.com",
		Nombre:  "Admin Principal",
		Estado:  store.EstadoAprobado,
		EsAdmin: true,
	}
	if err := s.CrearOActualizarPerfil(ctx, p1); err != nil {
		t.Fatalf("error creando perfil: %v", err)
	}

	// 3. Obtener perfil
	obtenido, err := s.ObtenerPerfilPorID(ctx, "u-1")
	if err != nil {
		t.Fatalf("error obteniendo perfil: %v", err)
	}
	if obtenido.Nombre != "Admin Principal" || !obtenido.EsAdmin {
		t.Errorf("datos de perfil no coinciden: %+v", obtenido)
	}

	// 4. Asignar roles
	_, err = s.AsignarRolesMiembro(ctx, "u-1", []int{1, 2})
	if err != nil {
		t.Fatalf("error asignando roles: %v", err)
	}
	pConRoles, _ := s.ObtenerPerfilPorID(ctx, "u-1")
	if len(pConRoles.Roles) != 2 {
		t.Errorf("esperaba 2 roles asignados, obtuve %d", len(pConRoles.Roles))
	}

	// 5. El último admin no puede ser degradado
	_, err = s.CambiarEsAdmin(ctx, "u-1", false)
	if err != store.ErrLastAdmin {
		t.Errorf("esperaba ErrLastAdmin al intentar degradar al único admin, obtuve: %v", err)
	}

	// 6. Chat: usuario aprobado puede enviar mensaje
	msg, err := s.CrearMensajeChat(ctx, "u-1", "Hola equipo!")
	if err != nil {
		t.Fatalf("error creando mensaje chat: %v", err)
	}
	if msg.Cuerpo != "Hola equipo!" || msg.Autor == nil {
		t.Errorf("mensaje inválido: %+v", msg)
	}

	// 7. Usuario pendiente NO puede enviar mensaje chat
	pPendiente := &store.Perfil{
		ID:     "u-2",
		Correo: "pendiente@rconcept.com",
		Nombre: "Usuario Pendiente",
		Estado: store.EstadoPendiente,
	}
	s.CrearOActualizarPerfil(ctx, pPendiente)

	_, err = s.CrearMensajeChat(ctx, "u-2", "Debería fallar")
	if err != store.ErrForbidden {
		t.Errorf("esperaba ErrForbidden para usuario pendiente en chat, obtuve: %v", err)
	}
}
