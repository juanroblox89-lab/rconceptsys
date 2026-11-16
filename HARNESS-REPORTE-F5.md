# Reporte F5 · Equipo, asignaciones, chat con adjuntos y audio, Drive, piezas, cortes de pago y avisos push

Fecha de trabajo: 2026-11-15/16 (America/Bogota, reloj del sistema).
Rama: `desde-cero`. Todos los commits son **locales**: no hubo push ni deploy.
Entorno de verificación levantado por el agente: API en memoria `RC_MODO_DEMO=1 PORT=8311` (con `SUPABASE_URL` vacío a propósito) + web `BACKEND_URL=http://127.0.0.1:8311 npx next dev -p 3312`.
No se tocó ningún `.env*` ni nada de `Sensible\`.

Commits de esta entrega:

```
413b0d0 F5: capturas 375 y 1280 de las pantallas nuevas
5efd7cb F5 backend: carpeta de Drive compartida como adjunto del chat
4bd5fee F5 front: avisos push con service worker en Mi perfil
0b78780 F5 front: piezas, cortes de pago, ficha de cliente y Drive en Gestion
f8eeb05 F5 front: chat con adjuntos y audios, barra de equipo, recientes y perfil al pie
c9fa4be F5 backend: equipo, adjuntos del chat, asignaciones, Drive, piezas, cortes y push
```

---

## 1. Qué quedó, bloque por bloque

### Bloque 1 · Barra derecha "Equipo" (punto 1) y su edición en Gestión

- **`components/EquipoBarra.tsx`** (+ módulo CSS): encabezado "Equipo" con botón de información, refrescar y cerrar; tarjeta "Este equipo" (nombre + descripción corta); **accesos rápidos** con flecha de salida que abren en otra pestaña; **Actividad** con Mensajes, Tareas, Miembros y Archivos en cifras abreviadas (`212,5 k`); pie con "Ver miembros del equipo".
- Dónde se ve: **columna fija de 268 px a la derecha del chat en ≥1280 px**; en tablet y celular se abre como **hoja deslizante** con el botón de información del encabezado del chat (el botón se oculta en ≥1280). El fondo no desplaza y Escape cierra.
- Sin datos inventados: si no hay enlaces muestra "Todavía no hay enlaces. Un admin los agrega en Gestión → Equipo."
- **Gestión → Equipo** (`components/admin/AdminEquipo.tsx`): nombre y descripción (con contador /300), enlaces rápidos (agregar, renombrar/ordenar con flechas, quitar; máximo 12) y el bloque de Google Drive.
- Backend: `GET /api/equipo/resumen` (miembros), `PATCH /api/admin/equipo`, `POST/PATCH/DELETE /api/admin/equipo/enlaces/{id}` (admin). La configuración vive en `public.configuracion` con clave `equipo` (jsonb). Totales de Actividad: mensajes no borrados, tareas totales, miembros aprobados y "archivos" = adjuntos del chat + tareas con enlace de Drive.

### Bloque 2 · Recientes y página Asignaciones (punto 2, solo admins)

- **`components/Sidebar.tsx`**: sección plegable **Recientes** debajo de la navegación, solo para admins. Cada asignación con ícono según tipo (Video / Layers / Upload), título corto ("Edición Mateo", "Grabación Mateo") y **punto azul** cuando hay algo nuevo sin ver; al final **Ver todas**.
- **`app/(app)/asignaciones/page.tsx`** (+ CSS): lista completa con filtros por **persona**, **estado** (pendiente, entregada, aprobada, rechazada, vencida), **desde** y **hasta**, más "Limpiar". En móvil los filtros están detrás del botón "Filtros" (regla compacta); en escritorio van en fila. "Vencida" se calcula con la fecha límite (pendiente o rechazada con fecha pasada).
- La novedad se apaga al abrir Asignaciones: la página marca todas como vistas (`POST /api/admin/asignaciones/vistas`). En la base se guarda en `public.asignaciones_vistas` (quién, qué tarea y cuándo).
- Asignaciones también aparece en el **riel colapsado** (ícono de reloj), porque no se agregó a la lista de la barra para no alargarla.

### Bloque 3 · Mi perfil al pie de la barra izquierda (punto 3)

- Sale "Mi perfil" del menú (queda fuera de `navItems`).
- Al pie de la barra: **avatar** (inicial si no hay foto), **nombre**, **· rol** (Admin o los roles de trabajo unidos) y flecha que abre el menú **Ver perfil / Cerrar sesión**; **engranaje** a la derecha que lleva a ajustes (`/perfil`).
- Con la barra colapsada, el avatar aparece al pie del riel flotante (no se pierde el acceso al perfil).

### Bloque 4 · Chat con adjuntos y audios (puntos 4 y 6)

- **Botón +** a la izquierda del cuadro de escribir (`components/chat/MenuAdjuntos.tsx`): **Imágenes** (JPG, PNG, WebP, GIF), **Video** (hasta 20 MB), **Archivos** (PDF, Word, Excel, ZIP, TXT, CSV…) y **Carpeta de Drive** (formulario con nombre + enlace https de Drive; se comparte como tarjeta). Máximo 6 archivos por tanda, 20 MB por archivo, con aviso claro si algo se pasa.
- **Cómo se ven**: miniaturas que se abren en grande (visor con descargar), video con reproductor, archivos como tarjeta con ícono, nombre, tamaño y descargar, y carpeta de Drive como tarjeta con nombre y flecha de salida (`components/chat/AdjuntoVista.tsx`).
- Los archivos se suben **al elegirlos** (chip "subiendo…" y "error" si falla, con quitar) y el mensaje se envía con su texto + adjuntos. Se puede enviar **solo adjuntos, sin texto**.
- **Audios** (`GrabadorAudio.tsx` + `ReproductorAudio.tsx`): el micrófono empieza a grabar al tocarlo, muestra punto rojo y tiempo ("Grabando… 0:07"), el cuadrado detiene **y envía** y la papelera descarta. El reproductor trae **onda** (picos reales calculados al verlo en pantalla), **duración**, avance tocando la onda y **velocidad 1x / 1,5x / 2x**.
- Backend: `POST /api/chat/adjuntos` (multipart `archivo` + `duracion_seg`, o JSON `{nombre,url}` para Drive), `GET /api/chat/adjuntos/{id}/archivo` (sirve el binario con su MIME) y `POST /api/chat` con `adjuntos: [ids]`. Los adjuntos viajan dentro de cada mensaje al listar el chat. Tipos aceptados y límites validados en el servidor (`tipo_no_permitido`, `archivo_grande`).

### Bloque 5 · Conector de Google Drive (punto 5)

- Un **solo Drive del equipo**, conectado por un admin con OAuth desde **Gestión → Equipo**: estado "Conectado / Sin conectar / Falta configurar", correo conectado y botón Conectar / Desconectar.
- Flujo implementado: `POST /api/admin/drive/conectar` genera un `state` de un solo uso (10 min) y devuelve la URL de Google; `GET /api/drive/callback` cambia el código por `refresh_token`, lee el correo y guarda todo en `public.drive_conexion` (fila única, **solo service_role**). Cualquier fallo vuelve a `/admin?drive=…` con el aviso correspondiente en español.
- **Subcarpeta por tarea**: `POST /api/admin/tareas/{id}/drive-carpeta` con `{crear:true}` crea `T-<id> <título>` en la carpeta raíz del Drive del equipo y guarda `drive_carpeta_id` / `drive_carpeta_url` en la tarea. En la bandeja del admin (`AdminTareas`) cada tarea muestra "Crear carpeta en Drive" o el enlace si ya existe.
- **Lo entregado se guarda ahí**: al marcar la tarea como hecha con un enlace de archivo de Drive, el backend **copia el archivo** a la subcarpeta de la tarea (`files.copy`). Es best-effort: si Drive falla, la entrega igual queda registrada (el error no llega a la persona).
- Sin credenciales de Google Cloud el panel lo dice explícitamente ("Faltan las credenciales de Google Cloud…") y el backend responde `400 drive_no_configurado`. **No hay ninguna clave de Google en el código.**

### Bloque 6 · Clientes y piezas (punto 7)

- **Ficha de cliente** (Gestión → Clientes → botón **Ficha**): paquete contratado, carpeta de Drive (enlace https validado) y notas (1000 caracteres). Se guarda con el `PATCH /api/admin/clientes/{id}` existente, ampliado.
- **Piezas** (Gestión → Piezas): tablero por etapa **Guion → Grabación → Edición → Revisión → Aprobada → Publicada**, con "Nueva pieza" (nombre, cliente opcional, formato). Cada tarjeta muestra cliente, formato, fecha de publicación, enlace a su carpeta de Drive, sus tareas con estado y un selector de **Etapa** para mover la pieza.
- Las tareas se cuelgan de una pieza desde **Nueva tarea** con el campo opcional "Pieza". **Las tareas actuales siguen funcionando**: `tareas.pieza_id` es nulo cuando no se elige pieza (probado en `TestF5ClientesYPiezas`).

### Bloque 7 · Corte de pagos (punto 8)

- Gestión → **Cortes**: botones **Cerrar quincena** y **Cerrar mes** (calculan el rango del periodo actual) y "Rango a la medida" con desde/hasta.
- Cada corte guarda fecha de cierre, rango, **total por persona sobre lo aprobado** (tareas `aceptada` con `resuelta_en` dentro del rango, usando el precio congelado), número de tareas y **marca de pagado** por persona (con quién y cuándo).
- **Exportar CSV** y **PDF** desde el backend: `GET /api/admin/cortes/{id}/csv` y `.../pdf`. El PDF se genera a mano (sin librerías nuevas) con Helvetica y tabla de personas.
- No se crea un corte vacío: si en el rango no hay tareas aprobadas responde `400` con mensaje claro.

### Bloque 8 · Avisos push (punto 9)

- **Web Push con VAPID** implementado con la librería estándar de Go: cifrado **RFC 8291 (aes128gcm)** y firma **RFC 8292 (ES256)**. Probado con un test que **descifra** lo que produce el backend con la llave del navegador (`TestCifradoPushIdaYVuelta`) y otro que **verifica la firma del JWT** VAPID (`TestCabeceraVAPID`).
- Avisos en los tres momentos pedidos: **tarea nueva** (al asignar), **vence mañana** (revisión cada 30 minutos, una sola vez por tarea y día) y **entrega aprobada** (al aceptar).
- Web: `public/sw.js` muestra la notificación y al tocarla abre/focaliza la pestaña en la ruta correcta. En **Mi perfil** hay un bloque "Avisos en este dispositivo" con Activar / Desactivar y estado ("Activados").
- Endpoints: `GET /api/push/clave`, `GET /api/push/estado`, `POST /api/push/suscribir`, `DELETE /api/push/suscribir`.
- **APK**: el mismo endpoint sirve; el puente nativo solo debe reenviar `endpoint`, `p256dh` y `auth` al backend (documentado abajo en "Listo para la APK").

---

## 2. Migraciones SQL (nuevas, **sin aplicar a producción**)

Carpeta `supabase/migrations/`. **Orden exacto** para que Juan las corra:

| Orden | Archivo | Qué crea |
|---|---|---|
| 1 | `006_equipo_y_adjuntos_chat.sql` | semilla de `configuracion.equipo`, tabla `chat_adjuntos` + RLS, `chat_mensajes.cuerpo` permite vacío (mensajes solo con adjuntos) y bucket **`chat`** (privado, 20 MB, con MIME permitidos) |
| 2 | `007_asignaciones_vistas.sql` | `asignaciones_vistas` (perfil, tarea, visto_en) + RLS por admin |
| 3 | `008_drive_conexion.sql` | `drive_conexion` (fila única 1, refresh token, solo service_role) + `tareas.drive_carpeta_id` y `drive_carpeta_url` |
| 4 | `009_clientes_piezas.sql` | `clientes.paquete/drive_url/notas`, tabla `piezas` (+ RLS, trigger `actualizado_en`) y `tareas.pieza_id` |
| 5 | `010_cortes_pago.sql` | `cortes` y `corte_lineas` (RLS: cada quien ve lo suyo, admin todo) |
| 6 | `011_push_suscripciones.sql` | `push_suscripciones` (RLS propia) y `push_enviados` (solo service_role) |

Todas usan `if not exists`, activan RLS, revocan escritura a `anon`/`authenticated` y **no tocan datos existentes** (solo agregan columnas y una semilla con `on conflict do nothing`).

---

## 3. Verificación real (salida de los comandos)

### Backend (`backend/`)

```
$ go vet ./...
(sin salida)                         exit=0

