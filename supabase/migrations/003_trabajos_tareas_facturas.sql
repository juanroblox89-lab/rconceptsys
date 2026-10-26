-- 003_trabajos_tareas_facturas.sql
-- RConcept Systems v2 — F2: Trabajos, tareas por rol, aceptación atómica y facturas por persona
-- Creado para Supabase (Postgres 15+)

-- 1. Tabla: tipos_trabajo
-- Tipos de trabajo configurables por el admin con precio en pesos colombianos y rol asociado
create table if not exists public.tipos_trabajo (
    id serial primary key,
    clave text not null unique,
    nombre text not null,
    rol_id integer references public.roles(id) on delete set null,
    precio integer not null default 0 check (precio >= 0 and precio <= 100000000),
    activo boolean not null default true,
    orden integer not null default 0,
    creado_en timestamptz not null default now()
);

create index if not exists idx_tipos_trabajo_activo on public.tipos_trabajo(activo);
create index if not exists idx_tipos_trabajo_rol on public.tipos_trabajo(rol_id);

-- Semilla de tipos de trabajo iniciales (precio 0, admin lo define; busca el rol por clave)
insert into public.tipos_trabajo (clave, nombre, rol_id, precio, activo, orden)
values
    ('grabacion_video', 'Grabación de video', (select id from public.roles where clave = 'camarografo' limit 1), 0, true, 1),
    ('edicion_video', 'Edición de video', (select id from public.roles where clave = 'editor' limit 1), 0, true, 2),
    ('subida_video', 'Subir video', (select id from public.roles where clave = 'subidor_contenido' limit 1), 0, true, 3)
on conflict (clave) do update
set nombre = excluded.nombre,
    rol_id = coalesce(excluded.rol_id, public.tipos_trabajo.rol_id),
    activo = excluded.activo,
    orden = excluded.orden;

-- 2. Tabla: facturas
-- Cada persona tiene su propia factura. Una sola factura abierta por persona.
create table if not exists public.facturas (
    id bigint generated always as identity primary key,
    perfil_id uuid not null references public.perfiles(id) on delete cascade,
    estado text not null default 'abierta' check (estado in ('abierta', 'pagada')),
    creada_en timestamptz not null default now(),
    pagada_en timestamptz,
    pagada_por uuid references public.perfiles(id) on delete set null
);

create index if not exists idx_facturas_perfil on public.facturas(perfil_id);
create index if not exists idx_facturas_estado on public.facturas(estado);

-- Índice único parcial: UNA sola factura 'abierta' por persona
create unique index if not exists idx_facturas_una_abierta_por_perfil
    on public.facturas(perfil_id)
    where estado = 'abierta';

-- 3. Tabla: tareas
-- Tareas asignadas a personas según su rol, con ciclo de vida y congelación de precio en factura
create table if not exists public.tareas (
    id bigint generated always as identity primary key,
    tipo_id integer not null references public.tipos_trabajo(id),
    titulo text not null check (char_length(titulo) >= 1 and char_length(titulo) <= 120),
    descripcion text check (descripcion is null or char_length(descripcion) <= 1000),
    asignado_a uuid not null references public.perfiles(id) on delete cascade,
    creado_por uuid not null references public.perfiles(id),
    estado text not null default 'pendiente' check (estado in ('pendiente', 'hecha', 'aceptada', 'rechazada', 'cancelada')),
    fecha_limite date,
    nota_persona text check (nota_persona is null or char_length(nota_persona) <= 500),
    motivo_rechazo text check (motivo_rechazo is null or char_length(motivo_rechazo) <= 500),
    precio_congelado integer check (precio_congelado is null or (precio_congelado >= 0 and precio_congelado <= 100000000)),
    factura_id bigint references public.facturas(id) on delete restrict,
    creada_en timestamptz not null default now(),
    hecha_en timestamptz,
    resuelta_en timestamptz,
    resuelta_por uuid references public.perfiles(id) on delete set null,
    constraint ck_tareas_aceptada_datos check (
        (estado = 'aceptada' and precio_congelado is not null and factura_id is not null) or
        (estado <> 'aceptada')
    )
);

