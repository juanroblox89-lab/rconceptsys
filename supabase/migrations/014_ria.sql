-- F6: historial de RIA (el privado nunca se comparte), límite diario por persona.
create table if not exists public.ria_mensajes (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  rol text not null check (rol in ('user', 'assistant')),
  cuerpo text not null check (char_length(cuerpo) between 1 and 20000),
  creado_en timestamptz not null default now()
);
create index if not exists idx_ria_historial on public.ria_mensajes (perfil_id, id desc);
create table if not exists public.ria_uso_diario (
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  dia date not null,
  usos integer not null check (usos > 0),
  primary key (perfil_id, dia)
);
alter table public.ria_mensajes enable row level security;
alter table public.ria_uso_diario enable row level security;
revoke all on public.ria_mensajes, public.ria_uso_diario from anon, authenticated;
grant all on public.ria_mensajes, public.ria_uso_diario to service_role;
grant usage, select on sequence public.ria_mensajes_id_seq to service_role;

create or replace function public.rc_cupo_ria(p_perfil uuid, p_dia date, p_tope integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_tope < 1 then return false; end if;
  insert into public.ria_uso_diario (perfil_id, dia, usos) values (p_perfil, p_dia, 1)
    on conflict (perfil_id, dia) do update set usos = public.ria_uso_diario.usos + 1
      where public.ria_uso_diario.usos < p_tope;
  return found;
end;
$$;
revoke all on function public.rc_cupo_ria(uuid,date,integer) from public, anon, authenticated;
grant execute on function public.rc_cupo_ria(uuid,date,integer) to service_role;

-- La autoría de chat sigue referenciando perfiles humanos. RIA utiliza un indicador explícito.
alter table public.chat_mensajes add column if not exists es_ria boolean not null default false;
