-- ============================================================================
-- 002_produccion.sql — RConcept Systems v2 · F1 Producción
-- ============================================================================
-- Qué crea (BRIEF F1 §4, ANALISIS.md §4.1/§4.2/§5/§6):
--   1. clientes        — clientes de la agencia (nunca se borran: se archivan
--                        vía archivado_at; ver ANALISIS.md §5.16).
--   2. piezas          — piezas de contenido de un cliente, con su máquina de
--                        estados (ANALISIS.md §4.1) y motivo obligatorio al
--                        cancelar (§5.12).
--   3. tareas          — una etapa de una pieza asignada a una persona, con su
--                        máquina de estados (ANALISIS.md §4.2), dato de entrega
--                        por etapa (§5.9) y marcador de decisión pendiente en
--                        curso al cancelar la pieza (§5.12).
--   4. tarea_eventos   — historial INMUTABLE de cada tarea (devoluciones
--                        múltiples §5.11, reasignaciones §5.13, etc.).
--   5. notificaciones  — campanita in-app (asignada, devuelta, aprobada,
--                        entregada, vencida; BRIEF F1 §3).
--
-- Convenciones (igual que 001): snake_case, IDs uuid, created_at/updated_at
-- (+ created_by), checks de estados como texto, índices por
-- cliente/asignado/estado, RLS (anon nada, escritura vía backend service
-- role), triggers de updated_at e inmutabilidad del historial.
--
-- DEPENDENCIA: asume 001 aplicada antes (extensión pgcrypto para
-- gen_random_uuid(), tabla usuarios, función set_updated_at()).
--
-- NOTA: migración REVISADA pero NO EJECUTADA — aún no hay proyecto
-- Supabase nuevo. Sin INSERT: no incluye datos reales ni semillas.
-- Verificación: solo revisión visual de sintaxis (sin motor disponible).
-- ============================================================================

-- pgcrypto ya la crea 001; se repite con IF NOT EXISTS para que el archivo
-- sea robusto si alguna vez se revisa en forma aislada.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- Tabla: clientes (ANALISIS.md §5.16, §5.27, §5.28 — BRIEF F1 §1)
-- Nunca se borran: archivar = fijar archivado_at. deleted_at queda como
-- reserva de esquema (baja lógica) pero la app solo usa archivado_at.
-- Reglas "pausado no admite piezas nuevas" y visibilidad por cliente
-- (§3.1.3, §5.28, §5.29) las valida Go; la base no las puede expresar.
-- ============================================================================
CREATE TABLE clientes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre            text        NOT NULL,
  logo_url          text,                     -- URL por ahora (BRIEF F1 §1)
  contacto_nombre   text,
  contacto_telefono text,
  contacto_whatsapp text,
  paquete           text,                     -- texto libre por ahora ("TV Basic", "Mixto II"...)
  estado            text        NOT NULL DEFAULT 'activo',
  drive_url         text,                     -- link a Drive del cliente
  notas             text,
  estrategia        text,                     -- objetivos, público, tono, formatos y hooks (texto simple)
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,                     -- usuarios.id (sin FK, como actor_id en actividad)
  archivado_at      timestamptz,              -- archivar = fijar esto; nunca DELETE real
  deleted_at        timestamptz,              -- reserva de esquema; la app no lo usa en F1

  CONSTRAINT clientes_estado_valido
    CHECK (estado IN ('activo', 'pausado', 'terminado'))
);

COMMENT ON TABLE clientes IS
  'Clientes de la agencia. Nunca se borran: se archivan con archivado_at (ANALISIS.md §5.16). La escritura va por el backend con service role.';
COMMENT ON COLUMN clientes.estrategia IS
  'Estrategia del cliente: objetivos, público, tono, formatos y hooks recomendados, como texto estructurado simple (BRIEF F1 §1).';

-- Filtro por estado (lista de clientes + regla "pausado no admite piezas nuevas").
CREATE INDEX IF NOT EXISTS idx_clientes_estado ON clientes (estado);

