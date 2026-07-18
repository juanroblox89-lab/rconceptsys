-- ============================================================
-- FIX: Users RLS - Version ultra-simple
-- Copia y pega TODO esto en Supabase SQL Editor y dale Run
-- ============================================================

-- 1. Borrar TODAS las políticas conocidas de users
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

-- 2. Crear función is_admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE uid = auth.uid()::text AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. Crear políticas nuevas y simples
CREATE POLICY "p_read" ON public.users FOR SELECT USING (true);
CREATE POLICY "p_insert" ON public.users FOR INSERT WITH CHECK (uid = auth.uid()::text);
CREATE POLICY "p_update" ON public.users FOR UPDATE USING (uid = auth.uid()::text) WITH CHECK (uid = auth.uid()::text);
CREATE POLICY "p_admin" ON public.users FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
