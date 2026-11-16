package httpapi

import (
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
	"math/big"
	"strings"
	"testing"

	"rconceptsys/backend/internal/store"
)

// descifrarPushWeb deshace el cifrado como lo haría el navegador (RFC 8291).
func descifrarPushWeb(t *testing.T, cuerpo, uaPrivada, auth []byte) []byte {
	t.Helper()
	if len(cuerpo) < 21 {
		t.Fatalf("cuerpo demasiado corto: %d", len(cuerpo))
	}
	salt := cuerpo[:16]
	longRegistro := binary.BigEndian.Uint32(cuerpo[16:20])
	if longRegistro != registroBytes {
		t.Fatalf("rs inesperado: %d", longRegistro)
	}
	idLen := int(cuerpo[20])
	asPubBytes := cuerpo[21 : 21+idLen]
	texto := cuerpo[21+idLen:]

	curva := ecdh.P256()
	asPub, err := curva.NewPublicKey(asPubBytes)
	if err != nil {
		t.Fatalf("clave del servidor inválida: %v", err)
	}
	llave, err := curva.NewPrivateKey(uaPrivada)
	if err != nil {
		t.Fatalf("clave del usuario inválida: %v", err)
	}
	secreto, err := llave.ECDH(asPub)
	if err != nil {
		t.Fatalf("ECDH: %v", err)
	}
	uaPub := llave.PublicKey().Bytes()

	prkClave, err := hkdf.Extract(sha256.New, secreto, auth)
	if err != nil {
		t.Fatalf("extract: %v", err)
	}
	info := append([]byte("WebPush: info\x00"), uaPub...)
	info = append(info, asPubBytes...)
	ikm, err := hkdf.Expand(sha256.New, prkClave, string(info), 32)
	if err != nil {
		t.Fatalf("expand: %v", err)
	}
	prk, err := hkdf.Extract(sha256.New, ikm, salt)
	if err != nil {
		t.Fatalf("extract 2: %v", err)
	}
	cek, err := hkdf.Expand(sha256.New, prk, "Content-Encoding: aes128gcm\x00", 16)
	if err != nil {
		t.Fatalf("cek: %v", err)
	}
	nonce, err := hkdf.Expand(sha256.New, prk, "Content-Encoding: nonce\x00", 12)
	if err != nil {
		t.Fatalf("nonce: %v", err)
	}
	bloque, err := aes.NewCipher(cek)
	if err != nil {
		t.Fatalf("aes: %v", err)
	}
	gcm, err := cipher.NewGCM(bloque)
	if err != nil {
		t.Fatalf("gcm: %v", err)
	}
	claro, err := gcm.Open(nil, nonce, texto, nil)
	if err != nil {
		t.Fatalf("no se pudo descifrar: %v", err)
	}
	if len(claro) == 0 || claro[len(claro)-1] != 0x02 {
		t.Fatal("falta el delimitador de último registro")
	}
	return claro[:len(claro)-1]
}

// El cifrado de Web Push se puede descifrar con las claves del navegador.
func TestCifradoPushIdaYVuelta(t *testing.T) {
	curva := ecdh.P256()
	llave, err := curva.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generar llave: %v", err)
	}
	uaPub := llave.PublicKey().Bytes()
	auth := make([]byte, 16)
	if _, err := rand.Read(auth); err != nil {
		t.Fatalf("auth: %v", err)
	}

	mensaje := []byte(`{"titulo":"Tarea nueva","cuerpo":"Editar el reel del viernes","url":"/tareas"}`)
	cuerpo, err := cifrarPushWeb(
		base64.RawURLEncoding.EncodeToString(uaPub),
		base64.RawURLEncoding.EncodeToString(auth),
		mensaje,
	)
	if err != nil {
		t.Fatalf("cifrar: %v", err)
	}

	claro := descifrarPushWeb(t, cuerpo, llave.Bytes(), auth)
	if string(claro) != string(mensaje) {
		t.Fatalf("el contenido no coincide:\n%s\n%s", claro, mensaje)
	}

	var aviso AvisoPush
	if err := json.Unmarshal(claro, &aviso); err != nil {
		t.Fatalf("json del aviso: %v", err)
	}
	if aviso.URL != "/tareas" {
		t.Fatalf("url inesperada: %q", aviso.URL)
	}
}

