package httpapi

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"time"

	"rconceptsys/backend/internal/store"
)

// ==========================================================
// F5: avisos push (Web Push con VAPID).
//
// Los avisos se generan en tres momentos: tarea nueva, tarea que
// vence mañana y entrega aprobada. El cifrado sigue RFC 8291
// (aes128gcm) y la firma RFC 8292 (VAPID/ES256), con la librería
// estándar. Para la APK (Capacitor) queda el mismo endpoint: el
// puente nativo solo debe reenviar la suscripción al backend.
// ==========================================================

// AvisoPush es el contenido que recibe el service worker.
type AvisoPush struct {
	Titulo   string `json:"titulo"`
	Cuerpo   string `json:"cuerpo"`
	URL      string `json:"url"`
	Etiqueta string `json:"etiqueta,omitempty"`
}

const (
	registroBytes = 4096
	ttlPush       = 24 * 60 * 60
)

func b64url(s string) string { return base64.RawURLEncoding.EncodeToString([]byte(s)) }

// cifrarPushWeb cifra el contenido para una suscripción (RFC 8291).
// Es exportable para pruebas: descifrar lo que produce comprueba el cifrado.
func cifrarPushWeb(p256dhB64, authB64 string, mensaje []byte) ([]byte, error) {
	uaPubBytes, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(p256dhB64))
	if err != nil {
		return nil, fmt.Errorf("clave p256dh inválida: %w", err)
	}
	auth, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(authB64))
	if err != nil {
		return nil, fmt.Errorf("clave auth inválida: %w", err)
	}

	curva := ecdh.P256()
	uaPub, err := curva.NewPublicKey(uaPubBytes)
	if err != nil {
		return nil, fmt.Errorf("clave p256dh inválida: %w", err)
	}
	efimera, err := curva.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	secreto, err := efimera.ECDH(uaPub)
	if err != nil {
		return nil, err
	}
	asPub := efimera.PublicKey().Bytes()

	prkClave, err := hkdf.Extract(sha256.New, secreto, auth)
	if err != nil {
		return nil, err
	}
	info := make([]byte, 0, 14+len(uaPubBytes)+len(asPub))
	info = append(info, []byte("WebPush: info\x00")...)
	info = append(info, uaPubBytes...)
	info = append(info, asPub...)
	ikm, err := hkdf.Expand(sha256.New, prkClave, string(info), 32)
	if err != nil {
		return nil, err
	}

	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	prk, err := hkdf.Extract(sha256.New, ikm, salt)
	if err != nil {
		return nil, err
	}
	cek, err := hkdf.Expand(sha256.New, prk, "Content-Encoding: aes128gcm\x00", 16)
	if err != nil {
		return nil, err
	}
	nonce, err := hkdf.Expand(sha256.New, prk, "Content-Encoding: nonce\x00", 12)
	if err != nil {
		return nil, err
	}

	// Un solo registro: contenido || delimitador 0x02 (último registro).
	payload := make([]byte, 0, len(mensaje)+1)
	payload = append(payload, mensaje...)
	payload = append(payload, 0x02)

	bloque, err := aes.NewCipher(cek)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(bloque)
	if err != nil {
		return nil, err
	}
	cifrado := gcm.Seal(nil, nonce, payload, nil)

	cuerpo := make([]byte, 0, 16+4+1+len(asPub)+len(cifrado))
	cuerpo = append(cuerpo, salt...)
	cuerpo = binary.BigEndian.AppendUint32(cuerpo, registroBytes)
	cuerpo = append(cuerpo, byte(len(asPub)))
	cuerpo = append(cuerpo, asPub...)
	cuerpo = append(cuerpo, cifrado...)
	return cuerpo, nil
}

