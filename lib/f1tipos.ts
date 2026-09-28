/** Tipos F1 — Producción (clientes, piezas, tareas, notificaciones).
 * Contrato: mensaje del coordinador (mismo patrón F0: proxy /api/backend/*,
 * header X-Demo-User, errores {error}, 409 en conflicto de edición).
 */

export type ClienteEstado = "activo" | "pausado" | "terminado";

export interface Cliente {
  id: string;
  nombre: string;
  logo_url: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_whatsapp: string | null;
  paquete: string | null;
  estado: ClienteEstado;
  drive_url: string | null;
  notas: string | null;
  estrategia: string | null;
  /** F3: formato/hook recomendado (solo referencia a biblioteca publicada). */
  formato_recomendado_id: string | null;
  hook_recomendado_id: string | null;
  archivado_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PiezaEstado =
  | "borrador"
  | "en_produccion"
  | "en_revision"
  | "aprobada"
  | "publicada"
  | "cancelada";

export interface Pieza {
  id: string;
  cliente_id: string;
  cliente_nombre: string;
  titulo: string;
  formato: string | null;
  /** F3: formato/hook vinculado (solo referencia a biblioteca publicada). */
  formato_recomendado_id: string | null;
  hook_recomendado_id: string | null;
  guion: string | null;
  /** F5: borrador del asistente (no reemplaza al guion aprobado). */
  guion_borrador: string | null;
  fecha_objetivo: string | null;
  estado: PiezaEstado;
  /** Motivo de cancelación (el backend lo manda como motivo_cancelacion). */
  motivo: string | null;
  motivo_cancelacion?: string | null;
  vencida: boolean;
  created_at: string;
  updated_at: string;
}

export type Etapa =
  | "grabacion_principal"
  | "grabacion_apoyo"
  | "edicion"
  | "diseno"
  | "publicacion";

export type TareaEstado =
  | "bloqueada"
  | "pendiente"
  | "en_curso"
  | "entregada"
  | "aprobada"
  | "devuelta"
  | "cancelada";

export interface Tarea {
  id: string;
  pieza_id: string;
  pieza_titulo: string;
  cliente_id: string;
  cliente_nombre: string;
  etapa: Etapa;
  asignado_id: string | null;
  asignado_nombre: string | null;
  estado: TareaEstado;
  fecha_limite: string | null;
  vencida: boolean;
  decision_pendiente: boolean;
  /** Datos de entrega (los manda GET /piezas/:id y GET /tareas/:id). */
  material_url?: string | null;
  minutos?: number | null;
  entregable_url?: string | null;
  publicado_url?: string | null;
  /** Compat: revisiones viejas leían dato_entrega (ya no lo manda el backend). */
  dato_entrega?: Record<string, string> | null;
  updated_at: string;
}

export interface TareaEvento {
  id: string;
  tarea_id: string;
  cuando: string;
  actor_nombre: string;
  accion: string;
  antes: string | null;
  despues: string | null;
  comentario: string | null;
}

export interface Notificacion {
  id: string;
  tipo: string;
  titulo: string;
  detalle: string | null;
  leida: boolean;
  recurso: string | null;
  recurso_id: string | null;
  created_at: string;
}

/* ---------- Etiquetas ---------- */

export const PIEZA_ESTADOS: { value: PiezaEstado; label: string }[] = [
  { value: "borrador", label: "Borrador" },
  { value: "en_produccion", label: "En producción" },
  { value: "en_revision", label: "En revisión" },
  { value: "aprobada", label: "Aprobada" },
  { value: "publicada", label: "Publicada" },
  { value: "cancelada", label: "Cancelada" },
];

export function piezaEstadoLabel(e: string): string {
  return PIEZA_ESTADOS.find((x) => x.value === e)?.label ?? e;
}

export const TAREA_ESTADOS: { value: TareaEstado; label: string }[] = [
  { value: "bloqueada", label: "Bloqueada" },
  { value: "pendiente", label: "Pendiente" },
  { value: "en_curso", label: "En curso" },
  { value: "entregada", label: "Entregada" },
  { value: "aprobada", label: "Aprobada" },
  { value: "devuelta", label: "Devuelta" },
  { value: "cancelada", label: "Cancelada" },
];

export function tareaEstadoLabel(e: string): string {
  return TAREA_ESTADOS.find((x) => x.value === e)?.label ?? e;
}

export const ETAPAS: { value: Etapa; label: string; oficio: string }[] = [
  { value: "grabacion_principal", label: "Grabación principal", oficio: "grabacion" },
  { value: "grabacion_apoyo", label: "Grabación de apoyo", oficio: "grabacion" },
  { value: "edicion", label: "Edición", oficio: "edicion" },
  { value: "diseno", label: "Diseño", oficio: "diseno" },
  { value: "publicacion", label: "Publicación", oficio: "publicacion" },
];

export function etapaLabel(e: string): string {
  return ETAPAS.find((x) => x.value === e)?.label ?? e;
}

export function oficioDeEtapa(e: Etapa): string {
  return ETAPAS.find((x) => x.value === e)?.oficio ?? "";
}

/** Campos que exige la entrega según la etapa (ANALISIS §5.9). */
export type CampoEntrega = "material_url" | "minutos" | "entregable_url" | "publicado_url";

export function camposDeEtapa(etapa: Etapa): CampoEntrega[] {
  switch (etapa) {
    case "grabacion_principal":
      return ["material_url", "minutos"];
    case "grabacion_apoyo":
      return ["minutos"];
    case "edicion":
    case "diseno":
      return ["entregable_url"];
    case "publicacion":
      return ["publicado_url"];
  }
}

export const CAMPO_ENTREGA_LABEL: Record<CampoEntrega, string> = {
  material_url: "Link del material",
  minutos: "Minutos",
  entregable_url: "Link del entregable",
  publicado_url: "Link publicado",
};

export const CLIENTE_ESTADOS: { value: ClienteEstado; label: string }[] = [
  { value: "activo", label: "Activo" },
  { value: "pausado", label: "Pausado" },
  { value: "terminado", label: "Terminado" },
];

export function clienteEstadoLabel(e: string): string {
  return CLIENTE_ESTADOS.find((x) => x.value === e)?.label ?? e;
}

/* ---------- Ayudas ---------- */

/** Vencida: fecha límite pasada y no aprobada (§5.10). */
export function esVencida(fechaLimite: string | null, estado: string): boolean {
  if (fechaLimite === null || fechaLimite === "") return false;
  if (estado === "aprobada" || estado === "cancelada" || estado === "publicada") return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const lim = new Date(fechaLimite.length <= 10 ? `${fechaLimite}T00:00:00` : fechaLimite);
  if (Number.isNaN(lim.getTime())) return false;
  lim.setHours(0, 0, 0, 0);
  return lim.getTime() < hoy.getTime();
}

export { fmtFecha, fmtFechaHora, fmtRelativa, fmtPeriodo, fmtFechaCorta } from "./fechas";

export function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isoEnDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Mensaje de conflicto de edición (§5.14): el backend manda 409. */
export function esConflicto(status: number): boolean {
  return status === 409;
}
