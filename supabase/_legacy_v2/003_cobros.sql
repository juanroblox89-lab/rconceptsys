-- ============================================================================
-- 003_cobros.sql — RConcept Systems v2 · F2 Cobros
-- ============================================================================
-- Qué crea (BRIEF F2 §6, ANALISIS.md §2 fila "cobros inmutables", §4.3,
-- §5.17–§5.22, §7 decisiones de Juan):
--   1. tarifas         — tarifas versionadas por etapa/oficio y unidad
--                        (ANALISIS.md §5.17; solo el dueño las edita, §7.1/§7.3).
--   2. tarifa_tramos   — tramos por duración de una tarifa por_duracion
--                        (BRIEF F2 §1: ej. los 6 tramos demo del sitio).
--   3. paquetes        — catálogo de paquetes con precio (BRIEF F2 §4).
--   4. lineas_cobro    — líneas de cobro INMUTABLES generadas al aprobar
--                        tareas, más ajustes y comisiones (§2, §4.3, §5.18).
--   5. cortes          — cortes mensuales de pago (§5.20, §5.21; §7.4).
--   6. config_cobros   — % y modo de comisión de ventas, fila única
--                        (§7.5; BRIEF F2 §4).
--   7. clientes + paquete_id, vendido_por (BRIEF F2 §4).
--
-- Convenciones (igual que 001/002): snake_case, IDs uuid PK con
-- DEFAULT gen_random_uuid(), created_at/updated_at (+ created_by),
-- CHECKs de vocabulario como texto, índices por FK/estado/periodo,
-- RLS (anon nada, escritura vía backend service role), triggers de
-- updated_at e inmutabilidad de lo congelado.
-- Montos en COP entero (bigint); el % de comisión en numeric.
--
-- DEPENDENCIA: asume 001 y 002 aplicadas antes (extensión pgcrypto,
-- tablas usuarios/clientes/tareas, función set_updated_at()).
--
-- NOTA: migración REVISADA pero NO EJECUTADA — aún no hay proyecto
-- Supabase nuevo. Sin INSERT de datos reales ni semillas demo (las
-- semillas demo, si el backend las necesita, van en memoria aparte);
-- la única excepción es la fila de config_cobros, que es configuración
-- de esquema (no dato de negocio). Verificación: solo revisión visual
-- de sintaxis (sin motor disponible).
-- ============================================================================

-- pgcrypto ya la crea 001; se repite con IF NOT EXISTS para que el archivo
-- sea robusto si alguna vez se revisa en forma aislada (igual que en 002).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- Tabla: tarifas (ANALISIS.md §5.17 — BRIEF F2 §1; decisiones §7.1 y §7.3)
-- Tarifa = (etapa/oficio de tarea, unidad, monto COP, vigencia).
-- Edición con historial: cambiar una tarifa crea una NUEVA fila (nueva
-- versión) y desactiva la anterior; nunca se edita la vigente (§5.17).
-- Las líneas ya generadas no cambian porque congelan monto/tarifa_id/
-- unidad/cantidad al aprobarse la tarea (§5.17; trigger en lineas_cobro).
-- Solo el dueño las edita: lo impone Go (§7.1); la base no distingue roles.
-- ============================================================================
CREATE TABLE tarifas (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa          text        NOT NULL,   -- etapa/oficio de tarea (p. ej. 'edicion'); texto libre: el catálogo válido lo impone Go
  unidad         text        NOT NULL,   -- por_tarea | por_minuto | por_duracion
  monto_cop      bigint      NOT NULL,   -- COP entero, >= 0 (para por_duracion es el monto base; el detalle va en tarifa_tramos)
  vigente_desde  timestamptz NOT NULL DEFAULT now(),
  vigente_hasta  timestamptz,            -- NULL = vigente indefinidamente
  version        integer     NOT NULL DEFAULT 1,
  activa         boolean     NOT NULL DEFAULT true,
  demo           boolean     NOT NULL DEFAULT false,  -- true = semilla de ejemplo; sin valores de fábrica (§7.3)
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid,                   -- usuarios.id (sin FK, como en 002)

  CONSTRAINT tarifas_unidad_valida
    CHECK (unidad IN ('por_tarea', 'por_minuto', 'por_duracion')),

  CONSTRAINT tarifas_monto_no_negativo
    CHECK (monto_cop >= 0),

  CONSTRAINT tarifas_version_valida
    CHECK (version >= 1),

  -- La vigencia, si termina, debe terminar después de empezar.
  CONSTRAINT tarifas_vigencia_valida
    CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde)
);

