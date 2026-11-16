-- 010_cortes_pago.sql
-- F5: corte de pagos (quincena o mes). Total por persona sobre lo aprobado
-- (tareas en estado "aceptada" con precio congelado dentro del periodo),
-- marca de pagado y exportación desde el backend.

create table if not exists public.cortes (
    id bigint generated always as identity primary key,
    periodo text not null check (periodo in ('quincena', 'mes', 'personalizado')),
    desde date not null,
    hasta date not null,
    estado text not null default 'cerrado' check (estado in ('cerrado')),
    total bigint not null default 0 check (total >= 0),
    creado_en timestamptz not null default now(),
    creado_por uuid references public.perfiles(id) on delete set null,
    constraint ck_cortes_rango check (hasta >= desde),
    constraint uq_cortes_periodo unique (desde, hasta)
);

create index if not exists idx_cortes_creado on public.cortes(creado_en desc);

create table if not exists public.corte_lineas (
    corte_id bigint not null references public.cortes(id) on delete cascade,
    perfil_id uuid not null references public.perfiles(id) on delete cascade,
    total bigint not null default 0 check (total >= 0),
    tareas integer not null default 0 check (tareas >= 0),
    pagada_en timestamptz,
    pagada_por uuid references public.perfiles(id) on delete set null,
    primary key (corte_id, perfil_id)
);

create index if not exists idx_corte_lineas_perfil on public.corte_lineas(perfil_id);

alter table public.cortes enable row level security;
alter table public.corte_lineas enable row level security;

-- Un miembro ve los cortes en los que aparece; el admin ve todos.
drop policy if exists "cortes_select_propio_o_admin" on public.cortes;
create policy "cortes_select_propio_o_admin"
    on public.cortes
    for select
    to authenticated
    using (
        public.es_miembro() and (
            exists (select 1 from public.perfiles p where p.id = auth.uid() and p.es_admin = true)
            or exists (select 1 from public.corte_lineas l where l.corte_id = id and l.perfil_id = auth.uid())
        )
    );

drop policy if exists "corte_lineas_select_propia_o_admin" on public.corte_lineas;
create policy "corte_lineas_select_propia_o_admin"
    on public.corte_lineas
    for select
    to authenticated
    using (
        public.es_miembro() and (
            perfil_id = auth.uid()
            or exists (select 1 from public.perfiles p where p.id = auth.uid() and p.es_admin = true)
        )
    );

revoke all on public.cortes from anon;
revoke insert, update, delete, truncate, references, trigger on public.cortes from authenticated;

revoke all on public.corte_lineas from anon;
revoke insert, update, delete, truncate, references, trigger on public.corte_lineas from authenticated;

comment on table public.cortes is
    'Corte de pagos por quincena o mes (F5). Guarda el rango y el total cerrado.';
comment on table public.corte_lineas is
    'Total por persona dentro de un corte (F5), con la marca de pagado.';
