-- 011_push_suscripciones.sql
-- F5: avisos push (tarea nueva, vence mañana, entrega aprobada).
-- Web Push en la web; la APK reenvía la misma suscripción al backend.

create table if not exists public.push_suscripciones (
    id bigint generated always as identity primary key,
    perfil_id uuid not null references public.perfiles(id) on delete cascade,
    endpoint text not null unique check (char_length(endpoint) between 10 and 800),
    p256dh text not null check (char_length(p256dh) between 20 and 200),
    auth text not null check (char_length(auth) between 8 and 100),
    user_agent text check (user_agent is null or char_length(user_agent) <= 300),
    creado_en timestamptz not null default now()
);

create index if not exists idx_push_suscripciones_perfil on public.push_suscripciones(perfil_id);

alter table public.push_suscripciones enable row level security;

drop policy if exists "push_suscripciones_select_propia" on public.push_suscripciones;
create policy "push_suscripciones_select_propia"
    on public.push_suscripciones
    for select
    to authenticated
    using (public.es_miembro() and perfil_id = auth.uid());

revoke all on public.push_suscripciones from anon;
revoke insert, update, delete, truncate, references, trigger on public.push_suscripciones from authenticated;

-- Registro de avisos ya enviados (para no repetir "vence mañana" cada media hora).
create table if not exists public.push_enviados (
    clave text primary key,
    creado_en timestamptz not null default now()
);

alter table public.push_enviados enable row level security;

revoke all on public.push_enviados from anon;
revoke all on public.push_enviados from authenticated;

comment on table public.push_suscripciones is
    'Suscripciones Web Push de cada persona (F5). El endpoint es único por navegador/dispositivo.';
comment on table public.push_enviados is
    'Claves de avisos ya enviados (F5), por ejemplo vence:2026-12-01:42. Solo service_role.';
