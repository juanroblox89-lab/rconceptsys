import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const PORT = 3341;
const base = `http://127.0.0.1:${PORT}`;
const dir = "C:/Users/USUARIO/AppData/Local/Temp/qa-pulido-26nov";
mkdirSync(dir, { recursive: true });

const paredSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1a2a3a"/><stop offset="100%" stop-color="#4e6e8a"/></linearGradient></defs><rect width="900" height="700" fill="url(#g)"/><circle cx="240" cy="200" r="170" fill="#e8dab8" opacity="0.55"/><circle cx="700" cy="520" r="220" fill="#2b455e" opacity="0.7"/></svg>';

const admin = {
  id: "adm-qa",
  nombre: "Juan Admin",
  correo: "juan@rconcept.com",
  estado: "aprobado",
  es_admin: true,
  roles: [],
};
const editor = {
  id: "ed-qa",
  nombre: "Lina Editor",
  correo: "lina@rconcept.com",
  estado: "aprobado",
  es_admin: false,
  roles: [{ id: 1, clave: "editor", nombre: "Editor", color: "#2F7FE0", orden: 1, activo: true }],
};
const tipo = {
  id: 1,
  clave: "edicion_reel",
  nombre: "Edición de reel",
  rol_id: 1,
  precio: 90000,
  unidad: "trabajo",
  activo: true,
  orden: 1,
};
const cliente = {
  id: 1,
  nombre: "La Sixtina",
  activo: true,
  notas: "Usar tipografía principal.",
  drive_carpeta_id: "sixtina_id",
  drive_url: "https://drive.google.com/drive/folders/sixtina_id",
  drive_referencias: [
    {
      id: "clips_sixtina",
      nombre: "Material crudo marzo",
      url: "https://drive.google.com/drive/folders/clips_sixtina",
      ruta: "Mi unidad / Rohlfing concept / Clientes / La Sixtina",
    },
  ],
};