$ go test ./... -count=1
?   	rconceptsys/backend/cmd/e2e_server	[no test files]
?   	rconceptsys/backend/cmd/server	[no test files]
ok  	rconceptsys/backend/internal/httpapi	1.760s
ok  	rconceptsys/backend/internal/store	0.244s
?   	rconceptsys/backend/internal/supa	[no test files]
```

**42 tests PASS** en `internal/httpapi` (0 FAIL) y 1 en `internal/store`. Los 11 nuevos de F5:

```
--- PASS: TestF5EquipoResumenYPermisos (0.00s)
--- PASS: TestF5ChatAdjuntos (0.00s)
--- PASS: TestF5AsignacionesRecientesYNovedad (0.00s)
--- PASS: TestF5ClientesYPiezas (0.00s)
--- PASS: TestF5CorteDePagos (0.00s)
--- PASS: TestF5PushSuscripcion (0.00s)
--- PASS: TestF5DriveSinCredenciales (0.00s)
--- PASS: TestCifradoPushIdaYVuelta (0.00s)
--- PASS: TestCifradoPushEsAleatorio (0.00s)
--- PASS: TestCabeceraVAPID (0.00s)
--- PASS: TestExportacionesCorte (0.00s)
```

### Web (raíz del repo)

```
$ npx tsc --noEmit
(sin salida)                         exit=0

