package httpapi

import (
	"sync"
	"time"
)

type RateLimiter struct {
	mu      sync.Mutex
	buckets map[string][]time.Time
	limite  int
	ventana time.Duration
}

func NewRateLimiter(limite int, ventana time.Duration) *RateLimiter {
	return &RateLimiter{
		buckets: make(map[string][]time.Time),
		limite:  limite,
		ventana: ventana,
	}
}

// Permitir devuelve true si la acción está dentro del límite permitido para la clave.
func (rl *RateLimiter) Permitir(clave string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	ahora := time.Now()
	haceVentana := ahora.Add(-rl.ventana)

	tiempos := rl.buckets[clave]
	var validos []time.Time
	for _, t := range tiempos {
		if t.After(haceVentana) {
			validos = append(validos, t)
		}
	}

	if len(validos) >= rl.limite {
		rl.buckets[clave] = validos
		return false
	}

	validos = append(validos, ahora)
	rl.buckets[clave] = validos
	return true
}
