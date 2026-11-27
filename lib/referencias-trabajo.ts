import type { Cliente, MetodoEntrega, ReferenciaDriveTrabajo, Tarea, TipoElementoEntrega } from "@/lib/types";

export const MAX_REFERENCIAS_TRABAJO = 3;
export const MAX_ELEMENTOS_ENTREGA_DRIVE = 4;
const idDrive = /^[\w-]{3,160}$/;

export function enlaceReferenciaDrive(enlace?: string | null): enlace is string {
  return !!enlace && /^https:\/\/(drive|docs|drive\.usercontent)\.google\.com\/[^/?#]/i.test(enlace);
}

export function idElementoDrive(enlace?: string | null): string {
  if (!enlace) return "";
  let u: URL;
  try {
    u = new URL(enlace.trim());
  } catch {
    return "";
  }
  if (u.port) return "";
  const qId = u.searchParams.get("id");
  if ((u.pathname === "/open" || u.pathname === "/uc" || u.pathname === "/download") && qId && idDrive.test(qId)) {
    return qId;
  }
  const partes = u.pathname.replace(/^\/+|\/+$/g, "").split("/");
  for (let i = 0; i + 1 < partes.length; i++) {
    if ((partes[i] === "folders" || partes[i] === "d") && idDrive.test(partes[i + 1])) {
      return partes[i + 1];
    }
  }
  return "";
}

export function inferirTipoDrive(enlace: string, tipoActual?: TipoElementoEntrega | null): TipoElementoEntrega {
  if (tipoActual === "carpeta" || tipoActual === "archivo") return tipoActual;
  return enlace.includes("/folders/") ? "carpeta" : "archivo";
}

export function elementosEntregaDrive(fuente?: {
  metodo_entrega?: MetodoEntrega | string | null;
  entrega_drive?: ReferenciaDriveTrabajo[] | null;
  enlace_medios?: string | null;
  entrega_nombre?: string | null;
  entrega_tipo?: TipoElementoEntrega | null;
} | null): ReferenciaDriveTrabajo[] {
  if (!fuente || fuente.metodo_entrega === "whatsapp") return [];
  if (Array.isArray(fuente.entrega_drive) && fuente.entrega_drive.length > 0) {
    return fuente.entrega_drive.slice(0, MAX_ELEMENTOS_ENTREGA_DRIVE);
  }
  const enlace = fuente.enlace_medios?.trim();
  if (!enlace || !enlaceReferenciaDrive(enlace)) return [];
  const tipo = inferirTipoDrive(enlace, fuente.entrega_tipo);
  const id = idElementoDrive(enlace) || enlace;
  const nombre = fuente.entrega_nombre?.trim() || (tipo === "carpeta" ? "Carpeta de Drive" : "Archivo de Drive");
  return [{ id, nombre, url: enlace, tipo }];
}

export function nombreReferenciaVisible(ref: { nombre?: string | null; tipo?: string }): string {
  const limpio = ref.nombre?.trim();
  if (limpio) return limpio;
  return ref.tipo === "archivo" ? "Archivo de Drive" : "Carpeta de Drive";
}

export function referenciaDelCliente(cliente?: Cliente | null): ReferenciaDriveTrabajo | null {
  const id = cliente?.drive_carpeta_id;
  if (!cliente || !id || !idDrive.test(id)) return null;
  return {
    id,
    nombre: `Carpeta de ${cliente.nombre}`,
    tipo: "carpeta",
    url: enlaceReferenciaDrive(cliente.drive_url) ? cliente.drive_url : `https://drive.google.com/drive/folders/${id}`,
  };
}

export function referenciasDelTrabajo(tarea: Tarea): ReferenciaDriveTrabajo[] {
  // NULL identifica un trabajo anterior; [] conserva una eliminación explícita.
  if (tarea.drive_referencias != null) return tarea.drive_referencias;
  const enlace = enlaceReferenciaDrive(tarea.drive_carpeta_url) ? tarea.drive_carpeta_url : "";
  const id = tarea.drive_carpeta_id || idElementoDrive(enlace);
  const idValido = id && idDrive.test(id) ? id : "";
  if (!enlace && !idValido) return [];
  const nombre = tarea.drive_carpeta_nombre?.trim() || "Carpeta del trabajo";
  const ruta = tarea.drive_carpeta_ruta?.trim() || undefined;
  return [{
    id: idValido,
    nombre,
    tipo: "carpeta",
    url: enlace || `https://drive.google.com/drive/folders/${idValido}`,
    ...(ruta ? { ruta } : {}),
  }];
}
