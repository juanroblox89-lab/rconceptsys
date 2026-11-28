import { test } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MAX_CARACTERES_GUION, normalizarGuion, medirGuion, cambiosDeGuion, previsualizarGuion } from "../guion-trabajo";

const extensiones = (Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions;
extensiones[".css"] = (mod) => { mod.exports = {}; };

test("el límite de guion cuenta puntos Unicode, no unidades UTF-16 ni grafemas", () => {
  const pegado = "🎬".repeat(MAX_CARACTERES_GUION);
  assert.equal(medirGuion(pegado), 20_000);
  assert.equal(medirGuion(`${pegado}⛄`), 20_001);
  assert.equal(medirGuion("a\u0301\n🎬"), 4);
});

test("normaliza solo espacios externos como Go y conserva las líneas", () => {
  assert.equal(normalizarGuion("\u0085\t Escena A \n\n  Escena B\u00a0"), "Escena A \n\n  Escena B");
  assert.equal(normalizarGuion("\uFEFFguion"), "\uFEFFguion");
});

test("PATCH omite el guion sin cambio y conserva una cadena vacía para eliminarlo", () => {
  assert.equal(JSON.stringify(cambiosDeGuion(" Guion guardado \n", "Guion guardado")), "{}");
  assert.equal(JSON.stringify(cambiosDeGuion("\t ")), "{}");
  assert.equal(JSON.stringify(cambiosDeGuion("  ", "Guion guardado")), '{"guion":""}');
  assert.deepEqual(cambiosDeGuion(" Escena 1\nEscena 2 ", "Guion guardado"), { guion: "Escena 1\nEscena 2" });
});

test("la vista previa conserva líneas y no divide pares sustitutos", () => {
  assert.equal(previsualizarGuion("Primera escena\n\nTercera escena"), "Primera escena\n\nTercera escena");
  assert.equal(previsualizarGuion("1\n2\n3\n4\n5\n6\n7"), "1\n2\n3\n4\n5\n6…");
  assert.equal(previsualizarGuion("🎬".repeat(321)), `${"🎬".repeat(320)}…`);
});

test("el bloque es accesible, no muestra guiones vacíos y escapa HTML", async () => {
  const { GuionTrabajo } = await import("../../components/GuionTrabajo");
  const render = (guion?: string) => renderToStaticMarkup(React.createElement(GuionTrabajo, { guion }));
  assert.equal(render(), "");
  assert.equal(render(" \n"), "");
  const html = render("<script>alert(1)</script>\n2\n3\n4\n5\n6\n7");
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;\n2/);
  assert.match(html, /<section[^>]+aria-labelledby=/);
  assert.match(html, /aria-expanded="false" aria-controls=/);
  assert.match(html, /Ver completo/);
  assert.match(html, /Copiar guion/);
  assert.doesNotMatch(render("Escena corta"), /Ver completo/);
});
