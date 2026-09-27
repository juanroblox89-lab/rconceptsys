/**
 * Cliente F4 — CRM Ventas. Habla SIEMPRE con el backend real vía el proxy
 * (/api/backend/*). Sin fallback local (mismo patrón F1/F2/F3).
 */

import { req } from "./api";
import { ApiError } from "./api";
import type {
  Lead,
  LeadDuplicado,
  LeadEstado,
  LeadEvento,
  VentasMetricas,
  Visita,
} from "./f4tipos";

function q(params: Record<string, string | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") s.set(k, v);
  }
  const str = s.toString();
  return str === "" ? "" : `?${str}`;
}

/* ---------- leads ---------- */

export interface LeadFiltros {
  estado?: string;
  vendedor?: string;
  municipio?: string;
  mias?: boolean;
}

export function getLeads(f: LeadFiltros = {}): Promise<Lead[]> {
  return req<{ leads: Lead[] }>(
    `/leads${q({
      estado: f.estado,
      vendedor: f.vendedor,
      municipio: f.municipio,
      mias: f.mias ? "1" : undefined,
    })}`,
  ).then((d) => d.leads);
}

export function getLead(id: string): Promise<Lead & { historial: LeadEvento[]; visitas: Visita[] }> {
  return req<Lead & { historial: LeadEvento[]; visitas: Visita[] }>(`/leads/${id}`);
}

export function crearLead(b: {
  negocio: string;
  contacto_nombre?: string;
  telefono?: string;
  direccion?: string;
  barrio?: string;
  municipio?: string;
  rubro?: string;
  origen?: string;
  valor_estimado_cop?: number;
  paquete_id?: string;
  notas?: string;
  accion_que?: string;
  accion_fecha?: string;
  vendedor_id?: string;
}): Promise<Lead> {
  return req<Lead>("/leads", { method: "POST", body: JSON.stringify(b) });
}

export function patchLead(
  id: string,
  b: Partial<{
    negocio: string;
    contacto_nombre: string;
    telefono: string;
    direccion: string;
    barrio: string;
    municipio: string;
    rubro: string;
    origen: string;
    notas: string;
    accion_que: string;
    accion_fecha: string;
    paquete_id: string;
  }>,
): Promise<Lead> {
  return req<Lead>(`/leads/${id}`, { method: "PATCH", body: JSON.stringify(b) });
}

export function moverLead(id: string, estado: LeadEstado, motivo_perdida?: string): Promise<Lead> {
  return req<Lead>(`/leads/${id}/mover`, {
    method: "POST",
    body: JSON.stringify({ estado, motivo_perdida }),
  });
}

export function reasignarLead(id: string, vendedor_id: string): Promise<Lead> {
  return req<Lead>(`/leads/${id}/reasignar`, {
    method: "POST",
    body: JSON.stringify({ vendedor_id }),
  });
}

export function ganarLead(
  id: string,
  b: { paquete_id?: string; nombre_cliente?: string; reactivar_id?: string; contacto_nombre?: string; telefono?: string },
): Promise<Lead> {
  return req<Lead>(`/leads/${id}/ganar`, { method: "POST", body: JSON.stringify(b) });
}

/** Error 409 de /ganar con el cliente previo para reactivar (§5.25). */
export class GanarConflicto extends Error {
  reactivar: { id: string; nombre: string; estado: string };
  lead: Lead;
  constructor(lead: Lead) {
    super("Ese negocio ya fue cliente");
    this.lead = lead;
    this.reactivar = lead.reactivar ?? { id: "", nombre: "", estado: "" };
  }
}

/** Lee el cuerpo pegado al ApiError 409 (ver req en api.ts). */
export function reactivarDe(e: unknown): Lead | null {
  if (!(e instanceof ApiError)) return null;
  const cuerpo = (e as ApiError & { cuerpo?: unknown }).cuerpo as Lead | null;
  if (cuerpo === null || cuerpo === undefined || typeof cuerpo !== "object") return null;
  if (!("reactivar" in cuerpo) || cuerpo.reactivar === undefined) return null;
  return cuerpo as Lead;
}

export { ApiError };

export function getLeadEventos(id: string): Promise<LeadEvento[]> {
  return req<{ eventos: LeadEvento[] }>(`/leads/${id}/eventos`).then((d) => d.eventos);
}

/* ---------- visitas ---------- */

export function getVisitas(f: { lead?: string; vendedor?: string; mias?: boolean } = {}): Promise<Visita[]> {
  return req<{ visitas: Visita[] }>(
    `/visitas${q({ lead: f.lead, vendedor: f.vendedor, mias: f.mias ? "1" : undefined })}`,
  ).then((d) => d.visitas);
}

export function crearVisita(b: {
  lead_id?: string;
  negocio?: string;
  telefono?: string;
  municipio?: string;
  direccion?: string;
  barrio?: string;
  latitud?: number | null;
  longitud?: number | null;
  notas?: string;
  resultado: string;
  client_id?: string;
  cuando?: string;
}): Promise<Visita> {
  return req<Visita>("/visitas", { method: "POST", body: JSON.stringify(b) });
}

export function subirFotoVisita(id: string, datos: string, nombre?: string): Promise<Visita> {
  return req<Visita>(`/visitas/${id}/fotos`, {
    method: "POST",
    body: JSON.stringify({ datos, nombre }),
  });
}

/* ---------- métricas ---------- */

export function getMetricasVentas(): Promise<VentasMetricas> {
  return req<VentasMetricas>("/ventas/metricas");
}

export type { LeadDuplicado };
