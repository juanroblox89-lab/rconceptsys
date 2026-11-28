import { NextRequest, NextResponse } from "next/server";

// Proxy de ejecucion hacia la API en Go (patron de Globe). En Vercel el servicio "api" llega por el
// binding BACKEND_URL, que solo existe en tiempo de ejecucion (un rewrite de next.config se evalua al
// compilar y no lo ve). En local, la API Go corre en el 8310.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const TIMEOUT_MS = 25_000;
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const SEGMENTO = /^[A-Za-z0-9_.-]{1,80}$/;
const METODOS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);

function baseUrl(): URL | null {
  let raw = process.env.BACKEND_URL;
  if (raw === undefined || raw.trim() === "") {
    if (process.env.NODE_ENV === "production") return null;
    raw = "http://localhost:8310";
  }
  try {
    return new URL(raw.endsWith("/") ? raw : `${raw}/`);
  } catch {
    return null;
  }
}

function sinCache(extra?: Record<string, string>): Headers {
  const h = new Headers({ "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" });
  if (extra) for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return h;
}

function error(status: number, codigo: string, mensaje: string): NextResponse {
  return NextResponse.json({ error: { codigo, mensaje } }, { status, headers: sinCache() });
}

async function reenviar(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  const esMedioApariencia = path.length === 4 && path[0] === "yo" && path[1] === "apariencia" && path[2] === "fondo";
  const esMedioChat = path.length === 4 && path[0] === "chat" && path[1] === "adjuntos" && path[3] === "archivo";
  if (!METODOS.has(req.method) || (req.method === "HEAD" && !esMedioApariencia && !esMedioChat)) return error(405, "metodo_no_permitido", "Esa acción no está permitida.");
  const esParteAdjunto = req.method === "PUT" && path.length === 7 && path[0] === "admin" && path[1] === "tareas" && path[3] === "adjuntos" && path[5] === "partes";
  if (path.length === 0 || (!esParteAdjunto && path.length > 6) || !path.every((s) => SEGMENTO.test(s) && s !== "." && s !== "..")) {
    return error(404, "no_encontrado", "No encontramos lo que buscas.");
  }

  const base = baseUrl();
  if (base === null) {
    return error(503, "sin_servicio", "El servicio no está disponible ahora. Inténtalo de nuevo en un momento.");
  }

  const destino = new URL(`api/${path.join("/")}`, base);
  destino.search = new URL(req.url).search;

  const cabeceras = new Headers();
  for (const nombre of ["content-type", "authorization", "cookie", "accept", "x-demo-user", "range", "if-range"]) {
    const v = req.headers.get(nombre);
    if (v !== null) cabeceras.set(nombre, v);
  }
  // IP real del visitante para los limites de intentos del backend.
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) cabeceras.set("x-forwarded-for", ip);
  // No copiar X-Forwarded-Host del cliente; Next ya resolvió la URL pública.
  const hostPublico = req.headers.get("host") ?? req.nextUrl.host;
  if (/^[a-z0-9]+(?:[.-][a-z0-9]+)*(?::[0-9]{1,5})?$/i.test(hostPublico)) {
    cabeceras.set("x-forwarded-host", hostPublico);
    cabeceras.set("x-forwarded-proto", /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(hostPublico) ? req.nextUrl.protocol.slice(0, -1) : "https");
  }

  const esRIA = req.method === "POST" && (path.join("/") === "ria" || path.join("/") === "chat/ria");
  const controlador = new AbortController();
  const esFinalizarAdjunto = req.method === "POST" && path.length === 6 && path[0] === "admin" && path[1] === "tareas" && path[3] === "adjuntos" && path[5] === "finalizar";
  const esResumenAdjunto = req.method === "POST" && (
    (path.length === 5 && path[0] === "tareas" && path[2] === "adjuntos" && path[4] === "procesar-resumen") ||
    (path.length === 3 && path[0] === "admin" && path[1] === "adjuntos" && path[2] === "resumen-borrador") ||
    (path.length === 5 && path[0] === "admin" && path[1] === "adjuntos" && path[2] === "borrador" && path[4] === "resumir")
  );
  const esCronAdjuntos = req.method === "GET" && path.join("/") === "cron/adjuntos";
  const temporizador = setTimeout(() => controlador.abort(), esCronAdjuntos ? 108_000 : (esFinalizarAdjunto || esResumenAdjunto) ? 92_000 : esRIA ? 75_000 : TIMEOUT_MS);
  try {
    let cuerpo: ArrayBuffer | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const esArchivoChat = req.method === "POST" && path.join("/") === "chat/adjuntos" && req.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;");
      // Mismo máximo que Go para multipart del chat; las demás rutas conservan su tope.
      const maximo = esArchivoChat ? 20 * 1024 * 1024 + 64 * 1024 : MAX_BODY_BYTES;
      if (Number(req.headers.get("content-length")) > maximo) return error(413, "demasiado_grande", "El archivo o el mensaje es demasiado grande.");
      const lector = req.body?.getReader();
      if (lector) {
        const trozos: Uint8Array[] = [];
        let longitud = 0;
        while (true) {
          const { done, value } = await lector.read();
          if (done) break;
          longitud += value.byteLength;
          if (longitud > maximo) {
            void lector.cancel().catch(() => {});
            return error(413, "demasiado_grande", "El archivo o el mensaje es demasiado grande.");
          }
          trozos.push(value);
        }
        const bytes = new Uint8Array(longitud);
        let offset = 0;
        for (const trozo of trozos) { bytes.set(trozo, offset); offset += trozo.byteLength; }
        cuerpo = bytes.buffer;
      }
    }
    const res = await fetch(destino, { method: req.method, headers: cabeceras, body: cuerpo, signal: controlador.signal, redirect: "manual" });

    const salida = sinCache();
    const tipo = res.headers.get("content-type");
    if (tipo !== null) salida.set("Content-Type", tipo);
    if (esMedioApariencia || esMedioChat) {
      for (const nombre of ["accept-ranges", "content-range", "content-length", "content-disposition", "x-content-type-options"]) {
        const v = res.headers.get(nombre);
        if (v !== null) salida.set(nombre, v);
      }
    }
    // Cada cookie de sesion del backend debe llegar al navegador como cabecera Set-Cookie propia.
    for (const c of res.headers.getSetCookie()) salida.append("Set-Cookie", c);

    if (req.method === "GET" && path.join("/") === "drive/callback" && res.status === 302) {
      const location = res.headers.get("location");
      if (location && /^\/admin\?drive=[a-z_]+$/.test(location)) {
        salida.set("Location", location);
        return new Response(null, { status: 302, headers: salida });
      }
      return error(502, "retorno_invalido", "No pudimos volver a Gestión desde Google Drive.");
    }
    if (req.method === "HEAD" || res.status === 204 || res.status === 304) return new Response(null, { status: res.status, headers: salida });
    if (esRIA && tipo?.startsWith("text/event-stream") && res.body) {
      salida.set("Cache-Control", "no-cache, no-transform");
      salida.set("X-Accel-Buffering", "no");
      return new Response(res.body, { status: res.status, headers: salida });
    }
    return new Response(await res.arrayBuffer(), { status: res.status, headers: salida });
  } catch {
    return error(503, "sin_servicio", "El servicio no responde ahora. Inténtalo de nuevo en un momento.");
  } finally {
    clearTimeout(temporizador);
  }
}

export const GET = reenviar;
export const HEAD = reenviar;
export const POST = reenviar;
export const PUT = reenviar;
export const PATCH = reenviar;
export const DELETE = reenviar;