-- ============================================================================
-- Tabla: piezas (ANALISIS.md §4.1 — BRIEF F1 §2)
-- Borrador → En producción → En revisión → Aprobada → Publicada;
-- Cancelada desde cualquier estado, solo admin y con motivo (§5.12).
-- Las transiciones válidas las impone Go; la base chequea el vocabulario
-- de estados y la obligatoriedad del motivo al cancelar.
-- ============================================================================
CREATE TABLE piezas (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id         uuid        NOT NULL REFERENCES clientes (id),
  titulo             text        NOT NULL,
  formato            text        NOT NULL DEFAULT '',
  guion              text        NOT NULL DEFAULT '',
  fecha_objetivo     date,                     -- fecha de publicación objetivo
  estado             text        NOT NULL DEFAULT 'borrador',
  motivo_cancelacion text,                     -- obligatorio si estado = cancelada (§5.12)
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid,

  CONSTRAINT piezas_estado_valido
    CHECK (estado IN ('borrador', 'en_produccion', 'en_revision',
                      'aprobada', 'publicada', 'cancelada')),

  -- Motivo obligatorio si cancelada (solo admin cancela: lo valida Go).
  CONSTRAINT piezas_cancelacion_con_motivo
    CHECK (estado <> 'cancelada'
           OR (motivo_cancelacion IS NOT NULL AND motivo_cancelacion <> ''))
);

COMMENT ON TABLE piezas IS
  'Piezas de contenido (ANALISIS.md §4.1). La escritura y las transiciones van por el backend con service role; la base exige estados válidos y motivo al cancelar.';
COMMENT ON COLUMN piezas.motivo_cancelacion IS
  'Obligatorio cuando estado = cancelada (CHECK piezas_cancelacion_con_motivo, ANALISIS.md §5.12).';

-- Tablero por cliente y por estado (BRIEF F1 §3, vista Producción).
CREATE INDEX IF NOT EXISTS idx_piezas_cliente ON piezas (cliente_id);
CREATE INDEX IF NOT EXISTS idx_piezas_estado ON piezas (estado);

-- ============================================================================
-- Tabla: tareas (ANALISIS.md §4.2 — BRIEF F1 §2)
-- Bloqueada → Pendiente → En curso → Entregada → Aprobada; Devuelta con
-- comentario vuelve a Entregada. La siguiente etapa se desbloquea al
-- aprobarse la anterior (grabación de apoyo no bloquea nada, §5.15).
-- Etapas como slugs sin tildes (igual que oficios en 001): las dos de
-- grabación mapean al oficio 'grabacion' (lo valida Go, §5.8).
-- Dato de entrega por etapa (§5.9): principal = material_url + minutos;
-- apoyo = minutos; edición/diseño = entregable_url; publicación =
-- publicado_url. Lo exige Go; la base guarda los campos.
-- decision_pendiente: pieza cancelada con esta tarea en curso y el admin
-- aún no decide si se paga (§5.12; F2 resolverá el cobro).
-- ============================================================================
CREATE TABLE tareas (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pieza_id          uuid        NOT NULL REFERENCES piezas (id),
  etapa             text,                     -- grabacion_principal | grabacion_apoyo | edicion | diseno | publicacion
  asignado_id       uuid        REFERENCES usuarios (id),
  estado            text        NOT NULL DEFAULT 'bloqueada',
  fecha_limite      date,                     -- pasada y no aprobada = vencida (§5.10; lo calcula la app)
  material_url      text,                     -- grabación principal: link del material (§5.9)
  minutos           integer     CHECK (minutos >= 0),
  entregable_url    text,                     -- edición/diseño: link del entregable (§5.9)
  publicado_url     text,                     -- publicación: link publicado (§5.9)
  decision_pendiente boolean    NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,

  CONSTRAINT tareas_etapa_valida
    CHECK (etapa IS NULL
           OR etapa IN ('grabacion_principal', 'grabacion_apoyo', 'edicion',
                        'diseno', 'publicacion')),

  CONSTRAINT tareas_estado_valido
    CHECK (estado IN ('bloqueada', 'pendiente', 'en_curso', 'entregada',
                      'aprobada', 'devuelta', 'cancelada'))
);

