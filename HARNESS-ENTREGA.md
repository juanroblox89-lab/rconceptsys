# HARNESS-ENTREGA · Entrega por Drive o WhatsApp, reversión atómica y adjuntos en rechazo

- **Rama:** `desde-cero` (`main` sin cambios; promoción a `main` queda para Elías)
- **SHA del código:** `47d8b68ca5ede2c62b891676c4b1c96dbf567086`
- **Base previa:** `2394528` (`HARNESS-CHAT-ACCIONES.md`)
- **Migración SQL:** [`025_entrega_metodo_reversion_y_rechazo_adjuntos.sql`](<supabase/migrations/025_entrega_metodo_reversion_y_rechazo_adjuntos.sql>) (SHA-256: `684513ad17a362e1ba9b2174c941397e60ddc9443ec8768d5e2e76f5c2a83d12`, idempotente; registrada en [`supabase/ORDEN.md`](<supabase/ORDEN.md>))
- **Archivos ajenos respetados:** No se tocaron `.env*`, `Sensible\`, `components/chat/MenuAdjuntos.tsx`, `components/admin/AdminEquipo.tsx`, `components/PickerDriveCliente.tsx`, `lib/fecha-entrega.ts`, `ComandosChat.tsx`, `app/(app)/page.tsx` ni `app/(app)/ria/page.tsx`.

---

## 1. Qué se implementó

### A. Entrega por Drive o por WhatsApp (`components/MisTareas.tsx`, `lib/picker-trabajador.ts`, `backend/internal/httpapi/drive_entrega_trabajador.go`, `handlers.go`)
1. **Selector segmentado en «Marcar tarea como hecha»:**
   - Opciones accesibles (`role="radiogroup"`, navegación con teclado `ArrowLeft`/`ArrowRight` y clic): **«Entrega por Drive»** y **«Entrega por WhatsApp»**.
   - **Entrega por Drive:** botón **«Elegir de Drive»** que abre Google Picker (permitiendo elegir **carpeta o archivo**), muestra la tarjeta del elemento seleccionado con nombre, icono/tipo (`Carpeta de Drive` / `Archivo de Drive`), botón `Abrir` y botón `Quitar`. Mantiene **«Pegar enlace manualmente»** colapsado como alternativa secundaria, más **«Carpeta del trabajo»** (explorador de solo lectura por proxy backend cuando la tarea tiene carpetas autorizadas). Al enviar guarda `metodo_entrega = "drive"`, `enlace_medios`, `entrega_nombre` y `entrega_tipo` (`carpeta` | `archivo`).
   - **Entrega por WhatsApp:** oculta el selector de Drive, muestra aviso corto y nota opcional (`0 / 500`), y registra `metodo_entrega = "whatsapp"` limpiando cualquier enlace previo de Drive.
2. **Decisión de seguridad documentada para Google Picker de trabajadores:**
   - `/api/admin/drive/picker-token` se mantiene estrictamente solo admin (`403` para miembros), porque el conector OAuth del equipo (`drive_conexion`) usa el scope completo `https://www.googleapis.com/auth/drive` (lectura/escritura/borrado).
   - Se creó `GET /api/tareas/{id}/drive/picker-token` (`MiddlewareAuth(..., true, false)` + validación de asignación `tarea.AsignadoA == yo.ID || yo.EsAdmin`): **nunca** entrega `refresh_token`, `client_secret` ni el `access_token` de escritura del equipo al navegador. Entrega la configuración pública del selector (`client_id`, `clave`, `proyecto_id`, `scope: "https://www.googleapis.com/auth/drive.file"`) para que el trabajador autorice en su propia sesión Google (Mi unidad y Compartidos conmigo) en modo solo-selección.
   - Adicionalmente, `GET /api/tareas/{id}/drive/archivos` ofrece lectura segura desde servidor acotada exclusivamente a `tarea.DriveCarpetaID` y carpetas de `tarea.DriveReferencias` (verificando cadena de padres y bloqueando con `403` cualquier carpeta externa al trabajo).
   - En `SincronizarEntregaConDrive` (`drive.go`), si el método es `whatsapp` o `entrega_tipo == "carpeta"`, no se intenta copiar carpeta/archivo.
3. **Vista en revisión (Admin):**
   - En la bandeja de revisión (`components/AdminTareas.tsx`) y en `/trabajos/[id]` (`components/PaginaTrabajo.tsx`), cada entrega muestra **«Abrir en Drive»** (junto al nombre/tipo elegido) o la etiqueta **«Entregado por WhatsApp»**.

