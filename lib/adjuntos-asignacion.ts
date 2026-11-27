import { fetchApi } from "./api";

export type TipoAdjunto = "imagen" | "video" | "audio";
export type EstadoResumen = "sin_resumen" | "pendiente" | "procesando" | "listo" | "fallido";
export type BorradorResumenAplicar = {
  resumen: string[];
  transcripcion: string;
  proveedor: string;
  token: string;
};
export type AdjuntoAsignacion = {
  id: string; nombre: string; tipo: TipoAdjunto; mime: string; tamano: number; duracion_ms?: number | null;
  resumir: boolean; estado_resumen: EstadoResumen;
  resumen?: string[]; transcripcion?: string; error_resumen?: string;
};
export type AdjuntoLocal = {
  id: string;
  archivo: File;
  tipo: TipoAdjunto;
  resumir: boolean;
  estadoResumen?: EstadoResumen;
  resumen?: string[];
  transcripcion?: string;
  errorResumen?: string;
  borradorResumen?: BorradorResumenAplicar;
  duracion?: number;
  avance?: number;
  error?: string;
};
export const aceptarAdjuntos = ".jpg,.jpeg,.png,.webp,.heic,.mp4,.mov,.webm,.ogg,.opus,.m4a,.mp3,.wav";
export const limiteAdjunto = { imagen: 10, video: 50, audio: 25 };
export const bytesPorMBAdjunto = 1024 * 1024;
const etiquetasTipo = { imagen: "La imagen", audio: "El audio", video: "El video" };
const formatoPeso = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

export function validarPesoAdjunto(tamano: number, tipo: TipoAdjunto) {
  if (!Number.isFinite(tamano) || tamano <= 0) return `${etiquetasTipo[tipo]} está ${tipo === "imagen" ? "vacía" : "vacío"}.`;
  if (tamano > limiteAdjunto[tipo] * bytesPorMBAdjunto) return `${etiquetasTipo[tipo]} supera el límite de ${limiteAdjunto[tipo]} MB.`;
  return null;
}

export function pesoAdjunto(tamano: number, tipo: TipoAdjunto) {
  const peso = tamano / bytesPorMBAdjunto;
  return `${peso > 0 && peso < .05 ? "< 0,1" : formatoPeso.format(peso)} / ${limiteAdjunto[tipo]} MB`;
}
const PARTE_BYTES = 2 * 1024 * 1024;
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

function leerVintEBML(b: Uint8Array, pos: number, esId: boolean): { val: number; len: number; indef: boolean } | null {
  if (pos >= b.length || b[pos] === 0) return null;
  let n = 1;
  let mask = 0x80;
  while ((b[pos] & mask) === 0) {
    n++;
    mask >>= 1;
    if (n > 8) return null;
  }
  if (pos + n > b.length || (esId && n > 4)) return null;
  let val = esId ? b[pos] : b[pos] & ~mask;
  for (let i = 1; i < n; i++) val = val * 256 + b[pos + i];
  const indef = !esId && val === Math.pow(2, 7 * n) - 1;
  return { val, len: n, indef };
}

function recorrerEBMLLocal(b: Uint8Array, fn: (id: number, payload: Uint8Array) => void) {
  let pos = 0;
  while (pos < b.length) {
    const id = leerVintEBML(b, pos, true);
    if (!id) return;
    pos += id.len;
    const tam = leerVintEBML(b, pos, false);
    if (!tam) return;
    pos += tam.len;
    const size = tam.indef ? b.length - pos : tam.val;
    if (size < 0 || pos + size > b.length) return;
    fn(id.val, b.subarray(pos, pos + size));
    pos += size;
  }
}

export function pistasWebMDesdeBytes(b: Uint8Array): { audio: boolean; video: boolean; webm: boolean } {
  if (b.length < 4 || b[0] !== 0x1a || b[1] !== 0x45 || b[2] !== 0xdf || b[3] !== 0xa3) {
    return { audio: false, video: false, webm: false };
  }
  let webm = false;
  let audio = false;
  let video = false;
  recorrerEBMLLocal(b, (id, p) => {
    if (id === 0x1a45dfa3) {
      recorrerEBMLLocal(p, (cid, cp) => {
        if (cid === 0x4282) {
          const doc = new TextDecoder().decode(cp).replace(/\0+$/, "");
          if (doc === "webm") webm = true;
        }
      });
    } else if (id === 0x18538067) {
      recorrerEBMLLocal(p, (cid, cp) => {
        if (cid !== 0x1654ae6b) return;
        recorrerEBMLLocal(cp, (tid, tp) => {
          if (tid !== 0xae) return;
          recorrerEBMLLocal(tp, (fid, fp) => {
            if (fid === 0x83 && fp.length === 1) {
              if (fp[0] === 2) audio = true;
              if (fp[0] === 1) video = true;
            }
          });
        });
      });
    }
  });
  return { audio, video, webm };
}

