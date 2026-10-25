package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"rconceptsys/backend/internal/httpapi"
	"rconceptsys/backend/internal/store"
	"rconceptsys/backend/internal/supa"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8310" // Puerto F0 acordado
	}

	adminEmailsStr := os.Getenv("ADMIN_EMAILS")
	var adminEmails []string
	if adminEmailsStr != "" {
		for _, e := range strings.Split(adminEmailsStr, ",") {
			trimmed := strings.TrimSpace(e)
			if trimmed != "" {
				adminEmails = append(adminEmails, trimmed)
			}
		}
	}
	if len(adminEmails) == 0 {
		adminEmails = []string{"admin@rconcept.com", "juanroblox89@gmail.com"}
	}

	supaURL := os.Getenv("SUPABASE_URL")
	supaKey := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")

	var s store.Store
	var auth httpapi.AuthVerifier

	if supaURL != "" && supaKey != "" {
		log.Println("[backend] Conectando con cliente Supabase REST...")
		sc := supa.New(supaURL, supaKey)
		s = supa.NewSupabaseStore(sc)
		auth = supa.NewSupabaseAuthVerifier(sc, s, adminEmails)
	} else {
		log.Println("[backend] Modo memoria (sin credenciales Supabase)...")
		memStore := store.NewMemoryStore()
		
		// Iniciar con usuarios semilla para desarrollo y pruebas
		ahora := time.Now()
		_ = memStore.CrearOActualizarPerfil(context.Background(), &store.Perfil{
			ID:       "admin-1",
			Correo:   "admin@rconcept.com",
			Nombre:   "Admin Demo",
			Estado:   store.EstadoAprobado,
			EsAdmin:  true,
			CreadoEn: ahora.Add(-48 * time.Hour),
		})
		_ = memStore.CrearOActualizarPerfil(context.Background(), &store.Perfil{
			ID:       "cam-1",
			Correo:   "camarografo@rconcept.com",
			Nombre:   "Mateo Grabador",
			Estado:   store.EstadoAprobado,
			EsAdmin:  false,
			CreadoEn: ahora.Add(-24 * time.Hour),
		})
		_ = memStore.CrearOActualizarPerfil(context.Background(), &store.Perfil{
			ID:       "pend-1",
			Correo:   "nuevo@rconcept.com",
			Nombre:   "Usuario Pendiente",
			Estado:   store.EstadoPendiente,
			EsAdmin:  false,
			CreadoEn: ahora.Add(-2 * time.Hour),
		})

		// Asignar roles a los usuarios iniciales
		_, _ = memStore.AsignarRolesMiembro(context.Background(), "admin-1", []int{1, 2, 3})
		_, _ = memStore.AsignarRolesMiembro(context.Background(), "cam-1", []int{1})

		// Mensajes de bienvenida
		_, _ = memStore.CrearMensajeChat(context.Background(), "admin-1", "¡Bienvenidos al sistema RConcept! Aquí coordinamos grabaciones y ediciones.")
		_, _ = memStore.CrearMensajeChat(context.Background(), "cam-1", "Listo para la producción de hoy.")

		s = memStore
		auth = httpapi.NewDemoAuthVerifier(memStore, adminEmails)
	}

	api := httpapi.NewAPI(s, auth)
	handler := api.Routes()

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Manejo de apagado graceful
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("[backend] Servidor escuchando en http://localhost:%s\n", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[backend] Error al iniciar servidor: %v\n", err)
		}
	}()

	<-stop
	log.Println("[backend] Apagando servidor con gracia...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Printf("[backend] Error durante el apagado: %v\n", err)
	}
	log.Println("[backend] Servidor apagado.")
	fmt.Println()
}
