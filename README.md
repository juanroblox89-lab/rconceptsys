# RConcept Systems — v2 (F0b Auth Real + Base y Chat del Equipo)

Sistema operativo interno de producción de contenido para **Rohlfing Concept**.

## 1. Qué es

Base del sistema, autenticación real robusta y chat de coordinación para todo el equipo (camarógrafos, editores, subidores de contenido y administradores).
Diseñado bajo el patrón de arquitectura de **Globe**:
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript estricto, CSS Modules y diseño móvil primero con `compact-ui`. Autenticación mediante **cookies httpOnly** seguras (`SameSite=Lax`, `Secure` en HTTPS) gestionadas íntegramente por el backend (sin almacenamiento inseguro de tokens en localStorage). Formularios con toggle para ver/ocultar contraseñas.
- **Backend**: Go (librería estándar, sin dependencias externas pesadas) con interfaz `Store` (en memoria para desarrollo local / pruebas y cliente Supabase REST para producción).
- **Seguridad**: Service role key protegida exclusivamente en el backend Go (jamás expuesta en el navegador ni en variables públicas).
- **Despliegue**: Vercel con dos servicios vinculados (`web` y `api`).

## 2. Puertos de desarrollo

- **Web (Next.js)**: puerto **3310** (`http://localhost:3310`)
- **API (Go)**: puerto **8310** (`http://localhost:8310`)

## 3. Variables de Entorno

Configuradas en `.env.local` (local) o en el panel de Vercel:
- `SUPABASE_URL`: URL privada del proyecto Supabase (ej: `https://fjjhopqzfbmhzxtwfnmt.supabase.co`).
- `NEXT_PUBLIC_SUPABASE_URL`: URL pública de Supabase.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Llave anónima pública de Supabase.
- `SUPABASE_ANON_KEY`: Llave anónima en backend (usada para `/auth/v1/token?grant_type=password`).
- `SUPABASE_SERVICE_ROLE_KEY`: Service role privada de Supabase (usada solo por el backend para Admin API y bypass de RLS seguro).
- `ADMIN_EMAILS`: Correos autorizados como administradores (ej: `jestalvz@gmail.com,admin@rconcept.com`). Al registrarse, se aprueban automáticamente y se marcan como admin.
- `RC_MODO_DEMO`: `1` activa el modo demo en memoria. **Regla de seguridad estricta**: Si `SUPABASE_URL` está configurado y `RC_MODO_DEMO=1`, el backend falla de inmediato al arrancar. La cabecera `X-Demo-User` se ignora por completo fuera del modo demo.
- `NEXT_PUBLIC_RC_DEMO`: `1` solo si se desea enviar cabecera demo en clientes de prueba. Desactivado por defecto.

## 4. Endpoints de Autenticación (Backend Go)

- `POST /api/auth/registro`: Valida datos (nombre 2-60, correo válido, contraseña 10+ caracteres), crea usuario mediante Admin API de Supabase (`email_confirm: true`, sin correos) y perfil pendiente. Respuesta neutra en caso de conflicto. Límite de 25 intentos por 5 minutos por IP o correo.
- `POST /api/auth/login`: Autentica credenciales contra `{SUPABASE_URL}/auth/v1/token?grant_type=password` usando la anon key. Entrega sesión mediante cookies `rc_access_token` y `rc_refresh_token` con atributos `httpOnly`, `SameSite=Lax` y `Secure`.
- `POST /api/auth/refresh`: Renueva access token usando el refresh token de la cookie.
- `POST /api/auth/salir`: Borra cookies de sesión y revoca acceso.
- El middleware valida el token contra `/auth/v1/user` y refresca automáticamente si caducó. Soporta cookies y cabecera `Authorization: Bearer` (para Capacitor/Android).

## 5. Chat del Equipo (Polling Seguro sin supabase-js en el Navegador)

Para garantizar estabilidad y ligereza en esta fase previa al APK:
- El navegador consulta mensajes mediante **polling adaptativo**: cada **3 segundos** cuando la pestaña está visible y cada **15 segundos** cuando está en segundo plano (`visibilitychange`).
- Utiliza el parámetro `/api/chat?despues={id}` para traer únicamente mensajes nuevos posteriores al último ID recibido, evitando duplicados, saltos de scroll y sobrecarga de red.
- Conserva el indicador flotante *"N mensajes nuevos"* si el usuario no se encuentra al final de la conversación.

## 6. Cómo correr en local

### Backend (Go)
```powershell
cd backend
go run ./cmd/server
# Health check: http://localhost:8310/healthz
```

### Frontend (Next.js)
```powershell
npm run build
npx next start -p 3310
# O en desarrollo (un solo proceso a la vez):
# npx next dev -p 3310
```

## 7. Verificación y pruebas

- **Pruebas unitarias y de integración Go**: `cd backend; go test -count=1 ./...; go vet ./...`
- **Pruebas frontend**: `npm test`
- **Typecheck frontend**: `npm run typecheck`
- **Linter frontend**: `npm run lint`
- **Suite E2E Playwright con Auth Real y Fake Supabase Server**: `node scripts/e2e.mjs`
  - Ejecuta flujo completo de dos navegadores simultáneos: registro de nuevo usuario, intento fallido con contraseña incorrecta, aprobación por el admin con asignación de roles, verificación de bloqueo para cuentas pendientes, intercambio de mensajes en tiempo real vía polling y verificación de privacidad del correo de compañeros.
  - Genera capturas en `_qa/f0b/` a 375x812 y 1280x800.

