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
