-- ============================================================
-- RLS Policies - RConcept OS
-- Run AFTER the base schema.sql
-- Replaces the permissive "Authenticated read/write access" policies
-- ============================================================

-- Drop existing permissive policies
DO $$ BEGIN
  -- Drop read policies
  DROP POLICY IF EXISTS "Authenticated read access" ON public.users;
  DROP POLICY IF EXISTS "Authenticated read access" ON public.roles;
  DROP POLICY IF EXISTS "Authenticated read access" ON public.clients;
  DROP POLICY IF EXISTS "Authenticated read access" ON public.assignments;
  DROP POLICY IF EXISTS "Authenticated read access" ON public.invoices;
  DROP POLICY IF EXISTS "Authenticated read access" ON public.admin_invoices;
  DROP POLICY IF EXISTS "Authenticated read access" ON public.rate_cards;
  DROP POLICY IF EXISTS "Authenticated read access" ON public.formats;
  DROP POLICY IF EXISTS "Authenticated read access" ON public.hooks;
  DROP POLICY IF EXISTS "Authenticated read access" ON public.scripts;
  DROP POLICY IF EXISTS "Authenticated read access" ON public.assets;
  DROP POLICY IF EXISTS "Authenticated read access" ON public.references;
  DROP POLICY IF EXISTS "Authenticated read access" ON public.sops;
  DROP POLICY IF EXISTS "Authenticated read access" ON public.chats;
  DROP POLICY IF EXISTS "Authenticated read access" ON public.marketing_visits;
  -- Drop write policies
  DROP POLICY IF EXISTS "Authenticated write access" ON public.users;
  DROP POLICY IF EXISTS "Authenticated write access" ON public.roles;
  DROP POLICY IF EXISTS "Authenticated write access" ON public.clients;
  DROP POLICY IF EXISTS "Authenticated write access" ON public.assignments;
  DROP POLICY IF EXISTS "Authenticated write access" ON public.invoices;
  DROP POLICY IF EXISTS "Authenticated write access" ON public.admin_invoices;
  DROP POLICY IF EXISTS "Authenticated write access" ON public.rate_cards;
  DROP POLICY IF EXISTS "Authenticated write access" ON public.formats;
  DROP POLICY IF EXISTS "Authenticated write access" ON public.hooks;
  DROP POLICY IF EXISTS "Authenticated write access" ON public.scripts;
  DROP POLICY IF EXISTS "Authenticated write access" ON public.assets;
  DROP POLICY IF EXISTS "Authenticated write access" ON public.references;
  DROP POLICY IF EXISTS "Authenticated write access" ON public.sops;
  DROP POLICY IF EXISTS "Authenticated write access" ON public.chats;
  DROP POLICY IF EXISTS "Authenticated write access" ON public.marketing_visits;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- HELPER: Check if current user is admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE uid = auth.uid()::text AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- USERS TABLE
-- ============================================================
-- Everyone can read user profiles (needed for avatar, name display)
CREATE POLICY "users_select" ON public.users
  FOR SELECT TO authenticated USING (true);

-- Users can update their own profile (name, phone, photo)
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (uid = auth.uid()::text)
  WITH CHECK (uid = auth.uid()::text);

-- Only admins can insert/delete users
CREATE POLICY "users_admin_insert" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "users_admin_delete" ON public.users
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- Only admins can change roles/approved status
CREATE POLICY "users_admin_update" ON public.users
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- ROLES TABLE
-- ============================================================
CREATE POLICY "roles_select" ON public.roles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "roles_admin_all" ON public.roles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- CLIENTS TABLE
-- ============================================================
CREATE POLICY "clients_select" ON public.clients
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "clients_admin_all" ON public.clients
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- ASSIGNMENTS TABLE
-- ============================================================
-- Admins see all, employees see their own assignments
CREATE POLICY "assignments_select" ON public.assignments
  FOR SELECT TO authenticated
  USING (public.is_admin() OR employeeId = auth.uid()::text);

-- Admins can do everything
CREATE POLICY "assignments_admin_all" ON public.assignments
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Employees can update their own assignments (status changes)
CREATE POLICY "assignments_employee_update" ON public.assignments
  FOR UPDATE TO authenticated
  USING (employeeId = auth.uid()::text)
  WITH CHECK (employeeId = auth.uid()::text);

-- ============================================================
-- INVOICES (employee reported)
-- ============================================================
-- Employees see only their own invoices, admins see all
CREATE POLICY "invoices_select" ON public.invoices
  FOR SELECT TO authenticated
  USING (public.is_admin() OR employeeId = auth.uid()::text);

-- Employees can manage their own invoices
CREATE POLICY "invoices_employee_all" ON public.invoices
  FOR ALL TO authenticated
  USING (employeeId = auth.uid()::text)
  WITH CHECK (employeeId = auth.uid()::text);

-- Admins can manage all invoices
CREATE POLICY "invoices_admin_all" ON public.invoices
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- ADMIN INVOICES (consolidated)
-- ============================================================
CREATE POLICY "admin_invoices_select" ON public.admin_invoices
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_invoices_admin_all" ON public.admin_invoices
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- RATE CARDS
-- ============================================================
CREATE POLICY "rate_cards_select" ON public.rate_cards
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "rate_cards_admin_all" ON public.rate_cards
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- FORMATS, HOOKS, SCRIPTS (shared knowledge base)
-- ============================================================
CREATE POLICY "formats_select" ON public.formats
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "formats_admin_all" ON public.formats
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "hooks_select" ON public.hooks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "hooks_admin_all" ON public.hooks
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "scripts_select" ON public.scripts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "scripts_admin_all" ON public.scripts
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- ASSETS
-- ============================================================
CREATE POLICY "assets_select" ON public.assets
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "assets_admin_all" ON public.assets
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- REFERENCES
-- ============================================================
CREATE POLICY "references_select" ON public.references
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "references_admin_all" ON public.references
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- SOPS
-- ============================================================
CREATE POLICY "sops_select" ON public.sops
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sops_admin_all" ON public.sops
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- CHATS (AI conversation history)
-- ============================================================
-- Users see only their own chats
CREATE POLICY "chats_select" ON public.chats
  FOR SELECT TO authenticated
  USING (public.is_admin() OR "userId" = auth.uid()::text);

CREATE POLICY "chats_user_all" ON public.chats
  FOR ALL TO authenticated
  USING ("userId" = auth.uid()::text)
  WITH CHECK ("userId" = auth.uid()::text);

CREATE POLICY "chats_admin_all" ON public.chats
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- MARKETING VISITS
-- ============================================================
-- Employees see their own visits, admins see all
CREATE POLICY "marketing_select" ON public.marketing_visits
  FOR SELECT TO authenticated
  USING (public.is_admin() OR "userId" = auth.uid()::text);

CREATE POLICY "marketing_user_all" ON public.marketing_visits
  FOR ALL TO authenticated
  USING ("userId" = auth.uid()::text)
  WITH CHECK ("userId" = auth.uid()::text);

CREATE POLICY "marketing_admin_all" ON public.marketing_visits
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- STORAGE: Make buckets private (signed URLs only)
-- ============================================================
UPDATE storage.buckets SET public = false WHERE id IN ('assets', 'logos');

-- Drop old public read policy
DROP POLICY IF EXISTS "Public read access" ON storage.objects;

-- Authenticated users can read storage objects
CREATE POLICY "storage_auth_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id IN ('assets', 'logos'));

-- Authenticated users can upload
CREATE POLICY "storage_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('assets', 'logos'));

-- Only admins can delete from storage
CREATE POLICY "storage_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id IN ('assets', 'logos') AND public.is_admin());
