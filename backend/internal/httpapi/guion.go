package httpapi

import (
	"net/http"
	"strings"
	"unicode/utf8"

	"rconceptsys/backend/internal/store"
)

// Admite hasta 20.000 caracteres aun si el cliente escapa Unicode no BMP
// como pares JSON de 12 bytes, más margen para el resto de la asignación.
const maxBytesDatosTarea = 256 * 1024

func validarGuion(w http.ResponseWriter, valor string) (string, bool) {
	texto := strings.TrimSpace(valor)
	if utf8.RuneCountInString(texto) > store.MaxCaracteresGuion {
		ResponderError(w, 400, "guion_largo", "El guion no puede superar los 20.000 caracteres.")
		return "", false
	}
	if strings.ContainsRune(texto, 0) {
		ResponderError(w, 400, "guion_invalido", "El guion contiene un carácter no válido. Pégalo como texto plano.")
		return "", false
	}
	return texto, true
}

func cuerpoAvisoConGuion(cuerpo string, t *store.Tarea) string {
	const limite = 160
	if t.Guion == "" {
		runas := []rune(cuerpo)
		return string(runas[:min(len(runas), limite)])
	}
	const sufijo = " · Incluye guion"
	runas := []rune(cuerpo)
	return string(runas[:min(len(runas), limite-utf8.RuneCountInString(sufijo))]) + sufijo
}

func extractoGuionRIA(guion string) string {
	const limite = 180
	runas := []rune(strings.Join(strings.Fields(guion), " "))
	if len(runas) <= limite {
		return string(runas)
	}
	return strings.TrimSpace(string(runas[:limite-1])) + "…"
}
