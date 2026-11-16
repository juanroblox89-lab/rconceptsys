-- 007_asignaciones_vistas.sql
-- F5: "Recientes" de la barra izquierda y página de Asignaciones (solo admins)
-- Guarda cuándo cada admin vio cada asignación: el punto azul se apaga al abrirla.

create table if not exists public.asignaciones_vistas (
    perfil_id uuid not null references public.perfiles(id) on delete cascade,
    tarea_id bigint not null references public.tareas(id) on delete cascade,
    visto_en timestamptz not null default now(),
    primary key (perfil_id, tarea_id)
);

create index if not exists idx_asignaciones_vistas_perfil on public.asignaciones_vistas(perfil_id, visto_en desc);

alter table public.asignaciones_vistas enable row level security;

-- Cada admin ve solo sus propias marcas.
drop policy if exists "asignaciones_vistas_select_propio" on public.asignaciones_vistas;
create policy "asignaciones_vistas_select_propio"
    on public.asignaciones_vistas
    for select
    to authenticated
    using (
        public.es_miembro() and perfil_id = auth.uid()
        and exists (select 1 from public.perfiles p where p.id = auth.uid() and p.es_admin = true)
    );

revoke all on public.asignaciones_vistas from anon;
revoke insert, update, delete, truncate, references, trigger on public.asignaciones_vistas from authenticated;

comment on table public.asignaciones_vistas is
    'Última visita de un admin a una asignación (F5). La novedad se calcula comparando con hecha_en/resuelta_en/creada_en.';
