# Informe · Chat del equipo y retención segura de 15 días

**Implementado y verificado en local** sobre `desde-cero` (HEAD `a95f506`). Cambios sin commit, push ni despliegue. El informe previo sigue debajo.

| Parte | Resultado |
|---|---|
| [Chat y compositor](<app/(app)/page.tsx>) · [estilos](<app/(app)/chat.module.css>) | Chip en la columna del campo, burbujas agrupadas con hora propia, citas con extracto y salto al original visible. |
| [Acciones](components/chat/AccionesMensaje.tsx) · [reproductor](components/chat/ReproductorAudio.tsx) · [grabadora](components/chat/GrabadorAudio.tsx) | Flecha al hover o foco, pulsación táctil de 410 ms; responder, copiar, editar, conservar y eliminar según permisos. Graba o adjunta notas de voz; play/pausa, onda con clic y arrastre, teclado y tiempo real. |
| [API](backend/internal/httpapi/chat_whatsapp.go) · [Storage](backend/internal/supa/chat_whatsapp.go) | Envío de chat atómico. El cron autenticado reclama elegibles, borra el binario primero y registra `purgado_en` y conteos tras verificar la ausencia del objeto. Protegidos, Drive y trabajos abiertos, en revisión o devueltos no se purgan. |
| [Migración](supabase/migrations/030_chat_whatsapp_y_retencion.sql) · [orden](supabase/ORDEN.md) · [operación](docs/RETENCION-STORAGE-15D.md) | `030` en vez de `027`: 027 ya corresponde a Pedido de nuevo y 029 estaba reservada. La migración mantiene texto, historial, referencias, transcripciones y resúmenes. No se aplicó a producción. |
| [Arquitectura](docs/arquitectura/flujos.json) · [mapa generado](docs/arquitectura/mapa.html) | Actualizado con ambos flujos; 127 endpoints validados por el generador. |

### Verificación

- `npm run mapa`, `npm run typecheck`, `npm run lint` y `npm test`: OK, 39 pruebas TS. `go vet ./...` y `go test -count=1 ./...`: OK en los paquetes Go.
- [Prueba SQL](scripts/qa-retencion-sql.mjs): dos aplicaciones consecutivas en PostgreSQL embebido con esquema reducido. Confirma elegibilidad, permisos, rechazo antes de eliminar el objeto, conservación de resumen/transcripción y bloqueo de reapertura durante la purga. [Pruebas Go de Storage](backend/internal/supa/retencion_test.go): DELETE antes de marcar, fallo sin marca, alcance de la ruta.
- [12 capturas](<_qa-chat-whatsapp/INDICE.md>) · [mediciones](<_qa-chat-whatsapp/resultados.json>): Edge headless, 375×812 y 1280×800, claro, oscuro y Glass. Sin desborde horizontal; onda, reproductor, citas, conservación y grabación sintética comprobados. Next aislado y oculto; PID final `18164` cerrado, puerto `3397` liberado. No se usaron secretos, Drive real ni datos de producción.

### Antes de activar la purga con archivos reales

Validar el cron, las firmas y el DELETE en un Supabase aislado antes de publicar. El primer cron autorizado sobre un histórico real puede purgar archivos elegibles de inmediato: revisar candidatos y **marcar lo que se deba conservar antes de activarlo**. Si Storage o la confirmación fallan, el reclamo queda reintentable después de 5 minutos; la tarea no se reabre mientras exista ese reclamo. No se verificaron micrófono físico, Safari ni el límite de subida del hosting remoto.

---

# Informe · Guion opcional al asignar un trabajo

**Listo para revisión de Elías.** Cambios locales en `desde-cero`, sin commit, push ni despliegue.

- **Asignación:** debajo de Especificaciones se puede añadir un guion por separado. El textarea crece al escribir, admite pegar texto sin truncarlo y valida hasta 20.000 caracteres. Se puede editar o borrar en trabajos pendientes o devueltos.
- **Lectura:** trabajador y admin pueden leer una vista previa, ver el guion completo y copiarlo conservando los saltos de línea. **Pedir de nuevo** conserva el guion; facturas, CSV y PDF no lo incluyen.
- **Avisos:** el push y el aviso manual de WhatsApp solo indican «Incluye guion». RIA privada recibe un extracto breve según los permisos existentes; RIA grupal no recibe guiones.
- **Verificación:** mapa, tipos, lint, 35 pruebas de frontend, `go vet` y pruebas Go en verde. [24 capturas](<_qa-guion/INDICE.md>) en 375×812 y 1280×800, en claro, oscuro y Glass, revisadas por un subagente y sin desborde horizontal. Edge solo headless y servidor oculto; puerto de QA cerrado.