export async function detectarTipoArchivo(f: File): Promise<TipoAdjunto | null> {
  const baseTipo = tipoDeArchivo(f);
  const ext = f.name.split(".").pop()?.toLowerCase();
  if (ext === "webm" && !f.type.startsWith("audio/")) {
    try {
      const buf = new Uint8Array(await f.slice(0, Math.min(f.size, 262144)).arrayBuffer());
      const pistas = pistasWebMDesdeBytes(buf);
      if (pistas.webm && pistas.audio && !pistas.video) return "audio";
    } catch {
      return baseTipo;
    }
  }
  return baseTipo;
}

export type RespuestaResumenBorrador = {
  estado_resumen: "listo";
  resumen: string[];
  transcripcion: string;
  borrador_resumen: BorradorResumenAplicar;
};

export const adjuntos = {
  listar: (id: number, origen?: "asignacion" | "rechazo", historialId?: number) => {
    const q = new URLSearchParams();
    if (origen && origen !== "asignacion") q.set("origen", origen);
    if (historialId) q.set("historial_id", String(historialId));
    const qs = q.toString();
    return fetchApi<AdjuntoAsignacion[]>(`${base(id)}${qs ? `?${qs}` : ""}`, { cache: "no-store" });
  },
  firma: (id: number, a: string, descarga = false) => fetchApi<{ url: string; expira_en: number }>(`${base(id)}/${a}/firma${descarga ? "?descargar=1" : ""}`, { cache: "no-store" }),
  reintentar: (id: number, a: string) => fetchApi<AdjuntoAsignacion>(`${base(id)}/${a}/reintentar`, { method: "POST" }),
  procesarResumen: (id: number, a: string) => fetchApi<AdjuntoAsignacion>(`${base(id)}/${a}/procesar-resumen`, { method: "POST" }),
  quitar: (id: number, a: string) => fetchApi<unknown>(`${admin(id)}/${a}`, { method: "DELETE" }),
  resumir: (id: number, a: string, resumir: boolean) => fetchApi<AdjuntoAsignacion>(`${admin(id)}/${a}`, json("PATCH", { resumir })),
  resumirBorrador: async (local: AdjuntoLocal): Promise<RespuestaResumenBorrador> => {
    const f = local.archivo;
    if (f.size <= PARTE_BYTES) {
      const fd = new FormData();
      fd.append("nombre", f.name);
      fd.append("tipo", local.tipo);
      fd.append("archivo", f);
      return fetchApi<RespuestaResumenBorrador>("/api/admin/adjuntos/resumen-borrador", { method: "POST", body: fd });
    }
    const borradorId = crypto.randomUUID();
    for (let offset = 0, n = 0; offset < f.size; offset += PARTE_BYTES, n++) {
      const parte = f.slice(offset, offset + PARTE_BYTES);
      await fetchApi(`/api/admin/adjuntos/borrador/${borradorId}/partes/${n}`, {
        method: "PUT",
        body: parte,
        headers: { "Content-Type": "application/octet-stream" },
      });
    }
    return fetchApi<RespuestaResumenBorrador>(`/api/admin/adjuntos/borrador/${borradorId}/resumir`, json("POST", {
      nombre: f.name,
      tipo: local.tipo,
      tamano: f.size,
    }));
  },
};

export async function subirAdjunto(
  tarea: number,
  local: AdjuntoLocal,
  progreso: (n: number) => void,
  opts?: { origen?: "asignacion" | "rechazo"; historialId?: number; inicial?: boolean },
) {
  const f = local.archivo;
  const raiz = admin(tarea);
  const r = await fetchApi<{ id: string; parte_bytes: number; listo: boolean }>(
    raiz,
    json("POST", {
      id: local.id,
      nombre: f.name,
      tamano: f.size,
      tipo: local.tipo,
      resumir: local.resumir,
      duracion_ms: local.duracion,
      ...(opts?.origen ? { origen: opts.origen } : {}),
      ...(opts?.historialId ? { historial_id: opts.historialId } : {}),
    }),
  );
  const accion = `${raiz}/${r.id}`;
  if (!r.listo) {
    for (let offset = 0, n = 0; offset < f.size; offset += r.parte_bytes, n++) {
      const parte = f.slice(offset, offset + r.parte_bytes);
      await fetchApi(`${accion}/partes/${n}`, { method: "PUT", body: parte, headers: { "Content-Type": "application/octet-stream" } });
      progreso(Math.round(Math.min(f.size, offset + parte.size) / f.size * 95));
    }
  }
  const payloadFinal: Record<string, unknown> = {};
  if (local.resumir && local.borradorResumen) payloadFinal.borrador_resumen = local.borradorResumen;
  if (opts?.inicial) payloadFinal.inicial = true;
  const cuerpoFinal = Object.keys(payloadFinal).length > 0 ? json("POST", payloadFinal) : { method: "POST" };
  const guardado = await fetchApi<AdjuntoAsignacion>(`${accion}/finalizar`, cuerpoFinal);
  // Si una respuesta se perdió y luego se cambió el interruptor, conserva la última elección.
  const final = guardado.tipo === "audio" && guardado.resumir !== local.resumir ? await adjuntos.resumir(tarea, r.id, local.resumir) : guardado;
  progreso(100);
  return final;
}