// cabeceraVAPID arma "vapid t=<jwt>, k=<clave pública>" (RFC 8292).
func cabeceraVAPID(endpoint, clavePublica, clavePrivada, asunto string) (string, error) {
	u, err := url.Parse(endpoint)
	if err != nil || u.Host == "" {
		return "", fmt.Errorf("endpoint inválido")
	}
	priv, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(clavePrivada))
	if err != nil || len(priv) != 32 {
		return "", fmt.Errorf("clave privada VAPID inválida")
	}
	curva := elliptic.P256()
	x, y := curva.ScalarBaseMult(priv)
	clave := &ecdsa.PrivateKey{
		PublicKey: ecdsa.PublicKey{Curve: curva, X: x, Y: y},
		D:         new(big.Int).SetBytes(priv),
	}
	if strings.TrimSpace(asunto) == "" {
		asunto = "mailto:hola@rconcept.com"
	}

	encabezado := b64url(`{"typ":"JWT","alg":"ES256"}`)
	reclamos, err := json.Marshal(map[string]any{
		"aud": fmt.Sprintf("%s://%s", u.Scheme, u.Host),
		"exp": time.Now().Add(12 * time.Hour).Unix(),
		"sub": asunto,
	})
	if err != nil {
		return "", err
	}
	sinFirma := encabezado + "." + b64url(string(reclamos))
	resumen := sha256.Sum256([]byte(sinFirma))
	r, s, err := ecdsa.Sign(rand.Reader, clave, resumen[:])
	if err != nil {
		return "", err
	}
	firma := make([]byte, 64)
	r.FillBytes(firma[:32])
	s.FillBytes(firma[32:])
	return "vapid t=" + sinFirma + "." + base64.RawURLEncoding.EncodeToString(firma) + ", k=" + strings.TrimSpace(clavePublica), nil
}

func endpointPushValido(endpoint string) bool {
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" || len(endpoint) > 800 {
		return false
	}
	h := strings.ToLower(u.Hostname())
	return h == "fcm.googleapis.com" || h == "updates.push.services.mozilla.com" ||
		h == "web.push.apple.com" || strings.HasSuffix(h, ".push.apple.com") ||
		h == "notify.windows.com" || strings.HasSuffix(h, ".notify.windows.com")
}

// enviarPush entrega un aviso a una suscripción.
func (a *API) enviarPush(ctx context.Context, suscripcion *store.SuscripcionPush, aviso AvisoPush) error {
	if !endpointPushValido(suscripcion.Endpoint) {
		return errPushVencido
	}
	if !a.F5.Push.Configurado() {
		return fmt.Errorf("push sin configurar")
	}
	carga, err := json.Marshal(aviso)
	if err != nil {
		return err
	}
	cuerpo, err := cifrarPushWeb(suscripcion.P256DH, suscripcion.Auth, carga)
	if err != nil {
		return err
	}
	autorizacion, err := cabeceraVAPID(suscripcion.Endpoint, a.F5.Push.Publica, a.F5.Push.Privada, a.F5.Push.Asunto)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, suscripcion.Endpoint, bytes.NewReader(cuerpo))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", autorizacion)
	req.Header.Set("Content-Encoding", "aes128gcm")
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("TTL", fmt.Sprintf("%d", ttlPush))
	req.Header.Set("Urgency", "high")

	cliente := *a.F5.HTTP
	cliente.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	res, err := cliente.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 4096))

	if res.StatusCode == http.StatusNotFound || res.StatusCode == http.StatusGone {
		// La suscripción murió: se borra para no reintentar.
		_ = a.Store.EliminarSuscripcionPush(ctx, suscripcion.Endpoint)
		return errPushVencido
	}
	if res.StatusCode >= 300 {
		return fmt.Errorf("push HTTP %d", res.StatusCode)
	}
	return nil
}

// AvisarTareaNueva avisa a la persona asignada que recibió una tarea.
func (a *API) AvisarTareaNueva(ctx context.Context, tarea *store.Tarea) {
	if tarea != nil {
		a.avisarTareaNueva(ctx, tarea, fmt.Sprintf("tarea:%d", tarea.ID))
	}
}

func (a *API) avisarTareaNueva(ctx context.Context, tarea *store.Tarea, clave string) {
	a.avisar(ctx, tarea.AsignadoA, AvisoPush{
		Titulo:   "Tarea nueva " + FechaEntrega(tarea.FechaLimite, time.Now()),
		Cuerpo:   cuerpoAvisoConGuion(datosAvisoTarea(tarea), tarea),
		URL:      urlTarea(tarea.ID),
		Etiqueta: "tarea-nueva",
	}, clave)
}