**Siguiente paso:** validar en una base aislada la [migración 029](supabase/migrations/029_guion_tarea.sql), después de 028 y antes de publicar el backend. Quedó en el portapapeles; no se ejecutó SQL. El [reporte técnico](HARNESS-REPORTE.md) incluye archivos, auditoría, verificación y estado para retomar.

---

# Informe · Pulido integral QA en vivo (26 nov)

**Rama `desde-cero` · cambios locales, sin commit ni push.**

## Resumen de cambios por punto

1. **`/help` y autocompletado `/` en chat del equipo** ([app/(app)/page.tsx](<app/(app)/page.tsx>), [components/ComandosChat.tsx](components/ComandosChat.tsx), [lib/ria.ts](lib/ria.ts), [backend/internal/httpapi/ria_grupo.go](backend/internal/httpapi/ria_grupo.go)): menú flotante navegable por teclado/clic al escribir `/`, tarjeta privada de `/help` sin publicar en el grupo, normalización de `/ria` / `/RIA` / `/ría` y listado oficial de comandos en el prompt grupal de RIA.
2. **Clic en `RIA` → `/ria`** ([app/(app)/page.tsx](<app/(app)/page.tsx>)): el avatar y el nombre **RIA** en mensajes del chat grupal navegan a `/ria`.
3. **«Por corregir», «Corregir» y confirmación en «Volver a entregar»** ([components/MisTareas.tsx](components/MisTareas.tsx)): sección renombrada de «Rechazadas» a **«Por corregir»**, enlace «Ver trabajo» cambiado a **«Corregir»**, y confirmación *«¿Estás seguro de que corregiste lo que te pidieron?»* con botón secundario **«Ver trabajo y correcciones»**.
4. **Logo oficial de WhatsApp** ([components/ui/IconoWhatsApp.tsx](components/ui/IconoWhatsApp.tsx)): SVG oficial (burbuja con teléfono) en pestaña, banner y chips de entrega por WhatsApp en `MisTareas.tsx`, `AdminTareas.tsx` y `RoadmapHistorial.tsx`.
5. **Colores semánticos y contraste** ([app/estilo/tokens.css](app/estilo/tokens.css), [app/estilo/apariencia.css](app/estilo/apariencia.css), [app/estilo/componentes.css](app/estilo/componentes.css), [app/(app)/tareas/tareas.module.css](<app/(app)/tareas/tareas.module.css>), [components/FlujoTrabajo.module.css](components/FlujoTrabajo.module.css)): naranjado para avisos, alertas y vencimientos (`Venció hace X días`, `Vencido`); rojo para acciones destructivas; acento en CTAs principales (`.rc-btn--primario`) y verde suave en Guardar cambios; alto contraste en «Tu nota:» / «Nota de la persona:» y botón **«Cambiar»** (`variante="secundario"`).
6. **Notificaciones con colores y jerarquía visual** ([components/CampanaNotificaciones.tsx](components/CampanaNotificaciones.tsx), [components/CampanaNotificaciones.module.css](components/CampanaNotificaciones.module.css)): barra lateral, ícono y color por tipo (devolución/cancelación, entrega lista/aprobada/corte, vencimiento/reapertura, RIA, chat/asignaciones), pestañas **Bandeja / Leídas** y engranaje a `/configuracion`.
7. **Rediseño de «Bandeja por revisar» y WhatsApp por trabajo** ([components/AdminTareas.tsx](components/AdminTareas.tsx), [app/(app)/admin/admin.module.css](<app/(app)/admin/admin.module.css>), [backend/internal/httpapi/tarea_whatsapp.go](backend/internal/httpapi/tarea_whatsapp.go), [backend/internal/httpapi/flujo.go](backend/internal/httpapi/flujo.go)): tarjeta alineada con «Valor:», estructura de entregables Drive + «Carpeta de la tarea» y botonera inferior (`Abrir`, `Rechazar`, `Aceptar`); enlace WhatsApp de quien entregó (revisor) y de quien asignó/reasignó (`asignador_id`, sin sustituir por `creado_por`), con aviso claro si no hay número válido.
8. **Grabación de audio viva** ([components/ui/BarraGrabacion.tsx](components/ui/BarraGrabacion.tsx), [components/ui/BarraGrabacion.module.css](components/ui/BarraGrabacion.module.css), [components/AdjuntosAsignacion.tsx](components/AdjuntosAsignacion.tsx), [components/chat/GrabadorAudio.tsx](components/chat/GrabadorAudio.tsx)): punto rojo pulsante, temporizador `00:00`, medidor reactivo (`AnalyserNode` + fallback animado) y controles Detener/Cancelar.
9. **«Resumir con IA» en «Rechazar tarea»** ([components/AdminTareas.tsx](components/AdminTareas.tsx), [components/AdjuntosAsignacion.tsx](components/AdjuntosAsignacion.tsx), [backend/internal/supa/asignacion_adjuntos.go](backend/internal/supa/asignacion_adjuntos.go)): habilitado en borrador/guardado y visible con resumen, transcripción y reintento en `AdjuntosRechazoVista`.
10. **Validación de peso y contador `X / Y MB`** ([lib/adjuntos-asignacion.ts](lib/adjuntos-asignacion.ts), [backend/internal/httpapi/asignacion_formatos.go](backend/internal/httpapi/asignacion_formatos.go), [backend/internal/httpapi/asignacion_adjuntos.go](backend/internal/httpapi/asignacion_adjuntos.go), [backend/internal/httpapi/asignacion_resumen.go](backend/internal/httpapi/asignacion_resumen.go)): mensajes exactos según tipo (imagen 10 MB, audio 25 MB, video 50 MB) y contador real `X / Y MB` por adjunto.
11. **Aviso de cuenta `ladlejuan26@gmail.com`, errores Picker y árbol en Drive** ([components/ui/AvisoCuentaDrive.tsx](components/ui/AvisoCuentaDrive.tsx), [lib/google-picker.ts](lib/google-picker.ts), [lib/picker-trabajador.ts](lib/picker-trabajador.ts), [components/PickerDriveCliente.tsx](components/PickerDriveCliente.tsx), [components/SelectorCarpetaTrabajo.tsx](components/SelectorCarpetaTrabajo.tsx), [backend/internal/httpapi/clientes_f7.go](backend/internal/httpapi/clientes_f7.go), [backend/internal/httpapi/drive.go](backend/internal/httpapi/drive.go), [backend/internal/httpapi/drive_organizacion.go](backend/internal/httpapi/drive_organizacion.go), [backend/internal/httpapi/drive_entrega_trabajador.go](backend/internal/httpapi/drive_entrega_trabajador.go)): aviso previo en entrega/rechazo/asignación/referencias, mensajes humanos si falla clave u origen de Picker, carpeta inicial del cliente + árbol del equipo (`raiz_id`) y Unidades compartidas (`SUPPORT_DRIVES`, `supportsAllDrives`, paginación `nextPageToken`) sin ampliar alcance a trabajadores.
12. **Hora visible en «Historial y entregas»** ([components/FilaTrabajo.tsx](components/FilaTrabajo.tsx), [components/RoadmapHistorial.tsx](components/RoadmapHistorial.tsx)): fecha y hora en `America/Bogota` en todos los hitos y eventos.
13. **Tarjetas de «Por corregir» más compactas** ([components/MisTareas.tsx](components/MisTareas.tsx), [app/(app)/tareas/tareas.module.css](<app/(app)/tareas/tareas.module.css>), [components/AdjuntosAsignacion.module.css](components/AdjuntosAsignacion.module.css)): distribución en dos columnas en escritorio con rejilla adaptable para adjuntos y una columna en móvil sin desborde.
14. **Hasta 4 elementos en entrega por Drive** ([backend/internal/httpapi/entrega_drive.go](backend/internal/httpapi/entrega_drive.go), [backend/internal/httpapi/handlers.go](backend/internal/httpapi/handlers.go), [lib/referencias-trabajo.ts](lib/referencias-trabajo.ts), [supabase/migrations/028_entrega_drive_y_asignador.sql](supabase/migrations/028_entrega_drive_y_asignador.sql)): combinación de hasta 4 carpetas/archivos únicos, validación en servidor, conservación al editar y compatibilidad con entregas previas de 1 elemento.

