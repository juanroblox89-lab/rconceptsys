/**
 * Cliente F3 — Biblioteca. Habla SIEMPRE con el backend real vía el proxy
 * (/api/backend/*). Sin fallback local (mismo patrón F1/F2).
 */

import { req } from "./api";
import type {
  Formato,
  Hook,
  Referencia,
  SOP,
  SOPEjecucion,
  SOPPaso,
} from "./f3tipos";

function q(params: Record<string, string | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") s.set(k, v);
  }
  const str = s.toString();
  return str === "" ? "" : `?${str}`;
}

export type BibLista = { estado?: string; q?: string; etiqueta?: string };

/* ---------- formatos ---------- */

export function getFormatos(f: BibLista = {}): Promise<Formato[]> {
  return req<{ formatos: Formato[] }>(
    `/formatos${q({ estado: f.estado, q: f.q, etiqueta: f.etiqueta })}`,
  ).then((d) => d.formatos);
}

export function crearFormato(b: {
  nombre: string;
  codigo?: string;
  objetivo?: string;
  estructura?: string;
  hooks_recomendados?: string;
  kpis?: string;
  ejemplos?: string[];
  etiquetas?: string[];
  estado?: "borrador" | "publicado";
}): Promise<Formato> {
  return req<Formato>("/formatos", { method: "POST", body: JSON.stringify(b) });
}

export function patchFormato(
  id: string,
  b: Partial<{
    nombre: string;
    codigo: string;
    objetivo: string;
    estructura: string;
    hooks_recomendados: string;
    kpis: string;
    ejemplos: string[];
    etiquetas: string[];
  }>,
): Promise<Formato> {
  return req<Formato>(`/formatos/${id}`, { method: "PATCH", body: JSON.stringify(b) });
}

export function publicarFormato(id: string): Promise<Formato> {
  return req<Formato>(`/formatos/${id}/publicar`, { method: "POST", body: "{}" });
}

export function rechazarFormato(id: string, motivo: string): Promise<Formato> {
  return req<Formato>(`/formatos/${id}/rechazar`, {
    method: "POST",
    body: JSON.stringify({ motivo }),
  });
}

export function archivarFormato(id: string): Promise<Formato> {
  return req<Formato>(`/formatos/${id}/archivar`, { method: "POST", body: "{}" });
}

/* ---------- hooks ---------- */

export function getHooks(f: BibLista & { categoria?: string } = {}): Promise<Hook[]> {
  return req<{ hooks: Hook[] }>(
    `/hooks${q({ estado: f.estado, q: f.q, etiqueta: f.etiqueta, categoria: f.categoria })}`,
  ).then((d) => d.hooks);
}

export function crearHook(b: {
  titulo: string;
  categoria?: string;
  psicologia?: string;
  retencion_esperada?: string;
  variaciones?: string;
  ejemplos?: string[];
  etiquetas?: string[];
  estado?: "borrador" | "publicado";
}): Promise<Hook> {
  return req<Hook>("/hooks", { method: "POST", body: JSON.stringify(b) });
}

export function patchHook(
  id: string,
  b: Partial<{
    titulo: string;
    categoria: string;
    psicologia: string;
    retencion_esperada: string;
    variaciones: string;
    ejemplos: string[];
    etiquetas: string[];
  }>,
): Promise<Hook> {
  return req<Hook>(`/hooks/${id}`, { method: "PATCH", body: JSON.stringify(b) });
}

export function publicarHook(id: string): Promise<Hook> {
  return req<Hook>(`/hooks/${id}/publicar`, { method: "POST", body: "{}" });
}

export function rechazarHook(id: string, motivo: string): Promise<Hook> {
  return req<Hook>(`/hooks/${id}/rechazar`, {
    method: "POST",
    body: JSON.stringify({ motivo }),
  });
}

export function archivarHook(id: string): Promise<Hook> {
  return req<Hook>(`/hooks/${id}/archivar`, { method: "POST", body: "{}" });
}

/* ---------- referencias ---------- */

export function getReferencias(
  f: BibLista & { plataforma?: string } = {},
): Promise<Referencia[]> {
  return req<{ referencias: Referencia[] }>(
    `/referencias${q({ estado: f.estado, q: f.q, etiqueta: f.etiqueta, plataforma: f.plataforma })}`,
  ).then((d) => d.referencias);
}

export function crearReferencia(b: {
  titulo: string;
  link: string;
  plataforma?: string;
  analisis?: string;
  etiquetas?: string[];
  cliente_id?: string;
  estado?: "borrador" | "publicado";
}): Promise<Referencia> {
  return req<Referencia>("/referencias", { method: "POST", body: JSON.stringify(b) });
}

