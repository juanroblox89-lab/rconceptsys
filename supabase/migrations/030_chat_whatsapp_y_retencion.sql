-- El brief reservaba 027, ya usada por pedido_de_nuevo. Aplicar después de 029.
-- No elimina datos al instalarse. Storage se borra exclusivamente vía su API.
begin;

alter table public.chat_mensajes add column if not exists respuesta_a_id bigint
  references public.chat_mensajes(id) on delete set null;
create index if not exists idx_chat_mensajes_respuesta on public.chat_mensajes(respuesta_a_id)
  where respuesta_a_id is not null;

alter table public.chat_adjuntos
  add column if not exists conservar boolean not null default false,
  add column if not exists purgado_en timestamptz,
  add column if not exists purga_intento uuid,
  add column if not exists purga_hasta timestamptz;
alter table public.asignacion_adjuntos
  add column if not exists conservar boolean not null default false,
  add column if not exists purgado_en timestamptz,
  add column if not exists purga_intento uuid,
  add column if not exists purga_hasta timestamptz;

create index if not exists idx_chat_adjuntos_retencion on public.chat_adjuntos(creado_en, id)
  where not conservar and purgado_en is null and tipo in ('audio','imagen','video')
    and url_externa is null and storage_path is not null;
create index if not exists idx_asignacion_adjuntos_retencion on public.asignacion_adjuntos(tarea_id, creado_en, id)
  where not conservar and purgado_en is null and estado_archivo = 'listo';
create index if not exists idx_asignacion_purga_en_curso on public.asignacion_adjuntos(tarea_id)
  where purga_intento is not null;
create index if not exists idx_chat_adjuntos_ruta on public.chat_adjuntos(storage_path)
  where storage_path is not null;

-- Solo el backend puede servir binarios. El acceso directo antes incluía archivos sueltos.
drop policy if exists chat_lectura_miembros on storage.objects;
drop policy if exists chat_binarios_solo_backend on storage.objects;
create policy chat_binarios_solo_backend on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id <> 'chat') with check (bucket_id <> 'chat');
drop policy if exists chat_adjuntos_select_miembros on public.chat_adjuntos;
create policy chat_adjuntos_select_miembros on public.chat_adjuntos for select to authenticated
  using (public.es_miembro() and exists (select 1 from public.chat_mensajes m
    where m.id = mensaje_id and m.borrado_en is null));

-- Una sola transacción: no se generan mensajes vacíos si el adjunto o la cita ya no existen.
create or replace function public.rc_enviar_chat(p_autor uuid, p_cuerpo text, p_respuesta bigint, p_adjuntos bigint[])
returns bigint language plpgsql set search_path = '' as $$
declare
  v_id bigint;
  v_total integer := coalesce(cardinality(p_adjuntos), 0);
  v_validos integer;
begin
  if p_cuerpo is null or char_length(p_cuerpo) > 2000 or v_total > 10
    or (p_cuerpo = '' and v_total = 0)
    or not exists (select 1 from public.perfiles where id = p_autor and estado = 'aprobado') then
    return null;
  end if;
  if p_respuesta is not null then
    perform 1 from public.chat_mensajes where id = p_respuesta and borrado_en is null for share;
    if not found then return null; end if;
  end if;
  perform 1 from public.chat_adjuntos where id = any(p_adjuntos) and autor_id = p_autor
    and mensaje_id is null and purgado_en is null and purga_intento is null order by id for update;
  get diagnostics v_validos = row_count;
  if v_validos <> v_total then return null; end if;

  insert into public.chat_mensajes(autor_id, cuerpo, respuesta_a_id)
    values (p_autor, p_cuerpo, p_respuesta) returning id into v_id;
  update public.chat_adjuntos set mensaje_id = v_id where id = any(p_adjuntos) and autor_id = p_autor;
  return v_id;
end $$;

-- Poner conservar y reclamar compiten por la misma fila. Nunca se confirma conservar después del reclamo.
create or replace function public.rc_conservar_chat(p_id bigint, p_actor uuid, p_conservar boolean)
returns setof public.chat_adjuntos language sql set search_path = '' as $$
  update public.chat_adjuntos a set conservar = p_conservar
  where a.id = p_id and a.purgado_en is null and a.purga_intento is null
    and a.tipo in ('audio','imagen','video') and a.url_externa is null and nullif(a.storage_path,'') is not null
    and exists (select 1 from public.chat_mensajes m where m.id = a.mensaje_id and m.borrado_en is null)
    and exists (select 1 from public.perfiles p where p.id = p_actor and p.estado = 'aprobado'
      and (p_conservar or p.es_admin or p.id = a.autor_id))
  returning a.*;
$$;

