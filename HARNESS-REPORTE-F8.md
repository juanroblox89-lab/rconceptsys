# F8 · Drive organizado, selector y permisos

- Base: `51112d6d3aaa1e425091773e1c81acb5b883759c`.
- Implementación validada: `f8413fedd0693e4f0b57969b78265de103c30398`, autor Git configurado `Juan`, rama `desde-cero`.
- No se publicó en producción ni se tocó `main`. No se aplicó SQL.

## Cambios

- Gestión → Equipo: **Desconectar Drive** usa la variante de peligro, con confirmación Sí/No en línea. **Organizar Drive** prepara `RConcept/Clientes`, `Recursos` y `Archivo`. Muestra `Carpeta raíz: RConcept` y **Abrir en Drive**.
- Altas y organización completan la carpeta del cliente con `Material del lugar` y `Producto`. Se reutilizan las columnas anteriores `drive_carpeta_id` y `drive_url`; [021](<supabase/migrations/021_drive_organizado.sql>) agrega la rama preparada `carpeta_clientes_id` y figura en [ORDEN.md](<supabase/ORDEN.md>).
- El trabajo nuevo se organiza por fecha límite, tipo y descripción, con subcarpetas `Material` y `Entregas`; si no tiene cliente se crea bajo `RConcept`. Se distingue cada trabajo aunque el nombre coincida. Si Google no responde, se guarda el trabajo y el admin puede reintentar desde su ficha. Las entregas copiadas por la app van a `Entregas`.
- **Simular movimientos** no escribe en Drive. **Aplicar movimientos** requiere una huella vigente ligada al admin y a la conexión. Revalida antes de mover y usa `files.update` con `addParents` y `removeParents`; no usa DELETE ni mueve carpetas por búsqueda global de nombre. Exige propiedad, ID registrado, padre `Mi unidad`, destino válido y procedencia compatible. Para el legado sin marca privada se exige también URL registrada exacta, nombre histórico exacto `T-ID Título` y atribución de Drive; Google define `isAppAuthorized` como [creado **o abierto** por la app](https://developers.google.com/workspace/drive/api/reference/rest/v3/files), no como prueba de creación por sí solo. Lo no verificable se omite.
- El selector solicita a Go el token efímero en cada apertura, sin flujo adicional de OAuth de Google ni refresh token en el navegador, sin caché. Abre en la carpeta operativa válida o en `RConcept`. El access token conserva el alcance Drive de la conexión, se entrega solo a administradores y no se persiste en el cliente. Sin conexión, el selector queda inactivo y explica dónde conectar.
- El miembro aprobado ve clientes y fotos de solo lectura; los trabajos que aparecen en su ficha son únicamente los suyos. El acceso directo a la ruta de edición no monta el formulario. Gestión no monta controles de administración para miembros. La foto del perfil propio no se cambió.

## Qué se movió

| Entorno | Resultado |
|---|---|
| Drive real | **Ninguna carpeta**. No se abrió la cuenta de Google ni se ejecutó la simulación sobre datos reales. |
| Integración Go con doble de Google | `T-<id> Rodaje anterior`: de `Mi unidad` a `RConcept/Clientes/Estudio d'Ávila`. Una carpeta deliberadamente ajena conservó su padre; simulación y confirmación inválida hicieron 0 escrituras. |
| Headless con fixtures | `T-15 Grabación anterior` → `RConcept/Clientes/Estudio Norte`, visible en simulación y en el resultado del doble. |

## Estilos revisados

- [Picker](<components/PickerDriveCliente.tsx>) y [ficha](<components/PaginaCliente.tsx>): referencias Abrir/Quitar, carpeta del cliente, Material del lugar, Producto y navegación de ficha. Los enlaces de acción usan el mismo `rc-btn--secundario rc-btn--sm` que un botón, sin visitar/seleccionar texto. Los iconos de enlace externo acompañan solo aperturas en otra pestaña.
- [Clientes](<components/ClientesPanel.tsx>), [filas de trabajo](<components/FilaTrabajo.tsx>) y [página de trabajo](<components/PaginaTrabajo.tsx>): Ver, Abrir, Volver, Revisar entrega; en la navegación interna se usa chevrón o flecha de vuelta, no indicador de otra pestaña.
- [Equipo](<components/admin/AdminEquipo.tsx>), [aviso de cambio en Drive](<app/(app)/drive-cambio/page.tsx>), [enlace de entrega](<components/ui/EnlaceDrive.tsx>) y [carpeta de tarea](<components/ui/CarpetaDriveTarea.tsx>): acciones de abrir/crear con variante secundaria y foco visible.
- [Selector de carpeta de trabajo](<components/SelectorCarpetaTrabajo.tsx>), [notificaciones](<components/CampanaNotificaciones.tsx>) y [RIA](<app/(app)/ria/page.tsx>): Reintentar ya no es un botón de texto pelado. Se revisaron los controles JSX y CSS de `components` y `app`; conservar el estilo propio de navegación, tarjetas, botones icono y enlaces editoriales no equivale a dejar el estilo del navegador.

## Evidencia

- Pasaron `npm run lint`, `npm run typecheck`, `go build ./...`, `go vet ./...`, `go test ./...`, `npm run mapa` y el verificador de documentos de RIA. [Flujos](<docs/arquitectura/flujos.json>) y [mapa generado](<docs/arquitectura/mapa.html>) actualizados.
- Pruebas Go de F8: 17 casos de bloqueo 403; ficha filtrada por asignación; foto propia llega al validador; retorno OAuth con state real de prueba, árbol idempotente, tarea con/sin cliente, tareas homónimas separadas, Picker sin refresh ni caché, simulación, rechazo de huella inválida, movimiento y desconexión.
- API local demo: `admin-1` ficha 200, Drive 200; `cam-1` ficha 200, Drive 403, sin Supabase. Backend y Next se usaron en tandas separadas. PIDs de Next `22516` y `23964`; backend demo `22888` y `2688`, todos cerrados.
- 40 [capturas y mediciones](<capturas-f8/>) en Edge headless, con ancho 375 y 1280, claro/oscuro y los dos roles. Se probaron foco, Escape del selector, selección, desconexión Sí/No, simulación/aplicación, selector deshabilitado y ausencia de desborde horizontal. El diálogo de Google es un doble visual identificado; no acredita apariencia ni permisos del iframe real. [Guion reproducible](<scripts/qa-f8.mjs>).
- No se modificaron `.env*`, `Sensible`, `vercel.json`, perfil propio ni `backend/internal/httpapi/ria_modelo.go`.

## Tarea 6 · Textos de interfaz

Revisión de encabezados, formularios, ayudas, estados vacíos, errores y toasts en `app/**` y `components/**`, incluidos los mensajes de API que llegan a esas pantallas. Se conservaron límites de archivo, privacidad, consecuencias de acciones, datos de confirmación y pasos de recuperación. `—` indica que se retiró el texto.

| Archivo | Antes | Después |
|---|---|---|
| [AvisosPush.tsx](<components/AvisosPush.tsx>) | Tarea nueva, tarea que vence mañana y entrega aprobada. En la APK se conecta igual. | — |
| [AvisosPush.tsx](<components/AvisosPush.tsx>) | El servidor no tiene las claves VAPID. Pídele a Juan que las configure. | Los avisos no están disponibles. |
| [AvisosPush.tsx](<components/AvisosPush.tsx>) | El navegador no dio permiso para mostrar avisos. | Permite las notificaciones en tu navegador. |
| [AvisosPush.tsx](<components/AvisosPush.tsx>) | El navegador no entregó una suscripción válida. | No se pudieron activar los avisos. |
| [AvisosPush.tsx](<components/AvisosPush.tsx>) | Avisos activados en este dispositivo. | Avisos activados. |
| [AvisosPush.tsx](<components/AvisosPush.tsx>) | Avisos desactivados en este dispositivo. | Avisos desactivados. |
| [AvisosPush.tsx](<components/AvisosPush.tsx>) | No se pudieron activar los avisos en este dispositivo. | No se pudieron activar los avisos. |
| [AvisosPush.tsx](<components/AvisosPush.tsx>) | Revisando el estado de los avisos… | Comprobando avisos… |
| [AvisosPush.tsx](<components/AvisosPush.tsx>) | Este navegador no permite avisos push. | Este navegador no admite avisos en el dispositivo. |
| [AvisosPush.tsx](<components/AvisosPush.tsx>) | Faltan las claves VAPID en el servidor (VAPID_CLAVE_PUBLICA y VAPID_CLAVE_PRIVADA). | Los avisos no están disponibles. |
| [AdminEquipo.tsx](<components/admin/AdminEquipo.tsx>) | Es la tarjeta que se ve en la barra derecha del chat, en pantallas grandes. | — |
| [AdminEquipo.tsx](<components/admin/AdminEquipo.tsx>) | Abren en otra pestaña. Ejemplos: Drive del equipo, Materiales, Entregas. | — |
| [AdminEquipo.tsx](<components/admin/AdminEquipo.tsx>) | Un solo Drive para todo: cada tarea tiene su subcarpeta y lo entregado se copia ahí. | — |
| [AdminEquipo.tsx](<components/admin/AdminEquipo.tsx>) | Las subcarpetas por tarea ya se crean en ese Drive. | — |
| [AdminEquipo.tsx](<components/admin/AdminEquipo.tsx>) | No se conectó ninguna cuenta de Google. | — |
| [AdminEquipo.tsx](<components/admin/AdminEquipo.tsx>) | La barra derecha ya muestra los cambios. | — |
| [AdminEquipo.tsx](<components/admin/AdminEquipo.tsx>) | Ya aparece en la barra derecha. | — |
| [AdminEquipo.tsx](<components/admin/AdminEquipo.tsx>) | Ya no se crean carpetas automáticas. | — |
| [AdminEquipo.tsx](<components/admin/AdminEquipo.tsx>) | Falta preparar algunas carpetas. Pulsa Organizar Drive para reintentar. | Pulsa «Organizar Drive» para completar las carpetas. |
| [AdminEquipo.tsx](<components/admin/AdminEquipo.tsx>) | Faltan credenciales. El servidor no tiene GOOGLE_CLIENT_ID ni GOOGLE_CLIENT_SECRET. | Falta configurar Drive. Pide a soporte que lo habilite. |
| [AdminEquipo.tsx](<components/admin/AdminEquipo.tsx>) | No se pudo guardar. La conexión llegó pero no se pudo guardar en la base. | No se pudo guardar la conexión. |
| [AdminEquipo.tsx](<components/admin/AdminEquipo.tsx>) | Faltan las credenciales de Google Cloud en el servidor. Juan debe crear un cliente OAuth (tipo aplicación web) y cargar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET. La URL de retorno es https://&lt;dominio&gt;/api/drive/callback. | Pide a soporte que habilite Google Drive. |
| [AdminEquipo.tsx](<components/admin/AdminEquipo.tsx>) | Drive conectado. Falta organizar las carpetas. | Carpetas sin organizar. |
| [AdminEquipo.tsx](<components/admin/AdminEquipo.tsx>) | Todavía no hay enlaces. | Sin enlaces. |
| [AdminEquipo.tsx](<components/admin/AdminEquipo.tsx>) | Simula primero el traslado de carpetas de la app que siguen sueltas en Mi unidad. No se borra nada. | Revisa qué carpetas de Mi unidad se moverían. No se borra nada. |
| [AdminEquipo.tsx](<components/admin/AdminEquipo.tsx>) | No se tocarán las tareas con carpetas no verificadas: | Tareas omitidas (carpetas sin verificar): |
| [AdminEquipo.tsx](<components/admin/AdminEquipo.tsx>) | Faltan credenciales de Google Cloud. | Pide a soporte que revise la conexión. |
| [AdminEquipo.tsx](<components/admin/AdminEquipo.tsx>) |  No se movieron carpetas antiguas. | — |
| [ClientesPanel.tsx](<components/ClientesPanel.tsx>) | Producción / Consulta sus fichas, trabajos y referencias de Drive. | — |
| [ClientesPanel.tsx](<components/ClientesPanel.tsx>) | Aún no hay clientes disponibles. | Sin clientes. |
| [PaginaCliente.tsx](<components/PaginaCliente.tsx>) | Crea la ficha del cliente. / Ficha del cliente (durante la carga). | — |
| [PaginaCliente.tsx](<components/PaginaCliente.tsx>) | Ficha de solo lectura. Solo los administradores pueden editarla. | Ficha de solo lectura. |
| [PaginaCliente.tsx](<components/PaginaCliente.tsx>) | Este cliente todavía no tiene trabajos. | Sin trabajos. |
| [PaginaCliente.tsx](<components/PaginaCliente.tsx>) | La carpeta operativa se prepara automáticamente con el Drive del equipo. | — |
| [PickerDriveCliente.tsx](<components/PickerDriveCliente.tsx>) | Archivos o carpetas con el material del cliente. | — |
| [PickerDriveCliente.tsx](<components/PickerDriveCliente.tsx>) | Puedes tener hasta {MAX_REFERENCIAS} referencias. | Máximo: {MAX_REFERENCIAS} referencias. |
| [PaginaTrabajo.tsx](<components/PaginaTrabajo.tsx>) | Define a quién va dirigido y qué debe entregar. / Detalle de la asignación. | — |
| [PaginaTrabajo.tsx](<components/PaginaTrabajo.tsx>) | El trabajo quedará cancelado. Esta acción no se puede deshacer. | Esta acción no se puede deshacer. |
| [FormularioAsignacion.tsx](<components/FormularioAsignacion.tsx>) | Tu asignación se conserva. Puedes completar la ficha desde Clientes. | Tu asignación no se perderá. |
| [FormularioAsignacion.tsx](<components/FormularioAsignacion.tsx>) | Sin cliente (trabajo anterior) | Sin cliente |
| [FormularioAsignacion.tsx](<components/FormularioAsignacion.tsx>) | La persona no tiene el rol de este trabajo. Si es intencional, confirma para continuar. | La persona no tiene el rol de este trabajo. Marca «Asignar aunque el rol no coincida». |
| [SelectorCarpetaTrabajo.tsx](<components/SelectorCarpetaTrabajo.tsx>) | Si Drive está conectado, la carpeta se prepara al asignar. | — |
| [EquipoBarra.tsx](<components/EquipoBarra.tsx>) | Todavía no hay enlaces. Un admin los agrega en Gestión → Equipo. | Sin enlaces. |
| [EquipoBarra.tsx](<components/EquipoBarra.tsx>) | Totales desde el inicio. Archivos suma lo adjunto en el chat y los enlaces de Drive de las tareas. | Archivos: adjuntos del chat y enlaces de tareas. |
| [EquipoBarra.tsx](<components/EquipoBarra.tsx>) | Ver miembros del equipo | Ver miembros |
| [AdminCortes.tsx](<components/admin/AdminCortes.tsx>) | Suma lo aprobado en el periodo por persona. Marca pagado cuando transfieras y exporta el comprobante. | Marca el corte como pagado después de transferir. |
| [AdminCortes.tsx](<components/admin/AdminCortes.tsx>) | Todavía no hay cortes. Se cierran sobre las tareas aprobadas del periodo que elijas. | Sin cortes. |
| [AdminPiezas.tsx](<components/admin/AdminPiezas.tsx>) | Cada pieza agrupa sus tareas y avanza: Guion → Grabación → Edición → Revisión → Aprobada → Publicada. | Agrupa varios trabajos en una pieza. |
| [AdminPiezas.tsx](<components/admin/AdminPiezas.tsx>) | Todavía no hay piezas. Crea una y cuélgale las tareas desde Nueva tarea. | Sin piezas. |
| [AdminPiezas.tsx](<components/admin/AdminPiezas.tsx>) | Nace en la etapa Guion. | — |
| [CampanaNotificaciones.tsx](<components/CampanaNotificaciones.tsx>) | Por ahora no tienes notificaciones. | Sin notificaciones. |
| [Sidebar.tsx](<components/Sidebar.tsx>) | Sin movimiento todavía. | Sin trabajos recientes. |
| [Tarjeta.tsx](<components/ui/Tarjeta.tsx>) | Aún no tienes contenido en esta sección. (texto predeterminado) | — |
| [AdminTareas.tsx](<components/AdminTareas.tsx>) | Asigna tareas al equipo, revisa entregas de trabajo y aprueba valores a facturar | — |
| [AdminTareas.tsx](<components/AdminTareas.tsx>) | No hay tareas pendientes de aprobación en este momento. | — |
| [AdminTareas.tsx](<components/AdminTareas.tsx>) | Error al cargar tareas. No se pudieron obtener las tareas del equipo. | No se pudieron cargar las tareas. |
| [AdminTareas.tsx](<components/AdminTareas.tsx>) | Debes ingresar los minutos aceptados (entero entre 1 y 1440). | Ingresa entre 1 y 1440 minutos. |
| [AdminTareas.tsx](<components/AdminTareas.tsx>) | Debes explicar el motivo del rechazo. | — |
| [AdminTareas.tsx](<components/AdminTareas.tsx>) | La tarea se ingresó a la factura abierta de la persona. | Se añadió a la factura abierta. |
| [AdminTareas.tsx](<components/AdminTareas.tsx>) | Se notificó a la persona con el motivo. | — |
| [AdminTareas.tsx](<components/AdminTareas.tsx>) | Indica el motivo por el cual rechazas "${tareaARechazar.titulo}". La persona podrá ver este motivo y corregir la entrega. | La persona verá el motivo y podrá corregir «${tareaARechazar.titulo}». |
| [MisTareas.tsx](<components/MisTareas.tsx>) | Gestiona las tareas asignadas según tu rol y marca tu trabajo completado | — |
| [MisTareas.tsx](<components/MisTareas.tsx>) | Aún no tienes tareas pendientes o completadas en el sistema. | — |
| [MisTareas.tsx](<components/MisTareas.tsx>) | No tienes tareas pendientes por realizar. | — |
| [MisTareas.tsx](<components/MisTareas.tsx>) | No hay tareas esperando aprobación del administrador. | — |
| [MisTareas.tsx](<components/MisTareas.tsx>) | Las tareas aceptadas por el administrador aparecerán aquí con su valor congelado. | — |
| [MisTareas.tsx](<components/MisTareas.tsx>) | Error al cargar tareas. (2 usos) | No se pudieron cargar tus tareas. |
| [MisTareas.tsx](<components/MisTareas.tsx>) | No pudimos obtener la lista de tus tareas. | — |
| [MisTareas.tsx](<components/MisTareas.tsx>) | No pudimos obtener la lista de tus tareas. | — |
| [MisTareas.tsx](<components/MisTareas.tsx>) | Debes ingresar los minutos grabados (entero entre 1 y 1440). | Ingresa entre 1 y 1440 minutos. |
| [MisTareas.tsx](<components/MisTareas.tsx>) | Tarea completada. Tu tarea fue enviada a revisión por el administrador. | Entrega enviada a revisión. |
| [MisTareas.tsx](<components/MisTareas.tsx>) | Este trabajo se cobra por minuto. Ingresa la duración real de grabación (1 a 1440). | Se cobra por minuto grabado. |
| [MisTareas.tsx](<components/MisTareas.tsx>) | Ej. Detalles de la entrega o anotaciones... | — |
| [MisTareas.tsx](<components/MisTareas.tsx>) | Nota opcional (hasta 500 caracteres) | Nota (opcional) |
| [page.tsx](<app/login/page.tsx>) | Sistema operativo interno de RConcept | — |
| [page.tsx](<app/registro/page.tsx>) | Únete al equipo creativo de RConcept | — |
| [page.tsx](<app/pendiente/page.tsx>) | Esta pantalla se actualizará automáticamente en cuanto tu cuenta sea aprobada. | — |
| [page.tsx](<app/pendiente/page.tsx>) | Tu cuenta ha sido creada exitosamente. Un administrador debe aprobar tu acceso antes de que puedas usar el chat y las herramientas de RConcept. | Un administrador debe aprobar tu acceso. |
| [page.tsx](<app/pendiente/page.tsx>) | Pendiente de aprobación (etiqueta duplicada). | — |
| [page.tsx](<app/pendiente/page.tsx>) | Cuenta en espera de aprobación | Cuenta pendiente de aprobación |
| [page.tsx](<app/(app)/page.tsx>) | Coordinación general de producción | — |
| [page.tsx](<app/(app)/page.tsx>) | Chat de todo el equipo | Chat del equipo |
| [page.tsx](<app/(app)/asignaciones/page.tsx>) | Todavía no hay asignaciones. Se crean al asignar una tarea. | Sin asignaciones. |
| [page.tsx](<app/(app)/configuracion/page.tsx>) | Personaliza cómo recibes los avisos. | — |
| [page.tsx](<app/(app)/personalizacion/page.tsx>) | Elige cómo se ve RConcept en tu cuenta. | — |
| [page.tsx](<app/(app)/personalizacion/page.tsx>) | El modo controla la luz; el tema define las superficies. | — |
| [page.tsx](<app/(app)/personalizacion/page.tsx>) | Sube una imagen o un video de hasta 2,5 MB. En celular se muestra solo el primer fotograma. | Hasta 2,5 MB. En celular, el video se muestra como imagen. |
| [page.tsx](<app/(app)/equipo/page.tsx>) | Miembros activos en producción, edición y distribución | — |
| [page.tsx](<app/(app)/equipo/page.tsx>) | No hay miembros aprobados en este momento. | — |
| [page.tsx](<app/(app)/equipo/page.tsx>) | No hay miembros | Sin miembros aprobados |
| [page.tsx](<app/(app)/equipo/page.tsx>) | Equipo de trabajo | Equipo |
| [page.tsx](<app/(app)/factura/page.tsx>) | Consulta tus trabajos aceptados acumulados y el historial de pagos recibidos | — |
| [page.tsx](<app/(app)/factura/page.tsx>) | Cuando el administrador acepte tus tareas hechas, su valor congelado aparecerá aquí. | — |
| [page.tsx](<app/(app)/factura/page.tsx>) | Aún no tienes cortes de factura pagados registrados en el sistema. | — |
| [page.tsx](<app/(app)/factura/page.tsx>) | Factura abierta actual | Factura abierta |
| [page.tsx](<app/(app)/factura/page.tsx>) | Total histórico cobrado | Total cobrado |
| [page.tsx](<app/(app)/factura/page.tsx>) | Error al cargar factura. No pudimos consultar tu estado de facturación. | No pudimos cargar tu factura. |
| [page.tsx](<app/(app)/perfil/page.tsx>) | Administra tus datos personales y consulta el acumulado de tus trabajos. | — |
| [page.tsx](<app/(app)/perfil/page.tsx>) | Tu nombre de visualización se actualizó con éxito. | — |
| [page.tsx](<app/(app)/perfil/page.tsx>) | Tu avatar se actualizó correctamente. | — |
| [page.tsx](<app/(app)/drive-cambio/page.tsx>) | El archivo se abre en Google Drive con tus permisos. | — |
| [page.tsx](<app/(app)/ria/page.tsx>) | Listo cuando quieras. | ¿En qué te ayudo? |
| [page.tsx](<app/(app)/admin/page.tsx>) | Control de acceso, configuración de trabajos, bandeja de tareas y facturación por persona | — |
| [page.tsx](<app/(app)/admin/page.tsx>) | Tipos de trabajo configurables | Tipos de trabajo |
| [page.tsx](<app/(app)/admin/page.tsx>) | El precio configurado aplica para nuevas tareas. Modificar el precio &lt;strong&gt;no afecta&lt;/strong&gt; las tareas ya aceptadas. | El nuevo precio no cambia las tareas ya aceptadas. |
| [page.tsx](<app/(app)/admin/page.tsx>) | La cuenta ya tiene acceso al sistema. | — |
| [page.tsx](<app/(app)/admin/page.tsx>) | El acceso ha sido revocado. | — |
| [page.tsx](<app/(app)/admin/page.tsx>) | El acceso ha sido restablecido. | — |
| [page.tsx](<app/(app)/admin/page.tsx>) | Define un nuevo trabajo disponible para asignación y facturación. | — |
| [page.tsx](<app/(app)/admin/page.tsx>) | Aún no hay registros de facturas para los miembros del equipo. | — |
| [page.tsx](<app/(app)/admin/page.tsx>) | No hay cuentas esperando aprobación en este momento. | — |
| [page.tsx](<app/(app)/admin/page.tsx>) | Trabajo creado exitosamente | Trabajo creado |
| [page.tsx](<app/(app)/admin/page.tsx>) | La factura de ${facturaAPagar.persona} fue cerrada. La próxima tarea abrirá un nuevo corte. | ${facturaAPagar.persona} |
| [page.tsx](<app/(app)/admin/page.tsx>) | ¿Deseas marcar como pagada la factura abierta de ${facturaAPagar.persona} por valor de $ ${facturaAPagar.total.toLocaleString("es-CO")}? | ¿Marcar como pagada la factura de ${facturaAPagar.persona} por $ ${facturaAPagar.total.toLocaleString("es-CO")}? |
| [page.tsx](<app/(app)/admin/page.tsx>) | Al confirmar, esta factura se archivará en el historial de pagadas y la próxima tarea aceptada de esta persona abrirá un nuevo corte automáticamente. | La próxima tarea aceptada abrirá otra factura. |
| [page.tsx](<app/(app)/admin/page.tsx>) | perderá el acceso al sistema hasta que lo reactives. | perderá el acceso hasta que le reactives la cuenta. |
| [page.tsx](<app/estilo/page.tsx>) | Componentes, estilos y patrones para una experiencia interna consistente, rápida y enfocada en la productividad. | Catálogo de componentes |
| [page.tsx](<app/estilo/page.tsx>) | Correctamente. | — |
| [drive.go](<backend/internal/httpapi/drive.go>) | Faltan las credenciales de Google Cloud. Pídele a Juan que cree GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET. | Pide a soporte que habilite Google Drive. |
| [drive.go](<backend/internal/httpapi/drive.go>) | Configura la URL pública de retorno de Google Drive. | Pide a soporte que revise la conexión con Google Drive. |
| [handlers.go](<backend/internal/httpapi/handlers.go>) | La persona no tiene asignado %s para este trabajo. Usa forzar: true si deseas asignarla de todos modos. | La persona no tiene asignado %s. Confirma la asignación si quieres continuar. |

**Verificación de la tarea 6:** lint, typecheck, build/vet/tests de Go y mapa en verde. Edge headless repitió el recorrido F8 con admin y miembro en 375×812 y 1280×800, claro y oscuro. En Configuración comprobó que la tarjeta de avisos muestra el estado sin mencionar la APK ni VAPID. 48 capturas y mediciones en `capturas-f8-textos/`; un único Next oculto (PID `17584`), ya apagado. La tarea no cambia permisos, notificaciones ni operaciones de Drive.

## ESTADO PARA RETOMAR

1. Elías: aplicar [021](<supabase/migrations/021_drive_organizado.sql>) después de 020 y antes de desplegar. No se requiere ejecutar SQL para mover carpetas.
2. Cuando Juan diga «publica», Elías publica según el flujo del repo. En una cuenta de prueba o en un entorno autorizado, confirmar el Picker real con el proyecto Google Cloud configurado y la cuenta de Drive de equipo.
3. Como admin: Gestión → Equipo → **Organizar Drive** → **Simular movimientos**. Revisar las carpetas que se enumeran y las omitidas. Confirmar **Aplicar movimientos** solo tras revisar el plan; guardar el resultado real de qué se movió. Si el legado no trae evidencia suficiente, no forzar el traslado masivo.