export function patchReferencia(
  id: string,
  b: Partial<{
    titulo: string;
    link: string;
    plataforma: string;
    analisis: string;
    etiquetas: string[];
    cliente_id: string;
  }>,
): Promise<Referencia> {
  return req<Referencia>(`/referencias/${id}`, { method: "PATCH", body: JSON.stringify(b) });
}

export function publicarReferencia(id: string): Promise<Referencia> {
  return req<Referencia>(`/referencias/${id}/publicar`, { method: "POST", body: "{}" });
}

export function rechazarReferencia(id: string, motivo: string): Promise<Referencia> {
  return req<Referencia>(`/referencias/${id}/rechazar`, {
    method: "POST",
    body: JSON.stringify({ motivo }),
  });
}

export function archivarReferencia(id: string): Promise<Referencia> {
  return req<Referencia>(`/referencias/${id}/archivar`, { method: "POST", body: "{}" });
}

/* ---------- SOPs ---------- */

export function getSOPs(
  f: BibLista & { oficio?: string } = {},
): Promise<SOP[]> {
  return req<{ sops: SOP[] }>(
    `/sops${q({ estado: f.estado, q: f.q, etiqueta: f.etiqueta, oficio: f.oficio })}`,
  ).then((d) => d.sops);
}

export function getSOP(id: string): Promise<{ sop: SOP; pasos: SOPPaso[] }> {
  return req<{ sop: SOP; pasos: SOPPaso[] }>(`/sops/${id}`);
}

export function crearSOP(b: {
  titulo: string;
  oficio?: string;
  tiempo_estimado_min?: number | null;
  etiquetas?: string[];
  pasos?: { titulo: string; descripcion?: string }[];
  estado?: "borrador" | "publicado";
}): Promise<{ sop: SOP; pasos: SOPPaso[] }> {
  return req<{ sop: SOP; pasos: SOPPaso[] }>("/sops", {
    method: "POST",
    body: JSON.stringify(b),
  });
}

export function patchSOP(
  id: string,
  b: Partial<{
    titulo: string;
    oficio: string;
    tiempo_estimado_min: number | null;
    etiquetas: string[];
  }>,
): Promise<SOP> {
  return req<SOP>(`/sops/${id}`, { method: "PATCH", body: JSON.stringify(b) });
}

export function publicarSOP(id: string): Promise<SOP> {
  return req<SOP>(`/sops/${id}/publicar`, { method: "POST", body: "{}" });
}

export function rechazarSOP(id: string, motivo: string): Promise<SOP> {
  return req<SOP>(`/sops/${id}/rechazar`, {
    method: "POST",
    body: JSON.stringify({ motivo }),
  });
}

export function archivarSOP(id: string): Promise<SOP> {
  return req<SOP>(`/sops/${id}/archivar`, { method: "POST", body: "{}" });
}

export function getSOPPasos(id: string): Promise<SOPPaso[]> {
  return req<{ pasos: SOPPaso[] }>(`/sops/${id}/pasos`).then((d) => d.pasos);
}

export function crearSOPPaso(
  sopId: string,
  b: { titulo: string; descripcion?: string },
): Promise<SOPPaso> {
  return req<SOPPaso>(`/sops/${sopId}/pasos`, {
    method: "POST",
    body: JSON.stringify(b),
  });
}

/* ---------- ejecuciones ---------- */

export function getEjecuciones(f: { sop_id?: string; tarea_id?: string; mias?: boolean } = {}): Promise<SOPEjecucion[]> {
  return req<{ ejecuciones: SOPEjecucion[] }>(
    `/sop-ejecuciones${q({ sop_id: f.sop_id, tarea_id: f.tarea_id, mias: f.mias ? "1" : undefined })}`,
  ).then((d) => d.ejecuciones);
}

export function iniciarEjecucion(b: { sop_id: string; tarea_id?: string }): Promise<SOPEjecucion> {
  return req<SOPEjecucion>("/sop-ejecuciones", {
    method: "POST",
    body: JSON.stringify(b),
  });
}

export function marcarPaso(ejecucionId: string, pasoId: string): Promise<SOPEjecucion> {
  return req<SOPEjecucion>(`/sop-ejecuciones/${ejecucionId}/pasos`, {
    method: "POST",
    body: JSON.stringify({ paso_id: pasoId }),
  });
}

export function desmarcarPaso(ejecucionId: string, pasoId: string): Promise<SOPEjecucion> {
  return req<SOPEjecucion>(`/sop-ejecuciones/${ejecucionId}/pasos/${pasoId}`, {
    method: "DELETE",
  });
}

export function terminarEjecucion(id: string): Promise<SOPEjecucion> {
  return req<SOPEjecucion>(`/sop-ejecuciones/${id}/terminar`, {
    method: "POST",
    body: "{}",
  });
}
