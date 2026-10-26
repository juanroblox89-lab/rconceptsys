-- 004_minutos_clientes_estadisticas.sql
-- RConcept Systems v2 — F3: Grabación por minuto, clientes, trabajos hechos y estadísticas
-- Creado para Supabase (Postgres 15+)

-- 1. Actualizar tipos_trabajo: unidad ('trabajo' o 'minuto')
do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'tipos_trabajo' and column_name = 'unidad'
    ) then
        alter table public.tipos_trabajo
            add column unidad text not null default 'trabajo'
            check (unidad in ('trabajo', 'minuto'));
    end if;
end $$;

-- Actualizar grabacion_video a unidad 'minuto'
update public.tipos_trabajo
set unidad = 'minuto'
where clave = 'grabacion_video';

-- 2. Tabla: clientes
create table if not exists public.clientes (
    id serial primary key,
    nombre text not null check (char_length(trim(nombre)) >= 1 and char_length(nombre) <= 80),
    activo boolean not null default true,
    creado_en timestamptz not null default now()
);

-- Índice único insensible a mayúsculas sobre nombre de cliente
create unique index if not exists idx_clientes_nombre_lower
    on public.clientes (lower(nombre));

create index if not exists idx_clientes_activo
    on public.clientes (activo);

-- RLS en clientes
alter table public.clientes enable row level security;

-- Política de lectura para miembros aprobados
drop policy if exists "clientes_select_miembros" on public.clientes;
create policy "clientes_select_miembros"
    on public.clientes
    for select
    to authenticated
    using (public.es_miembro());

-- Permisos según convención 002/003
revoke all on public.clientes from anon;
revoke insert, update, delete, truncate, references, trigger on public.clientes from authenticated;

-- 3. Modificaciones a tabla: tareas
-- 3.1 Nueva columna cliente_id
do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'tareas' and column_name = 'cliente_id'
    ) then
        alter table public.tareas
            add column cliente_id integer references public.clientes(id) on delete set null;
    end if;
end $$;

create index if not exists idx_tareas_cliente on public.tareas(cliente_id);

-- 3.2 Nuevas columnas para minutos y congelación de cantidades
do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'tareas' and column_name = 'cantidad'
    ) then
        alter table public.tareas
            add column cantidad integer null
            check (cantidad is null or (cantidad between 1 and 1440));
    end if;

    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'tareas' and column_name = 'cantidad_aceptada'
    ) then
        alter table public.tareas
            add column cantidad_aceptada integer null
            check (cantidad_aceptada is null or (cantidad_aceptada between 1 and 1440));
    end if;

    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'tareas' and column_name = 'precio_unitario_congelado'
    ) then
        alter table public.tareas
            add column precio_unitario_congelado bigint null
            check (precio_unitario_congelado is null or (precio_unitario_congelado >= 0 and precio_unitario_congelado <= 100000000000));
    end if;
end $$;

-- 3.3 Cambiar precio_congelado a bigint y actualizar restricciones
do $$
declare
    r record;
begin
    -- Cambiar tipo de precio_congelado a bigint si no lo es
    alter table public.tareas alter column precio_congelado type bigint;

    -- Eliminar check constraints anteriores sobre precio_congelado si existen
    for r in (
        select constraint_name
        from information_schema.constraint_column_usage
        where table_schema = 'public' and table_name = 'tareas' and column_name = 'precio_congelado'
    ) loop
        if r.constraint_name <> 'ck_tareas_aceptada_datos' then
            execute format('alter table public.tareas drop constraint if exists %I', r.constraint_name);
        end if;
    end loop;

    -- Agregar nuevo check constraint para precio_congelado
    alter table public.tareas
        drop constraint if exists ck_tareas_precio_congelado;
    alter table public.tareas
        add constraint ck_tareas_precio_congelado
        check (precio_congelado is null or (precio_congelado >= 0 and precio_congelado <= 100000000000));

    -- Actualizar restricción ck_tareas_aceptada_datos
    alter table public.tareas
        drop constraint if exists ck_tareas_aceptada_datos;
    alter table public.tareas
        add constraint ck_tareas_aceptada_datos check (
            (estado = 'aceptada'
                and precio_congelado is not null
                and precio_unitario_congelado is not null
                and cantidad_aceptada is not null
                and factura_id is not null) or
            (estado <> 'aceptada')
        );
end $$;

-- 4. Reemplazar función atómica aceptar_tarea con parámetro p_cantidad opcional
drop function if exists public.aceptar_tarea(bigint, uuid);
drop function if exists public.aceptar_tarea(bigint, uuid, integer);

create or replace function public.aceptar_tarea(
    p_tarea bigint,
    p_admin uuid,
    p_cantidad integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
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
    -- Verificar que el admin que resuelve exista y sea admin
    select es_admin into v_admin_es from public.perfiles where id = p_admin;
    if v_admin_es is not true then
        raise exception 'no autorizado: el usuario no es administrador' using errcode = 'P0001';
    end if;

    -- Bloquear y obtener la tarea
    select * into v_tarea
    from public.tareas
    where id = p_tarea
    for update;

    if not found then
        raise exception 'tarea no encontrada' using errcode = 'P0002';
    end if;

    if v_tarea.estado <> 'hecha' then
        raise exception 'la tarea debe estar en estado hecha para ser aceptada (estado actual: %)', v_tarea.estado using errcode = 'P0003';
    end if;

    -- Obtener tipo de trabajo vigente
    select * into v_tipo
    from public.tipos_trabajo
    where id = v_tarea.tipo_id;

    if not found then
        raise exception 'tipo de trabajo no encontrado' using errcode = 'P0004';
    end if;

    -- Determinar cantidad según la unidad del tipo
    if v_tipo.unidad = 'minuto' then
        v_cantidad := coalesce(p_cantidad, v_tarea.cantidad);
        if v_cantidad is null or v_cantidad < 1 or v_cantidad > 1440 then
            raise exception 'la cantidad de minutos debe estar entre 1 y 1440' using errcode = 'P0005';
        end if;
    else
        v_cantidad := 1;
    end if;

    -- Calcular total = precio_vigente * cantidad
    v_total := (v_tipo.precio::bigint) * (v_cantidad::bigint);

    -- Bloquear/buscar factura abierta de la persona asignada
    select id into v_factura_id
    from public.facturas
    where perfil_id = v_tarea.asignado_a and estado = 'abierta'
    for update;

    -- Si no existe factura abierta para esta persona, se crea una
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

    -- Actualizar la tarea de forma atómica: congelar precio unitario, cantidad, total y factura_id
    update public.tareas
    set estado = 'aceptada',
        precio_unitario_congelado = v_tipo.precio,
        cantidad_aceptada = v_cantidad,
        precio_congelado = v_total,
        factura_id = v_factura_id,
        resuelta_en = v_ahora,
        resuelta_por = p_admin
    where id = p_tarea;

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

-- Seguridad de aceptar_tarea: solo ejecutable por service_role
revoke execute on function public.aceptar_tarea(bigint, uuid, integer) from public, anon, authenticated;
grant execute on function public.aceptar_tarea(bigint, uuid, integer) to service_role;
