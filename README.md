# RConcept Systems — v2 (F0 Base y Chat del Equipo)

Sistema operativo interno de producción de contenido para **Rohlfing Concept**.

## 1. Qué es

Base del sistema y chat de coordinación para todo el equipo (camarógrafos, editores, subidores de contenido y administradores).
Diseñado bajo el patrón de arquitectura de **Globe**:
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript estricto, CSS Modules y diseño móvil primero con `compact-ui`.
- **Backend**: Go (librería estándar, sin dependencias externas pesadas) con interfaz `Store` (en memoria para desarrollo local / pruebas y cliente Supabase REST para producción).
- **Despliegue**: Vercel con dos servicios vinculados (`web` y `api`).

## 2. Puertos de desarrollo

- **Web (Next.js)**: puerto **3310** (`http://localhost:3310`)
- **API (Go)**: puerto **8310** (`http://localhost:8310`)

## 3. Cómo correr en local

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

## 4. Usuarios de prueba iniciales (Modo Memoria)

Al arrancar sin variables de Supabase, el backend inicializa automáticamente:
1. `admin-1` (correo: `admin@rconcept.com`) — Rol Administrador con oficios completos (Camarógrafo, Editor, Subidor).
2. `cam-1` (correo: `camarografo@rconcept.com`) — Miembro aprobado (Camarógrafo).
3. `pend-1` (correo: `nuevo@rconcept.com`) — Cuenta pendiente por aprobar.

Para ingresar desde `/login`, basta con ingresar cualquiera de estos correos o IDs.

## 5. Cómo aprobar al primer administrador

En producción con Supabase:
1. El correo del administrador debe estar incluido en la variable de entorno `ADMIN_EMAILS` (ej: `ADMIN_EMAILS=juanroblox89@gmail.com,admin@rconcept.com`).
2. Al registrarse e iniciar sesión por primera vez, el backend verifica `ADMIN_EMAILS`, aprueba automáticamente su cuenta y le asigna el flag `es_admin = true`.
3. Una vez dentro, el administrador puede ir a `/admin` para aprobar nuevos registros, asignar roles y configurar nuevos oficios.

## 6. Verificación y pruebas

- Pruebas unitarias backend: `cd backend; go test ./...; go vet ./...`
- Pruebas unitarias frontend: `npm test`
- Typecheck frontend: `npm run typecheck`
- Linter frontend: `npm run lint`
- Pruebas E2E completas: `node scripts/e2e.mjs` (genera capturas a 375px y 1280px en `_qa/f0/`).
- Migraciones a Supabase (cuando se cree el proyecto): `node scripts/migrar.mjs`
