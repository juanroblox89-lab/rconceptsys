import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { setTimeout as esperar } from "node:timers/promises";
import { chromium } from "playwright";

// Directorio Next aislado y ya compilado (sin archivos de entorno). No se inicia Go.
const carpeta = process.argv[2];
assert.ok(carpeta, "Uso: node scripts/qa-guion.mjs <copia-aislada-compilada> [carpeta-capturas]");
const out = resolve(process.argv[3] ?? "_qa-guion");
mkdirSync(out, { recursive: true });
const base = "http://127.0.0.1:3349";
const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const comprobarPuerto = createServer();
comprobarPuerto.listen(3349, "127.0.0.1");
await once(comprobarPuerto, "listening");
await new Promise((done, fail) => comprobarPuerto.close(e => e ? fail(e) : done()));
const server = spawn(process.execPath, [nextBin, "start", resolve(carpeta), "-p", "3349", "-H", "127.0.0.1"], {
  cwd: resolve(carpeta), windowsHide: true, stdio: "inherit",
  env: {
    ...Object.fromEntries(["PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "SYSTEMDRIVE", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA"].map(k => [k, process.env[k]]).filter(([, v]) => v !== undefined)),
    BACKEND_URL: "http://127.0.0.1:1", NEXT_TELEMETRY_DISABLED: "1",
  },
});
const salida = once(server, "exit");
console.log(`Servidor Next oculto: PID ${server.pid} en ${base}`);

const roles = [{ id: 2, clave: "editor", nombre: "Editor", activo: true, orden: 1 }];
const admin = { id: "admin-qa", nombre: "Admin QA", estado: "aprobado", es_admin: true, roles: [] };
const editor = { id: "editor-qa", nombre: "Lina Editor", estado: "aprobado", es_admin: false, roles };
const tipo = { id: 2, nombre: "Edición de video", rol_id: 2, activo: true, precio: 40000, unidad: "trabajo" };
const guion = [
  "ESCENA 1 · Apertura", "Plano detalle del producto sobre fondo claro.", "Locución: «Todo comienza con una idea».",
  "Pantalla: <inicio> · música suave.", "ESCENA 2 · Demostración", "Usa el plano cenital para mostrar el proceso.",
  "ESCENA 3 · Cierre", "Añade el logo y deja dos segundos antes del fundido.",
  "Referencia interna sin espacios: " + "PlanoDetalle".repeat(12), "FIN DEL GUION",
].join("\n");
const demo = {
  id: 10, titulo: "Reel de lanzamiento", descripcion: "Edición vertical 9:16. Exporta en 1080p con subtítulos.",
  tipo_id: 2, tipo, asignado_a: editor.id, asignado: editor, creado_por: admin.id, creador: admin, estado: "pendiente",
  creada_en: "2026-11-01T18:00:00Z", fecha_limite: "2099-12-05", guion, drive_referencias: [],
};
const temas = [
  { modo: "claro", tema: "rconcept", colorScheme: "light", slug: "claro" },
  { modo: "oscuro", tema: "rconcept-dark", colorScheme: "dark", slug: "oscuro" },
  { modo: "oscuro", tema: "glass", colorScheme: "dark", slug: "glass", imagen: "qa.svg" },
];
const pared = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700"><defs><linearGradient id="g"><stop stop-color="#132435"/><stop offset="1" stop-color="#374d66"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>';
const mediciones = [];

