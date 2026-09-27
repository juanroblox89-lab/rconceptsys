// Package asistente concentra el dominio F5 (BRIEF F5 §1): tipos del
// asistente IA (conversaciones, mensajes, uso diario). Solo stdlib.
//
// La seguridad (quién puede qué) vive en permisos.Puede; las herramientas
// que ven datos (herramientas.go) filtran por el usuario que pregunta.
// Solo lectura + creación de borradores; nunca aprueba, borra, paga ni
// cambia estados. Cada escritura del asistente queda en actividad con
// motivo "vía asistente" (lo registra el handler, no este paquete).
package asistente

import "time"

// Roles de mensaje en el historial guardado.
const (
	RolUsuario    = "user"
	RolAsistente  = "assistant"
	RolSistema    = "system"
	RolHerramient = "tool"
)

// Conversacion es un hilo de chat de un usuario. Titulo corto para la
// lista (primeras palabras de la primera pregunta).
type Conversacion struct {
	ID        string `json:"id"`
	UsuarioID string `json:"usuario_id"`
	Titulo    string `json:"titulo,omitempty"`
	CreatedAt string `json:"created_at,omitempty"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

// Mensaje es una entrada del historial (pregunta o respuesta).
type Mensaje struct {
	ID             string `json:"id"`
	ConversacionID string `json:"conversacion_id"`
	Rol            string `json:"rol"`
	Contenido      string `json:"contenido"`
	CreatedAt      string `json:"created_at,omitempty"`
}

// MensajeLLM es lo que se envía al proveedor (OpenAI-compatible).
type MensajeLLM struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// DiaHoy devuelve hoy en UTC como YYYY-MM-DD (clave de asistente_uso).
func DiaHoy() string { return time.Now().UTC().Format("2006-01-02") }

// TituloDe saca un título corto de la primera pregunta (máx 60 runas).
func TituloDe(pregunta string) string {
	r := []rune(pregunta)
	for i, ch := range r {
		if ch == '\n' {
			r = r[:i]
			break
		}
	}
	if len(r) > 60 {
		r = r[:60]
	}
	return string(r)
}
