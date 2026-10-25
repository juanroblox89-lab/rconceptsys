-- 001_f0_base_y_chat.sql
-- RConcept Systems v2 — F0: Base del sistema + chat del equipo
-- Creado para Supabase (Postgres 15+)

-- Extensiones necesarias
create extension if not exists "uuid-ossp";

-- 1. Tabla: perfiles
-- id coincide con auth.users(id)
create table if not exists public.perfiles (
    id uuid primary key references auth.users(id) on delete cascade,
    correo text not null unique,
    nombre text not null,
    foto_path text,
    estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'suspendido')),
    es_admin boolean not null default false,
    creado_en timestamptz not null default now()
);

-- Indice para busquedas y listados
create index if not exists idx_perfiles_estado on public.perfiles(estado);
create index if not exists idx_perfiles_correo on public.perfiles(correo);

-- 2. Tabla: roles
create table if not exists public.roles (
    id serial primary key,
    clave text not null unique,
    nombre text not null,
    color text not null default '#737373',
    orden integer not null default 0,
    activo boolean not null default true
);

-- Semilla de roles
insert into public.roles (clave, nombre, color, orden, activo)
values
    ('camarografo', 'Camarógrafo', '#2563EB', 1, true),
    ('editor', 'Editor', '#7C3AED', 2, true),
    ('subidor_contenido', 'Subidor de contenido', '#059669', 3, true)
on conflict (clave) do update
set nombre = excluded.nombre,
    color = excluded.color,
    orden = excluded.orden,
    activo = excluded.activo;

-- 3. Tabla: perfil_roles (muchos a muchos)
create table if not exists public.perfil_roles (
    perfil_id uuid not null references public.perfiles(id) on delete cascade,
    rol_id integer not null references public.roles(id) on delete cascade,
    primary key (perfil_id, rol_id)
);

create index if not exists idx_perfil_roles_perfil on public.perfil_roles(perfil_id);
create index if not exists idx_perfil_roles_rol on public.perfil_roles(rol_id);

-- 4. Tabla: chat_mensajes (borrado logico con borrado_en)
create table if not exists public.chat_mensajes (
    id bigint generated always as identity primary key,
    autor_id uuid not null references public.perfiles(id) on delete cascade,
    cuerpo text not null check (char_length(cuerpo) >= 1 and char_length(cuerpo) <= 2000),
    creado_en timestamptz not null default now(),
    editado_en timestamptz,
    borrado_en timestamptz
);

create index if not exists idx_chat_mensajes_creado on public.chat_mensajes(creado_en desc);
create index if not exists idx_chat_mensajes_autor on public.chat_mensajes(autor_id);

-- 5. Tabla: configuracion (clave valor jsonb para fases futuras de cobros)
create table if not exists public.configuracion (
    clave text primary key,
    valor jsonb not null default '{}'::jsonb,
    actualizado_en timestamptz not null default now()
);

-- 6. Funcion de seguridad: es_miembro()
-- Devuelve true si el usuario autenticado tiene perfil con estado 'aprobado'
create or replace function public.es_miembro()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from public.perfiles
        where id = auth.uid()
          and estado = 'aprobado'
    );
$$;

-- 7. Disparador de creacion automatica de perfil al registrarse en auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_nombre text;
begin
    v_nombre := coalesce(
        new.raw_user_meta_data->>'nombre',
        new.raw_user_meta_data->>'full_name',
        split_part(new.email, '@', 1)
    );
    if v_nombre is null or char_length(trim(v_nombre)) = 0 then
        v_nombre := 'Miembro';
    end if;

    insert into public.perfiles (id, correo, nombre, estado, es_admin)
    values (new.id, new.email, trim(v_nombre), 'pendiente', false)
    on conflict (id) do nothing;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- 8. Seguridad RLS en todas las tablas
alter table public.perfiles enable row level security;
alter table public.roles enable row level security;
alter table public.perfil_roles enable row level security;
alter table public.chat_mensajes enable row level security;
alter table public.configuracion enable row level security;

-- Politicas de lectura (select) solo para miembros aprobados (o el propio perfil para lectura inicial)
-- Cada usuario autenticado puede leer su propio perfil para ver su estado y rol
create policy "perfiles_select_propio"
    on public.perfiles
    for select
    to authenticated
    using (id = auth.uid() or public.es_miembro());

create policy "roles_select_miembros"
    on public.roles
    for select
    to authenticated
    using (public.es_miembro());

create policy "perfil_roles_select_miembros"
    on public.perfil_roles
    for select
    to authenticated
    using (public.es_miembro());

create policy "chat_mensajes_select_miembros"
    on public.chat_mensajes
    for select
    to authenticated
    using (public.es_miembro() and borrado_en is null);

create policy "configuracion_select_miembros"
    on public.configuracion
    for select
    to authenticated
    using (public.es_miembro());

-- Nota: NO hay politicas insert/update/delete para clientes (anon / authenticated).
-- Toda mutacion debe pasar obligatoriamente por el backend Go con service_role.

-- 9. Realtime habilitado para chat_mensajes
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        alter publication supabase_realtime add table public.chat_mensajes;
    end if;
exception
    when duplicate_object then null;
end $$;

-- 10. Storage: configuracion del bucket 'avatares'
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'avatares',
    'avatares',
    true,
    1048576, -- 1MB
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = true,
    file_size_limit = 1048576,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Politica de lectura publica en Storage para avatares
create policy "avatares_lectura_publica"
    on storage.objects
    for select
    to public
    using (bucket_id = 'avatares');
