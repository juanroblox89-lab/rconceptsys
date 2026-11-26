-- Reapertura de una aprobación por PATCH condicional a tareas (sin RPC nueva).
begin;

alter table public.tarea_entregas drop constraint if exists tarea_entregas_estado_check;
alter table public.tarea_entregas add constraint tarea_entregas_estado_check
  check (estado in ('activa', 'retirada', 'rechazada', 'aceptada', 'reemplazada', 'reabierta'));

alter table public.tarea_historial drop constraint if exists tarea_historial_evento_check;
alter table public.tarea_historial add constraint tarea_historial_evento_check
  check (evento in ('entrega_enviada', 'entrega_retirada', 'entrega_rechazada', 'entrega_aceptada', 'pedido_de_nuevo'));

-- Entrada transitoria del PATCH. El trigger la limpia; el motivo vive en el historial.
alter table public.tareas add column if not exists motivo_reapertura text
  check (motivo_reapertura is null);

create or replace function public.rc_registrar_reapertura_tarea()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_actor uuid := new.resuelta_por;
  v_motivo text := nullif(new.motivo_reapertura, '');
  v_ahora timestamptz := clock_timestamp();
  v_hoy date := (v_ahora at time zone 'America/Bogota')::date;
  v_factura_estado text;
  v_corte_pagada_en timestamptz;
  v_entrega_id bigint;
begin
  if not exists (select 1 from public.perfiles where id = v_actor and es_admin and estado = 'aprobado') then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  if char_length(v_motivo) > 500 then
    raise exception 'motivo_invalido' using errcode = '22023';
  end if;

  -- Serializa con el UPDATE de pago. Si pagó primero, no cambia ninguna fila.
  if old.factura_id is not null then
    select estado into v_factura_estado from public.facturas where id = old.factura_id for update;
    if v_factura_estado = 'pagada' then
      raise exception 'corte_pagado' using errcode = 'PT409';
    end if;
  end if;

  -- El cierre histórico guarda un total por persona, sin relación por tarea.
  -- Reutiliza el rango del snapshot y no cuenta aprobaciones posteriores al cierre.
  if old.resuelta_en is not null then
    for v_corte_pagada_en in
      select l.pagada_en from public.corte_lineas l join public.cortes c on c.id = l.corte_id
      where l.perfil_id = old.asignado_a
        and old.resuelta_en >= (c.desde::timestamp at time zone 'UTC')
        and old.resuelta_en <= ((c.hasta::timestamp + interval '23 hours 59 minutes 59 seconds') at time zone 'UTC')
        and old.resuelta_en <= c.creado_en
      order by l.corte_id for update of l
    loop
      if v_corte_pagada_en is not null then
        raise exception 'corte_pagado' using errcode = 'PT409';
      end if;
    end loop;
  end if;

  update public.tarea_entregas set estado = 'reabierta', actualizada_en = v_ahora
    where id = (select id from public.tarea_entregas where tarea_id = old.id order by id desc limit 1)
      and estado in ('activa', 'aceptada')
    returning id into v_entrega_id;

  -- Compatibilidad con aprobaciones previas a la tabla de entregas.
  if v_entrega_id is null then
    insert into public.tarea_entregas (
      tarea_id, perfil_id, metodo_entrega, enlace_medios, entrega_nombre, entrega_tipo,
      nota, cantidad, estado, creada_en, actualizada_en
    ) values (
      old.id, old.asignado_a, old.metodo_entrega, old.enlace_medios, old.entrega_nombre,
      old.entrega_tipo, old.nota_persona, old.cantidad, 'reabierta',
      coalesce(old.hecha_en, old.resuelta_en, v_ahora), v_ahora
    ) returning id into v_entrega_id;
  end if;

  insert into public.tarea_historial (
    tarea_id, actor_id, evento, detalle, motivo, metodo_entrega, enlace_medios, entrega_nombre,
    entrega_tipo, nota, cantidad, metadatos, creado_en
  ) values (
    old.id, v_actor, 'pedido_de_nuevo', 'Se pidió rehacer', v_motivo, old.metodo_entrega,
    old.enlace_medios, old.entrega_nombre, old.entrega_tipo, old.nota_persona, old.cantidad,
    jsonb_build_object('entrega_id', v_entrega_id, 'factura_id', old.factura_id,
                       'precio_congelado', old.precio_congelado), v_ahora
  );

  new.cantidad_aceptada := null;
  new.precio_unitario_congelado := null;
  new.precio_congelado := null;
  new.factura_id := null;
  new.resuelta_en := null;
  new.resuelta_por := null;
  new.hecha_en := null;
  new.metodo_entrega := null;
  new.enlace_medios := null;
  new.entrega_nombre := null;
  new.entrega_tipo := null;
  new.nota_persona := null;
  new.cantidad := null;
  new.motivo_rechazo := null;
  new.motivo_reapertura := null;
  new.fecha_limite := case when old.fecha_limite < v_hoy then v_hoy else old.fecha_limite end;
  return new;
end;
$$;

revoke execute on function public.rc_registrar_reapertura_tarea() from public, anon, authenticated;
grant execute on function public.rc_registrar_reapertura_tarea() to service_role;

drop trigger if exists rc_reapertura_tarea on public.tareas;
create trigger rc_reapertura_tarea before update of estado on public.tareas
for each row when (old.estado = 'aceptada' and new.estado = 'pendiente')
execute function public.rc_registrar_reapertura_tarea();

commit;
