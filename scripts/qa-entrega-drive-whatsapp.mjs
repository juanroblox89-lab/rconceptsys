import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.QA_BASE ?? "http://127.0.0.1:3336";
const dir = process.env.QA_DIR ?? "capturas-entrega-drive-whatsapp";
mkdirSync(dir, { recursive: true });

// PNG 1x1 válido (67 bytes)
const pngValido = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const admin = { id: "admin-qa", nombre: "Juan Admin", estado: "aprobado", es_admin: true, roles: [] };
const miembro = { id: "editor-qa", nombre: "Kantel", estado: "aprobado", es_admin: false, roles: [{ id: 2, clave: "editor", nombre: "Editor", color: "#5aa9ff", orden: 1, activo: true }] };
const cliente = { id: 1, nombre: "Kantel", activo: true, drive_carpeta_id: "cliente_kantel", drive_url: "https://drive.google.com/drive/folders/cliente_kantel" };
const tipoEdicion = { id: 2, clave: "edicion_video", nombre: "Edición de video", precio: 75000, unidad: "trabajo", activo: true, rol: { id: 2, nombre: "Editor" } };

const docsMock = [
  { id: "cortes_finales_1", name: "Cortes finales", mimeType: "application/vnd.google-apps.folder", url: "https://drive.google.com/drive/folders/cortes_finales_1" },
  { id: "reel_final_2", name: "Reel_final.mp4", mimeType: "video/mp4", url: "https://drive.google.com/file/d/reel_final_2/view" },
  { id: "sfx_libreria_3", name: "Librería SFX", mimeType: "application/vnd.google-apps.folder", url: "https://drive.google.com/drive/folders/sfx_libreria_3" },
];

