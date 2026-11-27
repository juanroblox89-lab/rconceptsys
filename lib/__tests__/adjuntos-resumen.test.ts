import { test } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  adjuntos,
  bytesPorMBAdjunto,
  detectarTipoArchivo,
  pesoAdjunto,
  pistasWebMDesdeBytes,
  subirAdjunto,
  tipoDeArchivo,
  validarPesoAdjunto,
  type AdjuntoLocal,
} from "../adjuntos-asignacion";

const cssProxy = new Proxy({}, { get: (_t, prop) => String(prop) });
const moduleConExtensiones = Module as unknown as {
  _extensions: Record<string, (m: { exports: unknown }) => void>;
};
moduleConExtensiones._extensions[".css"] = (mod) => {
  mod.exports = { __esModule: true, default: cssProxy };
};

function ebmlElem(idBytes: number[], payload: Uint8Array, indef = false): Uint8Array {
  const lenBytes = indef
    ? [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]
    : payload.length < 0x7f
      ? [0x80 | payload.length]
      : [0x40 | (payload.length >> 8), payload.length & 0xff];
  const out = new Uint8Array(idBytes.length + lenBytes.length + payload.length);
  out.set(idBytes, 0);
  out.set(lenBytes, idBytes.length);
  out.set(payload, idBytes.length + lenBytes.length);
  return out;
}

function concatBytes(...arr: Uint8Array[]): Uint8Array {
  const total = arr.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arr) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function crearWebMSintetico(trackType: 1 | 2): Uint8Array {
  const docType = ebmlElem([0x42, 0x82], new TextEncoder().encode("webm"));
  const header = ebmlElem([0x1a, 0x45, 0xdf, 0xa3], docType);
  const track = ebmlElem([0xae], ebmlElem([0x83], new Uint8Array([trackType])));
  const tracks = ebmlElem([0x16, 0x54, 0xae, 0x6b], track);
  const segment = ebmlElem([0x18, 0x53, 0x80, 0x67], tracks, true);
  return concatBytes(header, segment);
}

test("detectarTipoArchivo reconoce audio WebM aunque el navegador reporte video/webm o vacío", async () => {
  const webmAudio = crearWebMSintetico(2);
  const webmVideo = crearWebMSintetico(1);

  assert.deepEqual(pistasWebMDesdeBytes(webmAudio), { audio: true, video: false, webm: true });
  assert.deepEqual(pistasWebMDesdeBytes(webmVideo), { audio: false, video: true, webm: true });

  const fComoVideoMime = new File([webmAudio as BlobPart], "nota.webm", { type: "video/webm" });
  assert.equal(tipoDeArchivo(fComoVideoMime), "video");
  assert.equal(await detectarTipoArchivo(fComoVideoMime), "audio");

  const fSinMime = new File([webmAudio as BlobPart], "nota.webm", { type: "" });
  assert.equal(await detectarTipoArchivo(fSinMime), "audio");

  const fVideo = new File([webmVideo as BlobPart], "corte.webm", { type: "video/webm" });
  assert.equal(await detectarTipoArchivo(fVideo), "video");
});

