-- 009_clientes_piezas.sql
-- F5: ficha de cliente (paquete, carpeta de Drive, notas) y piezas que agrupan
-- las tareas de un contenido por etapa: Guion → Grabación → Edición → Revisión → Aprobada → Publicada.

-- 1. Ficha del cliente
alter table public.clientes add column if not exists paquete text;
alter table public.clientes add column if not exists drive_url text;
alter table public.clientes add column if not exists notas text;

comment on column public.clientes.paquete is 'Paquete contratado (TV, Digital, Mixtos...). F5.';
comment on column public.clientes.drive_url is 'Carpeta de Drive del cliente (enlace https). F5.';
comment on column public.clientes.notas is 'Notas internas del cliente (máx. 1000 caracteres). F5.';

-- 2. Piezas
create table if not exists public.piezas (
    id integer generated always as identity primary key,
    cliente_id integer references public.clientes(id) on delete set null,
    nombre text not null check (char_length(nombre) between 2 and 120),
    formato text not null default 'Reel' check (char_length(formato) <= 40),
    etapa text not null default 'guion'
        check (etapa in ('guion', 'grabacion', 'edicion', 'revision', 'aprobada', 'publicada')),
    fecha_publicacion date,
    notas text check (notas is null or char_length(notas) <= 1000),
    drive_carpeta_url text check (drive_carpeta_url is null or char_length(drive_carpeta_url) <= 500),
    creado_por uuid not null references public.perfiles(id),
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    deleted_at timestamptz
);

create index if not exists idx_piezas_cliente on public.piezas(cliente_id);
create index if not exists idx_piezas_etapa on public.piezas(etapa);
create index if not exists idx_piezas_actualizado on public.piezas(actualizado_en desc);

alter table public.piezas enable row level security;

drop policy if exists "piezas_select_miembros" on public.piezas;
create policy "piezas_select_miembros"
    on public.piezas
    for select
    to authenticated
    using (public.es_miembro() and deleted_at is null);

revoke all on public.piezas from anon;
revoke insert, update, delete, truncate, references, trigger on public.piezas from authenticated;

comment on table public.piezas is
    'Pieza de contenido de un cliente (F5). Agrupa las tareas de cada etapa del flujo.';

-- 3. La tarea puede colgar de una pieza (opcional: las tareas de siempre siguen funcionando)
alter table public.tareas add column if not exists pieza_id integer references public.piezas(id) on delete set null;

create index if not exists idx_tareas_pieza on public.tareas(pieza_id) where pieza_id is not null;

comment on column public.tareas.pieza_id is
    'Pieza a la que pertenece la tarea (F5). Nulo en las tareas creadas antes de las piezas.';

-- 4. Mantener actualizado_en al día
create or replace function public.tocar_actualizado_en()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.actualizado_en := now();
    return new;
end;
$$;

drop trigger if exists trg_piezas_actualizado on public.piezas;
create trigger trg_piezas_actualizado
    before update on public.piezas
    for each row execute function public.tocar_actualizado_en();
