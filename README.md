# RConcept Systems — v2 (desde cero)

Sistema interno de producción creativa de Rohlfing Concept. Se rehace desde cero (2026-09-26).
El sistema anterior quedó en el tag `legacy-v1`.

Se conservó (todo lo demás, incluida la base de datos, se rehace):
- `marca/` — logos e íconos.
- `contenido/formatos-y-hooks.js` — biblioteca de formatos y hooks del sistema anterior.

Nunca subir claves al repo: van en variables de entorno (`.env.local` / Vercel).
Ver `.env.example` para la lista completa (solo nombres, valores vacíos o localhost).

## Qué es

Panel interno (Next.js 16 + TS, App Router, CSS Modules, sin Tailwind) + API en Go.
Módulos: Inicio · Producción · Cobros · Clientes · Ventas · Biblioteca · Equipo · Mi perfil.
En F0 solo **Equipo** y **Mi perfil** funcionan; el resto muestra un estado vacío honesto
("Llega en la fase F1/F2/…").

## Estructura

```text
/                        (Next.js: app/  components/  lib/)
backend/                 (Go: cmd/server, internal/{auth,permisos,store,httpapi,actividad})
supabase/migrations/     (001_base.sql)
android/                 (Capacitor — PENDIENTE F0, ver abajo)
marca/  contenido/       (heredados, no tocar)
capacitor.config.ts      (wrapper Android)
vercel.json              (services web + api, como Globe)
.env.example             (nombres de variables, sin valores reales)
```

## Correr en local (F0)

Necesitas Go en PATH (`go version`) y Node 20+.

1. Copiar variables: `Copy-Item .env.example .env.local` (dejar Supabase vacío = modo demo).
2. Backend (puerto **8095**):
   ```powershell
   go run ./cmd/server
   # health: http://localhost:8095/health
   ```
3. Frontend (puerto **3300**, build de producción, nunca `next dev` colgado):
   ```powershell
   npm run build
   npx next start -p 3300
   ```
4. Abrir `http://localhost:3300`. Sin Supabase configurado aparece la **pantalla de modo demo**
   para elegir usuario: dueño / admin / equipo / pendiente.
5. Modo demo del backend: cabecera `X-Demo-User` con el id o email del usuario semilla
   (dueño, admin, equipo con oficios grabación+edición, pendiente). Sin `SUPABASE_URL`
   usa store en memoria. Al terminar, **matar ambos procesos**.

Roles demo: `dueno` (todo, único que edita tarifas y cierra cortes por defecto),
`admin` (gestiona equipo, no puede crear dueños), `equipo` (opera según sus oficios),
`pendiente` (ve "Esperando aprobación"), `desactivado` (sin acceso).

## Android / APK (Capacitor)

Estado F0: `capacitor.config.ts` existe (`appId: co.rohlfingconcept.rsys` placeholder,
`appName: "RConcept Systems"`, `webDir: www` —placeholder vacío documentado, porque el
frontend usa Next.js en modo servidor sin `output: "export"`—, `server.url` desde
`CAP_SERVER_URL`).
`android/` **aún no generado**: `package.json` ya existe pero `node_modules/next` todavía
no (el subagente frontend sigue con su `npm install`; por coordinación no se hacen
installs concurrentes para no corromper `node_modules`). Tampoco se instaló
`@capacitor/*` por la misma causa.

Pasos exactos cuando haya SDK (hacerlos una sola vez, en orden):

```powershell
# 1. Con package.json (next) ya creado por el frontend:
npm i -S @capacitor/core @capacitor/cli @capacitor/android

# 2. Inicializar (frontend en modo servidor: webDir www placeholder vacío;
#    la app cargará la URL remota vía server.url; si el frontend cambiara a
#    output:export, usar --web-dir=out):
npx cap init "RConcept Systems" co.rohlfingconcept.rsys --web-dir=www

# 3. Generar el proyecto nativo:
npx cap add android

# 4. Íconos/splash desde marca/ con Android Studio:
#    - Abrir android/ en Android Studio → clic derecho en app/res →
#      New → Image Asset → icono: marca/icon.svg (o logo-icon.svg).
#    - Splash: marca/splash.svg como drawable (o con la librería
#      @capacitor/splash-screen y la imagen en android/app/src/main/res/drawable/).
#    - Paleta: fondo #0A0A0A, acento según marca/.

# 5. Flujo de trabajo habitual:
npx cap sync android    # copia la web + actualiza plugins
npx cap open android    # abre Android Studio

# 6. APK release (con SDK + keystore configurado en Android Studio):
#    Build → Generate Signed Bundle / APK → APK → release.
```

Sin Android SDK en esta máquina: no se compila el APK en F0.

## Deploy

**No desplegado aún.** Configuración lista: `vercel.json` con services `web` (Next.js,
raíz, recibe `BACKEND_URL` por binding al servicio `api`) + `api` (Go, `backend/`),
igual que Globe. Cuando se despliegue, fijar en Vercel las 7 variables de
`.env.example` y apuntar `CAP_SERVER_URL` a la URL pública de la web.
