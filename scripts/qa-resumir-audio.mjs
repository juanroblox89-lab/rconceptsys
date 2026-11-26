import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

async function elegir(control, nombre) {
  await control.click();
  await control.page().getByRole("listbox").getByRole("option", { name: nombre, exact: true }).click();
}

const base = process.env.QA_BASE ?? "http://127.0.0.1:3337";
const dir = process.env.QA_DIR ?? "capturas-resumir-audio";
const media = process.env.QA_MEDIA_DIR;
if (!media) throw new Error("Indica QA_MEDIA_DIR con mediarecorder.webm y silencio.webm sintéticos.");

const vozWebm = readFileSync(`${media}/mediarecorder.webm`);
const silencioWebm = readFileSync(`${media}/silencio.webm`);

const admin = { id: "admin-qa", nombre: "Admin Demo", estado: "aprobado", es_admin: true };
const miembro = { id: "editor-qa", nombre: "Mateo Editor", estado: "aprobado", es_admin: false };
const tipo = { id: 2, nombre: "Edición de video", activo: true, unidad: "trabajo" };
const cliente = {
  id: 1,
  nombre: "Estudio Norte",
  activo: true,
  drive_carpeta_id: "estudio-norte",
  drive_url: "https://drive.google.com/drive/folders/estudio-norte",
};

const resumenEsperado = [
  "Proyecto ficticio Nube Azul.",
  "Ordenar los cuatro clips del taller.",
  "Entregar el corte final el viernes por la tarde.",
];
const transcripcionEsperada =
  "Para el proyecto ficticio Nube Azul, ordena los cuatro clips del taller y entrega el corte final el viernes por la tarde.";

mkdirSync(dir, { recursive: true });
const resultados = [];

const navegador = await chromium.launch({
  headless: true,
  channel: "msedge",
  args: ["--renderer-process-limit=2", "--disable-background-networking", "--disable-gpu"],
});