$ npm run lint
> eslint
(sin errores)                        exit=0

$ npm run build
✓ Generating static pages (13/13)
Route (app)
├ ○ /
├ ○ /_not-found
├ ○ /admin
├ ƒ /api/[...path]
├ ○ /asignaciones      ← nueva
├ ○ /equipo
├ ƒ /equipo/[id]
├ ○ /estilo
├ ○ /factura
├ ○ /login
├ ○ /pendiente
├ ○ /perfil
├ ○ /registro
└ ○ /tareas
                                     exit=0
```

### Recorrido E2E contra la API demo (puerto 8311)

```
GET    /api/equipo/resumen                     -> 200  nombre + descripción + enlaces + actividad
GET    /api/admin/asignaciones/recientes       -> 200  con novedad
POST   /api/admin/asignaciones/vistas          -> 200  {"mensaje":"Novedad al día."}
GET    /api/admin/asignaciones?estado=aceptada -> 200  1 asignación
GET    /api/admin/piezas                       -> 200  1 pieza con cliente y tareas
GET    /api/admin/cortes                       -> 200  1 corte con líneas
POST   /api/admin/cortes {periodo:"quincena"}  -> 201  corte del 16 al 30
POST   /api/admin/cortes rango sin aprobadas   -> 400  "no hay tareas aprobadas en ese periodo"
GET    /api/admin/drive                        -> 200  {"configurado":false,"conectado":false}
POST   /api/admin/drive/conectar               -> 400  drive_no_configurado (mensaje en español)
GET    /api/push/clave                         -> 200  {"configurado":false,"clave":""}
POST   /api/push/suscribir                     -> 201  suscripción guardada
DELETE /api/push/suscribir                     -> 200  avisos desactivados
GET    /api/admin/cortes/1/csv                 -> 200  "Persona,Rol,Total,Tareas,Pagado\n…"
GET    /api/admin/cortes/1/pdf                 -> 200  application/pdf, 1211 bytes, %PDF-1.4 … %%EOF
POST   /api/admin/tareas/2/drive-carpeta       -> 200  tarea con carpeta (enlace del equipo)
GET    /api/admin/tareas (como trabajador)     -> 403  solo_admin
```

Flujo de adjuntos desde la interfaz real (Playwright, 375 px), con la API demo:

```
+ → Imágenes → archivo → chip "subiendo…" desaparece en <2,5 s
enviar con texto  → mensaje id 6 {"cuerpo":"Prueba de adjunto desde la interfaz","adjuntos":1}
+ → Carpeta de Drive → nombre + enlace → enviar
                  → mensaje {"cuerpo":"","adjuntos":["drive"]}
