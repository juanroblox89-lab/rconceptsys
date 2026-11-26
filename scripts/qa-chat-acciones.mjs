import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.QA_BASE ?? "http://127.0.0.1:3332";
const dir = process.env.QA_DIR ?? "capturas-chat-acciones";
mkdirSync(dir, { recursive: true });

const creadoBase = "2026-11-26T00:05:00.000Z";
const paredSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#60859d"/><stop offset="55%" stop-color="#c9d9e6"/><stop offset="100%" stop-color="#253642"/></linearGradient></defs><rect width="900" height="700" fill="url(#g)"/></svg>';

const adminPerfil = {
  id: "admin-1",
  correo: "juan@rconcept.com",
  nombre: "Juan Admin",
  foto_path: null,
  estado: "aprobado",
  es_admin: true,
  creado_en: creadoBase,
  roles: [{ id: 2, clave: "editor", nombre: "Editor", color: "#2F7FE0", orden: 1, activo: true }],
};

const miembroPerfil = {
  id: "miembro-1",
  correo: "mateo@rconcept.com",
  nombre: "Mateo Editor",
  foto_path: null,
  estado: "aprobado",
  es_admin: false,
  creado_en: creadoBase,
  roles: [{ id: 2, clave: "editor", nombre: "Editor", color: "#7C3AED", orden: 1, activo: true }],
};

async function longPress(page, locator, ms = 480) {
  const box = await locator.boundingBox();
  assert.ok(box, "el elemento objetivo debe ser visible para pulsación larga");
  const x = box.x + Math.min(box.width / 2, 48);
  const y = box.y + box.height / 2;
  await locator.evaluate(
    (el, { cx, cy, holdMs }) => {
      return new Promise((resolve) => {
        const down = new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: cx,
          clientY: cy,
          pointerType: "touch",
          isPrimary: true,
        });
        el.dispatchEvent(down);
        setTimeout(() => {
          const up = new PointerEvent("pointerup", {
            bubbles: true,
            cancelable: true,
            clientX: cx,
            clientY: cy,
            pointerType: "touch",
            isPrimary: true,
          });
          el.dispatchEvent(up);
          resolve();
        }, holdMs);
      });
    },
    { cx: x, cy: y, holdMs: ms },
  );
}

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--renderer-process-limit=2", "--disable-background-networking"],
});

const resumen = [];