create or replace function public.rc_conservar_asignacion(p_tarea bigint, p_id uuid, p_actor uuid, p_conservar boolean)
returns setof public.asignacion_adjuntos language sql set search_path = '' as $$
  update public.asignacion_adjuntos a set conservar = p_conservar
  where a.id = p_id and a.tarea_id = p_tarea and a.estado_archivo = 'listo'
    and a.purgado_en is null and a.purga_intento is null
    and exists (select 1 from public.tareas t join public.perfiles p on p.id = p_actor
      where t.id = a.tarea_id and p.estado = 'aprobado' and (p.es_admin or (p_conservar and t.asignado_a = p.id)))
  returning a.*;
$$;

-- No se permite reabrir (ni quitar la fecha de cierre) mientras exista un borrado en curso.
-- El reclamo toma primero el lock de la tarea; la transición y el reclamo se ordenan en la DB.
create or replace function public.rc_bloquear_reapertura_en_purga()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.estado is not distinct from old.estado and new.resuelta_en is not distinct from old.resuelta_en then return new; end if;
  end if;
  if exists (select 1 from public.asignacion_adjuntos a where a.tarea_id = old.id and a.purga_intento is not null) then
    raise exception using errcode = 'PT409', message = 'purga_en_curso';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists rc_bloquear_reapertura_en_purga on public.tareas;
create trigger rc_bloquear_reapertura_en_purga before update of estado, resuelta_en or delete on public.tareas
  for each row execute function public.rc_bloquear_reapertura_en_purga();

create or replace function public.rc_reclamar_purga_chat(p_intento uuid)
returns table(id text, ruta text) language sql set search_path = '' as $$
  update public.chat_adjuntos a set purga_intento = p_intento, purga_hasta = now() + interval '5 minutes'
  where a.id = (select q.id from public.chat_adjuntos q
    where not q.conservar and q.purgado_en is null and q.tipo in ('audio','imagen','video')
      and q.url_externa is null and q.creado_en < now() - interval '360 hours'
      and q.storage_path like q.autor_id::text || '/%'
      and q.storage_path ~ '^[a-f0-9-]{36}/[0-9]+-[A-Za-z0-9_.-]+$'
      and not exists (select 1 from public.chat_adjuntos d where d.storage_path = q.storage_path and d.id <> q.id)
      and (q.purga_intento is null or q.purga_hasta <= now())
    order by q.creado_en, q.id limit 1 for update of q skip locked)
  returning a.id::text, a.storage_path;
$$;

create or replace function public.rc_reclamar_purga_asignacion(p_intento uuid)
returns table(id text, ruta text) language plpgsql set search_path = '' as $$
declare
  v_tarea bigint;
  v_id uuid;
  v_antes timestamptz := now() - interval '360 hours';
begin
  select t.id into v_tarea from public.tareas t
  where t.estado in ('aceptada','cancelada') and t.resuelta_en < v_antes and exists (
    select 1 from public.asignacion_adjuntos a where a.tarea_id = t.id and not a.conservar
      and a.purgado_en is null and a.estado_archivo = 'listo' and a.creado_en < v_antes
      and a.ruta = t.id::text || '/' || a.id::text || '/archivo'
      and (a.purga_intento is null or a.purga_hasta <= now())
      and (a.purga_intento is not null or a.estado_resumen not in ('pendiente','procesando'))
  ) order by t.resuelta_en, t.id limit 1 for update of t skip locked;
  if not found then return; end if;
  select a.id into v_id from public.asignacion_adjuntos a where a.tarea_id = v_tarea and not a.conservar
    and a.purgado_en is null and a.estado_archivo = 'listo' and a.creado_en < v_antes
    and a.ruta = v_tarea::text || '/' || a.id::text || '/archivo'
    and (a.purga_intento is null or a.purga_hasta <= now())
    and (a.purga_intento is not null or a.estado_resumen not in ('pendiente','procesando'))
    order by a.creado_en, a.id limit 1 for update of a skip locked;
  if not found then return; end if;
  return query update public.asignacion_adjuntos a set purga_intento = p_intento, purga_hasta = now() + interval '5 minutes'
    where a.id = v_id returning a.id::text, a.ruta;
end $$;

-- Confirma después del DELETE de Storage y solo si su catálogo ya no contiene el objeto.
-- La marca deja intactos las rutas históricas, mensajes, tareas, transcripciones y resúmenes.
create or replace function public.rc_marcar_purga(p_bucket text, p_id text, p_intento uuid)
returns boolean language plpgsql set search_path = '' as $$
begin
  if p_bucket = 'chat' then
    update public.chat_adjuntos a set purgado_en = now(), purga_intento = null, purga_hasta = null
    where a.id = p_id::bigint and a.purga_intento = p_intento and not a.conservar and a.purgado_en is null
      and not exists (select 1 from storage.objects o where o.bucket_id = 'chat' and o.name = a.storage_path);
    return found;
  elsif p_bucket = 'asignaciones-adjuntos' then
    update public.asignacion_adjuntos a set purgado_en = now(), purga_intento = null, purga_hasta = null
    where a.id = p_id::uuid and a.purga_intento = p_intento and not a.conservar and a.purgado_en is null
      and not exists (select 1 from storage.objects o where o.bucket_id = 'asignaciones-adjuntos' and o.name = a.ruta);
    return found;
  end if;
  return false;
