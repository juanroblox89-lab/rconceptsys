-- ============================================================
-- CRM SETUP: Leads and Sales pipeline
-- Run this in the Supabase SQL Editor (https://app.supabase.com)
-- ============================================================

-- 1. Crear tabla de Leads/Prospectos
CREATE TABLE IF NOT EXISTS public.crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  source TEXT DEFAULT 'fisica', -- 'fisica' | 'virtual' | 'referencia'
  status TEXT DEFAULT 'Prospecto', -- 'Prospecto' | 'En contacto' | 'Propuesta enviada' | 'Negociación' | 'Cerrado-Ganado' | 'Cerrado-Perdido'
  estimated_value NUMERIC DEFAULT 0,
  notes TEXT,
  assigned_to TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  first_contact_date TIMESTAMPTZ DEFAULT NOW(),
  last_interaction_date TIMESTAMPTZ DEFAULT NOW(),
  next_follow_up_date TIMESTAMPTZ,
  loss_reason TEXT,
  client_strategy JSONB DEFAULT '{}'::jsonb, -- BD de aprendizaje (colores, guiones, hooks preferidos)
  satisfaction_score INTEGER, -- 1 a 5
  renovation_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS simples
DROP POLICY IF EXISTS "Authenticated read crm_leads" ON public.crm_leads;
CREATE POLICY "Authenticated read crm_leads" ON public.crm_leads
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated write crm_leads" ON public.crm_leads;
CREATE POLICY "Authenticated write crm_leads" ON public.crm_leads
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Agregar trigger para updatedAt
DROP TRIGGER IF EXISTS set_updated_at_leads ON public.crm_leads;
CREATE TRIGGER set_updated_at_leads
  BEFORE UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Insertar algunos leads de ejemplo para demostración si está vacío
-- INSERT INTO public.crm_leads (name, source, status, estimated_value, notes)
-- VALUES 
--   ('Villa Grande Restaurante', 'referencia', 'Negociación', 1500000, 'Interesado en videos de Tik Tok y Reels.'),
--   ('Gimnasio Ripped', 'fisica', 'En contacto', 800000, 'Visita física realizada. Esperando propuesta.'),
--   ('Odontología Estética', 'virtual', 'Prospecto', 1200000, 'Encontrado por Instagram.');
