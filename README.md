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
