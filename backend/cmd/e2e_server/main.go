package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"rconceptsys/backend/internal/httpapi"
	"rconceptsys/backend/internal/store"
	"rconceptsys/backend/internal/supa"
)

func main() {
	fakePort := "8319"
	apiPort := "8310"

	usersDB := make(map[string]map[string]any)

	// Admin inicial pre-creado en Fake Supabase
	adminEmail := "jestalvz@gmail.com"
	usersDB[adminEmail] = map[string]any{
		"id":       "uuid-admin-jestalvz",
		"email":    adminEmail,
		"password": "password12345",
	}

	// 1. Iniciar Fake Supabase Auth Server en 8319
	fakeMux := http.NewServeMux()

	fakeMux.HandleFunc("POST /auth/v1/admin/users", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Email        string         `json:"email"`
			Password     string         `json:"password"`
			EmailConfirm bool           `json:"email_confirm"`
			UserMetadata map[string]any `json:"user_metadata"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		eNorm := strings.ToLower(strings.TrimSpace(req.Email))

		if _, exists := usersDB[eNorm]; exists {
			w.WriteHeader(http.StatusConflict)
			_ = json.NewEncoder(w).Encode(map[string]string{"msg": "User already registered"})
			return
		}

		uid := "uuid-" + strings.ReplaceAll(eNorm, "@", "-")
		uid = strings.ReplaceAll(uid, ".", "-")
		usersDB[eNorm] = map[string]any{
			"id":       uid,
			"email":    eNorm,
			"password": req.Password,
			"metadata": req.UserMetadata,
		}

		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":    uid,
			"email": eNorm,
		})
	})

	fakeMux.HandleFunc("POST /auth/v1/token", func(w http.ResponseWriter, r *http.Request) {
		grantType := r.URL.Query().Get("grant_type")
		if grantType == "password" {
			var req struct {
				Email    string `json:"email"`
				Password string `json:"password"`
			}
			_ = json.NewDecoder(r.Body).Decode(&req)
			eNorm := strings.ToLower(strings.TrimSpace(req.Email))
			u, exists := usersDB[eNorm]
			if !exists || u["password"] != req.Password {
				w.WriteHeader(http.StatusBadRequest)
				_ = json.NewEncoder(w).Encode(map[string]string{"error_description": "Invalid login credentials"})
				return
			}

			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token":  "access-tok-" + u["id"].(string),
				"token_type":    "bearer",
				"expires_in":    3600,
				"refresh_token": "refresh-tok-" + u["id"].(string),
				"user": map[string]any{
					"id":    u["id"],
					"email": u["email"],
				},
			})
			return
		}

		if grantType == "refresh_token" {
			var req struct {
				RefreshToken string `json:"refresh_token"`
			}
			_ = json.NewDecoder(r.Body).Decode(&req)
			uid := strings.TrimPrefix(req.RefreshToken, "refresh-tok-")
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token":  "access-tok-" + uid,
				"token_type":    "bearer",
				"expires_in":    3600,
				"refresh_token": req.RefreshToken,
			})
			return
		}

		w.WriteHeader(http.StatusBadRequest)
	})

	fakeMux.HandleFunc("GET /auth/v1/user", func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		tok := strings.TrimPrefix(auth, "Bearer ")
		if !strings.HasPrefix(tok, "access-tok-") {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		uid := strings.TrimPrefix(tok, "access-tok-")
		// Encontrar correo
		email := ""
		for em, u := range usersDB {
			if u["id"] == uid {
				email = em
				break
			}
		}

		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":    uid,
			"email": email,
		})
	})

	go func() {
		log.Printf("[Fake Supabase Auth] Escuchando en http://localhost:%s\n", fakePort)
		_ = http.ListenAndServe(":"+fakePort, fakeMux)
	}()

	// 2. Iniciar Backend Go apuntando al Fake Supabase con ModoDemoActivo = false
	memStore := store.NewMemoryStore()
	adminEmails := []string{adminEmail}

	sc := supa.New("http://localhost:"+fakePort, "fake-service-role-key", "fake-anon-key")
	authVerifier := supa.NewSupabaseAuthVerifier(sc, memStore, adminEmails)

	api := httpapi.NewAPI(memStore, authVerifier, false) // Modo Demo estricto en FALSE
	handler := api.Routes()

	server := &http.Server{
		Addr:         ":" + apiPort,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	log.Printf("[Backend Go E2E] Escuchando en http://localhost:%s (Auth real contra Supabase)\n", apiPort)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}
}
