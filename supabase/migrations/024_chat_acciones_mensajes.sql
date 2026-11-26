-- 024_chat_acciones_mensajes.sql
-- Acciones por mensaje (edición y borrado suave) en chat del equipo y RIA privado.
-- Idempotente: segura de ejecutar más de una vez.

alter table public.chat_mensajes
  add column if not exists editado_en timestamptz,
  add column if not exists borrado_en timestamptz;

create index if not exists idx_chat_mensajes_activos
  on public.chat_mensajes(id desc)
  where borrado_en is null;

alter table public.ria_mensajes
  add column if not exists editado_en timestamptz,
  add column if not exists borrado_en timestamptz;

create index if not exists idx_ria_mensajes_activos
  on public.ria_mensajes(perfil_id, id desc)
  where borrado_en is null;