// Cada cifrado usa una llave efímera distinta.
func TestCifradoPushEsAleatorio(t *testing.T) {
	curva := ecdh.P256()
	llave, _ := curva.GenerateKey(rand.Reader)
	pub := base64.RawURLEncoding.EncodeToString(llave.PublicKey().Bytes())
	auth := base64.RawURLEncoding.EncodeToString([]byte("0123456789abcdef"))

	a, err := cifrarPushWeb(pub, auth, []byte("hola"))
	if err != nil {
		t.Fatalf("cifrar a: %v", err)
	}
	b, err := cifrarPushWeb(pub, auth, []byte("hola"))
	if err != nil {
		t.Fatalf("cifrar b: %v", err)
	}
	if string(a) == string(b) {
		t.Fatal("dos cifrados del mismo mensaje no deben ser iguales")
	}
}

// La cabecera VAPID lleva un JWT ES256 válido y la clave pública.
func TestCabeceraVAPID(t *testing.T) {
	privBytes := make([]byte, 32)
	if _, err := rand.Read(privBytes); err != nil {
		t.Fatalf("privada: %v", err)
	}
	curva := elliptic.P256()
	x, y := curva.ScalarBaseMult(privBytes)
	pubBytes := elliptic.Marshal(curva, x, y)
	privB64 := base64.RawURLEncoding.EncodeToString(privBytes)
	pubB64 := base64.RawURLEncoding.EncodeToString(pubBytes)

	endpoint := "https://fcm.googleapis.com/fcm/send/ejemplo"
	cabecera, err := cabeceraVAPID(endpoint, pubB64, privB64, "mailto:dueño@rconcept.com")
	if err != nil {
		t.Fatalf("vapid: %v", err)
	}
	if !strings.HasPrefix(cabecera, "vapid t=") || !strings.Contains(cabecera, ", k="+pubB64) {
		t.Fatalf("formato inesperado: %s", cabecera)
	}

	jwt := strings.TrimPrefix(strings.Split(cabecera, ", k=")[0], "vapid t=")
	partes := strings.Split(jwt, ".")
	if len(partes) != 3 {
		t.Fatalf("jwt con %d partes", len(partes))
	}
	reclamosJSON, err := base64.RawURLEncoding.DecodeString(partes[1])
	if err != nil {
		t.Fatalf("claims: %v", err)
	}
	var reclamos map[string]any
	if err := json.Unmarshal(reclamosJSON, &reclamos); err != nil {
		t.Fatalf("claims json: %v", err)
	}
	if reclamos["aud"] != "https://fcm.googleapis.com" {
		t.Fatalf("aud inesperado: %v", reclamos["aud"])
	}
	if reclamos["sub"] != "mailto:dueño@rconcept.com" {
		t.Fatalf("sub inesperado: %v", reclamos["sub"])
	}

	firma, err := base64.RawURLEncoding.DecodeString(partes[2])
	if err != nil || len(firma) != 64 {
		t.Fatalf("firma inválida: %v (%d bytes)", err, len(firma))
	}
	resumen := sha256.Sum256([]byte(partes[0] + "." + partes[1]))
	clave := &ecdsa.PublicKey{Curve: curva, X: x, Y: y}
	r := new(big.Int).SetBytes(firma[:32])
	s := new(big.Int).SetBytes(firma[32:])
	if !ecdsa.Verify(clave, resumen[:], r, s) {
		t.Fatal("la firma del JWT no verifica")
	}
}

// El CSV y el PDF del corte salen con el formato esperado.
func TestExportacionesCorte(t *testing.T) {
	corte := &store.Corte{
		ID:      1,
		Periodo: "mes",
		Desde:   "2026-11-01",
		Hasta:   "2026-11-30",
		Estado:  "cerrado",
		Total:   75000,
		Lineas: []*store.LineaCorte{
			{PerfilID: "editor-id", Perfil: &store.Perfil{Nombre: "Eduardo Editor"}, Total: 75000, Tareas: 1},
		},
	}
	csv := CSVCorte(corte)
	if !strings.HasPrefix(csv, "Persona,Rol,Total,Tareas,Pagado\n") {
		t.Fatalf("csv sin cabecera: %q", csv)
	}
	if !strings.Contains(csv, "Eduardo Editor") || !strings.Contains(csv, ",75000,") {
		t.Fatalf("csv incompleto: %q", csv)
	}
	pdf := string(PDFCorte(corte))
	if !strings.HasPrefix(pdf, "%PDF-1.4") || !strings.Contains(pdf, "startxref") || !strings.HasSuffix(pdf, "%%EOF\n") {
		t.Fatalf("pdf mal formado")
	}
	if !strings.Contains(pdf, "Corte de pagos") {
		t.Fatal("el pdf debe titularse Corte de pagos")
	}
	if pesos(1234567) != "$1.234.567" || pesos(0) != "$0" {
		t.Fatalf("formato de pesos inesperado: %s / %s", pesos(1234567), pesos(0))
	}
}