try {
  for (const width of [375, 1280]) {
    for (const modo of ["claro", "oscuro"]) {
      const ctx = await navegador.newContext({
        viewport: { width, height: width === 375 ? 812 : 800 },
        colorScheme: modo === "claro" ? "light" : "dark",
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });

      try {
        let tarea = null;
        let perfil = admin;
        let altasTrabajo = 0;
        let llamadasBorrador = 0;
        let llamadasProcesar = 0;
        let fallarPrimerGuardado = true;
        const archivos = new Map();
        const errores = [];

        const page = await ctx.newPage();
        page.on("pageerror", (e) => errores.push(e.message));
        page.setDefaultNavigationTimeout(120_000);
        page.setDefaultTimeout(25_000);

        await ctx.addCookies([{ name: "rc_access_token", value: "qa-resumir-audio", url: base }]);

        await ctx.route("**/*", async (route) => {
          const req = route.request();
          const u = new URL(req.url());
          const p = u.pathname;
          const method = req.method();
          if (u.origin !== base) return route.abort();

          const enviar = (json, status = 200) => route.fulfill({ json, status });

          if (p.startsWith("/medios-qa/")) {
            const nombre = decodeURIComponent(p.split("/").at(-1));
            const body = nombre.includes("silencio") ? silencioWebm : vozWebm;
            return route.fulfill({ body, contentType: "audio/webm" });
          }

          if (!p.startsWith("/api/")) return route.continue();
          if (!perfil.es_admin && p.startsWith("/api/admin/")) {
            return enviar({ error: { codigo: "solo_admin", mensaje: "Solo administradores." } }, 403);
          }
          if (p === "/api/yo") return enviar(perfil);
          if (p === "/api/yo/celular") return enviar({ celular: "+573001234567" });
          if (p === "/api/yo/apariencia") {
            return enviar({ modo, tema: "rconcept", movimiento: "sistema", contraste: false, oscurecido: 32 });
          }
          if (p === "/api/equipo/resumen") return enviar({ nombre: "RConcept", descripcion: "", enlaces: [] });
          if (p === "/api/admin/clientes") return enviar([cliente]);
          if (p === "/api/admin/miembros") return enviar([miembro]);
          if (p === "/api/admin/trabajos") return enviar([tipo]);
          if (p === "/api/notificaciones") return enviar({ no_leidas: 0, notificaciones: [] });
          if (p === "/api/notificaciones/preferencias") return enviar({ tipos_silenciados: [] });
          if (p === "/api/push/clave") return enviar({ configurado: false, clave: "" });

          if (p === "/api/admin/adjuntos/resumen-borrador" && method === "POST") {
            llamadasBorrador++;
            const buf = req.postDataBuffer() ?? Buffer.alloc(0);
            const esSilencio = buf.includes(Buffer.from("silencio-nube.webm"));
            await new Promise((r) => setTimeout(r, 250));
            if (esSilencio) {
              return enviar({
                error: { codigo: "sin_voz", mensaje: "No se escuchó voz clara en el audio para resumir." },
              }, 422);
            }
            return enviar({
              estado_resumen: "listo",
              resumen: resumenEsperado,
              transcripcion: transcripcionEsperada,
              borrador_resumen: {
                resumen: resumenEsperado,
                transcripcion: transcripcionEsperada,
                proveedor: "9router",
                token: "tok-borrador-sintetico",
              },
            });
          }

          if (p === "/api/admin/tareas" && method === "POST") {
            altasTrabajo++;
            const b = req.postDataJSON();
            tarea = {
              ...b,
              id: 92,
              tipo,
              cliente,
              asignado: miembro,
              creador: admin,
              estado: "pendiente",
              creada_en: "2026-11-26T06:30:00Z",
            };
            return enviar(tarea, 201);
          }

          if (p === "/api/admin/tareas/92" || p === "/api/tareas/92/detalle") {
            if (method === "PATCH") tarea = { ...tarea, ...req.postDataJSON() };
            return enviar(tarea);
          }

          if (p === "/api/tareas") return enviar(tarea ? [tarea] : []);

          const m = /^\/api\/(admin\/)?tareas\/92\/adjuntos(?:\/([^/]+))?(?:\/(.*))?$/.exec(p);
          if (m) {
            const [, esAdmin, id, accion] = m;
            if (!id && method === "GET") {
              return enviar([...archivos.values()].filter((a) => a.listo).map((a) => ({ ...a, partes: undefined })));
            }
            if (esAdmin && !id && method === "POST") {
              const b = req.postDataJSON();
              if (!archivos.has(b.id)) {
                archivos.set(b.id, { ...b, mime: "audio/webm", partes: [], listo: false, estado_resumen: "sin_resumen" });
              }
              return enviar({ id: b.id, parte_bytes: 2 * 1024 * 1024, listo: archivos.get(b.id).listo });
            }
            const a = archivos.get(id);
            if (!a) return enviar({}, 404);
            if (esAdmin && accion?.startsWith("partes/")) {
              a.partes[Number(accion.split("/")[1])] = req.postDataBuffer();
              return route.fulfill({ status: 204 });
            }
            if (esAdmin && accion === "finalizar") {
              const body = req.postDataJSON() ?? {};
              a.listo = true;
              if (a.resumir && body?.borrador_resumen?.token === "tok-borrador-sintetico") {
                a.estado_resumen = "listo";
                a.resumen = body.borrador_resumen.resumen;
                a.transcripcion = body.borrador_resumen.transcripcion;
              } else if (a.resumir) {
                a.estado_resumen = "pendiente";
              }
              return enviar(a, 201);
            }
            if (esAdmin && method === "PATCH") {
              const body = req.postDataJSON();
              a.resumir = Boolean(body.resumir);
              a.estado_resumen = a.resumir ? "pendiente" : "sin_resumen";
              delete a.resumen;
              delete a.transcripcion;
              delete a.error_resumen;
              return enviar(a);
            }
            if (esAdmin && method === "DELETE") {
              archivos.delete(id);
              return route.fulfill({ status: 204 });
            }
            if (!esAdmin && accion === "firma") {
              return enviar({ url: `${base}/medios-qa/${encodeURIComponent(a.nombre)}`, expira_en: 300 });
            }
            if (!esAdmin && accion === "reintentar" && method === "POST") {
              a.estado_resumen = "pendiente";
              delete a.error_resumen;
              return enviar(a, 202);
            }
            if (!esAdmin && accion === "procesar-resumen" && method === "POST") {
              llamadasProcesar++;
              await new Promise((r) => setTimeout(r, 250));
              if (fallarPrimerGuardado) {
                fallarPrimerGuardado = false;
                a.estado_resumen = "fallido";
                a.error_resumen = "La IA tardó demasiado en responder. Intenta de nuevo.";
                return enviar(a);
              }
              a.estado_resumen = "listo";
              a.resumen = resumenEsperado;
              a.transcripcion = transcripcionEsperada;
              delete a.error_resumen;
              return enviar(a);
            }
          }

          return enviar([]);
        });

        const borradorRegion = () => page.getByRole("region", { name: "Adjuntos", exact: true });
        const guardadosRegion = () => page.getByRole("region", { name: "Adjuntos guardados", exact: true });

        async function medirYCapturar(nombre, scope) {
          const slug = `${nombre}-${width}-${modo}`;
          await page.waitForFunction((t) => document.documentElement.dataset.rcModo === t, modo);
          const medidas = await scope.evaluate((el) => ({
            viewport: innerWidth,
            anchoDoc: document.documentElement.scrollWidth,
            main: document.querySelector("main")?.clientWidth,
            mainScroll: document.querySelector("main")?.scrollWidth,
            tema: getComputedStyle(document.documentElement).colorScheme,
            cajas: el.querySelectorAll(":scope > ul > li").length,
          }));
          assert.equal(medidas.anchoDoc, width, `${slug}: desborde horizontal documento`);
          assert.equal(medidas.main, medidas.mainScroll, `${slug}: desborde horizontal main`);
          assert.equal(medidas.tema, modo === "claro" ? "light" : "dark");
          await scope.scrollIntoViewIfNeeded();
          await scope.screenshot({
            path: `${dir}/${slug}.png`,
            animations: "disabled",
          });
          resultados.push({ slug, ...medidas });
        }

        console.log(`QA resumir audio ${width} ${modo}`);
        await page.goto(`${base}/trabajos/nuevo`, { waitUntil: "domcontentloaded" });
        await elegir(page.getByRole("combobox", { name: "Cliente", exact: true }), cliente.nombre);
        await elegir(page.getByRole("combobox", { name: "Persona", exact: true }), miembro.nombre);
        await elegir(page.getByRole("combobox", { name: "Tipo de trabajo", exact: true }), tipo.nombre);
        await page.getByLabel("Fecha de entrega").fill("2026-12-05");
        await page.getByLabel("Especificaciones").fill("Ordenar clips del proyecto ficticio Nube Azul.");

        // 1. Subir audio WebM reportado como video/webm (caso real de selector de archivos) + silencio.webm en borrador
        const input = borradorRegion().locator("input[type=file]");
        await input.setInputFiles({ name: "nota-nube.webm", mimeType: "video/webm", buffer: vozWebm });
        await borradorRegion().getByRole("switch", { name: "Resumir con IA" }).waitFor();

        // Pulsar Resumir con IA en borrador: debe mostrar Resumiendo… -> Listo + viñetas SIN guardar la tarea
        await borradorRegion().getByRole("switch", { name: "Resumir con IA" }).click();
        await borradorRegion().getByText("Resumiendo…", { exact: true }).waitFor();
        await borradorRegion().getByText("Listo", { exact: true }).waitFor();
        assert.equal(altasTrabajo, 0, "No debe crear ni guardar el trabajo al resumir en borrador");
        assert.equal(llamadasBorrador, 1);
        assert.equal(
          await borradorRegion().getByRole("list", { name: "Resumen" }).getByRole("listitem").count(),
          3,
        );

        // Probar silencio en borrador -> error legible y reintento sin duplicar adjunto
        await input.setInputFiles({ name: "silencio-nube.webm", mimeType: "audio/webm", buffer: silencioWebm });
        const switches = borradorRegion().getByRole("switch", { name: "Resumir con IA" });
        await switches.nth(1).click();
        await borradorRegion().getByText("No se escuchó voz clara en el audio para resumir.").waitFor();
        assert.equal(altasTrabajo, 0);
        await medirYCapturar("borrador", borradorRegion());

        // Quitar el silencio para guardar con el WebM ya resumido y agregar un segundo WebM sin resumir aún
        await borradorRegion().getByRole("button", { name: "Quitar silencio-nube.webm" }).click();
        await borradorRegion().getByRole("button", { name: "Sí", exact: true }).click();
        await input.setInputFiles({ name: "segundo-audio.webm", mimeType: "audio/webm", buffer: vozWebm });

        await page.getByRole("button", { name: "Asignar trabajo", exact: true }).click();
        await page.waitForURL(/\/trabajos\/92/);
        assert.equal(altasTrabajo, 1);

        // El primer audio conserva su resumen sin re-procesar; el segundo tiene Resumir con IA desactivado
        await guardadosRegion().getByText("Listo", { exact: true }).waitFor();
        assert.equal(llamadasProcesar, 0, "El audio resumido en borrador no debe re-procesarse");

        // 2. Pulsar Resumir con IA en adjunto guardado: primer intento falla con error legible -> Reintentar -> Listo
        await guardadosRegion().getByRole("switch", { name: "Resumir con IA" }).nth(1).click();
        await guardadosRegion().getByText("La IA tardó demasiado en responder. Intenta de nuevo.").waitFor();
        await guardadosRegion().getByRole("button", { name: "Reintentar", exact: true }).click();
        await guardadosRegion().getByText("Resumiendo…", { exact: true }).waitFor();
        await page.waitForFunction(() => {
          const reg = [...document.querySelectorAll("section")].find((s) => s.querySelector("h3")?.textContent === "Adjuntos guardados");
          if (!reg) return false;
          const estados = [...reg.querySelectorAll("strong[role='status']")].map((e) => e.textContent?.trim());
          return estados.filter((t) => t === "Listo").length === 2;
        });
        assert.equal(await guardadosRegion().getByText("Listo", { exact: true }).count(), 2);
        assert.equal(llamadasProcesar, 2);

        // 3. Vista de trabajador asignado: ve resúmenes, no ve switch admin
        perfil = miembro;
        await page.goto(`${base}/trabajos/92`, { waitUntil: "domcontentloaded" });
        await borradorRegion().getByText("Proyecto ficticio Nube Azul.").first().waitFor();
        assert.equal(await borradorRegion().getByRole("switch").count(), 0);
        await medirYCapturar("guardado-trabajador", borradorRegion());

        assert.deepEqual(errores, []);
      } finally {
        await ctx.close();
      }
    }
  }
} finally {
  await navegador.close();
}

writeFileSync(`${dir}/mediciones.json`, JSON.stringify(resultados, null, 2));
console.log(`QA resumir audio: ${resultados.length} capturas OK, sin desbordes ni errores.`);