create index if not exists idx_tareas_asignado_estado on public.tareas(asignado_a, estado);
create index if not exists idx_tareas_estado on public.tareas(estado);
create index if not exists idx_tareas_tipo on public.tareas(tipo_id);
create index if not exists idx_tareas_factura on public.tareas(factura_id);

-- 4. RLS activado en todas las nuevas tablas
alter table public.tipos_trabajo enable row level security;
alter table public.facturas enable row level security;
alter table public.tareas enable row level security;

-- Políticas de solo lectura para miembros autenticados y aprobados
-- Tipos de trabajo: lectura para miembros aprobados
drop policy if exists "tipos_trabajo_select_miembros" on public.tipos_trabajo;
create policy "tipos_trabajo_select_miembros"
    on public.tipos_trabajo
    for select
    to authenticated
    using (public.es_miembro());

-- Facturas: cada miembro solo puede leer sus propias facturas; admin puede verlas todas
drop policy if exists "facturas_select_propio_o_admin" on public.facturas;
create policy "facturas_select_propio_o_admin"
    on public.facturas
    for select
    to authenticated
    using (
        public.es_miembro() and (
            perfil_id = auth.uid() or
            exists (select 1 from public.perfiles p where p.id = auth.uid() and p.es_admin = true)
        )
    );

-- Tareas: cada miembro solo ve las suyas asignadas; admin puede verlas todas
drop policy if exists "tareas_select_asignado_o_admin" on public.tareas;
create policy "tareas_select_asignado_o_admin"
    on public.tareas
    for select
    to authenticated
    using (
        public.es_miembro() and (
            asignado_a = auth.uid() or
            exists (select 1 from public.perfiles p where p.id = auth.uid() and p.es_admin = true)
        )
    );

-- Revocar privilegios directos de anon y authenticated según la política de 002
revoke all on public.tipos_trabajo from anon;
revoke insert, update, delete, truncate, references, trigger on public.tipos_trabajo from authenticated;

revoke all on public.facturas from anon;
revoke insert, update, delete, truncate, references, trigger on public.facturas from authenticated;

revoke all on public.tareas from anon;
revoke insert, update, delete, truncate, references, trigger on public.tareas from authenticated;

-- 5. Función atómica para aceptar tarea: public.aceptar_tarea(p_tarea bigint, p_admin uuid)
-- Comprueba que la tarea esté 'hecha', obtiene el precio vigente del tipo_trabajo,
-- busca o abre la factura 'abierta' de la persona, congela el precio y vincula la factura.
create or replace function public.aceptar_tarea(p_tarea bigint, p_admin uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tarea record;
    v_tipo record;
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

    -- Obtener tipo de trabajo vigente y su precio
    select * into v_tipo
    from public.tipos_trabajo
    where id = v_tarea.tipo_id;

    if not found then
        raise exception 'tipo de trabajo no encontrado' using errcode = 'P0004';
    end if;

    -- Bloquear/buscar factura abierta de la persona asignada
    select id into v_factura_id
    from public.facturas
    where perfil_id = v_tarea.asignado_a and estado = 'abierta'
    for update;

    -- Si no existe factura abierta para esta persona, se crea una
    if v_factura_id is null then
        insert into public.facturas (perfil_id, estado, creada_en)
        values (v_tarea.asignado_a, 'abierta', v_ahora)
        returning id into v_factura_id;
    end if;

    -- Actualizar la tarea de forma atómica: congelar precio, factura_id y estado aceptada
    update public.tareas
    set estado = 'aceptada',
        precio_congelado = v_tipo.precio,
        factura_id = v_factura_id,
        resuelta_en = v_ahora,
        resuelta_por = p_admin
    where id = p_tarea;

    return jsonb_build_object(
        'tarea_id', p_tarea,
        'factura_id', v_factura_id,
        'precio_congelado', v_tipo.precio,
        'estado', 'aceptada',
        'resuelta_en', v_ahora
    );
end;
$$;

-- Seguridad de la función aceptar_tarea: solo ejecutable por service_role
revoke execute on function public.aceptar_tarea(bigint, uuid) from public, anon, authenticated;
grant execute on function public.aceptar_tarea(bigint, uuid) to service_role;
