/** Tipos F3 — Biblioteca (formatos, hooks, referencias, SOPs ejecutables).
 * Contrato: backend Go vía proxy /api/backend/* (mismo patrón F1/F2).
 */

export type BibEstado = "borrador" | "publicado" | "rechazado" | "archivado";

export interface Formato {
  id: string;
  codigo: string | null;
  nombre: string;
  objetivo: string | null;
  estructura: string | null;
  hooks_recomendados: string | null;
  kpis: string | null;
  ejemplos: string[];
  etiquetas: string[];
  estado: BibEstado;
  propuesto_por: string | null;
  propuesto_por_nombre?: string | null;
  publicado_por: string | null;
  motivo_rechazo: string | null;
  demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Hook {
  id: string;
  titulo: string;
  categoria: string | null;
  psicologia: string | null;
  retencion_esperada: string | null;
  variaciones: string | null;
  ejemplos: string[];
  etiquetas: string[];
  estado: BibEstado;
  propuesto_por: string | null;
  propuesto_por_nombre?: string | null;
  publicado_por: string | null;
  motivo_rechazo: string | null;
  demo: boolean;
  created_at: string;
  updated_at: string;
}

export type Plataforma = "Instagram" | "TikTok" | "YouTube" | "otra";

export interface Referencia {
  id: string;
  titulo: string;
  link: string;
  plataforma: Plataforma;
  analisis: string | null;
  etiquetas: string[];
  cliente_id: string | null;
  estado: BibEstado;
  propuesto_por: string | null;
  propuesto_por_nombre?: string | null;
  publicado_por: string | null;
  motivo_rechazo: string | null;
  demo: boolean;
  created_at: string;
  updated_at: string;
}

export type OficioSOP =
  | "todos"
  | "grabacion"
  | "edicion"
  | "diseno"
  | "estrategia"
  | "publicacion"
  | "ventas";

export interface SOP {
  id: string;
  titulo: string;
  oficio: OficioSOP;
  tiempo_estimado_min: number | null;
  etiquetas: string[];
  estado: BibEstado;
  propuesto_por: string | null;
  propuesto_por_nombre?: string | null;
  publicado_por: string | null;
  motivo_rechazo: string | null;
  demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface SOPPaso {
  id: string;
  sop_id: string;
  orden: number;
  titulo: string;
  /** El backend responde "título" y "title" (compatibilidad). */
  title?: string;
  descripcion: string | null;
  created_at: string;
}

export type EjecEstado = "en_curso" | "terminada";

export interface SOPEjecucion {
  id: string;
  sop_id: string;
  sop_titulo: string | null;
  tarea_id: string | null;
  iniciado_por: string;
  iniciado_por_nombre: string | null;
  estado: EjecEstado;
  iniciada_at: string;
  terminada_at: string | null;
  pasos_marcados: string[];
  created_at: string;
  updated_at: string;
}

export const BIB_ESTADOS: { value: BibEstado; label: string }[] = [
  { value: "borrador", label: "Borrador" },
  { value: "publicado", label: "Publicado" },
  { value: "rechazado", label: "Rechazado" },
  { value: "archivado", label: "Archivado" },
];

export function bibEstadoLabel(e: string): string {
  return BIB_ESTADOS.find((x) => x.value === e)?.label ?? e;
}

export const SOP_OFICIOS: { value: OficioSOP; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "grabacion", label: "Grabación" },
  { value: "edicion", label: "Edición" },
  { value: "diseno", label: "Diseño" },
  { value: "estrategia", label: "Estrategia/guion" },
  { value: "publicacion", label: "Publicación" },
  { value: "ventas", label: "Ventas" },
];

export function sopOficioLabel(o: string): string {
  return SOP_OFICIOS.find((x) => x.value === o)?.label ?? o;
}