// AvisarEntregaAprobada avisa a la persona que su entrega quedó aprobada.
func (a *API) AvisarEntregaAprobada(ctx context.Context, tarea *store.Tarea) {
	if tarea == nil {
		return
	}
	clave := fmt.Sprintf("aprobada:%d", tarea.ID)
	if tarea.ResueltaEn != nil {
		clave += ":" + tarea.ResueltaEn.UTC().Format(time.RFC3339Nano)
	}
	a.avisar(ctx, tarea.AsignadoA, AvisoPush{
		Titulo:   "Entrega aprobada",
		Cuerpo:   recortar(tarea.Titulo, 90),
		URL:      urlTarea(tarea.ID),
		Etiqueta: "entrega-aprobada",
	}, clave)
}

// ---------- Endpoints ----------

// GET /api/push/clave
func (a *API) handleGetPushClave(w http.ResponseWriter, r *http.Request) {
	ResponderJSON(w, http.StatusOK, map[string]any{
		"configurado": a.F5.Push.Configurado(),
		"clave":       a.F5.Push.Publica,
	})
}

// GET /api/push/estado
func (a *API) handleGetPushEstado(w http.ResponseWriter, r *http.Request) {
	yo := a.usuarioActual(r)
	suscrito := false
	if yo != nil {
		lista, err := a.Store.ListarSuscripcionesPush(r.Context(), yo.ID)
		if err == nil && len(lista) > 0 {
			suscrito = true
		}
	}
	ResponderJSON(w, http.StatusOK, map[string]any{
		"configurado": a.F5.Push.Configurado(),
		"suscrito":    suscrito,
	})
}

// POST /api/push/suscribir
func (a *API) handlePostPushSuscribir(w http.ResponseWriter, r *http.Request) {
	yo := a.usuarioActual(r)
	var req struct {
		Endpoint string `json:"endpoint"`
		P256DH   string `json:"p256dh"`
		Auth     string `json:"auth"`
	}
	if err := leerJSONCuerpo(r, 1024*16, &req); err != nil {
		ResponderError(w, http.StatusBadRequest, "cuerpo_invalido", "Formato de datos inválido.")
		return
	}
	if !endpointPushValido(strings.TrimSpace(req.Endpoint)) {
		ResponderError(w, http.StatusBadRequest, "endpoint_invalido", "La suscripción del navegador no es válida.")
		return
	}
	agente := r.UserAgent()
	s, err := a.Store.GuardarSuscripcionPush(r.Context(), &store.SuscripcionPush{
		PerfilID:  yo.ID,
		Endpoint:  strings.TrimSpace(req.Endpoint),
		P256DH:    strings.TrimSpace(req.P256DH),
		Auth:      strings.TrimSpace(req.Auth),
		UserAgent: &agente,
	})
	if err != nil {
		ResponderError(w, http.StatusBadRequest, "suscripcion_invalida", "No se pudo guardar la suscripción a los avisos.")
		return
	}
	ResponderJSON(w, http.StatusCreated, s)
}

// DELETE /api/push/suscribir
func (a *API) handleDeletePushSuscribir(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Endpoint string `json:"endpoint"`
	}
	if err := leerJSONCuerpo(r, 1024*16, &req); err != nil || strings.TrimSpace(req.Endpoint) == "" {
		ResponderError(w, http.StatusBadRequest, "endpoint_requerido", "Falta el endpoint de la suscripción.")
		return
	}
	if err := a.Store.EliminarSuscripcionPush(r.Context(), strings.TrimSpace(req.Endpoint)); err != nil {
		ResponderError(w, http.StatusInternalServerError, "error_suscripcion", "No se pudo quitar la suscripción.")
		return
	}
	ResponderJSON(w, http.StatusOK, map[string]string{"mensaje": "Avisos desactivados en este dispositivo."})
}
