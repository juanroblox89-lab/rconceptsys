-- La referencia de Picker no sustituye las carpetas operativas del cliente.
alter table public.clientes
  add column if not exists drive_referencia_id text,
  add column if not exists drive_referencia_nombre text,
  add column if not exists drive_referencia_url text;

-- Las fotos solo se sirven por el backend autenticado.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clientes-fotos', 'clientes-fotos', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
