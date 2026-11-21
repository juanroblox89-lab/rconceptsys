-- Estado de OAuth de un solo uso, también si el retorno llega a otra instancia.
create table if not exists public.drive_oauth_estados (
  huella text primary key check (huella ~ '^[0-9a-f]{64}$'),
  admin_id uuid not null references public.perfiles(id) on delete cascade,
  retorno text not null,
  expira timestamptz not null
);
create index if not exists idx_drive_oauth_expira on public.drive_oauth_estados(expira);
alter table public.drive_oauth_estados enable row level security;
revoke all on public.drive_oauth_estados from anon, authenticated;
grant all on public.drive_oauth_estados to service_role;

create or replace function public.rc_consumir_drive_oauth(p_huella text)
returns table (admin_id uuid, retorno text)
language sql security invoker set search_path = '' as $$
  delete from public.drive_oauth_estados as e where e.huella = p_huella
  and e.expira > now() returning e.admin_id, e.retorno;
$$;
revoke all on function public.rc_consumir_drive_oauth(text) from public, anon, authenticated;
grant execute on function public.rc_consumir_drive_oauth(text) to service_role;
