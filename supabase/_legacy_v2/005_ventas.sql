-- ============================================================================
-- 005_ventas.sql — RConcept Systems v2 · F4 CRM (ventas)
-- ============================================================================
-- Qué crea (BRIEF F4 §5, ANALISIS.md §3.2 fila CRM, §4.4, §5.23–§5.26, §6,
-- §7.5):
--   1. leads            — negocios en seguimiento (negocio, contacto,
--                         teléfono + teléfono normalizado, dirección/barrio/
--                         municipio, rubro, origen, valor estimado o paquete
--                         de interés, notas, próxima acción qué+fecha,
--                         vendedor dueño, estado, motivo de pérdida, enlace
--                         al cliente creado al ganar).
--   2. lead_eventos     — historial INMUTABLE del lead (quién/qué/cuándo/
--                         antes→después/motivo; ANALISIS.md §6).
--   3. visitas          — registros de calle (lead, vendedor, client_id
--                         UNIQUE para idempotencia offline §5.23, ubicación
--                         opcional, notas, resultado, fotos, cuándo).
--   4. visita_fotos     — fotos de visita (ruta en Storage; BRIEF F4 §2).
--   5. ALTER leads      — cliente_id (enlace al cliente creado/reactivado
--                         al ganar, §5.25; SET NULL).
--
-- Flujo de lead (ANALISIS §4.4, BRIEF F4 §1): prospecto → en_contacto →
-- propuesta_enviada → negociacion → ganado | perdido (perdido con motivo).
-- Ganado → se crea el cliente F1 con paquete_id + vendido_por → F2 genera
-- la comisión 8 % una sola vez por el camino que ya existe (BRIEF F4 §3).
-- Si el negocio ya fue cliente, se reactiva en vez de crear otro (§5.25).
-- Duplicados (§5.24): el aviso lo calcula Go (teléfono normalizado +
-- nombre parecido); la base solo indexa telefono_norm.
-- Vendedor desactivado (§5.26): Go pasa sus leads abiertos a sin asignar
-- (vendedor_id NULL); la base no lo hace solo.
--
-- Convenciones (igual que 001/002/003/004): snake_case, IDs uuid PK con
-- DEFAULT gen_random_uuid(), created_at/updated_at (+ created_by),
-- CHECKs de vocabulario como texto, índices por vendedor/estado/teléfono
-- normalizado, RLS (anon nada, escritura vía backend service role),
-- triggers de updated_at e inmutabilidad del historial.
--
-- DEPENDENCIA: asume 001, 002 y 003 aplicadas antes (extensión pgcrypto,
-- tablas usuarios/clientes, función set_updated_at()).
--
-- NOTA: migración REVISADA pero NO EJECUTADA — aún no hay proyecto
-- Supabase nuevo. Solo revisión visual de sintaxis (sin motor disponible).
-- ============================================================================

