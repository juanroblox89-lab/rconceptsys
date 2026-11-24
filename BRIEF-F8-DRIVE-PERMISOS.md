# BRIEF F8: Drive del equipo organizado, selector sin reconectar, permisos y botones (23 nov 2026)

## Reglas duras (leer primero)

- Rama `desde-cero`. Push solo a `desde-cero`; **nunca a `main`**: publica Elías cuando Juan diga "publica".
- Prohibido: force-push, reset y stash. No tocar `.env*` ni `Sensible\`. Conservar el autor de git del repo.
- Como máximo un servidor de verificación a la vez (`next dev` + backend demo) y máximo 2 subagentes.
- No agregar `regions` a `vercel.json`.
- Antes de cerrar deben pasar: `npm run lint`, `npm run typecheck`, `cd backend && go build ./... && go vet ./... && go test ./...` y `npm run mapa`. Actualizar `docs/arquitectura/flujos.json`.
- Las migraciones SQL van nuevas, numeradas (021+) e idempotentes, anotadas en `supabase/ORDEN.md`. **No las apliques**: Elías las corre.
- Reporte en `HARNESS-REPORTE-F8.md`: hashes, qué se probó y la sección "ESTADO PARA RETOMAR".
- No tocar `backend/internal/httpapi/ria_modelo.go` (Elías lo cambió en 51112d6).

## Contexto

- El Drive del equipo se conecta en Gestión → Equipo (`components/admin/AdminEquipo.tsx`, `backend/internal/httpapi/drive.go`) con permiso `drive` completo. El token queda en el servidor (`store.f5` / `supa/f5.go`, tabla de `008_drive_conexion.sql`).
- Hoy **no hay carpeta raíz**: se ve "Sin carpeta raíz fija: las subcarpetas se crean en el Drive de la cuenta conectada", y las subcarpetas de tareas quedan sueltas en "Mi unidad".
- La estructura que se quiere está en `DRIVE-ESTRUCTURA.md`, en la raíz del repo. Léela.
- El selector de referencias del cliente (`components/PickerDriveCliente.tsx`) pide un OAuth de Google en el navegador **cada vez**. Juan: "es jodido reconectar el drive cada vez, que solo sea seleccionar y ya".

## Tareas

### 1. Botón "Desconectar Drive"
- Botón de peligro en rojo, usando una variante existente de `components/ui/Boton` o creando `peligro` con tokens, en claro y oscuro.
- Antes de desconectar, confirmación simple Sí/No en línea, como la de "¿Quitar «X»?" de `PickerDriveCliente`: "¿Desconectar el Drive del equipo? Las tareas nuevas dejarán de crear carpetas."

### 2. Drive organizado y conectado con el del equipo
- Al conectar, o con un botón "Organizar Drive" para los admins si ya está conectado, el backend busca o crea en la cuenta conectada la estructura de `DRIVE-ESTRUCTURA.md`:
  - `RConcept/` con `Clientes/`, `Recursos/` y `Archivo/`;
  - guarda `RConcept` como `carpeta_raiz_id` (migración si hace falta);
  - es idempotente: busca por nombre y padre antes de crear.
- Cada cliente tiene su carpeta `Clientes/<Nombre>/` con `Material del lugar/` y `Producto/`. Se crea al dar de alta un cliente y, para los existentes, al organizar. Guardar `drive_carpeta_id` y su URL en el cliente (migración nueva).
- La carpeta de cada tarea va dentro de la de su cliente, con el nombre `AAAA-MM-DD Tipo · Descripción` y adentro `Material/` y `Entregas/`. Si la tarea no tiene cliente, va en la raíz `RConcept/`. Ajustar `flujo.go`, donde hoy usa `carpeta_raiz_id`.
- **Material existente:** las carpetas de tareas que ya se crearon sueltas en "Mi unidad" se **mueven** a la carpeta de su cliente con `files.update` y `addParents`/`removeParents`.
  - Nunca borres nada.
  - Primero un modo de simulación que liste qué se movería; luego se aplica.
  - Registra en el reporte qué se movió.
  - No toques archivos que no haya creado la app.
- En Gestión → Equipo, mostrar "Carpeta raíz: RConcept" con un enlace "Abrir en Drive", no el id crudo.

### 3. Selector de referencias del cliente sin reconectar
- Endpoint de admin nuevo, por ejemplo `GET /api/admin/drive/picker-token`. Devuelve un access token de corta vida del **Drive del equipo** (refresca con el refresh token guardado). No devuelve nunca el refresh token.
- `PickerDriveCliente` usa ese token: nada de `initTokenClient` ni ventana de permisos de Google. Clic en "Seleccionar en Google Drive" o "+ Añadir" y se abre el selector directo.
- El selector abre en la carpeta del cliente si existe (`DocsView.setParent`); si no, en `RConcept/`.
- Si el Drive del equipo no está conectado, el botón queda deshabilitado con el texto "Conecta el Drive del equipo en Gestión → Equipo".

### 4. Permisos: solo los admins cambian datos de clientes y del equipo
- En el backend, verificar que **todas** las rutas que modifican clientes, fotos de clientes, el Drive y los datos del equipo exijan admin. Agregar tests de 403 para un usuario normal.
- En el frontend, un usuario no admin **no ve** botones de edición: "Cambiar foto" y "Elegir foto" del cliente, "Guardar ficha", "Conectar o Desconectar Drive", el selector de Drive ni la edición del equipo. La ficha queda en solo lectura y los enlaces "Abrir" siguen visibles.
- La foto de **perfil propio** (`app/(app)/perfil/page.tsx`) sí la puede cambiar cada usuario; no la toques.
- Probar con el usuario demo no admin y con admin.

### 5. Botones con estilo de la app
- En las filas de referencias (`.referenciaAccion` en `components/FlujoTrabajo.module.css`) y en la ficha (`EnlaceCliente` en `components/PaginaCliente.tsx`), "Abrir" se ve como un enlace subrayado azul con fondo celeste, y al hacer clic queda seleccionado sin estilo.
  - Debe verse como los demás botones secundarios pequeños de la app (`Boton variante="secundario" tamano="sm"` o una clase equivalente para `<a>`): sin subrayado, con el mismo radio, hover, foco visible y estado activo.
  - El ícono de "abre en otra pestaña" va solo si de verdad abre otra pestaña.
- Revisar toda la app (`components/**`, `app/**`) y llevar al mismo estilo cualquier `<a>` o `<button>` que se vea como enlace del navegador por defecto o que quede "seleccionado" tras el clic. Listar en el reporte cuáles cambiaste.
- Capturas a 375 y 1280 px, en claro y oscuro, de: Gestión → Equipo, la ficha y la edición del cliente (como admin y como no admin) y el selector.

### 6. Textos de interfaz sin relleno
- Quitar el texto de apoyo «Tarea nueva, tarea que vence mañana y entrega aprobada. En la APK se conecta igual.» de **Avisos en este dispositivo**.
- Revisar los textos visibles de `app/**` y `components/**`, incluidos errores, avisos y toasts. Quitar o recortar lo obvio, las explicaciones técnicas inútiles y el relleno; conservar restricciones, consecuencias y acciones necesarias.
- Inventariar cada eliminación o recorte por archivo en `HARNESS-REPORTE-F8.md`. Ejecutar lint, typecheck y mapa; push solo a `desde-cero`.

## Criterios de aceptación
- Desconectar es rojo y pide Sí/No.
- Al conectar u organizar queda `RConcept/Clientes/<cliente>/…` en el Drive y las tareas nuevas caen en la carpeta de su cliente.
- Elegir referencias de Drive en un cliente no muestra ventanas de permiso de Google.
- Un no admin no puede (403) ni ve cómo editar clientes, Drive o equipo.
- No queda ningún botón o enlace con estilo por defecto del navegador.
- La tarjeta de avisos no repite los tipos de aviso ni menciona la APK. Los textos que quedan en la app aportan contexto, estado o un siguiente paso.
