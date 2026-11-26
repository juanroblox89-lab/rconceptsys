package httpapi

import (
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

const cuentaEquipoDriveDefecto = "ladlejuan26@gmail.com"

// ConfDrive es la configuración de Google Cloud para el conector de Drive.
type ConfDrive struct {
	ClientID     string
	ClientSecret string
	RedirectURI  string
	PickerKey    string
	PickerAppID  string
	CuentaEquipo string
}

// Configurado indica si hay credenciales de Google Cloud para conectar Drive.
func (c ConfDrive) Configurado() bool {
	return strings.TrimSpace(c.ClientID) != "" && strings.TrimSpace(c.ClientSecret) != ""
}

// CuentaEsperada devuelve el correo del equipo esperado para el conector de Drive.
func (c ConfDrive) CuentaEsperada() string {
	if v := strings.TrimSpace(c.CuentaEquipo); v != "" {
		return v
	}
	return cuentaEquipoDriveDefecto
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

type cacheElementoDrive struct {
	Nombre     string
	Mime       string
	EnPapelera bool
	Padres     []string
	DriveID    string
	Enlace     string
	Expira     time.Time
}

type cacheRootDrive struct {
	ID     string
	Nombre string
	Expira time.Time
}

// EstadoF5 guarda lo que no vive en la base: estados de OAuth en curso, caché
// corta de metadatos de Drive y configuración leída del entorno.
type EstadoF5 struct {
	DriveMu             sync.Mutex
	Mu                  sync.Mutex
	DriveCacheMu        sync.RWMutex
	DriveMetaCache      map[string]cacheElementoDrive
	DriveRootCache      map[string]cacheRootDrive
	UltimosAvisosPedido map[string]time.Time
	Estados             map[string]oauthState
	Drive               ConfDrive
	Push                ConfPush
	HTTP                *http.Client
}

// NuevoEstadoF5 lee las claves del entorno. Nunca se registran en logs.
func NuevoEstadoF5() *EstadoF5 {
	cuentaEquipo := strings.TrimSpace(os.Getenv("DRIVE_CUENTA_EQUIPO"))
	if cuentaEquipo == "" {
		cuentaEquipo = strings.TrimSpace(os.Getenv("NEXT_PUBLIC_DRIVE_CUENTA_EQUIPO"))
	}
	return &EstadoF5{
		Estados:             make(map[string]oauthState),
		DriveMetaCache:      make(map[string]cacheElementoDrive),
		DriveRootCache:      make(map[string]cacheRootDrive),
		UltimosAvisosPedido: make(map[string]time.Time),
		Drive: ConfDrive{
			ClientID:     strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_ID")),
			ClientSecret: strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_SECRET")),
			RedirectURI:  strings.TrimSpace(os.Getenv("GOOGLE_REDIRECT_URI")),
			PickerKey:    strings.TrimSpace(os.Getenv("GOOGLE_PICKER_API_KEY")),
			PickerAppID:  strings.TrimSpace(os.Getenv("GOOGLE_PICKER_APP_ID")),
			CuentaEquipo: cuentaEquipo,
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

const (
	ttlCacheDriveMeta = 2 * time.Minute
	maxCacheDriveMeta = 512
)

func (e *EstadoF5) obtenerMetaDriveCache(clave string) (cacheElementoDrive, bool) {
	e.DriveCacheMu.RLock()
	defer e.DriveCacheMu.RUnlock()
	item, ok := e.DriveMetaCache[clave]
	if !ok || time.Now().After(item.Expira) {
		return cacheElementoDrive{}, false
	}
	return item, true
}

func (e *EstadoF5) guardarMetaDriveCache(clave string, item cacheElementoDrive) {
	ahora := time.Now()
	item.Expira = ahora.Add(ttlCacheDriveMeta)
	e.DriveCacheMu.Lock()
	defer e.DriveCacheMu.Unlock()
	if e.DriveMetaCache == nil {
		e.DriveMetaCache = make(map[string]cacheElementoDrive)
	}
	if len(e.DriveMetaCache) >= maxCacheDriveMeta {
		for k, v := range e.DriveMetaCache {
			if ahora.After(v.Expira) {
				delete(e.DriveMetaCache, k)
			}
		}
		if len(e.DriveMetaCache) >= maxCacheDriveMeta {
			e.DriveMetaCache = make(map[string]cacheElementoDrive)
		}
	}
	e.DriveMetaCache[clave] = item
}

func (e *EstadoF5) obtenerRootDriveCache(clave string) (cacheRootDrive, bool) {
	e.DriveCacheMu.RLock()
	defer e.DriveCacheMu.RUnlock()
	item, ok := e.DriveRootCache[clave]
	if !ok || time.Now().After(item.Expira) {
		return cacheRootDrive{}, false
	}
	return item, true
}

func (e *EstadoF5) guardarRootDriveCache(clave string, item cacheRootDrive) {
	item.Expira = time.Now().Add(ttlCacheDriveMeta)
	e.DriveCacheMu.Lock()
	defer e.DriveCacheMu.Unlock()
	if e.DriveRootCache == nil {
		e.DriveRootCache = make(map[string]cacheRootDrive)
	}
	if len(e.DriveRootCache) >= 64 {
		e.DriveRootCache = make(map[string]cacheRootDrive)
	}
	e.DriveRootCache[clave] = item
}

// InvalidarCacheDrive limpia la caché de metadatos al conectar o desconectar Drive.
func (e *EstadoF5) InvalidarCacheDrive() {
	e.DriveCacheMu.Lock()
	defer e.DriveCacheMu.Unlock()
	e.DriveMetaCache = make(map[string]cacheElementoDrive)
	e.DriveRootCache = make(map[string]cacheRootDrive)
}

func (e *EstadoF5) puedeAvisarPedido(clave string, ventana time.Duration) bool {
	if e == nil || ventana <= 0 {
		return true
	}
	ahora := time.Now()
	e.Mu.Lock()
	defer e.Mu.Unlock()
	if e.UltimosAvisosPedido == nil {
		e.UltimosAvisosPedido = make(map[string]time.Time)
	}
	if expira, ok := e.UltimosAvisosPedido[clave]; ok && ahora.Before(expira) {
		return false
	}
	if len(e.UltimosAvisosPedido) > 512 {
		for k, exp := range e.UltimosAvisosPedido {
			if !ahora.Before(exp) {
				delete(e.UltimosAvisosPedido, k)
			}
		}
	}
	e.UltimosAvisosPedido[clave] = ahora.Add(ventana)
	return true
}