end $$;

-- El tipo del registro no cambia a «borrando»: la limpieza de cargas incompletas no debe tocarlo.
-- Blindar el reclamo de resumen en la DB también frente a un cron que corre a la vez.
create or replace function public.rc_reclamar_resumen_adjunto(p_intento uuid)
returns setof public.asignacion_adjuntos language plpgsql set search_path = '' as $$
begin
  if not pg_catalog.pg_try_advisory_xact_lock(783092301) then return; end if;
  if exists (select 1 from public.asignacion_adjuntos where estado_resumen = 'procesando' and resumen_hasta > now()) then return; end if;
  return query update public.asignacion_adjuntos a
    set estado_resumen = 'procesando', resumen_intento = p_intento, resumen_hasta = now() + interval '3 minutes', actualizado_en = now()
    where a.id = (select q.id from public.asignacion_adjuntos q where q.estado_archivo = 'listo' and q.resumir
      and q.purgado_en is null and q.purga_intento is null
      and (q.estado_resumen = 'pendiente' or (q.estado_resumen = 'procesando' and q.resumen_hasta <= now()))
      order by q.actualizado_en, q.id limit 1 for update skip locked)
    returning a.*;
end $$;

-- Reutiliza la programación y el secreto existentes; solo despierta si hay trabajo.
create or replace function public.rconcept_llamar_cron_adjuntos()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secreto text;
  v_antes timestamptz := now() - interval '360 hours';
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'rconcept_cron_url' limit 1;
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'rconcept_cron_secret' limit 1;
  if v_url is null or v_secreto is null or v_url !~ '^https://[^/]+/api/cron/notificaciones$' then return; end if;
  if exists (select 1 from public.asignacion_adjuntos a where
       (a.estado_archivo = 'listo' and a.purgado_en is null and a.purga_intento is null and a.resumir
          and (a.estado_resumen = 'pendiente' or (a.estado_resumen = 'procesando' and a.resumen_hasta <= now())))
       or (a.estado_archivo <> 'listo' and a.actualizado_en < now() - interval '1 hour'))
    or exists (select 1 from public.chat_adjuntos q where not q.conservar and q.purgado_en is null
      and q.tipo in ('audio','imagen','video') and q.url_externa is null and q.creado_en < v_antes
      and q.storage_path like q.autor_id::text || '/%'
      and q.storage_path ~ '^[a-f0-9-]{36}/[0-9]+-[A-Za-z0-9_.-]+$'
      and not exists (select 1 from public.chat_adjuntos d where d.storage_path = q.storage_path and d.id <> q.id)
      and (q.purga_intento is null or q.purga_hasta <= now()))
    or exists (select 1 from public.asignacion_adjuntos a join public.tareas t on t.id = a.tarea_id
      where t.estado in ('aceptada','cancelada') and t.resuelta_en < v_antes and a.creado_en < v_antes
      and a.estado_archivo = 'listo' and not a.conservar and a.purgado_en is null
      and a.ruta = t.id::text || '/' || a.id::text || '/archivo'
      and (a.purga_intento is null or a.purga_hasta <= now())
      and (a.purga_intento is not null or a.estado_resumen not in ('pendiente','procesando'))) then
    perform net.http_get(url := regexp_replace(v_url, '/notificaciones$', '/adjuntos'),
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_secreto), timeout_milliseconds := 110000);
  end if;
end $$;

revoke all on function public.rc_enviar_chat(uuid,text,bigint,bigint[]),
  public.rc_conservar_chat(bigint,uuid,boolean), public.rc_conservar_asignacion(bigint,uuid,uuid,boolean),
  public.rc_reclamar_purga_chat(uuid), public.rc_reclamar_purga_asignacion(uuid), public.rc_marcar_purga(text,text,uuid),
  public.rc_reclamar_resumen_adjunto(uuid), public.rc_bloquear_reapertura_en_purga(), public.rconcept_llamar_cron_adjuntos()
  from public, anon, authenticated;
grant execute on function public.rc_enviar_chat(uuid,text,bigint,bigint[]),
  public.rc_conservar_chat(bigint,uuid,boolean), public.rc_conservar_asignacion(bigint,uuid,uuid,boolean),
  public.rc_reclamar_purga_chat(uuid), public.rc_reclamar_purga_asignacion(uuid), public.rc_marcar_purga(text,text,uuid),
  public.rc_reclamar_resumen_adjunto(uuid) to service_role;
-- Confirmación por catálogo en RPC invoker; no concede acceso a usuarios web.
grant usage on schema storage to service_role;
grant select on table storage.objects to service_role;
notify pgrst, 'reload schema';
commit;
