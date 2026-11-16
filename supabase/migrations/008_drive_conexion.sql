-- 008_drive_conexion.sql
-- F5: un solo Drive del equipo, conectado por un admin con OAuth desde Gestión.
-- Cada tarea tiene su subcarpeta dentro de ese Drive y lo entregado se copia ahí.

create table if not exists public.drive_conexion (
    id integer primary key default 1 check (id = 1), -- una sola fila: el Drive del equipo
    correo text not null default '' check (char_length(correo) <= 200),
    refresh_token text not null check (char_length(refresh_token) between 10 and 4000),
    carpeta_raiz_id text not null default '' check (char_length(carpeta_raiz_id) <= 200),
    conectado_en timestamptz not null default now(),
    conectado_por uuid references public.perfiles(id) on delete set null,
    actualizado_en timestamptz not null default now()
);

alter table public.drive_conexion enable row level security;

-- Nadie lee la tabla desde el navegador: el refresh token vive solo en el backend.
-- (No se crean políticas: con RLS activo y sin política, authenticated y anon no ven nada.)
revoke all on public.drive_conexion from anon;
revoke all on public.drive_conexion from authenticated;

comment on table public.drive_conexion is
    'Cuenta de Google del equipo para el conector de Drive (F5). Fila única (id=1). Solo service_role.';

-- Subcarpeta de Drive por tarea
alter table public.tareas add column if not exists drive_carpeta_id text;
alter table public.tareas add column if not exists drive_carpeta_url text;

comment on column public.tareas.drive_carpeta_id is
    'Id de la carpeta de Drive de la tarea (F5). Lo crea el backend en el Drive del equipo.';
comment on column public.tareas.drive_carpeta_url is
    'Enlace https a la carpeta de Drive de la tarea (F5).';

create index if not exists idx_tareas_drive_carpeta on public.tareas(drive_carpeta_id)
    where drive_carpeta_id is not null;
