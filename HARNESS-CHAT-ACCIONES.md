# HARNESS-CHAT-ACCIONES · Entrada pareja del chat, /ria y acciones por mensaje

**Commit código:** [`e0306493e955d374722bdf428b78dd7efa75ce`](https://github.com/juanroblox89-lab/rconceptsys/commit/e0306493e955d374722bdf428b78dd7efa75ce) · **Base previa:** `82bf92931648af3c8aad6beab6ae318b8114c00b` · **Rama:** `desde-cero` (`main` no modificada).

---

## Qué cambió

1. **Entrada pareja del chat a 44 px (en ambos chats y en todos los temas):**
   - `app/estilo/apariencia.css`: unifica las variables del compositor (`--rc-compositor-control: 44px`, `--rc-compositor-fuente: max(16px, var(--rc-fs-cuerpo))`, `--rc-compositor-linea: calc(... * 1.375)`, `--rc-compositor-relleno`) en `html:root` para Glass y RConcept claro/oscuro, restaura `align-items: flex-end` en `[data-rc-compositor]` y fuerza `height: 44px` + `white-space: nowrap` en `textarea:placeholder-shown`. También hace opacos los toasts flotantes fuera de Glass.
   - `app/(app)/chat.module.css`, `app/(app)/page.tsx`, `components/chat/adjuntos.module.css`: elimina el `width/height: 34px` en línea del botón Enviar y los `32/34px` de `+` y micrófono; quita `align-self: flex-start` heredado de `.rc-escena-vidrio` para que `+`, caja, micrófono y enviar midan exactamente `44 px` centrados en una línea y sigan alineados abajo con la última línea al crecer el texto; neutraliza `.composerCaja:focus-within` dentro de Glass.
   - `app/(app)/ria/ria.module.css`, `components/ComandosChat.tsx`: agrega `grid-template-columns: minmax(0, 1fr)` en `.chat` y `.pie` para evitar desbordes del placeholder en móvil 375 px sin Glass; unifica botones `.micro`/`.enviar` a `44 px`; habilita `autoAltura` en ambos chats y evita que el fallback `!CSS.supports("field-sizing", "content")` altere el `textarea` vacío.

2. **Comando `/ria` coherente en el chat del equipo:**
   - `lib/rutas-ria.ts`: agrega `/ria` al catálogo de comandos de navegación.
   - `app/(app)/page.tsx`: al escribir `/ria ...` aparece un aviso claro indicando que se abrirá en RIA privado (o usar `@RIA` para el grupo). Al enviar `/ria` o `/ria <texto>` sin adjuntos, no publica mensaje basura en `/api/chat` y redirige a `/ria` o `/ria?q=<texto>`.
   - `app/(app)/ria/page.tsx`: lee `?q=`, limpia la URL y envía la consulta automáticamente a RIA (y recorta `/ria ` si se escribe dentro del mismo chat privado).

3. **Acciones por mensaje al estilo WhatsApp (Copiar, Editar, Eliminar):**
   - `components/chat/AccionesMensaje.tsx` y `components/chat/AccionesMensaje.module.css`: botón `⋯` en escritorio (visible al pasar o enfocar) y pulsación larga (`430 ms`) en móvil táctil con hoja inferior, más editor en línea (`EditorMensaje`), marca `editado` (`MarcaEditado`) y barra corta `Mensaje eliminado · Deshacer` (`BarraDeshacer`, 6 s).
   - Chat del equipo (`app/(app)/page.tsx`): Copiar en cualquier mensaje con texto o enlace de Drive; Editar solo propios no-RIA; Eliminar propios o cualquiera si `es_admin`; confirmación en modal y deshacer corto.
   - Chat privado RIA (`app/(app)/ria/page.tsx`): Copiar también en respuestas de la IA; Editar y Eliminar solo en mensajes propios `rol = "user"`; `GuardarConversacionRIA` devuelve `pregunta_id` para editar/eliminar sin recargar.

4. **Backend Go, permisos y migración:**
   - `backend/internal/httpapi/handlers.go`: `PATCH /api/chat/{id}`, `DELETE /api/chat/{id}`, `POST /api/chat/{id}/restaurar`.
   - `backend/internal/httpapi/ria.go`: `PATCH /api/ria/{id}`, `DELETE /api/ria/{id}`, `POST /api/ria/{id}/restaurar`.
   - `backend/internal/store/{store,memory,ria}.go` y `backend/internal/supa/{store,ria}.go`: validan sesión aprobada, impiden editar ajenos (incluso siendo admin) e impiden editar mensajes de RIA (`es_ria = true` aunque `autor_id` coincida en BD); permiten borrar ajenos/RIA solo a `es_admin`; ventana de restauración de 30 s.
   - `supabase/migrations/024_chat_acciones_mensajes.sql` (idempotente) y `supabase/ORDEN.md`.

---

## Pruebas realmente ejecutadas (real vs mock)

| Prueba | Tipo | Resultado | Qué cubrió |
|---|---|---|---|
| `go build ./...`, `go vet ./...`, `go test -count=1 ./...` | **Real Go** (con `MemoryStore` + `httptest.Server` simulando PostgREST en `TestSupabaseStoreNoPermiteEditarNiBorrarRIAConAutorCoincidente`) | Verde (4 paquetes: `httpapi`, `store`, `supa`, `cmd/*`) | Compilación, análisis estático y permisos de servidor en `chat_acciones_test.go` (401 sin sesión, 403 pendiente/suspendido, 403 editar ajeno/admin/RIA/`assistant`, 200 editar propio, 200 borrar admin sobre ajeno/RIA, restaurar dentro de 30 s y 409 fuera de ventana). |
| `npm run typecheck` (`tsc --noEmit`) | **Real** | Verde (0 errores) | Tipado completo de frontend y componentes nuevos. |
| `npm run lint` (`eslint`) | **Real** | Verde (0 errores, 0 advertencias) | Reglas Next/React Compiler y lint del proyecto. |
| `npm test` (`tsx --test`) | **Real** (unitarias JS/TS) | Verde (8/8 pruebas) | Agrupación con `editado_en` y `es_ria`, enlaces Drive y `MenuAdjuntos`. |
| `npm run build` (`verificar-ria.mjs && next build`) | **Real** | Verde | Consistencia del manual RIA y compilación de producción Next 16. |
| `npm run mapa` | **Real** | Verde (114 endpoints, 27 tablas) | Validación de `docs/arquitectura/flujos.json` y regeneración de `mapa.json`/`mapa.html`. |
| `node scripts/qa-chat-acciones.mjs` en Edge headless con emulación Android Chrome (`375×480` teclado, `375×812`, `1280×800`, claro/oscuro, Glass y RConcept) + prueba adicional sin `field-sizing` y fuente `28 px` | **Real navegador + Mock API (`/api/*` interceptadas)** | Verde (8/8 combinaciones + fallback 28 px, 0 errores consola) | Altura exacta `44 px` en vacío, alineación `<= 1 px` al crecer multilínea (`>= 88 px`), `scrollWidth === viewport`, `/ria hola` sin basura en `/api/chat`, menú por pulsación larga móvil y `⋯` escritorio, copiar, editar (`editado`), eliminar con modal y `Deshacer`. |
| Base real de Supabase y dispositivo Android físico | **No ejecutado desde esta sesión** | Pendiente | Requiere aplicar migración `024` en Supabase y prueba en teléfono real sobre la preview de Vercel. |

Capturas e informe de medidas guardados localmente en [`capturas-chat-acciones/`](<capturas-chat-acciones/medidas.json>).

---

## ESTADO PARA RETOMAR

1. **Aplicar migración en Supabase (Juan/Elías):** ejecutar [`024_chat_acciones_mensajes.sql`](<supabase/migrations/024_chat_acciones_mensajes.sql>) en Supabase SQL Editor (es idempotente; segura de correr más de una vez).
2. **Validar en la preview de Vercel (rama `desde-cero`):** probar en celular Android real (teclado abierto, tema Glass y RConcept) la altura pareja de la barra de entrada, `/ria hola` desde el chat del equipo y Copiar / Editar / Eliminar + Deshacer en ambos chats.
3. **Promoción a `main`:** queda solo en `desde-cero` como pidió el brief; Elías decide cuándo llevarlo a `main`.
4. **Archivos ajenos respetados:** no se tocaron `.env*`, `Sensible\`, `AdminEquipo.tsx`, `components/chat/MenuAdjuntos.tsx` ni `asignacion_*.go`. Ningún servidor temporal quedó abierto (puerto `3332` verificado libre).
