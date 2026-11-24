import { fetchApi } from "./api";

export type TipoAdjunto = "imagen" | "video" | "audio";
export type AdjuntoAsignacion = {
  id: string; nombre: string; tipo: TipoAdjunto; mime: string; tamano: number; duracion_ms?: number | null;
  resumir: boolean; estado_resumen: "sin_resumen" | "pendiente" | "procesando" | "listo" | "fallido";
  resumen?: string[]; transcripcion?: string;
};
export type AdjuntoLocal = { id: string; archivo: File; tipo: TipoAdjunto; resumir: boolean; duracion?: number; avance?: number; error?: string };
export const aceptarAdjuntos = ".jpg,.jpeg,.png,.webp,.heic,.mp4,.mov,.webm,.ogg,.opus,.m4a,.mp3,.wav";
export const limiteAdjunto = { imagen: 10, video: 50, audio: 25 };
const base = (id: number) => `/api/tareas/${id}/adjuntos`;
const admin = (id: number) => `/api/admin/tareas/${id}/adjuntos`;
const json = (method: string, cuerpo: unknown) => ({ method, body: JSON.stringify(cuerpo) });

export function tipoDeArchivo(f: File): TipoAdjunto | null {
  const ext = f.name.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  if (["jpg", "jpeg", "png", "webp", "heic"].includes(ext)) return "imagen";
  if (["ogg", "opus", "m4a", "mp3", "wav"].includes(ext)) return "audio";
  if (ext === "webm" && f.type.startsWith("audio/")) return "audio";
  if (["mp4", "mov", "webm"].includes(ext)) return "video";
  return null;
}

export const adjuntos = {
  listar: (id: number) => fetchApi<AdjuntoAsignacion[]>(base(id), { cache: "no-store" }),
  firma: (id: number, a: string, descarga = false) => fetchApi<{ url: string; expira_en: number }>(`${base(id)}/${a}/firma${descarga ? "?descargar=1" : ""}`, { cache: "no-store" }),
  reintentar: (id: number, a: string) => fetchApi<AdjuntoAsignacion>(`${base(id)}/${a}/reintentar`, { method: "POST" }),
  quitar: (id: number, a: string) => fetchApi<unknown>(`${admin(id)}/${a}`, { method: "DELETE" }),
  resumir: (id: number, a: string, resumir: boolean) => fetchApi<AdjuntoAsignacion>(`${admin(id)}/${a}`, json("PATCH", { resumir })),
};

export async function subirAdjunto(tarea: number, local: AdjuntoLocal, progreso: (n: number) => void) {
  const f = local.archivo;
  const raiz = admin(tarea);
  const r = await fetchApi<{ id: string; parte_bytes: number; listo: boolean }>(raiz, json("POST", { id: local.id, nombre: f.name, tamano: f.size, tipo: local.tipo, resumir: local.resumir, duracion_ms: local.duracion }));
  const accion = `${raiz}/${r.id}`;
  if (!r.listo) {
    for (let offset = 0, n = 0; offset < f.size; offset += r.parte_bytes, n++) {
      const parte = f.slice(offset, offset + r.parte_bytes);
      await fetchApi(`${accion}/partes/${n}`, { method: "PUT", body: parte, headers: { "Content-Type": "application/octet-stream" } });
      progreso(Math.round(Math.min(f.size, offset + parte.size) / f.size * 95));
    }
  }
  const guardado = await fetchApi<AdjuntoAsignacion>(`${accion}/finalizar`, { method: "POST" });
  // Si una respuesta se perdió y luego se cambió el interruptor, conserva la última elección.
  const final = guardado.tipo === "audio" && guardado.resumir !== local.resumir ? await adjuntos.resumir(tarea, r.id, local.resumir) : guardado;
  progreso(100);
  return final;
}