### B. Reversión atómica de entrega («Cambiar») e historial (`rc_revertir_entrega_tarea`, `MisTareas.tsx`, `tareas.module.css`)
1. **Botón «Cambiar» en «Por revisar» (`estado === "hecha"`):**
   - Devuelve la tarea a `pendiente` y abre el modal prellenado con la entrega retirada (`borrador_entrega`: método, selección Drive, nota y minutos) sin dejar estados intermedios visibles.
2. **Transacción atómica e idempotente (`POST /api/tareas/{id}/revertir`):**
   - Solo el responsable asignado (`tarea.AsignadoA == yo.ID`) puede revertir (`403` para ajenos e incluso admins no dueños).
   - En PostgreSQL (`rc_revertir_entrega_tarea`, `FOR UPDATE` + `UPDATE ... WHERE id = p_tarea AND estado = 'hecha'`) y en `MemoryStore`: actualiza de forma atómica ambas partes (`tareas` y `tarea_entregas`), marca la entrega activa como `retirada`, registra **`Entrega retirada por el trabajador`** en `tarea_historial` sin borrar auditoría, y garantiza mediante índice único parcial (`idx_tarea_entregas_una_activa`) que nunca existan dos entregas activas ni filas huérfanas al reenviar.
   - Si ya fue aceptada, rechazada o retirada concurrentemente (doble clic / doble pestaña), devuelve **`409 Conflict`** en lenguaje humano y la interfaz sincroniza el estado real.
   - Si algún admin ya había visto la entrega (`asignaciones_vistas` desde `hecha_en`, también registrado al abrir `GET /api/admin/tareas/{id}`), se le encola aviso `entrega-retirada`.
3. **Contraste WCAG AA de «Tu nota:» (`tareas.module.css`, `admin.module.css`):**
   - Se corrigió `--rc-azul-fondo` indefinido fuera de Glass y el color claro de `--rc-azul-texto` sobre fondo claro usando `var(--rc-azul-fondo, var(--rc-azul-suave))`, texto `var(--rc-texto)` y etiqueta `var(--rc-comando-texto, light-dark(#134e9b, #cfe5ff))`. Medido en navegador: **6,98:1** (`Tu nota:`) / **13,37:1** (texto) en claro, **13,26:1** / **15,11:1** en oscuro y **16,53:1** / **19,42:1** en Glass. (`lib/fecha-entrega.ts` no se tocó).

### C. Adjuntos multimedia y de Drive en «Rechazar tarea» (`AdminTareas.tsx`, `AdjuntosAsignacion.tsx`, `PaginaTrabajo.tsx`, `Modal.tsx`)
1. **Modal «Rechazar tarea» (`components/AdminTareas.tsx`):**
   - Además del motivo obligatorio (`1..500`), permite adjuntar **audio (grabado con MediaRecorder o subido), imágenes y video** reutilizando `EditorAdjuntos` y el pipeline F10 (`asignaciones-adjuntos`, `origen = "rechazo"`, `historial_id`, 10 MB imagen / 50 MB video / 25 MB audio), y **elementos de Google Drive** (hasta 5) reutilizando `abrirSelectorGoogleDrive` de `PickerDriveCliente.tsx` sin modificarlo.
   - Si falla la subida de un archivo tras guardar el rechazo, conserva `rechazoGuardadoId` para reintentar o quitar sin duplicar el rechazo.
2. **Modal accesible (`components/ui/Modal.tsx`, `componentes.css`, `apariencia.css`):**
   - Manejo de `Escape` (respetando diálogos de Google Picker encima), restauración de foco al cerrar y pie de acciones fijo con scroll interno en pantallas pequeñas.
3. **Visibilidad para el trabajador (`MisTareas.tsx`, `PaginaTrabajo.tsx`, `AdjuntosAsignacion.tsx`):**
   - La tarjeta rechazada en **Mis tareas** y la línea de tiempo en `/trabajos/[id]` muestran motivo, botones **«Abrir en Drive»** y vista previa / reproducción / descarga firmada (`AdjuntosRechazoVista`) reutilizando `adjuntos.firma`.

---

## 2. Pruebas ejecutadas (distinción Real vs Mock)