## Verificación y migración pendiente

- **Migración pendiente de aplicar:** ejecutar [028_entrega_drive_y_asignador.sql](supabase/migrations/028_entrega_drive_y_asignador.sql) (registrada en [supabase/ORDEN.md](supabase/ORDEN.md)) en Supabase antes de desplegar estos cambios.
- **Comandos en verde:** `node scripts/verificar-ria.mjs`, `npm run mapa`, `npm run typecheck`, `npm run lint`, `npm test` (30/30), `npm run build` (22 rutas), `cd backend && go vet ./... && go test -count=1 ./...` (`httpapi`, `store`, `supa`).
- **QA visual headless (`scripts/qa-pulido-26nov.mjs`):** probado a `375×812` y `1280×800` en Claro, Oscuro y Glass con `scrollWidth === innerWidth` y 0 errores; servidor QA cerrado al terminar.
- **Riesgos en producción:** validar `GOOGLE_PICKER_KEY` y orígenes autorizados en Google Cloud Console con cuenta real `ladlejuan26@gmail.com`; las tareas creadas antes de la migración 028 sin reasignación posterior mantienen `asignador_id = NULL` (no se sustituye por `creado_por` sin evidencia).

---

# Informe · Pedir de nuevo y avisos

**Rama `desde-cero` · cambios locales, sin commit ni push.**

