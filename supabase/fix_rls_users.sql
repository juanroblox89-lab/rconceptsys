-- ============================================================
-- FIX: Users RLS - Drop ALL policies and recreate clean
-- Run this ENTIRE block in Supabase SQL Editor
-- ============================================================

-- Drop EVERY policy on users table (catches all names)
DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'users' AND schemaname = 'public') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.users';
  END LOOP;
END $$;

-- Recreate is_admin function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE uid = auth.uid()::text AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Clean policies
CREATE POLICY "users_read" ON public.users
  FOR SELECT USING (true);

CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT WITH CHECK (uid = auth.uid()::text);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (uid = auth.uid()::text)
  WITH CHECK (uid = auth.uid()::text);

CREATE POLICY "users_admin_all" ON public.users
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());
