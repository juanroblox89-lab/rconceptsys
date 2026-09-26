-- PASO 1: Deshabilitar RLS en users para arreglar el login
-- Copia esto y ejecútalo en SQL Editor

ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- PASO 2: Borrar todas las políticas rotas
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'users' AND schemaname = 'public') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.users';
  END LOOP;
END $$;

-- Verificar que funcionó
SELECT 'RLS deshabilitado en users. Ahora intenta login con Google.' AS resultado;
