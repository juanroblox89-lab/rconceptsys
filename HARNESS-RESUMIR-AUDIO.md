# HARNESS-RESUMIR-AUDIO · Resumen de grabación WebM al pulsar «Resumir con IA»

- **Rama:** `desde-cero` (`main` intacta; solo Elías promueve a `main` tras verificar)
- **SHA del código:** `b453aec6a69325b3412d110b384807f47212dd75`
- **Base previa:** `f849d6a` (`HARNESS-ENTREGA.md`)
- **Migraciones SQL:** No requirió nueva migración. Reutiliza el esquema existente de [`023_asignaciones_adjuntos.sql`](<supabase/migrations/023_asignaciones_adjuntos.sql>) y [`025_entrega_metodo_reversion_y_rechazo_adjuntos.sql`](<supabase/migrations/025_entrega_metodo_reversion_y_rechazo_adjuntos.sql>) sin añadir columnas nuevas a `PATCH` de PostgREST.
- **Archivos prohibidos / ajenos respetados:** No se leyó ni tocó `.env*`, `Sensible\`, claves privadas ni archivos de otros briefs pendientes en el árbol.

---

## 1. Diagnóstico raíz (qué estaba roto)

1. **Borrador sin ejecución ni resumen (`components/AdjuntosAsignacion.tsx:EditorAdjuntos` / `FilaLocal`):**
   - Al pulsar **«Resumir con IA»** en un audio local (borrador de trabajo nuevo o edición sin guardar), `FilaLocal` solo invertía el booleano `a.resumir = !a.resumir`. No llamaba a ningún endpoint ni mostraba estado, resumen ni error.
2. **Adjuntos guardados/finalizados atrapados en `"pendiente"` (`asignacion_adjuntos.go`, `asignacion_resumen.go`):**
   - `handleFinalizarAdjunto`, `handlePreferenciaAdjunto` y `handleReintentarResumenAdjunto` solo escribían `estado_resumen = "pendiente"` y dependían exclusivamente del cron por minuto de Supabase (`GET /api/cron/adjuntos`, no ejecutado en local, previews de `desde-cero` ni ante llamadas inmediatas).
   - No existía disparo bajo demanda desde la interfaz ni reempaque/timeout adecuado en el proxy de Next (`TIMEOUT_MS = 25_000` en `app/api/[...path]/route.ts`).
3. **Detección MIME WebM al subir desde disco (`lib/adjuntos-asignacion.ts:tipoDeArchivo`, `EditorAdjuntos`):**
   - Navegadores y sistemas operativos reportan `file.type = "video/webm"` o `""` para archivos `.webm` solo audio. `tipoDeArchivo` los clasificaba como `"video"`, ocultando «Resumir con IA» y provocando rechazo `415` en `validarMedioAdjunto`.
4. **Respaldo NVIDIA roto por ruta inexistente y formato WebM (`asignacion_resumen.go`):**
   - El código previo enviaba `audio/webm` sin convertir a `https://integrate.api.nvidia.com/v1/audio/transcriptions` con `nvidia/parakeet-tdt-0.6b-v3`. En vivo, esa ruta devuelve **HTTP `404 page not found`** y `parakeet-tdt-0.6b-v3` no figura en `/v1/models` de `integrate.api.nvidia.com`.
   - El modelo multimodal vigente en `integrate.api.nvidia.com/v1/models` es **`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`** sobre `/v1/chat/completions`, pero rechaza `audio/webm` con HTTP `400` (`Unsupported audio format: send WAV, MP3, FLAC or Ogg (Vorbis/Opus) audio`) y requiere al menos ~7–10 s por llamada (antes dividía 32 s entre 5 claves = 6,4 s por intento, causando timeouts en cadena).
5. **Silencio y errores opacos (`asignacion_resumen.go`, `AdjuntosAsignacion.tsx`):**
   - Ante silencio, temperatura 1 en Gemini podía alucinar frases breves o devolver `transcripcion: ""` que terminaba en `"No se pudo"` genérico sin motivo legible.

---

## 2. Qué se corrigió (reutilizando un solo pipeline)