COMMENT ON TABLE tarifas IS
  'Tarifas configurables por el dueño (ANALISIS.md §5.17, §7.1, §7.3). Versionadas: editar = nueva fila, nunca UPDATE de la vigente. Sin valores de fábrica; demo = ejemplos.';
COMMENT ON COLUMN tarifas.etapa IS
  'Etapa/oficio de tarea al que aplica (p. ej. edicion, grabacion). Texto libre a propósito: el catálogo lo valida Go.';
COMMENT ON COLUMN tarifas.demo IS
  'true = tarifa de ejemplo para la demo (BRIEF F2 §1). Nunca confundir con una tarifa real vigente.';

-- Una sola tarifa activa por (etapa, unidad): la vigente es la que usa Go
-- al aprobar tareas. Parcial (WHERE activa) así que el historial de
-- versiones inactivas se conserva sin violar unicidad (§5.17).
-- (Los UNIQUE parciales van como índice, no como CONSTRAINT.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_tarifas_activas_etapa_unidad
  ON tarifas (etapa, unidad)
  WHERE activa;

-- ============================================================================
-- Tabla: tarifa_tramos (BRIEF F2 §1)
-- Tramos editables de una tarifa por_duracion (ej. los 6 del sitio como
-- ejemplo demo: 10 s–1 min, 1–3, 3–10, 11–30, 31–60, +61). hasta_seg NULL
-- = tramo abierto ("+61 min"). Sin updated_at/created_at: son parte de la
-- versión de su tarifa (si cambian, se versiona la tarifa, §5.17).
-- ============================================================================
CREATE TABLE tarifa_tramos (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tarifa_id  uuid    NOT NULL REFERENCES tarifas (id) ON DELETE CASCADE,
  desde_seg  integer NOT NULL,   -- inicio del tramo, en segundos, >= 0
  hasta_seg  integer,            -- fin del tramo en segundos; NULL = abierto
  monto_cop  bigint  NOT NULL,   -- COP entero, >= 0

  CONSTRAINT tarifa_tramos_desde_valido
    CHECK (desde_seg >= 0),

  CONSTRAINT tarifa_tramos_monto_no_negativo
    CHECK (monto_cop >= 0),

  -- Rango válido: abierto (NULL) o termina después de empezar.
  CONSTRAINT tarifa_tramos_rango_valido
    CHECK (hasta_seg IS NULL OR hasta_seg > desde_seg)
);

COMMENT ON TABLE tarifa_tramos IS
  'Tramos por duración de una tarifa por_duracion (BRIEF F2 §1). Mueren con su tarifa (ON DELETE CASCADE): son parte de su versión (§5.17).';

-- Tramos de una tarifa (cálculo del monto al aprobar la tarea).
CREATE INDEX IF NOT EXISTS idx_tarifa_tramos_tarifa ON tarifa_tramos (tarifa_id);

-- ============================================================================
-- Tabla: paquetes (BRIEF F2 §4 — catálogo de paquetes con precio)
-- Lo edita el dueño. Referencia de precios para la comisión de ventas
-- (§7.5): cambiar un precio o el paquete de un cliente NO altera
-- comisiones ya generadas (ANALISIS.md §5.27).
-- Paquetes reales del sitio (solo REFERENCIA, sin INSERT — las semillas
-- demo van en memoria aparte si el backend las necesita):
--   TV Basic 300.000 / Supreme 600.000 / Premier 900.000 ·
--   Digital Inicial 290.000 / Digital 390.000 / Aumento 520.000 ·
--   Mixto I 499.000 / II 899.000 / III 1.299.000.
-- ============================================================================
CREATE TABLE paquetes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text        NOT NULL UNIQUE,
  precio_cop bigint      NOT NULL,   -- COP entero, >= 0
  activo     boolean     NOT NULL DEFAULT true,
  demo       boolean     NOT NULL DEFAULT false,  -- true = semilla de ejemplo
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT paquetes_precio_no_negativo
    CHECK (precio_cop >= 0)
);

