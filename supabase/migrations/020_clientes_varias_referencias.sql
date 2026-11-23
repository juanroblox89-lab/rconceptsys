-- Varias referencias de Drive por cliente (Google Picker). Idempotente.
-- Cada elemento: {"id": "...", "nombre": "...", "url": "https://drive.google.com/..."}.
-- Las columnas drive_referencia_* se conservan y reflejan la primera referencia.
alter table public.clientes
  add column if not exists drive_referencias jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_drive_referencias_lista') then
    alter table public.clientes add constraint clientes_drive_referencias_lista
      check (jsonb_typeof(drive_referencias) = 'array' and jsonb_array_length(drive_referencias) <= 10);
  end if;
end
$$;

-- Pasa la referencia única anterior a la lista.
update public.clientes
set drive_referencias = jsonb_build_array(jsonb_build_object(
  'id', drive_referencia_id,
  'nombre', coalesce(drive_referencia_nombre, 'Referencia de Drive'),
  'url', coalesce(drive_referencia_url, '')))
where drive_referencia_id is not null and drive_referencias = '[]'::jsonb;
