/** Tipos F2 — Cobros (tarifas, líneas, cortes, comisión).
 * Contrato: backend Go vía proxy /api/backend/* (mismo patrón F1).
 */

export type UnidadTarifa = "por_tarea" | "por_minuto" | "por_duracion";

export interface TarifaTramo {
  id: string;
  tarifa_id: string;
  desde_seg: number;
  hasta_seg: number | null;
  monto_cop: number;
}

export interface Tarifa {
  id: string;
  etapa: string;
  unidad: UnidadTarifa;
  monto_cop: number;
  vigente_desde: string | null;
  vigente_hasta: string | null;
  version: number;
  activa: boolean;
  demo: boolean;
  tramos: TarifaTramo[];
  created_at: string;
  updated_at: string;
}

export interface Paquete {
  id: string;
  nombre: string;
  precio_cop: number;
  activo: boolean;
  demo: boolean;
  created_at: string;
  updated_at: string;
}

export type LineaEstado =
  | "por_confirmar"
  | "confirmada"
  | "aprobada"
  | "en_corte"
  | "pagada"
  | "reclamada"
  | "sin_tarifa";

export type LineaTipo = "tarea" | "ajuste" | "comision";

export interface Linea {
  id: string;
  tarea_id: string | null;
  usuario_id: string;
  usuario_nombre: string | null;
  tipo: LineaTipo;
  estado: LineaEstado;
  monto_cop: number;
  tarifa_id: string | null;
  unidad: string | null;
  cantidad: number | null;
  motivo: string | null;
  reclamo_motivo: string | null;
  periodo: string;
  corte_id: string | null;
  comision_cliente_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CortePersona {
  usuario_id: string;
  usuario_nombre: string;
  aprobado: number;
  por_confirmar: number;
  reclamado: number;
  en_corte: number;
  pagado: number;
  sin_tarifa: number;
}

export interface Corte {
  id?: string;
  periodo: string;
  estado: "abierto" | "cerrado" | "pagado_parcial" | "pagado";
  cerrado_at?: string | null;
  created_at?: string;
}

export interface CorteDetalle {
  periodo: string;
  corte: Corte;
  por_persona: CortePersona[];
  lineas: Linea[];
  en_corte?: number;
  arrastradas?: number;
}

export interface ConfigCobros {
  porcentaje_comision: number;
  modo_comision: "una_vez" | "mensual";
}

/* ---------- Etiquetas ---------- */

export const LINEA_ESTADOS: { value: LineaEstado; label: string }[] = [
  { value: "por_confirmar", label: "Por confirmar" },
  { value: "confirmada", label: "Confirmada" },
  { value: "aprobada", label: "Aprobada" },
  { value: "en_corte", label: "En corte" },
  { value: "pagada", label: "Pagada" },
  { value: "reclamada", label: "Reclamada" },
  { value: "sin_tarifa", label: "Sin tarifa" },
];

export function lineaEstadoLabel(e: string): string {
  return LINEA_ESTADOS.find((x) => x.value === e)?.label ?? e;
}

export { fmtCOP } from "./dinero";

/** Periodo actual YYYY-MM (mes calendario, BRIEF F2 §3). */
export function periodoActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
