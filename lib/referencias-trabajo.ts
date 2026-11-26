import type { Cliente, ReferenciaDriveTrabajo, Tarea } from "@/lib/types";

export const MAX_REFERENCIAS_TRABAJO = 3;
const idDrive = /^[\w-]{3,160}$/;

export function enlaceReferenciaDrive(enlace?: string | null): enlace is string {
  return !!enlace && /^https:\/\/(drive|docs)\.google\.com\/[^/?#]/i.test(enlace);
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
  const u = enlace ? new URL(enlace) : null;
  const id = tarea.drive_carpeta_id || u?.searchParams.get("id") || u?.pathname.match(/\/(?:folders|d)\/([\w-]+)(?:\/|$)/)?.[1];
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
