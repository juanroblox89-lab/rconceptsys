-- 028_entrega_drive_y_asignador.sql
-- Agrega asignador_id en tareas (para WhatsApp exacto tras reasignación) y
-- entrega_drive (hasta 4 elementos de Google Drive) en tareas, tarea_entregas y tarea_historial,
-- junto con el RPC atómico rc_entregar_tarea_drive y actualización de reversión/reapertura.
-- Idempotente: segura de ejecutar más de una vez. Aplicar después de 027.

begin;

-- 1. Asignador vigente y lista entrega_drive en public.tareas
alter table if exists public.tareas
  add column if not exists asignador_id uuid references public.perfiles(id) on delete set null,
  add column if not exists entrega_drive jsonb not null default '[]'::jsonb;

alter table if exists public.tarea_entregas
  add column if not exists entrega_drive jsonb not null default '[]'::jsonb;

alter table if exists public.tarea_historial
  add column if not exists entrega_drive jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_tareas_entrega_drive' and conrelid = 'public.tareas'::regclass
  ) then
    alter table public.tareas
      add constraint ck_tareas_entrega_drive
      check (jsonb_typeof(entrega_drive) = 'array' and jsonb_array_length(entrega_drive) <= 4);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_tarea_entregas_entrega_drive' and conrelid = 'public.tarea_entregas'::regclass
  ) then
    alter table public.tarea_entregas
      add constraint ck_tarea_entregas_entrega_drive
      check (jsonb_typeof(entrega_drive) = 'array' and jsonb_array_length(entrega_drive) <= 4);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_tarea_historial_entrega_drive' and conrelid = 'public.tarea_historial'::regclass
  ) then
    alter table public.tarea_historial
      add constraint ck_tarea_historial_entrega_drive
      check (jsonb_typeof(entrega_drive) = 'array' and jsonb_array_length(entrega_drive) <= 4);
  end if;
end $$;

