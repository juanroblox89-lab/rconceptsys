package httpapi

import (
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// ConfDrive es la configuración de Google Cloud para el conector de Drive.
type ConfDrive struct {
	ClientID     string
	ClientSecret string
	RedirectURI  string
	CarpetaRaiz  string
	PickerKey    string
	PickerAppID  string
}

// Configurado indica si hay credenciales de Google Cloud para conectar Drive.
func (c ConfDrive) Configurado() bool {
	return strings.TrimSpace(c.ClientID) != "" && strings.TrimSpace(c.ClientSecret) != ""
}

// ConfPush es la configuración de Web Push (claves VAPID).
type ConfPush struct {
	Publica string
	Privada string
	Asunto  string
}

// Configurado indica si hay claves VAPID para enviar avisos.
func (c ConfPush) Configurado() bool {
	return strings.TrimSpace(c.Publica) != "" && strings.TrimSpace(c.Privada) != ""
}

type oauthState struct {
	AdminID string
	Expira  time.Time
}

// EstadoF5 guarda lo que no vive en la base: estados de OAuth en curso y
// configuración de Google Drive y Web Push leída del entorno.
type EstadoF5 struct {
	Mu      sync.Mutex
	Estados map[string]oauthState
	Drive   ConfDrive
	Push    ConfPush
	HTTP    *http.Client
}

// NuevoEstadoF5 lee las claves del entorno. Nunca se registran en logs.
func NuevoEstadoF5() *EstadoF5 {
	return &EstadoF5{
		Estados: make(map[string]oauthState),
		Drive: ConfDrive{
			ClientID:     strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_ID")),
			ClientSecret: strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_SECRET")),
			RedirectURI:  strings.TrimSpace(os.Getenv("GOOGLE_REDIRECT_URI")),
			CarpetaRaiz:  strings.TrimSpace(os.Getenv("GOOGLE_DRIVE_CARPETA_RAIZ")),
			PickerKey:    strings.TrimSpace(os.Getenv("GOOGLE_PICKER_API_KEY")),
			PickerAppID:  strings.TrimSpace(os.Getenv("GOOGLE_PICKER_APP_ID")),
		},
		Push: ConfPush{
			Publica: strings.TrimSpace(os.Getenv("VAPID_CLAVE_PUBLICA")),
			Privada: strings.TrimSpace(os.Getenv("VAPID_CLAVE_PRIVADA")),
			Asunto:  strings.TrimSpace(os.Getenv("VAPID_ASUNTO")),
		},
		HTTP: &http.Client{Timeout: 15 * time.Second},
	}
}

// GuardarEstadoOAuth registra un state de OAuth válido por 10 minutos.
func (e *EstadoF5) GuardarEstadoOAuth(state, adminID string) {
	e.Mu.Lock()
	defer e.Mu.Unlock()
	ahora := time.Now()
	// Limpieza de estados viejos.
	for k, v := range e.Estados {
		if v.Expira.Before(ahora) {
			delete(e.Estados, k)
		}
	}
	e.Estados[state] = oauthState{AdminID: adminID, Expira: ahora.Add(10 * time.Minute)}
}

// ConsumirEstadoOAuth valida y borra un state (un solo uso).
func (e *EstadoF5) ConsumirEstadoOAuth(state string) (string, bool) {
	e.Mu.Lock()
	defer e.Mu.Unlock()
	v, ok := e.Estados[state]
	if !ok || v.Expira.Before(time.Now()) {
		delete(e.Estados, state)
		return "", false
	}
	delete(e.Estados, state)
	return v.AdminID, true
}
