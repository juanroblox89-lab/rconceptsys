# Informe Entrega por Drive o WhatsApp, Reversión y Adjuntos en Rechazo · RConcept Systems

**Publicado en `desde-cero`:** commit [`47d8b68`](https://github.com/juanroblox89-lab/rconceptsys/commit/47d8b68ca5ede2c62b891676c4b1c96dbf567086) (sin cambios en `main`).

- **«Marcar tarea como hecha» (Drive o WhatsApp):** selector segmentado entre **Entrega por Drive** (abre Google Picker para elegir carpeta o archivo, muestra tarjeta con nombre y botón **Quitar**, mantiene **Carpeta del trabajo** en solo lectura y **Pegar enlace manualmente** colapsado) y **Entrega por WhatsApp**. Para trabajadores, `GET /api/tareas/{id}/drive/picker-token` nunca entrega el token maestro de escritura del equipo (`auth/drive`): emite solo la configuración pública de selección `drive.file` sobre su propia sesión Google, manteniendo `/api/admin/drive/picker-token` exclusivo de administradores.
- **Bandeja del admin:** muestra **Abrir en Drive** (con el nombre del elemento elegido) o la etiqueta **Entregado por WhatsApp**.
- **Reversión atómica («Cambiar») y contraste:** en **Por revisar**, el trabajador puede pulsar **Cambiar** (`POST /api/tareas/{id}/revertir`), que revierte tarea y entrega en una sola transacción atómica e idempotente (devuelve `409` si ya fue aceptada, rechazada o retirada concurrentemente, deja `Entrega retirada por el trabajador` en el historial y avisa a los admins que la habían abierto) y reabre el modal prellenado. Se corrigió el contraste de **Tu nota:** a **6,98:1+** en claro, **13,26:1+** en oscuro y **16,53:1+** en Glass (`lib/fecha-entrega.ts` intacto).
- **Adjuntos en «Rechazar tarea»:** el modal permite adjuntar audio (grabado o subido), imágenes, video (reutilizando `EditorAdjuntos` y el pipeline privado de `asignaciones-adjuntos`) y elementos de Google Drive (reutilizando `abrirSelectorGoogleDrive` de `PickerDriveCliente.tsx` sin modificarlo), visibles para el trabajador en la tarjeta rechazada y en `/trabajos/[id]`.
- **Verificación:** `go build/vet/test` (incluidos tests de permisos y concurrencia con goroutines), `npm test`, `tsc --noEmit`, `eslint`, `next build`, `npm run mapa` y matriz Playwright Edge headless (`375×812` y `1280×800`, claro, oscuro y Glass) en verde. Quedan pendientes la aplicación de la [migración 025](<supabase/migrations/025_entrega_metodo_reversion_y_rechazo_adjuntos.sql>) en Supabase y prueba con cuenta Google real.

[Reporte técnico y estado para retomar](<HARNESS-ENTREGA.md>) · [Migración 025](<supabase/migrations/025_entrega_metodo_reversion_y_rechazo_adjuntos.sql>)

---

# Informe Chat: entrada pareja, /ria y acciones de mensajes · RConcept Systems

**Publicado en `desde-cero`:** commit [`e030649`](https://github.com/juanroblox89-lab/rconceptsys/commit/e0306493e955d374722bdf428b78dd7efa75ce) (sin cambios en `main`).

- **Entrada del chat pareja (44 px):** unificado el compositor de `/` y `/ria` en claro, oscuro, Glass y RConcept. La caja, `+`, micrófono y enviar miden exactamente `44 px` centrados en una línea (sin envolver placeholders ni desbordar en 375 px) y los botones se alinean con la última línea al crecer el texto.
- **`/ria` desde el chat del equipo:** al escribir `/ria` o `/ria <consulta>`, muestra un aviso claro y abre `/ria` enviando la consulta sin dejar mensajes basura en el chat del equipo (`@RIA` sigue respondiendo en el grupo).
- **Copiar, editar y eliminar (estilo WhatsApp):** pulsación larga en móvil y botón `⋯` en escritorio. Copiar disponible en cualquier mensaje (incluidas respuestas de RIA); Editar solo propios (marca `editado`); Eliminar propios o cualquiera para administradores, con modal de confirmación y barra `Deshacer` corta (6 s en interfaz / 30 s en servidor).
- **Backend y SQL:** endpoints `PATCH`/`DELETE`/`POST .../restaurar` para `/api/chat/{id}` y `/api/ria/{id}` con verificación de permisos en servidor, tests Go de permisos y migración idempotente [`024_chat_acciones_mensajes.sql`](<supabase/migrations/024_chat_acciones_mensajes.sql>).
- **Verificación:** `go build/vet/test`, `tsc --noEmit`, `eslint`, `npm test`, `next build`, `npm run mapa` y matriz Playwright headless (375×480 con emulación Android, 375×812 y 1280×800, claro/oscuro, Glass/RConcept) en verde. La base real de Supabase y teléfono físico quedan pendientes tras aplicar la migración 024.

[Reporte técnico y estado para retomar](<HARNESS-CHAT-ACCIONES.md>) · [Migración 024](<supabase/migrations/024_chat_acciones_mensajes.sql>)

---

# Informe F12 · RConcept Systems

**Punto 7:** [`a4a458c`](https://github.com/juanroblox89-lab/rconceptsys/commit/a4a458c38578d6a2e2aea282b23021f07a08aaa5), solo a `desde-cero`; [preview confirmada](https://rconceptsys-nuevo-qfkwud6sz-juanroblox89-labs-projects.vercel.app). En Glass, escribe `/` en RIA o en el chat del equipo para ver rutas por rol. Enter abre la sugerencia; Escape cierra el menú y deja enviar el comando como enlace azul. [Capturas del punto 7](<CAPTURAS-F12-ANEXO-7.zip>).

**Anexo 5–6:** [`8c415e3`](https://github.com/juanroblox89-lab/rconceptsys/commit/8c415e35270b4ef21ddbc97125efceb1263f3407), solo a `desde-cero`; [preview lista](https://rconceptsys-nuevo-lu2tm64cl-juanroblox89-labs-projects.vercel.app). Flotantes con 97% de opacidad sin destello inicial y compositores alineados, incluso con texto de 28 px. [Evidencia del anexo](<capturas-f12/INDICE.md#anexo-de-los-puntos-5-y-6>).

**F12:** [`0f62dbc`](https://github.com/juanroblox89-lab/rconceptsys/commit/0f62dbce9930e84ef66b4d9e12cd89196cbef074) en `desde-cero`, con [vista previa confirmada](https://rconceptsys-nuevo-fuh4ogdyb-juanroblox89-labs-projects.vercel.app).

**Producción:** esta sesión solo hizo push a `desde-cero`. Después hubo un [push separado a `main`](https://github.com/juanroblox89-lab/rconceptsys/actions/runs/45531999553) y Vercel [desplegó el mismo commit en producción](https://rconceptsys-nuevo-jovlgcs67-juanroblox89-labs-projects.vercel.app). No se promovió ni revirtió desde esta sesión.

- Glass deja ver más la foto: una sola capa de fondo, tinte neutro y 5% de oscurecido inicial. Los porcentajes guardados se respetan; se ajustan en **Personalización → Fondo Glass**.
- Notificaciones y menús casi opacos. Los botones de los chats de equipo y RIA quedan centrados con una línea y alineados abajo si la caja crece.
- QA headless a 375 y 1280 px, claro y oscuro. En RIA, Cortes y Configuración, la paleta base dio un mínimo de **5,49:1** en las combinaciones de contraste medidas. Pasaron TypeScript, lint, tests y mapa. El servidor temporal quedó cerrado.

[Reporte técnico](<HARNESS-REPORTE-F12.md>) · [Índice de capturas y mediciones](<capturas-f12/INDICE.md>)

---

# Informe F11 · RConcept Systems

**F11 publicado en `desde-cero`:** [`143386c`](https://github.com/juanroblox89-lab/rconceptsys/commit/143386cd9ed182a06c3ca9dfed6ab9b995010f88). [Preview de Vercel](https://rconceptsys-nuevo-v0t29w8s4-juanroblox89-labs-projects.vercel.app) confirmada; no se cambió producción.

- **Cortes:** PostgREST encontraba dos relaciones con `perfiles` y devolvía `PGRST201`. Ahora se indica la relación del participante y se distingue un listado vacío de un error. No hubo migración 024.
- **RIA y apariencia:** Ayuda no envía nada al abrir; hay cinco fichas, menú `/` por rol y Markdown con enlaces. Glass usa un solo desenfoque. Personalización tiene carga de fondo con miniatura y controles de color con vista previa.
- **Anexo:** se reemplazaron los controles nativos visibles en los flujos revisados, se alinearon Configuración y cabeceras, y Gestión muestra cómo desplazarse por las pestañas en móvil.
- **Pruebas:** lint, TypeScript, tests frontend, Go build/vet/test, mapa, matriz Edge headless y regresiones F9/F10. Se comprobó que Drive abre otro contexto sin reemplazar la app. **Pendiente:** validar el mismo gesto en la PWA instalada; Edge headless no pudo lanzarla y no hay APK en el repo.

[Reporte técnico con archivos y hashes por punto](<HARNESS-REPORTE-F11.md>) · [48 capturas y mediciones](<CAPTURAS-F11.zip>)

---

# Informe F10 · RConcept Systems

**Código publicado:** [`86c6410`](https://github.com/juanroblox89-lab/rconceptsys/commit/86c6410974264fa17d4d6bee617f8ebb7c47234e), solo en `desde-cero`. Vercel confirmó el despliegue de la rama. `main` no cambió.

- Al crear o editar puedes adjuntar hasta diez imágenes, videos o audios sin usar Drive. El formulario muestra vista previa, avance y confirmación para quitar archivos. Puedes grabar audio si el navegador permite usar el micrófono.
- El administrador y el asignado pueden ver, reproducir y descargar con enlaces temporales. El audio tiene resumen opcional en español y transcripción plegable. Si falla la IA, el original sigue disponible y se puede reintentar.
- **Verificado:** límites y permisos en Go, firmas y respaldo con dobles, regresión F9, ocho capturas headless, lint, tipos, Go build/vet/test y mapa. Gemini Flash transcribió un WAV sintético y devolvió tres viñetas. NVIDIA no se probó en vivo porque sus claves no estaban disponibles en la sesión.

**Para habilitarlo con datos reales:** confirmar la 022 y luego ejecutar la [migración 023](<supabase/migrations/023_asignaciones_adjuntos.sql>), que no se aplicó. Validar el cron, la firma, los límites y el respaldo en el entorno autorizado. Ningún servidor de QA quedó abierto.

[Reporte técnico y estado para retomar](<HARNESS-REPORTE-F10.md>) · [Capturas y mediciones](<CAPTURAS-F10.zip>)

---

# Informe F9 · RConcept Systems

**F9 verificado y publicado solo en `origin/desde-cero`:** [`40895e4`](https://github.com/juanroblox89-lab/rconceptsys/commit/40895e4920a40783996aaa6af786c34115dfecfa). `main` quedó intacta.

- **Asignaciones:** se agrega la carpeta del cliente automáticamente. El admin puede cambiarla, añadir archivos o carpetas hasta un total de tres y quitarlas con confirmación. El asignado puede abrir los enlaces, pero no editarlos. Los trabajos anteriores conservan su enlace.
- **Drive:** se reutiliza la raíz configurada y se vinculan las carpetas existentes por nombre normalizado. Solo se crean las carpetas de clientes que falten. El panel muestra el nombre real y permite simular con raíz y clientes en la misma carpeta.
- **QA:** pasaron lint, TypeScript, build/vet/tests Go y mapa. Hay 12 capturas en claro y oscuro a 375 y 1280 px. El QA fue simulado; no se operó sobre el Drive real.

**Entregables:** [reporte técnico](HARNESS-REPORTE-F9.md) · [capturas](CAPTURAS-F9.zip) · [migración 022](supabase/migrations/022_tareas_referencias_drive.sql).

**Pendiente de Elías:** aplicar la 022 (preparada en el portapapeles) antes de usar F9 con la base real y validar Picker y apertura con una cuenta autorizada. La migración no se aplicó desde esta sesión.

---

# Informe F8 · RConcept Systems

**Código verificado y enviado solo a `origin/desde-cero`:** `f8413fedd0693e4f0b57969b78265de103c30398`. Sin publicación a producción.

- Drive organizado bajo `RConcept`, con carpetas de clientes y trabajos. Traslados antiguos con simulación y confirmación separadas.
- Desconexión roja con Sí/No. El selector de referencias usa el Drive del equipo sin un segundo consentimiento. Los miembros consultan las fichas, pero no las editan; la foto de perfil propia quedó intacta.
- Pasaron lint, TypeScript, build/vet/tests Go y mapa. 40 capturas en dos tamaños y temas, con ambos roles. Google Picker se probó con un doble; no se accedió ni se movió nada en el Drive real.

**Tarea 6:** retirado el texto de relleno de Avisos y recortadas ayudas, estados vacíos, errores y toasts en toda la app. El inventario antes/después está en el reporte. La revisión headless dejó 48 capturas en `capturas-f8-textos/`.

**Entregables:** [reporte técnico](<HARNESS-REPORTE-F8.md>) · [capturas y mediciones](<capturas-f8/INDICE.md>) · [migración 021](<supabase/migrations/021_drive_organizado.sql>) · [orden de migraciones](<supabase/ORDEN.md>).

**Para Elías:** aplicar 021 antes del despliegue. Después validar el Picker real con la cuenta autorizada; en Gestión → Equipo, organizar y revisar la simulación antes de confirmar el traslado. La migración no mueve archivos.

---

# Informe F7 · RConcept Systems

## Cambios

- **RIA:** saludo centrado, sugerencia según rol, respuestas sin tarjeta, «Pensando», caja fija abajo y desplazamiento que sigue la respuesta sin arrastrar a quien subió a leer. El dictado deja el texto en la caja. Monograma nuevo en el chat privado y de equipo; la barra lateral conserva su icono y comportamiento por la regla de no modificarla.
- **Trabajos:** formulario común con **Especificaciones** desde Tareas, Trabajos y el perfil del miembro. Los listados comparten filas con avatar, estado, fecha y **Abrir**. El detalle muestra el historial disponible, permite editar según estado y pide confirmación para cancelar. La revisión de entregas sigue en la bandeja de Tareas.
- **Clientes:** búsqueda con lupa, una acción **Ver** por cliente, ficha y edición en páginas independientes. Las estadísticas se calculan en Go con los trabajos del cliente. La foto se carga a un bucket privado y Google Picker selecciona carpetas o archivos por título sin alterar la carpeta operativa. Se quitó **Paquete contratado** de la interfaz; la columna y los datos no se modificaron.

## Verificación

`npm run mapa`, `npm run lint`, `npm run typecheck`, `go build ./...`, `go vet ./...` y `go test ./...` pasaron. [48 capturas y mediciones](capturas-f7/INDICE.md) a 375×812 y 1280×800, en claro y oscuro. Ninguna de las pantallas medidas tuvo desborde horizontal. Las pruebas visuales usaron datos de prueba; Go se verificó aparte con el backend demo sobre memoria.

## Antes de desplegar

1. Aplicar [019_clientes_f7.sql](supabase/migrations/019_clientes_f7.sql) en Supabase. Es idempotente y no se ejecutó desde esta sesión.
2. Habilitar Google Picker en `rconcept-systems` y configurar `GOOGLE_PICKER_API_KEY`, `GOOGLE_PICKER_APP_ID` y los orígenes autorizados del cliente OAuth existente. La cuenta de Drive conectada debe poder abrir la referencia seleccionada.
3. Validar con cuenta real la selección de archivo y carpeta, una foto en Storage y un dictado con micrófono físico. También queda por comprobar RIA con su proveedor real; el QA automatizado usó una respuesta controlada.

Ver [HARNESS-REPORTE.md](HARNESS-REPORTE.md) para hashes y pasos para retomar. No se desplegó producción ni se tocó `main`. El informe anterior permanece en el historial Git.
