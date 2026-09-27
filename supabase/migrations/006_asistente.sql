-- ============================================================================
-- 006_asistente.sql — RConcept Systems v2 · F5 Asistente IA
-- ============================================================================
-- Qué crea (BRIEF F5 §4, ANALISIS.md §3.2 fila Asistente, §6):
--   1. asistente_conversaciones — hilos de chat por usuario (título corto
--      para la lista). La ajena → 404 sin filtrar (lo impone Go).
--   2. asistente_mensajes       — historial INMUTABLE (pregunta/respuesta;
--      rol user|assistant; ANALISIS.md §6).
--   3. asistente_uso            — conteo diario por usuario (tope
--      ASISTENTE_TOPE_DIA; lo suma Go solo cuando el turno usó el modelo).
--   4. ALTER piezas             — guion_borrador (el asistente deja el guion
--      como borrador; nunca reemplaza el guion aprobado sin confirmación
--      del usuario — BRIEF F5 §1; lo impone Go).
--
-- Convenciones (igual que 001/002/003/004/005): snake_case, IDs uuid PK con
-- DEFAULT gen_random_uuid(), created_at/updated_at (+ updated_at con
-- trigger set_updated_at() de 001), CHECKs de vocabulario como texto,
-- índices por usuario/conversación/día, RLS (anon nada, escritura vía
-- backend service role), triggers de updated_at e inmutabilidad del
-- historial.
--
-- DEPENDENCIA: asume 001 y 002 aplicadas antes (extensión pgcrypto,
-- tablas usuarios/piezas, función set_updated_at()).
--
-- NOTA: migración REVISADA pero NO EJECUTADA — aún no hay proyecto
-- Supabase nuevo. Solo revisión visual de sintaxis (sin motor disponible).
-- ============================================================================

-- pgcrypto ya la crea 001; se repite con IF NOT EXISTS para que el archivo
-- sea robusto si alguna vez se revisa en forma aislada (igual que 002/003/004/005).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- Tabla: asistente_conversaciones (BRIEF F5 §1 — historial por usuario)
-- usuario_id = dueño del hilo (sin FK, como actor_id en actividad: el
-- historial sobrevive aunque el usuario cambie o se desactive).
-- ============================================================================
CREATE TABLE asistente_conversaciones (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid        NOT NULL,             -- usuarios.id (sin FK, como en actividad)
  titulo     text        NOT NULL DEFAULT '', -- primeras palabras de la primera pregunta
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT asistente_conversaciones_usuario_no_vacio
    CHECK (usuario_id IS NOT NULL)
);

COMMENT ON TABLE asistente_conversaciones IS
  'Hilos de chat del asistente (BRIEF F5 §1). Un usuario solo ve los suyos (lo impone Go: la ajena da 404).';

-- Conversaciones de un usuario, del más reciente al más viejo.
CREATE INDEX IF NOT EXISTS idx_asistente_conv_usuario
  ON asistente_conversaciones (usuario_id, updated_at DESC);

-- ============================================================================
-- Tabla: asistente_mensajes (historial INMUTABLE — ANALISIS.md §6)
-- Quién (por conversacion_id → usuario), qué (pregunta/respuesta), cuándo.
-- No se edita ni se borra (trigger + RLS, igual que actividad en 001).
-- ============================================================================
CREATE TABLE asistente_mensajes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id uuid        NOT NULL REFERENCES asistente_conversaciones (id) ON DELETE CASCADE,
  rol             text        NOT NULL,   -- 'user' | 'assistant'
  contenido       text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT asistente_mensajes_rol_valido
    CHECK (rol IN ('user', 'assistant')),

  CONSTRAINT asistente_mensajes_contenido_no_vacio
    CHECK (char_length(btrim(contenido)) > 0)
);

COMMENT ON TABLE asistente_mensajes IS
  'Historial solo-INSERT del chat (ANALISIS.md §6): pregunta (user) y respuesta (assistant). Inmutable: trigger bloquear_asistente_mensajes impide UPDATE/DELETE salvo a service_role/postgres; además RLS no concede UPDATE/DELETE a ningún rol de app.';

