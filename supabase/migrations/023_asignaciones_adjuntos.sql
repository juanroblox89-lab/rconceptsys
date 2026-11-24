-- F10. Aplicar después de 022; no cambia las referencias de Drive.
create table if not exists public.asignacion_adjuntos (
  id uuid primary key,
  tarea_id bigint not null references public.tareas(id) on delete cascade,
  cupo smallint not null check (cupo between 1 and 10),
  tipo text not null check (tipo in ('imagen','video','audio')),
  ruta text not null unique,
  nombre text not null check (char_length(nombre) between 1 and 180),
  tamano integer not null check (tamano > 0 and tamano <= case tipo when 'imagen' then 10485760 when 'video' then 52428800 else 26214400 end),
  mime text not null,
  duracion_ms integer check (duracion_ms >= 0),
  estado_archivo text not null default 'subiendo' check (estado_archivo in ('subiendo','finalizando','listo','borrando')),
  resumir boolean not null default false check (not resumir or tipo = 'audio'),
  estado_resumen text not null default 'sin_resumen' check (estado_resumen in ('sin_resumen','pendiente','procesando','listo','fallido')),
  resumen jsonb check (resumen is null or (jsonb_typeof(resumen) = 'array' and jsonb_array_length(resumen) between 3 and 6)),
  transcripcion text,
  proveedor text,
  resumen_intento uuid,
  resumen_hasta timestamptz,
  creado_por uuid references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (tarea_id, cupo)
);

alter table public.asignacion_adjuntos enable row level security;
revoke all on table public.asignacion_adjuntos from public, anon, authenticated;
grant select, insert, update, delete on table public.asignacion_adjuntos to service_role;
create index if not exists asignacion_adjuntos_cola on public.asignacion_adjuntos (actualizado_en) where estado_resumen in ('pendiente','procesando');
create index if not exists asignacion_adjuntos_limpieza on public.asignacion_adjuntos (actualizado_en) where estado_archivo <> 'listo';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('asignaciones-adjuntos', 'asignaciones-adjuntos', false, 52428800, array[
  'application/octet-stream','image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime','video/webm',
  'audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/webm'
]) on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Una política restrictiva evita que políticas permisivas ajenas habiliten este bucket.
drop policy if exists asignaciones_adjuntos_solo_backend on storage.objects;
create policy asignaciones_adjuntos_solo_backend on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id <> 'asignaciones-adjuntos') with check (bucket_id <> 'asignaciones-adjuntos');

create or replace function public.rc_reservar_adjunto(p jsonb)
returns setof public.asignacion_adjuntos language plpgsql set search_path = '' as $$
declare
  v_tarea bigint := (p->>'tarea_id')::bigint;
  v_id uuid := (p->>'id')::uuid;
  v_cupo smallint;
begin
  -- Serializa altas y valida aquí el estado editable ante guardados concurrentes.
  perform 1 from public.tareas where id = v_tarea and estado in ('pendiente','rechazada') for update;
  if not found then return; end if;
  return query select * from public.asignacion_adjuntos where id = v_id and tarea_id = v_tarea;
  if found then return; end if;
  select i into v_cupo from pg_catalog.generate_series(1,10) i
    where not exists (select 1 from public.asignacion_adjuntos a where a.tarea_id = v_tarea and a.cupo = i)
    order by i limit 1;
  if v_cupo is null then return; end if;
  insert into public.asignacion_adjuntos (id,tarea_id,cupo,tipo,ruta,nombre,tamano,mime,duracion_ms,resumir,creado_por)
  values (v_id,v_tarea,v_cupo,p->>'tipo',p->>'ruta',p->>'nombre',(p->>'tamano')::integer,
    p->>'mime',(p->>'duracion_ms')::integer,(p->>'resumir')::boolean,(p->>'creado_por')::uuid);
  return query select * from public.asignacion_adjuntos where id = v_id;
end;
$$;

create or replace function public.rc_reclamar_resumen_adjunto(p_intento uuid)
returns setof public.asignacion_adjuntos language plpgsql set search_path = '' as $$
begin
  -- Un solo audio activo entre instancias; un lease vencido se puede recuperar tras un reinicio.
  if not pg_catalog.pg_try_advisory_xact_lock(783092301) then return; end if;
  if exists (select 1 from public.asignacion_adjuntos where estado_resumen = 'procesando' and resumen_hasta > now()) then return; end if;
  return query update public.asignacion_adjuntos a
     set estado_resumen = 'procesando', resumen_intento = p_intento, resumen_hasta = now() + interval '3 minutes', actualizado_en = now()
     where a.id = (select q.id from public.asignacion_adjuntos q where q.estado_archivo = 'listo' and q.resumir
       and (q.estado_resumen = 'pendiente' or (q.estado_resumen = 'procesando' and q.resumen_hasta <= now()))
       order by q.actualizado_en, q.id limit 1 for update skip locked)
     returning a.*;
end;
$$;
revoke all on function public.rc_reservar_adjunto(jsonb) from public, anon, authenticated;
revoke all on function public.rc_reclamar_resumen_adjunto(uuid) from public, anon, authenticated;
grant execute on function public.rc_reservar_adjunto(jsonb) to service_role;
grant execute on function public.rc_reclamar_resumen_adjunto(uuid) to service_role;

-- Usa el mismo par de secretos del cron 018. Ninguna URL o clave queda en el código.
create or replace function public.rconcept_llamar_cron_adjuntos()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secreto text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'rconcept_cron_url' limit 1;
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'rconcept_cron_secret' limit 1;
  if v_url is null or v_secreto is null or v_url !~ '^https://[^/]+/api/cron/notificaciones$' then return; end if;
  if exists (select 1 from public.asignacion_adjuntos where
      (estado_archivo = 'listo' and resumir and (estado_resumen = 'pendiente' or (estado_resumen = 'procesando' and resumen_hasta <= now())))
      or (estado_archivo <> 'listo' and actualizado_en < now() - interval '1 hour')) then
    perform net.http_get(url := regexp_replace(v_url, '/notificaciones$', '/adjuntos'),
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_secreto), timeout_milliseconds := 110000);
  end if;
end;
$$;
revoke all on function public.rconcept_llamar_cron_adjuntos() from public, anon, authenticated;
select cron.schedule('rconcept-cron-adjuntos', '* * * * *', 'select public.rconcept_llamar_cron_adjuntos();');