COMMENT ON TABLE tareas IS
  'Tareas = una etapa de una pieza asignada a una persona (ANALISIS.md §4.2). Transiciones, oficio requerido e idempotencia (§5.32) las impone Go; la escritura va por el backend con service role.';
COMMENT ON COLUMN tareas.decision_pendiente IS
  'En true si la pieza se canceló con esta tarea en curso y el admin aún no decidió si se paga (ANALISIS.md §5.12).';
COMMENT ON COLUMN tareas.minutos IS
  'Minutos registrados (grabación principal/apoyo, §5.9). CHECK >= 0; NULL = no informado.';

-- Tareas de una pieza, de una persona (Mis tareas) y por estado (Revisión).
CREATE INDEX IF NOT EXISTS idx_tareas_pieza ON tareas (pieza_id);
CREATE INDEX IF NOT EXISTS idx_tareas_asignado ON tareas (asignado_id);
CREATE INDEX IF NOT EXISTS idx_tareas_estado ON tareas (estado);

-- ============================================================================
-- Tabla: tarea_eventos (historial INMUTABLE — ANALISIS.md §6, §5.11)
-- Cada cambio de una tarea: quién, qué, cuándo, antes → después, comentario.
-- No se edita ni se borra (trigger + RLS, mismo patrón que actividad en 001).
-- ============================================================================
CREATE TABLE tarea_eventos (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id   uuid        NOT NULL REFERENCES tareas (id),
  cuando     timestamptz NOT NULL DEFAULT now(),
  actor_id   uuid,                     -- quién lo hizo (usuarios.id, sin FK para conservar historial)
  actor_nombre text,                   -- nombre congelado al momento del evento (igual que actividad)
  accion     text        NOT NULL,     -- p. ej. 'crear', 'empezar', 'entregar', 'devolver', 'aprobar', 'reasignar'
  antes      jsonb,                    -- estado previo
  despues    jsonb,                    -- estado posterior
  comentario text                      -- motivo/comentario (obligatorio al devolver: lo exige el backend)
);

COMMENT ON TABLE tarea_eventos IS
  'Historial solo-INSERT de cada tarea (ANALISIS.md §6, §5.11): quién, qué, cuándo, antes→después, comentario. Inmutable: trigger bloquear_tarea_eventos_mutable impide UPDATE/DELETE salvo a service_role/postgres; además RLS no concede UPDATE/DELETE a ningún rol de app.';
COMMENT ON COLUMN tarea_eventos.actor_id IS
  'Sin FK a usuarios a propósito (igual que actividad.actor_id en 001): el historial sobrevive aunque el usuario cambie o se desactive.';

-- Historial de una tarea (ficha de pieza / revisión de devoluciones).
CREATE INDEX IF NOT EXISTS idx_tarea_eventos_tarea ON tarea_eventos (tarea_id);

