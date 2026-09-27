-- ============================================================================
-- 004_biblioteca.sql — RConcept Systems v2 · F3 Biblioteca
-- ============================================================================
-- Qué crea (BRIEF F3 §1 y §3, ANALISIS.md §3.2 fila Biblioteca, §6):
--   1. formatos            — nombre, objetivo, estructura (pasos ordenados),
--                            hooks recomendados, KPIs, ejemplos (links).
--   2. hooks               — título/patrón, categoría, psicología (por qué
--                            funciona), retención esperada, variaciones,
--                            ejemplos.
--   3. referencias         — título, link, plataforma, análisis (qué copiar),
--                            etiquetas, cliente relacionado opcional.
--   4. sops                — título, oficio al que aplica (o todos), tiempo
--                            estimado, estado de flujo.
--   5. sop_pasos            — checklist ordenada del SOP (título + descripción).
--   6. sop_ejecuciones      — una persona inicia un SOP (opcionalmente ligado
--                            a una tarea F1), marca pasos, lo termina; queda
--                            registro (quién, cuándo, pasos marcados).
--   7. sop_ejecucion_pasos  — pasos marcados por ejecución.
--   8. ALTER clientes/piezas — formato_recomendado_id + hook_recomendado_id
--                            (solo referencia, sin romper F1; BRIEF F3 §1).
--
-- Flujo de contenido (BRIEF F3 §1, ANALISIS §3.2): admin/dueño crea y
-- publica directo. Equipo propone → queda en `borrador` visible solo para
-- quien lo propuso y para admin/dueño → admin/dueño `publica` o `rechaza`
-- con motivo. Nada se borra: se archiva. Lo impone Go; la base solo guarda
-- el vocabulario (estado + propuesto_por + publicado_por + motivo_rechazo).
--
-- Convenciones (igual que 001/002/003): snake_case, IDs uuid PK con
-- DEFAULT gen_random_uuid(), created_at/updated_at (+ created_by),
-- CHECKs de vocabulario como texto, índices por FK/estado/etiqueta,
-- RLS (anon nada, escritura vía backend service role), triggers de
-- updated_at. Sin INSERT de datos reales (las semillas demo van en memoria
-- aparte, igual que F1/F2).
--
-- DEPENDENCIA: asume 001, 002 y 003 aplicadas antes (extensión pgcrypto,
-- tablas usuarios/clientes/piezas/tareas, función set_updated_at()).
--
-- NOTA: migración REVISADA pero NO EJECUTADA — aún no hay proyecto
-- Supabase nuevo. Solo revisión visual de sintaxis (sin motor disponible).
-- ============================================================================

-- pgcrypto ya la crea 001; se repite con IF NOT EXISTS para que el archivo
-- sea robusto si alguna vez se revisa en forma aislada (igual que en 002/003).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- Tabla: formatos (BRIEF F3 §1)
-- Formato = estructura reusable (ej. RC-01 Recorrido Comercial, ED-02
-- Educativo Rápido, rescatados de contenido/formatos-y-hooks.js).
-- estructura = pasos ordenados en texto (uno por línea); hooks_recomendados
-- = patrones sugeridos (texto libre, p. ej. "Problema-Solución"); ejemplos
-- = links de ejemplo. codigo = id legible del sistema viejo (RC-01, ED-02),
-- único cuando se informa (los propuestos por el equipo no traen código).
-- ============================================================================
CREATE TABLE formatos (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo             text        UNIQUE,   -- ej. 'RC-01'; NULL permitido (varios NULL no violan UNIQUE)
  nombre             text        NOT NULL, -- ej. 'Recorrido Comercial'
  objetivo           text        NOT NULL DEFAULT '',
  estructura         text        NOT NULL DEFAULT '',  -- pasos ordenados, uno por línea
  hooks_recomendados text        NOT NULL DEFAULT '',
  kpis               text        NOT NULL DEFAULT '',
  ejemplos           text[]      NOT NULL DEFAULT '{}', -- links de ejemplo
  etiquetas          text[]      NOT NULL DEFAULT '{}', -- búsqueda/filtro (BRIEF F3 §1)
  estado             text        NOT NULL DEFAULT 'borrador',
  propuesto_por      uuid        REFERENCES usuarios (id) ON DELETE SET NULL,
  publicado_por      uuid        REFERENCES usuarios (id) ON DELETE SET NULL,
  motivo_rechazo     text,
  demo               boolean     NOT NULL DEFAULT false, -- true = semilla de ejemplo
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid,                   -- usuarios.id (sin FK, como en 002/003)

  CONSTRAINT formatos_nombre_no_vacio
    CHECK (char_length(btrim(nombre)) > 0),

  CONSTRAINT formatos_estado_valido
    CHECK (estado IN ('borrador', 'publicado', 'rechazado', 'archivado'))
);