-- 2. Actualizar rc_entregar_tarea para limpiar entrega_drive en entregas por WhatsApp o enlace simple
create or replace function public.rc_entregar_tarea(
  p_tarea bigint,
  p_perfil uuid,
  p_metodo text default null,
  p_nota text default null,
  p_cantidad integer default null,
  p_enlace text default null,
  p_entrega_nombre text default null,
  p_entrega_tipo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tarea record;
  v_tipo record;
  v_ahora timestamptz := now();
  v_metodo text;
  v_enlace text;
  v_nombre text;
  v_entrega_tipo text;
  v_nota text;
  v_cantidad integer;
  v_detalle text;
  v_entrega_id bigint;
begin
  select * into v_tarea from public.tareas where id = p_tarea for update;
  if not found then
    raise exception 'tarea_no_encontrada' using errcode = 'P0002';
  end if;
  if v_tarea.asignado_a <> p_perfil then
    raise exception 'tarea_ajena' using errcode = 'P0001';
  end if;
  if v_tarea.estado not in ('pendiente', 'rechazada') then
    raise exception 'estado_invalido:%', v_tarea.estado using errcode = 'P0003';
  end if;

  select * into v_tipo from public.tipos_trabajo where id = v_tarea.tipo_id;
  if not found then
    raise exception 'tipo_no_encontrado' using errcode = 'P0004';
  end if;

  if v_tipo.unidad = 'minuto' then
    if p_cantidad is null or p_cantidad < 1 or p_cantidad > 1440 then
      raise exception 'cantidad_invalida' using errcode = 'P0005';
    end if;
    v_cantidad := p_cantidad;
  else
    v_cantidad := null;
  end if;

  v_nota := nullif(btrim(coalesce(p_nota, '')), '');
  if v_nota is not null and char_length(v_nota) > 500 then
    raise exception 'nota_larga' using errcode = 'P0005';
  end if;

  v_metodo := nullif(lower(btrim(coalesce(p_metodo, ''))), '');
  v_enlace := nullif(btrim(coalesce(p_enlace, '')), '');
  v_nombre := nullif(btrim(coalesce(p_entrega_nombre, '')), '');
  v_entrega_tipo := nullif(lower(btrim(coalesce(p_entrega_tipo, ''))), '');

  if v_metodo is null and v_enlace is not null then
    v_metodo := 'drive';
  end if;

  if v_metodo = 'whatsapp' then
    v_enlace := null;
    v_nombre := null;
    v_entrega_tipo := null;
    v_detalle := 'Entrega enviada por WhatsApp';
  elsif v_metodo = 'drive' then
    if v_nombre is not null and char_length(v_nombre) > 200 then
      v_nombre := left(v_nombre, 200);
    end if;
    v_detalle := 'Entrega enviada por Drive';
  else
    v_metodo := null;
    v_detalle := 'Entrega enviada a revisión';
  end if;

  update public.tarea_entregas
  set estado = 'reemplazada', actualizada_en = v_ahora
  where tarea_id = p_tarea and estado = 'activa';

  insert into public.tarea_entregas (
    tarea_id, perfil_id, metodo_entrega, enlace_medios, entrega_nombre, entrega_tipo,
    entrega_drive, nota, cantidad, estado, creada_en, actualizada_en
  ) values (
    p_tarea, p_perfil, v_metodo, v_enlace, v_nombre, v_entrega_tipo,
    '[]'::jsonb, v_nota, v_cantidad, 'activa', v_ahora, v_ahora
  )
  returning id into v_entrega_id;

  update public.tareas
  set estado = 'hecha',
      hecha_en = v_ahora,
      nota_persona = v_nota,
      cantidad = v_cantidad,
      metodo_entrega = v_metodo,
      enlace_medios = v_enlace,
      entrega_nombre = v_nombre,
      entrega_tipo = v_entrega_tipo,
      entrega_drive = '[]'::jsonb,
      motivo_rechazo = null
  where id = p_tarea;

  insert into public.tarea_historial (
    tarea_id, actor_id, evento, detalle, metodo_entrega, enlace_medios, entrega_nombre,
    entrega_tipo, entrega_drive, nota, cantidad, metadatos, creado_en
  ) values (
    p_tarea, p_perfil, 'entrega_enviada', v_detalle, v_metodo, v_enlace, v_nombre,
    v_entrega_tipo, '[]'::jsonb, v_nota, v_cantidad,
    jsonb_build_object('entrega_id', v_entrega_id), v_ahora
  );

  return jsonb_build_object('tarea_id', p_tarea, 'entrega_id', v_entrega_id, 'estado', 'hecha');
end;
$$;

revoke all on function public.rc_entregar_tarea(bigint, uuid, text, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.rc_entregar_tarea(bigint, uuid, text, text, integer, text, text, text) to service_role;

-- 3. RPC atómica para entregar trabajo con hasta 4 elementos de Google Drive
create or replace function public.rc_entregar_tarea_drive(
  p_tarea bigint,
  p_perfil uuid,
  p_metodo text default 'drive',
  p_nota text default null,
  p_cantidad integer default null,
  p_enlace text default null,
  p_entrega_nombre text default null,
  p_entrega_tipo text default null,
  p_elementos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tarea record;
  v_tipo record;
  v_ahora timestamptz := now();
  v_elementos jsonb := coalesce(p_elementos, '[]'::jsonb);
  v_primero jsonb;
  v_enlace text;
  v_nombre text;
  v_entrega_tipo text;
  v_nota text;
  v_cantidad integer;
  v_entrega_id bigint;
  v_distintos integer;
  v_invalidos integer;
begin
  if jsonb_typeof(v_elementos) <> 'array'
     or jsonb_array_length(v_elementos) < 1
     or jsonb_array_length(v_elementos) > 4 then
    raise exception 'elementos_drive_invalidos' using errcode = 'P0005';
  end if;

  select count(*), count(*) filter (
    where jsonb_typeof(elem) <> 'object'
       or coalesce(btrim(elem->>'id'), '') = ''
       or coalesce(btrim(elem->>'nombre'), '') = ''
       or char_length(btrim(elem->>'nombre')) > 200
       or coalesce(btrim(elem->>'url'), '') !~ '^https://(drive|docs|drive\.usercontent)\.google\.com/'
       or coalesce(elem->>'tipo', '') not in ('carpeta', 'archivo')
  )
  into v_distintos, v_invalidos
  from jsonb_array_elements(v_elementos) elem;

  if v_invalidos > 0 then
    raise exception 'elementos_drive_invalidos' using errcode = 'P0005';
  end if;

  select count(distinct elem->>'id') into v_distintos
  from jsonb_array_elements(v_elementos) elem;

  if v_distintos <> jsonb_array_length(v_elementos) then
    raise exception 'elementos_drive_duplicados' using errcode = 'P0005';
  end if;

  select * into v_tarea from public.tareas where id = p_tarea for update;
  if not found then
    raise exception 'tarea_no_encontrada' using errcode = 'P0002';
  end if;
  if v_tarea.asignado_a <> p_perfil then
    raise exception 'tarea_ajena' using errcode = 'P0001';
  end if;
  if v_tarea.estado not in ('pendiente', 'rechazada') then
    raise exception 'estado_invalido:%', v_tarea.estado using errcode = 'P0003';
  end if;

  select * into v_tipo from public.tipos_trabajo where id = v_tarea.tipo_id;
  if not found then
    raise exception 'tipo_no_encontrado' using errcode = 'P0004';
  end if;

  if v_tipo.unidad = 'minuto' then
    if p_cantidad is null or p_cantidad < 1 or p_cantidad > 1440 then
      raise exception 'cantidad_invalida' using errcode = 'P0005';
    end if;
    v_cantidad := p_cantidad;
  else
    v_cantidad := null;
  end if;

  v_nota := nullif(btrim(coalesce(p_nota, '')), '');
  if v_nota is not null and char_length(v_nota) > 500 then
    raise exception 'nota_larga' using errcode = 'P0005';
  end if;

  v_primero := v_elementos->0;
  v_enlace := btrim(v_primero->>'url');
  v_nombre := left(btrim(v_primero->>'nombre'), 200);
  v_entrega_tipo := btrim(v_primero->>'tipo');

  update public.tarea_entregas
  set estado = 'reemplazada', actualizada_en = v_ahora
  where tarea_id = p_tarea and estado = 'activa';

  insert into public.tarea_entregas (
    tarea_id, perfil_id, metodo_entrega, enlace_medios, entrega_nombre, entrega_tipo,
    entrega_drive, nota, cantidad, estado, creada_en, actualizada_en
  ) values (
    p_tarea, p_perfil, 'drive', v_enlace, v_nombre, v_entrega_tipo,
    v_elementos, v_nota, v_cantidad, 'activa', v_ahora, v_ahora
  )
  returning id into v_entrega_id;

  update public.tareas
  set estado = 'hecha',
      hecha_en = v_ahora,
      nota_persona = v_nota,
      cantidad = v_cantidad,
      metodo_entrega = 'drive',
      enlace_medios = v_enlace,
      entrega_nombre = v_nombre,
      entrega_tipo = v_entrega_tipo,
      entrega_drive = v_elementos,
      motivo_rechazo = null
  where id = p_tarea;

  insert into public.tarea_historial (
    tarea_id, actor_id, evento, detalle, metodo_entrega, enlace_medios, entrega_nombre,
    entrega_tipo, entrega_drive, nota, cantidad, metadatos, creado_en
  ) values (
    p_tarea, p_perfil, 'entrega_enviada', 'Entrega enviada por Drive', 'drive', v_enlace, v_nombre,
    v_entrega_tipo, v_elementos, v_nota, v_cantidad,
    jsonb_build_object('entrega_id', v_entrega_id), v_ahora
  );

  return jsonb_build_object('tarea_id', p_tarea, 'entrega_id', v_entrega_id, 'estado', 'hecha');
end;
$$;

revoke all on function public.rc_entregar_tarea_drive(bigint, uuid, text, text, integer, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.rc_entregar_tarea_drive(bigint, uuid, text, text, integer, text, text, text, jsonb) to service_role;

-- 4. Actualizar rc_revertir_entrega_tarea para conservar y limpiar entrega_drive
create or replace function public.rc_revertir_entrega_tarea(
  p_tarea bigint,
  p_perfil uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tarea record;
  v_ahora timestamptz := now();
  v_entrega record;
  v_hecha_anterior timestamptz;
begin
  select * into v_tarea from public.tareas where id = p_tarea for update;
  if not found then
    raise exception 'tarea_no_encontrada' using errcode = 'P0002';
  end if;
  if v_tarea.asignado_a <> p_perfil then
    raise exception 'tarea_ajena' using errcode = 'P0001';
  end if;
  if v_tarea.estado <> 'hecha' then
    raise exception 'no_reversible:%', v_tarea.estado using errcode = 'P0003';
  end if;

  v_hecha_anterior := v_tarea.hecha_en;

  update public.tarea_entregas
  set estado = 'retirada', retirada_en = v_ahora, actualizada_en = v_ahora
  where tarea_id = p_tarea and estado = 'activa'
  returning * into v_entrega;

  if not found then
    insert into public.tarea_entregas (
      tarea_id, perfil_id, metodo_entrega, enlace_medios, entrega_nombre, entrega_tipo,
      entrega_drive, nota, cantidad, estado, creada_en, actualizada_en, retirada_en
    ) values (
      p_tarea, p_perfil, v_tarea.metodo_entrega, v_tarea.enlace_medios, v_tarea.entrega_nombre,
      v_tarea.entrega_tipo, coalesce(v_tarea.entrega_drive, '[]'::jsonb), v_tarea.nota_persona,
      v_tarea.cantidad, 'retirada', coalesce(v_tarea.hecha_en, v_ahora), v_ahora, v_ahora
    )
    returning * into v_entrega;
  end if;

  update public.tareas
  set estado = 'pendiente',
      hecha_en = null,
      metodo_entrega = null,
      enlace_medios = null,
      entrega_nombre = null,
      entrega_tipo = null,
      entrega_drive = '[]'::jsonb,
      nota_persona = null,
      cantidad = null
  where id = p_tarea and estado = 'hecha';

  if not found then
    raise exception 'no_reversible:cambio_concurrente' using errcode = 'P0003';
  end if;

  insert into public.tarea_historial (
    tarea_id, actor_id, evento, detalle, metodo_entrega, enlace_medios, entrega_nombre,
    entrega_tipo, entrega_drive, nota, cantidad, metadatos, creado_en
  ) values (
    p_tarea, p_perfil, 'entrega_retirada', 'Entrega retirada por el trabajador',
    v_entrega.metodo_entrega, v_entrega.enlace_medios, v_entrega.entrega_nombre,
    v_entrega.entrega_tipo, coalesce(v_entrega.entrega_drive, '[]'::jsonb), v_entrega.nota, v_entrega.cantidad,
    jsonb_build_object('entrega_id', v_entrega.id, 'hecha_en_anterior', v_hecha_anterior),
    v_ahora
  );

  return jsonb_build_object(
    'tarea_id', p_tarea,
    'estado', 'pendiente',
    'hecha_en_anterior', v_hecha_anterior,
    'entrega_id', v_entrega.id
  );
end;
$$;

revoke all on function public.rc_revertir_entrega_tarea(bigint, uuid) from public, anon, authenticated;
grant execute on function public.rc_revertir_entrega_tarea(bigint, uuid) to service_role;

-- 5. Actualizar trigger de reapertura (027) para conservar entrega_drive en historial y limpiar tarea
create or replace function public.rc_registrar_reapertura_tarea()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_actor uuid := new.resuelta_por;
  v_motivo text := nullif(new.motivo_reapertura, '');
  v_ahora timestamptz := clock_timestamp();
  v_hoy date := (v_ahora at time zone 'America/Bogota')::date;
  v_factura_estado text;
  v_corte_pagada_en timestamptz;
  v_entrega_id bigint;
begin
  if not exists (select 1 from public.perfiles where id = v_actor and es_admin and estado = 'aprobado') then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  if char_length(v_motivo) > 500 then
    raise exception 'motivo_invalido' using errcode = '22023';
  end if;

  if old.factura_id is not null then
    select estado into v_factura_estado from public.facturas where id = old.factura_id for update;
    if v_factura_estado = 'pagada' then
      raise exception 'corte_pagado' using errcode = 'PT409';
    end if;
  end if;

  if old.resuelta_en is not null then
    for v_corte_pagada_en in
      select l.pagada_en from public.corte_lineas l join public.cortes c on c.id = l.corte_id
      where l.perfil_id = old.asignado_a
        and old.resuelta_en >= (c.desde::timestamp at time zone 'UTC')
        and old.resuelta_en <= ((c.hasta::timestamp + interval '23 hours 59 minutes 59 seconds') at time zone 'UTC')
        and old.resuelta_en <= c.creado_en
      order by l.corte_id for update of l
    loop
      if v_corte_pagada_en is not null then
        raise exception 'corte_pagado' using errcode = 'PT409';
      end if;
    end loop;
  end if;

  update public.tarea_entregas set estado = 'reabierta', actualizada_en = v_ahora
    where id = (select id from public.tarea_entregas where tarea_id = old.id order by id desc limit 1)
      and estado in ('activa', 'aceptada')
    returning id into v_entrega_id;

  if v_entrega_id is null then
    insert into public.tarea_entregas (
      tarea_id, perfil_id, metodo_entrega, enlace_medios, entrega_nombre, entrega_tipo,
      entrega_drive, nota, cantidad, estado, creada_en, actualizada_en
    ) values (
      old.id, old.asignado_a, old.metodo_entrega, old.enlace_medios, old.entrega_nombre,
      old.entrega_tipo, coalesce(old.entrega_drive, '[]'::jsonb), old.nota_persona, old.cantidad, 'reabierta',
      coalesce(old.hecha_en, old.resuelta_en, v_ahora), v_ahora
    ) returning id into v_entrega_id;
  end if;

  insert into public.tarea_historial (
    tarea_id, actor_id, evento, detalle, motivo, metodo_entrega, enlace_medios, entrega_nombre,
    entrega_tipo, entrega_drive, nota, cantidad, metadatos, creado_en
  ) values (
    old.id, v_actor, 'pedido_de_nuevo', 'Se pidió rehacer', v_motivo, old.metodo_entrega,
    old.enlace_medios, old.entrega_nombre, old.entrega_tipo, coalesce(old.entrega_drive, '[]'::jsonb),
    old.nota_persona, old.cantidad,
    jsonb_build_object('entrega_id', v_entrega_id, 'factura_id', old.factura_id,
                       'precio_congelado', old.precio_congelado), v_ahora
  );

  new.cantidad_aceptada := null;
  new.precio_unitario_congelado := null;
  new.precio_congelado := null;
  new.factura_id := null;
  new.resuelta_en := null;
  new.resuelta_por := null;
  new.hecha_en := null;
  new.metodo_entrega := null;
  new.enlace_medios := null;
  new.entrega_nombre := null;
  new.entrega_tipo := null;
  new.entrega_drive := '[]'::jsonb;
  new.nota_persona := null;
  new.cantidad := null;
  new.motivo_rechazo := null;
  new.motivo_reapertura := null;
  new.fecha_limite := case when old.fecha_limite < v_hoy then v_hoy else old.fecha_limite end;
  return new;
end;
$$;

commit;
