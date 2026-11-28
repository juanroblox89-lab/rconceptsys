# HARNESS-REPORTE · Guion opcional al asignar un trabajo

**Rama:** `desde-cero`. **Base:** `a95f506fc703af307be46760948a1cb6339b49ee`. Entrega local sin commit, push ni despliegue. Se leyó el [brief](BRIEF-GUION-OPCIONAL-ASIGNACION.md) en disco. No se tocaron otros briefs sin seguimiento, archivos de entorno, `Sensible\`, secretos ni datos reales. No se aplicó SQL.

## Entrega y archivos tocados

| Área | Archivos y propósito |
|---|---|
| SQL | [029_guion_tarea.sql](supabase/migrations/029_guion_tarea.sql) y [ORDEN.md](supabase/ORDEN.md): columna `text not null default ''`, `CHECK` de 20.000 caracteres protegido por `pg_constraint`, sin cambios de permisos. |
| Persistencia | [store.go](backend/internal/store/store.go), [memory.go](backend/internal/store/memory.go), [flujo.go de memoria](backend/internal/store/flujo.go), [store.go de Supabase](backend/internal/supa/store.go): mapeo y persistencia de `guion`, edición protegida por el estado, facturas sin guion. |
| API y avisos | [handlers.go](backend/internal/httpapi/handlers.go), [flujo.go](backend/internal/httpapi/flujo.go), [guion.go](backend/internal/httpapi/guion.go), [push.go](backend/internal/httpapi/push.go), [notificaciones_eventos.go](backend/internal/httpapi/notificaciones_eventos.go), [tarea_whatsapp.go](backend/internal/httpapi/tarea_whatsapp.go): alta/edición, recorte de espacio exterior, errores humanos, marca de guion en asignación/reasignación/reapertura y enlace manual de WhatsApp. |
| RIA | [ria.go](backend/internal/httpapi/ria.go), [manual-admin.md](docs/ria/manual-admin.md), [manual-equipo.md](docs/ria/manual-equipo.md), [ria_docs_gen.go](backend/internal/httpapi/ria_docs_gen.go): extracto de hasta 180 puntos de código en datos de RIA privada con los permisos existentes; no se envía a RIA grupal. |
| Formulario y lectura | [FormularioAsignacion.tsx](components/FormularioAsignacion.tsx), [GuionTrabajo.tsx](components/GuionTrabajo.tsx), [PaginaTrabajo.tsx](components/PaginaTrabajo.tsx), [MisTareas.tsx](components/MisTareas.tsx), [AdminTareas.tsx](components/AdminTareas.tsx), [WhatsAppAsignacion.tsx](components/WhatsAppAsignacion.tsx), [FlujoTrabajo.module.css](components/FlujoTrabajo.module.css), [guion-trabajo.ts](lib/guion-trabajo.ts), [api.ts](lib/api.ts), [types.ts](lib/types.ts): guion opcional, editor autoexpandible con contador, vista de texto plano y copia. |
| Pruebas | [guion_test.go HTTP](backend/internal/httpapi/guion_test.go), [ria_guion_test.go](backend/internal/httpapi/ria_guion_test.go), [guion_test.go Supabase](backend/internal/supa/guion_test.go), [pedido_de_nuevo_test.go](backend/internal/supa/pedido_de_nuevo_test.go), [guion-trabajo.test.ts](lib/__tests__/guion-trabajo.test.ts), [package.json](package.json), [qa-guion.mjs](scripts/qa-guion.mjs), [capturas y mediciones](<_qa-guion/INDICE.md>). |
| Documentación y mapa | [README.md](README.md), [API-F2.md](docs/API-F2.md), [flujos.json](docs/arquitectura/flujos.json), [mapa.json](docs/arquitectura/mapa.json), [mapa.html](docs/arquitectura/mapa.html), [INFORME.md](INFORME.md) y este reporte. |
| Ajuste para lint global | [ActualizacionesApp.tsx](components/ActualizacionesApp.tsx): se conservó el comportamiento previo; la lectura inicial de las preferencias de `localStorage` se agenda tras hidratar, con cancelación al desmontar. Corrige el error preexistente `react-hooks/set-state-in-effect`. |

## Usos revisados y decisión

Se buscó `descripcion`, `Descripcion` y `especificaciones` en Go, TS/TSX, SQL y docs; también las lecturas/escrituras de `tareas`, los resúmenes y los exportes aunque no nombren `descripcion`.

| Lugar revisado | Decisión |
|---|---|
| [FormularioAsignacion.tsx](components/FormularioAsignacion.tsx), [types.ts](lib/types.ts), [api.ts](lib/api.ts) | `descripcion` sigue siendo Especificaciones y no cambia su límite. `guion` separado y opcional. No se trunca al pegar; se bloquea guardado si excede 20.000. Edición abre el guion existente. Cambios sin guardar contemplan guion, eliminación y reintentos de adjuntos. |
| [handlers.go](backend/internal/httpapi/handlers.go), [flujo.go](backend/internal/httpapi/flujo.go), [store.go](backend/internal/store/store.go), [memory.go](backend/internal/store/memory.go), [flujo.go de memoria](backend/internal/store/flujo.go), [store.go de Supabase](backend/internal/supa/store.go), [flujo.go de Supabase](backend/internal/supa/flujo.go) | Alta sin `guion` compatible; PATCH que lo omite no lo borra; enviar vacío lo limpia. Mismo permiso/estado que Especificaciones: solo admin, pendiente o devuelto. Límite de cuerpo ampliado solo para alta y edición, suficiente para 20.000 caracteres incluso con pares Unicode escapados. Los `select *` ya incluyen la nueva columna. |
| [PaginaTrabajo.tsx](components/PaginaTrabajo.tsx), [MisTareas.tsx](components/MisTareas.tsx), [AdminTareas.tsx](components/AdminTareas.tsx), [RoadmapHistorial.tsx](components/RoadmapHistorial.tsx) | Guion bajo Especificaciones para trabajador y en su tarjeta; para admin, en Historial y entregas y bandeja de revisión. Se muestra el guion vigente, no un snapshot por evento. Saltos de línea preservados, vista previa de hasta seis líneas/320 caracteres, expansión y copia completa. Sin bloque para tareas sin guion. |
| [FilaTrabajo.tsx](components/FilaTrabajo.tsx), [PaginaCliente.tsx](components/PaginaCliente.tsx), [clientes_f7.go](backend/internal/httpapi/clientes_f7.go), [asignaciones en memoria](backend/internal/store/memory_f5.go), [asignaciones en Supabase](backend/internal/supa/f5.go) | Listados compactos e indicadores por cliente/miembro no muestran texto adicional; el detalle autorizado es el lugar para abrirlo. Ficha de cliente mantiene el filtro por asignado para no administradores. El guion no cambia estadísticas, títulos ni filtros. |
| [drive_organizacion.go](backend/internal/httpapi/drive_organizacion.go), [drive_organizacion_test.go](backend/internal/httpapi/drive_organizacion_test.go) | Las carpetas siguen usando Especificaciones o título. No se usa guion para rutas, nombres ni metadatos de Drive. |
| [push.go](backend/internal/httpapi/push.go), [notificaciones_eventos.go](backend/internal/httpapi/notificaciones_eventos.go), [notificaciones.go](backend/internal/httpapi/notificaciones.go), [notificaciones_drive.go](backend/internal/httpapi/notificaciones_drive.go), [tarea_whatsapp.go](backend/internal/httpapi/tarea_whatsapp.go) | Asignación, reasignación al nuevo asignado y reapertura indican solo «Incluye guion» cuando corresponde. WhatsApp de asignación es una acción manual del admin y nunca envía automáticamente; no contiene guion ni Especificaciones. WhatsApp de entrega, recordatorios, bajas, cambios de Drive y avisos de entrega mantienen su propósito previo. |
| [ria.go](backend/internal/httpapi/ria.go), [ria_grupo.go](backend/internal/httpapi/ria_grupo.go), [ria_ayuda.go](backend/internal/httpapi/ria_ayuda.go) | RIA privada recibe solo un extracto, lo trata como dato y remite al detalle para el texto completo; un trabajador no recibe extractos de otros. RIA grupal no consulta tareas y no se cambian las fichas de ayuda estática. |
| [003](supabase/migrations/003_trabajos_tareas_facturas.sql), [022](supabase/migrations/022_tareas_referencias_drive.sql), [023](supabase/migrations/023_asignaciones_adjuntos.sql), [025](supabase/migrations/025_entrega_metodo_reversion_y_rechazo_adjuntos.sql), [027](supabase/migrations/027_pedido_de_nuevo.sql), [028](supabase/migrations/028_entrega_drive_y_asignador.sql), [pedido_de_nuevo.go](backend/internal/httpapi/pedido_de_nuevo.go) | 003 queda histórico, la 029 agrega el campo. Se revisaron 013–028: 013–021, 024 y 026 no escriben ni proyectan fila de tarea; 022 agrega referencias y 023 comprueba id/estado; 025 y 028 leen estado y datos de ejecución y solo actualizan campos de entrega/aprobación; 027/028 reabren la misma fila sin sobreescribir instrucciones. Ninguna RPC necesita `CREATE OR REPLACE`. Los `INSERT` de `tarea_entregas` y `tarea_historial` copian campos de entrega, no `descripcion` ni guion. Al pedir de nuevo, el guion viaja en la respuesta del trabajo reabierto con el mismo ID. |
| [Facturas UI](<app/(app)/factura/page.tsx>), [Gestión](<app/(app)/admin/page.tsx>), [memory.go](backend/internal/store/memory.go), [store.go Supabase](backend/internal/supa/store.go), [corte_export.go](backend/internal/httpapi/corte_export.go) | Ni las líneas JSON de factura ni la UI incluyen el guion. CSV y PDF de corte son agregados por persona; no incluyen Especificaciones ni guion. No se toca costo, estado de pago ni totales. |
| [f2_test.go](backend/internal/httpapi/f2_test.go), [f4_test.go](backend/internal/httpapi/f4_test.go), [flujo_test.go](backend/internal/httpapi/flujo_test.go), [drive_organizacion_test.go](backend/internal/httpapi/drive_organizacion_test.go), [guion_test.go](backend/internal/httpapi/guion_test.go), [API-F2.md](docs/API-F2.md), [API-F3.md](docs/API-F3.md) | Casos anteriores siguen cubriendo clientes que no envían guion. Casos nuevos cubren alta, edición, invalidación, borrado, permisos, facturas, avisos y reapertura; API-F2 documenta el contrato, el ejemplo histórico API-F3 sigue válido. |
| Falsos positivos del grep | [Modal](components/ui/Modal.tsx) y sus textos en [CambiosSinGuardar](components/CambiosSinGuardar.tsx), [PedirDeNuevoTrabajo](components/PedirDeNuevoTrabajo.tsx), [Estilo](app/estilo/page.tsx), [Gestión](<app/(app)/admin/page.tsx>) y [RIA UI](<app/(app)/ria/page.tsx>) no son descripciones de tarea. Tampoco [AdminEquipo](components/admin/AdminEquipo.tsx), [EquipoBarra](components/EquipoBarra.tsx), [f5 HTTP](backend/internal/httpapi/f5.go), [f5 tests](backend/internal/httpapi/f5_test.go), [f5 store](backend/internal/store/f5.go), [f5 memoria](backend/internal/store/memory_f5.go), [f5 Supabase](backend/internal/supa/f5.go) ni [006](supabase/migrations/006_equipo_y_adjuntos_chat.sql) (equipo). [Chat](<app/(app)/page.tsx>), [ComandosChat](components/ComandosChat.tsx), [rutas-ria.ts](lib/rutas-ria.ts) y [ria.ts](lib/ria.ts) describen comandos o rutas; [004 de biblioteca](supabase/_legacy_v2/004_biblioteca.sql) describe material de biblioteca. No se añadió guion. |

## Verificación

| Control | Resultado |
|---|---|
| `npm run mapa` | OK: referencias válidas, regenerados ambos archivos, 125 endpoints y 30 tablas. |
| `npm run typecheck` | OK. |
| `npm run lint` | OK; primera pasada encontró un error previo en Actualizaciones y una advertencia del contador, corregidos. |
| `npm test` | 35/35; 5 casos nuevos de guion. |
| `cd backend && go vet ./... && go test -count=1 ./...` | OK: `httpapi`, `store`, `supa`. Incluye 20.000 emoji en alta, PATCH escapado y rechazo de 20.001, reapertura y mapeo simulado de Supabase. |
| `node scripts/verificar-ria.mjs` y compilación aislada `next build --webpack` | OK; Next 16.3.5 generó 22 páginas estáticas. |
| QA visual | [24 PNG](<_qa-guion/INDICE.md>) y [mediciones](<_qa-guion/mediciones.json>) a 375×812 y 1280×800 en claro, oscuro y Glass. 24/24 con ancho igual al viewport y sin desborde horizontal. |
| QA de interacción | Expansión con teclado, guard de salida por solo guion, pegado de 20.001 sin recorte, POST/PATCH, lectura admin, prefijo de WhatsApp sin abrirlo, lectura/expansión/copia en trabajador, escape de `<inicio>`, y ausencia de bloque sin guion. Se usaron API y portapapeles del navegador simulados; no se probó una integración externa real. |
| Subagente de revisión visual | Aprobó las 24 capturas tras mejorar encuadre y reinspeccionó la compilación final. Confirmó contador, saltos, líneas largas, contraste del guion y acciones sin solapes. Observación baja, fuera de alcance: badge «1» del menú Tareas tiene poco contraste en Glass escritorio. |
| Procesos y diff | `git diff --check` OK. Edge exclusivamente headless; Next oculto en `127.0.0.1:3349`, PIDs `25432`, `3000`, `25628` **sucesivos**, nunca simultáneos. Los tres PIDs y el puerto quedaron cerrados. Se compiló una copia aislada con archivos fuente explícitos, sin cargar .env, mock de API y fuente Inter de caché local. |
| SQL real | No ejecutado. Validación estática, aplicación real pendiente en base aislada y autorizada. |

## ESTADO PARA RETOMAR

1. Elías puede revisar el diff local en `desde-cero`. La [migración 029](supabase/migrations/029_guion_tarea.sql) es reaplicable y quedó copiada al portapapeles. Verificar primero en una base aislada con 001–028 aplicadas; correrla dos veces, confirmar valor `''` en trabajos previos y probar inserción de 20.000/20.001 caracteres. No hubo cambios de datos ni despliegue.
2. Tras validar y con autorización, aplicar la migración **después de 028 y antes del backend que guarda guiones**. Publicar backend y frontend coordinados. Probar con datos sintéticos asignación, edición, lectura de trabajador/admin y reapertura sin guion en factura.
3. Las capturas son entregables locales, no archivos a publicar. Consulta [QA visual](<_qa-guion/INDICE.md>). No quedó servidor de QA activo.

---

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
