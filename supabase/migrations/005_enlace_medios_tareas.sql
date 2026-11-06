-- 005_enlace_medios_tareas.sql
-- F4: enlace de medios (Google Drive) al entregar una tarea
alter table if exists public.tareas add column if not exists enlace_medios text;
comment on column public.tareas.enlace_medios is 'Enlace https de Google Drive adjuntado por la persona al marcar la tarea como hecha (máx. 500 caracteres)';
