import { NextResponse, type NextRequest } from "next/server";

const TIMEOUT_MS = 25000;
const MAX_BODY_BYTES = 256 * 1024; // F0: formularios chicos (acceso/oficios/motivo).

const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lista blanca F0 (contrato backend):
 * - me, health, usuarios, actividad (un segmento)
 * - usuarios/:uuid (PATCH), usuarios/:uuid/aprobar|desactivar (POST)
 */
function destFor(path: string[]): string | null {
  if (path.length === 1 && (path[0] === "me" || path[0] === "health" || path[0] === "usuarios" || path[0] === "actividad")) {
    return path[0];
  }
  if (
    (path.length === 2 && path[0] === "usuarios" && UUID.test(path[1] ?? "")) ||
    (path.length === 3 &&
      path[0] === "usuarios" &&
      UUID.test(path[1] ?? "") &&
      (path[2] === "aprobar" || path[2] === "desactivar"))
  ) {
    return path.join("/");
  }
  return null;
}

function baseUrl(): URL | null {
  const raw = process.env.BACKEND_URL ?? "http://localhost:8095";
  if (raw.trim() === "") return null;
  const normalized = raw.endsWith("/") ? raw : `${raw}/`;
  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

async function proxyTo(req: NextRequest, dest: string) {
  const base = baseUrl();
  if (base === null) {
    return NextResponse.json({ error: "Sin servicio, probá de nuevo" }, { status: 503 });
  }
  const target = new URL(dest, base);
  const query = req.nextUrl.searchParams.toString();
  if (query !== "") target.search = query;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType !== null) headers.set("Content-Type", contentType);
  const authorization = req.headers.get("authorization");
  if (authorization !== null) headers.set("Authorization", authorization);
  const demoUser = req.headers.get("x-demo-user");
  if (demoUser !== null) headers.set("X-Demo-User", demoUser);
  // Nunca reenviar cookie ni host del navegador.
  const internalSecret = process.env.RC_INTERNAL_SECRET;
  if (internalSecret !== undefined && internalSecret !== "") {
    headers.set("X-RC-Internal", internalSecret);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let body: ArrayBuffer | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      body = await req.arrayBuffer();
      if (body.byteLength > MAX_BODY_BYTES) {
        return NextResponse.json({ error: "Cuerpo demasiado grande" }, { status: 413 });
      }
    }
    const res = await fetch(target, {
      method: req.method,
      headers,
      body,
      signal: controller.signal,
    });
    if (res.status === 204 || res.status === 304) {
      return new Response(null, { status: res.status });
    }
    const text = await res.text();
    const resContentType = res.headers.get("content-type") ?? "";
    if (!resContentType.includes("application/json")) {
      return new Response(text, {
        status: res.status,
        headers: {
          "Content-Type": resContentType === "" ? "text/plain; charset=utf-8" : resContentType,
          "Cache-Control": "private, no-store",
          "Vary": "Authorization",
        },
      });
    }
    let data: unknown = text;
    try {
      data = text === "" ? null : JSON.parse(text);
    } catch {
      // Respuesta no JSON: devolver el texto tal cual.
    }
    const jsonRes = NextResponse.json(data, { status: res.status });
    jsonRes.headers.set("Cache-Control", "private, no-store");
    jsonRes.headers.set("Vary", "Authorization");
    return jsonRes;
  } catch {
    return NextResponse.json({ error: "Sin servicio, probá de nuevo" }, { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!ALLOWED_METHODS.has(req.method)) {
    return NextResponse.json({ error: `método ${req.method} no permitido` }, { status: 405 });
  }
  const dest = destFor(path ?? []);
  if (dest === null) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return proxyTo(req, dest);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
