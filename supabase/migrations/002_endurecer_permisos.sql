-- 002: defensa en profundidad. Todas las escrituras pasan por el backend (service role); el navegador
-- solo LEE lo que las politicas RLS le permiten (miembros aprobados). Quitamos los permisos de tabla
-- que Supabase concede por defecto a anon y authenticated para que no dependan solo de RLS.

alter table public.schema_migrations enable row level security;

-- anon (visitante sin sesion): nada
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon, authenticated;

-- authenticated: solo lectura (las politicas RLS filtran por es_miembro())
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;

-- las funciones del esquema no son ejecutables por defecto desde el exterior
revoke execute on all functions in schema public from public, anon;
grant execute on function public.es_miembro() to authenticated;

-- lo mismo para las tablas y funciones que se creen en el futuro
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