- Un admin puede devolver a pendiente un trabajo aprobado desde Tareas, el detalle, el historial del perfil, la ficha de cliente o el detalle abierto desde Facturas. No se borran entregas: el historial muestra «Se pidió rehacer».
- La factura abierta pierde la línea y recalcula el total. En el demo pasó de **$18.000 a $9.000 COP**. Si ya consta un pago, la acción se bloquea sin modificar el trabajo.
- La campana y Configuración incluyen «Trabajo para rehacer» y el aviso de cancelación o reasignación. La reapertura avisa al asignado y a los demás admins, salvo al actor. Cambiar la fecha conserva el aviso existente.
- [24 capturas de QA](capturas-pedir-de-nuevo/README.md) en 375×812 y 1280×800, claro, oscuro y Glass. Solo se abrió un servidor oculto a la vez; ya está cerrado.

**Para Elías:** validar y aplicar la [migración 027](supabase/migrations/027_pedido_de_nuevo.sql) antes de publicar. El SQL no se ejecutó contra Supabase durante esta sesión. Ver [reporte técnico y hashes](HARNESS-PEDIR-DE-NUEVO.md).

---

# Informe Coherencia Neumórfica y Cero Solapes · RConcept Systems

**Publicado en `desde-cero`:** commit [`fa8f322`](https://github.com/juanroblox89-lab/rconceptsys/commit/fa8f3220b6c3f729828256fefc940526ba916c81) (sin cambios en `main`; solo Elías promueve tras verificar).

- **Cero solapes en cabecera móvil y barra colapsada (`AppShell`, `CampanaNotificaciones`):** la pastilla «RConcept» y la campana dejaron de flotar con `position: fixed` sobre el área desplazable. Ahora viven en una barra superior en flujo (`.topChrome`) encima de `<main>` (`scroll-padding-top: 12px`), con soporte completo para `env(safe-area-inset-top)` / `bottom` y teclado virtual (`--rc-visual-viewport`), toasts bajo la cabecera móvil (`.rc-avisos-flotantes`) y jerarquía ordenada de `z-index` para drawer, campana, hoja de equipo y modales.
- **Coherencia neumórfica integral (claro, oscuro y Glass):** se repararon tokens inexistentes (`--rc-elev-foco`, `--rc-borde-linea`, `--rc-*-fondo`, `--rc-fw-medium`, `rc-spin`), sombras y gradientes Liquid Glass para modo oscuro (`apariencia.css`), pestañas legibles en oscuro, tooltip de gráficas en oscuro, `Selector`/`CampoFecha`/`CampoHora`/`CampoCOP` en relieve/hundido, y se unificaron con neumorfismo y `<CabeceraPagina>` las pantallas de Trabajos/Tareas, Clientes, Gestión (Cortes, Equipo, Piezas, Estadísticas, Miembros), Mi factura, Equipo, Mi perfil, Configuración, Personalización, RIA, Adjuntos y Auth.
- **Desbordes eliminados en `320–1280 px`:** corregida la tabla oculta de accesibilidad de gráficas (`.tablaOculta`) que desbordaba horizontalmente, y ajustadas todas las rejillas a `minmax(min(100%, ...), 1fr)` con ajuste limpio de botones en `320 px`.
- **Verificación:** `node scripts/qa-coherencia.mjs` pasó de **54 fallos** en `antes` a **148/148 checks OK (0 fallos)** en `despues` a `320`, `375`, `414`, `768` y `1280 px` (claro, oscuro y Glass, top, scroll `56 px`, barra colapsada, modales, campana, hoja de equipo y teclado simulado) con 136 capturas inspeccionadas; `npm run lint`, `npm run typecheck`, `npm test` (11/11), `npm run build` (22 rutas) y `npm run mapa` en verde. Sin cambios en `.env*`, `Sensible\` ni archivos ajenos protegidos, y sin servidores activos.

[Reporte detallado y estado para retomar](<HARNESS-COHERENCIA.md>)

---

# Informe Resumen de Audio WebM al Pulsar «Resumir con IA» · RConcept Systems

**Publicado en `desde-cero`:** commit [`b453aec`](https://github.com/juanroblox89-lab/rconceptsys/commit/b453aec6a69325b3412d110b384807f47212dd75) (sin cambios en `main`; solo Elías promueve tras verificar).

- **Causa raíz identificada:** en borrador (`EditorAdjuntos`/`FilaLocal`), «Resumir con IA» solo invertía un switch sin llamar al backend; en adjuntos guardados, `finalizar`, `PATCH` y `reintentar` solo dejaban el estado en `pendiente` esperando al cron por minuto de Supabase; archivos `.webm` de solo audio reportados por el navegador como `video/webm` se clasificaban como video; y el respaldo de NVIDIA apuntaba a `integrate.api.nvidia.com/v1/audio/transcriptions` con `parakeet-tdt-0.6b-v3` (que responde `404 page not found`) en lugar del endpoint vigente de chat multimodal.
- **Borrador sin guardar el trabajo por sorpresa:** nuevos endpoints solo para administradores (`POST /api/admin/adjuntos/resumen-borrador` hasta 2 MiB y subida por fragmentos `/api/admin/adjuntos/borrador/{borrador}/...` hasta 25 MiB) reutilizan `resumenAudio` y devuelven un token HMAC (`borrador_resumen`). Al pulsar «Resumir con IA» muestra **Resumiendo…** y luego **Listo** con viñetas y transcripción plegable sin crear ninguna tarea; al guardar el trabajo, `finalizar` valida el token y persiste el resumen al instante sin volver a consultar la IA.
- **Disparo inmediato en guardados y reintento sin duplicado:** `POST /api/tareas/{id}/adjuntos/{adjunto}/procesar-resumen` reclama el audio atómicamente (`ReclamarResumenAdjuntoPorID` en memoria y PostgREST CAS sin requerir migración nueva) respetando permisos por trabajo (`401`/`403`/`409`). `AdjuntosGuardados` dispara el resumen en cuanto se activa el control, se reintenta o aparece un adjunto `pendiente`, con deduplicación en cliente y servidor.
- **Proveedores, WebM y errores legibles:** detección EBML en cliente para `.webm` de solo audio; primario por 9router (`ag/gemini-3.8-flash` con `temperature: 0`); respaldo NVIDIA sobre `/v1/chat/completions` (`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`) mediante reempaque puro en Go `WebM (Opus) → Ogg Opus` (`asignacion_webm_ogg.go`) y respaldo de texto (`nvidia/nemotron-3.5-super-vl-120b-a12b`). Distingue silencio sin voz (*«No se escuchó voz clara en el audio para resumir.»*), formato, falta de configuración y timeout en mensajes humanos.
- **Verificación:** sondas reales en vivo con WebM sintético de `MediaRecorder` (voz en español + silencio) aprobadas tanto en `9router` (`ag/gemini-3.8-flash`) como en `NVIDIA` (`nemotron-3-nano-omni` con Ogg Opus reempacado); `go build/vet/test` (`httpapi`, `store`, `supa`), `npm test` (11/11), `tsc --noEmit`, `eslint`, `npm run build`, `npm run mapa` (121 endpoints) y matriz Playwright Edge headless (`375×812` y `1280×800`, claro y oscuro) en verde. Sin cambios en `.env*`, `Sensible\` ni servidores activos.

[Reporte técnico y estado para retomar](<HARNESS-RESUMIR-AUDIO.md>)

---

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
