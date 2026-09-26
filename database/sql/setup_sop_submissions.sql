-- ============================================================
-- SETUP: sop_submissions table
-- Run this in the Supabase SQL Editor (https://app.supabase.com)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sop_submissions (
  id TEXT PRIMARY KEY,
  "sopId" TEXT NOT NULL REFERENCES public.sops(id) ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  "userName" TEXT,
  "sopTitle" TEXT,
  status TEXT DEFAULT 'active',
  steps JSONB DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sop_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read sop_submissions" ON public.sop_submissions;
CREATE POLICY "Authenticated read sop_submissions" ON public.sop_submissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated write sop_submissions" ON public.sop_submissions;
CREATE POLICY "Authenticated write sop_submissions" ON public.sop_submissions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS set_updated_at_sop_submissions ON public.sop_submissions;
CREATE TRIGGER set_updated_at_sop_submissions
  BEFORE UPDATE ON public.sop_submissions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Add to realtime publication if not already added
-- NOTE: If this fails, it's safe to ignore or run the table insert separately
ALTER PUBLICATION supabase_realtime ADD TABLE public.sop_submissions;
