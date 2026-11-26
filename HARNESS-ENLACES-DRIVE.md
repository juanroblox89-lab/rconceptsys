# HARNESS-ENLACES-DRIVE · Enlaces rápidos con Drive, cuenta equivocada, permisos y Drive en chat

- **Rama:** `desde-cero` (sin push ni cambios en `main`; promoción queda para Elías)
- **SHA del código:** `86017d190aba2741c14e5ac66894a8171ea2a2f0`
- **Archivo de entrega:** `HARNESS-ENLACES-DRIVE.md`
- **Archivos ajenos:** No se tocaron `.env*`, `Sensible\`, ni cambios previos de otros briefs (`INFORME.md` permanece sin modificar).

---

## 1. Qué se implementó

### A. Enlaces rápidos con Google Picker y detección de cuenta (`components/admin/AdminEquipo.tsx`)
1. **Botón «Elegir de Drive» junto a «Agregar»:**
   - Visible únicamente cuando `drive?.conectado` es `true`. Cuando Drive no está conectado se muestra `«Conecta Drive del equipo para elegir.»`.
   - Reutiliza `abrirSelectorGoogleDrive` exportada desde `components/PickerDriveCliente.tsx` (mismo flujo y `DocsView` con carpetas y archivos habilitados sobre `/api/admin/drive/picker-token`).
   - Placeholders viejos (`Nombre (Drive del equipo)` / `https://drive.google.com/…`) reemplazados por `Nombre del enlace` y `https://…`.
   - Crea el enlace con el nombre (recortado limpiamente a 40 caracteres según la regla del backend) y `webViewLink` (`doc.url` o fallback `folders/{id}` / `open?id={id}`) vía `api.adminPostEnlaceEquipo`.
   - Respeta límite máximo de 12 enlaces rápidos y validación `https://`.
   - Estados legibles: cargando (`Abriendo Google Drive…` / `Guardando enlace de Drive…`), error del Picker con `role="alert"`, cancelación silenciosa sin error, y bloqueo de URL duplicada tanto en Picker como en «Agregar» manual y en backend (`CrearEnlaceEquipo` / `ActualizarEnlaceEquipo`).
   - Se corrigió el resto incompleto que había dejado la sesión cancelada `b-5c633782` (`variante="terciario"` inválido en TypeScript, imports/estado sin usar y el typo `.bloqueCabecera` → `.corteCabecera` en `components/admin/admin-paneles.module.css`).

2. **Detección de cuenta equivocada (`lib/drive-equipo.ts`, `backend/internal/httpapi/f5estado.go`, `drive.go`, `clientes_f7.go`):**
   - Constante única configurable:
     - Backend (`f5estado.go`): `DRIVE_CUENTA_EQUIPO` (o `NEXT_PUBLIC_DRIVE_CUENTA_EQUIPO`) con valor por defecto `ladlejuan26@gmail.com` en `ConfDrive.CuentaEsperada()`. Se devuelve en `GET /api/admin/drive` y `GET /api/admin/drive/picker-token` como `cuenta_equipo`.
     - Frontend (`lib/drive-equipo.ts`): `CUENTA_EQUIPO_DRIVE` (`NEXT_PUBLIC_DRIVE_CUENTA_EQUIPO` o `ladlejuan26@gmail.com`) con prioridad para `cuenta_equipo` entregada por el backend.
   - Comparación ignorando mayúsculas y espacios (`normalizarCorreoDrive`).
   - Cuando `drive.conectado && drive.correo` existe y difiere de `cuenta_equipo`, se muestra `<Aviso tipo="advertencia">` con `«Drive está conectado con otra cuenta (<correo>). Reconecta con ladlejuan26@gmail.com.»` junto a los botones existentes **Reconectar** / **Desconectar Drive**.
   - Se mantiene el `<Aviso tipo="advertencia">` naranja estático cuando no hay conexión (`!drive?.conectado`).
   - En `GET /api/admin/drive/picker-token`, el backend consulta el correo vivo del token emitido (`a.correoDrive`, con respaldo en `conexion.Correo`) y lo retorna en `correo` junto con `cuenta_equipo` (sin exponer nunca `refresh_token`).
   - Antes de llamar `api.adminPostEnlaceEquipo` al seleccionar en el Picker, `AdminEquipo.tsx` verifica si `conf.correo`, `drive.correo` o un correo devuelto por el callback del Picker difieren de `cuenta_equipo` o entre sí; si hay discrepancia, detiene el alta automática y muestra la advertencia con confirmación explícita («Cancelar» / «Agregar de todas formas»).

