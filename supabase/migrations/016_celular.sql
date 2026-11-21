-- El perfil puede existir sin celular hasta completar la primera entrada.
alter table public.perfiles add column if not exists celular text;
alter table public.perfiles drop constraint if exists perfiles_celular_e164;
alter table public.perfiles add constraint perfiles_celular_e164 check (celular is null or celular ~ '^\+[1-9][0-9]{7,14}$');
-- El teléfono solo se devuelve desde /api/yo/celular (service_role).
revoke select on public.perfiles from anon, authenticated;
grant select (id, correo, nombre, foto_path, estado, es_admin, creado_en) on public.perfiles to authenticated;
