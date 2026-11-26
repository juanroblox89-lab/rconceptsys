# Orden de migraciones · F6

No se aplicaron desde el agente. Partir de una base que ya tenga 001–011 aplicadas.

1. `migrations/012_clientes_flujo.sql` — columnas de logo y carpetas de Drive de Clientes; conserva los datos previos y el control RLS.
2. `migrations/013_notificaciones.sql` — bandeja, preferencias, deduplicación, registro de entregas y cursor de Drive; acceso exclusivo por el backend.
3. `migrations/014_ria.sql` — historial privado, cupo diario en Bogotá y autoría de las respuestas en el chat de equipo.
4. `migrations/015_apariencia.sql` — preferencias privadas por perfil y bucket privado de fondos de Glass.
5. `migrations/016_celular.sql` — número privado, normalizado al formato internacional y nullable para cuentas existentes.
6. `migrations/017_drive_oauth.sql` — estado de retorno de OAuth con caducidad y consumo atómico.
7. `migrations/018_cron_notificaciones_pg_cron.sql` — cron de notificaciones de Supabase.
8. `migrations/019_clientes_f7.sql` — referencia de Google Picker y bucket privado para fotos de clientes. Ejecutar antes del despliegue de F7; no altera `paquete`.
9. `migrations/020_clientes_varias_referencias.sql` — lista `drive_referencias` (hasta 10) y paso de la referencia única anterior. Aplicar antes del despliegue que la usa.
10. `migrations/021_drive_organizado.sql` — registra `carpeta_clientes_id` de la cuenta del equipo; no mueve archivos, ni cambia permisos. Aplicar antes de desplegar F8.
11. `migrations/022_tareas_referencias_drive.sql` — lista de hasta tres referencias por trabajo. No rellena trabajos anteriores ni toca permisos. Aplicar antes de desplegar F9.
12. `migrations/023_asignaciones_adjuntos.sql` — bucket privado, metadatos, cupos y cola de resumen F10. Reusa los secretos de Vault de la 018; no toca Drive. Aplicar antes de habilitar los adjuntos con una base real.
13. `migrations/024_chat_acciones_mensajes.sql` — columnas e índices idempotentes para `editado_en` y `borrado_en` en `chat_mensajes` y `ria_mensajes` (acciones copiar/editar/eliminar). Aplicar antes de usar edición o eliminación en /ria y el chat del equipo con base real.
14. `migrations/025_entrega_metodo_reversion_y_rechazo_adjuntos.sql` — método/selección de entrega (`drive`/`whatsapp`), tablas `tarea_entregas` y `tarea_historial`, RPCs atómicas de entrega/reversión/rechazo/aprobación y soporte de `asignacion_adjuntos` en eventos de rechazo. Aplicar después de 024.
15. [`migrations/026_ria_grupo.sql`](migrations/026_ria_grupo.sql) — autoría nativa de RIA, idempotencia persistente y RPC exclusivos de `service_role`. **Pendiente de aplicar.**

## Aplicación de 026 · RIA en el grupo

1. Valida primero en una base de pruebas aislada con 001–025 aplicadas y datos sintéticos. En el SQL Editor del proyecto autorizado, ejecuta **el archivo completo** como rol de migraciones (o `psql -v ON_ERROR_STOP=1 -f supabase/migrations/026_ria_grupo.sql` desde una conexión autorizada). Es transaccional e idempotente; no lo ejecutes aquí ni sobre una base sin verificar.
2. Comprueba que `chat_mensajes` conserva RLS de lectura para aprobados/no borrados; `anon` no lee, `authenticated` no escribe ni ejecuta los nuevos RPC, y no tiene acceso a `ria_consultas_grupo`. Con perfiles sintéticos, confirma que una respuesta tiene `es_ria=true` y `autor_id IS NULL` y que dos envíos con el mismo UUID no duplican mensajes.
3. Aplica **antes de habilitar** la nueva ruta y coordina el cambio de frontend/backend en la misma ventana: la restricción nueva rechaza la escritura antigua de `@RIA` con `autor_id` humano. No revierte automáticamente. No modifica el historial privado ni borra respuestas antiguas: les quita la asociación de autoría al solicitante.

El cupo diario en Bogotá se comparte con el chat privado (`ASISTENTE_TOPE_DIA`, 20 por defecto). Un reintento que vuelve a inferir cuenta para el cupo; recuperar una respuesta ya guardada no. Si cae el proceso antes de liberar el intento, se puede reintentar con el mismo UUID una vez vencida la reserva de 90 s.
