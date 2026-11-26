import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { copiarCuerpoRIA, formatosCuerpoRIA } from "../copiar-ria";
import { leerVisualizacionRIA } from "../visualizacion-ria";

// Carga CSS Modules como nombres de clase; no usa Next, navegador ni servidor.
const cargar = createRequire(__filename);
cargar.extensions[".css"] = archivo => { archivo.exports = {}; };
const { RespuestaRIA } = cargar("../../components/RespuestaRIA") as typeof import("../../components/RespuestaRIA");
delete cargar.extensions[".css"];

function render(texto: string, props: { grupo?: boolean; transmitiendo?: boolean } = {}) {
  const html = renderToStaticMarkup(createElement(RespuestaRIA, { texto, ...props }));
  const { document } = parseHTML(`<html><body><header>Autor y hora</header>${html}<button>Copiar</button><p>Adjunto privado</p></body></html>`);
  const cuerpo = document.querySelector<HTMLElement>("[data-rc-cuerpo-ria]");
  assert.ok(cuerpo);
  return cuerpo;
}

const tabla = "| Equipo | Tareas |\n| --- | ---: |\n| A | **2** |";
const bloque = (datos: unknown) => "```ria-viz\n" + JSON.stringify(datos) + "\n```";
const visualizaciones = [
  { tipo: "flujo", pasos: ["Revisar", "Entregar"] },
  { tipo: "recta", min: -2, max: 5, puntos: [["Meta", 4], ["Inicio", 0]] },
  { tipo: "barras", datos: [["A", -2], ["B", 4]] },
  { tipo: "linea", datos: [["Enero", 2], ["Febrero", 5]] },
];

test("RIA comparte Markdown y tabla semántica en privado y grupo", () => {
  const md = "# Resumen\n\n**Dos** y `tres`\nOtra línea\n\n---\n\n> Nota\n\n4. Cuatro\n\n```text\nuno\n  dos\n```\n\n" + tabla;
  for (const grupo of [true, false]) {
    const cuerpo = render(md, { grupo });
    assert.equal(cuerpo.querySelector("h2")?.textContent, "Resumen");
    assert.equal(cuerpo.querySelector("strong")?.textContent, "Dos");
    assert.ok(cuerpo.querySelector("hr"));
    assert.ok(cuerpo.querySelector("blockquote"));
    assert.equal(cuerpo.querySelector("ol")?.getAttribute("start"), "4");
    const wrapper = cuerpo.querySelector('[role="region"]');
    assert.match(wrapper?.getAttribute("aria-label") ?? "", /Tabla/);
    assert.equal(wrapper?.getAttribute("tabindex"), "0");
    assert.equal(wrapper?.querySelector("table thead th")?.textContent, "Equipo");
    assert.equal(wrapper?.querySelector("table tbody td strong")?.textContent, "2");
    const { html, texto } = formatosCuerpoRIA(cuerpo);
    assert.match(html, /<table><thead>/);
    assert.match(texto, /Dos y tres\nOtra línea\n\n---\n\n> Nota/);
    assert.match(texto, /4\. Cuatro\n+uno\n  dos\n+Equipo\tTareas\nA\t2$/);
    assert.doesNotMatch(texto, /Autor|Copiar|Adjunto/);
  }
});

test("grupo sin enlaces; privado solo enlaces admitidos; sin HTML crudo ni cargas remotas", () => {
  const md = '[Referencia](https://ejemplo.invalid/ruta "Título") <https://otra.invalid> https://suelta.invalid [JS](javascript:alert%281%29)\n\n![Texto alternativo](https://imagen.invalid/a.png)\n\n<img src="https://imagen.invalid/b.png">\n\n<script>alert(1)</script>';
  const grupo = render(md, { grupo: true });
  const privado = render(md);
  assert.equal(grupo.querySelectorAll("a").length, 0);
  assert.deepEqual(Array.from(privado.querySelectorAll("a"), a => a.getAttribute("href")), ["https://ejemplo.invalid/ruta", "https://otra.invalid/"]);
  for (const cuerpo of [grupo, privado]) {
    assert.equal(cuerpo.querySelector("img, script, iframe, [src]"), null);
    assert.match(cuerpo.textContent ?? "", /Texto alternativo/);
    for (const formato of Object.values(formatosCuerpoRIA(cuerpo))) {
      assert.doesNotMatch(formato, /https:|\.invalid|href=|<a[ >]/);
    }
  }
});