pageerrors: 0
```

---

## 4. Capturas (375 y 1280)

Carpeta `capturas-f5/` (capturas de página completa, Chromium vía Playwright):

| Pantalla | 1280 | 375 |
|---|---|---|
| Chat del equipo (con barra "Equipo") | `chat-1280.png` | `chat-375.png` |
| Chat con la barra colapsada (riel) | `chat-riel-1280.png` | — |
| Chat con la hoja "Equipo" abierta | — | `chat-equipo-375.png` |
| Chat con imagen, audio y carpeta de Drive | — | `chat-envio-375.png` |
| Asignaciones | `asignaciones-1280.png` | `asignaciones-375.png` |
| Mi perfil (con avisos push) | `perfil-1280.png` | `perfil-375.png` |
| Gestión → Equipo | `admin-equipo-1280.png` | `admin-equipo-375.png` |
| Gestión → Piezas | `admin-piezas-1280.png` | `admin-piezas-375.png` |
| Gestión → Cortes | `admin-cortes-1280.png` | `admin-cortes-375.png` |
| Gestión → Clientes | — | `admin-clientes-375.png` |
| Gestión → Ficha de cliente (modal) | `admin-ficha-1280.png` | — |

Desborde horizontal medido por DOM (`scrollWidth - clientWidth`) en **las 16 capturas: 0 px**, y **0 errores de página** en el navegador.

Revisión visual (esta vez sí a ojo, con las imágenes): se corrigieron dos cosas tras ver las capturas — las columnas del tablero de piezas ahora caben las seis en 1280 px (antes se cortaba "Aprobada") y el PNG de prueba de la semilla se generó válido para que la miniatura del chat se vea.

Scripts: `capturas-f5/seed.cjs` (datos de demo), `capturas-f5/capturar-f5.cjs` (capturas + medición de desborde), `capturas-f5/probar-envio.cjs` (flujo de adjuntos por la interfaz), `capturas-f5/humo-f5.cjs` (recorrido de endpoints).

---

## 5. Lo que necesita Juan

### 5.1 Google Cloud para el Drive del equipo (bloque 5)

1. En Google Cloud Console → *APIs y servicios* → **habilitar Google Drive API**.
2. *Credenciales* → **Crear credenciales → ID de cliente de OAuth**, tipo **Aplicación web**.
3. En "URI de redirección autorizados" poner: `https://<dominio-de-producción>/api/drive/callback`
   (en local: `http://localhost:3312/api/drive/callback`).
