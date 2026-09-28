/**
 * Cliente F1 — Producción. Habla SIEMPRE con el backend real vía el proxy
 * (/api/backend/*). Sin fallback local: si el backend falla, el error se
 * propaga a la UI (403 sin datos, 409, 422, etc. son respuestas de verdad).
 */

import { ApiError, req } from "./api";
import type {
  Cliente,
  ClienteEstado,
  Notificacion,
  Pieza,
  Tarea,
  TareaEvento,
} from "./f1tipos";

export interface EtapaNueva {
  etapa: "grabacion_principal" | "grabacion_apoyo" | "edicion" | "diseno" | "publicacion";
  asignado_id?: string | null;
  fecha_limite?: string | null;
}

function q(params: Record<string, string | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") s.set(k, v);
  }
  const str = s.toString();
  return str === "" ? "" : `?${str}`;
}

/** Compat: siempre false — ya no hay modo demo local (el front usa Go). */
export function esModoDemoF1(): boolean {
  return false;
}

/** Compat: verifica que F1 responda; lanza el error real si no. */
export async function detectarF1(): Promise<boolean> {
  await req<{ clientes: Cliente[] }>("/clientes");
  return false;
}

/* ---------- clientes ---------- */

export function getClientes(incluirArchivados = false): Promise<Cliente[]> {
  return req<{ clientes: Cliente[] }>(
    `/clientes${incluirArchivados ? "?incluir_archivados=1" : ""}`,
  ).then((d) => d.clientes);
}

export function crearCliente(b: {
  nombre: string; logo_url?: string | null; contacto_nombre?: string | null;
  contacto_telefono?: string | null; contacto_whatsapp?: string | null;
  paquete?: string | null; estado?: ClienteEstado; drive_url?: string | null;
  notas?: string | null; estrategia?: string | null;
}): Promise<Cliente> {
  return req<Cliente>("/clientes", { method: "POST", body: JSON.stringify(b) });
}

export function getCliente(id: string): Promise<{ cliente: Cliente; piezas: Pieza[]; historial: { eventos: unknown[] } }> {
  return req<{ cliente: Cliente; piezas: Pieza[]; historial: { eventos: unknown[] } }>(`/clientes/${id}`);
}

export function patchCliente(id: string, b: Partial<Cliente> & { updated_at?: string }): Promise<Cliente> {
  return req<Cliente>(`/clientes/${id}`, { method: "PATCH", body: JSON.stringify(b) });
}

export function archivarCliente(id: string): Promise<{ archivada: boolean }> {
  return req<{ archivada: boolean }>(`/clientes/${id}/archivar`, { method: "POST", body: "{}" });
}

/* ---------- piezas ---------- */

export function getPiezas(f: { cliente?: string; estado?: string; asignado?: string } = {}): Promise<Pieza[]> {
  return req<{ piezas: Pieza[] }>(
    `/piezas${q({ cliente: f.cliente, estado: f.estado, asignado: f.asignado })}`,
  ).then((d) => d.piezas);
}

export function crearPieza(b: {
  cliente_id: string; titulo: string; formato?: string | null; guion?: string | null;
  fecha_objetivo?: string | null; etapas: EtapaNueva[];
}): Promise<{ pieza: Pieza; tareas: Tarea[] }> {
  return req<{ pieza: Pieza; tareas: Tarea[] }>("/piezas", { method: "POST", body: JSON.stringify(b) });
}

export function getPieza(id: string): Promise<{ pieza: Pieza; tareas: Tarea[] }> {
  return req<{ pieza: Pieza; tareas: Tarea[] }>(`/piezas/${id}`);
}

export function patchPieza(id: string, b: Partial<Pieza> & { updated_at?: string }): Promise<Pieza> {
  return req<Pieza>(`/piezas/${id}`, { method: "PATCH", body: JSON.stringify(b) });
}

export function cancelarPieza(id: string, motivo: string): Promise<Pieza> {
  return req<Pieza>(`/piezas/${id}/cancelar`, { method: "POST", body: JSON.stringify({ motivo }) });
}

/* ---------- tareas ---------- */

export function getTareas(f: {
  asignado?: string; estado?: string; cliente?: string;
  vista?: "hoy" | "semana" | "vencidas" | "por_revisar";
} = {}): Promise<Tarea[]> {
  return req<{ tareas: Tarea[] }>(
    `/tareas${q({ asignado: f.asignado, estado: f.estado, cliente: f.cliente, vista: f.vista })}`,
  ).then((d) => d.tareas);
}

export function getTarea(id: string): Promise<{ tarea: Tarea; eventos: TareaEvento[] }> {
  return req<{ tarea: Tarea; eventos: TareaEvento[] }>(`/tareas/${id}`);
}

export function getEventosTarea(id: string): Promise<TareaEvento[]> {
  return req<{ eventos: TareaEvento[] }>(`/tareas/${id}/eventos`).then((d) => d.eventos);
}

export function empezarTarea(id: string): Promise<Tarea> {
  return req<Tarea>(`/tareas/${id}/empezar`, { method: "POST", body: "{}" });
}

export function entregarTarea(id: string, dato: Record<string, string | number | null | undefined>): Promise<Tarea> {
  return req<Tarea>(`/tareas/${id}/entregar`, { method: "POST", body: JSON.stringify(dato) });
}

export function aprobarTarea(id: string): Promise<Tarea> {
  return req<Tarea>(`/tareas/${id}/aprobar`, { method: "POST", body: "{}" });
}

export function devolverTarea(id: string, comentario: string): Promise<Tarea> {
  return req<Tarea>(`/tareas/${id}/devolver`, { method: "POST", body: JSON.stringify({ comentario }) });
}

export function reasignarTarea(id: string, asignadoId: string | null, updatedAt: string): Promise<Tarea> {
  return req<Tarea>(`/tareas/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ asignado_id: asignadoId, updated_at: updatedAt }),
  });
}

/* ---------- notificaciones ---------- */

export function getNotifs(): Promise<Notificacion[]> {
  return req<{ notificaciones: Notificacion[] }>("/notificaciones").then((d) => d.notificaciones);
}

export function leerNotif(id: string): Promise<Notificacion> {
  return req<Notificacion>(`/notificaciones/${id}/leer`, { method: "POST", body: "{}" });
}

export function contarNoLeidas(): Promise<number> {
  return getNotifs().then((ns) => ns.filter((n) => !n.leida).length);
}

/** Mensaje amable para el 409 de edición concurrente (§5.14, W10). */
export function mensajeConflicto(e: unknown): string | null {
  if (
    e !== null &&
    typeof e === "object" &&
    "status" in e &&
    (e as { status: number }).status === 409
  ) {
    return "Esto cambió mientras editabas: recargá y probá de nuevo";
  }
  return null;
}

export { ApiError };
