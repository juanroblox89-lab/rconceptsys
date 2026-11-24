package httpapi_test

import (
	"strings"
	"testing"
)

func TestAyudaRIARespondeSinRecomendarse(t *testing.T) {
	t.Setenv("ASISTENTE_TOPE_DIA", "20")
	rutas, _, _, editor, _, _ := setupF2TestEnvironment(t)
	for _, pregunta := range []string{"Tengo una duda sobre cómo usar rconceptsys", "¿Cómo entrego un trabajo?", "¿Dónde veo mi corte?", "¿Cómo cambio el tema?", "¿Cómo adjunto archivos?", "¿Cómo configuro mis avisos?"} {
		r := doRequest(rutas, "POST", "/api/ria", editor, map[string]any{"pregunta": pregunta})
		respuesta := strings.ToLower(r.Body.String())
		if r.Code != 200 || !strings.Contains(respuesta, "event: fin") || strings.Contains(respuesta, "/ria") || strings.Contains(respuesta, "botón ayuda") || strings.Contains(respuesta, "**ayuda**") {
			t.Fatalf("respuesta circular o incompleta a %q: %d %s", pregunta, r.Code, respuesta)
		}
	}
}