-- pgcrypto ya la crea 001; se repite con IF NOT EXISTS para que el archivo
-- sea robusto si alguna vez se revisa en forma aislada (igual que 002/003/004).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- Tabla: leads (BRIEF F4 §1 — ANALISIS §4.4, §5.24–§5.26)
-- vendedor_id NULL = sin asignar (el admin reasigna; §5.24, §5.26).
-- telefono_norm = solo dígitos sin indicativo 57 (lo calcula Go con
-- NormalizarTelefono; la base lo indexa para el aviso de duplicados).
-- accion_fecha = próxima acción (qué + fecha; date, NULL = sin fecha).
-- cliente_id = enlace al cliente creado/reactivado al ganar (§5.25).
-- ============================================================================
CREATE TABLE leads (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio            text        NOT NULL,
  contacto_nombre    text,
  telefono           text,
  telefono_norm      text        NOT NULL DEFAULT '',
  direccion          text,
  barrio             text,
  municipio          text,
  rubro              text,
  origen             text        NOT NULL DEFAULT '',
  valor_estimado_cop bigint      NOT NULL DEFAULT 0,
  paquete_id         uuid        REFERENCES paquetes (id) ON DELETE SET NULL,
  notas              text,
  accion_que         text        NOT NULL DEFAULT '',
  accion_fecha       date,
  estado             text        NOT NULL DEFAULT 'prospecto',
  motivo_perdida     text,
  vendedor_id        uuid        REFERENCES usuarios (id) ON DELETE SET NULL,
  cliente_id         uuid        REFERENCES clientes (id) ON DELETE SET NULL,
  demo               boolean     NOT NULL DEFAULT false,  -- true = semilla de ejemplo
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid,                   -- usuarios.id (sin FK, como en 002/003)

  CONSTRAINT leads_negocio_no_vacio
    CHECK (char_length(btrim(negocio)) > 0),

  CONSTRAINT leads_estado_valido
    CHECK (estado IN ('prospecto', 'en_contacto', 'propuesta_enviada',
                      'negociacion', 'ganado', 'perdido')),

  CONSTRAINT leads_origen_valido
    CHECK (origen IN ('', 'visita', 'referido', 'redes', 'llamada')),

  CONSTRAINT leads_valor_no_negativo
    CHECK (valor_estimado_cop >= 0),

  -- Perdido con motivo (BRIEF F4 §1, ANALISIS §4.4): solo perdido exige
  -- motivo (los abiertos lo tienen NULL/vacío).
  CONSTRAINT leads_perdido_con_motivo
    CHECK (estado <> 'perdido'
           OR (motivo_perdida IS NOT NULL AND motivo_perdida <> ''))
);

COMMENT ON TABLE leads IS
  'Negocios en seguimiento (BRIEF F4 §1, ANALISIS.md §4.4). Vendedor dueño en vendedor_id (NULL = sin asignar, §5.26); ganado enlaza al cliente en cliente_id (§5.25). Las transiciones las impone Go.';
COMMENT ON COLUMN leads.telefono_norm IS
  'Teléfono normalizado (solo dígitos, sin indicativo 57; lo calcula Go). Índice para el aviso de duplicados §5.24.';
COMMENT ON COLUMN leads.accion_fecha IS
  'Próxima acción: fecha (accion_que = qué). Vencida = fecha pasada en lead abierto (§5.10 por analogía F1); lo calcula Go.';

-- Filtros de Ventas admin (por vendedor/estado/municipio) + duplicados por
-- teléfono normalizado (BRIEF F4 §4 y §5).
CREATE INDEX IF NOT EXISTS idx_leads_vendedor ON leads (vendedor_id);
CREATE INDEX IF NOT EXISTS idx_leads_estado ON leads (estado);
CREATE INDEX IF NOT EXISTS idx_leads_municipio ON leads (municipio);
CREATE INDEX IF NOT EXISTS idx_leads_telefono_norm ON leads (telefono_norm);

-- ============================================================================
-- Tabla: lead_eventos (historial INMUTABLE del lead — ANALISIS §6)
-- Igual que tarea_eventos en 002: sin UPDATE ni DELETE (trigger).
-- ============================================================================
CREATE TABLE lead_eventos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid        NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  cuando       timestamptz NOT NULL DEFAULT now(),
  actor_id     uuid,
  actor_nombre text        NOT NULL DEFAULT '',
  accion       text        NOT NULL,   -- crear, editar, mover, ganar, reasignar, visita, liberar...
  antes        jsonb,
  despues      jsonb,
  motivo       text
);

COMMENT ON TABLE lead_eventos IS
  'Historial inmutable del lead (ANALISIS.md §6): quién/qué/cuándo/antes→después/motivo. Sin UPDATE ni DELETE.';

CREATE INDEX IF NOT EXISTS idx_lead_eventos_lead ON lead_eventos (lead_id);

