# Reporte F4 · Tareas: enlace de medios (Drive), correcciones y pulido de UI

Fecha: 2026-11-05 (America/Bogota, según reloj del sistema al ejecutar).
Rama: `desde-cero`. Entorno demo levantado por el agente: API `RC_MODO_DEMO=1 PORT=8310` + web `BACKEND_URL=http://127.0.0.1:8310 npx next dev -p 3310`.
Commits: 3 (backend, front, y este reporte con capturas y el ajuste de `/admin`). Sin `push --force`, sin tocar `.env*`.

## 1. Cambios

### Backend (`backend/`, commit `F4 backend: ...`)
- `internal/store/store.go`: campo nuevo `EnlaceMedios *string` (`json:"enlace_medios,omitempty"`) en `Tarea`; `MarcarTareaHecha` ahora recibe `enlaceMedios *string`.
- `internal/httpapi/handlers.go`:
  - `handlePostTareaHecha` acepta `enlace_medios` opcional. Validación `validarEnlaceDrive`: se recorta (normalización), vacío permitido, máximo 500 caracteres, esquema `https` y host en `drive.google.com`, `docs.google.com` o `drive.usercontent.google.com`. Rechazo `400 enlace_invalido` con mensaje en español.
  - `handleAdminPostTarea`: el aviso/título debe tener al menos 3 letras o dígitos (`400 aviso_invalido`: "El aviso debe tener al menos 3 letras o números. Escribe un aviso más completo."). `store.ContarLetrasDigitos` (unicode) se reutiliza en memoria.
  - Alias de estado: `normalizarEstadoTarea` mapea `por_revisar` -> `hecha` en `GET /api/admin/tareas` y `GET /api/tareas`. La bandeja correcta siempre fue `hecha` (la usan el Sidebar y los tests F2); `por_revisar` no existía como estado y devolvía 0.
- `internal/store/memory.go`: persiste `EnlaceMedios` (recortado; vacío = `nil`); precios semilla realistas COP (solo memoria): `grabacion_video` 1500/min, `edicion_video` 75000/trabajo, `subida_video` 25000/trabajo; `CrearTarea` rechaza aviso con <3 letras/dígitos.
- `internal/supa/store.go`: `dbTarea.EnlaceMedios`, mapeo en la conversión y `enlace_medios` en el payload de `MarcarTareaHecha` (los `select` ya eran `*`, quedan cubiertos).
- `supabase/migrations/005_enlace_medios_tareas.sql` (nueva): `alter table if exists public.tareas add column if not exists enlace_medios text;` + comentario.
- Tests: `backend/internal/httpapi/f4_test.go` (6 tests nuevos). Ajustes necesarios en `f3_test.go`: títulos de prueba "T1/T2/T3/TC" (2 caracteres) pasaron a títulos válidos y llamadas a `MarcarTareaHecha` con el nuevo parámetro `nil`.

### Front (`lib/`, `components/`, `app/`, commit `F4 front: ...` + ajuste `/admin`)
- `lib/types.ts`: `enlace_medios?: string | null` en `Tarea`. `lib/api.ts`: `postTareaHecha(id, nota, cantidad, enlaceMedios?)`.
- `components/ui/EnlaceDrive.tsx` (nuevo): `errorEnlaceDrive` (mismas reglas que el backend) y componente `EnlaceDrive` ("Abrir en Drive", `target="_blank" rel="noopener noreferrer"`).
- `components/MisTareas.tsx`: campo "Enlace de Drive (opcional)" en el modal "Marcar como hecha" con validación en vivo y ayuda "Comparte la carpeta con permiso de lector y pega aquí el enlace."; el enlace se muestra en la tarjeta de la tarea.
- `components/AdminTareas.tsx`: validación de aviso >=3 letras/dígitos con error en línea y contador de caracteres (x/1000) en "Nueva tarea" (solo persona + aviso + Crear/Cancelar, sin campos nuevos); "Abrir en Drive" en la bandeja por revisar, la tabla de escritorio y la tarjeta móvil.
- `app/(app)/admin/page.tsx`: la bandeja real de `/admin` duplica la lógica de `AdminTareas`; se agregó "Abrir en Drive" en su bandeja, tabla y tarjeta móvil para que el flujo se vea en la pantalla del admin. Su formulario de nueva tarea usa tipo+persona+título y queda cubierto por la validación del backend (400 con mensaje).
- Pulido: `app/(app)/perfil/perfil.module.css` (la sección de avatar envuelve en móvil) y `app/(app)/equipo/equipo.module.css` (nombres largos con `overflow-wrap`). Foco visible ya estaba limitado a enlaces/botones en `app/globals.css` (sin cambios). Estados vacíos y skeletons ya existían en tareas, equipo y perfil (sin cambios).