| Prueba | Tipo (Real / Mock) | Resultado | Qué cubrió |
|---|---|---|---|
| `cd backend && go build ./... && go vet ./...` | **Real** (compilación y análisis estático Go) | ✅ OK | Todo el backend Go compila sin advertencias |
| `cd backend && go test -count=1 ./...` | **Real Go** (`MemoryStore` + `httptest.Server` doble HTTP de Drive/PostgREST) | ✅ OK (`httpapi`, `store`, `supa`) | `TestEntregaDriveYWhatsAppYValidacion`, `TestPickerTrabajadorPermisosYProxyCarpeta`, `TestReversionEntregaAtomicaPermisosYNotificacion`, `TestConcurrenciaReversionYAceptacion` (doble reversión, 20 rondas reversión vs aceptación, 10 rondas reversión vs rechazo), `TestRechazoConAdjuntosMultimediaYDrive`, `TestSupabaseStoreEntregaReversionYRechazoRPC`, `TestManualRIAContieneRutas` |
| `npm test` | **Real** (`tsx --test`) | ✅ 8/8 OK | Utilidades de chat y enlaces Drive |
| `npm run typecheck` | **Real** (`tsc --noEmit`) | ✅ OK (0 errores) | Tipado completo TypeScript |
| `npm run lint` | **Real** (`eslint`) | ✅ OK (0 errores, 0 warnings) | Reglas Next/React/ESLint |
| `npm run build` | **Real** (`verificar-ria.mjs && next build`) | ✅ OK | Consistencia de manuales RIA y build de producción (22 rutas) |
| `npm run mapa` | **Real** (`scripts/generar-mapa.mjs`) | ✅ OK (117 endpoints, 29 tablas, 41 vars) | Validación `archivo:función` en `flujos.json` y regeneración de `mapa.json`/`mapa.html` |
| `node scripts/qa-entrega-drive-whatsapp.mjs` contra `next start -p 3336` | **Real navegador Edge headless** + **Mock API (`/api/*`) y doble Google Picker/GIS** + micrófono sintético | ✅ 4/4 matrices OK (`375-claro`, `1280-claro`, `375-oscuro`, `1280-oscuro-glass`) | Selector segmentado (teclado/clic), Google Picker carpeta y archivo, Quitar, Carpeta del trabajo, Pegar enlace con validación, contraste WCAG AA de `Tu nota:` (>= 6,98:1), reversión con «Cambiar», conflicto `409`, bandeja admin («Abrir en Drive» / «Entregado por WhatsApp»), rechazo con imagen + grabación de audio + Drive Picker, Escape/foco, tarjeta rechazada, historial `/trabajos/50` y 0 desborde horizontal |

### Lo que NO se pudo probar (y por qué)
- **Google Picker y OAuth GIS reales contra `accounts.google.com` / `apis.google.com` con cuenta Google real** ni **PostgreSQL / Storage de Supabase en vivo**: el entorno automatizado no dispone de sesión interactiva de Google ni credenciales OAuth/Picker/Supabase vivas, y las reglas prohíben tocar `.env*` o ejecutar migraciones desde el agente. El diálogo de Google Picker, GIS (`drive.file`), las RPC de Supabase y los flujos HTTP en frontend se probaron con dobles deterministas; la atomicidad real en Postgres (`025`) queda pendiente de validación tras aplicar la migración en Supabase.

---

## 3. ESTADO PARA RETOMAR

1. **Aplicar migración en Supabase (Juan/Elías):** ejecutar [`025_entrega_metodo_reversion_y_rechazo_adjuntos.sql`](<supabase/migrations/025_entrega_metodo_reversion_y_rechazo_adjuntos.sql>) en Supabase SQL Editor (idempotente; quedó copiada en el portapapeles). Confirmar que `024` ya esté aplicada antes.
2. **Validar en preview de `desde-cero` con cuenta Google real y base viva:**
   - Como trabajador: probar **Entrega por Drive** → **Elegir de Drive** (consentimiento `drive.file` en su cuenta Google y selección de carpeta y archivo), **Entrega por WhatsApp**, **Cambiar** desde «Por revisar» (y verificar 409 si un admin acepta a la vez), y contraste visual de «Tu nota:» en claro, oscuro y Glass.
   - Como admin: revisar bandeja («Abrir en Drive» / «Entregado por WhatsApp») y probar **Rechazar tarea** con texto + nota de voz + imagen/video + elemento de Google Drive, verificando que el trabajador los reproduzca y descargue en su tarjeta rechazada e historial.
3. **Promoción a `main`:** todos los cambios quedaron en la rama `desde-cero`; Elías promueve a `main` tras validación.
4. **Servidor temporal:** Ninguno activo (el servidor de QA en puerto `3336`, último PID `4984`, se cerró y se verificó `PORT_3336_LISTEN=False`).
