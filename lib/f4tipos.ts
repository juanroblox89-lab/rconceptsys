/** Tipos F4 — CRM Ventas (leads, visitas, métricas).
 * Contrato: backend Go vía proxy /api/backend/* (mismo patrón F1/F2/F3).
 */

export type LeadEstado =
  | "prospecto"
  | "en_contacto"
  | "propuesta_enviada"
  | "negociacion"
  | "ganado"
  | "perdido";

export type LeadOrigen = "" | "visita" | "referido" | "redes" | "llamada";

export interface Lead {
  id: string;
  negocio: string;
  contacto_nombre: string | null;
  telefono: string | null;
  direccion: string | null;
  barrio: string | null;
  municipio: string | null;
  rubro: string | null;
  origen: LeadOrigen | string;
  valor_estimado_cop: number;
  paquete_id: string | null;
  notas: string | null;
  accion_que: string | null;
  accion_fecha: string | null;
  estado: LeadEstado;
  motivo_perdida: string | null;
  vendedor_id: string | null;
  vendedor_nombre: string | null;
  cliente_id: string | null;
  vencida: boolean;
  duplicados?: LeadDuplicado[];
  reactivar?: { id: string; nombre: string; estado: string };
  created_at: string;
  updated_at: string;
}

export interface LeadDuplicado {
  id: string;
  negocio: string;
  estado: string;
  vendedor_nombre?: string;
}

export interface LeadEvento {
  id: string;
  lead_id: string;
  cuando: string;
  actor_id: string;
  actor_nombre: string;
  accion: string;
  antes: unknown;
  despues: unknown;
  motivo: string | null;
}

export type VisitaResultado = "interesado" | "no_interesado" | "volver";

export interface Visita {
  id: string;
  lead_id: string;
  vendedor_id: string;
  vendedor_nombre?: string;
  negocio?: string;
  client_id: string | null;
  latitud: number | null;
  longitud: number | null;
  notas: string | null;
  resultado: VisitaResultado;
  fotos: number;
  cuando: string | null;
  created_at: string;
}

export interface VentasMetricas {
  por_etapa: Record<string, number>;
  por_vendedor: Record<string, number>;
  visitas_por_vendedor: Record<string, number>;
  tasa_conversion_mes: number;
  ganados_mes: number;
  perdidos_mes: number;
  nuevos_mes: number;
  vendedores: Record<string, string>;
}

export const LEAD_ETAPAS: LeadEstado[] = [
  "prospecto",
  "en_contacto",
  "propuesta_enviada",
  "negociacion",
  "ganado",
];

export function leadEstadoLabel(e: string): string {
  switch (e) {
    case "prospecto":
      return "Prospecto";
    case "en_contacto":
      return "En contacto";
    case "propuesta_enviada":
      return "Propuesta";
    case "negociacion":
      return "Negociación";
    case "ganado":
      return "Ganado";
    case "perdido":
      return "Perdido";
    default:
      return e;
  }
}

export function visitaResultadoLabel(r: string): string {
  switch (r) {
    case "interesado":
      return "Interesado";
    case "no_interesado":
      return "No interesado";
    case "volver":
      return "Volver";
    default:
      return r;
  }
}

export function fmtCOP(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}
