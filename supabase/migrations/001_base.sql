-- ============================================================================
-- 001_base.sql — RConcept Systems v2 · F0 Fundación
-- ============================================================================
-- Crea las tablas base `usuarios` y `actividad` con sus checks, RLS,
-- función/trigger de `updated_at` e inmutabilidad del historial.
--
-- Convenciones (PLAN.md §2): snake_case, IDs uuid, created_at/updated_at,
-- migraciones numeradas en supabase/migrations/.
-- Modelo de accesos/oficios e historial (ANALISIS.md §3.1 y §6).
--
-- NOTA: migración REVISADA pero NO EJECUTADA — aún no hay proyecto
-- Supabase nuevo. Sin INSERT: no incluye datos reales ni semillas.
-- ============================================================================

-- Extensión para gen_random_uuid() (PK de actividad).
-- "if not exists" para que la migración sea re-ejecutable sin error.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- Tabla: usuarios
-- id = auth.users.id (el registro se crea al primer login; ver backend).
-- ============================================================================
CREATE TABLE usuarios (
  id          uuid        PRIMARY KEY,  -- coincide con auth.users.id
  nombre      text,
  email       text,
  foto        text,                     -- URL del avatar (Supabase Auth / Storage)
  telefono    text,
  acceso      text        NOT NULL DEFAULT 'pendiente',
  oficios     text[]      NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- Accesos válidos (ANALISIS.md §3.1): un solo acceso por persona.
  CONSTRAINT usuarios_acceso_valido
    CHECK (acceso IN ('dueno', 'admin', 'equipo', 'pendiente', 'desactivado')),

  -- Oficios válidos como subconjunto (<@) del catálogo.
  -- Se guardan como slugs sin tildes: corresponden a ANALISIS.md §3.1
  -- (grabación, edición, diseño, estrategia/guion, publicación, ventas).
  -- '{}' (vacío) es válido: un pendiente o admin puede no tener oficios.
  CONSTRAINT usuarios_oficios_validos
    CHECK (oficios <@ ARRAY['grabacion', 'edicion', 'diseno',
                            'estrategia', 'publicacion', 'ventas']::text[]),

  -- Formato básico de email, solo si viene informado (NULL permitido).
  CONSTRAINT usuarios_email_formato
    CHECK (email IS NULL
           OR email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

COMMENT ON TABLE usuarios IS
  'Personas del sistema. id = auth.users.id. El acceso/oficios los gestiona el backend (service role); ver ANALISIS.md §3.1.';
COMMENT ON COLUMN usuarios.acceso IS
  'Un acceso por persona: dueno | admin | equipo | pendiente | desactivado. Por defecto pendiente hasta aprobación.';
COMMENT ON COLUMN usuarios.oficios IS
  'Oficios (slugs sin tildes) que la persona puede recibir como trabajo. No dan poder, solo sirven para asignar (ANALISIS.md §3.1).';

-- Filtro por acceso (pantalla Equipo: lista y filtro por acceso).
CREATE INDEX IF NOT EXISTS idx_usuarios_acceso ON usuarios (acceso);

-- ============================================================================
-- Tabla: actividad (historial INMUTABLE — ANALISIS.md §6)
-- Quién, qué, cuándo, antes → después, motivo. No se edita ni se borra.
-- ============================================================================
CREATE TABLE actividad (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cuando       timestamptz NOT NULL DEFAULT now(),
  actor_id     uuid,                 -- quién lo hizo (usuarios.id, sin FK para conservar historial)
  actor_nombre text,                 -- nombre congelado al momento del evento
  accion       text        NOT NULL, -- qué pasó (p. ej. 'aprobar', 'cambiar_acceso', 'cambiar_oficios', 'desactivar')
  recurso      text        NOT NULL, -- sobre qué tipo (p. ej. 'usuario')
  recurso_id   text,                 -- id del recurso afectado (texto para no atarse a un tipo)
  antes        jsonb,                -- estado previo (p. ej. {"acceso":"pendiente"})
  despues      jsonb,                -- estado posterior (p. ej. {"acceso":"equipo"})
  motivo       text                  -- motivo obligatorio en cambios de acceso/oficios (lo exige el backend)
);

COMMENT ON TABLE actividad IS
  'Historial solo-INSERT (ANALISIS.md §6): quién, qué, cuándo, antes→después, motivo. Inmutable: trigger bloquear_actividad_mutable impide UPDATE/DELETE salvo a service_role/postgres; además RLS no concede UPDATE/DELETE a ningún rol de app.';
COMMENT ON COLUMN actividad.actor_id IS
  'Sin FK a usuarios a propósito: el historial sobrevive aunque el usuario cambie o se desactive.';

-- Lectura del endpoint GET /actividad?recurso=... (backend, vía service role).
CREATE INDEX IF NOT EXISTS idx_actividad_recurso ON actividad (recurso, recurso_id);
CREATE INDEX IF NOT EXISTS idx_actividad_cuando ON actividad (cuando DESC);

-- ============================================================================
-- Función + trigger: mantener updated_at en usuarios
-- ============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_updated_at() IS
  'Fija updated_at = now() en cada UPDATE. La usa el trigger trg_usuarios_updated_at.';

DROP TRIGGER IF EXISTS trg_usuarios_updated_at ON usuarios;
CREATE TRIGGER trg_usuarios_updated_at
  BEFORE UPDATE ON usuarios
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- Inmutabilidad de actividad: trigger que bloquea UPDATE y DELETE
-- (salvo service_role / postgres para mantenimiento extremo).
-- Capa 1 de 2: la capa 2 es RLS (sin políticas de UPDATE/DELETE para
-- ningún rol de app, así que anon/authenticated tampoco pueden por RLS).
-- ============================================================================
CREATE OR REPLACE FUNCTION bloquear_actividad_mutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- El backend (service role) nunca emite UPDATE/DELETE contra esta tabla;
  -- solo inserta. Se deja pasar a service_role/postgres por si alguna vez
  -- hace falta una reparación manual auditada fuera de la app.
  IF current_user IN ('service_role', 'postgres') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'actividad es inmutable: no se permite % en el historial (solo INSERT)', TG_OP;
END;
$$;

COMMENT ON FUNCTION bloquear_actividad_mutable() IS
  'Bloquea UPDATE/DELETE en actividad para todos los roles de app; solo service_role/postgres pasan (mantenimiento auditado).';

DROP TRIGGER IF EXISTS trg_actividad_inmutable ON actividad;
CREATE TRIGGER trg_actividad_inmutable
  BEFORE UPDATE OR DELETE ON actividad
  FOR EACH ROW
  EXECUTE FUNCTION bloquear_actividad_mutable();

-- ============================================================================
-- RLS (segunda capa; la seguridad real la da el backend Go)
-- ============================================================================
ALTER TABLE usuarios  ENABLE ROW LEVEL SECURITY;
ALTER TABLE actividad ENABLE ROW LEVEL SECURITY;

-- anon: SIN ACCESO — no se crea ninguna política para anon, así que por
-- defecto RLS le niega todo en ambas tablas.
--
-- authenticated en usuarios: SOLO lectura de su propia fila.
-- La escritura (aprobar, cambiar acceso/oficios, desactivar) va por el
-- backend con service role (que salta RLS); el navegador nunca escribe
-- directo en la base (PLAN.md §2, ANALISIS.md §3.2).
CREATE POLICY usuarios_select_propio
  ON usuarios
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

COMMENT ON POLICY usuarios_select_propio ON usuarios IS
  'authenticated solo lee su propia fila (auth.uid() = id). Sin políticas de INSERT/UPDATE/DELETE: la escritura la hace el backend con service role.';

-- actividad: SIN políticas para anon ni authenticated → denegado todo por
-- defecto. Toda lectura/escritura va por el backend con service role
-- (GET /actividad y registro de eventos), que salta RLS.
-- (Inmutabilidad adicional vía trigger trg_actividad_inmutable.)