## 2. Verificación E2E (demo real, API 8310 + web 3310)

Recorrido ejecutado contra el servidor demo (`admin-1` / `cam-1`, semilla de `cmd/server/main.go`):

| Paso | Resultado real |
|---|---|
| Admin crea tarea tipo 1 (grabación/minuto) | `201`, `id=1`, `estado=pendiente` |
| Trabajador marca hecha, 60 min + enlace Drive | `200`, `estado=hecha`, `enlace_medios=https://drive.google.com/drive/folders/1F4demo` |
| `GET /api/admin/tareas?estado=por_revisar` | `200`, `por_revisar=1`, 1 tarea, con enlace (antes devolvía 0) |
| `GET /api/admin/tareas?estado=hecha` | `200`, `por_revisar=1`, 1 tarea |
| Admin acepta | `200`, `aceptada`, `precio_congelado=90000` (1500 x 60), `factura_id=1` |
| `GET /api/facturas/mia` (trabajador) | `total_pendiente=90000`, 1 línea (antes 0 con precio semilla 0) |
| Aviso `,` | `400 aviso_invalido` "El aviso debe tener al menos 3 letras o números..." |
| Enlace host ajeno (`example.com`) | `400 enlace_invalido` |
| Enlace `http://` sin TLS | `400 enlace_invalido` |
| Marcar hecha sin enlace | `200`, permitido |
| Rechazo | `200`, `rechazada`; reenvío con enlace `docs.google.com` -> `hecha` |
| Cancelar | `200`, `cancelada` |
| `GET /api/trabajos` | precios semilla: grabación 1500/min, edición 75000/trabajo, subida 25000/trabajo |
| Primera tarea de la sesión | `id=1`; la segunda `id=2`, sin colisión (confirmado también en test) |

Capturas (Playwright/Chromium, `capturas-f4/`, full page):
`admin-tareas-1280.png`, `admin-tareas-375.png`, `trabajador-tareas-1280.png`, `trabajador-tareas-375.png`, `trabajador-equipo-375.png`, `trabajador-perfil-375.png`.
Desborde horizontal medido por DOM (`scrollWidth - clientWidth`): **0 px en las 6 capturas**. Verificación por DOM: "Abrir en Drive" presente en `/tareas` (admin y trabajador), sin skeleton colgado en `/equipo` y `/perfil`. Nota: el modelo de este agente no puede ver imágenes, así que la revisión visual fue por métricas DOM (desborde, presencia de texto/enlaces), no inspección de píxeles.

## 3. Números de tests y build

- `go test -count=1 ./...` en `backend/`: **ok** en `internal/httpapi` (2.364 s) e `internal/store` (1.236 s). **31 tests PASS** en `internal/httpapi` (incluidos los 6 F4: enlace válido, enlace inválido, enlace vacío, aviso inválido, precios semilla/factura, primer id), 0 FAIL.
- `npx tsc --noEmit`: exit **0**. `npm run lint`: exit **0**. `npm run build`: exit **0** (13 rutas).

## 4. Qué falló / limitaciones encontradas

- El primer intento de capturas del trabajador en `http://127.0.0.1:3310` dejó la página en skeleton: en ese host no se disparó ninguna petición `/api` (hidratación dev bloqueada). Se repitieron las capturas en `http://localhost:3310` (misma app, sesiones separadas por cookie como indica el brief) y quedaron correctas. El script quedó en `capturas-f4/capturar-f4.cjs` con la nota.
- Playwright 1.64.1 esperaba Chromium 1248 y solo existía 1243: se usó `executablePath` al binario 1243 sin descargar nada.
- `f3_test.go` usaba títulos de 2 caracteres ("T1", "TC"); con la nueva regla de aviso debieronrenombrarse (cambio de datos de prueba, no de lógica).
- Un `python -c` con comillas escapadas falló por sintaxis; se resolvió con ediciones directas.

## 5. Pendiente / fuera de alcance

- Migración `005` no aplicada a Supabase de producción (fuera de alcance por brief); el campo `enlace_medios` en `supa/store.go` asume la columna tras aplicar la migración.
- Duplicación entre `components/AdminTareas.tsx` y `app/(app)/admin/page.tsx` (bandeja, listado, nueva tarea): F4 agregó el enlace en ambas, pero la unificación en un solo componente queda pendiente.
- Verificación visual de píxeles 375/1280 (claro/oscuro): hecha por métricas DOM; falta revisión a ojo del dueño, en especial el modo oscuro (no se capturó variante oscura).
- El formulario "Nueva tarea" de `/admin` (tipo+persona+título) no tiene contador de caracteres en línea; la validación de aviso llega del backend (400). El formulario de `AdminTareas` sí quedó con contador y error en línea.