COMMENT ON TABLE paquetes IS
  'Catálogo de paquetes con precio (BRIEF F2 §4). Base de la comisión de ventas (§7.5). Cambios no alteran comisiones ya generadas (§5.27). Sin INSERT: los 9 paquetes del sitio van como semilla demo en memoria aparte.';

-- ============================================================================
-- Tabla: cortes (ANALISIS.md §5.20, §5.21 — BRIEF F2 §3; decisión §7.4)
-- Corte mensual, periodo = mes calendario en texto YYYY-MM. El corte del
-- mes M se puede cerrar desde el día 1 del mes M+1 (BRIEF F2, §7.4).
-- Cerrar = líneas aprobadas del periodo pasan a en_corte; lo no aprobado
-- pasa al periodo siguiente. Un corte cerrado NO se reabre (§5.20); si
-- hubo error se corrige con un ajuste en el corte actual. Revertir
-- "pagado" solo lo puede el dueño y queda en actividad (§5.21, lo
-- impone Go).
-- ============================================================================
CREATE TABLE cortes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo    text        NOT NULL UNIQUE,  -- YYYY-MM (mes calendario, §7.4)
  estado     text        NOT NULL DEFAULT 'abierto',
  cerrado_at timestamptz,                 -- se fija al cerrar; NULL = abierto
  created_by uuid,                        -- usuarios.id (sin FK, como en 002)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cortes_periodo_formato
    CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),

  CONSTRAINT cortes_estado_valido
    CHECK (estado IN ('abierto', 'cerrado', 'pagado_parcial', 'pagado'))
);

COMMENT ON TABLE cortes IS
  'Cortes mensuales de pago (ANALISIS.md §5.20, §5.21; §7.4). Cerrado no se reabre: los errores se corrigen con ajustes en el corte actual. Cerrar/marcar pagado solo el dueño (§7.1, lo impone Go).';

-- ============================================================================
-- Tabla: config_cobros (BRIEF F2 §4 — bono de ventas §7.5)
-- Única fila (id = true): % configurable por el dueño (default 8) y modo
-- de comisión: una_vez (al crear el cliente, default — Juan confirma) o
-- mensual (una línea por mes mientras el cliente esté activo).
-- ============================================================================
CREATE TABLE config_cobros (
  id                  boolean     PRIMARY KEY DEFAULT true,
  porcentaje_comision numeric     NOT NULL DEFAULT 8,        -- 8 % default (§7.5)
  modo_comision       text        NOT NULL DEFAULT 'una_vez',
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- Garantiza la fila única: id siempre true.
  CONSTRAINT config_cobros_unica_fila
    CHECK (id),

  CONSTRAINT config_cobros_porcentaje_valido
    CHECK (porcentaje_comision >= 0 AND porcentaje_comision <= 100),

  CONSTRAINT config_cobros_modo_valido
    CHECK (modo_comision IN ('una_vez', 'mensual'))
);

COMMENT ON TABLE config_cobros IS
  'Única fila configurable por el dueño: % y modo de la comisión de ventas (BRIEF F2 §4, ANALISIS.md §7.5).';