### B. Drive en el chat (`components/chat/MenuAdjuntos.tsx`, `AdjuntoVista.tsx`, `adjuntos.module.css`, `app/(app)/page.tsx`)
1. **Reemplazo de la lista única previa (pendiente heredado de `b-7f680b46`):**
   - **Para administradores (`esAdmin`):** pulsar **+** → **Carpeta de Drive** abre directamente el selector real de Google Picker reutilizando `abrirSelectorGoogleDrive` (`components/PickerDriveCliente.tsx` + `/api/admin/drive/picker-token`). El popover se cierra al abrir el modal nativo para evitar que clics dentro del Picker disparen el cierre por clic externo. El elemento elegido queda como chip en borrador (sin enviarse hasta pulsar **Enviar**), evita duplicados en el mismo borrador, cancela sin error y muestra mensajes claros si Drive no está conectado/organizado o falla la carga (con opción secundaria para pegar enlace).
   - **Decisión documentada para trabajadores no admin (`!esAdmin`):** `/api/admin/drive/picker-token` permanece **estrictamente solo admin** (`403` para miembros), porque el conector OAuth del equipo utiliza el scope completo `https://www.googleapis.com/auth/drive` y entregar ese `access_token` al navegador daría permisos de edición/borrado en Drive. Por ello, los no admin nunca llaman `/api/admin/drive/picker-token`: ven un selector de solo lectura con las carpetas ya autorizadas para su rol (`GET /api/clientes`, `GET /api/tareas` asignadas y `GET /api/equipo/resumen` deduplicadas) más un formulario secundario «Pegar enlace de Drive» validado a URLs `https` de Google Drive/Docs, con aviso explícito *«Solo carpetas autorizadas · para editar abre directo en Drive.»*.
2. **Botón visible «Abrir carpeta» en mensajes enviados (`components/chat/AdjuntoVista.tsx`):**
   - La tarjeta de `adjunto.tipo === "drive"` dejó de envolver todo el bloque en `<a>` y pasó a `<div className="tarjeta tarjetaDrive">` con icono, nombre, etiqueta `Carpeta de Drive` y botón visible **`Abrir carpeta`** (`<EnlaceExterno>` con `target="_blank" rel="noopener noreferrer"`, sin enlaces anidados, validando URL `https` de Google Drive/Docs). Aplica tanto a mensajes nuevos como a mensajes históricos.

---

## 2. Auditoría de permisos de trabajadores (no admin) en Drive y adjuntos

### Qué había
1. **Backend (`backend/internal/httpapi/handlers.go`, `drive.go`, `drive_organizacion.go`, `clientes_f7.go`, `flujo.go`, `asignacion_adjuntos.go`, `f5.go`):**
   - Todas las rutas de mutación/configuración de Drive, clientes, equipo y adjuntos de asignación ya estaban protegidas con `MiddlewareAuth(..., true, true)` (`es_admin && estado == aprobado`): conectar/desconectar Drive, organizar, simular/migrar carpetas, `picker-token`, listar archivos globales de Drive, crear carpeta de tarea, vincular carpeta de cliente, editar `drive_referencias` de clientes o tareas, editar/borrar enlaces de equipo y subir/modificar/borrar adjuntos de asignación.
   - Los trabajadores (`MiddlewareAuth(..., true, false)`) podían:
     - Leer enlaces del equipo (`/api/equipo/resumen`), clientes y ficha (`/api/clientes`, `/api/clientes/{id}` filtrando `trabajos` por `AsignadoA == yo.ID`), sus propias tareas y detalle (`/api/tareas`, `/api/tareas/{id}/detalle` validando `t.AsignadoA == p.ID`), adjuntos de sus tareas (`/api/tareas/{id}/adjuntos`, `firma`, `medio`, `reintentar`), adjuntar enlaces de Drive en chat (`POST /api/chat/adjuntos` JSON, solo guarda URL en BD sin tocar Google Drive) y entregar su tarea con `enlace_medios` (`POST /api/tareas/{id}/hecha`).
     - En `POST /api/tareas/{id}/hecha`, `SincronizarEntregaConDrive` copia best-effort el archivo entregado hacia la subcarpeta `Entregas` de la tarea usando el token del servidor (no edita, mueve ni borra el archivo original).
   - **Huecos detectados:**
     - `validarEnlaceDrive` (`handlers.go`) aceptaba URLs `https://` de Drive/Docs sin bloquear `userinfo` (`https://evil@drive.google.com/...`) ni URL raíz vacía (`https://drive.google.com/`).
     - `CrearEnlaceEquipo` y `ActualizarEnlaceEquipo` (`memory_f5.go`, `supa/f5.go`) solo comprobaban prefijo `"https://"` sin `url.Parse` ni bloqueo de URLs duplicadas.
     - En el chat, si `MenuAdjuntos.tsx` hubiera llamado a `/api/admin/drive/picker-token` para un miembro o se le hubiera abierto ese endpoint, habría expuesto un token con scope `auth/drive` completo.