4. Copiar las variables al entorno de Vercel (servicio `api`) y a `.env.local` de quien pruebe:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI` (opcional: si se deja vacío el backend lo calcula del host)
   - `GOOGLE_DRIVE_CARPETA_RAIZ` (opcional: id de la carpeta del Drive donde se crean las subcarpetas de tarea)
5. Entrar a **Gestión → Equipo → Conectar Drive del equipo** con la cuenta de Google del equipo y aceptar el permiso (`drive`).

Sin estas variables la pantalla dice "Falta configurar" y nada se rompe.

### 5.2 Claves VAPID para los avisos (bloque 8)

Generar una vez y guardar (la privada solo en el servidor):

```
npx web-push generate-vapid-keys
```

Cargar en el servicio `api`:
- `VAPID_CLAVE_PUBLICA`
- `VAPID_CLAVE_PRIVADA`
- `VAPID_ASUNTO` (por ejemplo `mailto:juan@rconcept.com`)

Después de cargarlas, cada persona entra a **Mi perfil → Avisos en este dispositivo → Activar avisos**.
Nota: las notificaciones del navegador exigen **HTTPS** (producción sí; localhost también funciona).

### 5.3 Base de datos

Correr las migraciones **006 → 007 → 008 → 009 → 010 → 011** en ese orden (tabla de la sección 2) y crear/verificar el bucket **`chat`** (lo crea la 006; es privado).

### 5.4 Listo para la APK

- El service worker (`public/sw.js`) y los endpoints ya son los definitivos.
- El puente de Capacitor solo necesita: pedir permiso de notificaciones, obtener el token del navegador/plugin, y hacer `POST /api/push/suscribir` con `{endpoint, p256dh, auth}`. Nada más cambia.
- Para FCM nativo habría que agregar el envío por FCM además de Web Push: **pendiente** (no está en este alcance).

---

## 6. Pendiente (marcado como pendiente, no simulado)

- **Pendiente · migraciones sin aplicar**: las seis migraciones son archivos; el backend en producción fallará en los campos nuevos hasta que se corran (igual que pasó con la 005 de F4).
- **Pendiente · Drive real**: todo el código de OAuth, carpetas y copia de entregas está escrito y con pruebas de error, pero **no se pudo probar contra Google** porque no hay credenciales. El primer recorrido real lo debe hacer Juan con las claves del punto 5.1.
- **Pendiente · envío push real**: el cifrado y la firma están probados por unidad (ida y vuelta + verificación de firma), pero **no se envió una notificación a un navegador real** porque faltan las claves VAPID.
- **Pendiente · grabación de audio en la APK**: en Android el permiso de micrófono necesita la entrada `RECORD_AUDIO` en el manifiesto de Capacitor (la web ya funciona).
- **Pendiente · push por FCM** para la APK (hoy es Web Push también en la app).
- **Pendiente · proveedor de Storage**: el bucket `chat` en Supabase tiene 1 GB y 20 MB por archivo en el plan gratis; con muchos videos hará falta revisar el plan o mandar todo por Drive.
- **Pendiente · unificación** de `components/AdminTareas.tsx` con la bandeja de `app/(app)/admin/page.tsx` (deuda que viene de F4; F5 agregó la carpeta de Drive solo en `AdminTareas`).
- **Pendiente · revisión de Juan a ojo** en modo oscuro (no se capturó variante oscura, igual que en F4).
- **Pendiente · orden de enlaces** con flechas usa el campo `orden`; si dos enlaces quedan con el mismo número el desempate es por id. No hay arrastrar y soltar.

---

## 7. Notas de implementación (para quien lea el código)

- **Un solo Store**: `store.StoreF5` se incrusta en `store.Store`, así que el backend en memoria (demo/pruebas) y el de Supabase implementan lo mismo. Los tests corren sin red.
- **Adjuntos**: `chat_adjuntos` acepta `storage_path` (archivo subido) o `url_externa` (carpeta de Drive). Un adjunto sin `mensaje_id` es un archivo subido que todavía no se envió.
- **Actividad "Archivos"** = adjuntos del chat + tareas con `enlace_medios`, como se acordó en el plan.
- **Cortes**: se suman tareas `aceptada` con `resuelta_en` en el rango y `precio_congelado` (el precio de la factura), no el precio vigente del tipo de trabajo.
- **Zona horaria**: los cortes usan la zona del servidor (`time.Local`) para el último día incluido.
- **Sin dependencias nuevas** en Go ni en npm (todo lo del PDF y del push es librería estándar).
