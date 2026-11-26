-- /ria en el único grupo del equipo. Los RPC son exclusivos del backend Go.
begin;

-- Una respuesta RIA no representa al perfil que inició la consulta (incluidas las anteriores).
-- Los mensajes humanos conservan su FK y el comportamiento de borrado previo.
alter table public.chat_mensajes alter column autor_id drop not null;
update public.chat_mensajes set autor_id = null where es_ria and autor_id is not null;
do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint
                 where conrelid = 'public.chat_mensajes'::regclass and conname = 'chat_mensajes_autoria_ria_check') then
    alter table public.chat_mensajes add constraint chat_mensajes_autoria_ria_check
      check (es_ria = (autor_id is null));
  end if;
end;
$$;
alter table public.chat_mensajes enable row level security;
revoke all on table public.chat_mensajes from public, anon;
revoke insert, update, delete, truncate, references, trigger on table public.chat_mensajes from authenticated;
-- Se conserva chat_mensajes_select_miembros: solo aprobados y borrado_en IS NULL.

create table if not exists public.ria_consultas_grupo (
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  solicitud_id uuid not null,
  huella text not null,
  consulta_id bigint unique references public.chat_mensajes(id) on delete set null,
  respuesta_id bigint unique references public.chat_mensajes(id) on delete set null,
  terminada boolean not null default false,
  turno uuid,
  hasta timestamptz,
  primary key (perfil_id, solicitud_id),
  check ((turno is null) = (hasta is null))
);
alter table public.ria_consultas_grupo enable row level security;
revoke all on table public.ria_consultas_grupo from public, anon, authenticated;
grant select, insert, update, delete on table public.ria_consultas_grupo to service_role;

-- En una sola transacción: comprueba aprobación, deduplica, consume cupo si va a
-- inferir y, para una solicitud nueva, publica la consulta con autoría humana.
create or replace function public.rc_iniciar_ria_grupo(
  p_perfil uuid, p_solicitud uuid, p_turno uuid, p_comando text, p_dia date, p_tope integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_s public.ria_consultas_grupo;
  v_q public.chat_mensajes;
  v_r public.chat_mensajes;
  v_huella text;
begin
  if p_solicitud is null or p_turno is null or p_comando is null or p_dia is null or
     left(p_comando, 5) <> '/ria ' or char_length(p_comando) not between 6 and 2000 or
     substring(p_comando from 6) !~ '[^[:space:]]' then
    return jsonb_build_object('estado', 'invalida');
  end if;
  perform 1 from public.perfiles where id = p_perfil and estado = 'aprobado' for share;
  if not found then return jsonb_build_object('estado', 'denegada'); end if;
  -- Serializa arranques de un mismo perfil incluso cuando aún no existe su fila de idempotencia.
  perform pg_advisory_xact_lock(hashtextextended('ria-grupo:' || p_perfil::text, 0));
  v_huella := encode(sha256(convert_to(p_comando, 'UTF8')), 'hex');
  select * into v_s from public.ria_consultas_grupo
    where perfil_id = p_perfil and solicitud_id = p_solicitud for update;
  if found then
    if v_s.huella <> v_huella then return jsonb_build_object('estado', 'conflicto'); end if;
    select * into v_q from public.chat_mensajes
      where id = v_s.consulta_id and autor_id = p_perfil and not es_ria and borrado_en is null;
    if not found then return jsonb_build_object('estado', 'retirada'); end if;
    if v_s.terminada then
      select * into v_r from public.chat_mensajes
        where id = v_s.respuesta_id and es_ria and borrado_en is null;
      if not found then return jsonb_build_object('estado', 'retirada'); end if;
      return jsonb_build_object('estado', 'completa', 'consulta', to_jsonb(v_q), 'respuesta', to_jsonb(v_r));
    end if;
    if v_q.cuerpo <> p_comando then return jsonb_build_object('estado', 'conflicto'); end if;
    if v_s.hasta > clock_timestamp() then return jsonb_build_object('estado', 'en_curso'); end if;
    if not public.rc_cupo_ria(p_perfil, p_dia, p_tope) then return jsonb_build_object('estado', 'cupo'); end if;
    update public.ria_consultas_grupo set turno = p_turno, hasta = clock_timestamp() + interval '90 seconds'
      where perfil_id = p_perfil and solicitud_id = p_solicitud;
  else
    if not public.rc_cupo_ria(p_perfil, p_dia, p_tope) then return jsonb_build_object('estado', 'cupo'); end if;
    insert into public.chat_mensajes (autor_id, cuerpo) values (p_perfil, p_comando) returning * into v_q;
    insert into public.ria_consultas_grupo (perfil_id, solicitud_id, huella, consulta_id, turno, hasta)
      values (p_perfil, p_solicitud, v_huella, v_q.id, p_turno, clock_timestamp() + interval '90 seconds');
  end if;
  return jsonb_build_object('estado', 'iniciada', 'consulta', to_jsonb(v_q));
end;
$$;

-- Registra una sola respuesta, de modo que perder el evento SSE no la duplique.
create or replace function public.rc_finalizar_ria_grupo(
  p_perfil uuid, p_solicitud uuid, p_turno uuid, p_respuesta text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_s public.ria_consultas_grupo;
  v_r public.chat_mensajes;
begin
  perform 1 from public.perfiles where id = p_perfil and estado = 'aprobado' for share;
  if not found then return null; end if;
  select * into v_s from public.ria_consultas_grupo
    where perfil_id = p_perfil and solicitud_id = p_solicitud for update;
  if not found or v_s.terminada or p_turno is null or v_s.turno is distinct from p_turno or v_s.hasta <= clock_timestamp() then
    return null;
  end if;
  perform 1 from public.chat_mensajes where id = v_s.consulta_id and autor_id = p_perfil and not es_ria
    and borrado_en is null and encode(sha256(convert_to(cuerpo, 'UTF8')), 'hex') = v_s.huella for share;
  if not found then return null; end if;
  if p_respuesta is null or char_length(p_respuesta) not between 1 and 2000 then return null; end if;
  insert into public.chat_mensajes (cuerpo, es_ria) values (p_respuesta, true) returning * into v_r;
  update public.ria_consultas_grupo set respuesta_id = v_r.id, terminada = true, turno = null, hasta = null
    where perfil_id = p_perfil and solicitud_id = p_solicitud;
  return to_jsonb(v_r);
end;
$$;

create or replace function public.rc_liberar_ria_grupo(p_perfil uuid, p_solicitud uuid, p_turno uuid)
returns void language sql security invoker set search_path = '' as $$
  update public.ria_consultas_grupo set turno = null, hasta = null
    where perfil_id = p_perfil and solicitud_id = p_solicitud and turno = p_turno and not terminada;
$$;

revoke all on function public.rc_iniciar_ria_grupo(uuid,uuid,uuid,text,date,integer),
  public.rc_finalizar_ria_grupo(uuid,uuid,uuid,text), public.rc_liberar_ria_grupo(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.rc_iniciar_ria_grupo(uuid,uuid,uuid,text,date,integer),
  public.rc_finalizar_ria_grupo(uuid,uuid,uuid,text), public.rc_liberar_ria_grupo(uuid,uuid,uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;