COMMENT ON TABLE formatos IS
  'Formatos de contenido (BRIEF F3 §1). Flujo: equipo propone → borrador (solo proponente + admin/dueño) → admin/dueño publica o rechaza con motivo. Nada se borra: se archiva. Lo impone Go.';
COMMENT ON COLUMN formatos.codigo IS
  'Id legible del sistema viejo (RC-01, ED-02). UNIQUE; NULL para propuestos por el equipo (varios NULL permitidos).';
COMMENT ON COLUMN formatos.estructura IS
  'Pasos ordenados del formato, uno por línea (ej. "Intro Gancho > Recorrido POV > Beneficios > CTA").';
COMMENT ON COLUMN formatos.demo IS
  'true = semilla de ejemplo para la demo (contenido/formatos-y-hooks.js). Nunca confundir con contenido real.';

-- Búsqueda por texto (nombre) y filtro por estado/etiquetas.
CREATE INDEX IF NOT EXISTS idx_formatos_estado ON formatos (estado);
CREATE INDEX IF NOT EXISTS idx_formatos_propuesto_por ON formatos (propuesto_por);
CREATE INDEX IF NOT EXISTS idx_formatos_etiquetas ON formatos USING GIN (etiquetas);

-- ============================================================================
-- Tabla: hooks (BRIEF F3 §1)
-- Hook = patrón de apertura (ej. "¿Sabías que el 90% de...?").
-- retencion_esperada = texto libre del sistema viejo (Alta, Muy Alta…);
-- variaciones = reescrituras del patrón; ejemplos = links donde se usó.
-- ============================================================================
CREATE TABLE hooks (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo             text        NOT NULL, -- título/patrón del hook
  categoria          text        NOT NULL DEFAULT '', -- Descubrimiento, Problema…
  psicologia         text        NOT NULL DEFAULT '', -- por qué funciona
  retencion_esperada text        NOT NULL DEFAULT '',
  variaciones        text        NOT NULL DEFAULT '',
  ejemplos           text[]      NOT NULL DEFAULT '{}',
  etiquetas          text[]      NOT NULL DEFAULT '{}',
  estado             text        NOT NULL DEFAULT 'borrador',
  propuesto_por      uuid        REFERENCES usuarios (id) ON DELETE SET NULL,
  publicado_por      uuid        REFERENCES usuarios (id) ON DELETE SET NULL,
  motivo_rechazo     text,
  demo               boolean     NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid,

  CONSTRAINT hooks_titulo_no_vacio
    CHECK (char_length(btrim(titulo)) > 0),

  CONSTRAINT hooks_estado_valido
    CHECK (estado IN ('borrador', 'publicado', 'rechazado', 'archivado'))
);

COMMENT ON TABLE hooks IS
  'Hooks/patrones de apertura (BRIEF F3 §1). Mismo flujo borrador → publicado/rechazado/archivado que formatos (lo impone Go).';

CREATE INDEX IF NOT EXISTS idx_hooks_estado ON hooks (estado);
CREATE INDEX IF NOT EXISTS idx_hooks_categoria ON hooks (categoria);
CREATE INDEX IF NOT EXISTS idx_hooks_propuesto_por ON hooks (propuesto_por);
CREATE INDEX IF NOT EXISTS idx_hooks_etiquetas ON hooks USING GIN (etiquetas);

-- ============================================================================
-- Tabla: referencias (BRIEF F3 §1)
-- Referencia = link analizado (qué se puede copiar), con plataforma y
-- etiquetas; cliente relacionado opcional (FK a clientes, SET NULL para no
-- romper la referencia si el cliente se archiva).
-- ============================================================================
CREATE TABLE referencias (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        text        NOT NULL,
  link          text        NOT NULL,
  plataforma    text        NOT NULL DEFAULT 'otra',
  analisis      text        NOT NULL DEFAULT '', -- qué se puede copiar
  etiquetas     text[]      NOT NULL DEFAULT '{}',
  cliente_id    uuid        REFERENCES clientes (id) ON DELETE SET NULL,
  estado        text        NOT NULL DEFAULT 'borrador',
  propuesto_por uuid        REFERENCES usuarios (id) ON DELETE SET NULL,
  publicado_por uuid        REFERENCES usuarios (id) ON DELETE SET NULL,
  motivo_rechazo text,
  demo          boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,

  CONSTRAINT referencias_titulo_no_vacio
    CHECK (char_length(btrim(titulo)) > 0),

  CONSTRAINT referencias_link_no_vacio
    CHECK (char_length(btrim(link)) > 0),

  CONSTRAINT referencias_plataforma_valida
    CHECK (plataforma IN ('Instagram', 'TikTok', 'YouTube', 'otra')),

  CONSTRAINT referencias_estado_valido
    CHECK (estado IN ('borrador', 'publicado', 'rechazado', 'archivado'))
);

