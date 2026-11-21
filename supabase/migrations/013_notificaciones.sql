-- F6: bandeja privada, preferencias y cola de Web Push. No ejecutar desde el agente.
create table if not exists public.notificaciones (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  cuerpo text not null,
  url text not null,
  leida_en timestamptz,
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  grupo text,
  cantidad integer not null default 1 check (cantidad > 0),
  disponible_en timestamptz not null default now(),
  intentos integer not null default 0,
  bloqueo_hasta timestamptz,
  finalizada_en timestamptz
);
create index if not exists idx_notificaciones_bandeja on public.notificaciones (perfil_id, actualizada_en desc, id desc);
create index if not exists idx_notificaciones_no_leidas on public.notificaciones (perfil_id) where leida_en is null;
create index if not exists idx_notificaciones_cola on public.notificaciones (disponible_en, id) where finalizada_en is null;
create index if not exists idx_notificaciones_grupo on public.notificaciones (perfil_id, tipo, grupo, creada_en desc) where grupo is not null and finalizada_en is null;

create table if not exists public.notificaciones_eventos (
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  clave text not null,
  creada_en timestamptz not null default now(),
  primary key (perfil_id, clave)
);
create table if not exists public.notificaciones_preferencias (
  perfil_id uuid primary key references public.perfiles(id) on delete cascade,
  tipos_silenciados text[] not null default '{}',
  silenciar_chat boolean not null default false,
  silencio_desde text not null default '',
  silencio_hasta text not null default ''
);
create table if not exists public.notificaciones_entregas (
  notificacion_id bigint not null references public.notificaciones(id) on delete cascade,
  suscripcion_id bigint not null references public.push_suscripciones(id) on delete cascade,
  primary key (notificacion_id, suscripcion_id)
);
create table if not exists public.notificaciones_control (
  clave text primary key,
  valor text not null default '',
  bloqueo_hasta timestamptz not null default '-infinity'
);

alter table public.notificaciones enable row level security;
alter table public.notificaciones_preferencias enable row level security;
alter table public.notificaciones_eventos enable row level security;
alter table public.notificaciones_entregas enable row level security;
alter table public.notificaciones_control enable row level security;
revoke all on public.notificaciones, public.notificaciones_preferencias, public.notificaciones_eventos, public.notificaciones_entregas, public.notificaciones_control from anon, authenticated;
grant all on public.notificaciones, public.notificaciones_preferencias, public.notificaciones_eventos, public.notificaciones_entregas, public.notificaciones_control to service_role;
grant usage, select on sequence public.notificaciones_id_seq to service_role;

-- Agrupa dentro de una ventana fija; no agrega eventos a un aviso ya reclamado.
create or replace function public.rc_encolar_notificacion(
  p_perfil uuid, p_tipo text, p_titulo text, p_cuerpo text, p_url text,
  p_clave text, p_grupo text, p_ventana_segundos integer
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_id bigint;
  v_ahora timestamptz := now();
  v_ventana interval := make_interval(secs => greatest(0, least(p_ventana_segundos, 120)));
  v_prefs public.notificaciones_preferencias%rowtype;
begin
  if p_clave <> '' then
    insert into public.notificaciones_eventos (perfil_id, clave) values (p_perfil, p_clave) on conflict do nothing;
    if not found then return; end if;
  end if;
  if p_tipo <> 'mencion' then
    select * into v_prefs from public.notificaciones_preferencias where perfil_id = p_perfil;
    if found and (p_tipo = any(v_prefs.tipos_silenciados) or (p_tipo = 'chat' and v_prefs.silenciar_chat)) then return; end if;
  end if;
  if p_grupo <> '' and p_ventana_segundos > 0 then
    perform pg_advisory_xact_lock(hashtextextended(p_perfil::text || ':' || p_tipo || ':' || p_grupo, 0));
    select id into v_id from public.notificaciones
      where perfil_id = p_perfil and tipo = p_tipo and grupo = p_grupo
        and creada_en > v_ahora - v_ventana and leida_en is null and finalizada_en is null and intentos = 0
      order by id desc limit 1 for update;
  end if;
  if v_id is null then
    insert into public.notificaciones (perfil_id, tipo, titulo, cuerpo, url, grupo, disponible_en)
    values (p_perfil, p_tipo, p_titulo, p_cuerpo, p_url, nullif(p_grupo,''), v_ahora + v_ventana);
  else
    update public.notificaciones set cantidad = cantidad + 1, actualizada_en = v_ahora,
      titulo = case when p_tipo = 'chat' then (cantidad + 1)::text || ' mensajes nuevos' else p_titulo end,
      cuerpo = case when p_tipo = 'drive' then (cantidad + 1)::text || ' cambios · ' || p_cuerpo else p_cuerpo end,
      url = p_url where id = v_id;
  end if;
end;
$$;

create or replace function public.rc_reclamar_notificaciones(p_limite integer)
returns setof public.notificaciones language sql security invoker set search_path = '' as $$
  with proximas as (
    select id from public.notificaciones where finalizada_en is null and disponible_en <= now()
      and (bloqueo_hasta is null or bloqueo_hasta <= now())
    order by disponible_en, id limit greatest(1, least(p_limite, 30)) for update skip locked
  ) update public.notificaciones n set bloqueo_hasta = now() + interval '90 seconds', intentos = n.intentos + 1
    from proximas where n.id = proximas.id returning n.*;
$$;

create or replace function public.rc_bloquear_notificaciones_control(p_clave text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.notificaciones_control (clave, bloqueo_hasta) values (p_clave, now() + interval '90 seconds')
  on conflict (clave) do update set bloqueo_hasta = excluded.bloqueo_hasta
    where public.notificaciones_control.bloqueo_hasta <= now();
  return found;
end;
$$;

create or replace function public.rc_contar_notificaciones(p_perfil uuid)
returns bigint language sql stable security invoker set search_path = '' as $$
  select count(*) from public.notificaciones where perfil_id = p_perfil and leida_en is null;
$$;
revoke all on function public.rc_contar_notificaciones(uuid) from public, anon, authenticated;
grant execute on function public.rc_contar_notificaciones(uuid) to service_role;

revoke all on function public.rc_encolar_notificacion(uuid,text,text,text,text,text,text,integer) from public, anon, authenticated;
revoke all on function public.rc_reclamar_notificaciones(integer) from public, anon, authenticated;
revoke all on function public.rc_bloquear_notificaciones_control(text) from public, anon, authenticated;
grant execute on function public.rc_encolar_notificacion(uuid,text,text,text,text,text,text,integer) to service_role;
grant execute on function public.rc_reclamar_notificaciones(integer) to service_role;
grant execute on function public.rc_bloquear_notificaciones_control(text) to service_role;