## 8. Interfaz F7

- Trabajos: `/trabajos/nuevo` y `/trabajos/[id]` desde Tareas, Trabajos o el perfil de un miembro. Las entregas se revisan en la bandeja de Tareas.
- Clientes: `/clientes/[id]` se puede consultar con sesión aprobada; solo un administrador puede editar en `/clientes/[id]/editar`. Las fotos se guardan en el bucket privado `clientes-fotos`; la API autenticada sirve únicamente la foto vigente.
- Google Picker: habilitar **Google Picker API** en el proyecto `rconcept-systems`; configurar en el entorno de Go `GOOGLE_PICKER_APP_ID` (número de proyecto) y `GOOGLE_PICKER_API_KEY` (clave restringida a Picker API y a los orígenes web de RConcept). Autorizar esos orígenes en el cliente web `GOOGLE_CLIENT_ID` ya existente. En Gestión debe estar conectado el Drive del equipo y la referencia elegida debe ser visible para esa cuenta.
- F9: aplicar `supabase/migrations/022_tareas_referencias_drive.sql` antes de desplegar. Los trabajos admiten hasta tres referencias de Drive, con la carpeta del cliente como valor inicial. La carpeta que recibe entregas es independiente.
- En Gestión → Equipo, **Organizar Drive** reutiliza la raíz configurada y solo crea carpetas directas de clientes faltantes. **Simular movimientos** comprueba las carpetas históricas sin moverlas.
- El selector usa un access token temporal del Drive del equipo, solo para administradores; el refresh token queda en Go. El token conserva el alcance del OAuth de la cuenta conectada.
- QA visual F9: con un único Next local en `127.0.0.1:3319`, `node scripts/qa-f9.mjs` captura el formulario a 375 y 1280 px en claro y oscuro, con API y Picker simulados.
- QA visual F8 sin credenciales: con un único Next local en `127.0.0.1:3318`, `node scripts/qa-f8.mjs` usa Edge headless y dobles de la API y de Google Picker. Go se prueba por separado.

## 9. Adjuntos de la asignación (F10)

- Aplicar [023](supabase/migrations/023_asignaciones_adjuntos.sql) después de la 022. La carga usa fragmentos de 2 MiB, valida tamaño y bytes en Go y guarda el original en un bucket privado de Supabase. Las referencias y las carpetas de Drive no cambian.
- El asignado y los administradores pueden abrir el detalle; las descargas se firman por 90 s. Solo los administradores cambian adjuntos en trabajos pendientes o devueltos.
- El resumen de audio es opt-in. El cron de Supabase reutiliza `rconcept_cron_url` y `rconcept_cron_secret` de la 018. `CRON_SECRET` debe coincidir en Go. La URL de Vault tiene que apuntar al `/api/cron/notificaciones` del mismo entorno; la 023 usa su ruta hermana `/api/cron/adjuntos`.
- IA del backend: `NINEROUTER_BASE_URL`, `NINEROUTER_API_KEY` (Gemini Flash; opcional `ASIGNACIONES_MODELO_AUDIO_9ROUTER` o `ASIGNACIONES_FORMATO_AUDIO_9ROUTER=audio_url`), luego `NVIDIA_API_KEYS` / `NVIDIA_API_KEY` (ASR Parakeet; opcional `ASIGNACIONES_MODELO_ASR_NVIDIA`) y el respaldo de texto de RIA (`RIA_MODELO_RESPALDO`). Un fallo de IA no borra el audio.
- QA sin base real: `node scripts/qa-f10.mjs` con un único Next escuchando en `127.0.0.1:3320` y `QA_MEDIA_DIR` con `foto.png`, `corte.webm` y `voz.wav` sintéticos. Go se prueba aparte.

## 10. Ayuda, Glass y controles (F11)

- Ayuda abre RIA sin enviar; las fichas de orientación se resuelven sin llamar al proveedor. `/` muestra rutas según el rol.
- Glass conserva un solo plano de desenfoque. El nombre y peso de los fondos nuevos se guardan en el JSON existente; no se necesita migración nueva. Las migraciones 022 y 023 ya están aplicadas en producción.
- Las aperturas externas pasan por un componente común. La PWA tiene manifiesto `standalone`; el repositorio no contiene la APK ni una WebView nativa.
- QA visual reproducible: con un único Next oculto en `127.0.0.1:3321`, ejecuta `node scripts/qa-f11.mjs`. No requiere credenciales; prueba tamaños, temas, controles y navegación con dobles de la API.

## 11. Transparencia de Glass (F12)

- El fondo queda nítido alrededor del panel. Las tarjetas dan contraste al texto sin agregar desenfoque; los paneles flotantes son casi opacos.
- Los perfiles nuevos empiezan con 5% de oscurecido. Cambia el valor en **Personalización → Fondo Glass**. Los porcentajes guardados no se reemplazan.
- En Glass, escribe `/` en RIA o en el chat del equipo para ver las rutas disponibles para tu rol. **Enter** abre la sugerencia; **Escape** cierra la lista y permite enviar el comando como enlace con Enter. QA local: `node scripts/qa-f12-comandos.mjs` con un único Next oculto en `127.0.0.1:3332`.