COMMENT ON TABLE referencias IS
  'Referencias externas analizadas (BRIEF F3 §1). cliente_id opcional = cliente relacionado. Mismo flujo borrador → publicado/rechazado/archivado (lo impone Go).';
COMMENT ON COLUMN referencias.cliente_id IS
  'Cliente relacionado (opcional). SET NULL: archivar el cliente no borra la referencia.';

CREATE INDEX IF NOT EXISTS idx_referencias_estado ON referencias (estado);
CREATE INDEX IF NOT EXISTS idx_referencias_plataforma ON referencias (plataforma);
CREATE INDEX IF NOT EXISTS idx_referencias_cliente ON referencias (cliente_id);
CREATE INDEX IF NOT EXISTS idx_referencias_propuesto_por ON referencias (propuesto_por);
CREATE INDEX IF NOT EXISTS idx_referencias_etiquetas ON referencias USING GIN (etiquetas);

-- ============================================================================
-- Tabla: sops (BRIEF F3 §1)
-- SOP = checklist por oficio (o todos). oficio = oficio canónico en
-- minúsculas sin tildes (grabacion, edicion, diseno, estrategia,
-- publicacion, ventas) o 'todos'. tiempo_estimado_min = minutos estimados
-- (NULL = no informado). Los pasos viven en sop_pasos (ordenados).
-- ============================================================================
CREATE TABLE sops (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo              text        NOT NULL,
  oficio              text        NOT NULL DEFAULT 'todos',
  tiempo_estimado_min integer,
  etiquetas           text[]      NOT NULL DEFAULT '{}',
  estado              text        NOT NULL DEFAULT 'borrador',
  propuesto_por       uuid        REFERENCES usuarios (id) ON DELETE SET NULL,
  publicado_por       uuid        REFERENCES usuarios (id) ON DELETE SET NULL,
  motivo_rechazo      text,
  demo                boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,

  CONSTRAINT sops_titulo_no_vacio
    CHECK (char_length(btrim(titulo)) > 0),

  CONSTRAINT sops_oficio_valido
    CHECK (oficio IN ('todos', 'grabacion', 'edicion', 'diseno', 'estrategia', 'publicacion', 'ventas')),

  CONSTRAINT sops_tiempo_valido
    CHECK (tiempo_estimado_min IS NULL OR tiempo_estimado_min >= 0),

  CONSTRAINT sops_estado_valido
    CHECK (estado IN ('borrador', 'publicado', 'rechazado', 'archivado'))
);

COMMENT ON TABLE sops IS
  'SOPs ejecutables (BRIEF F3 §1). oficio = a quién le aplica (o todos). Los pasos están en sop_pasos; las ejecuciones en sop_ejecuciones. Mismo flujo borrador → publicado/rechazado/archivado (lo impone Go).';

CREATE INDEX IF NOT EXISTS idx_sops_estado ON sops (estado);
CREATE INDEX IF NOT EXISTS idx_sops_oficio ON sops (oficio);
CREATE INDEX IF NOT EXISTS idx_sops_propuesto_por ON sops (propuesto_por);
CREATE INDEX IF NOT EXISTS idx_sops_etiquetas ON sops USING GIN (etiquetas);

-- ============================================================================
-- Tabla: sop_pasos (BRIEF F3 §1)
-- Checklist ordenada del SOP: orden (1, 2, 3…) + título + descripción.
-- Mueren con su SOP (ON DELETE CASCADE): son parte de su versión.
-- Editar un SOP publicado = archivar + crear nuevo (lo impone Go); la base
-- solo garantiza orden único por SOP.
-- ============================================================================
CREATE TABLE sop_pasos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id      uuid        NOT NULL REFERENCES sops (id) ON DELETE CASCADE,
  orden       integer     NOT NULL,
  titulo      text        NOT NULL,
  descripcion text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sop_pasos_orden_valido
    CHECK (orden >= 1),

  CONSTRAINT sop_pasos_titulo_no_vacio
    CHECK (char_length(btrim(titulo)) > 0)
);

COMMENT ON TABLE sop_pasos IS
  'Pasos de la checklist de un SOP (BRIEF F3 §1). Mueren con su SOP (ON DELETE CASCADE): son parte de su versión.';

