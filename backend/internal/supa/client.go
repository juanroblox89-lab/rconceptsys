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
	http       *http.Client
}

func FromEnv() *Client {
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("SUPABASE_URL")), "/")
	key := strings.TrimSpace(os.Getenv("SUPABASE_SERVICE_ROLE_KEY"))
	if base == "" || key == "" {
		return nil
	}
	return New(base, key)
}

func New(base, key string) *Client {
	tr := http.DefaultTransport.(*http.Transport).Clone()
	tr.MaxIdleConnsPerHost = 32
	tr.MaxIdleConns = 64
	return &Client{
		baseURL:    strings.TrimRight(base, "/"),
		serviceKey: key,
		http:       &http.Client{Timeout: 10 * time.Second, Transport: tr},
	}
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

func IsNotFound(err error) bool {
	var se *Error
	return errors.As(err, &se) && se.Status == http.StatusNotFound
}