try {
  for (let i = 0; ; i++) {
    if (server.exitCode !== null || i === 80) throw new Error("No arrancó el servidor QA de Next");
    const r = await fetch(`${base}/login`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
    if (r?.ok) break;
    await esperar(400);
  }
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-background-networking", "--disable-gpu", "--renderer-process-limit=2"] });
  try {
    for (const width of [375, 1280]) for (const apariencia of temas) {
      const slug = `${width}-${apariencia.slug}`;
      let perfil = admin;
      let actual = { ...demo };
      const creaciones = [], cambios = [], errores = [];
      const ctx = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 800 }, colorScheme: apariencia.colorScheme, reducedMotion: "reduce", serviceWorkers: "block" });
      try {
        await ctx.addCookies([{ name: "rc_access_token", value: "qa-sintetico", url: base }]);
        await ctx.addInitScript(() => {
          Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
            writeText: async (texto) => { window.__copiado = texto; },
          } });
        });
        await ctx.route("**/*", route => {
          const req = route.request();
          const url = new URL(req.url());
          if (url.origin !== base) return route.abort();
          const p = url.pathname;
          if (!p.startsWith("/api/")) return route.continue();
          const ok = (json, status = 200) => route.fulfill({ json, status });
          if (p === "/api/yo") return ok(perfil);
          if (p === "/api/yo/celular") return ok({ celular: "+573001112233" });
          if (p === "/api/yo/apariencia") return ok({ ...apariencia, oscurecido: 15, movimiento: "sistema", contraste: false });
          if (p === "/api/yo/apariencia/fondo/qa.svg") return route.fulfill({ contentType: "image/svg+xml", body: pared });
          if (p === "/api/equipo/resumen") return ok({ nombre: "Equipo QA", enlaces: [], actividad: {} });
          if (p === "/api/notificaciones") return ok({ notificaciones: [], no_leidas: 0 });
          if (p.startsWith("/api/push")) return ok({ configurado: false });
          if (p === "/api/admin/miembros") return ok([admin, editor]);
          if (p === "/api/admin/trabajos") return ok([tipo]);
          if (p === "/api/admin/tareas" && req.method() === "POST") {
            const datos = req.postDataJSON();
            creaciones.push(datos);
            actual = { ...demo, ...datos };
            return ok(actual, 201);
          }
          if (p === "/api/admin/tareas/10" && req.method() === "PATCH") {
            const datos = req.postDataJSON();
            cambios.push(datos);
            actual = { ...actual, ...datos };
            return ok(actual);
          }
          if (p === "/api/tareas/10/detalle" || p === "/api/admin/tareas/10") return ok(actual);
          if (p === "/api/tareas/11/detalle") return ok({ ...demo, id: 11, guion: "", titulo: "Video sin guion" });
          if (p === "/api/tareas") return ok([actual]);
          if (p === "/api/tareas/10/whatsapp" && url.searchParams.get("para") === "asignacion") {
            const texto = actual.guion ? "Incluye guion." : "Te asignaron un trabajo.";
            return ok({ disponible: true, nombre: editor.nombre, url: `https://wa.me/573001112233?text=${encodeURIComponent(texto)}` });
          }
          return ok([]);
        });
        const page = await ctx.newPage();
        page.on("pageerror", error => errores.push(error.message));
        const captura = async (nombre, destino) => {
          await destino.evaluate(el => el.scrollIntoView({ block: "center" }));
          await page.evaluate(() => document.fonts.ready.then(() => null));
          const medidas = await destino.evaluate(el => {
            const caja = el.getBoundingClientRect();
            return { viewport: innerWidth, ancho: document.documentElement.scrollWidth, x: caja.x, derecha: caja.right, alto: caja.height, scrollX: el.scrollWidth - el.clientWidth, tema: document.documentElement.dataset.rcTema, modo: document.documentElement.dataset.rcModo };
          });
          assert.equal(medidas.ancho, width, `${slug}/${nombre}: ancho`);
          assert.equal(medidas.scrollX, 0, `${slug}/${nombre}: desborde interno`);
          assert.ok(medidas.x >= 0 && medidas.derecha <= width + 0.5, `${slug}/${nombre}: fuera de pantalla`);
          assert.equal(medidas.modo, apariencia.modo);
          assert.equal(medidas.tema, apariencia.tema);
          await page.screenshot({ path: `${out}/${slug}-${nombre}.png` });
          mediciones.push({ caso: slug, vista: nombre, ...medidas });
        };
        await page.goto(`${base}/trabajos/nuevo`);
        const agregar = page.getByRole("button", { name: "Agregar guion (opcional)" });
        await agregar.waitFor();
        const area = page.getByRole("textbox", { name: "Guion", exact: true });
        assert.equal(await area.count(), 0);
        await agregar.focus();
        await page.keyboard.press("Enter");
        await area.waitFor();
        const inicial = (await area.boundingBox()).height;
        await area.fill(guion);
        await page.waitForFunction(inicial => [...document.querySelectorAll('textarea')].some(e => e.value.includes('FIN DEL GUION') && e.offsetHeight > inicial), inicial);
        await captura("formulario", area);
        await page.getByRole("button", { name: "Volver sin guardar" }).click();
        const dialogo = page.getByRole("dialog", { name: "Tienes cambios sin guardar" });
        await dialogo.waitFor();
        await dialogo.getByRole("button", { name: "Seguir editando" }).click();
        assert.equal(await area.inputValue(), guion);
        const enorme = "🎬".repeat(20001);
        await area.fill(enorme);
        assert.equal(await area.inputValue(), enorme, "No debe truncar el pegado");
        await page.getByText(/20[.,\s]?000/).first().waitFor();
        await area.fill(guion);
        await page.getByRole("combobox", { name: "Persona", exact: true }).click();
        await page.getByRole("option", { name: editor.nombre, exact: true }).click();
        await page.getByRole("combobox", { name: "Tipo de trabajo", exact: true }).click();
        await page.getByRole("option", { name: tipo.nombre, exact: true }).click();
        await page.getByLabel("Fecha de entrega", { exact: true }).fill(demo.fecha_limite);
        await page.getByRole("textbox", { name: "Especificaciones" }).fill(demo.descripcion);
        await page.getByRole("button", { name: "Asignar trabajo" }).click();
        await page.waitForURL(/\/trabajos\/10\?/);
        assert.equal(creaciones.at(-1)?.guion, guion);
        await area.waitFor();
        assert.equal(await area.inputValue(), guion);
        const wa = page.getByRole("link", { name: /Avisar por WhatsApp/ });
        if (await page.getByRole("button", { name: /Avisar por WhatsApp/ }).count()) {
          await page.getByRole("button", { name: /Avisar por WhatsApp/ }).click();
        }
        await wa.waitFor();
        assert.match(new URL(await wa.getAttribute("href")).searchParams.get("text"), /Incluye guion/);
        const historial = page.getByRole("region", { name: "Historial y entregas" });
        await historial.getByText("Guion", { exact: true }).waitFor();
        await area.fill(guion + "\nEdición QA");
        await page.getByRole("button", { name: "Guardar cambios" }).click();
        await page.getByText("Cambios guardados.").waitFor();
        assert.equal(cambios.at(-1)?.guion, guion + "\nEdición QA");
        assert.equal(creaciones.length, 1);
        actual = { ...demo };
        perfil = editor;
        await page.goto(`${base}/trabajos/10?desde=tareas`);
        const ampliar = page.getByRole("button", { name: "Ver completo" });
        await ampliar.waitFor();
        const bloque = page.getByRole("region", { name: "Guion", exact: true });
        await captura("trabajador", bloque);
        await ampliar.focus();
        await page.keyboard.press("Enter");
        await page.getByText("FIN DEL GUION", { exact: false }).waitFor();
        assert.equal(await bloque.locator("inicio").count(), 0, "Guion renderizado como HTML");
        assert.ok((await bloque.innerText()).includes("Pantalla: <inicio>"));
        await page.getByRole("button", { name: "Copiar guion" }).click();
        assert.equal(await page.evaluate(() => window.__copiado), guion);
        await captura("trabajador-expandido", bloque);
        await page.goto(`${base}/tareas`);
        const tarjeta = page.locator("#tarea-10");
        await tarjeta.getByRole("button", { name: "Copiar guion" }).waitFor();
        await captura("mis-tareas", tarjeta.getByRole("region", { name: "Guion", exact: true }));
        await page.goto(`${base}/trabajos/11?desde=tareas`);
        await page.getByRole("heading", { name: "Video sin guion" }).waitFor();
        assert.equal(await page.getByRole("button", { name: "Copiar guion" }).count(), 0);
        assert.deepEqual(errores, []);
        console.log(`QA OK: ${slug}`);
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  writeFileSync(`${out}/mediciones.json`, JSON.stringify({ pid: server.pid, mediciones }, null, 2) + "\n");
  if (server.exitCode === null) server.kill();
  if (server.pid) await salida;
  console.log(`Servidor Next cerrado: PID ${server.pid}`);
}