-- Historial de una conversación en orden (GET /asistente/conversaciones/:id).
CREATE INDEX IF NOT EXISTS idx_asistente_msg_conversacion
  ON asistente_mensajes (conversacion_id, created_at);

-- ============================================================================
-- Tabla: asistente_uso (conteo diario — BRIEF F5 §1, tope por usuario/día)
-- Un fila por (usuario, día YYYY-MM-DD). El tope lo impone Go
-- (ASISTENTE_TOPE_DIA, default 30); la base solo guarda el conteo.
-- ============================================================================
CREATE TABLE asistente_uso (
  usuario_id uuid        NOT NULL,             -- usuarios.id (sin FK, como arriba)
  dia        date        NOT NULL,             -- día UTC (YYYY-MM-DD)
  conteo     integer     NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT asistente_uso_pk PRIMARY KEY (usuario_id, dia),

  CONSTRAINT asistente_uso_conteo_no_negativo
    CHECK (conteo >= 0)
);

COMMENT ON TABLE asistente_uso IS
  'Conteo diario de turnos del asistente por usuario (BRIEF F5 §1). El tope ASISTENTE_TOPE_DIA lo aplica Go; la base solo guarda.';

-- ============================================================================
-- ALTER piezas: guion_borrador (BRIEF F5 §1)
-- El asistente deja el guion propuesto como borrador; el guion aprobado
-- (columna guion) no cambia hasta que el usuario lo adopta con PATCH.
-- ============================================================================
ALTER TABLE piezas
  ADD COLUMN IF NOT EXISTS guion_borrador text NOT NULL DEFAULT '';

COMMENT ON COLUMN piezas.guion_borrador IS
  'Borrador del asistente IA (BRIEF F5 §1): nunca reemplaza al guion aprobado sin confirmación del usuario.';

-- ============================================================================
-- Triggers: updated_at + inmutabilidad del historial (igual que 001/002/004/005)
-- set_updated_at() ya la crea 001 (reutilizada en 004/005); se reusa si existe.
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_asistente_conv_updated_at ON asistente_conversaciones;
    CREATE TRIGGER trg_asistente_conv_updated_at
      BEFORE UPDATE ON asistente_conversaciones
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    DROP TRIGGER IF EXISTS trg_asistente_uso_updated_at ON asistente_uso;
    CREATE TRIGGER trg_asistente_uso_updated_at
      BEFORE UPDATE ON asistente_uso
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END
$$;

-- Historial inmutable: sin UPDATE ni DELETE en asistente_mensajes (igual que
-- tarea_eventos en 002, actividad en 001 y lead_eventos en 005).
CREATE OR REPLACE FUNCTION rechazar_cambio_asistente_mensajes()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'asistente_mensajes es inmutable (ANALISIS.md §6)';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_asistente_msg_inmutable ON asistente_mensajes;
CREATE TRIGGER trg_asistente_msg_inmutable
  BEFORE UPDATE OR DELETE ON asistente_mensajes
  FOR EACH ROW EXECUTE FUNCTION rechazar_cambio_asistente_mensajes();

-- ============================================================================
-- RLS (segunda capa; la seguridad real la da el backend Go)
-- Exactamente el patrón de 004/005: anon SIN ACCESO (ninguna política para
-- anon → RLS le niega todo por defecto) y sin políticas de escritura para
-- ningún rol de app (todo va por el backend con service role, que salta
-- RLS; el navegador nunca escribe directo en la base).
-- La matriz fina (asistente para todo acceso salvo pendiente/desactivado,
-- pero SOLO sobre lo que ya puede ver — BRIEF F5 §1, ANALISIS §3.2) la
-- impone Go, porque RLS no puede expresar roles de app ni la visibilidad
-- por cliente (§3.1.3) sin acoplarse a la lógica de negocio. Sin políticas
-- de SELECT para authenticated en estas tres tablas.
-- ============================================================================
ALTER TABLE asistente_conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistente_mensajes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistente_uso            ENABLE ROW LEVEL SECURITY;

-- Sin políticas para anon ni authenticated → denegado todo por defecto
-- (igual que actividad en 001, clientes/piezas/tareas en 002,
-- tarifas/cortes en 003, biblioteca en 004 y leads/visitas en 005).
-- Toda lectura/escritura va por el backend con service role (que salta RLS).