const tareaPorCorregir = {
  id: 10,
  tipo_id: 1,
  tipo,
  cliente_id: 1,
  cliente,
  titulo: "Reel campaña lanzamiento",
  descripcion: "Ajustar ritmo en los primeros 3 segundos y exportar versión vertical 9:16.",
  asignado_a: "ed-qa",
  asignado: editor,
  creado_por: "adm-qa",
  creador: admin,
  estado: "rechazada",
  fecha_limite: "2026-11-20",
  nota_persona: "Subí los dos cortes al Drive del proyecto.",
  metodo_entrega: "drive",
  enlace_medios: "https://drive.google.com/drive/folders/corte_v1",
  entrega_nombre: "Cortes v1",
  entrega_tipo: "carpeta",
  entrega_drive: [
    { id: "corte_v1", nombre: "Cortes v1", url: "https://drive.google.com/drive/folders/corte_v1", tipo: "carpeta" },
    { id: "portada_v1", nombre: "Portada.png", url: "https://drive.google.com/file/d/portada_v1/view", tipo: "archivo" },
  ],
  drive_carpeta_id: "tarea_10_dir",
  drive_carpeta_url: "https://drive.google.com/drive/folders/tarea_10_dir",
  drive_referencias: [
    { id: "clips_sixtina", nombre: "Material crudo marzo", url: "https://drive.google.com/drive/folders/clips_sixtina", tipo: "carpeta", ruta: "Mi unidad / Rohlfing concept / Clientes / La Sixtina" },
  ],
  motivo_rechazo: "Falta subir la música en el cierre y corregir el texto del primer cuadro.",
  rechazo_actual: {
    historial_id: 22,
    motivo: "Falta subir la música en el cierre y corregir el texto del primer cuadro.",
    drive_adjuntos: [
      { id: "sfx_ref", nombre: "Librería SFX cierre", url: "https://drive.google.com/drive/folders/sfx_ref", tipo: "carpeta" },
      { id: "guion_ref", nombre: "Guion corregido", url: "https://docs.google.com/document/d/guion_ref/edit", tipo: "archivo" },
    ],
    adjuntos: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        tipo: "audio",
        nombre: "notas-admin.webm",
        tamano: 2516582,
        mime: "audio/webm",
        resumir: true,
        estado_resumen: "listo",
        resumen: ["Subir música en últimos 4 s.", "Corregir tilde en gancho.", "Exportar 1080x1920."],
        transcripcion: "Hola Lina, por favor sube un poco la música en los últimos cuatro segundos y corrige la tilde.",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        tipo: "imagen",
        nombre: "frame-gancho.png",
        tamano: 1258291,
        mime: "image/png",
      },
    ],
    creado_en: "2026-11-26T18:10:00Z",
  },
  creada_en: "2026-11-20T14:30:00Z",
  historial: [
    {
      id: 21,
      tarea_id: 10,
      actor_id: "ed-qa",
      actor_nombre: "Lina Editor",
      evento: "entrega_enviada",
      detalle: "Entrega enviada por Drive",
      metodo_entrega: "drive",
      entrega_drive: [
        { id: "corte_v1", nombre: "Cortes v1", url: "https://drive.google.com/drive/folders/corte_v1", tipo: "carpeta" },
        { id: "portada_v1", nombre: "Portada.png", url: "https://drive.google.com/file/d/portada_v1/view", tipo: "archivo" },
      ],
      nota: "Subí los dos cortes al Drive del proyecto.",
      creado_en: "2026-11-26T17:16:00Z",
    },
    {
      id: 22,
      tarea_id: 10,
      actor_id: "adm-qa",
      actor_nombre: "Juan Admin",
      evento: "entrega_rechazada",
      detalle: "Entrega devuelta con observaciones",
      motivo: "Falta subir la música en el cierre y corregir el texto del primer cuadro.",
      drive_adjuntos: [
        { id: "sfx_ref", nombre: "Librería SFX cierre", url: "https://drive.google.com/drive/folders/sfx_ref", tipo: "carpeta" },
      ],
      creado_en: "2026-11-26T18:10:00Z",
    },
  ],
};

const tareaPorRevisarDrive = {
  id: 11,
  tipo_id: 1,
  tipo,
  cliente_id: 1,
  cliente,
  titulo: "Reel testimonios Q4",
  descripcion: "Entrega con carpeta y dos archivos finales para aprobación.",
  asignado_a: "ed-qa",
  asignado: editor,
  creado_por: "adm-qa",
  creador: admin,
  estado: "hecha",
  fecha_limite: "2026-11-28",
  nota_persona: "Listos los 3 entregables con música masterizada y portada.",
  metodo_entrega: "drive",
  enlace_medios: "https://drive.google.com/drive/folders/ent_q4_carp",
  entrega_nombre: "Carpeta Testimonios",
  entrega_tipo: "carpeta",
  entrega_drive: [
    { id: "ent_q4_carp", nombre: "Carpeta Testimonios", url: "https://drive.google.com/drive/folders/ent_q4_carp", tipo: "carpeta" },
    { id: "ent_q4_mp4", nombre: "Testimonio_Final.mp4", url: "https://drive.google.com/file/d/ent_q4_mp4/view", tipo: "archivo" },
    { id: "ent_q4_png", nombre: "Miniatura.png", url: "https://drive.google.com/file/d/ent_q4_png/view", tipo: "archivo" },
  ],
  drive_carpeta_id: "tarea_11_dir",
  drive_carpeta_url: "https://drive.google.com/drive/folders/tarea_11_dir",
  drive_referencias: [],
  creada_en: "2026-11-25T15:00:00Z",
  hecha_en: "2026-11-26T19:16:00Z",
};

