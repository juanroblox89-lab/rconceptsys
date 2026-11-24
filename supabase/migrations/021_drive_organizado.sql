-- F8: la raíz se guardaba desde 008; el ID y URL del cliente ya existen (009/012).
-- Vacío en conexiones anteriores: Organizar Drive verificará la jerarquía real.
alter table public.drive_conexion add column if not exists carpeta_clientes_id text not null default '';
comment on column public.drive_conexion.carpeta_clientes_id is 'Rama Clientes comprobada dentro de la raíz RConcept; vacío si aún no se organizó';