-- ============================================================================
-- Tabla: notificaciones (campanita in-app — BRIEF F1 §3)
-- Tarea asignada, devuelta, aprobada, entregada (para admin) y vencida.
-- Las genera el backend; el push real del celular queda para F-Android.
-- recurso_id es text (igual que actividad.recurso_id en 001) para aceptar
-- tanto uuid (tarea/pieza) como identificadores futuros no-uuid.
-- ============================================================================
CREATE TABLE notificaciones (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid        NOT NULL REFERENCES usuarios (id),
  tipo       text        NOT NULL,     -- p. ej. 'tarea_asignada', 'tarea_devuelta', 'tarea_aprobada', 'tarea_entregada', 'tarea_vencida'
  titulo     text        NOT NULL,
  detalle    text,
  leida      boolean     NOT NULL DEFAULT false,
  recurso    text,                     -- tipo de recurso (p. ej. 'tarea', 'pieza')
  recurso_id text,                     -- id del recurso (texto para no atarse a un tipo)
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE notificaciones IS
  'Notificaciones dentro de la app (BRIEF F1 §3). Las crea el backend con service role; cada usuario solo lee las suyas (política notificaciones_select_propio).';
COMMENT ON COLUMN notificaciones.recurso_id IS
  'Texto a propósito (igual que actividad.recurso_id): acepta uuid de tarea/pieza y futuros ids no-uuid.';

-- Campanita: no leídas de un usuario (y orden por creación).
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_leida
  ON notificaciones (usuario_id, leida);

-- ============================================================================
-- Función updated_at: se reutiliza la de 001.
-- CREATE OR REPLACE con el mismo cuerpo: si 001 ya corrió no cambia nada;
-- si no, la deja creada. Mismo nombre/contrato que en 001.
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
  'Fija updated_at = now() en cada UPDATE (definida en 001, reutilizada aquí). La usan los triggers trg_clientes/piezas/tareas_updated_at.';

DROP TRIGGER IF EXISTS trg_clientes_updated_at ON clientes;
CREATE TRIGGER trg_clientes_updated_at
  BEFORE UPDATE ON clientes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_piezas_updated_at ON piezas;
CREATE TRIGGER trg_piezas_updated_at
  BEFORE UPDATE ON piezas
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_tareas_updated_at ON tareas;
CREATE TRIGGER trg_tareas_updated_at
  BEFORE UPDATE ON tareas
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- Inmutabilidad de tarea_eventos: trigger que bloquea UPDATE y DELETE
-- (salvo service_role / postgres para mantenimiento extremo).
-- Mismo patrón que trg_actividad_inmutable en 001, en función propia para
-- mensajes de error específicos de esta tabla.
-- Capa 1 de 2: la capa 2 es RLS (sin políticas de UPDATE/DELETE para
-- ningún rol de app, así que anon/authenticated tampoco pueden por RLS).
-- ============================================================================
CREATE OR REPLACE FUNCTION bloquear_tarea_eventos_mutable()
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
  RAISE EXCEPTION 'tarea_eventos es inmutable: no se permite % en el historial (solo INSERT)', TG_OP;
END;
$$;

COMMENT ON FUNCTION bloquear_tarea_eventos_mutable() IS
  'Bloquea UPDATE/DELETE en tarea_eventos para todos los roles de app; solo service_role/postgres pasan (mantenimiento auditado). Igual que bloquear_actividad_mutable en 001.';

DROP TRIGGER IF EXISTS trg_tarea_eventos_inmutable ON tarea_eventos;
CREATE TRIGGER trg_tarea_eventos_inmutable
  BEFORE UPDATE OR DELETE ON tarea_eventos
  FOR EACH ROW
  EXECUTE FUNCTION bloquear_tarea_eventos_mutable();

-- ============================================================================
-- RLS (segunda capa; la seguridad real la da el backend Go)
-- ============================================================================
ALTER TABLE clientes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE piezas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tareas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarea_eventos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

-- anon: SIN ACCESO — no se crea ninguna política para anon, así que por
-- defecto RLS le niega todo en las cinco tablas (igual que en 001).
--
-- authenticated en notificaciones: SOLO lectura de las propias.
-- (Es la única de las cinco con un "dueño" directo por fila, igual que
-- usuarios en 001 con usuarios_select_propio.)
-- La escritura (marcar leída la hace el backend con service role, que
-- salta RLS); el navegador nunca escribe directo en la base.
CREATE POLICY notificaciones_select_propio
  ON notificaciones
  FOR SELECT
  TO authenticated
  USING (auth.uid() = usuario_id);

COMMENT ON POLICY notificaciones_select_propio ON notificaciones IS
  'authenticated solo lee sus propias notificaciones (auth.uid() = usuario_id). Sin políticas de INSERT/UPDATE/DELETE: la escritura la hace el backend con service role.';

-- clientes, piezas, tareas, tarea_eventos: SIN políticas para anon ni
-- authenticated → denegado todo por defecto (igual que actividad en 001).
-- Toda lectura/escritura va por el backend con service role (que salta
-- RLS). La visibilidad fina (equipo solo ve clientes donde tiene o tuvo
-- tareas, §3.1.3; URL ajena → 403 sin datos, §5.29) la impone Go, porque
-- RLS no puede expresar "tiene o tuvo tareas" sin acoplar las políticas
-- a la lógica de negocio. (Inmutabilidad extra de tarea_eventos vía
-- trigger trg_tarea_eventos_inmutable.)
