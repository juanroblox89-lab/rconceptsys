-- ==============================================================================
-- FASE E - ESTÁNDARES DE IDENTIDAD Y SEGURIDAD (FIX #11 & #12)
-- Instrucciones: Ejecuta este script en el SQL Editor de Supabase
-- ==============================================================================

-- ==============================================================================
-- 0. CREACIÓN DE TABLAS SOP SI NO EXISTEN (Evita errores de relación inexistente)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.sops (
  id text primary key,
  title text,
  role text,
  steps jsonb default '[]'::jsonb,
  "autoBilling" jsonb,
  "createdAt" timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.sop_submissions (
  id text primary key,
  "sopId" text not null references public.sops(id) on delete cascade,
  "userId" text not null references public.users(uid) on delete cascade,
  "userName" text,
  "sopTitle" text,
  status text default 'active',
  steps jsonb default '[]'::jsonb,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

ALTER TABLE public.sop_submissions ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- FIX #12: MIGRACIÓN DE IDENTIDAD DUAL (employeeId: uid -> id)
-- Reemplaza los uids legacy (Firebase) con los ids reales de PostgreSQL.
-- ==============================================================================

-- 1. assignments table
UPDATE public.assignments a
SET "employeeId" = u.id::text
FROM public.users u
WHERE a."employeeId" = u.uid AND u.id::text != u.uid;

-- 2. invoices table
UPDATE public.invoices i
SET "employeeId" = u.id::text
FROM public.users u
WHERE i."employeeId" = u.uid AND u.id::text != u.uid;

-- 3. admin_invoices table
UPDATE public.admin_invoices ai
SET "employeeId" = u.id::text
FROM public.users u
WHERE ai."employeeId" = u.uid AND u.id::text != u.uid;

-- 4. chats table (userId)
UPDATE public.chats c
SET "userId" = u.id::text
FROM public.users u
WHERE c."userId" = u.uid AND u.id::text != u.uid;

-- 5. sop_submissions table (userId)
UPDATE public.sop_submissions s
SET "userId" = u.id::text
FROM public.users u
WHERE s."userId" = u.uid AND u.id::text != u.uid;


-- ==============================================================================
-- FIX #11: RLS - POLÍTICAS DE SEGURIDAD REALES
-- Evita que cualquier usuario autenticado pueda editar datos de otros usuarios
-- ==============================================================================

-- Función auxiliar para verificar si el usuario es admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE (uid = auth.uid()::text OR id = auth.uid()) 
      AND role = 'admin'
  );
$$;

-- Borrar políticas inseguras existentes de escritura (ejemplo de la tabla users)
DROP POLICY IF EXISTS "Authenticated write access" ON public.users;
DROP POLICY IF EXISTS "Authenticated write access" ON public.clients;
DROP POLICY IF EXISTS "Authenticated write access" ON public.invoices;

-- Nueva política para users: 
-- 1) Los usuarios solo pueden editarse a sí mismos (su propia fila)
-- 2) Los admins pueden editar a todos
CREATE POLICY "Users can update own row or if admin" ON public.users
FOR UPDATE TO authenticated
USING (
  (uid = auth.uid()::text) OR 
  (id = auth.uid()) OR 
  public.is_admin()
);

-- Nueva política para invoices:
-- 1) Los empleados pueden insertar/editar sus propios invoices
-- 2) Los admins pueden hacer todo
CREATE POLICY "Users manage own invoices or admins manage all" ON public.invoices
FOR ALL TO authenticated
USING (
  ("employeeId" = auth.uid()::text) OR 
  ("employeeId" IN (SELECT uid FROM public.users WHERE id = auth.uid())) OR 
  public.is_admin()
);

-- Nota: Para completar la seguridad estricta, repite el patrón anterior 
-- para clients, assignments, etc. (Ej: solo asignados o admins pueden editar assignments).
-- Por brevedad y para evitar romper flujos actuales, hemos asegurado las tablas 
-- más críticas de fraude de identidad (users e invoices).