const tareaPorRevisarWA = {
  id: 12,
  tipo_id: 1,
  tipo,
  cliente_id: 1,
  cliente,
  titulo: "Historias evento sábado",
  descripcion: "Enviado directo por WhatsApp al grupo de revisión.",
  asignado_a: "ed-qa",
  asignado: editor,
  creado_por: "adm-qa",
  creador: admin,
  estado: "hecha",
  fecha_limite: "2026-11-27",
  nota_persona: "Ya te envié los clips por WhatsApp.",
  metodo_entrega: "whatsapp",
  drive_carpeta_id: "tarea_12_dir",
  drive_carpeta_url: "https://drive.google.com/drive/folders/tarea_12_dir",
  drive_referencias: [],
  creada_en: "2026-11-25T16:00:00Z",
  hecha_en: "2026-11-26T19:45:00Z",
};

const tareaPendiente = {
  id: 13,
  tipo_id: 1,
  tipo,
  cliente_id: 1,
  cliente,
  titulo: "Reel detrás de cámaras",
  descripcion: "Montaje ágil de 25 segundos.",
  asignado_a: "ed-qa",
  asignado: editor,
  creado_por: "adm-qa",
  creador: admin,
  estado: "pendiente",
  fecha_limite: "2026-11-29",
  drive_carpeta_id: "tarea_13_dir",
  drive_carpeta_url: "https://drive.google.com/drive/folders/tarea_13_dir",
  drive_referencias: [],
  creada_en: "2026-11-26T14:00:00Z",
};

const notificacionesDemo = [
  { id: 1, tipo: "entrega-devuelta", titulo: "Entrega devuelta", cuerpo: "Juan Admin pidió corregir Reel campaña lanzamiento.", url: "/tareas?tarea=10", leida_en: null, creada_en: "2026-11-26T18:10:00Z" },
  { id: 2, tipo: "entrega-hecha", titulo: "Entrega por revisar", cuerpo: "Lina Editor entregó Reel testimonios Q4.", url: "/tareas?tarea=11", leida_en: null, creada_en: "2026-11-26T19:16:00Z" },
  { id: 3, tipo: "vencio", titulo: "Trabajo vencido", cuerpo: "Reel campaña lanzamiento venció hace 6 días.", url: "/tareas?tarea=10", leida_en: null, creada_en: "2026-11-26T15:00:00Z" },
  { id: 4, tipo: "ria", titulo: "Respuesta de RIA", cuerpo: "RIA respondió en el chat del equipo.", url: "/", leida_en: null, creada_en: "2026-11-26T16:20:00Z" },
  { id: 5, tipo: "chat", titulo: "Mensaje nuevo", cuerpo: "Lina Editor: Ya subí el audio corregido.", url: "/", leida_en: "2026-11-26T13:00:00Z", creada_en: "2026-11-26T13:00:00Z" },
];

