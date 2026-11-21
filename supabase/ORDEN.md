# Orden de migraciones · F6

No se aplicaron desde el agente. Partir de una base que ya tenga 001–011 aplicadas.

1. `migrations/012_clientes_flujo.sql` — columnas de logo y carpetas de Drive de Clientes; conserva los datos previos y el control RLS.
2. `migrations/013_notificaciones.sql` — bandeja, preferencias, deduplicación, registro de entregas y cursor de Drive; acceso exclusivo por el backend.
3. `migrations/014_ria.sql` — historial privado, cupo diario en Bogotá y autoría de las respuestas en el chat de equipo.