1. **Disparo inmediato y atómico en adjuntos guardados (`asignacion_resumen.go`, `memory_adjuntos.go`, `supa/asignacion_adjuntos.go`, `handlers.go`):**
   - Nuevo endpoint autenticado `POST /api/tareas/{id}/adjuntos/{adjunto}/procesar-resumen` (permisos de lectura por trabajo: solo admin o persona asignada; `409` si `!resumir`).
   - Nuevo método `ReclamarResumenAdjuntoPorID` en `MemoryStore` y `SupabaseStore` (CAS atómico en PostgREST sobre `estado_archivo=listo`, `resumir=true`, `estado_resumen=pendiente` o lease vencido), reutilizando `resumenAudio` y evitando duplicados ante clics repetidos, pestañas simultáneas o cron concurrente.
   - `AdjuntosGuardados` dispara `procesarResumen` automáticamente al detectar cualquier audio guardado en `"pendiente"` y al pulsar **«Resumir con IA»** o **«Reintentar»**, manteniendo en curso una promesa deduplicada por `id`.
2. **Soporte completo de borrador sin guardar el trabajo por sorpresa (`asignacion_resumen.go`, `asignacion_adjuntos.go`, `lib/adjuntos-asignacion.ts`, `AdjuntosAsignacion.tsx`):**
   - Endpoints solo admin: `POST /api/admin/adjuntos/resumen-borrador` (directo hasta 2 MiB) y `PUT /api/admin/adjuntos/borrador/{borrador}/partes/{parte}` + `POST /api/admin/adjuntos/borrador/{borrador}/resumir` (por partes hasta 25 MiB, limpiando fragmentos temporales en `defer`). Todos ejecutan el mismo `resumenAudio`.
   - Devuelve `borrador_resumen` firmado con HMAC-SHA256 (`aplicarResumenBorrador`), que `handleFinalizarAdjunto` valida por contenido y autoría al guardar el trabajo para dejar el resumen **`listo` de inmediato sin volver a llamar a la IA**. Si el usuario vuelve sin guardar, no se crea ninguna tarea ni fila en `asignacion_adjuntos`.
3. **Detección EBML WebM en frontend y proxy (`lib/adjuntos-asignacion.ts`, `app/api/[...path]/route.ts`):**
   - `detectarTipoArchivo` inspecciona pistas EBML (`TrackType=2` sin `TrackType=1`) de archivos `.webm` aunque el navegador reporte `video/webm` o `""`, y `EditorAdjuntos` normaliza el `MediaRecorder` a `audio/webm`.
   - `app/api/[...path]/route.ts` amplía el timeout a `92_000 ms` para `procesar-resumen`, `resumen-borrador` y `borrador/.../resumir`.
4. **Cadena real de proveedores + reempaque WebM→Ogg Opus + errores legibles (`asignacion_webm_ogg.go`, `asignacion_resumen.go`):**
   - **Primario (`9router`):** `ag/gemini-3.8-flash` (`input_audio` con `format: "webm"`, `temperature: 0`).
   - **Respaldo (`NVIDIA`):** `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` en `integrate.api.nvidia.com/v1/chat/completions` con rotación de claves (`20 s` por intento dentro del presupuesto de `45 s`) y reempaque puro en Go **`reempacarWebMaOggOpus`** (soporta `Segment` y `Cluster` indefinidos de `MediaRecorder`, `SimpleBlock`/`BlockGroup` y lacing Xiph/EBML/fijo) para entregar `audio/ogg` Opus estándar sin `ffmpeg`. Si faltan viñetas (`1–2`), completa con `RespaldoTexto` (`nvidia/nemotron-3.5-super-vl-120b-a12b`).
   - **Errores legibles y silencio:** distingue `errAudioSinVoz` (*«No se escuchó voz clara en el audio para resumir.»*), `errFormatoAudio`, `errProveedorNoConfig`, `errProveedorTimeout` y fallos transitorios sin volcar claves, cabeceras ni contenido de audio en logs.
5. **UI (`AdjuntosAsignacion.tsx`, `AdjuntosAsignacion.module.css`):**
   - Muestra estado inmediato **Resumiendo…**, resultado **Listo** con viñetas visibles (`list-style: disc`), `<details>Transcripción</details>` plegable y, si falla, **No se pudo** + motivo legible + **Reintentar**.

---

## 3. Verificación de modelos y pruebas ejecutadas (Real vs Mock)