const pickerScript = `(() => {
  window.__pickerViews = [];
  window.__pickerErrors = false;
  window.gapi = { load: (_n, opt) => opt.callback() };
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient(cfg) {
          return {
            requestAccessToken() {
              cfg.callback({ access_token: "gis-worker-qa-token", expires_in: 3600 });
            }
          };
        }
      }
    },
    picker: {
      ViewId: { DOCS: "docs", FOLDERS: "folders" },
      DocsView: class {
        constructor() { this.cfg = {}; }
        setParent(id) { this.cfg.parent = id; return this; }
        setIncludeFolders(v) { this.cfg.includeFolders = v; return this; }
        setSelectFolderEnabled(v) { this.cfg.selectFolder = v; return this; }
        setEnableDrives(v) { this.cfg.enableDrives = v; return this; }
        setLabel(l) { this.cfg.label = l; return this; }
        setOwnedByMe(v) { this.cfg.ownedByMe = v; return this; }
      },
      PickerBuilder: class {
        constructor() { this.views = []; }
        setOAuthToken(t) { this.tok = t; return this; }
        setDeveloperKey(k) { this.key = k; return this; }
        setOrigin(o) { this.origin = o; return this; }
        setAppId(id) { this.appId = id; return this; }
        setLocale() { return this; }
        setMaxItems(n) { this.max = n; return this; }
        enableFeature(f) { return this; }
        addView(v) { this.views.push(v.cfg); return this; }
        setCallback(cb) { this.cb = cb; return this; }
        build() {
          window.__pickerViews = this.views;
          const cb = this.cb;
          if (this.key === "BAD_KEY") {
            throw new Error("The API developer key is invalid");
          }
          const d = document.createElement("dialog");
          d.setAttribute("aria-label", "Selector Drive QA");
          d.innerHTML = '<button type="button" data-pick-multi>Elegir 2 elementos</button><button type="button" data-cancel>Cancelar</button>';
          d.querySelector("[data-pick-multi]").onclick = () => {
            cb({
              action: "picked",
              docs: [
                { id: "pick_c1", name: "Carpeta final QA", mimeType: "application/vnd.google-apps.folder", url: "https://drive.google.com/drive/folders/pick_c1" },
                { id: "pick_a1", name: "Master_QA.mp4", mimeType: "video/mp4", url: "https://drive.google.com/file/d/pick_a1/view" }
              ]
            });
          };
          d.querySelector("[data-cancel]").onclick = () => cb({ action: "cancel" });
          document.body.append(d);
          return {
            setVisible(v) { if (v && !d.open) d.showModal(); else if (!v && d.open) d.close(); },
            dispose() { d.remove(); }
          };
        }
      },
      Action: { PICKED: "picked", CANCEL: "cancel", ERROR: "error" },
      Feature: { MULTISELECT_ENABLED: "multiselect", SUPPORT_DRIVES: "support_drives" }
    }
  };
  // Mock getUserMedia + MediaRecorder + AudioContext for live recording bar QA
  if (!navigator.mediaDevices) navigator.mediaDevices = {};
  navigator.mediaDevices.getUserMedia = async () => ({
    getTracks: () => [{ stop: () => {} }]
  });
  window.MediaRecorder = class {
    constructor() { this.state = "inactive"; this.mimeType = "audio/webm"; }
    static isTypeSupported(t) { return t.includes("webm"); }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      if (this.ondataavailable) {
        this.ondataavailable({ data: new Blob([new Uint8Array(64)], { type: "audio/webm" }) });
      }
      if (this.onstop) this.onstop();
    }
  };
})();`;

const png1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXY0AAAAASUVORK5CYII=",
  "base64",
);

