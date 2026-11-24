-- F9: referencias de trabajo, independientes de la carpeta que recibe entregas.
-- NULL conserva el vínculo anterior en la vista; [] es una lista vaciada explícitamente.
alter table public.tareas
  add column if not exists drive_referencias jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tareas_drive_referencias_lista' and conrelid = 'public.tareas'::regclass
  ) then
    alter table public.tareas add constraint tareas_drive_referencias_lista
      check (case
        when drive_referencias is null then true
        when jsonb_typeof(drive_referencias) = 'array' then jsonb_array_length(drive_referencias) <= 3
        else false
      end);
  end if;
end
$$;
