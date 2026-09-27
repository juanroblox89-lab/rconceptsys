// Package supa es un cliente mínimo de Supabase (PostgREST + Auth) sobre
// net/http, sin dependencias externas. Adaptado de Globe: usa la service_role
// key, así que saltea RLS y TODA consulta tiene que filtrar por el user_id
// verificado. No se trae nada de IA/planes de Globe, solo el patrón REST.
package supa

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type Client struct {
	baseURL    string
	serviceKey string
	http       *http.Client
}

// FromEnv devuelve nil si faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.
// Con nil el servidor arranca en modo demo (store en memoria).
func FromEnv() *Client {
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("SUPABASE_URL")), "/")
	key := strings.TrimSpace(os.Getenv("SUPABASE_SERVICE_ROLE_KEY"))
	if base == "" || key == "" {
		return nil
	}
	return &Client{baseURL: base, serviceKey: key, http: &http.Client{Timeout: 10 * time.Second}}
}

// Error es una respuesta no-2xx de Supabase. El cuerpo no se expone al usuario final.
type Error struct {
	Status int
	Body   string
}

func (e *Error) Error() string { return fmt.Sprintf("supabase: HTTP %d: %s", e.Status, e.Body) }

// REST hace un request a /rest/v1/<table>. query ya viene armado (url.Values),
// body se serializa a JSON si no es nil, out (si no es nil) recibe el JSON de
// respuesta. prefer admite p. ej. "return=representation".
func (c *Client) REST(ctx context.Context, method, table string, query url.Values, body any, prefer string, out any) error {
	u := c.baseURL + "/rest/v1/" + table
	if len(query) > 0 {
		u += "?" + query.Encode()
	}
	return c.do(ctx, method, u, body, prefer, out)
}

func (c *Client) do(ctx context.Context, method, u string, body any, prefer string, out any) error {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, u, rdr)
	if err != nil {
		return err
	}
	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Authorization", "Bearer "+c.serviceKey)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if prefer != "" {
		req.Header.Set("Prefer", prefer)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return &Error{Status: resp.StatusCode, Body: string(data)}
	}
	if out != nil && len(data) > 0 {
		return json.Unmarshal(data, out)
	}
	return nil
}

// UserFromToken valida un access token de sesión contra Supabase Auth
// (GET /auth/v1/user) y devuelve el id del usuario. Así no hace falta conocer
// el secreto/clave de firma JWT.
func (c *Client) UserFromToken(ctx context.Context, token string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/auth/v1/user", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", &Error{Status: resp.StatusCode, Body: "token inválido"}
	}
	var u struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&u); err != nil {
		return "", err
	}
	if u.ID == "" {
		return "", &Error{Status: 401, Body: "usuario vacío"}
	}
	return u.ID, nil
}

// AdminGetUser trae email + nombre vía Admin API (service_role). Solo se usa
// para registrar el primer ingreso (nombre/email iniciales); nunca se expone
// tal cual al cliente.
func (c *Client) AdminGetUser(ctx context.Context, userID string) (email, name string, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/auth/v1/admin/users/"+userID, nil)
	if err != nil {
		return "", "", err
	}
	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Authorization", "Bearer "+c.serviceKey)
	resp, err := c.http.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", "", &Error{Status: resp.StatusCode, Body: "usuario no encontrado"}
	}
	var u struct {
		Email        string         `json:"email"`
		UserMetadata map[string]any `json:"user_metadata"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&u); err != nil {
		return "", "", err
	}
	for _, k := range []string{"full_name", "name"} {
		if s, ok := u.UserMetadata[k].(string); ok && strings.TrimSpace(s) != "" {
			name = strings.TrimSpace(s)
			break
		}
	}
	return u.Email, name, nil
}
