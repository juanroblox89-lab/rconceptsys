# Manual de administración · RIA

## Trabajos y Clientes

- `/asignaciones` (Trabajos): busca por persona, estado o rango; abre una entrega en revisión o edita un trabajo pendiente o devuelto. Para asignar, elige cliente, persona, tipo, fecha, carpeta si corresponde y describe el trabajo. Puedes crear el cliente sin perder lo que escribiste. Si la persona no tiene el rol del trabajo, confirma explícitamente que quieres asignarlo de todos modos.
- `/clientes`: busca, crea o edita fichas. La ficha conserva paquete, notas y enlace de referencia, y admite el logo mediante enlace HTTPS. Vincula una carpeta existente o crea una nueva en el Drive del equipo; se preparan «Material del lugar» y «Producto». Abre los trabajos asociados desde la ficha. Si Drive falla, puedes reintentar sin crear otro cliente.
- `/tareas`: revisa las entregas del equipo. Los trabajos nuevos o editados se notifican a la persona asignada. La carpeta del trabajo se selecciona o crea dentro de la carpeta del cliente.
- `/admin`: Gestión; la sección Clientes usa la misma ficha que el apartado del menú.

### API de estos flujos

- `GET /api/admin/clientes`: lista fichas.
- `POST /api/admin/clientes`: crea el cliente.
- `PATCH /api/admin/clientes/{id}`: actualiza nombre, estado, logo y datos de la ficha.
- `POST /api/admin/clientes/{id}/drive`: vincula o crea la carpeta y prepara sus dos subcarpetas.
- `GET /api/admin/drive/archivos`: lista archivos y carpetas del Drive conectado, también bajo un padre concreto.
- `GET /api/admin/tareas`: lista trabajos y número por revisar.
- `POST /api/admin/tareas`: asigna un trabajo con cliente y fecha obligatorios.
- `PATCH /api/admin/tareas/{id}`: cambia persona, tipo, fecha, descripción o carpeta de un trabajo abierto.
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
- `GET /api/admin/piezas`, `POST /api/admin/piezas`, `PATCH /api/admin/piezas/{id}`: consultan, crean o avanzan piezas.

## Retorno de Drive
- Al conectar el Drive común, Google vuelve a Gestión. Configura en Google Cloud la URL de retorno de la misma app; cuando hay una URL declarada explícitamente, esa tiene prioridad.
