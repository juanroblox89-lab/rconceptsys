import { NextResponse, type NextRequest } from "next/server";

const TIMEOUT_MS = 25000;
// F5: el chat del asistente espera al modelo (timeout Go 30 s) → 45 s.
const TIMEOUT_ASISTENTE_MS = 45000;
const MAX_BODY_BYTES = 768 * 1024; // F4: fotos base64 (~500 KB + overhead JSON).

const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH", "DELETE"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lista blanca F0 (contrato backend):
 * - me, health, usuarios, actividad (un segmento)
 * - usuarios/:uuid (PATCH), usuarios/:uuid/aprobar|desactivar (POST)
 *
 * Lista blanca F1 (producción: clientes, piezas, tareas, notificaciones):
 * - clientes, piezas, tareas, notificaciones (GET lista / POST crear)
 * - clientes/:uuid (GET/PATCH), piezas/:uuid (GET/PATCH), tareas/:uuid (GET/PATCH)
 * - clientes/:uuid/archivar (POST), piezas/:uuid/cancelar (POST)
 * - tareas/:uuid/empezar|entregar|aprobar|devolver (POST)
 * - tareas/:uuid/eventos (GET), notificaciones/:uuid/leer (POST)
 *
 * Lista blanca F2 (cobros: tarifas, paquetes, config, líneas, cortes):
 * - tarifas (GET/POST), paquetes (GET/POST), paquetes/:uuid (PATCH)
 * - config-cobros (GET/PATCH)
 * - lineas (GET), lineas/ajuste (POST), lineas/:uuid (GET)
 * - lineas/:uuid/confirmar|reclamar|aprobar|devolver (POST)
 * - cortes (GET), cortes/actual (GET), cortes/mios (GET), cortes/cerrar (POST)
 * - cortes/:periodo (GET), cortes/:periodo/csv (GET),
 *   cortes/:periodo/pagar|revertir (POST)
 * - comisiones/mensual (POST), tareas/:uuid/decision (POST)
 *
 * Lista blanca F4 (ventas: leads, visitas, métricas):
 * - leads, visitas (GET lista / POST crear)
 * - leads/:uuid (GET/PATCH), visitas/:uuid (GET)
 * - leads/:uuid/mover|reasignar|ganar (POST), leads/:uuid/eventos|visitas (GET)
 * - visitas/:uuid/fotos (GET/POST)
 * - ventas/metricas (GET)
 *
 * Lista blanca F5 (asistente + métricas):
 * - asistente/chat (POST), asistente/conversaciones (GET)
 * - asistente/conversaciones/:uuid (GET)
 * - metricas (GET, solo admin/dueño — lo impone Go)
 */
