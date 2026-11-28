-- Guion opcional del pedido. Las entregas y su historial guardan datos de
-- ejecución, no las instrucciones del trabajo. Reabrir conserva la misma fila.
begin;

alter table public.tareas add column if not exists guion text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_tareas_guion_longitud' and conrelid = 'public.tareas'::regclass
  ) then
    alter table public.tareas add constraint ck_tareas_guion_longitud
      check (char_length(guion) <= 20000);
  end if;
end;
$$;

commit;

-- Actualiza el esquema de PostgREST tras aplicar la nueva columna.
notify pgrst, 'reload schema';
