-- 025_entrega_metodo_reversion_y_rechazo_adjuntos.sql
-- Entrega por Drive o WhatsApp, reversión atómica de entrega con historial de auditoría,
-- y adjuntos multimedia/Drive en rechazos de tareas.
-- Idempotente: segura de ejecutar más de una vez. Aplicar después de 024.

-- 1. Columnas de método y selección de entrega en public.tareas
alter table if exists public.tareas
  add column if not exists metodo_entrega text,
  add column if not exists entrega_nombre text,
  add column if not exists entrega_tipo text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_tareas_metodo_entrega' and conrelid = 'public.tareas'::regclass
  ) then
    alter table public.tareas
      add constraint ck_tareas_metodo_entrega
      check (metodo_entrega is null or metodo_entrega in ('drive', 'whatsapp'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_tareas_entrega_nombre' and conrelid = 'public.tareas'::regclass
  ) then
    alter table public.tareas
      add constraint ck_tareas_entrega_nombre
      check (entrega_nombre is null or char_length(entrega_nombre) <= 200);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_tareas_entrega_tipo' and conrelid = 'public.tareas'::regclass
  ) then
    alter table public.tareas
      add constraint ck_tareas_entrega_tipo
      check (entrega_tipo is null or entrega_tipo in ('carpeta', 'archivo'));
  end if;
end $$;

-- 2. Tabla de entregas (reemplaza o retira de forma atómica; máximo 1 entrega viva por tarea)
create table if not exists public.tarea_entregas (
  id bigint generated always as identity primary key,
  tarea_id bigint not null references public.tareas(id) on delete cascade,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  metodo_entrega text check (metodo_entrega is null or metodo_entrega in ('drive', 'whatsapp')),
  enlace_medios text check (enlace_medios is null or char_length(enlace_medios) <= 500),
  entrega_nombre text check (entrega_nombre is null or char_length(entrega_nombre) <= 200),
  entrega_tipo text check (entrega_tipo is null or entrega_tipo in ('carpeta', 'archivo')),
  nota text check (nota is null or char_length(nota) <= 500),
  cantidad integer check (cantidad is null or (cantidad between 1 and 1440)),
  estado text not null default 'activa' check (estado in ('activa', 'retirada', 'rechazada', 'aceptada', 'reemplazada')),
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  retirada_en timestamptz
);

create index if not exists idx_tarea_entregas_tarea
  on public.tarea_entregas(tarea_id, id desc);

create unique index if not exists idx_tarea_entregas_una_activa
  on public.tarea_entregas(tarea_id)
  where estado = 'activa';

alter table public.tarea_entregas enable row level security;
revoke all on table public.tarea_entregas from public, anon, authenticated;
grant select, insert, update, delete on table public.tarea_entregas to service_role;
grant usage, select on sequence public.tarea_entregas_id_seq to service_role;

-- 3. Historial de entregas, retiros, rechazos y aprobaciones (auditoría inmutable)
create table if not exists public.tarea_historial (
  id bigint generated always as identity primary key,
  tarea_id bigint not null references public.tareas(id) on delete cascade,
  actor_id uuid references public.perfiles(id) on delete set null,
  evento text not null check (evento in ('entrega_enviada', 'entrega_retirada', 'entrega_rechazada', 'entrega_aceptada')),
  detalle text not null default '',
  metodo_entrega text check (metodo_entrega is null or metodo_entrega in ('drive', 'whatsapp')),
  enlace_medios text check (enlace_medios is null or char_length(enlace_medios) <= 500),
  entrega_nombre text check (entrega_nombre is null or char_length(entrega_nombre) <= 200),
  entrega_tipo text check (entrega_tipo is null or entrega_tipo in ('carpeta', 'archivo')),
  nota text check (nota is null or char_length(nota) <= 500),
  motivo text check (motivo is null or char_length(motivo) <= 500),
  cantidad integer check (cantidad is null or (cantidad between 1 and 1440)),
  drive_adjuntos jsonb not null default '[]'::jsonb check (jsonb_typeof(drive_adjuntos) = 'array' and jsonb_array_length(drive_adjuntos) <= 5),
  metadatos jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);

create index if not exists idx_tarea_historial_tarea
  on public.tarea_historial(tarea_id, id asc);

alter table public.tarea_historial enable row level security;
revoke all on table public.tarea_historial from public, anon, authenticated;
grant select, insert, update, delete on table public.tarea_historial to service_role;
grant usage, select on sequence public.tarea_historial_id_seq to service_role;