| Prueba | Tipo (Real / Mock) | Qué cubrió | Resultado |
|---|---|---|---|
| Sonda real `ag/gemini-3.8-flash` (`9router` `:20128`) | **Real en vivo** (configuración local autorizada, sin leer `.env*` ni `Sensible/`) | Audio sintético español `MediaRecorder` WebM (`117 480 B`) + silencio WebM (`1 460 B`) en `TestResumenAudioSondaRealWebM` y flujo HTTP completo `TestFlujoHTTPRealBorradorYGuardadoWebM` | ✅ **OK**: transcripción exacta, 3 viñetas y rechazo legible de silencio (*«No se escuchó voz clara en el audio para resumir.»*) |
| Sonda real `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` (`integrate.api.nvidia.com`) | **Real en vivo** (9router deshabilitado para forzar respaldo; `WebM → Ogg Opus` puro en Go validado con `ffmpeg`/`ffprobe`) | Audio sintético español `MediaRecorder` WebM (`117 480 B` → `116 844 B` Ogg Opus) + silencio WebM en `TestResumenAudioSondaRealWebM` y `TestFlujoHTTPRealBorradorYGuardadoWebM` | ✅ **OK**: 3–4 viñetas en español (`proveedor="nvidia"`) y error legible en silencio |
| `nvidia/parakeet-tdt-0.6b-v3` en `integrate.api.nvidia.com/v1/audio/transcriptions` | **Verificación real HTTP** | Comprobación directa de existencia de ruta y `/v1/models` | ❌ **404 page not found** (causa raíz del respaldo previo roto; reemplazado por `nemotron-3-nano-omni-30b-a3b-reasoning`) |
| `oc/mimo-v2.6-flash-free` vía `9router` | **Verificación real HTTP** | Prueba `input_audio` WebM | ❌ **400 invalid_request_error** (descartado) |
| `cd backend && go test -count=1 ./... && go vet ./...` | **Real Go** (`MemoryStore` + `httptest.Server` doble HTTP) | `TestWebMValidacionYReempaqueOggOpus`, `TestBorradorResumenSinGuardarTrabajoYReusoSinDuplicado`, `TestProcesarResumenGuardadoPermisosErroresSinDuplicado`, `TestRespaldoNVIDIAOmniWebM`, `TestF10*`, `TestManualRIAContieneRutas`, `store`, `supa` | ✅ **OK** (`httpapi`, `store`, `supa`) |
| `npm test` | **Real** (`tsx --test`) | `adjuntos-resumen.test.ts` (EBML WebM como `video/webm`, borrador directo/partes, token `borrador_resumen`, estados `EditorAdjuntos`), `chat-utils.test.ts`, `drive-enlaces.test.ts` | ✅ **11/11 OK** |
| `npm run lint`, `npm run typecheck`, `npm run mapa`, `npm run build` | **Real** | ESLint, `tsc --noEmit`, regeneración `mapa.json`/`mapa.html` (121 endpoints, 29 tablas, 48 vars) y build de Next (`verificar-ria.mjs && next build`, 22 rutas) | ✅ **OK** |
| `node scripts/qa-resumir-audio.mjs` contra `next start -p 3337` | **Real navegador Edge headless** + **Mock `/api/*`** con WebM sintético español y silencio WebM | 375×812 y 1280×800 en claro y oscuro: subida WebM con MIME `video/webm`, resumen en borrador sin crear tarea, error legible por silencio, guardado sin duplicado, fallo y reintento en guardado, vista trabajador sin switch admin, 0 desbordes y 0 errores de consola | ✅ **8/8 capturas OK** (inspeccionadas visualmente) |

### Limitaciones / lo no probado en vivo
- No se probó contra la instancia **Supabase/Vercel de producción** ni se leyeron secretos `.env*` o `Sensible\`.
- Los botones en el modal de **Rechazar tarea** conservan `permitirResumen={false}` por diseño de `AdminTareas.tsx`.

---

## 4. ESTADO PARA RETOMAR

1. **Rama:** `desde-cero` (código `b453aec6a69325b3412d110b384807f47212dd75`, seguido de commit documental de este reporte e `INFORME.md`). `main` sin cambios; **solo Elías promueve a `main` tras verificar**.
2. **Entorno de producción / preview:** confirmar que `NINEROUTER_BASE_URL` y `NINEROUTER_API_KEY` (o `NVIDIA_API_KEYS` / `NVIDIA_API_KEY`) estén configuradas en el servicio Go (`backend/`). No se requiere nueva migración SQL sobre `023`/`025`.
3. **Prueba sugerida en preview de `desde-cero`:**
   - En `/trabajos/nuevo`, grabar o adjuntar un audio WebM y pulsar **«Resumir con IA»** → debe mostrar *Resumiendo…* y luego *Listo* con viñetas en español y *Transcripción* plegable sin haber creado el trabajo aún.
   - Guardar el trabajo y probar también adjuntar otro audio sin resumir en borrador, abrir `/trabajos/[id]` y pulsar **«Resumir con IA»** → debe procesar de inmediato sin quedarse en `pendiente`.
4. **Servidor temporal:** Ninguno activo (`next start` en puerto `3337`, último PID `17968`, cerrado y verificado `Port 3337 listening after cleanup: False`).
