# HARNESS-REPORTE · F7 interfaz

**Rama:** `desde-cero`. **Base:** `e163a9d9916ed40ea77879ea188e3e38bede0a2b`. No se modificó `main` ni se ordenó un despliegue de producción. Los informes anteriores siguen disponibles en Git.

| Commit | Alcance |
|---|---|
| `b1f31b7b664a3514c9ca1efed537eeb6dc6f22e3` | Chat privado de RIA, sugerencia por rol, scroll, monograma y dictado. |
| `49f865f256d0d9932238e30ed4db6849a61640ee` | Trabajos, clientes, permisos, avisos, modo oscuro, pruebas, migración y generador de arquitectura. |
| Commit de este archivo | Mapa regenerado sobre el commit de implementación, 48 capturas, cuatro mediciones y reportes. Su identificador se obtiene con `git log -1 --format=%H -- HARNESS-REPORTE.md`. |

## Resultados

- **RIA:** separar desplazamiento del hilo y del layout resolvió el salto al enviar. El scroll sigue el último mensaje mientras la persona permanece abajo. Una notificación por mensaje conserva su posición de destino. El monograma se comparte en los chats privado y de equipo; la sidebar se mantuvo intacta (incluido su icono de navegación). RIA usa hoy un contrato de proveedores de texto (`/chat/completions`); no hay transcripción habilitada en ese contrato. El micrófono usa Web Speech API, respeta los permisos y deja el borrador listo para revisar.
- **Trabajos:** `/trabajos/nuevo` y `/trabajos/[id]` usan el formulario común; todos los accesos efectivos a asignación y edición desembocan ahí. Enlaces anteriores de Tareas y Trabajos continúan funcionando; los avisos nuevos de entregas al admin enlazan al detalle, y los avisos de los miembros conservan su tarea. Se registran fechas de asignación, entrega y resolución con los datos ya persistidos; no se simula un historial de cambios inexistente.
- **Clientes:** su detalle filtra en backend por cliente y calcula total, activos (pendientes o devueltos), entregados (trabajos con entrega registrada), por revisar, aprobados, cancelados y última entrega. La ficha y la edición no muestran ni escriben **Paquete contratado**; no se alteró esa columna. El backend guarda fotos JPEG, PNG o WebP (hasta 1 MB) en el bucket privado `clientes-fotos`; sirve únicamente la foto vigente con sesión de administración. Google Picker usa OAuth `drive.file` en el navegador; no expone el token del equipo. El backend comprueba el elemento con la conexión de Drive existente y guarda el título verificado, separado de las carpetas operativas.
- **Arquitectura:** se actualizaron los flujos y el manual de RIA. El generador ahora actualiza el HTML también al regenerarlo, reconoce las rutas protegidas y mapea 93 endpoints sin almacenar valores de entorno.

## Verificación

| Control | Resultado |
|---|---|
| `npm run mapa`, `npm run lint`, `npm run typecheck`, `node scripts/verificar-ria.mjs` | Pasaron. |
| `go build ./... && go vet ./... && go test ./...` en `backend` | Pasó; incluye permisos, cálculo de ficha, validación, tamaño y lectura de la foto vigente. |
| `node scripts/qa-f7.mjs` | Pasó en 375×812 / 1280×800, claro y oscuro. 48 PNG, 48 mediciones sin desborde y color de fondo real comprobado. |
| Interacciones | Sugerencia, estado pensando, respuesta larga y scroll final; dictado simulado; edición y cancelación con Escape y confirmación; perfil con persona preseleccionada y alta de trabajo; buscador, ficha, edición, foto y Picker simulados; notificación a un detalle. |
| API demo aislada | `healthz`, alta de cliente, asignación, detalle y conteo calculado en memoria por Go. |

Evidencia: [índice de capturas](capturas-f7/INDICE.md), [mediciones en 375 oscuro](capturas-f7/mediciones-375-oscuro.json), [mediciones en 1280 claro](capturas-f7/mediciones-1280-claro.json). Las integraciones externas se simularon durante QA web; no se presenta ese resultado como una validación contra Google, Supabase Storage real ni el proveedor de RIA.

Servidores iniciados ocultos, uno a la vez: Next PIDs `7356` y `4808` (sesiones sucesivas en `3313`); Go demo PID `14792` (`8313`, después de cerrar Next). Cerrados y verificados ambos puertos. Capturas con Edge headless. Sin escrituras a `.env*` ni acceso a `Sensible\`.

## Qué modelo hizo cada parte

- **RIA:** el checkout ya traía un avance sin commit del JSX, el monograma y el hook de dictado. Sin metadatos fiables para atribuir ese borrador. Esta ejecución, identificada en DSH como **`claude-neon-extra`**, lo revisó e integró, añadió los estilos y extendió el monograma al chat del equipo.
- **Trabajos, Clientes, notificaciones, backend, SQL, mapa, QA e informes:** **`claude-neon-extra`**. No se delegó ni hubo cambio de modelo durante esta ejecución. La identidad pública «Gemini 4 Neon» no está verificada más allá del alias de runtime; no se atribuye el código a otro proveedor por inferencia.

## ESTADO PARA RETOMAR

1. Aplicar [019_clientes_f7.sql](supabase/migrations/019_clientes_f7.sql), nueva e idempotente. Verificar antes el orden en [ORDEN.md](supabase/ORDEN.md); esta sesión no aplicó SQL.
2. En el proyecto `rconcept-systems`, habilitar Google Picker API, autorizar los orígenes del cliente OAuth web existente y definir `GOOGLE_PICKER_APP_ID` (número de proyecto) y `GOOGLE_PICKER_API_KEY` (restringida a Picker y a los orígenes autorizados). Confirmar que Gestión tiene el Drive del equipo conectado. Ver [configuración F7](README.md#8-interfaz-f7).
3. Con autorización, comprobar en un entorno no productivo selección de carpeta y archivo, carga y lectura de foto en el bucket real, dictado con micrófono físico y respuesta del proveedor real. No promover a `main` sin «publica» de Juan.