2. **Frontend (`AdminEquipo.tsx`, `PaginaCliente.tsx`, `PaginaTrabajo.tsx`, `CarpetaDriveTarea.tsx`, `MisTareas.tsx`, `AdjuntosAsignacion.tsx`, `MenuAdjuntos.tsx`):**
   - `AdminEquipo.tsx`: bloqueado tras verificación de admin en `/admin`.
   - `PaginaCliente.tsx` y `PaginaTrabajo.tsx`: `PickerDriveCliente`, `EditorCliente`, `FormularioAsignacion`, `SelectorCarpetaTrabajo`, `EditorAdjuntos`, `AdjuntosGuardados editable` y botón `Crear carpeta en Drive` no se montan para no admin; solo ven botones de apertura externa («Abrir», «Carpeta de la tarea», «Abrir en Drive») y sus propios adjuntos en solo lectura.
   - `MisTareas.tsx`: solo lectura de referencias/carpetas y envío de entrega (`enlace_medios`).

### Qué se cambió
- `backend/internal/httpapi/handlers.go` (`validarEnlaceDrive`): rechazo de URLs con `u.User != nil` y sin ruta/query (`(u.Path == "" || u.Path == "/") && u.RawQuery == ""`), protegiendo tanto `POST /api/tareas/{id}/hecha` como `POST /api/chat/adjuntos`.
- `backend/internal/store/memory_f5.go` y `backend/internal/supa/f5.go` (`NormalizarURLEnlaceEquipo`, `CrearEnlaceEquipo`, `ActualizarEnlaceEquipo`): validación estricta con `url.Parse` (https, host válido, sin `userinfo`) y rechazo de URL duplicada en la lista del equipo.
- `components/chat/MenuAdjuntos.tsx`: separación estricta por rol; los no admin nunca invocan `/api/admin/drive/picker-token` ni reciben credenciales de Google Drive, limitándose a elegir carpetas ya autorizadas para su cuenta o pegar enlaces https válidos de Drive.
- `backend/internal/httpapi/drive_enlaces_permisos_test.go`: test dedicado (`TestPermisosTrabajadoresNoAdminEnDriveYAdjuntos`) que verifica `403 Forbidden` para dos usuarios trabajadores en las 19 rutas de edición/gestión de Drive y adjuntos, además de validar `200`/`201` en lectura/envío/adjuntado autorizado y `400`/`403` en intentos maliciosos o tareas ajenas.

---

## 3. Pruebas ejecutadas (distinción Real vs Mock)