try {
  const matriz = [
    { nombre: "375-claro-glass-teclado", width: 375, height: 480, modo: "claro", tema: "glass", movil: true, teclado: true },
    { nombre: "375-oscuro-glass", width: 375, height: 812, modo: "oscuro", tema: "glass", movil: true, teclado: false },
    { nombre: "375-claro-rconcept", width: 375, height: 812, modo: "claro", tema: "rconcept", movil: true, teclado: false },
    { nombre: "375-oscuro-rconcept", width: 375, height: 812, modo: "oscuro", tema: "rconcept-dark", movil: true, teclado: false },
    { nombre: "1280-claro-glass", width: 1280, height: 800, modo: "claro", tema: "glass", movil: false, teclado: false },
    { nombre: "1280-oscuro-glass", width: 1280, height: 800, modo: "oscuro", tema: "glass", movil: false, teclado: false },
    { nombre: "1280-claro-rconcept", width: 1280, height: 800, modo: "claro", tema: "rconcept", movil: false, teclado: false },
    { nombre: "1280-oscuro-rconcept", width: 1280, height: 800, modo: "oscuro", tema: "rconcept-dark", movil: false, teclado: false },
  ];

  for (const cfg of matriz) {
    console.log(`Probando ${cfg.nombre}...`);
    const ctx = await browser.newContext({
      viewport: { width: cfg.width, height: cfg.height },
      colorScheme: cfg.modo === "oscuro" ? "dark" : "light",
      hasTouch: cfg.movil,
      isMobile: cfg.movil,
      userAgent: cfg.movil
        ? "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
        : undefined,
      reducedMotion: "reduce",
      serviceWorkers: "block",
      permissions: ["clipboard-read", "clipboard-write"],
    });

    try {
      await ctx.addCookies([{ name: "rc_access_token", value: "qa-chat-acciones", url: base }]);
      const page = await ctx.newPage();
      page.setDefaultTimeout(15000);
      const erroresConsola = [];
      page.on("pageerror", (e) => erroresConsola.push(`pageerror: ${e.message}`));
      page.on("console", (msg) => {
        if (msg.type() === "error") erroresConsola.push(`console.error: ${msg.text()}`);
      });

      let usuarioActual = miembroPerfil;
      let nextChatId = 100;
      let nextRiaId = 200;
      let postsChat = [];
      let chatMensajes = [
        {
          id: 10,
          autor_id: adminPerfil.id,
          autor: adminPerfil,
          cuerpo: "Revisen las tomas del lunes antes de las 5pm.",
          creado_en: "2026-11-25T14:10:00.000Z",
        },
        {
          id: 11,
          autor_id: "ria",
          es_ria: true,
          cuerpo: "Hoy hay 2 tareas pendientes en /tareas.",
          creado_en: "2026-11-25T14:12:00.000Z",
        },
        {
          id: 12,
          autor_id: miembroPerfil.id,
          autor: miembroPerfil,
          cuerpo: "Listo, ya voy subiendo el corte.",
          creado_en: "2026-11-25T14:15:00.000Z",
        },
      ];
      let riaHistorial = [
        { id: 1, rol: "user", cuerpo: "¿Qué entregas tengo hoy?", creado_en: "2026-11-25T15:00:00.000Z" },
        {
          id: 2,
          rol: "assistant",
          cuerpo: "Tienes 1 entrega pendiente en /tareas para **Cliente Demo**.",
          creado_en: "2026-11-25T15:00:02.000Z",
        },
      ];

      await ctx.route("**/*", (route) => {
        const req = route.request();
        const u = new URL(req.url());
        if (u.origin !== base) return route.abort();
        if (!u.pathname.startsWith("/api/")) return route.continue();

        const json = (data, status = 200) => route.fulfill({ status, json: data });
        const p = u.pathname;

        if (p === "/api/yo") return json(usuarioActual);
        if (p === "/api/yo/celular") return json({ celular: "+573005551234" });
        if (p === "/api/yo/apariencia") {
          return json({
            tema: cfg.tema,
            modo: cfg.modo,
            movimiento: "sistema",
            contraste: false,
            oscurecido: 8,
            imagen: cfg.tema === "glass" ? `${"a".repeat(32)}.png` : undefined,
          });
        }
        if (p.startsWith("/api/yo/apariencia/fondo/")) {
          return route.fulfill({ contentType: "image/svg+xml", body: paredSvg });
        }
        if (p === "/api/equipo/resumen") {
          return json({
            nombre: "RConcept Systems",
            descripcion: "Equipo QA",
            enlaces: [],
            actividad: { mensajes: chatMensajes.filter((m) => !m.borrado_en).length, tareas: 2, miembros: 4, archivos: 1 },
          });
        }
        if (p === "/api/notificaciones") return json({ no_leidas: 0, notificaciones: [] });

        // Chat del equipo
        if (p === "/api/chat" && req.method() === "GET") {
          const visibles = chatMensajes.filter((m) => !m.borrado_en).slice().reverse();
          return json(visibles);
        }
        if (p === "/api/chat" && req.method() === "POST") {
          const { cuerpo } = req.postDataJSON();
          postsChat.push(cuerpo);
          const nuevo = {
            id: nextChatId++,
            autor_id: usuarioActual.id,
            autor: usuarioActual,
            cuerpo,
            creado_en: new Date().toISOString(),
          };
          chatMensajes.push(nuevo);
          return json(nuevo, 201);
        }
        const chatMatch = p.match(/^\/api\/chat\/(\d+)(?:\/(restaurar))?$/);
        if (chatMatch) {
          const id = Number(chatMatch[1]);
          const restaurar = chatMatch[2] === "restaurar";
          const idx = chatMensajes.findIndex((m) => m.id === id);
          if (idx === -1) return json({ error: { codigo: "mensaje_no_encontrado", mensaje: "No se encontró el mensaje." } }, 404);
          const msg = chatMensajes[idx];

          if (req.method() === "PATCH") {
            if (msg.borrado_en) return json({ error: { codigo: "mensaje_no_encontrado", mensaje: "No se encontró." } }, 404);
            if (msg.es_ria || msg.autor_id !== usuarioActual.id) {
              return json({ error: { codigo: "sin_permiso", mensaje: "Solo puedes editar tus propios mensajes." } }, 403);
            }
            const { cuerpo } = req.postDataJSON();
            msg.cuerpo = cuerpo.trim();
            msg.editado_en = new Date().toISOString();
            return json(msg);
          }
          if (req.method() === "DELETE") {
            if (msg.borrado_en) return json({ error: { codigo: "mensaje_no_encontrado", mensaje: "No se encontró." } }, 404);
            if (!usuarioActual.es_admin && (msg.es_ria || msg.autor_id !== usuarioActual.id)) {
              return json({ error: { codigo: "sin_permiso", mensaje: "No tienes permiso para eliminar este mensaje." } }, 403);
            }
            msg.borrado_en = new Date().toISOString();
            return json({ mensaje: "Mensaje eliminado." });
          }
          if (req.method() === "POST" && restaurar) {
            if (!msg.borrado_en) return json({ error: { codigo: "mensaje_no_encontrado", mensaje: "No está eliminado." } }, 404);
            if (!usuarioActual.es_admin && (msg.es_ria || msg.autor_id !== usuarioActual.id)) {
              return json({ error: { codigo: "sin_permiso", mensaje: "No tienes permiso." } }, 403);
            }
            msg.borrado_en = null;
            return json(msg);
          }
        }

        // RIA privado
        if (p === "/api/ria" && req.method() === "GET") {
          return json(riaHistorial.filter((m) => !m.borrado_en));
        }
        if (p === "/api/ria" && req.method() === "POST") {
          const { pregunta } = req.postDataJSON();
          const pid = nextRiaId++;
          const rid = nextRiaId++;
          const ahora = new Date().toISOString();
          riaHistorial.push({ id: pid, rol: "user", cuerpo: pregunta, creado_en: ahora });
          const resp = {
            id: rid,
            pregunta_id: pid,
            rol: "assistant",
            cuerpo: `Hola, recibí tu consulta: **${pregunta}**.`,
            creado_en: ahora,
          };
          riaHistorial.push(resp);
          return route.fulfill({
            contentType: "text/event-stream",
            body: `event: delta\ndata: ${JSON.stringify({ texto: resp.cuerpo })}\n\nevent: fin\ndata: ${JSON.stringify(resp)}\n\n`,
          });
        }
        const riaMatch = p.match(/^\/api\/ria\/(\d+)(?:\/(restaurar))?$/);
        if (riaMatch) {
          const id = Number(riaMatch[1]);
          const restaurar = riaMatch[2] === "restaurar";
          const msg = riaHistorial.find((m) => m.id === id);
          if (!msg) return json({ error: { codigo: "mensaje_no_encontrado", mensaje: "No se encontró el mensaje." } }, 404);
          if (msg.rol !== "user") return json({ error: { codigo: "sin_permiso", mensaje: "Solo mensajes propios." } }, 403);
          if (req.method() === "PATCH") {
            msg.cuerpo = req.postDataJSON().cuerpo.trim();
            msg.editado_en = new Date().toISOString();
            return json(msg);
          }
          if (req.method() === "DELETE") {
            msg.borrado_en = new Date().toISOString();
            return json({ mensaje: "Mensaje eliminado." });
          }
          if (req.method() === "POST" && restaurar) {
            msg.borrado_en = null;
            return json(msg);
          }
        }

        return json([]);
      });

      const medirCompositor = async (etiqueta) => {
        const m = await page.evaluate((lbl) => {
          const form = document.querySelector("[data-rc-compositor]");
          const ta = form.querySelector("textarea");
          const tr = ta.getBoundingClientRect();
          const botones = [...form.querySelectorAll("[data-rc-compositor-boton]")].map((b) => {
            const br = b.getBoundingClientRect();
            return {
              aria: b.getAttribute("aria-label"),
              w: Math.round(br.width * 10) / 10,
              h: Math.round(br.height * 10) / 10,
              diffTop: Math.round(Math.abs(br.top - tr.top) * 10) / 10,
              diffBottom: Math.round(Math.abs(br.bottom - tr.bottom) * 10) / 10,
            };
          });
          return {
            lbl,
            overflow: document.documentElement.scrollWidth,
            formRight: Math.round(form.getBoundingClientRect().right * 10) / 10,
            taH: Math.round(tr.height * 10) / 10,
            botones,
          };
        }, etiqueta);
        assert.equal(m.overflow, cfg.width, `${etiqueta}: desborde horizontal (${m.overflow} vs ${cfg.width})`);
        assert.ok(m.formRight <= cfg.width + 0.5, `${etiqueta}: formulario sale de pantalla (${m.formRight} > ${cfg.width})`);
        for (const b of m.botones) {
          assert.equal(b.w, 44, `${etiqueta}: botón ${b.aria} width ${b.w} != 44`);
          assert.equal(b.h, 44, `${etiqueta}: botón ${b.aria} height ${b.h} != 44`);
          assert.ok(b.diffBottom <= 1, `${etiqueta}: botón ${b.aria} desalineado abajo (${b.diffBottom}px)`);
        }
        return m;
      };

      // 1. Abrir Chat del equipo (/)
      await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
      const entradaEquipo = page.getByRole("textbox", { name: "Escribe al equipo" });
      await entradaEquipo.waitFor();
      await page.waitForFunction((t) => document.documentElement.dataset.rcTema === t, cfg.tema);
      await page.getByText("Listo, ya voy subiendo el corte.").waitFor();
      await entradaEquipo.focus();

      const mVacioEquipo = await medirCompositor(`${cfg.nombre} / vacio`);
      assert.equal(mVacioEquipo.taH, 44, `${cfg.nombre}: textarea vacío en / mide ${mVacioEquipo.taH}`);
      await page.screenshot({ path: `${dir}/${cfg.nombre}-chat-vacio.png`, animations: "disabled" });

      // Multilínea: debe crecer y botones quedar alineados con la última línea
      await entradaEquipo.fill("Línea uno\nLínea dos\nLínea tres");
      const mMultiEquipo = await medirCompositor(`${cfg.nombre} / multi`);
      assert.ok(mMultiEquipo.taH >= 88, `${cfg.nombre}: textarea multilínea mide ${mMultiEquipo.taH}`);
      if (cfg.nombre === "375-claro-glass-teclado" || cfg.nombre === "1280-claro-glass") {
        await page.screenshot({ path: `${dir}/${cfg.nombre}-chat-multi.png`, animations: "disabled" });
      }
      await entradaEquipo.fill("");

      // 2. Probar acciones en Chat del equipo como miembro (Mateo)
      const burbujaAjena = page.locator("#mensaje-10");
      const burbujaRia = page.locator("#mensaje-11");
      const burbujaPropia = page.locator("#mensaje-12");

      const abrirMenuMensaje = async (burbuja) => {
        if (cfg.movil) {
          await longPress(page, burbuja);
        } else {
          const fila = burbuja.locator("xpath=ancestor::div[@data-rc-mensaje-fila][1]");
          await fila.hover();
          await fila.getByRole("button", { name: "Acciones del mensaje" }).click();
        }
      };

      // 2a. Mensaje ajeno: solo Copiar
      await abrirMenuMensaje(burbujaAjena);
      const menu = page.getByRole("menu", { name: "Acciones del mensaje" });
      await menu.waitFor();
      assert.equal(await menu.getByRole("menuitem", { name: "Copiar" }).count(), 1);
      assert.equal(await menu.getByRole("menuitem", { name: "Editar" }).count(), 0);
      assert.equal(await menu.getByRole("menuitem", { name: "Eliminar" }).count(), 0);
      await menu.getByRole("menuitem", { name: "Copiar" }).click();
      await page.getByText("Mensaje copiado").waitFor();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "Revisen las tomas del lunes antes de las 5pm.");

      // 2b. Mensaje RIA en equipo: no-admin solo Copiar
      await abrirMenuMensaje(burbujaRia);
      await menu.waitFor();
      assert.equal(await menu.getByRole("menuitem", { name: "Copiar" }).count(), 1);
      assert.equal(await menu.getByRole("menuitem", { name: "Editar" }).count(), 0);
      assert.equal(await menu.getByRole("menuitem", { name: "Eliminar" }).count(), 0);
      await page.keyboard.press("Escape");
      await menu.waitFor({ state: "hidden" });

      // 2c. Mensaje propio: Copiar, Editar, Eliminar
      await abrirMenuMensaje(burbujaPropia);
      await menu.waitFor();
      assert.equal(await menu.getByRole("menuitem", { name: "Copiar" }).count(), 1);
      assert.equal(await menu.getByRole("menuitem", { name: "Editar" }).count(), 1);
      assert.equal(await menu.getByRole("menuitem", { name: "Eliminar" }).count(), 1);
      if (cfg.nombre === "375-oscuro-glass" || cfg.nombre === "1280-oscuro-rconcept") {
        await page.screenshot({ path: `${dir}/${cfg.nombre}-chat-menu.png`, animations: "disabled" });
      }

      // Editar propio
      await menu.getByRole("menuitem", { name: "Editar" }).click();
      const editorCampo = page.getByRole("textbox", { name: "Editar mensaje" });
      await editorCampo.fill("Corte listo y subido a Drive.");
      await page.getByRole("button", { name: "Guardar" }).click();
      await page.getByText("Corte listo y subido a Drive.").waitFor();
      await burbujaPropia.getByText("editado", { exact: true }).waitFor();

      // Eliminar propio + Confirmación + Deshacer corto
      await abrirMenuMensaje(burbujaPropia);
      await menu.getByRole("menuitem", { name: "Eliminar" }).click();
      const dialogo = page.getByRole("dialog");
      await dialogo.waitFor();
      await dialogo.getByRole("button", { name: "Eliminar" }).click();
      await burbujaPropia.waitFor({ state: "hidden" });
      await page.getByText("Mensaje eliminado").waitFor();
      await page.getByRole("button", { name: "Deshacer" }).click();
      await burbujaPropia.waitFor();
      await page.getByText("Corte listo y subido a Drive.").waitFor();

      // 3. Admin puede eliminar mensaje ajeno pero NO editarlo
      usuarioActual = adminPerfil;
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByText("Corte listo y subido a Drive.").waitFor();
      await abrirMenuMensaje(page.locator("#mensaje-12"));
      await menu.waitFor();
      assert.equal(await menu.getByRole("menuitem", { name: "Copiar" }).count(), 1);
      assert.equal(await menu.getByRole("menuitem", { name: "Editar" }).count(), 0);
      assert.equal(await menu.getByRole("menuitem", { name: "Eliminar" }).count(), 1);
      await page.keyboard.press("Escape");

      // 4. Probar /ria hola desde el chat del equipo -> NO deja basura en /api/chat y abre /ria con respuesta!
      const postsAntes = postsChat.length;
      const entradaTrasReload = page.getByRole("textbox", { name: "Escribe al equipo" });
      await entradaTrasReload.fill("/ria hola");
      await page.getByText(/Se abrirá en tu chat privado con RIA/).waitFor();
      await entradaTrasReload.press("Enter");
      await page.waitForURL("**/ria");
      assert.equal(postsChat.length, postsAntes, "/ria hola no debe publicar mensaje basura en el chat del equipo");
      await page.getByText("Hola, recibí tu consulta: ").waitFor();
      const holaRect = await page.locator("#ria-200").boundingBox();
      assert.ok(holaRect && holaRect.height <= 46, `${cfg.nombre}: burbuja 'hola' en /ria no debe partirse (${holaRect?.height}px)`);

      // 5. Medir compositor en /ria y probar acciones en /ria
      const entradaRia = page.getByRole("textbox", { name: "Mensaje para RIA" });
      const mVacioRia = await medirCompositor(`${cfg.nombre} /ria vacio`);
      assert.equal(mVacioRia.taH, 44, `${cfg.nombre}: textarea vacío en /ria mide ${mVacioRia.taH}`);
      await page.screenshot({ path: `${dir}/${cfg.nombre}-ria-vacio.png`, animations: "disabled" });

      await entradaRia.fill("Pregunta 1\nPregunta 2\nPregunta 3");
      const mMultiRia = await medirCompositor(`${cfg.nombre} /ria multi`);
      assert.ok(mMultiRia.taH >= 88, `${cfg.nombre}: textarea multilínea en /ria mide ${mMultiRia.taH}`);
      await entradaRia.fill("");

      // Copiar respuesta de la IA en /ria
      const respRia = page.locator("#ria-2");
      await abrirMenuMensaje(respRia);
      await menu.waitFor();
      assert.equal(await menu.getByRole("menuitem", { name: "Copiar" }).count(), 1);
      assert.equal(await menu.getByRole("menuitem", { name: "Editar" }).count(), 0);
      assert.equal(await menu.getByRole("menuitem", { name: "Eliminar" }).count(), 0);
      await menu.getByRole("menuitem", { name: "Copiar" }).click();
      await page.getByText("Mensaje copiado").waitFor();

      // Editar y eliminar + deshacer en mensaje de usuario recién enviado ("hola", id 200)
      const msgUsuarioRia = page.locator("#ria-200");
      await msgUsuarioRia.waitFor();
      await abrirMenuMensaje(msgUsuarioRia);
      await menu.waitFor();
      assert.equal(await menu.getByRole("menuitem", { name: "Copiar" }).count(), 1);
      assert.equal(await menu.getByRole("menuitem", { name: "Editar" }).count(), 1);
      assert.equal(await menu.getByRole("menuitem", { name: "Eliminar" }).count(), 1);
      await menu.getByRole("menuitem", { name: "Editar" }).click();
      await page.getByRole("textbox", { name: "Editar mensaje" }).fill("hola editado");
      await page.getByRole("button", { name: "Guardar" }).click();
      await msgUsuarioRia.getByText("hola editado", { exact: true }).waitFor();
      await msgUsuarioRia.getByText("editado", { exact: true }).waitFor();

      await abrirMenuMensaje(msgUsuarioRia);
      await menu.getByRole("menuitem", { name: "Eliminar" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
      await msgUsuarioRia.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "Deshacer" }).click();
      await msgUsuarioRia.waitFor();

      assert.deepEqual(erroresConsola, [], `Errores de consola en ${cfg.nombre}: ${erroresConsola.join("; ")}`);
      resumen.push({
        caso: cfg.nombre,
        compositorEquipo: { vacio: mVacioEquipo, multi: mMultiEquipo },
        compositorRia: { vacio: mVacioRia, multi: mMultiRia },
      });
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  writeFileSync(`${dir}/medidas.json`, JSON.stringify(resumen, null, 2));
}
console.log("QA completo en verde.");