-- 4. Vincular adjuntos privados (F10) también a eventos de rechazo sin duplicar bucket ni pipeline
alter table if exists public.asignacion_adjuntos
  add column if not exists origen text not null default 'asignacion',
  add column if not exists historial_id bigint references public.tarea_historial(id) on delete cascade;

do $$
declare
  r record;
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_asignacion_adjuntos_origen' and conrelid = 'public.asignacion_adjuntos'::regclass
  ) then
    alter table public.asignacion_adjuntos
      add constraint ck_asignacion_adjuntos_origen
      check (origen in ('asignacion', 'rechazo'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_asignacion_adjuntos_rechazo_historial' and conrelid = 'public.asignacion_adjuntos'::regclass
  ) then
    alter table public.asignacion_adjuntos
      add constraint ck_asignacion_adjuntos_rechazo_historial
      check ((origen = 'asignacion' and historial_id is null) or (origen = 'rechazo' and historial_id is not null));
  end if;

  -- Reemplaza el unique(tarea_id, cupo) original por un índice único por (tarea_id, origen, historial_id, cupo)
  for r in (
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.asignacion_adjuntos'::regclass
      and c.contype = 'u'
      and c.conname = 'asignacion_adjuntos_tarea_id_cupo_key'
  ) loop
    execute format('alter table public.asignacion_adjuntos drop constraint if exists %I', r.conname);
  end loop;
end $$;

create unique index if not exists idx_asignacion_adjuntos_cupo_origen
  on public.asignacion_adjuntos (tarea_id, origen, coalesce(historial_id, 0), cupo);

create index if not exists idx_asignacion_adjuntos_historial
  on public.asignacion_adjuntos (historial_id, cupo)
  where historial_id is not null;

-- 5. Actualizar rc_reservar_adjunto para soportar origen 'asignacion' o 'rechazo'
create or replace function public.rc_reservar_adjunto(p jsonb)
returns setof public.asignacion_adjuntos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tarea bigint := (p->>'tarea_id')::bigint;
  v_id uuid := (p->>'id')::uuid;
  v_origen text := coalesce(nullif(p->>'origen', ''), 'asignacion');
  v_historial bigint := nullif(p->>'historial_id', '')::bigint;
  v_cupo smallint;
begin
  if v_origen = 'rechazo' then
    if v_historial is null then
      return;
    end if;
    perform 1 from public.tareas where id = v_tarea and estado = 'rechazada' for update;
    if not found then return; end if;
    perform 1 from public.tarea_historial where id = v_historial and tarea_id = v_tarea and evento = 'entrega_rechazada';
    if not found then return; end if;
  else
    v_origen := 'asignacion';
    v_historial := null;
    perform 1 from public.tareas where id = v_tarea and estado in ('pendiente', 'rechazada') for update;
    if not found then return; end if;
  end if;

  return query select * from public.asignacion_adjuntos where id = v_id and tarea_id = v_tarea;
  if found then return; end if;

  select i into v_cupo
  from pg_catalog.generate_series(1, 10) i
  where not exists (
    select 1 from public.asignacion_adjuntos a
    where a.tarea_id = v_tarea
      and a.origen = v_origen
      and coalesce(a.historial_id, 0) = coalesce(v_historial, 0)
      and a.cupo = i
  )
  order by i
  limit 1;

  if v_cupo is null then return; end if;

  insert into public.asignacion_adjuntos (
    id, tarea_id, cupo, origen, historial_id, tipo, ruta, nombre, tamano, mime, duracion_ms, resumir, creado_por
  ) values (
    v_id, v_tarea, v_cupo, v_origen, v_historial, p->>'tipo', p->>'ruta', p->>'nombre',
    (p->>'tamano')::integer, p->>'mime', (p->>'duracion_ms')::integer,
    coalesce((p->>'resumir')::boolean, false), (p->>'creado_por')::uuid
  );

  return query select * from public.asignacion_adjuntos where id = v_id;
end;
$$;

revoke all on function public.rc_reservar_adjunto(jsonb) from public, anon, authenticated;
grant execute on function public.rc_reservar_adjunto(jsonb) to service_role;

-- 6. RPC atómica para entregar tarea (Drive o WhatsApp) sin entregas huérfanas ni duplicadas
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

  -- Cualquier entrega activa previa pasa a 'reemplazada' antes de insertar la nueva
  update public.tarea_entregas
  set estado = 'reemplazada', actualizada_en = v_ahora
  where tarea_id = p_tarea and estado = 'activa';

  insert into public.tarea_entregas (
    tarea_id, perfil_id, metodo_entrega, enlace_medios, entrega_nombre, entrega_tipo,
    nota, cantidad, estado, creada_en, actualizada_en
  ) values (
    p_tarea, p_perfil, v_metodo, v_enlace, v_nombre, v_entrega_tipo,
    v_nota, v_cantidad, 'activa', v_ahora, v_ahora
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
      motivo_rechazo = null
  where id = p_tarea;

  insert into public.tarea_historial (
    tarea_id, actor_id, evento, detalle, metodo_entrega, enlace_medios, entrega_nombre,
    entrega_tipo, nota, cantidad, metadatos, creado_en
  ) values (
    p_tarea, p_perfil, 'entrega_enviada', v_detalle, v_metodo, v_enlace, v_nombre,
    v_entrega_tipo, v_nota, v_cantidad,
    jsonb_build_object('entrega_id', v_entrega_id), v_ahora
  );

  return jsonb_build_object('tarea_id', p_tarea, 'entrega_id', v_entrega_id, 'estado', 'hecha');
end;
$$;

revoke all on function public.rc_entregar_tarea(bigint, uuid, text, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.rc_entregar_tarea(bigint, uuid, text, text, integer, text, text, text) to service_role;

-- 7. RPC atómica e idempotente para revertir el envío a revisión
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

  -- Si era una entrega previa a la migración 025, guarda snapshot de auditoría igualmente
  if not found then
    insert into public.tarea_entregas (
      tarea_id, perfil_id, metodo_entrega, enlace_medios, entrega_nombre, entrega_tipo,
      nota, cantidad, estado, creada_en, actualizada_en, retirada_en
    ) values (
      p_tarea, p_perfil, v_tarea.metodo_entrega, v_tarea.enlace_medios, v_tarea.entrega_nombre,
      v_tarea.entrega_tipo, v_tarea.nota_persona, v_tarea.cantidad, 'retirada',
      coalesce(v_tarea.hecha_en, v_ahora), v_ahora, v_ahora
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
      nota_persona = null,
      cantidad = null
  where id = p_tarea and estado = 'hecha';

  if not found then
    raise exception 'no_reversible:cambio_concurrente' using errcode = 'P0003';
  end if;

  insert into public.tarea_historial (
    tarea_id, actor_id, evento, detalle, metodo_entrega, enlace_medios, entrega_nombre,
    entrega_tipo, nota, cantidad, metadatos, creado_en
  ) values (
    p_tarea, p_perfil, 'entrega_retirada', 'Entrega retirada por el trabajador',
    v_entrega.metodo_entrega, v_entrega.enlace_medios, v_entrega.entrega_nombre,
    v_entrega.entrega_tipo, v_entrega.nota, v_entrega.cantidad,
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

-- 8. RPC atómica para rechazar tarea con historial y enlaces Drive
create or replace function public.rc_rechazar_tarea(
  p_tarea bigint,
  p_admin uuid,
  p_motivo text,
  p_drive_adjuntos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_es boolean;
  v_tarea record;
  v_ahora timestamptz := now();
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_drive jsonb := coalesce(p_drive_adjuntos, '[]'::jsonb);
  v_historial_id bigint;
begin
  select es_admin into v_admin_es from public.perfiles where id = p_admin;
  if v_admin_es is not true then
    raise exception 'no_autorizado' using errcode = 'P0001';
  end if;
  if v_motivo = '' or char_length(v_motivo) > 500 then
    raise exception 'motivo_invalido' using errcode = 'P0005';
  end if;
  if jsonb_typeof(v_drive) <> 'array' or jsonb_array_length(v_drive) > 5 then
    raise exception 'drive_adjuntos_invalidos' using errcode = 'P0005';
  end if;

  select * into v_tarea from public.tareas where id = p_tarea for update;
  if not found then
    raise exception 'tarea_no_encontrada' using errcode = 'P0002';
  end if;
  if v_tarea.estado <> 'hecha' then
    raise exception 'estado_invalido:%', v_tarea.estado using errcode = 'P0003';
  end if;

  update public.tarea_entregas
  set estado = 'rechazada', actualizada_en = v_ahora
  where tarea_id = p_tarea and estado = 'activa';

  update public.tareas
  set estado = 'rechazada',
      motivo_rechazo = v_motivo,
      resuelta_en = v_ahora,
      resuelta_por = p_admin
  where id = p_tarea and estado = 'hecha';

  if not found then
    raise exception 'estado_invalido:cambio_concurrente' using errcode = 'P0003';
  end if;

  insert into public.tarea_historial (
    tarea_id, actor_id, evento, detalle, motivo, drive_adjuntos, creado_en
  ) values (
    p_tarea, p_admin, 'entrega_rechazada', 'Entrega devuelta con observaciones',
    v_motivo, v_drive, v_ahora
  )
  returning id into v_historial_id;

  return jsonb_build_object(
    'tarea_id', p_tarea,
    'estado', 'rechazada',
    'historial_id', v_historial_id,
    'resuelta_en', v_ahora
  );
end;
$$;

revoke all on function public.rc_rechazar_tarea(bigint, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.rc_rechazar_tarea(bigint, uuid, text, jsonb) to service_role;

-- 9. Actualizar aceptar_tarea para sincronizar también tarea_entregas y tarea_historial
create or replace function public.aceptar_tarea(
  p_tarea bigint,
  p_admin uuid,
  p_cantidad integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tarea record;
  v_tipo record;
  v_cantidad integer;
  v_total bigint;
  v_factura_id bigint;
  v_ahora timestamptz := now();
  v_admin_es boolean;
begin
  select es_admin into v_admin_es from public.perfiles where id = p_admin;
  if v_admin_es is not true then
    raise exception 'no autorizado: el usuario no es administrador' using errcode = 'P0001';
  end if;

  select * into v_tarea from public.tareas where id = p_tarea for update;
  if not found then
    raise exception 'tarea no encontrada' using errcode = 'P0002';
  end if;

  if v_tarea.estado <> 'hecha' then
    raise exception 'la tarea debe estar en estado hecha para ser aceptada (estado actual: %)', v_tarea.estado using errcode = 'P0003';
  end if;

  select * into v_tipo from public.tipos_trabajo where id = v_tarea.tipo_id;
  if not found then
    raise exception 'tipo de trabajo no encontrado' using errcode = 'P0004';
  end if;

  if v_tipo.unidad = 'minuto' then
    v_cantidad := coalesce(p_cantidad, v_tarea.cantidad);
    if v_cantidad is null or v_cantidad < 1 or v_cantidad > 1440 then
      raise exception 'la cantidad de minutos debe estar entre 1 y 1440' using errcode = 'P0005';
    end if;
  else
    v_cantidad := 1;
  end if;

  v_total := (v_tipo.precio::bigint) * (v_cantidad::bigint);

  select id into v_factura_id
  from public.facturas
  where perfil_id = v_tarea.asignado_a and estado = 'abierta'
  for update;

  if v_factura_id is null then
    insert into public.facturas (perfil_id, estado, creada_en)
    values (v_tarea.asignado_a, 'abierta', v_ahora)
    on conflict (perfil_id) where estado = 'abierta' do nothing
    returning id into v_factura_id;
    if v_factura_id is null then
      select id into v_factura_id
      from public.facturas
      where perfil_id = v_tarea.asignado_a and estado = 'abierta'
      for update;
    end if;
  end if;

  update public.tarea_entregas
  set estado = 'aceptada', actualizada_en = v_ahora
  where tarea_id = p_tarea and estado = 'activa';

  update public.tareas
  set estado = 'aceptada',
      precio_unitario_congelado = v_tipo.precio,
      cantidad_aceptada = v_cantidad,
      precio_congelado = v_total,
      factura_id = v_factura_id,
      resuelta_en = v_ahora,
      resuelta_por = p_admin
  where id = p_tarea and estado = 'hecha';

  insert into public.tarea_historial (
    tarea_id, actor_id, evento, detalle, cantidad, metadatos, creado_en
  ) values (
    p_tarea, p_admin, 'entrega_aceptada', 'Entrega aprobada', v_cantidad,
    jsonb_build_object('factura_id', v_factura_id, 'precio_congelado', v_total),
    v_ahora
  );

  return jsonb_build_object(
    'tarea_id', p_tarea,
    'factura_id', v_factura_id,
    'precio_unitario_congelado', v_tipo.precio,
    'cantidad_aceptada', v_cantidad,
    'precio_congelado', v_total,
    'estado', 'aceptada',
    'resuelta_en', v_ahora
  );
end;
$$;

revoke execute on function public.aceptar_tarea(bigint, uuid, integer) from public, anon, authenticated;
grant execute on function public.aceptar_tarea(bigint, uuid, integer) to service_role;
