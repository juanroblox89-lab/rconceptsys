/**
 * Cliente F2 — Cobros. Habla SIEMPRE con el backend real vía el proxy
 * (/api/backend/*). Sin fallback local (mismo patrón F1).
 */

import { req } from "./api";
import type {
  ConfigCobros,
  Corte,
  CorteDetalle,
  Linea,
  Paquete,
  Tarifa,
  UnidadTarifa,
} from "./f2tipos";

function q(params: Record<string, string | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") s.set(k, v);
  }
  const str = s.toString();
  return str === "" ? "" : `?${str}`;
}

/* ---------- tarifas (solo dueño) ---------- */

export function getTarifas(): Promise<Tarifa[]> {
  return req<{ tarifas: Tarifa[] }>("/tarifas").then((d) => d.tarifas);
}

export function crearTarifa(b: {
  etapa: string;
  unidad: UnidadTarifa;
  monto_cop: number;
  tramos?: { desde_seg: number; hasta_seg?: number | null; monto_cop: number }[];
}): Promise<Tarifa> {
  return req<Tarifa>("/tarifas", { method: "POST", body: JSON.stringify(b) });
}

/* ---------- paquetes ---------- */

export function getPaquetes(): Promise<Paquete[]> {
  return req<{ paquetes: Paquete[] }>("/paquetes").then((d) => d.paquetes);
}

export function crearPaquete(b: { nombre: string; precio_cop: number }): Promise<Paquete> {
  return req<Paquete>("/paquetes", { method: "POST", body: JSON.stringify(b) });
}

export function patchPaquete(
  id: string,
  b: { nombre?: string; precio_cop?: number; activo?: boolean },
): Promise<Paquete> {
  return req<Paquete>(`/paquetes/${id}`, { method: "PATCH", body: JSON.stringify(b) });
}

/* ---------- config ---------- */

export function getConfigCobros(): Promise<ConfigCobros> {
  return req<ConfigCobros>("/config-cobros");
}

export function patchConfigCobros(b: {
  porcentaje_comision?: number;
  modo_comision?: "una_vez" | "mensual";
}): Promise<ConfigCobros> {
  return req<ConfigCobros>("/config-cobros", { method: "PATCH", body: JSON.stringify(b) });
}

/* ---------- líneas ---------- */

export function getLineas(f: { periodo?: string; usuario_id?: string; estado?: string } = {}): Promise<Linea[]> {
  return req<{ lineas: Linea[] }>(
    `/lineas${q({ periodo: f.periodo, usuario_id: f.usuario_id, estado: f.estado })}`,
  ).then((d) => d.lineas);
}

export function getLinea(id: string): Promise<Linea> {
  return req<Linea>(`/lineas/${id}`);
}

export function confirmarLinea(id: string): Promise<Linea> {
  return req<Linea>(`/lineas/${id}/confirmar`, { method: "POST", body: "{}" });
}

export function reclamarLinea(id: string, motivo: string): Promise<Linea> {
  return req<Linea>(`/lineas/${id}/reclamar`, { method: "POST", body: JSON.stringify({ motivo }) });
}

export function aprobarLinea(id: string): Promise<Linea> {
  return req<Linea>(`/lineas/${id}/aprobar`, { method: "POST", body: "{}" });
}

export function devolverLinea(id: string, comentario: string): Promise<Linea> {
  return req<Linea>(`/lineas/${id}/devolver`, { method: "POST", body: JSON.stringify({ comentario }) });
}

export function crearAjuste(b: {
  usuario_id: string;
  monto_cop: number;
  motivo: string;
  periodo?: string;
}): Promise<Linea> {
  return req<Linea>("/lineas/ajuste", { method: "POST", body: JSON.stringify(b) });
}

/* ---------- cortes ---------- */

export function getCortes(): Promise<Corte[]> {
  return req<{ cortes: Corte[] }>("/cortes").then((d) => d.cortes);
}

export function getCorteActual(periodo?: string): Promise<CorteDetalle> {
  return req<CorteDetalle>(`/cortes/actual${periodo ? `?periodo=${encodeURIComponent(periodo)}` : ""}`);
}

/** Resumen propio del trabajador (§5.22 + historial de sus cortes). */
export function getCorteMio(periodo?: string): Promise<CorteDetalle> {
  return req<CorteDetalle>(`/cortes/mios${periodo ? `?periodo=${encodeURIComponent(periodo)}` : ""}`);
}

export function cerrarCorte(periodo?: string): Promise<CorteDetalle> {
  return req<CorteDetalle>("/cortes/cerrar", {
    method: "POST",
    body: JSON.stringify(periodo ? { periodo } : {}),
  });
}

export function pagarCorte(periodo: string, usuario_id?: string): Promise<{ pagadas: number; periodo: string }> {
  return req<{ pagadas: number; periodo: string }>(`/cortes/${periodo}/pagar`, {
    method: "POST",
    body: JSON.stringify(usuario_id ? { usuario_id } : {}),
  });
}

export function revertirCorte(periodo: string, usuario_id?: string): Promise<{ revertidas: number; periodo: string }> {
  return req<{ revertidas: number; periodo: string }>(`/cortes/${periodo}/revertir`, {
    method: "POST",
    body: JSON.stringify(usuario_id ? { usuario_id } : {}),
  });
}

/* ---------- comisiones + decisión ---------- */

export function generarComisionesMensual(periodo?: string): Promise<{ generadas: number; periodo: string }> {
  return req<{ generadas: number; periodo: string }>("/comisiones/mensual", {
    method: "POST",
    body: JSON.stringify(periodo ? { periodo } : {}),
  });
}

export function decidirTarea(
  id: string,
  b: { decision: "pagar" | "no_pagar"; motivo: string },
): Promise<{ tarea: unknown; linea_id?: string }> {
  return req<{ tarea: unknown; linea_id?: string }>(`/tareas/${id}/decision`, {
    method: "POST",
    body: JSON.stringify(b),
  });
}