-- ============================================================================
-- Tabla: visitas (BRIEF F4 §2 — ANALISIS §5.23)
-- client_id UNIQUE: idempotencia offline (UUID generado en el celular; el
-- backend ignora duplicados, §5.23). NULL permitido (visita online sin id):
-- varios NULL no violan UNIQUE.
-- Ubicación opcional (latitud/longitud NULL si la niegan).
-- ============================================================================
CREATE TABLE visitas (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid        NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  vendedor_id uuid        REFERENCES usuarios (id) ON DELETE SET NULL,
  client_id   text        UNIQUE,
  latitud     double precision,
  longitud    double precision,
  notas       text,
  resultado   text        NOT NULL,
  fotos       integer     NOT NULL DEFAULT 0,
  cuando      timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,

  CONSTRAINT visitas_resultado_valido
    CHECK (resultado IN ('interesado', 'no_interesado', 'volver')),

  CONSTRAINT visitas_fotos_no_negativo
    CHECK (fotos >= 0)
);

COMMENT ON TABLE visitas IS
  'Registros de calle (BRIEF F4 §2). client_id UNIQUE = idempotencia offline §5.23 (el celular genera el UUID; el backend ignora duplicados).';
COMMENT ON COLUMN visitas.cuando IS
  'Cuándo pasó la visita (la informa el celular; puede diferir de created_at si se subió offline).';

CREATE INDEX IF NOT EXISTS idx_visitas_lead ON visitas (lead_id);
CREATE INDEX IF NOT EXISTS idx_visitas_vendedor ON visitas (vendedor_id);
CREATE INDEX IF NOT EXISTS idx_visitas_client ON visitas (client_id);

-- ============================================================================
-- Tabla: visita_fotos (BRIEF F4 §2)
-- ruta = ruta en Supabase Storage (el backend expone la interfaz
-- store.GuardarArchivo; en modo demo guarda en memoria).
-- ============================================================================
CREATE TABLE visita_fotos (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  visita_id  uuid        NOT NULL REFERENCES visitas (id) ON DELETE CASCADE,
  ruta       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE visita_fotos IS
  'Fotos de visita (BRIEF F4 §2): ruta en Storage. En demo se guardan comprimidas (~500 KB) vía store.GuardarArchivo.';

CREATE INDEX IF NOT EXISTS idx_visita_fotos_visita ON visita_fotos (visita_id);

-- ============================================================================
-- Triggers: updated_at + inmutabilidad del historial (igual que 002/004)
-- set_updated_at() ya la crea 001 (reutilizada en 004); se reusa si existe.
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_leads_updated_at ON leads;
    CREATE TRIGGER trg_leads_updated_at
      BEFORE UPDATE ON leads
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END
$$;

-- Historial inmutable: sin UPDATE ni DELETE en lead_eventos (igual que
-- tarea_eventos en 002 y actividad en 001).
CREATE OR REPLACE FUNCTION rechazar_cambio_lead_eventos()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'lead_eventos es inmutable (ANALISIS.md §6)';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_eventos_inmutable ON lead_eventos;
CREATE TRIGGER trg_lead_eventos_inmutable
  BEFORE UPDATE OR DELETE ON lead_eventos
  FOR EACH ROW EXECUTE FUNCTION rechazar_cambio_lead_eventos();

-- ============================================================================
-- RLS (segunda capa; la seguridad real la da el backend Go)
-- Exactamente el patrón de 004: anon SIN ACCESO (ninguna política para
-- anon → RLS le niega todo por defecto) y sin políticas de escritura para
-- ningún rol de app (todo va por el backend con service role, que salta
-- RLS; el navegador nunca escribe directo en la base).
-- La matriz fina (dueño/admin todo; equipo con oficio ventas solo SUS
-- leads; solo admin reasigna — BRIEF F4 §6.5) la impone Go, porque RLS no
-- puede expresar roles de app ni "solo sus leads" sin acoplarse a la
-- lógica de negocio. Sin políticas de SELECT para authenticated en estas
-- cuatro tablas.
-- ============================================================================
ALTER TABLE leads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_eventos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE visita_fotos  ENABLE ROW LEVEL SECURITY;

-- Sin políticas para anon ni authenticated → denegado todo por defecto
-- (igual que actividad en 001, clientes/piezas/tareas en 002,
-- tarifas/cortes en 003 y biblioteca en 004). Toda lectura/escritura va
-- por el backend con service role (que salta RLS).