async function esperarServidor(url) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${url}/login`);
      if (r.status === 200) return;
    } catch {
      // esperando
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("El servidor Next QA no respondió a tiempo");
}

const server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT), "-H", "127.0.0.1"], {
  stdio: "ignore",
  windowsHide: true,
});
console.log(`Servidor QA iniciado (PID ${server.pid}) en ${base}`);

try {
  await esperarServidor(base);
  const browser = await chromium.launch({
    headless: true,
    channel: "msedge",
    args: ["--renderer-process-limit=2", "--disable-background-networking", "--disable-gpu"],
  });

  try {
    const casos = [
      { slug: "375-claro", width: 375, height: 812, modo: "claro", tema: "rconcept" },
      { slug: "375-oscuro", width: 375, height: 812, modo: "oscuro", tema: "rconcept-dark" },
      { slug: "375-glass", width: 375, height: 812, modo: "oscuro", tema: "glass" },
      { slug: "1280-claro", width: 1280, height: 800, modo: "claro", tema: "rconcept" },
      { slug: "1280-oscuro", width: 1280, height: 800, modo: "oscuro", tema: "rconcept-dark" },
      { slug: "1280-glass", width: 1280, height: 800, modo: "oscuro", tema: "glass" },
    ];

    for (const c of casos) {
      let perfilActual = editor;
      let badPickerKey = false;
      let postChatCount = 0;
      let riaGrupoCmds = [];
      let entregasPost = [];

      const ctx = await browser.newContext({
        viewport: { width: c.width, height: c.height },
        colorScheme: c.modo === "claro" ? "light" : "dark",
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });

      try {
        await ctx.addCookies([{ name: "rc_access_token", value: "qa-tok", url: base }]);
        await ctx.addInitScript(pickerScript);
        await ctx.route("**/*", async (route) => {
          const req = route.request();
          const u = new URL(req.url());
          const p = u.pathname;
          if (u.origin === "https://apis.google.com" || u.origin === "https://accounts.google.com") {
            return route.fulfill({ contentType: "text/javascript", body: pickerScript });
          }
          if (u.origin !== base) return route.abort();
          if (!p.startsWith("/api/")) return route.continue();
          const ok = (json, status = 200) => route.fulfill({ json, status });

          if (p === "/api/yo") return ok(perfilActual);
          if (p === "/api/yo/celular") return ok({ celular: "+573001112233" });
          if (p === "/api/yo/apariencia") {
            return ok(
              c.tema === "glass"
                ? { modo: c.modo, tema: "glass", imagen: "fondo-qa.svg", oscurecido: 35, movimiento: "sistema", contraste: false }
                : { modo: c.modo, tema: c.tema, oscurecido: 35, movimiento: "sistema", contraste: false },
            );
          }
          if (p === "/api/yo/apariencia/fondo/fondo-qa.svg") {
            return route.fulfill({ status: 200, contentType: "image/svg+xml", body: paredSvg });
          }
          if (p === "/api/equipo/resumen") {
            return ok({ nombre: "Rohlfing Concept", descripcion: "Equipo QA", enlaces: [], actividad: { mensajes: 2, tareas: 4, miembros: 2, archivos: 0 } });
          }
          if (p === "/api/equipo") return ok([admin, editor]);
          if (p === "/api/notificaciones") return ok({ notificaciones: notificacionesDemo, no_leidas: 4 });
          if (p.startsWith("/api/notificaciones")) return ok({ mensaje: "OK" });
          if (p === "/api/push/clave") return ok({ configurado: false, clave: "" });
          if (p === "/api/push/estado") return ok({ configurado: false, suscrito: false });
          if (p === "/api/chat" && req.method() === "GET") {
            return ok([
              { id: 1, autor_id: "adm-qa", autor: admin, cuerpo: "Hola equipo, revisemos las entregas.", creado_en: "2026-11-26T16:00:00Z" },
              { id: 2, autor_id: "ed-qa", autor: editor, cuerpo: "/ria ¿Qué comandos existen?", creado_en: "2026-11-26T16:01:00Z" },
              { id: 3, autor_id: "ria", es_ria: true, autor: null, cuerpo: "Comandos disponibles: `/ria <pregunta>` y `/help`.", creado_en: "2026-11-26T16:01:02Z" },
            ]);
          }
          if (p === "/api/chat" && req.method() === "POST") {
            postChatCount++;
            return ok({ id: 99, autor_id: perfilActual.id, autor: perfilActual, cuerpo: req.postDataJSON().cuerpo, creado_en: new Date().toISOString() }, 201);
          }
          if (p === "/api/chat/ria" && req.method() === "POST") {
            const body = req.postDataJSON();
            riaGrupoCmds.push(body.comando);
            const q = { id: 100, autor_id: perfilActual.id, autor: perfilActual, cuerpo: body.comando, creado_en: "2026-11-26T19:00:00Z" };
            const a = { id: 101, autor_id: "ria", es_ria: true, autor: null, cuerpo: "Puedes usar `/ria` y `/help`.", creado_en: "2026-11-26T19:00:02Z" };
            return route.fulfill({
              status: 200,
              contentType: "text/event-stream; charset=utf-8",
              body: `event: consulta\ndata: ${JSON.stringify(q)}\n\nevent: fin\ndata: ${JSON.stringify(a)}\n\n`,
            });
          }
          if (p === "/api/ria" && req.method() === "GET") return ok({ mensajes: [] });
          if (p === "/api/tareas" && req.method() === "GET") return ok([tareaPorCorregir, tareaPorRevisarDrive, tareaPorRevisarWA, tareaPendiente]);
          if (p === "/api/tareas/10/detalle" || p === "/api/admin/tareas/10") return ok(tareaPorCorregir);
          if (p === "/api/tareas/10/whatsapp") return ok({ url: "https://wa.me/573009998877", disponible: true, nombre: "Admin Dos" });
          if (p === "/api/tareas/13/whatsapp") return ok({ url: "", disponible: false, nombre: "Admin Sin Tel" });
          if (p === "/api/tareas/12/whatsapp") return ok({ url: "https://wa.me/573005554433", disponible: true, nombre: "Lina Editor" });
          if (p === "/api/tareas/10/drive/picker-token" || p === "/api/tareas/13/drive/picker-token") {
            return ok({
              modo: "gis_solo_lectura",
              client_id: "cid-qa",
              clave: badPickerKey ? "BAD_KEY" : "pk-qa",
              proyecto_id: "123",
              scope: "https://www.googleapis.com/auth/drive.file",
            });
          }
          if (p === "/api/tareas/10/hecha") {
            entregasPost.push(req.postDataJSON());
            return ok({ ...tareaPorCorregir, estado: "hecha" });
          }
          if (p.endsWith("/firma")) return ok({ url: `${base}/api/qa-img`, expira_en: 300 });
          if (p === "/api/qa-img") return route.fulfill({ status: 200, contentType: "image/png", body: png1x1 });
          if (p === "/api/admin/miembros") return ok([admin, editor]);
          if (p === "/api/admin/trabajos") return ok([tipo]);
          if (p === "/api/admin/clientes") return ok([cliente]);
          if (p === "/api/admin/piezas") return ok([]);
          if (p === "/api/admin/tareas" && req.method() === "GET") {
            return ok({ tareas: [tareaPorRevisarDrive, tareaPorRevisarWA, tareaPorCorregir, tareaPendiente], por_revisar: 2 });
          }
          if (p === "/api/admin/drive") return ok({ conectado: true, configurado: true, organizado: true, correo: "ladlejuan26@gmail.com", cuenta_equipo: "ladlejuan26@gmail.com", carpeta_raiz_id: "raiz_equipo" });
          if (p === "/api/admin/drive/picker-token") {
            return ok({ access_token: "adm-tok", expires_in: 3600, carpeta_id: "sixtina_id", raiz_id: "raiz_equipo", clave: "pk-qa", proyecto_id: "123", correo: "ladlejuan26@gmail.com", cuenta_equipo: "ladlejuan26@gmail.com" });
          }
          if (p === "/api/admin/drive/referencia") {
            return ok({ id: u.searchParams.get("id") || "x", nombre: "Elemento Drive", url: "https://drive.google.com/drive/folders/x", tipo: "carpeta", ruta: "Mi unidad / Rohlfing concept / La Sixtina" });
          }
          if (p === "/api/admin/adjuntos/resumen-borrador") {
            return ok({
              estado_resumen: "listo",
              resumen: ["Corregir gancho.", "Subir música.", "Revisar salida."],
              transcripcion: "Corregir el gancho y subir música.",
              borrador_resumen: { resumen: ["Corregir gancho.", "Subir música.", "Revisar salida."], transcripcion: "Corregir el gancho y subir música.", proveedor: "qa", token: "tok" },
            });
          }
          return ok([]);
        });

        const page = await ctx.newPage();
        const errores = [];
        page.on("pageerror", (e) => errores.push(e.message));
        const revisarDesborde = async (nombre) => {
          const m = await page.evaluate(() => ({
            vw: innerWidth,
            sw: document.documentElement.scrollWidth,
            modo: document.documentElement.dataset.rcModo,
            tema: document.documentElement.dataset.rcTema,
          }));
          assert.equal(m.sw, m.vw, `Desborde horizontal en ${c.slug} (${nombre}): ${m.sw} > ${m.vw}`);
        };

        // --- A. Chat del equipo (/help, /, /RIA, clic RIA, campana) ---
        await page.goto(`${base}/`, { waitUntil: "networkidle" });
        await page.waitForSelector('textarea[aria-label="Escribe al equipo"]');
        const caja = page.locator('textarea[aria-label="Escribe al equipo"]');
        await caja.click();
        await caja.fill("/");
        await page.locator('[data-rc-menu-comandos] [role="option"]').first().waitFor();
        await page.screenshot({ path: `${dir}/${c.slug}-01-chat-comandos.png` });
        await revisarDesborde("chat-comandos");

        // Navegar con flecha abajo (/help) + Enter -> abre ayuda local sin mandar al grupo
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await page.getByText("Comandos del chat · Solo tú ves esta ayuda").waitFor();
        assert.equal(postChatCount, 0);

        // Enviar /RIA hola -> normaliza y consulta RIA grupo
        await caja.fill("/RIA hola equipo");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(300);
        assert.deepEqual(riaGrupoCmds, ["/ria hola equipo"]);

        // Campana notificaciones: pestañas Bandeja / Leídas y engranaje
        await page.locator('button[aria-label^="Notificaciones"]:visible').first().click();
        await page.getByRole("tab", { name: /Bandeja/ }).waitFor();
        await page.getByRole("tab", { name: /Leídas/ }).waitFor();
        await page.getByRole("link", { name: "Preferencias de notificaciones" }).waitFor();
        await page.screenshot({ path: `${dir}/${c.slug}-02-notificaciones.png` });
        await page.getByRole("tab", { name: /Leídas/ }).click();
        await page.getByText("Mensaje nuevo").waitFor();
        await page.keyboard.press("Escape");

        // Clic en nombre RIA navega a /ria
        await page.getByRole("link", { name: "Abrir conversación privada con RIA" }).first().waitFor();
        await page.getByRole("link", { name: /RIA: abrir conversación privada/ }).first().click();
        await page.waitForURL(`${base}/ria`);

        // --- B. Mis tareas (Trabajador) ---
        await page.goto(`${base}/tareas`, { waitUntil: "networkidle" });
        await page.getByRole("heading", { name: /Por corregir/ }).waitFor();
        await page.getByRole("link", { name: "Corregir", exact: true }).waitFor();
        await page.getByRole("button", { name: "Cambiar", exact: true }).first().waitFor();
        await page.getByText("Tu nota:").first().waitFor();
        await revisarDesborde("mis-tareas");
        await page.screenshot({ path: `${dir}/${c.slug}-03-mis-tareas.png`, fullPage: true });

        // Confirmación "Volver a entregar"
        await page.getByRole("button", { name: "Volver a entregar" }).click();
        await page.getByText("¿Estás seguro de que corregiste lo que te pidieron?").waitFor();
        await page.getByRole("button", { name: "Ver trabajo y correcciones" }).waitFor();
        await page.screenshot({ path: `${dir}/${c.slug}-04-confirmar-reentrega.png` });
        await page.getByRole("button", { name: "Sí, continuar" }).click();

        // Modal de entrega: Drive (aviso cuenta + hasta 4 elementos + error key) y WhatsApp
        await page.getByRole("button", { name: /Agregar de Drive|Elegir de Drive/ }).click();
        await page.getByText(/ladlejuan26@gmail\.com/).first().waitFor();
        await page.screenshot({ path: `${dir}/${c.slug}-05-aviso-drive.png` });
        await page.getByRole("button", { name: "Abrir Google Drive" }).click();
        await page.getByRole("button", { name: "Elegir 2 elementos" }).click();
        await page.getByText("4 / 4").waitFor();

        // Verificar mensaje humano cuando falla clave del Picker (en tarea 13)
        await page.getByRole("button", { name: "Cancelar" }).click();
        await page.getByRole("button", { name: "Salir sin guardar" }).waitFor({ timeout: 5000 }).catch(() => {});
        const modalSalida = page.getByRole("button", { name: "Salir sin guardar" });
        if (await modalSalida.count()) await modalSalida.click();
        badPickerKey = true;
        await page.locator("#tarea-13").getByRole("button", { name: "Entregar" }).click();
        await page.getByRole("button", { name: "Elegir de Drive" }).click();
        await page.getByRole("button", { name: "Abrir Google Drive" }).click();
        await page.waitForTimeout(400);
        const alerta = await page.locator('[role="alert"]').allInnerTexts();
        console.log("Alertas tras BAD_KEY:", alerta);
        await page.getByText(/GOOGLE_PICKER_KEY/).waitFor();
        badPickerKey = false;

        // Pestaña Entrega por WhatsApp: sin número válido en tarea 13
        await page.getByRole("radio", { name: "Entrega por WhatsApp" }).click();
        await page.getByText(/no está disponible porque aún no tiene un número válido/).waitFor();
        await page.screenshot({ path: `${dir}/${c.slug}-06-whatsapp-entrega.png` });

        // --- C. Historial y entregas (/trabajos/10) ---
        await page.goto(`${base}/trabajos/10?desde=tareas`, { waitUntil: "networkidle" });
        await page.getByRole("heading", { name: "Historial y entregas" }).waitFor();
        const textoRoadmap = await page.locator('ol[aria-label="Flujo de historial y entregas"]').innerText();
        assert.match(textoRoadmap, /a\.\s*m\.|p\.\s*m\.|\d{1,2}:\d{2}/i, "Debe mostrar la hora en Historial y entregas");
        await revisarDesborde("historial-detalle");
        await page.screenshot({ path: `${dir}/${c.slug}-07-historial.png`, fullPage: true });

        // --- D. Bandeja por revisar y Rechazar tarea (Admin) ---
        perfilActual = admin;
        await page.goto(`${base}/tareas`, { waitUntil: "networkidle" });
        await page.getByRole("heading", { name: /Bandeja por revisar/ }).waitFor();
        await page.getByText("Valor:").first().waitFor();
        await page.getByRole("link", { name: /Abrir WhatsApp de Lina Editor/ }).waitFor();
        await revisarDesborde("admin-bandeja");
        await page.screenshot({ path: `${dir}/${c.slug}-08-admin-bandeja.png`, fullPage: true });

        // Modal Rechazar tarea: barra grabación viva + Resumir con IA + aviso cuenta Drive + Picker multivista
        await page.locator("#tarea-11").getByRole("button", { name: "Rechazar" }).click();
        await page.getByRole("button", { name: "Grabar audio" }).click();
        await page.getByText("Grabando").waitFor();
        await page.screenshot({ path: `${dir}/${c.slug}-09-grabacion-rechazo.png` });
        await page.getByRole("button", { name: "Detener grabación" }).click();
        await page.getByRole("switch", { name: "Resumir con IA" }).waitFor();
        await page.getByRole("switch", { name: "Resumir con IA" }).click();
        await page.getByText("Corregir gancho.").waitFor();
        await page.getByRole("button", { name: "Elegir de Drive" }).click();
        await page.getByText(/ladlejuan26@gmail\.com/).first().waitFor();
        await page.getByRole("button", { name: "Abrir Google Drive" }).click();
        await page.getByRole("dialog", { name: "Selector Drive QA" }).waitFor();
        const vistas = await page.evaluate(() => window.__pickerViews);
        assert.ok(vistas.length >= 2 && vistas[0].parent === "sixtina_id", `Picker admin debe abrir en carpeta del cliente + árbol equipo: ${JSON.stringify(vistas)}`);
        await page.screenshot({ path: `${dir}/${c.slug}-10-rechazo-resumen-picker.png` });
        await page.getByRole("dialog", { name: "Selector Drive QA" }).getByRole("button", { name: "Cancelar" }).click();

        assert.deepEqual(errores, [], `Errores de página en ${c.slug}: ${errores.join("; ")}`);
        console.log(`QA OK: ${c.slug}`);
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  if (!server.killed) {
    server.kill("SIGTERM");
  }
  console.log(`Servidor QA detenido (PID ${server.pid})`);
}
