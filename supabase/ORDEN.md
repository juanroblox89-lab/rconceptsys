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
