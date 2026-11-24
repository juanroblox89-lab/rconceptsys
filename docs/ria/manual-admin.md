# Manual de administración · RIA

## Trabajos y Clientes

- `/asignaciones` y `/tareas`: filtra los trabajos y pulsa **Abrir**. En `/trabajos/[id]` puedes consultar estado, actividad y entrega, editar si está pendiente o devuelto, y cancelar con confirmación. Las entregas se aprueban o devuelven en la bandeja de `/tareas`.
- `/trabajos/nuevo`: asigna desde Tareas, Trabajos o el perfil del miembro (persona preseleccionada). Elige cliente, persona, tipo, fecha, carpeta si corresponde y escribe las **Especificaciones**. Si no coincide el rol, confirma explícitamente.
- `/clientes`: busca por nombre. El botón **Ver** abre `/clientes/[id]` con notas, referencias y estadísticas calculadas de sus trabajos. Usa `/clientes/nuevo` para crear la ficha y `/clientes/[id]/editar` para editarla. Puedes subir una foto JPEG, PNG o WebP hasta 1 MB. La interfaz no muestra el paquete contratado y no lo cambia al guardar.
- En la ficha del cliente, **Referencia de Drive** es independiente de **Carpeta operativa de Drive**. Google Picker usa el Drive del equipo y no vuelve a pedir permisos al seleccionar. Abre en la carpeta del cliente o en RConcept. La carpeta operativa conserva «Material del lugar» y «Producto».
- `/admin`: Gestión; la sección Clientes usa el mismo listado y las mismas fichas.

### API de estos flujos

- `GET /api/admin/clientes`: lista fichas; `GET /api/admin/clientes/{id}`: ficha, estadísticas y trabajos de un cliente.
- `POST /api/admin/clientes`: crea el cliente; `PATCH /api/admin/clientes/{id}`: actualiza datos de ficha y verifica referencias de Drive.
- `POST /api/admin/clientes/{id}/foto`: sube una foto; `GET /api/admin/clientes/{id}/foto/{archivo}`: sirve la foto vigente con sesión de administración.
- `POST /api/admin/clientes/{id}/drive`: vincula o crea la carpeta operativa y prepara sus dos subcarpetas.
- `GET /api/admin/drive/archivos`: lista archivos y carpetas del Drive conectado; `GET /api/admin/drive/picker-token`: token temporal del Drive del equipo y carpeta inicial del selector, solo para administradores; no se guarda ni se reutiliza fuera del selector.
- `GET /api/admin/tareas`: lista trabajos y número por revisar; `GET /api/admin/tareas/{id}`: detalle e historial disponible.
- `POST /api/admin/tareas`: asigna un trabajo con fecha obligatoria; si no tiene cliente, su carpeta queda bajo RConcept.
- `PATCH /api/admin/tareas/{id}`: cambia persona, tipo, fecha, especificaciones o carpeta de un trabajo abierto.
- `GET /api/admin/asignaciones`: lista Trabajos con filtros.

## Miembros, catálogo y finanzas
- `GET /api/admin/miembros`: lista miembros y solicitudes; `POST /api/admin/miembros/{id}/aprobar`: permite acceso; `POST /api/admin/miembros/{id}/suspender` y `POST /api/admin/miembros/{id}/reactivar`: controlan acceso.
- `PUT /api/admin/miembros/{id}/roles`: asigna roles; `PUT /api/admin/miembros/{id}/admin`: cambia privilegio de administrador.
- `GET /api/admin/roles`, `POST /api/admin/roles`, `PATCH /api/admin/roles/{id}`: consulta y mantiene el catálogo de roles.
- `GET /api/admin/trabajos`, `POST /api/admin/trabajos`, `PATCH /api/admin/trabajos/{id}`: consulta y mantiene tipos, unidades y tarifas.
- `GET /api/admin/estadisticas`: resumen del equipo con filtros configurables.
- `POST /api/admin/tareas/{id}/aceptar`: aprueba la entrega y congela su precio; `POST /api/admin/tareas/{id}/rechazar`: devuelve con motivo; `POST /api/admin/tareas/{id}/cancelar`: cancela trabajo pendiente.
- `GET /api/admin/facturas`, `GET /api/admin/facturas/{id}`, `POST /api/admin/facturas/{id}/pagar`: consulta facturas y marca el pago.
- `GET /api/admin/cortes`, `POST /api/admin/cortes`, `GET /api/admin/cortes/{id}`: consulta o genera cortes. `POST /api/admin/cortes/{id}/lineas/{perfil}/pagar`: marca el pago individual. `GET /api/admin/cortes/{id}/csv` y `GET /api/admin/cortes/{id}/pdf`: exportan el corte.

## Equipo, Drive y piezas
- `PATCH /api/admin/equipo`: edita nombre y descripción del equipo; `POST /api/admin/equipo/enlaces`, `PATCH /api/admin/equipo/enlaces/{id}`, `DELETE /api/admin/equipo/enlaces/{id}`: mantienen los accesos rápidos.
- `GET /api/admin/asignaciones/recientes` y `POST /api/admin/asignaciones/vistas`: consultan y marcan novedades de Recientes.
- `GET /api/admin/drive`, `POST /api/admin/drive/conectar`, `POST /api/admin/drive/desconectar`: estado y conexión del Drive común. `POST /api/admin/tareas/{id}/drive-carpeta`: agrega carpeta al trabajo.
- `POST /api/admin/drive/organizar`: prepara RConcept, Clientes, Recursos y Archivo, sin mover carpetas antiguas.
- `POST /api/admin/drive/migrar-carpetas`: con `{}` simula; con la huella de la simulación confirmada aplica solo el mismo plan. No borra ni mueve carpetas sin acreditar.
- `GET /api/admin/piezas`, `POST /api/admin/piezas`, `PATCH /api/admin/piezas/{id}`: consultan, crean o avanzan piezas.

## Retorno de Drive
- Al conectar el Drive común, Google vuelve a Gestión. Configura en Google Cloud la URL de retorno de la misma app; cuando hay una URL declarada explícitamente, esa tiene prioridad.
