-- F6 fase 1. Aditiva e idempotente; NO aplicar desde el agente.
alter table public.clientes add column if not exists foto_url text;
alter table public.clientes add column if not exists drive_carpeta_id text;
alter table public.clientes add column if not exists material_carpeta_id text;
alter table public.clientes add column if not exists producto_carpeta_id text;
alter table public.clientes enable row level security;
-- Solo el backend escribe. Conserva las políticas de lectura de F3.
revoke insert, update, delete on public.clientes from anon, authenticated;
-- No fuerza cliente en datos históricos: las nuevas asignaciones lo validan en servidor.
comment on column public.clientes.material_carpeta_id is 'Carpeta Material del lugar dentro de la carpeta del cliente';
comment on column public.clientes.producto_carpeta_id is 'Carpeta Producto dentro de la carpeta del cliente';
grant select, insert, update, delete on public.clientes to service_role;