function destFor(path: string[]): string | null {
  if (path.length === 1 && (path[0] === "me" || path[0] === "health" || path[0] === "usuarios" || path[0] === "actividad")) {
    return path[0];
  }
  // F5: asistente (chat POST, conversaciones GET) y métricas (GET).
  if (path.length === 2 && path[0] === "asistente" && (path[1] === "chat" || path[1] === "conversaciones")) {
    return path.join("/");
  }
  if (
    path.length === 3 &&
    path[0] === "asistente" &&
    path[1] === "conversaciones" &&
    UUID.test(path[2] ?? "")
  ) {
    return path.join("/");
  }
  if (path.length === 1 && path[0] === "metricas") {
    return path[0];
  }
  if (
    path.length === 1 &&
    (path[0] === "clientes" || path[0] === "piezas" || path[0] === "tareas" || path[0] === "notificaciones")
  ) {
    return path[0];
  }
  // F2: recursos de cobros de un segmento (tarifas, paquetes, lineas, cortes)
  // y config-cobros (con guion, no uuid).
  if (
    path.length === 1 &&
    (path[0] === "tarifas" ||
      path[0] === "paquetes" ||
      path[0] === "lineas" ||
      path[0] === "cortes" ||
      path[0] === "config-cobros")
  ) {
    return path[0];
  }
  // F2: cortes/actual, cortes/mios, cortes/cerrar, lineas/ajuste, comisiones/mensual.
  if (
    path.length === 2 &&
    ((path[0] === "cortes" && (path[1] === "actual" || path[1] === "mios" || path[1] === "cerrar")) ||
      (path[0] === "lineas" && path[1] === "ajuste") ||
      (path[0] === "comisiones" && path[1] === "mensual"))
  ) {
    return path.join("/");
  }
  // F3: recursos de biblioteca de un segmento (listas + crear).
  // F4: leads + visitas (listas + crear) y metricas de ventas.
  if (
    path.length === 1 &&
    (path[0] === "formatos" ||
      path[0] === "hooks" ||
      path[0] === "referencias" ||
      path[0] === "sops" ||
      path[0] === "sop-ejecuciones" ||
      path[0] === "leads" ||
      path[0] === "visitas")
  ) {
    return path[0];
  }
  if (path.length === 2 && path[0] === "ventas" && path[1] === "metricas") {
    return path.join("/");
  }
  if (
    path.length === 1 &&
    (path[0] === "formatos" ||
      path[0] === "hooks" ||
      path[0] === "referencias" ||
      path[0] === "sops" ||
      path[0] === "sop-ejecuciones")
  ) {
    // Duplicado defensivo (ya cubierto por el bloque F3+F4 de arriba).
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
  // F1: recurso/:uuid (clientes, piezas, tareas).
  if (
    path.length === 2 &&
    (path[0] === "clientes" || path[0] === "piezas" || path[0] === "tareas") &&
    UUID.test(path[1] ?? "")
  ) {
    return path.join("/");
  }
  // F2: lineas/:uuid (GET) y paquetes/:uuid (PATCH).
  if (
    path.length === 2 &&
    (path[0] === "lineas" || path[0] === "paquetes") &&
    UUID.test(path[1] ?? "")
  ) {
    return path.join("/");
  }
  // F3: biblioteca/:uuid (GET/PATCH) — formatos, hooks, referencias, sops,
  // sop-pasos (PATCH) y sop-ejecuciones/:uuid (GET).
  // F4: leads/:uuid (GET/PATCH) y visitas/:uuid (GET).
  if (
    path.length === 2 &&
    (path[0] === "formatos" ||
      path[0] === "hooks" ||
      path[0] === "referencias" ||
      path[0] === "sops" ||
      path[0] === "sop-pasos" ||
      path[0] === "sop-ejecuciones" ||
      path[0] === "leads" ||
      path[0] === "visitas") &&
    UUID.test(path[1] ?? "")
  ) {
    return path.join("/");
  }
  // F3: publicar|rechazar|archivar (POST) sobre contenido.
  if (
    path.length === 3 &&
    (path[0] === "formatos" || path[0] === "hooks" || path[0] === "referencias" || path[0] === "sops") &&
    UUID.test(path[1] ?? "") &&
    (path[2] === "publicar" || path[2] === "rechazar" || path[2] === "archivar")
  ) {
    return path.join("/");
  }
  // F3: pasos de SOP (GET lista / POST crear) y terminar ejecución (POST).
  if (
    path.length === 3 &&
    UUID.test(path[1] ?? "") &&
    ((path[0] === "sops" && path[2] === "pasos") ||
      (path[0] === "sop-ejecuciones" && (path[2] === "pasos" || path[2] === "terminar")))
  ) {
    return path.join("/");
  }
  // F3: desmarcar paso (DELETE).
  if (
    path.length === 4 &&
    path[0] === "sop-ejecuciones" &&
    UUID.test(path[1] ?? "") &&
    path[2] === "pasos" &&
    UUID.test(path[3] ?? "")
  ) {
    return path.join("/");
  }
  // F2: cortes/:periodo (GET) y cortes/:periodo/csv (GET), donde periodo es
  // YYYY-MM (no uuid).
  const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (path.length === 2 && path[0] === "cortes" && PERIODO.test(path[1] ?? "")) {
    return path.join("/");
  }
  if (
    path.length === 3 &&
    path[0] === "cortes" &&
    PERIODO.test(path[1] ?? "") &&
    (path[2] === "csv" || path[2] === "pagar" || path[2] === "revertir")
  ) {
    return path.join("/");
  }
  // F1: acciones POST sobre un recurso.
  if (
    path.length === 3 &&
    UUID.test(path[1] ?? "") &&
    ((path[0] === "clientes" && path[2] === "archivar") ||
      (path[0] === "piezas" && path[2] === "cancelar") ||
      (path[0] === "tareas" &&
        (path[2] === "empezar" ||
          path[2] === "entregar" ||
          path[2] === "aprobar" ||
          path[2] === "devolver" ||
          path[2] === "decision")) ||
      (path[0] === "tareas" && path[2] === "eventos") ||
      (path[0] === "notificaciones" && path[2] === "leer") ||
      // F2: acciones sobre líneas.
      (path[0] === "lineas" &&
        (path[2] === "confirmar" ||
          path[2] === "reclamar" ||
          path[2] === "aprobar" ||
          path[2] === "devolver")) ||
      // F4: mover|reasignar|ganar sobre leads; eventos y visitas del lead.
      (path[0] === "leads" &&
        (path[2] === "mover" ||
          path[2] === "reasignar" ||
          path[2] === "ganar" ||
          path[2] === "eventos" ||
          path[2] === "visitas")) ||
      // F4: fotos de visita (GET lista / POST subir).
      (path[0] === "visitas" && path[2] === "fotos"))
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
  // S2: X-Demo-User solo en local sin Supabase. Con auth real configurada
  // (o en build de producción) nunca se reenvía: evita suplantación si el
  // backend alguna vez aceptara demo en otro entorno.
  const demoUser = req.headers.get("x-demo-user");
  if (demoUser !== null && process.env.NEXT_PUBLIC_SUPABASE_URL === undefined) {
    headers.set("X-Demo-User", demoUser);
  }
  // Nunca reenviar cookie ni host del navegador.
  const internalSecret = process.env.RC_INTERNAL_SECRET;
  if (internalSecret !== undefined && internalSecret !== "") {
    headers.set("X-RC-Internal", internalSecret);
  }

  const controller = new AbortController();
  const esAsistente = dest === "asistente/chat";
  const timer = setTimeout(
    () => controller.abort(),
    esAsistente ? TIMEOUT_ASISTENTE_MS : TIMEOUT_MS,
  );
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
export const DELETE = handle;
