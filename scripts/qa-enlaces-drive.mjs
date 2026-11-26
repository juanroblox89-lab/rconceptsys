import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.QA_BASE ?? "http://127.0.0.1:3325";
const dir = process.env.QA_DIR ?? "capturas-enlaces-drive";
mkdirSync(dir, { recursive: true });

const admin = { id: "admin-qa", nombre: "Juan Admin", estado: "aprobado", es_admin: true, roles: [] };
const miembro = { id: "editor-qa", nombre: "Mateo Editor", estado: "aprobado", es_admin: false, roles: [] };

const carpeta = (id) => `https://drive.google.com/drive/folders/${id}`;
const docsMock = [
  { id: "tomas_norte", name: "Tomas Estudio Norte", mimeType: "application/vnd.google-apps.folder", url: carpeta("tomas_norte") },
  { id: "recursos_2026", name: "Recursos del equipo 2026", mimeType: "application/vnd.google-apps.folder", url: carpeta("recursos_2026") },
  { id: "guion_archivo", name: "Guion maestro", mimeType: "application/vnd.google.com", url: "https://docs.google.com/document/d/guion_archivo/edit" },
];

const pickerScript = `(() => {
  const docs = ${JSON.stringify(docsMock)};
  window.__pickerCalls = 0;
  window.gapi = { load: (_n, opt) => opt.callback() };
  window.google = {
    picker: {
      DocsView: class {
        setParent(id) { window.__pickerPadre = id; return this; }
        setIncludeFolders(v) { window.__pickerFolders = v; return this; }
        setSelectFolderEnabled(v) { window.__pickerSelectFolder = v; return this; }
      },
      PickerBuilder: class {
        setOAuthToken(t) { window.__pickerToken = t; return this; }
        setDeveloperKey() { return this; }
        setOrigin() { return this; }
        setAppId() { return this; }
        setLocale() { return this; }
        setMaxItems(n) { window.__pickerMax = n; return this; }
        enableFeature() { return this; }
        addView() { return this; }
        setCallback(cb) { this.cb = cb; return this; }
        build() {
          window.__pickerCalls++;
          const cb = this.cb;
          const d = document.createElement("dialog");
          d.setAttribute("aria-label", "Selector de Google Drive · QA");
          d.style.cssText = "margin:auto;padding:20px;width:min(92vw,420px);border:1px solid var(--rc-gris-300);border-radius:14px;background:var(--rc-superficie);color:var(--rc-texto);display:flex;flex-direction:column;gap:10px;";
          const title = document.createElement("h2");
          title.textContent = "Google Drive (Simulado)";
          title.style.margin = "0";
          d.append(title);
          for (const doc of docs) {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "rc-btn rc-btn--secundario rc-btn--sm";
            b.textContent = doc.name;
            b.onclick = () => { cb({ action: "picked", docs: [doc] }); if (d.open) d.close(); };
            d.append(b);
          }
          const c = document.createElement("button");
          c.type = "button";
          c.className = "rc-btn rc-btn--fantasma rc-btn--sm";
          c.textContent = "Cancelar";
          c.onclick = () => { cb({ action: "cancel" }); if (d.open) d.close(); };
          d.append(c);
          d.addEventListener("cancel", (e) => { e.preventDefault(); cb({ action: "cancel" }); if (d.open) d.close(); });
          document.body.append(d);
          return {
            setVisible(v) { if (v && !d.open) d.showModal(); else if (!v && d.open) d.close(); },
            dispose() { d.remove(); }
          };
        }
      },
      Action: { PICKED: "picked", CANCEL: "cancel" },
      Feature: { MULTISELECT_ENABLED: "multiselect" }
    }
  };
})();`;

const resultados = [];
const browser = await chromium.launch({
  headless: true,
  channel: "msedge",
  args: ["--renderer-process-limit=2", "--disable-background-networking", "--disable-gpu"],
});