test("resumirBorrador envía directo <=2 MiB y por partes >2 MiB, y subirAdjunto reutiliza borrador_resumen", async () => {
  const originalFetch = globalThis.fetch;
  const llamadas: { url: string; method: string; bodyTexto?: string }[] = [];
  const tokenEsperado = {
    resumen: ["Uno.", "Dos.", "Tres."],
    transcripcion: "Uno dos tres.",
    proveedor: "9router",
    token: "firma-borrador-123",
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    let bodyTexto: string | undefined;
    if (typeof init?.body === "string") bodyTexto = init.body;
    llamadas.push({ url, method, bodyTexto });
    if (url.endsWith("/partes/0") || url.endsWith("/partes/1")) {
      return new Response(null, { status: 204 });
    }
    if (url === "/api/admin/adjuntos/resumen-borrador" || url.endsWith("/resumir")) {
      return new Response(JSON.stringify({
        estado_resumen: "listo",
        resumen: tokenEsperado.resumen,
        transcripcion: tokenEsperado.transcripcion,
        borrador_resumen: tokenEsperado,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url === "/api/admin/tareas/7/adjuntos" && method === "POST") {
      return new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", parte_bytes: 2 * 1024 * 1024, listo: false }), { status: 200 });
    }
    if (url.endsWith("/finalizar")) {
      return new Response(JSON.stringify({
        id: "11111111-1111-4111-8111-111111111111",
        nombre: "nota.webm",
        tipo: "audio",
        mime: "audio/webm",
        tamano: 100,
        resumir: true,
        estado_resumen: "listo",
        resumen: tokenEsperado.resumen,
        transcripcion: tokenEsperado.transcripcion,
      }), { status: 201 });
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    const chico = new File([crearWebMSintetico(2) as BlobPart], "nota.webm", { type: "audio/webm" });
    const localChico: AdjuntoLocal = { id: "11111111-1111-4111-8111-111111111111", archivo: chico, tipo: "audio", resumir: true };
    const r1 = await adjuntos.resumirBorrador(localChico);
    assert.equal(r1.estado_resumen, "listo");
    assert.equal(llamadas[0]?.url, "/api/admin/adjuntos/resumen-borrador");

    localChico.borradorResumen = r1.borrador_resumen;
    const fin = await subirAdjunto(7, localChico, () => {});
    assert.equal(fin.estado_resumen, "listo");
    const callFin = llamadas.find((l) => l.url.endsWith("/finalizar"));
    assert.ok(callFin?.bodyTexto?.includes("firma-borrador-123"));

    llamadas.length = 0;
    const grandeBytes = new Uint8Array(2 * 1024 * 1024 + 512);
    grandeBytes.set(crearWebMSintetico(2), 0);
    const grande = new File([grandeBytes as BlobPart], "largo.webm", { type: "audio/webm" });
    const r2 = await adjuntos.resumirBorrador({ id: "22222222-2222-4222-8222-222222222222", archivo: grande, tipo: "audio", resumir: true });
    assert.equal(r2.estado_resumen, "listo");
    assert.ok(llamadas.some((l) => l.url.includes("/borrador/") && l.url.endsWith("/partes/0")));
    assert.ok(llamadas.some((l) => l.url.includes("/borrador/") && l.url.endsWith("/partes/1")));
    assert.ok(llamadas.some((l) => l.url.includes("/borrador/") && l.url.endsWith("/resumir")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("EditorAdjuntos muestra estados de borrador: Resumiendo, Listo con viñetas y error legible con Reintentar", async () => {
  const { EditorAdjuntos } = await import("../../components/AdjuntosAsignacion");
  const webm = new File([crearWebMSintetico(2) as BlobPart], "voz.webm", { type: "audio/webm" });

  const locales: AdjuntoLocal[] = [
    { id: "a1", archivo: webm, tipo: "audio", resumir: true, estadoResumen: "procesando" },
    {
      id: "a2",
      archivo: webm,
      tipo: "audio",
      resumir: true,
      estadoResumen: "listo",
      resumen: ["Ordenar clips.", "Revisar audio.", "Entregar viernes."],
      transcripcion: "Ordenar los clips y entregar el viernes.",
    },
    {
      id: "a3",
      archivo: webm,
      tipo: "audio",
      resumir: true,
      estadoResumen: "fallido",
      errorResumen: "No se escuchó voz clara en el audio para resumir.",
    },
  ];

  const html = renderToStaticMarkup(
    React.createElement(EditorAdjuntos, {
      locales,
      cambiar: () => {},
      quitar: () => {},
      cantidad: 3,
      bloqueado: false,
      onGrabando: () => {},
    }),
  );

  assert.ok(html.includes("Resumiendo…"));
  assert.ok(html.includes("Listo"));
  assert.ok(html.includes("Ordenar clips."));
  assert.ok(html.includes("Transcripción"));
  assert.ok(html.includes("No se pudo"));
  assert.ok(html.includes("No se escuchó voz clara en el audio para resumir."));
  assert.ok(html.includes("Reintentar"));
});

test("validarPesoAdjunto y pesoAdjunto muestran límites reales por tipo y contador X / Y MB", async () => {
  assert.equal(validarPesoAdjunto(0, "imagen"), "La imagen está vacía.");
  assert.equal(validarPesoAdjunto(0, "audio"), "El audio está vacío.");
  assert.equal(validarPesoAdjunto(0, "video"), "El video está vacío.");
  assert.equal(validarPesoAdjunto(10 * bytesPorMBAdjunto + 1, "imagen"), "La imagen supera el límite de 10 MB.");
  assert.equal(validarPesoAdjunto(25 * bytesPorMBAdjunto + 1, "audio"), "El audio supera el límite de 25 MB.");
  assert.equal(validarPesoAdjunto(50 * bytesPorMBAdjunto + 1, "video"), "El video supera el límite de 50 MB.");
  assert.equal(validarPesoAdjunto(24 * bytesPorMBAdjunto, "audio"), null);
  assert.equal(validarPesoAdjunto(49 * bytesPorMBAdjunto, "video"), null);

  assert.equal(pesoAdjunto(Math.round(2.4 * bytesPorMBAdjunto), "audio"), "2,4 / 25 MB");
  assert.equal(pesoAdjunto(Math.round(1.2 * bytesPorMBAdjunto), "imagen"), "1,2 / 10 MB");
  assert.equal(pesoAdjunto(Math.round(14.5 * bytesPorMBAdjunto), "video"), "14,5 / 50 MB");
  assert.equal(pesoAdjunto(1024, "audio"), "< 0,1 / 25 MB");

  const { AdjuntosRechazoVista } = await import("../../components/AdjuntosAsignacion");
  const html = renderToStaticMarkup(
    React.createElement(AdjuntosRechazoVista, {
      tarea: 20,
      items: [
        {
          id: "aud-1",
          tipo: "audio",
          nombre: "correccion.webm",
          mime: "audio/webm",
          tamano: Math.round(2.4 * bytesPorMBAdjunto),
          resumir: true,
          estado_resumen: "listo",
          resumen: ["Recortar inicio.", "Subir música."],
          transcripcion: "Recortar el inicio y subir música.",
        },
      ],
    }),
  );
  assert.ok(html.includes("2,4 / 25 MB"));
  assert.ok(html.includes("Recortar inicio."));
  assert.ok(html.includes("Transcripción"));
});
