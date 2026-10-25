import { NextRequest, NextResponse } from "next/server";

// Proxy de ejecucion hacia la API en Go (patron de Globe). En Vercel el servicio "api" llega por el
// binding BACKEND_URL, que solo existe en tiempo de ejecucion (un rewrite de next.config se evalua al
// compilar y no lo ve). En local, la API Go corre en el 8310.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TIMEOUT_MS = 25_000;
const MAX_BODY_BYTES = 3 * 1024 * 1024; // la foto de perfil pesa como maximo 1 MB; sobra margen
const SEGMENTO = /^[A-Za-z0-9_.-]{1,80}$/;
const METODOS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

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
  if (!METODOS.has(req.method)) return error(405, "metodo_no_permitido", "Esa acción no está permitida.");
  if (path.length === 0 || path.length > 6 || !path.every((s) => SEGMENTO.test(s) && s !== "." && s !== "..")) {
    return error(404, "no_encontrado", "No encontramos lo que buscas.");
  }

  const base = baseUrl();
  if (base === null) {
    return error(503, "sin_servicio", "El servicio no está disponible ahora. Inténtalo de nuevo en un momento.");
  }

  const destino = new URL(`api/${path.join("/")}`, base);
  destino.search = new URL(req.url).search;

  const cabeceras = new Headers();
  for (const nombre of ["content-type", "authorization", "cookie", "accept", "x-demo-user"]) {
    const v = req.headers.get(nombre);
    if (v !== null) cabeceras.set(nombre, v);
  }
  // IP real del visitante para los limites de intentos del backend.
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) cabeceras.set("x-forwarded-for", ip);

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    let cuerpo: ArrayBuffer | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      cuerpo = await req.arrayBuffer();
      if (cuerpo.byteLength > MAX_BODY_BYTES) return error(413, "demasiado_grande", "El archivo o el mensaje es demasiado grande.");
    }
    const res = await fetch(destino, { method: req.method, headers: cabeceras, body: cuerpo, signal: controlador.signal, redirect: "manual" });

    const salida = sinCache();
    const tipo = res.headers.get("content-type");
    if (tipo !== null) salida.set("Content-Type", tipo);
    // Cada cookie de sesion del backend debe llegar al navegador como cabecera Set-Cookie propia.
    for (const c of res.headers.getSetCookie()) salida.append("Set-Cookie", c);

    if (res.status === 204 || res.status === 304) return new Response(null, { status: res.status, headers: salida });
    return new Response(await res.arrayBuffer(), { status: res.status, headers: salida });
  } catch {
    return error(503, "sin_servicio", "El servicio no responde ahora. Inténtalo de nuevo en un momento.");
  } finally {
    clearTimeout(temporizador);
  }
}

export const GET = reenviar;
export const POST = reenviar;
export const PUT = reenviar;
export const PATCH = reenviar;
export const DELETE = reenviar;