-- Fila inicial (configuración de esquema, no dato de negocio): 8 % una_vez.
-- ON CONFLICT DO NOTHING para que la migración sea re-ejecutable.
INSERT INTO config_cobros (id, porcentaje_comision, modo_comision)
VALUES (true, 8, 'una_vez')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Tabla: lineas_cobro (ANALISIS.md §2, §4.3, §5.18 — BRIEF F2 §2 y §4)
-- Cobros = líneas INMUTABLES generadas por el sistema desde trabajo
-- aprobado, con tarifa congelada (§2). Ciclo (§4.3):
--   por_confirmar → confirmada → aprobada → en_corte → pagada;
--   reclamada (trabajador, con motivo) → admin/dueño responde con ajuste.
-- Reglas:
-- - Una tarea aprobada genera UNA sola línea (idempotencia; §5.32 en Go).
--   Devuelta N veces → una sola línea al final (§5.11).
-- - Sin tarifa para la etapa → línea en sin_tarifa y aviso al dueño
--   (no se inventa monto, BRIEF F2 §1).
-- - Ajustes: líneas nuevas con motivo obligatorio; NUNCA se edita una
--   línea (§2, §5.18). Admin crea ajustes con motivo; en cortes cerrados
--   van al corte siguiente (§5.20, lo impone Go).
-- - Comisiones: una línea por vendedor/cliente/mes según modo (§5.27).
-- - Trabajador desactivado: sus líneas aprobadas siguen en el corte
--   (§5.2); desactivar no borra filas, así que usuario_id es NOT NULL
--   con FK simple (ver comentario abajo).
-- ============================================================================
CREATE TABLE lineas_cobro (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id            uuid        REFERENCES tareas (id) ON DELETE SET NULL,
  usuario_id          uuid        NOT NULL REFERENCES usuarios (id),
  tipo                text        NOT NULL,   -- tarea | ajuste | comision
  estado              text        NOT NULL DEFAULT 'por_confirmar',
  monto_cop           bigint      NOT NULL,   -- COP entero; negativo solo en ajustes
  tarifa_id           uuid        REFERENCES tarifas (id) ON DELETE SET NULL,
  unidad              text,                   -- unidad congelada (misma lista que tarifas.unidad)
  cantidad            numeric,                -- cantidad congelada (minutos, segundos, 1 por tarea…)
  motivo              text,                   -- obligatorio en ajustes (lo exige Go, §5.18)
  reclamo_motivo      text,                   -- motivo del reclamo del trabajador (§5.18)
  periodo             text        NOT NULL,   -- YYYY-MM: corte al que pertenece (arrastrable, §5.20)
  corte_id            uuid        REFERENCES cortes (id) ON DELETE SET NULL,
  comision_cliente_id uuid        REFERENCES clientes (id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,                   -- usuarios.id (sin FK, como en 002)

  CONSTRAINT lineas_cobro_tipo_valido
    CHECK (tipo IN ('tarea', 'ajuste', 'comision')),

  CONSTRAINT lineas_cobro_estado_valido
    CHECK (estado IN ('por_confirmar', 'confirmada', 'aprobada',
                      'en_corte', 'pagada', 'reclamada', 'sin_tarifa')),

  -- El monto solo puede ser negativo en un ajuste (bono, descuento,
  -- corrección, §5.18). Tarea y comisión siempre >= 0.
  CONSTRAINT lineas_cobro_monto_valido
    CHECK ((tipo <> 'ajuste' AND monto_cop >= 0) OR (tipo = 'ajuste')),

  CONSTRAINT lineas_cobro_unidad_valida
    CHECK (unidad IS NULL
           OR unidad IN ('por_tarea', 'por_minuto', 'por_duracion')),

  CONSTRAINT lineas_cobro_cantidad_valida
    CHECK (cantidad IS NULL OR cantidad >= 0),

  -- Periodo = mes calendario YYYY-MM (igual que cortes.periodo, §7.4).
  CONSTRAINT lineas_cobro_periodo_formato
    CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

COMMENT ON TABLE lineas_cobro IS
  'Líneas de cobro inmutables (ANALISIS.md §2, §4.3, §5.18): se generan al aprobar, con tarifa congelada. Los ajustes son líneas nuevas con motivo, nunca edición. Ver trigger trg_lineas_cobro_inmutable.';
COMMENT ON COLUMN lineas_cobro.usuario_id IS
  'FK simple a usuarios SIN ON DELETE a propósito: nunca se hace DELETE de usuarios (desactivar no borra la fila), así el historial de cobros se conserva aunque la persona se desactive (ANALISIS.md §5.2, §3.1).';
COMMENT ON COLUMN lineas_cobro.motivo IS
  'Obligatorio cuando tipo = ajuste (bono manual, descuento, corrección): lo exige el backend (ANALISIS.md §5.18). También guarda el motivo de no-pago decidido por el dueño en piezas canceladas (BRIEF F2 §1).';
COMMENT ON COLUMN lineas_cobro.periodo IS
  'Mes YYYY-MM al que pertenece la línea. Mutable solo por arrastre al siguiente periodo al cerrar el corte (§5.20).';

-- Idempotencia (§5.32 en Go, garantizada en base): una tarea aprobada
-- genera una sola línea tipo tarea. Parcial para no afectar ajustes.
-- (Los UNIQUE parciales van como índice, no como CONSTRAINT.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_lineas_tarea_unica
  ON lineas_cobro (tarea_id)
  WHERE tipo = 'tarea' AND tarea_id IS NOT NULL;

-- Comisión mensual única por (vendedor, cliente, periodo): en modo
-- mensual el job del día 1 no duplica líneas (§5.27).
CREATE UNIQUE INDEX IF NOT EXISTS uq_lineas_comision_mensual
  ON lineas_cobro (usuario_id, comision_cliente_id, periodo)
  WHERE tipo = 'comision' AND comision_cliente_id IS NOT NULL;

-- Mis líneas del mes y totales del trabajador (§5.22); líneas por estado
-- (reclamos, sin_tarifa, por confirmar); corte actual en vivo por persona.
CREATE INDEX IF NOT EXISTS idx_lineas_usuario ON lineas_cobro (usuario_id);
CREATE INDEX IF NOT EXISTS idx_lineas_estado ON lineas_cobro (estado);
CREATE INDEX IF NOT EXISTS idx_lineas_periodo ON lineas_cobro (periodo);
CREATE INDEX IF NOT EXISTS idx_lineas_corte ON lineas_cobro (corte_id);

-- ============================================================================
-- Inmutabilidad de lineas_cobro: trigger que bloquea UPDATE de los campos
-- congelados (ANALISIS.md §2, §5.18). Solo son mutables: estado,
-- motivo, reclamo_motivo, corte_id y periodo (transiciones §4.3, reclamos
-- §5.18, arrastre al cerrar §5.20). Capa 1 de 2: la capa 2 es RLS (sin
-- políticas de escritura para ningún rol de app) más la regla "nadie
-- edita una línea" en Go (BRIEF F2 §7.4).
-- Mismo patrón de bypass que en 001/002: service_role/postgres solo para
-- reparación manual auditada fuera de la app. (Por PostgREST el
-- current_user es authenticator, así que el backend tampoco salta este
-- trigger: los cambios de estado pasan, los de campos congelados no.)
-- ============================================================================
CREATE OR REPLACE FUNCTION bloquear_lineas_cobro_congelado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- El backend nunca emite UPDATE de campos congelados; solo transiciones
  -- de estado y ajustes como líneas nuevas. Se deja pasar a
  -- service_role/postgres por si alguna vez hace falta una reparación
  -- manual auditada fuera de la app (igual que en 001/002).
  IF current_user IN ('service_role', 'postgres') THEN
    RETURN NEW;
  END IF;
  -- IS DISTINCT FROM para detectar cambios también con NULLs.
  IF OLD.monto_cop  IS DISTINCT FROM NEW.monto_cop
     OR OLD.tarifa_id  IS DISTINCT FROM NEW.tarifa_id
     OR OLD.unidad     IS DISTINCT FROM NEW.unidad
     OR OLD.cantidad   IS DISTINCT FROM NEW.cantidad
     OR OLD.tipo       IS DISTINCT FROM NEW.tipo
     OR OLD.tarea_id   IS DISTINCT FROM NEW.tarea_id
     OR OLD.usuario_id IS DISTINCT FROM NEW.usuario_id THEN
    RAISE EXCEPTION 'lineas_cobro es inmutable en monto/tarifa/unidad/cantidad/tipo/tarea/usuario (ANALISIS.md §2, §5.18): respondé con un ajuste, nunca edites la línea';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION bloquear_lineas_cobro_congelado() IS
  'Bloquea UPDATE de los campos congelados de lineas_cobro (monto/tarifa/unidad/cantidad/tipo/tarea/usuario); solo estado/motivo/reclamo/corte/periodo mutan. Igual patrón de bypass que bloquear_actividad_mutable en 001.';

DROP TRIGGER IF EXISTS trg_lineas_cobro_inmutable ON lineas_cobro;
CREATE TRIGGER trg_lineas_cobro_inmutable
  BEFORE UPDATE ON lineas_cobro
  FOR EACH ROW
  EXECUTE FUNCTION bloquear_lineas_cobro_congelado();

-- ============================================================================
-- ALTER clientes: paquete_id + vendido_por (BRIEF F2 §4)
-- Migra el texto libre de F1 a referencia del catálogo: la columna
-- paquete (text) SE CONSERVA como está (compatibilidad con F1); el
-- backend deja de escribirla para clientes nuevos. Cambio de paquete
-- (§5.27) no altera piezas ni comisiones ya generadas.
-- ============================================================================
ALTER TABLE clientes
  ADD COLUMN paquete_id uuid REFERENCES paquetes (id) ON DELETE SET NULL;

ALTER TABLE clientes
  ADD COLUMN vendido_por uuid REFERENCES usuarios (id) ON DELETE SET NULL;

COMMENT ON COLUMN clientes.paquete_id IS
  'FK al catálogo paquetes (BRIEF F2 §4). Reemplaza al texto libre paquete, que se conserva por compatibilidad con F1. Cambios no alteran comisiones ya generadas (§5.27).';
COMMENT ON COLUMN clientes.vendido_por IS
  'Vendedor que consiguió al cliente (usuarios.id, opcional). Al crear el cliente con vendido_por, el backend genera la línea de comisión (BRIEF F2 §4, §7.5). SET NULL: si el vendedor se desactiva, el dato se conserva como NULL sin borrar el cliente.';

-- ============================================================================
-- Función updated_at: se reutiliza la de 001.
-- CREATE OR REPLACE con el mismo cuerpo: si 001 ya corrió no cambia nada;
-- si no, la deja creada. Mismo nombre/contrato que en 001 (igual que 002).
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
  'Fija updated_at = now() en cada UPDATE (definida en 001, reutilizada aquí). La usan los triggers trg_tarifas/paquetes/lineas_cobro/cortes/config_cobros_updated_at.';

DROP TRIGGER IF EXISTS trg_tarifas_updated_at ON tarifas;
CREATE TRIGGER trg_tarifas_updated_at
  BEFORE UPDATE ON tarifas
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_paquetes_updated_at ON paquetes;
CREATE TRIGGER trg_paquetes_updated_at
  BEFORE UPDATE ON paquetes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_lineas_cobro_updated_at ON lineas_cobro;
CREATE TRIGGER trg_lineas_cobro_updated_at
  BEFORE UPDATE ON lineas_cobro
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_cortes_updated_at ON cortes;
CREATE TRIGGER trg_cortes_updated_at
  BEFORE UPDATE ON cortes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_config_cobros_updated_at ON config_cobros;
CREATE TRIGGER trg_config_cobros_updated_at
  BEFORE UPDATE ON config_cobros
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- RLS (segunda capa; la seguridad real la da el backend Go)
-- Exactamente el patrón de 002: anon SIN ACCESO (ninguna política para
-- anon → RLS le niega todo por defecto) y authenticated con lectura
-- propia solo donde la fila tiene "dueño" directo.
-- ============================================================================
ALTER TABLE tarifas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarifa_tramos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE paquetes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineas_cobro   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_cobros  ENABLE ROW LEVEL SECURITY;

-- authenticated en lineas_cobro: SOLO lectura de las propias
-- (el trabajador ve "llevas $X aprobado este mes, $Y por confirmar",
-- §5.22 — el backend con service role arma los totales).
-- Es la única de las seis con dueño directo por fila, igual que
-- notificaciones en 002 con notificaciones_select_propio.
-- La escritura (generar líneas, confirmar/aprobar, ajustes, cierre de
-- corte, pagado) va por el backend con service role (que salta RLS);
-- el navegador nunca escribe directo en la base.
CREATE POLICY lineas_cobro_select_propio
  ON lineas_cobro
  FOR SELECT
  TO authenticated
  USING (auth.uid() = usuario_id);

COMMENT ON POLICY lineas_cobro_select_propio ON lineas_cobro IS
  'authenticated solo lee sus propias líneas (auth.uid() = usuario_id, ANALISIS.md §5.22). Sin políticas de INSERT/UPDATE/DELETE: la escritura la hace el backend con service role.';

-- tarifas, tarifa_tramos, paquetes, cortes, config_cobros: SIN políticas
-- para anon ni authenticated → denegado todo por defecto (igual que
-- actividad en 001 y clientes/piezas/tareas en 002). Toda
-- lectura/escritura va por el backend con service role (que salta RLS).
-- La matriz fina (tarifas/cortes/pagado solo dueño §7.1; ajustes
-- admin/dueño con motivo §5.18; equipo solo lo suyo §3.2) la impone Go,
-- porque RLS no puede expresar roles de app sin acoplarse a la lógica
-- de negocio. (Campos congelados extra de lineas_cobro vía trigger
-- trg_lineas_cobro_inmutable.)
