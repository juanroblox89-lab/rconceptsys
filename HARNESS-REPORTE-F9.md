# HARNESS-REPORTE-F9 · Drive de asignaciones y raíz existente

## Código publicado

- Base: `b0a14a70f73d314d459e73e2cd7c4c7fa769db5b`.
- Implementación, SQL, mapa y QA: [`40895e4920a40783996aaa6af786c34115dfecfa`](https://github.com/juanroblox89-lab/rconceptsys/commit/40895e4920a40783996aaa6af786c34115dfecfa), confirmado en `origin/desde-cero`. `origin/main` quedó en la base indicada.
- GitHub informó `Vercel: Deployment has completed` para el commit. No se comprobó el entorno del despliegue ni se ejecutó una asignación contra él; ese estado no confirma que la base tenga la 022.

## Qué cambió

- En [el formulario](components/FormularioAsignacion.tsx#L42-L66), la carpeta del cliente se agrega automáticamente. Al cambiar de cliente se reemplaza solo la automática. Si ya hay tres personalizadas, se pide liberar un cupo antes de elegir un cliente con carpeta. El [selector](components/SelectorCarpetaTrabajo.tsx) permite **Añadir carpeta**, **Cambiar** (archivos y carpetas) y **Quitar** con Sí/No en línea. Usa el token efímero del Drive del equipo y abre en la carpeta del cliente cuando está disponible.
- [La 022](supabase/migrations/022_tareas_referencias_drive.sql) agrega `tareas.drive_referencias` y el límite de tres en JSONB. Go valida tipo, ID, duplicados y URL HTTPS de Drive/Docs. La lista explícita permite reemplazar o quitar la automática sin que el backend la vuelva a agregar. `NULL` permite leer un vínculo antiguo; `[]` conserva una eliminación explícita. No hay actualización retroactiva.
- En el detalle y **Mis tareas** se muestran botones **Abrir**. Solo el admin cambia referencias en trabajos pendientes o devueltos. La carpeta operativa que recibe entregas no se modifica al editar referencias. No se cambian permisos de Google: cada asignado necesita acceso en Drive para abrir un enlace real.
- [Organizar Drive](backend/internal/httpapi/drive_organizacion.go) conserva la raíz registrada y vincula subcarpetas directas de clientes por nombre sin espacios externos, mayúsculas ni tildes. Crea solo la carpeta directa de un cliente faltante. No crea `RConcept`, `Clientes`, `Recursos`, `Archivo`, `Material del lugar` ni `Producto`. Si no se configuró una raíz, usa **Mi unidad** sin crear ramas fijas. Una reconexión conserva la raíz registrada.
- Gestión muestra el nombre obtenido de Google (`Carpeta raíz: Rohlfing concept` en el escenario del brief). **Simular movimientos** admite que los IDs de raíz y clientes coincidan. No se ejecutaron traslados reales: la regresión del traslado F8 corre solo contra el doble Go.

## Verificación

| Prueba | Resultado |
|---|---|
| `npm run lint` y `npm run typecheck` | OK |
| `go build ./...`, `go vet ./...`, `go test -count=1 ./...` | OK en `backend/` |
| `npm run mapa` | OK después de actualizar [flujos.json](docs/arquitectura/flujos.json); [mapa.json](docs/arquitectura/mapa.json) y [mapa.html](docs/arquitectura/mapa.html) regenerados |
| `node scripts/verificar-ria.mjs` y `git diff --check` | OK |
| [Go: referencias](backend/internal/httpapi/drive_referencias_trabajo_test.go) | Rechazo de cuatro referencias en POST y PATCH; 403 al asignado si intenta editar; automática con URL registrada; persistencia, vaciado explícito, URL inválida y lectura exclusiva del asignado |
| [Go: Drive simulado](backend/internal/httpapi/drive_organizacion_test.go) | Tilde Unicode, mayúsculas y espacios finales; carpeta existente sin escrituras; una sola carpeta directa al faltar; nombre de raíz; Picker de equipo y simulación con raíz = clientes |
| [QA headless](scripts/qa-f9.mjs) | Cuatro combinaciones de ancho/tema: Picker con carpeta inicial del cliente, archivos y carpetas, Escape/Enter, límite de 3, cambio de cliente, Sí/No, guardado y edición, apertura como asignado, legados con solo ID o solo URL, nombre de raíz y simulación sin aplicar |

Las pruebas usaron store en memoria, doble HTTP de Drive y rutas de navegador simuladas. No se usaron credenciales reales ni se aplicó la migración. No se abrió ninguna ventana visible. Hubo un solo Next a la vez en `127.0.0.1:3319`: PID `45844` (primera tanda), PID `49220` (tanda final en copia aislada sin archivos de entorno). Ambos árboles se cerraron y no quedó el puerto escuchando. Edge se ejecutó headless y se cerró al final. No se editaron `.env*`, `Sensible/` ni `ria_modelo.go`.

## Capturas

[ZIP con los 12 PNG y mediciones](CAPTURAS-F9.zip) · [Mediciones JSON](capturas-f9/mediciones.json). Viewports 375×812 y 1280×800, sin desborde horizontal y con filas de 48 px. Los PNG muestran el formulario completo: solo para capturar, se expandió el contenedor de scroll, sin cambiar el ancho ni el orden de los elementos.

| Viewport y tema | 1 referencia | 2 referencias | 3 referencias |
|---|---|---|---|
| 375, claro | [PNG](capturas-f9/asignar-1-ref-375-claro.png) | [PNG](capturas-f9/asignar-2-ref-375-claro.png) | [PNG](capturas-f9/asignar-3-ref-375-claro.png) |
| 375, oscuro | [PNG](capturas-f9/asignar-1-ref-375-oscuro.png) | [PNG](capturas-f9/asignar-2-ref-375-oscuro.png) | [PNG](capturas-f9/asignar-3-ref-375-oscuro.png) |
| 1280, claro | [PNG](capturas-f9/asignar-1-ref-1280-claro.png) | [PNG](capturas-f9/asignar-2-ref-1280-claro.png) | [PNG](capturas-f9/asignar-3-ref-1280-claro.png) |
| 1280, oscuro | [PNG](capturas-f9/asignar-1-ref-1280-oscuro.png) | [PNG](capturas-f9/asignar-2-ref-1280-oscuro.png) | [PNG](capturas-f9/asignar-3-ref-1280-oscuro.png) |

## ESTADO PARA RETOMAR

1. La [migración 022](supabase/migrations/022_tareas_referencias_drive.sql) está anotada en [el orden](supabase/ORDEN.md) y se copió al portapapeles. Elías debe aplicarla antes de usar F9 con una base real. Es segura de ejecutar más de una vez. No necesita migrar vínculos antiguos ni volver a organizar los 13 clientes ya enlazados.
2. Después de aplicar la 022, verificar en el entorno autorizado que aparece `Carpeta raíz: Rohlfing concept`; probar Picker con un archivo y una carpeta, y revisar apertura desde una cuenta asignada con permiso de Google. No confirmar traslados en el Drive real para esta verificación.
3. Para repetir el QA sin datos reales, correr [el script](scripts/qa-f9.mjs) con un único Next aislado escuchando en `127.0.0.1:3319`. Las pruebas de Go son independientes y no levantan un backend real.