test("flujo, recta, barras y líneas conservan pasos o datos copiables", () => {
  const cuerpo = render(visualizaciones.map(bloque).join("\n\n"));
  assert.equal(cuerpo.querySelectorAll("figure").length, 4);
  assert.equal(cuerpo.querySelectorAll("svg[aria-hidden=true]").length, 3);
  assert.equal(cuerpo.querySelectorAll("rect").length, 2);
  assert.ok(cuerpo.querySelector("polyline"));
  const { html, texto } = formatosCuerpoRIA(cuerpo);
  assert.doesNotMatch(html, /<svg|<rect|<polyline/);
  assert.match(texto, /1\. Revisar\n2\. Entregar/);
  assert.match(texto, /Intervalo: -2 a 5\n\n1\. Inicio: 0\n2\. Meta: 4/);
  assert.match(texto, /1\. A: -2\n2\. B: 4/);
  assert.match(texto, /1\. Enero: 2\n2\. Febrero: 5/);
});

test("bloque incompleto en streaming, bloque inválido y límites de datos", () => {
  const cerrado = bloque(visualizaciones[0]);
  for (const incompleto of [cerrado.slice(0, -3), cerrado.slice(0, -5), cerrado.slice(0, -2)]) {
    const cuerpo = render(incompleto, { transmitiendo: true });
    assert.equal(cuerpo.querySelector("figure"), null);
    assert.match(cuerpo.textContent ?? "", /Visualización en curso/);
  }
  assert.ok(render(cerrado, { transmitiendo: true }).querySelector("figure"));
  const mal = render(bloque({ tipo: "flujo", pasos: ["<svg onload=mal>"], codigo: "arbitrario" }));
  assert.equal(mal.querySelector("svg, figure"), null);
  assert.match(formatosCuerpoRIA(mal).texto, /Visualización no disponible.*\n+.*arbitrario/);
  for (const dato of [
    { tipo: "recta", min: 1, max: 1, puntos: [["a", 1]] },
    { tipo: "recta", min: 1, max: 2, puntos: [["a", 3]] },
    { tipo: "linea", datos: [["a", 1]] },
    { tipo: "barras", datos: [["a", 1], ["a ", 0]] },
    { tipo: "barras", datos: [["a", 1000000001]] },
    { tipo: "barras", datos: Array.from({ length: 9 }, (_, i) => [`A${i}`, i]) },
    { tipo: "flujo", pasos: Array(7).fill("a") },
    { tipo: "flujo", pasos: ["a".repeat(49)] },
  ]) assert.equal(leerVisualizacionRIA(JSON.stringify(dato)), null);
  assert.equal(leerVisualizacionRIA('{"tipo":"barras","datos":[["a",1e999]]}'), null);
});

test("copiado enriquecido, fallback de texto y fallo sin exponer datos de interfaz", async t => {
  const cuerpo = render(`${tabla}\n\n[Guía](https://preview.invalid/oculto) correo@privado.invalid localhost:3300/api token=simulado\n\nhttp**s**://separada.invalid/ruta per**sona**@equipo.invalid toque final.`);
  const original = new Map(["ClipboardItem", "navigator"].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  t.after(() => {
    for (const [k, valor] of original) {
      if (valor) Object.defineProperty(globalThis, k, valor);
      else Reflect.deleteProperty(globalThis, k);
    }
  });
  class Item {
    constructor(public blobs: Record<string, Blob>) {}
  }
  const global = (k: string, value: unknown) => Object.defineProperty(globalThis, k, { value, configurable: true });
  global("ClipboardItem", Item);
  let rich: Item | undefined;
  global("navigator", { clipboard: { write: async ([item]: Item[]) => { rich = item; } } });
  assert.equal(await copiarCuerpoRIA(cuerpo, async () => assert.fail("No debía usar el fallback")), true);
  const html = await rich?.blobs["text/html"].text();
  const texto = await rich?.blobs["text/plain"].text();
  assert.match(html ?? "", /<table>/);
  assert.match(texto ?? "", /Equipo\tTareas\nA\t2/);
  for (const formato of [html, texto]) {
    assert.doesNotMatch(formato ?? "", /correo|privado|preview|oculto|localhost|simulado|href=|separada|equipo\.invalid|persona|:\/\//);
    assert.match(formato ?? "", /toque final/);
  }
  for (const clipboard of [{ write: async () => { throw new Error("Denegado"); } }, undefined]) {
    global("navigator", { clipboard });
    assert.equal(await copiarCuerpoRIA(cuerpo, async valor => { assert.equal(valor, texto); return true; }), true);
    assert.equal(await copiarCuerpoRIA(cuerpo, async () => false), false);
  }
  assert.equal(await copiarCuerpoRIA(null, async () => assert.fail("No hay cuerpo seguro")), false);
});
