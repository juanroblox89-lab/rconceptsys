-- Preferencias privadas de apariencia, una fila por perfil.
create table if not exists public.perfil_apariencia (
  perfil_id uuid primary key references public.perfiles(id) on delete cascade,
  preferencias jsonb not null default '{}'::jsonb check (jsonb_typeof(preferencias) = 'object')
);
alter table public.perfil_apariencia enable row level security;
revoke all on public.perfil_apariencia from anon, authenticated;
grant all on public.perfil_apariencia to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('apariencia', 'apariencia', false, 2800000, array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict (id) do nothing;

-- Los objetos carecen de políticas públicas; la API solo lee objetos del perfil autenticado.