-- Un orden por SOP (1, 2, 3… sin huecos: lo impone Go al crear).
CREATE UNIQUE INDEX IF NOT EXISTS uq_sop_pasos_sop_orden
  ON sop_pasos (sop_id, orden);

CREATE INDEX IF NOT EXISTS idx_sop_pasos_sop ON sop_pasos (sop_id);

-- ============================================================================
-- Tabla: sop_ejecuciones (BRIEF F3 §1)
-- Una persona "inicia" un SOP (opcionalmente ligado a una tarea F1), marca
-- pasos, lo termina; queda registro (quién, cuándo, pasos marcados).
-- estado: en_curso → terminada (no se reabre: lo impone Go). El admin ve
-- las ejecuciones (las lista el backend con service role).
-- ============================================================================
CREATE TABLE sop_ejecuciones (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id       uuid        NOT NULL REFERENCES sops (id) ON DELETE RESTRICT,
  tarea_id     uuid        REFERENCES tareas (id) ON DELETE SET NULL,
  iniciado_por uuid        NOT NULL REFERENCES usuarios (id),
  estado       text        NOT NULL DEFAULT 'en_curso',
  iniciada_at  timestamptz NOT NULL DEFAULT now(),
  terminada_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sop_ejecuciones_estado_valido
    CHECK (estado IN ('en_curso', 'terminada')),

  -- Terminada exige fecha de término; en curso no la tiene.
  CONSTRAINT sop_ejecuciones_termino_valido
    CHECK ((estado = 'terminada' AND terminada_at IS NOT NULL)
        OR (estado = 'en_curso' AND terminada_at IS NULL))
);

COMMENT ON TABLE sop_ejecuciones IS
  'Ejecuciones de SOP (BRIEF F3 §1): quién inició qué SOP, cuándo, ligado a qué tarea opcional, y si lo terminó. en_curso → terminada, no se reabre (lo impone Go). RESTRICT en sop_id: un SOP con ejecuciones no se elimina (se archiva).';
COMMENT ON COLUMN sop_ejecuciones.tarea_id IS
  'Tarea F1 a la que se ligó la ejecución (opcional). SET NULL: si la tarea desapareciera, la ejecución queda como registro.';
COMMENT ON COLUMN sop_ejecuciones.iniciado_por IS
  'FK simple a usuarios SIN ON DELETE a propósito: nunca se hace DELETE de usuarios (desactivar no borra la fila), así el registro de quién ejecutó se conserva (ANALISIS.md §5.2, §6).';

CREATE INDEX IF NOT EXISTS idx_sop_ejecuciones_sop ON sop_ejecuciones (sop_id);
CREATE INDEX IF NOT EXISTS idx_sop_ejecuciones_tarea ON sop_ejecuciones (tarea_id);
CREATE INDEX IF NOT EXISTS idx_sop_ejecuciones_usuario ON sop_ejecuciones (iniciado_por);
CREATE INDEX IF NOT EXISTS idx_sop_ejecuciones_estado ON sop_ejecuciones (estado);

-- ============================================================================
-- Tabla: sop_ejecucion_pasos (BRIEF F3 §1)
-- Pasos marcados dentro de una ejecución. Un paso se marca una sola vez
-- (UNIQUE por ejecución+paso); desmarcar = DELETE de la fila (queda en
-- actividad de Go, §6). marcado_at se fija al marcar.
-- ============================================================================
CREATE TABLE sop_ejecucion_pasos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ejecucion_id uuid        NOT NULL REFERENCES sop_ejecuciones (id) ON DELETE CASCADE,
  paso_id      uuid        NOT NULL REFERENCES sop_pasos (id) ON DELETE RESTRICT,
  marcado_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE sop_ejecucion_pasos IS
  'Pasos marcados por ejecución (BRIEF F3 §1). Un paso una sola vez por ejecución (UNIQUE). CASCADE con la ejecución; RESTRICT con el paso (no se desarma la checklist bajo una ejecución viva).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_sop_ejecucion_pasos_unica
  ON sop_ejecucion_pasos (ejecucion_id, paso_id);

CREATE INDEX IF NOT EXISTS idx_sop_ejecucion_pasos_ejecucion ON sop_ejecucion_pasos (ejecucion_id);

-- ============================================================================
-- ALTER clientes/piezas: vínculo formato/hook recomendados (BRIEF F3 §1)
-- Solo referencia (FK nullable, SET NULL): no rompe F1. El backend valida
-- que el formato/hook exista y esté publicado al vincular (lo impone Go).
-- Se conserva el texto libre piezas.formato de F1 por compatibilidad: el
-- backend deja de escribirlo para piezas nuevas cuando hay vínculo.
-- ============================================================================
ALTER TABLE clientes
  ADD COLUMN formato_recomendado_id uuid REFERENCES formatos (id) ON DELETE SET NULL;

