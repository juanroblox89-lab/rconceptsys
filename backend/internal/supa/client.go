// Package supa es un cliente mínimo de Supabase (PostgREST + Auth + Storage) sobre net/http, sin
// dependencias externas. Usa la service_role key.
package supa

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
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
	anonKey    string
	http       *http.Client
}

func FromEnv() *Client {
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("SUPABASE_URL")), "/")
	key := strings.TrimSpace(os.Getenv("SUPABASE_SERVICE_ROLE_KEY"))
	anon := strings.TrimSpace(os.Getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY"))
	if anon == "" {
		anon = strings.TrimSpace(os.Getenv("SUPABASE_ANON_KEY"))
	}
	if base == "" || key == "" {
		return nil
	}
	return New(base, key, anon)
}

func New(base, serviceKey, anonKey string) *Client {
	tr := http.DefaultTransport.(*http.Transport).Clone()
	tr.MaxIdleConnsPerHost = 32
	tr.MaxIdleConns = 64
	return &Client{
		baseURL:    strings.TrimRight(base, "/"),
		serviceKey: serviceKey,
		anonKey:    anonKey,
		http:       &http.Client{Timeout: 10 * time.Second, Transport: tr},
	}
}

// TokenResponse almacena la respuesta de token de Supabase Auth
type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token"`
	User         struct {
		ID    string `json:"id"`
		Email string `json:"email"`
	} `json:"user"`
}

// AdminCreateUser crea un usuario usando la Admin API de Supabase Auth
// POST /auth/v1/admin/users con email_confirm: true (sin enviar correos).
func (c *Client) AdminCreateUser(ctx context.Context, email, password, nombre string) (string, error) {
	u := c.baseURL + "/auth/v1/admin/users"
	payload := map[string]any{
		"email":         email,
		"password":      password,
		"email_confirm": true,
		"user_metadata": map[string]any{
			"nombre": nombre,
		},
	}

	var res struct {
		ID  string `json:"id"`
		Msg string `json:"msg"`
	}
	err := c.do(ctx, http.MethodPost, u, payload, "", &res)
	if err != nil {
		return "", err
	}
	if res.ID == "" {
		return "", errors.New("supabase: no se obtuvo id de usuario")
	}
	return res.ID, nil
}

// TokenPassword autentica al usuario contra {SUPABASE_URL}/auth/v1/token?grant_type=password con anonKey
func (c *Client) TokenPassword(ctx context.Context, email, password string) (*TokenResponse, error) {
	u := c.baseURL + "/auth/v1/token?grant_type=password"
	payload := map[string]string{
		"email":    email,
		"password": password,
	}

	b, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}

	key := c.anonKey
	if key == "" {
		key = c.serviceKey
	}

	req.Header.Set("apikey", key)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		rb, _ := io.ReadAll(resp.Body)
		return nil, &Error{Status: resp.StatusCode, Body: string(rb)}
	}

	var tok TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return nil, err
	}
	return &tok, nil
}

// TokenRefresh renueva el access_token usando {SUPABASE_URL}/auth/v1/token?grant_type=refresh_token
func (c *Client) TokenRefresh(ctx context.Context, refreshToken string) (*TokenResponse, error) {
	u := c.baseURL + "/auth/v1/token?grant_type=refresh_token"
	payload := map[string]string{
		"refresh_token": refreshToken,
	}

	b, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}

	key := c.anonKey
	if key == "" {
		key = c.serviceKey
	}

	req.Header.Set("apikey", key)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		rb, _ := io.ReadAll(resp.Body)
		return nil, &Error{Status: resp.StatusCode, Body: string(rb)}
	}

	var tok TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return nil, err
	}
	return &tok, nil
}

type Error struct {
	Status int
	Body   string
}

func (e *Error) Error() string {
	return fmt.Sprintf("supabase: HTTP %d: %s", e.Status, e.Body)
}

func (c *Client) REST(ctx context.Context, method, table string, query url.Values, body any, prefer string, out any) error {
	u := c.baseURL + "/rest/v1/" + table
	if len(query) > 0 {
		u += "?" + query.Encode()
	}
	return c.do(ctx, method, u, body, prefer, out)
}

func (c *Client) AuthUser(ctx context.Context, token string) (map[string]any, error) {
	u := c.baseURL + "/auth/v1/user"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("apikey", c.serviceKey)

	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(res.Body)
		return nil, &Error{Status: res.StatusCode, Body: string(b)}
	}

	var data map[string]any
	if err := json.NewDecoder(res.Body).Decode(&data); err != nil {
		return nil, err
	}
	return data, nil
}

func (c *Client) UploadStorage(ctx context.Context, bucket, objectPath string, data []byte, contentType string) error {
	u := fmt.Sprintf("%s/storage/v1/object/%s/%s", c.baseURL, bucket, objectPath)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.serviceKey)
	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Content-Type", contentType)

	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		b, _ := io.ReadAll(res.Body)
		return &Error{Status: res.StatusCode, Body: string(b)}
	}
	return nil
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
	req.Header.Set("Content-Type", "application/json")
	if prefer != "" {
		req.Header.Set("Prefer", prefer)
	}

	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		b, _ := io.ReadAll(res.Body)
		return &Error{Status: res.StatusCode, Body: string(b)}
	}

	if out != nil {
		return json.NewDecoder(res.Body).Decode(out)
	}
	return nil
}

func (c *Client) RPC(ctx context.Context, fn string, body any, out any) error {
	u := c.baseURL + "/rest/v1/rpc/" + fn
	return c.do(ctx, http.MethodPost, u, body, "", out)
}

func IsNotFound(err error) bool {
	var se *Error
	return errors.As(err, &se) && se.Status == http.StatusNotFound
}