const pickerYGisScript = `(() => {
  if (window.__qaPickerReady) return;
  window.__qaPickerReady = true;
  const docs = ${JSON.stringify(docsMock)};
  window.__pickerOpens = 0;
  window.__gisCalls = 0;
  window.__pickerSelected = [];
  window.gapi = { load: (_n, opt) => opt.callback() };
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient(cfg) {
          return {
            requestAccessToken() {
              window.__gisCalls++;
              cfg.callback({ access_token: "gis-worker-drive-file-token", expires_in: 3600 });
            }
          };
        }
      }
    },
    picker: {
      DocsView: class {
        setParent(id) { this._parent = id; return this; }
        setIncludeFolders(v) { this._folders = v; return this; }
        setSelectFolderEnabled(v) { this._selectFolder = v; return this; }
        setOwnedByMe(v) { this._owned = v; return this; }
      },
      PickerBuilder: class {
        setOAuthToken(t) { this._token = t; return this; }
        setDeveloperKey() { return this; }
        setOrigin() { return this; }
        setAppId() { return this; }
        setLocale() { return this; }
        setMaxItems() { return this; }
        enableFeature() { return this; }
        addView() { return this; }
        setCallback(cb) { this.cb = cb; return this; }
        build() {
          window.__pickerOpens++;
          const cb = this.cb;
          const d = document.createElement("dialog");
          d.className = "picker-dialog";
          d.setAttribute("aria-label", "Selector de Google Drive QA");
          d.style.cssText = "margin:auto;padding:16px;width:min(92vw,380px);border:1px solid var(--rc-gris-300);border-radius:14px;background:var(--rc-superficie);color:var(--rc-texto);display:flex;flex-direction:column;gap:8px;z-index:2000;";
          const title = document.createElement("h2");
          title.textContent = "Google Drive (QA)";
          title.style.cssText = "margin:0;font-size:15px;";
          d.append(title);
          for (const doc of docs) {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "rc-btn rc-btn--secundario rc-btn--sm";
            b.textContent = doc.name;
            b.onclick = () => {
              window.__pickerSelected.push(doc.name);
              cb({ action: "picked", docs: [doc] });
              if (d.open) d.close();
            };
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

// Cálculo WCAG de contraste relativo sobre colores CSS (soporta rgb/rgba y mezcla contra el fondo padre)
async function medirContrasteNota(page, selector) {
  return page.evaluate((sel) => {
    function parseRgb(str) {
      const m = str.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/i);
      if (!m) return null;
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] !== undefined ? Number(m[4]) : 1 };
    }
    function blend(fg, bg) {
      const a = fg.a;
      return {
        r: Math.round(fg.r * a + bg.r * (1 - a)),
        g: Math.round(fg.g * a + bg.g * (1 - a)),
        b: Math.round(fg.b * a + bg.b * (1 - a)),
        a: 1,
      };
    }
    function lum({ r, g, b }) {
      const ch = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    }
    function ratio(c1, c2) {
      const l1 = lum(c1);
      const l2 = lum(c2);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }
    const el = document.querySelector(sel);
    if (!el) return null;
    const strong = el.querySelector("strong") || el;
    // Fondo efectivo recorriendo ancestros hasta un fondo opaco
    let bg = { r: 236, g: 238, b: 243, a: 1 };
    const cadena = [];
    for (let cur = el; cur && cur instanceof Element; cur = cur.parentElement) {
      const c = parseRgb(getComputedStyle(cur).backgroundColor);
      if (c && c.a > 0) cadena.unshift(c);
    }
    if (getComputedStyle(document.documentElement).colorScheme.includes("dark")) {
      bg = { r: 23, g: 28, b: 37, a: 1 };
    }
    for (const c of cadena) bg = blend(c, bg);
    const fgTexto = parseRgb(getComputedStyle(el).color);
    const fgStrong = parseRgb(getComputedStyle(strong).color);
    return {
      ratioTexto: Number(ratio(fgTexto, bg).toFixed(2)),
      ratioStrong: Number(ratio(fgStrong, bg).toFixed(2)),
      bg,
      fgStrong,
    };
  }, selector);
}

const matriz = [
  { width: 375, modo: "claro", tema: "rconcept" },
  { width: 1280, modo: "claro", tema: "rconcept" },
  { width: 375, modo: "oscuro", tema: "rconcept" },
  { width: 1280, modo: "oscuro", tema: "glass" },
];

const resultados = [];
const browser = await chromium.launch({
  headless: true,
  channel: "msedge",
  args: [
    "--renderer-process-limit=2",
    "--disable-background-networking",
    "--disable-gpu",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});

try {
  for (const { width, modo, tema } of matriz) {
    const slug = `${width}-${modo}-${tema}`;
    const ctx = await browser.newContext({
      viewport: { width, height: width === 375 ? 812 : 800 },
      colorScheme: modo === "claro" ? "light" : "dark",
      reducedMotion: "reduce",
      serviceWorkers: "block",
      permissions: ["microphone"],
      acceptDownloads: true,
    });

    try {
      await ctx.addCookies([{ name: "rc_access_token", value: "qa-entrega", url: base }]);
      const page = await ctx.newPage();
      page.setDefaultNavigationTimeout(120_000);
      page.setDefaultTimeout(20_000);

      const errores = [];
      page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
      page.on("console", (msg) => {
        if (msg.type() === "error") errores.push(`console: ${msg.text()}`);
      });

      let perfilActual = miembro;
      let forcingConflict = false;
      let histSeq = 10;
      const adjuntosMap = new Map();

      let tarea = {
        id: 50,
        tipo_id: 2,
        tipo: tipoEdicion,
        cliente_id: 1,
        cliente,
        titulo: "Poposiata",
        descripcion: "Poposiata",
        asignado_a: miembro.id,
        asignado: miembro,
        creado_por: admin.id,
        estado: "pendiente",
        fecha_limite: "2026-11-23",
        drive_carpeta_id: "carpeta_trabajo_50",
        drive_carpeta_url: "https://drive.google.com/drive/folders/carpeta_trabajo_50",
        drive_referencias: [
          { id: "carpeta_trabajo_50", nombre: "Carpeta del trabajo", url: "https://drive.google.com/drive/folders/carpeta_trabajo_50", tipo: "carpeta" },
        ],
        creada_en: "2026-11-20T10:00:00Z",
        historial: [],
      };

      const tareaDriveExtra = {
        id: 51,
        tipo_id: 2,
        tipo: tipoEdicion,
        cliente_id: 1,
        cliente,
        titulo: "Video con Drive",
        descripcion: "Video con Drive",
        asignado_a: miembro.id,
        asignado: miembro,
        creado_por: admin.id,
        estado: "hecha",
        fecha_limite: "2026-11-27",
        metodo_entrega: "drive",
        enlace_medios: "https://drive.google.com/drive/folders/cortes_finales_1",
        entrega_nombre: "Cortes finales",
        entrega_tipo: "carpeta",
        nota_persona: "Todo listo en Drive",
        creada_en: "2026-11-21T10:00:00Z",
        hecha_en: "2026-11-25T15:00:00Z",
        historial: [],
      };

      await ctx.route("**/*", async (route) => {
        const req = route.request();
        const u = new URL(req.url());
        const p = u.pathname;
        const method = req.method();
        if (u.origin === "https://apis.google.com" || u.origin === "https://accounts.google.com") {
          return route.fulfill({ contentType: "text/javascript", body: pickerYGisScript });
        }
        if (u.origin !== base) return route.abort();
        if (p.startsWith("/medios-qa/")) {
          const id = p.split("/")[2];
          const adj = adjuntosMap.get(id);
          if (!adj) return route.fulfill({ status: 404 });
          return route.fulfill({ status: 200, body: adj.buf, contentType: adj.mime });
        }
        if (!p.startsWith("/api/")) return route.continue();

        const enviar = (json, status = 200) => route.fulfill({ json, status });
        if (p === "/api/yo") return enviar(perfilActual);
        if (p === "/api/yo/celular") return enviar({ celular: "+573001234567" });
        if (p === "/api/yo/apariencia") return enviar({ modo, tema, movimiento: "sistema", contraste: false, oscurecido: 5 });
        if (p === "/api/equipo/resumen") return enviar({ nombre: "RConcept", descripcion: "", enlaces: [] });
        if (p === "/api/notificaciones") return enviar({ no_leidas: 0, notificaciones: [] });
        if (p === "/api/notificaciones/preferencias") return enviar({ tipos_silenciados: [] });
        if (p === "/api/push/clave") return enviar({ configurado: false, clave: "" });

        if (p === "/api/tareas") {
          return enviar([tarea]);
        }
        if (p === "/api/tareas/50/detalle" || p === "/api/admin/tareas/50") {
          return enviar(tarea);
        }
        if (p === "/api/tareas/50/drive/picker-token") {
          return enviar({
            modo: "gis_solo_lectura",
            client_id: "cid-qa",
            clave: "pk-qa",
            proyecto_id: "999",
            scope: "https://www.googleapis.com/auth/drive.file",
            carpeta_id: tarea.drive_carpeta_id,
            equipo_conectado: true,
          });
        }
        if (p === "/api/tareas/50/drive/archivos") {
          return enviar([
            { id: "sub_entregas", nombre: "Entregas", mime: "application/vnd.google-apps.folder", enlace: "https://drive.google.com/drive/folders/sub_entregas", es_carpeta: true },
            { id: "clip_editado_50", nombre: "Clip_editado.mp4", mime: "video/mp4", enlace: "https://drive.google.com/file/d/clip_editado_50/view", es_carpeta: false },
          ]);
        }
        if (p === "/api/tareas/50/hecha" && method === "POST") {
          const b = req.postDataJSON();
          const ahora = "2026-11-26T05:00:00Z";
          tarea = {
            ...tarea,
            estado: "hecha",
            nota_persona: b.nota ?? null,
            metodo_entrega: b.metodo_entrega ?? null,
            enlace_medios: b.metodo_entrega === "whatsapp" ? null : (b.enlace_medios ?? null),
            entrega_nombre: b.metodo_entrega === "whatsapp" ? null : (b.entrega_nombre ?? null),
            entrega_tipo: b.metodo_entrega === "whatsapp" ? null : (b.entrega_tipo ?? null),
            hecha_en: ahora,
            motivo_rechazo: null,
            borrador_entrega: null,
            historial: [
              ...tarea.historial,
              {
                id: ++histSeq,
                tarea_id: 50,
                actor_nombre: miembro.nombre,
                evento: "entrega_enviada",
                detalle: b.metodo_entrega === "whatsapp" ? "Entrega enviada por WhatsApp" : "Entrega enviada por Drive",
                metodo_entrega: b.metodo_entrega,
                enlace_medios: b.metodo_entrega === "whatsapp" ? null : b.enlace_medios,
                entrega_nombre: b.metodo_entrega === "whatsapp" ? null : b.entrega_nombre,
                entrega_tipo: b.metodo_entrega === "whatsapp" ? null : b.entrega_tipo,
                nota: b.nota ?? null,
                creado_en: ahora,
              },
            ],
          };
          return enviar(tarea);
        }
        if (p === "/api/tareas/50/revertir" && method === "POST") {
          if (forcingConflict) {
            forcingConflict = false;
            tarea = { ...tarea, estado: "aceptada", precio_congelado: 75000 };
            return enviar({ error: { codigo: "no_reversible", mensaje: "No puedes editar esta entrega porque ya fue aceptada." } }, 409);
          }
          const borrador = {
            id: 1,
            tarea_id: 50,
            perfil_id: miembro.id,
            metodo_entrega: tarea.metodo_entrega,
            enlace_medios: tarea.enlace_medios,
            entrega_nombre: tarea.entrega_nombre,
            entrega_tipo: tarea.entrega_tipo,
            nota: tarea.nota_persona,
            estado: "retirada",
            creada_en: tarea.hecha_en,
          };
          tarea = {
            ...tarea,
            estado: "pendiente",
            hecha_en: null,
            metodo_entrega: null,
            enlace_medios: null,
            entrega_nombre: null,
            entrega_tipo: null,
            nota_persona: null,
            borrador_entrega: borrador,
            historial: [
              ...tarea.historial,
              {
                id: ++histSeq,
                tarea_id: 50,
                actor_nombre: miembro.nombre,
                evento: "entrega_retirada",
                detalle: "Entrega retirada por el trabajador",
                metodo_entrega: borrador.metodo_entrega,
                enlace_medios: borrador.enlace_medios,
                entrega_nombre: borrador.entrega_nombre,
                entrega_tipo: borrador.entrega_tipo,
                nota: borrador.nota,
                creado_en: "2026-11-26T05:05:00Z",
              },
            ],
          };
          return enviar(tarea);
        }

        if (p === "/api/admin/miembros") return enviar([miembro]);
        if (p === "/api/admin/tareas") return enviar({ tareas: [tarea, tareaDriveExtra], por_revisar: 2 });
        if (p === "/api/admin/drive/picker-token") {
          return enviar({ access_token: "adm-tok", expires_in: 3600, carpeta_id: "cliente_kantel", clave: "pk", proyecto_id: "999" });
        }
        if (p === "/api/admin/tareas/50/rechazar" && method === "POST") {
          const b = req.postDataJSON();
          const hid = ++histSeq;
          const evento = {
            id: hid,
            tarea_id: 50,
            actor_nombre: admin.nombre,
            evento: "entrega_rechazada",
            detalle: "Entrega devuelta con observaciones",
            motivo: b.motivo,
            drive_adjuntos: b.drive_adjuntos ?? [],
            adjuntos: [],
            creado_en: "2026-11-26T05:10:00Z",
          };
          tarea = {
            ...tarea,
            estado: "rechazada",
            motivo_rechazo: b.motivo,
            resuelta_en: evento.creado_en,
            rechazo_actual: {
              historial_id: hid,
              motivo: b.motivo,
              drive_adjuntos: b.drive_adjuntos ?? [],
              adjuntos: [],
              creado_en: evento.creado_en,
            },
            historial: [...tarea.historial, evento],
          };
          return enviar(tarea);
        }

        const mAdj = /^\/api\/(admin\/)?tareas\/50\/adjuntos(?:\/([^/]+))?(?:\/(.*))?$/.exec(p);
        if (mAdj) {
          const [, esAdmin, id, accion] = mAdj;
          if (!id && method === "GET") {
            return enviar([]);
          }
          if (esAdmin && !id && method === "POST") {
            const b = req.postDataJSON();
            adjuntosMap.set(b.id, { ...b, partes: [], listo: false });
            return enviar({ id: b.id, parte_bytes: 512 * 1024, listo: false });
          }
          const a = adjuntosMap.get(id);
          if (!a) return enviar({}, 404);
          if (esAdmin && accion?.startsWith("partes/")) {
            a.partes[Number(accion.split("/")[1])] = req.postDataBuffer();
            return route.fulfill({ status: 204 });
          }
          if (esAdmin && accion === "finalizar") {
            a.listo = true;
            a.buf = Buffer.concat(a.partes);
            a.mime = a.tipo === "imagen" ? "image/png" : "audio/webm";
            const vista = { id: a.id, tipo: a.tipo, nombre: a.nombre, tamano: a.tamano, mime: a.mime };
            if (tarea.rechazo_actual) {
              tarea.rechazo_actual.adjuntos = [...(tarea.rechazo_actual.adjuntos ?? []), vista];
              const lastH = tarea.historial.find((h) => h.id === tarea.rechazo_actual.historial_id);
              if (lastH) lastH.adjuntos = [...(lastH.adjuntos ?? []), vista];
            }
            return enviar(vista, 201);
          }
          if (!esAdmin && accion === "firma") {
            return enviar({ url: `${base}/medios-qa/${a.id}`, expira_en: 300 });
          }
        }
        return enviar([]);
      });

      await page.addInitScript(pickerYGisScript);

      // 1. Trabajador abre /tareas, abre modal "Marcar tarea como hecha"
      await page.goto(`${base}/tareas`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Entregar" }).click();
      const dialogo = page.getByRole("dialog", { name: "Marcar tarea como hecha" });
      await dialogo.waitFor();

      // Verifica selector segmentado con teclado y elige Drive via Picker (carpeta) -> Quitar -> Cancelar -> Picker (archivo)
      const radioWA = dialogo.getByRole("radio", { name: "Entrega por WhatsApp" });
      const radioDrive = dialogo.getByRole("radio", { name: "Entrega por Drive" });
      await radioDrive.focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await radioWA.getAttribute("aria-checked"), "true");
      await page.keyboard.press("ArrowLeft");
      assert.equal(await radioDrive.getAttribute("aria-checked"), "true");

      await dialogo.getByRole("button", { name: "Elegir de Drive" }).click();
      await page.getByRole("dialog", { name: "Selector de Google Drive QA" }).getByRole("button", { name: "Cortes finales" }).click();
      await dialogo.getByText("Cortes finales").waitFor();
      await dialogo.getByText("Carpeta de Drive").waitFor();
      await page.screenshot({ path: `${dir}/01-modal-drive-${slug}.png`, fullPage: true });

      // Quitar selección y probar carpeta del trabajo + cancelar Picker
      await dialogo.getByRole("button", { name: "Quitar Cortes finales" }).click();
      await dialogo.getByRole("button", { name: "Carpeta del trabajo" }).click();
      await dialogo.getByText("Clip_editado.mp4").waitFor();
      await dialogo.getByRole("button", { name: "Ocultar carpeta del trabajo" }).click();

      await dialogo.getByRole("button", { name: "Pegar enlace manualmente" }).click();
      await dialogo.getByLabel("Enlace de Drive").fill("http://no-valido.com");
      await dialogo.getByText("El enlace debe empezar con https://").waitFor();
      await dialogo.getByRole("button", { name: "Ocultar enlace manual" }).click();

      await dialogo.getByRole("button", { name: "Elegir de Drive" }).click();
      await page.getByRole("dialog", { name: "Selector de Google Drive QA" }).getByRole("button", { name: "Cancelar" }).click();
      assert.equal(await dialogo.isVisible(), true);

      // Reabrir Picker y elegir archivo
      await dialogo.getByRole("button", { name: "Elegir de Drive" }).click();
      await page.getByRole("dialog", { name: "Selector de Google Drive QA" }).getByRole("button", { name: "Reel_final.mp4" }).click();
      await dialogo.getByText("Reel_final.mp4").waitFor();
      await dialogo.getByLabel("Nota (opcional)").fill("No lo sé rick");
      await dialogo.getByRole("button", { name: "Enviar a revisión" }).click();

      // 2. Verifica en "Por revisar" contraste de "Tu nota:" y botón "Cambiar"
      await page.getByText("Por revisar (1)").waitFor();
      await page.getByText("Tu nota:").waitFor();
      const contraste = await medirContrasteNota(page, '[class*="notaPersonaBox"]');
      assert.ok(contraste, "Debe existir notaPersonaBox");
      assert.ok(contraste.ratioStrong >= 4.5, `Contraste de «Tu nota:» insuficiente (${contraste.ratioStrong}:1) en ${slug}`);
      assert.ok(contraste.ratioTexto >= 4.5, `Contraste de texto de nota insuficiente (${contraste.ratioTexto}:1) en ${slug}`);
      await page.screenshot({ path: `${dir}/02-por-revisar-contraste-${slug}.png`, fullPage: true });

      // 3. Reversión con "Cambiar" -> vuelve a pendiente prellenado -> cambia a WhatsApp -> reenvía
      await page.getByRole("button", { name: "Cambiar" }).click();
      const dialogoEdit = page.getByRole("dialog", { name: "Marcar tarea como hecha" });
      await dialogoEdit.waitFor();
      assert.equal(await dialogoEdit.getByLabel("Nota (opcional)").inputValue(), "No lo sé rick");
      await dialogoEdit.getByText("Reel_final.mp4").waitFor();
      await dialogoEdit.getByRole("radio", { name: "Entrega por WhatsApp" }).click();
      await dialogoEdit.getByText("Se registrará que entregaste este trabajo por WhatsApp.").waitFor();
      await page.screenshot({ path: `${dir}/03-modal-whatsapp-${slug}.png`, fullPage: true });
      await dialogoEdit.getByLabel("Nota (opcional)").fill("Enviado por WhatsApp hoy");
      await dialogoEdit.getByRole("button", { name: "Enviar a revisión" }).click();

      await page.getByText("Entregado por WhatsApp").waitFor();

      // Verifica Escape en modal + overflow horizontal
      const overflowTrabajador = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflowTrabajador, false, `Desborde horizontal trabajador en ${slug}`);

      // 4. Cambia a Admin -> verifica Bandeja por revisar + Modal Rechazar con audio, imagen y Drive
      perfilActual = admin;
      await page.goto(`${base}/tareas`, { waitUntil: "networkidle" });
      await page.getByText("Bandeja por revisar (2)").waitFor();
      await page.getByText("Entregado por WhatsApp").first().waitFor();
      await page.getByRole("link", { name: /Abrir en Drive/i }).first().waitFor();
      await page.screenshot({ path: `${dir}/04-admin-bandeja-${slug}.png`, fullPage: true });

      const tarjetasAdmin = page.locator("article");
      await tarjetasAdmin.first().getByRole("button", { name: "Rechazar" }).click();
      const modalRechazo = page.getByRole("dialog", { name: "Rechazar tarea" });
      await modalRechazo.waitFor();

      // Escape cierra modal limpiamente; luego se reabre
      await page.keyboard.press("Escape");
      assert.equal(await modalRechazo.isVisible(), false);
      await tarjetasAdmin.first().getByRole("button", { name: "Rechazar" }).click();
      await modalRechazo.waitFor();

      await modalRechazo.getByLabel("Motivo del rechazo *").fill("Ponle más efectos de sonido.");

      // Adjuntar imagen sintética + grabar audio sintético + elegir elemento de Drive
      const inputFile = modalRechazo.locator('input[type="file"]');
      await inputFile.setInputFiles({ name: "referencia.png", mimeType: "image/png", buffer: pngValido });
      await modalRechazo.getByText("referencia.png").waitFor();

      await modalRechazo.getByRole("button", { name: "Grabar audio" }).click();
      await modalRechazo.getByRole("button", { name: "Detener" }).waitFor();
      await page.waitForTimeout(900);
      await modalRechazo.getByRole("button", { name: "Detener" }).click();
      await modalRechazo.locator("audio").first().waitFor();

      await modalRechazo.getByRole("button", { name: "Elegir de Drive" }).click();
      await page.getByRole("dialog", { name: "Selector de Google Drive QA" }).getByRole("button", { name: "Librería SFX" }).click();
      await modalRechazo.getByText("Librería SFX").waitFor();
      await page.screenshot({ path: `${dir}/05-modal-rechazar-${slug}.png`, fullPage: true });

      await modalRechazo.getByRole("button", { name: "Rechazar tarea" }).click();
      await modalRechazo.waitFor({ state: "detached" });

      // 5. Trabajador ve la tarea rechazada con sus adjuntos en tarjeta y en /trabajos/50
      perfilActual = miembro;
      await page.goto(`${base}/tareas`, { waitUntil: "networkidle" });
      await page.getByText("Rechazadas (1)").waitFor();
      await page.getByText("Ponle más efectos de sonido.").first().waitFor();
      await page.getByText("Librería SFX").first().waitFor();
      await page.getByText("referencia.png").first().waitFor();
      await page.screenshot({ path: `${dir}/06-trabajador-rechazada-${slug}.png`, fullPage: true });

      await page.goto(`${base}/trabajos/50?desde=tareas`, { waitUntil: "networkidle" });
      await page.getByText("Entrega retirada por el trabajador").first().waitFor();
      await page.getByText("Entrega devuelta con observaciones").first().waitFor();
      await page.getByText("Librería SFX").first().waitFor();
      await page.screenshot({ path: `${dir}/07-detalle-historial-${slug}.png`, fullPage: true });

      const overflowDetalle = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflowDetalle, false, `Desborde horizontal detalle en ${slug}`);
      assert.equal(errores.length, 0, `Errores en consola/página (${slug}): ${errores.join(" | ")}`);

      // Prueba rápida de 409 en "Cambiar" cuando admin ya aceptó
      forcingConflict = true;
      tarea = { ...tarea, estado: "hecha", metodo_entrega: "whatsapp", nota_persona: "Segunda entrega" };
      await page.goto(`${base}/tareas`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Cambiar" }).click();
      await page.getByText("No puedes editar esta entrega porque ya fue aceptada.").waitFor();
      await page.getByText("Aceptadas (1)").waitFor();

      resultados.push({
        slug,
        ok: true,
        contrasteNota: contraste,
        overflowTrabajador,
        overflowDetalle,
      });
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

writeFileSync(`${dir}/mediciones.json`, JSON.stringify(resultados, null, 2));
console.log("QA COMPLETO OK:", JSON.stringify(resultados, null, 2));
