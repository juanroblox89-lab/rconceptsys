-- COPIA TODO ESTO Y PEGALO EN SQL EDITOR, LUEGO DA "RUN"

-- Solo tocar la tabla users, nada mas
-- Primero verificamos que existe
SELECT COUNT(*) FROM public.users LIMIT 1;

-- Si lo anterior funciono, sigue con esto:
DROP POLICY IF EXISTS "p_read" ON public.users;
DROP POLICY IF EXISTS "p_insert" ON public.users;
DROP POLICY IF EXISTS "p_update" ON public.users;
DROP POLICY IF EXISTS "p_admin" ON public.users;
DROP POLICY IF EXISTS "users_select" ON public.users;
DROP POLICY IF EXISTS "users_read" ON public.users;
DROP POLICY IF EXISTS "users_insert_own" ON public.users;
DROP POLICY IF EXISTS "users_self_insert" ON public.users;
DROP POLICY IF EXISTS "users_admin_insert" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_admin_update" ON public.users;
DROP POLICY IF EXISTS "users_update" ON public.users;
DROP POLICY IF EXISTS "users_admin_delete" ON public.users;
DROP POLICY IF EXISTS "users_admin_all" ON public.users;
DROP POLICY IF EXISTS "Authenticated read access" ON public.users;
DROP POLICY IF EXISTS "Authenticated write access" ON public.users;

CREATE POLICY "p_read" ON public.users FOR SELECT USING (true);
CREATE POLICY "p_insert" ON public.users FOR INSERT WITH CHECK (uid = auth.uid()::text);
CREATE POLICY "p_update" ON public.users FOR UPDATE USING (uid = auth.uid()::text) WITH CHECK (uid = auth.uid()::text);
CREATE POLICY "p_admin" ON public.users FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE uid = auth.uid()::text AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.users WHERE uid = auth.uid()::text AND role = 'admin')
);
