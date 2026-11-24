package httpapi

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"rconceptsys/backend/internal/store"
)

// Sonda opt-in: solo voz sintética. No lee archivos de entorno ni imprime audio o claves.
func TestF10SondaGeminiSintetica(t *testing.T) {
	ruta := os.Getenv("F10_AUDIO_SINTETICO")
	if ruta == "" {
		t.Skip("sonda opcional con WAV sintético")
	}
	b, err := os.ReadFile(ruta)
	if err != nil || len(b) == 0 || len(b) > mibAdjunto {
		t.Fatal("WAV sintético no disponible")
	}
	ctx, fin := context.WithTimeout(context.Background(), 32*time.Second)
	defer fin()
	r, err := audioDesdeEntorno().Gemini(ctx, &store.AdjuntoAsignacion{Nombre: "sintetico.wav", Mime: "audio/wav"}, b)
	if err != nil {
		t.Fatal("Gemini no pudo transcribir")
	}
	r, err = normalizarAudio(r)
	if err != nil {
		t.Fatal("Gemini no devolvió una transcripción y un resumen válidos")
	}
	texto := strings.ToLower(r.Transcripcion)
	for _, palabra := range []string{"clips", "color", "viernes"} {
		if !strings.Contains(texto, palabra) {
			t.Fatal("La transcripción no coincide con la muestra sintética")
		}
	}
	t.Logf("9router Gemini: transcripción cotejada; %d viñetas", len(r.Resumen))
}
