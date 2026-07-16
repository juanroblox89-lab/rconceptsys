-- ============================================================
-- FIX: Users table RLS policies
-- Run this in Supabase SQL Editor to fix the login issue
-- ============================================================

-- Drop the problematic insert policy that requires admin
DROP POLICY IF EXISTS "users_admin_insert" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;

-- Allow users to insert their own profile (needed for first-time Google login)
CREATE POLICY "users_self_insert" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (uid = auth.uid()::text);

-- Unified update policy: users can update own info, admins can update anyone
DROP POLICY IF EXISTS "users_admin_update" ON public.users;
CREATE POLICY "users_admin_update" ON public.users
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR uid = auth.uid()::text)
  WITH CHECK (public.is_admin() OR uid = auth.uid()::text);