try {
  const matriz = [
    { width: 375, modo: "claro", tema: "rconcept" },
    { width: 1280, modo: "claro", tema: "rconcept" },
    { width: 375, modo: "oscuro", tema: "rconcept" },
    { width: 1280, modo: "oscuro", tema: "glass" },
  ];

  for (const { width, modo, tema } of matriz) {
    const ctx = await browser.newContext({
      viewport: { width, height: width === 375 ? 812 : 800 },
      colorScheme: modo === "claro" ? "light" : "dark",
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });

    try {
      await ctx.addCookies([{ name: "rc_access_token", value: "qa-drive", url: base }]);
      const page = await ctx.newPage();
      page.setDefaultNavigationTimeout(120_000);
      page.setDefaultTimeout(20_000);

      const erroresConsola = [];
      page.on("pageerror", (e) => { console.error("PAGEERROR:", e.message); erroresConsola.push(e.message); });
      page.on("console", (msg) => { if (msg.type() === "error") console.error("CONSOLE ERROR:", msg.text()); });

      let perfilActual = admin;
      let estadoDrive = {
        configurado: true,
        conectado: false,
        organizado: false,
        correo: "",
        cuenta_equipo: "ladlejuan26@gmail.com",
        carpeta_raiz_id: "raiz_qa",
        carpeta_raiz_nombre: "RConcept",
      };
      let enlacesEquipo = [];
      let nextEnlaceId = 1;
      let pickerTokenError = false;
      let pickerTokenCorreo = "ladlejuan26@gmail.com";
      let adminCallsPorNoAdmin = 0;

      const mensajesChat = [
        {
          id: 1,
          autor_id: admin.id,
          cuerpo: "Carpeta histórica del cliente:",
          creado_en: "2026-11-25T10:00:00Z",
          autor: admin,
          adjuntos: [
            {
              id: 100,
              mensaje_id: 1,
              autor_id: admin.id,
              tipo: "drive",
              nombre: "Cliente Histórico",
              mime: "application/vnd.google-apps.folder",
              tamano: 0,
              url_externa: carpeta("hist_100"),
              creado_en: "2026-11-25T10:00:00Z",
            },
          ],
        },
      ];
      const adjuntosPendientes = new Map();
      let nextAdjId = 101;
      let nextMsgId = 2;

      const clienteDemo = {
        id: 1,
        nombre: "Estudio Norte",
        activo: true,
        drive_carpeta_id: "estudio_norte",
        drive_url: carpeta("estudio_norte"),
        drive_referencias: [{ id: "ref_1", nombre: "Brief oficial", url: "https://docs.google.com/document/d/ref_1/edit" }],
        creado_en: "2026-11-20T10:00:00Z",
      };
      const tareaDemo = {
        id: 10,
        tipo_id: 1,
        tipo: { id: 1, clave: "edit", nombre: "Edición", rol_id: null, precio: 50000, unidad: "trabajo", activo: true, orden: 1, creado_en: "2026-11-20T10:00:00Z" },
        cliente_id: 1,
        cliente: clienteDemo,
        titulo: "Corte semanal",
        descripcion: "Editar reel",
        asignado_a: miembro.id,
        asignado: miembro,
        creado_por: admin.id,
        estado: "pendiente",
        fecha_limite: "2026-12-01",
        drive_carpeta_id: "entrega_10",
        drive_carpeta_url: carpeta("entrega_10"),
        drive_referencias: [{ id: "ref_t1", nombre: "Clips brutos", url: carpeta("clips_10"), tipo: "carpeta" }],
        creada_en: "2026-11-25T10:00:00Z",
      };

      await ctx.route("**/*", async (route) => {
        const req = route.request();
        const u = new URL(req.url());
        const p = u.pathname;
        if (u.origin === "https://apis.google.com") {
          return route.fulfill({ contentType: "text/javascript", body: pickerScript });
        }
        if (u.origin !== base) return route.abort();
        if (!p.startsWith("/api/")) return route.continue();

        const enviar = (json, status = 200) => route.fulfill({ json, status });
        if (!perfilActual.es_admin && p.startsWith("/api/admin/")) {
          adminCallsPorNoAdmin++;
          return enviar({ error: { codigo: "solo_admin", mensaje: "Solo administradores." } }, 403);
        }

        if (p === "/api/yo") return enviar(perfilActual);
        if (p === "/api/yo/celular") return enviar({ celular: "+573001234567" });
        if (p === "/api/yo/apariencia") {
          return enviar({ modo, tema, movimiento: "sistema", contraste: false, oscurecido: 30 });
        }
        if (p === "/api/notificaciones") return enviar({ no_leidas: 0, notificaciones: [] });
        if (p === "/api/notificaciones/preferencias") return enviar({ tipos_silenciados: [], silenciar_chat: false, silencio_desde: "", silencio_hasta: "" });
        if (p === "/api/push/clave") return enviar({ configurado: false, clave: "" });
        if (p === "/api/equipo") return enviar([admin, miembro]);
        if (p === "/api/equipo/resumen") {
          return enviar({
            nombre: "RConcept Systems",
            descripcion: "Producción audiovisual.",
            enlaces: enlacesEquipo,
            actividad: { mensajes: mensajesChat.length, tareas: 1, miembros: 2, archivos: 1 },
          });
        }
        if (p === "/api/admin/drive") return enviar(estadoDrive);
        if (p === "/api/admin/drive/conectar") return enviar({ url: "https://accounts.google.com/o/oauth2/v2/auth?state=qa" });
        if (p === "/api/admin/drive/desconectar") {
          estadoDrive = { ...estadoDrive, conectado: false, correo: "", organizado: false };
          return enviar({ mensaje: "Drive desconectado." });
        }
        if (p === "/api/admin/drive/picker-token") {
          if (pickerTokenError) return enviar({ error: { codigo: "drive_error", mensaje: "No pudimos preparar Google Drive." } }, 502);
          if (!estadoDrive.conectado) return enviar({ error: { codigo: "drive_no_conectado", mensaje: "Conecta el Drive del equipo en Gestión → Equipo." } }, 409);
          return enviar({
            access_token: "tok-qa",
            expires_in: 3600,
            carpeta_id: "raiz_qa",
            clave: "qa-key",
            proyecto_id: "123",
            correo: pickerTokenCorreo,
            cuenta_equipo: "ladlejuan26@gmail.com",
          });
        }
        if (p === "/api/admin/equipo/enlaces" && req.method() === "POST") {
          const body = req.postDataJSON();
          const existe = enlacesEquipo.some((e) => e.url.replace(/\/+$/, "") === String(body.url).trim().replace(/\/+$/, ""));
          if (existe) return enviar({ error: { codigo: "enlace_invalido", mensaje: "Ese enlace ya está en la lista." } }, 400);
          if (enlacesEquipo.length >= 12) return enviar({ error: { codigo: "enlace_invalido", mensaje: "Ya hay 12 enlaces." } }, 400);
          const nuevo = { id: nextEnlaceId++, nombre: body.nombre, url: body.url, orden: nextEnlaceId, creado_en: new Date().toISOString() };
          enlacesEquipo.push(nuevo);
          return enviar(nuevo, 201);
        }
        if (p.startsWith("/api/admin/equipo/enlaces/") && req.method() === "DELETE") {
          const id = Number(p.split("/").pop());
          enlacesEquipo = enlacesEquipo.filter((e) => e.id !== id);
          return enviar({ mensaje: "Eliminado" });
        }
        if (p === "/api/chat" && req.method() === "GET") {
          return enviar([...mensajesChat].reverse());
        }
        if (p === "/api/chat/adjuntos" && req.method() === "POST") {
          const body = req.postDataJSON();
          const adj = {
            id: nextAdjId++,
            mensaje_id: null,
            autor_id: perfilActual.id,
            tipo: "drive",
            nombre: body.nombre,
            mime: "application/vnd.google-apps.folder",
            tamano: 0,
            url_externa: body.url,
            creado_en: new Date().toISOString(),
          };
          adjuntosPendientes.set(adj.id, adj);
          return enviar(adj, 201);
        }
        if (p === "/api/chat" && req.method() === "POST") {
          const body = req.postDataJSON();
          const id = nextMsgId++;
          const adjs = (body.adjuntos ?? []).map((aid) => {
            const a = adjuntosPendientes.get(aid);
            return a ? { ...a, mensaje_id: id } : null;
          }).filter(Boolean);
          const msg = {
            id,
            autor_id: perfilActual.id,
            cuerpo: body.cuerpo || "",
            creado_en: new Date().toISOString(),
            autor: perfilActual,
            adjuntos: adjs,
          };
          mensajesChat.push(msg);
          return enviar(msg, 201);
        }
        if (p === "/api/clientes" || p === "/api/admin/clientes") return enviar([clienteDemo]);
        if (p === "/api/clientes/1" || p === "/api/admin/clientes/1") {
          return enviar({ cliente: clienteDemo, trabajos: [tareaDemo], estadisticas: { total: 1, activos: 1, entregados: 0, por_revisar: 0, aprobados: 0, cancelados: 0, ultima_entrega: null } });
        }
        if (p === "/api/tareas") return enviar([tareaDemo]);
        if (p === "/api/tareas/10/detalle") return enviar(tareaDemo);
        if (p === "/api/tareas/10/adjuntos") return enviar([]);
        if (p === "/api/admin/asignaciones/recientes") return enviar({ asignaciones: [], nuevas: 0 });
        return enviar([]);
      });

      const medir = async (nombre) => {
        const slug = `${nombre}-${width}-${modo}-${tema}`;
        await page.waitForFunction((m) => document.documentElement.dataset.rcModo === m, modo);
        const doc = await page.evaluate(() => ({
          ancho: innerWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        assert.equal(doc.scroll, doc.ancho, `Overflow horizontal en ${slug}: scroll=${doc.scroll} > ${doc.ancho}`);
        await page.screenshot({ path: `${dir}/${slug}.png`, animations: "disabled" });
        resultados.push({ slug, ...doc });
      };

      // --- 1. AdminEquipo: desconectado -> cuenta equivocada -> cuenta correcta -> Picker ---
      await page.goto(`${base}/admin?pestana=equipo`, { waitUntil: "domcontentloaded" });
      try {
        await page.getByText("Conecta Drive del equipo para elegir.", { exact: true }).waitFor();
      } catch (e) {
        console.error("DEBUG URL:", page.url());
        console.error("DEBUG BODY:", await page.evaluate(() => document.body.innerText.slice(0, 1000)));
        throw e;
      }
      await page.getByText("Inicia sesión con la cuenta del equipo", { exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: /Elegir de Drive/i }).count(), 0);
      assert.equal(await page.getByPlaceholder("Nombre (Drive del equipo)").count(), 0);
      assert.equal(await page.getByPlaceholder("https://drive.google.com/…").count(), 0);
      await page.getByPlaceholder("Nombre del enlace").waitFor();
      await page.getByPlaceholder("https://…").waitFor();
      await medir("01-equipo-desconectado");

      // Cuenta equivocada conectada
      estadoDrive = { ...estadoDrive, conectado: true, organizado: true, correo: "personal@gmail.com" };
      pickerTokenCorreo = "personal@gmail.com";
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByText(/Drive está conectado con otra cuenta \(personal@gmail\.com\)/).waitFor();
      await page.getByRole("button", { name: "Reconectar", exact: true }).waitFor();
      await page.getByRole("button", { name: "Desconectar Drive", exact: true }).waitFor();
      await medir("02-equipo-cuenta-equivocada");

      // Al elegir desde Picker con cuenta equivocada, avisa ANTES de crear el enlace
      await page.getByRole("button", { name: /Elegir de Drive/i }).click();
      const dlg = page.getByRole("dialog", { name: "Selector de Google Drive · QA" });
      await dlg.waitFor();
      await dlg.getByRole("button", { name: "Recursos del equipo 2026" }).click();
      await page.getByText("La cuenta del selector no coincide").waitFor();
      assert.equal(enlacesEquipo.length, 0);
      await page.getByRole("button", { name: "Cancelar", exact: true }).click();
      assert.equal(enlacesEquipo.length, 0);

      // Cuenta correcta (con mayúsculas y espacios)
      estadoDrive = { ...estadoDrive, correo: "  LADLEJUAN26@GMAIL.COM  " };
      pickerTokenCorreo = "ladlejuan26@gmail.com";
      await page.reload({ waitUntil: "domcontentloaded" });
      assert.equal(await page.getByText(/Drive está conectado con otra cuenta/).count(), 0);

      // Cancelar Picker sin error
      await page.getByRole("button", { name: /Elegir de Drive/i }).click();
      await dlg.waitFor();
      await dlg.getByRole("button", { name: "Cancelar", exact: true }).click();
      await dlg.waitFor({ state: "detached" });
      const alertasTrasCancelar = await page.locator('[role="alert"]').allInnerTexts();
      assert.deepEqual(alertasTrasCancelar.filter((t) => t.trim() !== ""), [], `Alertas inesperadas tras cancelar: ${JSON.stringify(alertasTrasCancelar)}`);

      // Elegir elemento del Picker -> crea enlace
      await page.getByRole("button", { name: /Elegir de Drive/i }).click();
      await dlg.waitFor();
      await dlg.getByRole("button", { name: "Recursos del equipo 2026" }).click();
      await page.getByText("Recursos del equipo 2026", { exact: true }).waitFor();
      assert.equal(enlacesEquipo.length, 1);

      // Duplicado bloqueado
      await page.getByRole("button", { name: /Elegir de Drive/i }).click();
      await dlg.waitFor();
      await dlg.getByRole("button", { name: "Recursos del equipo 2026" }).click();
      await page.getByText("Ese enlace ya está en la lista.").waitFor();
      assert.equal(enlacesEquipo.length, 1);

      // Error del Picker legible
      pickerTokenError = true;
      await page.getByRole("button", { name: /Elegir de Drive/i }).click();
      await page.getByText("No pudimos preparar Google Drive.").waitFor();
      pickerTokenError = false;
      await medir("03-equipo-con-enlace-y-picker");

      // --- 2. Chat: Admin usa Google Picker real y tarjeta muestra botón "Abrir carpeta" ---
      await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
      await page.getByText("Cliente Histórico").waitFor();
      const abrirHist = page.getByRole("link", { name: /Abrir carpeta/i }).first();
      await abrirHist.waitFor();
      assert.equal(await abrirHist.getAttribute("href"), carpeta("hist_100"));
      assert.equal(await page.locator("a a").count(), 0);

      // Verificar fila única del compositor (todos los botones en la misma fila horizontal, sin partirse en 2 filas)
      const compositorRects = await page.evaluate(() => {
        const comp = document.querySelector("[data-rc-compositor]");
        const compRect = comp.getBoundingClientRect();
        const btns = [...comp.querySelectorAll("[data-rc-compositor-boton]")].map((b) => b.getBoundingClientRect());
        return {
          compHeight: Math.round(compRect.height),
          btns: btns.map((r) => ({ left: Math.round(r.left), top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) })),
        };
      });
      assert.ok(compositorRects.btns.length >= 3);
      assert.ok(compositorRects.compHeight <= 64, `Compositor demasiado alto: ${compositorRects.compHeight}px`);
      for (let i = 1; i < compositorRects.btns.length; i++) {
        assert.ok(compositorRects.btns[i].left > compositorRects.btns[i - 1].left, `Botón ${i} cayó a otra fila: ${JSON.stringify(compositorRects)}`);
      }

      // Admin abre + -> Carpeta de Drive -> Google Picker abre -> cancelar sin error -> elegir -> borrador -> Enviar
      await page.getByRole("button", { name: "Adjuntar" }).click();
      await page.getByRole("menuitem", { name: /Carpeta de Drive/ }).click();
      await dlg.waitFor();
      await dlg.getByRole("button", { name: "Cancelar", exact: true }).click();
      await dlg.waitFor({ state: "detached" });
      assert.equal(mensajesChat.length, 1);

      await page.getByRole("button", { name: "Adjuntar" }).click();
      await page.getByRole("menuitem", { name: /Carpeta de Drive/ }).click();
      await dlg.waitFor();
      await dlg.getByRole("button", { name: "Tomas Estudio Norte" }).click();

      // Debe quedar en borrador SIN enviarse aún
      await page.getByTitle("Tomas Estudio Norte").waitFor();
      assert.equal(mensajesChat.length, 1);
      await page.getByRole("button", { name: "Enviar mensaje" }).click();
      await page.getByText("Tomas Estudio Norte").waitFor();
      assert.equal(mensajesChat.length, 2);

      // Botón visible "Abrir carpeta" abre URL en pestaña nueva
      const botonesAbrir = page.getByRole("link", { name: /Abrir carpeta/i });
      assert.equal(await botonesAbrir.count(), 2);
      const ultimoAbrir = botonesAbrir.last();
      assert.equal(await ultimoAbrir.getAttribute("href"), carpeta("tomas_norte"));
      assert.equal(await ultimoAbrir.getAttribute("target"), "_blank");
      await ctx.route(carpeta("tomas_norte"), (r) => r.fulfill({ contentType: "text/plain", body: "Carpeta Drive QA" }));
      const nuevaTabPromise = ctx.waitForEvent("page");
      await ultimoAbrir.click();
      const nuevaTab = await nuevaTabPromise;
      await nuevaTab.waitForURL(carpeta("tomas_norte"));
      await nuevaTab.close();
      await medir("04-chat-admin-drive");

      // --- 3. Trabajador no admin en chat y vistas de trabajo ---
      perfilActual = miembro;
      adminCallsPorNoAdmin = 0;
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Adjuntar" }).click();
      await page.getByRole("menuitem", { name: /Carpeta de Drive/ }).click();
      await page.getByText("Solo carpetas autorizadas · para editar abre directo en Drive.").waitFor();
      const carpetaEstudio = page.getByRole("button", { name: "Estudio Norte Cliente", exact: true });
      await carpetaEstudio.waitFor();
      assert.equal(adminCallsPorNoAdmin, 0, "No admin nunca debe llamar /api/admin/*");
      await medir("05-chat-trabajador-carpetas");
      await carpetaEstudio.click();
      await page.getByRole("button", { name: "Enviar mensaje" }).click();
      await page.getByText("Estudio Norte", { exact: true }).first().waitFor();

      // Verificar que no admin no ve controles de edición de Drive en ficha de cliente ni trabajo
      await page.goto(`${base}/clientes/1/editar`, { waitUntil: "domcontentloaded" });
      await page.getByText("Ficha de solo lectura.").waitFor();
      assert.equal(await page.getByRole("button", { name: /Seleccionar en Google Drive|Guardar ficha/ }).count(), 0);

      await page.goto(`${base}/trabajos/10`, { waitUntil: "domcontentloaded" });
      await page.getByRole("link", { name: /Carpeta de la tarea/i }).waitFor();
      assert.equal(await page.getByRole("button", { name: /Crear carpeta|Cambiar|Quitar/ }).count(), 0);
      assert.equal(adminCallsPorNoAdmin, 0, "No admin no disparó llamadas /api/admin/* en sus flujos");
      assert.deepEqual(erroresConsola, [], `Errores de página en ${width}-${modo}: ${erroresConsola.join("; ")}`);
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

writeFileSync(`${dir}/mediciones.json`, `${JSON.stringify(resultados, null, 2)}\n`);
console.log("QA COMPLETADO:", resultados.length, "capturas verificadas");