ALTER TABLE clientes
  ADD COLUMN hook_recomendado_id uuid REFERENCES hooks (id) ON DELETE SET NULL;

ALTER TABLE piezas
  ADD COLUMN formato_recomendado_id uuid REFERENCES formatos (id) ON DELETE SET NULL;

ALTER TABLE piezas
  ADD COLUMN hook_recomendado_id uuid REFERENCES hooks (id) ON DELETE SET NULL;

COMMENT ON COLUMN clientes.formato_recomendado_id IS
  'Formato recomendado para el cliente (BRIEF F3 §1, PLAN.md §3.1 Estrategia). Solo referencia (SET NULL); no rompe F1.';
COMMENT ON COLUMN clientes.hook_recomendado_id IS
  'Hook recomendado para el cliente (BRIEF F3 §1). Solo referencia (SET NULL).';
COMMENT ON COLUMN piezas.formato_recomendado_id IS
  'Formato usado/recomendado en la pieza (BRIEF F3 §1). Solo referencia (SET NULL); convive con el texto libre formato de F1.';
COMMENT ON COLUMN piezas.hook_recomendado_id IS
  'Hook usado/recomendado en la pieza (BRIEF F3 §1). Solo referencia (SET NULL).';

CREATE INDEX IF NOT EXISTS idx_clientes_formato_rec ON clientes (formato_recomendado_id);
CREATE INDEX IF NOT EXISTS idx_clientes_hook_rec ON clientes (hook_recomendado_id);
CREATE INDEX IF NOT EXISTS idx_piezas_formato_rec ON piezas (formato_recomendado_id);
CREATE INDEX IF NOT EXISTS idx_piezas_hook_rec ON piezas (hook_recomendado_id);

-- ============================================================================
-- Función updated_at: se reutiliza la de 001.
-- CREATE OR REPLACE con el mismo cuerpo: si 001 ya corrió no cambia nada;
-- si no, la deja creada. Mismo nombre/contrato que en 001 (igual que 002/003).
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
  'Fija updated_at = now() en cada UPDATE (definida en 001, reutilizada aquí). La usan los triggers trg_formatos/hooks/referencias/sops/sop_ejecuciones_updated_at.';

DROP TRIGGER IF EXISTS trg_formatos_updated_at ON formatos;
CREATE TRIGGER trg_formatos_updated_at
  BEFORE UPDATE ON formatos
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_hooks_updated_at ON hooks;
CREATE TRIGGER trg_hooks_updated_at
  BEFORE UPDATE ON hooks
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_referencias_updated_at ON referencias;
CREATE TRIGGER trg_referencias_updated_at
  BEFORE UPDATE ON referencias
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_sops_updated_at ON sops;
CREATE TRIGGER trg_sops_updated_at
  BEFORE UPDATE ON sops
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_sop_ejecuciones_updated_at ON sop_ejecuciones;
CREATE TRIGGER trg_sop_ejecuciones_updated_at
  BEFORE UPDATE ON sop_ejecuciones
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- RLS (segunda capa; la seguridad real la da el backend Go)
-- Exactamente el patrón de 003: anon SIN ACCESO (ninguna política para
-- anon → RLS le niega todo por defecto) y sin políticas de escritura para
-- ningún rol de app (todo va por el backend con service role, que salta
-- RLS; el navegador nunca escribe directo en la base).
-- La matriz fina (leer: todos; proponer: equipo → borrador; publicar/
-- rechazar/archivar: solo admin/dueño; borradores ajenos invisibles para
-- equipo; no editar lo publicado — BRIEF F3 §1 y §4.4) la impone Go,
-- porque RLS no puede expresar roles de app (admin/dueño/equipo) ni la
-- regla "borrador visible solo para quien lo propuso" sin acoplarse a la
-- lógica de negocio. Igual que tarifas/cortes en 003: sin políticas de
-- SELECT para authenticated en estas siete tablas.
-- ============================================================================
ALTER TABLE formatos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE hooks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE referencias         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sops                ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_pasos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_ejecuciones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_ejecucion_pasos ENABLE ROW LEVEL SECURITY;

-- Sin políticas para anon ni authenticated → denegado todo por defecto
-- (igual que actividad en 001, clientes/piezas/tareas en 002 y
-- tarifas/cortes en 003). Toda lectura/escritura va por el backend con
-- service role (que salta RLS).