| Prueba | Tipo (Real / Mock) | Resultado | Qué cubrió |
|---|---|---|---|
| `cd backend && go build ./... && go vet ./...` | Real (compilación y análisis estático Go) | ✅ OK | Todo el backend Go compila sin advertencias |
| `cd backend && go test -count=1 ./...` | Real sobre handlers/store en memoria + doble HTTP de Google (`transporteDrivePruebas`) | ✅ OK (`httpapi`, `store`, `supa`) | Incluye `TestDriveCuentaEquipoYCorreoPickerToken`, `TestEnlacesEquipoDuplicadoMax12YValidacion` y `TestPermisosTrabajadoresNoAdminEnDriveYAdjuntos` |
| `npm run typecheck` | Real (`tsc --noEmit`) | ✅ OK (0 errores) | Todo el proyecto TypeScript |
| `npm run lint` | Real (`eslint`) | ✅ OK (0 errores, 0 warnings) | Reglas Next/React/TS |
| `npm run build` | Real (`verificar-ria.mjs && next build`) | ✅ OK | Compilación de producción Next 16 (22 rutas) |
| `npm test` | Real (Node `tsx --test` + `react-dom/server` con stub CSS Modules) | ✅ 7/7 pasan | `chat-utils`, `lib/drive-equipo.ts`, `AdjuntoVista` (botón «Abrir carpeta» sin enlaces anidados y validación Drive), `MenuAdjuntos` |
| `npm run mapa` | Real (`scripts/generar-mapa.mjs`) | ✅ OK (108 endpoints, 27 tablas, 41 vars) | Validación de referencias `archivo:función` en `flujos.json` y regeneración de `mapa.json`/`mapa.html` |
| `node scripts/qa-enlaces-drive.mjs` contra `next start -p 3325` | Real (Next.js producción + Edge headless) con API `/api/*` y `apis.google.com` simuladas (mock) | ✅ 20/20 capturas OK (375×812 y 1280×800; claro, oscuro y Glass) | Estados de `AdminEquipo` (desconectado, cuenta equivocada + alerta previa en Picker, cuenta correcta ignorando mayúsculas/espacios, cancelar sin error, crear desde Picker, duplicado bloqueado, error legible), chat admin (Google Picker en borrador → enviar → tarjeta con «Abrir carpeta» abriendo nueva pestaña), chat trabajador (0 llamadas `/api/admin/*`, carpetas autorizadas), no-admin en `/clientes/1/editar` y `/trabajos/10`, alineación del compositor y 0 overflow horizontal. Inspección visual de capturas en `capturas-enlaces-drive/` |
| `node scripts/qa-f8.mjs` y `qa-f9.mjs` (1280 claro) | Real (Next.js producción + Edge headless) con mock de API/Google | ✅ OK | Regresión sin roturas de `PickerDriveCliente`, `AdminEquipo`, `FormularioAsignacion` y `SelectorCarpetaTrabajo` |

### Lo que NO se pudo probar (y por qué)
- **Google Picker real contra `accounts.google.com` / `apis.google.com` con cuenta Google real (`ladlejuan26@gmail.com`) ni `Supabase` en vivo:** el entorno automatizado no dispone de sesión interactiva de Google ni credenciales OAuth/Picker en vivo (`GOOGLE_CLIENT_ID`/`GOOGLE_PICKER_API_KEY` reales) y las reglas prohíben usar sesiones reales o tocar `.env*`. Tanto la respuesta de Google `/drive/v3/about` como el diálogo de `google.picker.PickerBuilder` se probaron con dobles/mocks deterministas.

---

## 4. ESTADO PARA RETOMAR

- **Rama actual:** `desde-cero` (`86017d1` código + commit siguiente de este reporte y mapa).
- **Servidor temporal:** Ninguno activo (el servidor `next start -p 3325` usado en QA fue cerrado por PID al finalizar).
- **Pendientes para validación humana / Elías:**
  1. Revisar en preview/despliegue de `desde-cero` con una sesión real de Google en **Gestión → Equipo**: conectar una cuenta distinta para confirmar la aparición del aviso naranja y luego reconectar con `ladlejuan26@gmail.com` y probar **Elegir de Drive** con el Google Picker real (carpeta y archivo).
  2. Probar en **Chat del equipo** como admin (apertura real de Google Picker → borrador → Enviar → botón «Abrir carpeta») y como trabajador no admin (lista de carpetas autorizadas / pegar enlace → «Abrir carpeta»).
  3. Promover `desde-cero` → `main` cuando Juan/Elías den visto bueno.
