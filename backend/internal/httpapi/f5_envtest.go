// Helpers de test F5 para inyectar env falso al paquete asistente sin red.
// (El paquete expone setters solo para tests del mismo módulo httpapi.)
package httpapi

import (
	"rconceptsys/backend/internal/asistente"
	"rconceptsys/backend/internal/permisos"
	"rconceptsys/backend/internal/store"
)

// asistenteSetenv reemplaza el lector de env del proveedor por un mapa.
func asistenteSetenv(vars map[string]string) {
	asistente.SetGetenv(func(k string) string { return vars[k] })
}

// asistenteRestaura vuelve al entorno real (SetGetenv(nil)).
func asistenteRestaura() { asistente.SetGetenv(nil) }

func usuarioEquipo(t interface {
	Fatalf(string, ...any)
}, s *Server) permisos.Usuario {
	u, _, _ := s.st.GetUsuario(store.SemillaEquipoID)
	return u
}
