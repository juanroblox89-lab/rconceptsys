import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.QA_BASE ?? "http://127.0.0.1:3340";
const dir = process.env.QA_DIR ?? "C:/Users/USUARIO/AppData/Local/Temp/qa-ajustes-juan";
mkdirSync(dir, { recursive: true });

const png1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXY0AAAAASUVORK5CYII=",
  "base64",
);
const paredSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700"><rect width="900" height="700" fill="#5e7f98"/><circle cx="450" cy="210" r="240" fill="#e8dab8"/><path fill="#233340" d="M0 450L350 210l550 370v120H0Z"/></svg>';

const admin = { id: "adm-qa", nombre: "Juan Admin", correo: "juan@rconcept.com", estado: "aprobado", es_admin: true, roles: [] };
const editor = { id: "ed-qa", nombre: "Lina Editor", correo: "lina@rconcept.com", estado: "aprobado", es_admin: false, roles: [{ id: 1, clave: "editor", nombre: "Editor", color: "#2F7FE0", orden: 1, activo: true }] };
const tipo = { id: 1, clave: "edicion_reel", nombre: "Edición de reel", rol_id: 1, precio: 90000, unidad: "trabajo", activo: true, orden: 1 };
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

const refsDriveCatalogo = {
  sixtina_id: {
    id: "sixtina_id",
    nombre: "La Sixtina",
    url: "https://drive.google.com/drive/folders/sixtina_id",
    tipo: "carpeta",
    ruta: "Mi unidad / Rohlfing concept / Clientes",
  },
  clips_sixtina: {
    id: "clips_sixtina",
    nombre: "Material crudo marzo",
    url: "https://drive.google.com/drive/folders/clips_sixtina",
    tipo: "carpeta",
    ruta: "Mi unidad / Rohlfing concept / Clientes / La Sixtina",
  },
  guion_sixtina: {
    id: "guion_sixtina",
    nombre: "Guion campaña",
    url: "https://docs.google.com/document/d/guion_sixtina/edit",
    tipo: "archivo",
    ruta: "Mi unidad / Rohlfing concept / Clientes / La Sixtina / Documentos",
  },
};

const pickerMock = `(() => {
  const docs = [
    { id: "clips_sixtina", name: "Material crudo marzo", mimeType: "application/vnd.google-apps.folder", url: "https://drive.google.com/drive/folders/clips_sixtina" },
    { id: "guion_sixtina", name: "Guion campaña", mimeType: "application/vnd.google-apps.document", url: "https://docs.google.com/document/d/guion_sixtina/edit" }
  ];
  window.gapi = { load: (_n, opt) => opt.callback() };
  window.google = {
    picker: {
      DocsView: class { setParent(){return this;} setIncludeFolders(){return this;} setSelectFolderEnabled(){return this;} },
      PickerBuilder: class {
        setOAuthToken(){return this;} setDeveloperKey(){return this;} setOrigin(){return this;} setAppId(){return this;} setLocale(){return this;} setMaxItems(){return this;} addView(){return this;}
        setCallback(cb){ this.cb = cb; return this; }
        build(){
          const cb = this.cb;
          const d = document.createElement("dialog");
          d.setAttribute("aria-label", "Picker Drive QA");
          for (const doc of docs) {
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = doc.name;
            b.onclick = () => cb({ action: "picked", docs: [doc] });
            d.append(b);
          }
          d.addEventListener("cancel", (e) => { e.preventDefault(); cb({ action: "cancel" }); });
          document.body.append(d);
          return {
            setVisible(v) { if (v && !d.open) d.showModal(); else if (!v && d.open) d.close(); },
            dispose() { d.remove(); },
          };
        }
      },
      Action: { PICKED: "picked", CANCEL: "cancel" },
    },
  };
})();`;

const casos = [
  { slug: "375-claro", width: 375, height: 812, modo: "claro", tema: "rconcept" },
  { slug: "375-oscuro", width: 375, height: 812, modo: "oscuro", tema: "rconcept-dark" },
  { slug: "375-glass", width: 375, height: 812, modo: "claro", tema: "glass" },
  { slug: "1280-claro", width: 1280, height: 800, modo: "claro", tema: "rconcept" },
  { slug: "1280-oscuro", width: 1280, height: 800, modo: "oscuro", tema: "rconcept-dark" },
  { slug: "1280-glass", width: 1280, height: 800, modo: "oscuro", tema: "glass" },
];

const resultados = [];
const browser = await chromium.launch({
  headless: true,
  channel: "msedge",
  args: ["--renderer-process-limit=2", "--disable-background-networking", "--disable-gpu"],
});

try {
  for (const cfg of casos) {
    console.log("QA", cfg.slug);
    const ctx = await browser.newContext({
      viewport: { width: cfg.width, height: cfg.height },
      colorScheme: cfg.modo === "oscuro" ? "dark" : "light",
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    try {
      const page = await ctx.newPage();
      page.setDefaultTimeout(20000);
      page.setDefaultNavigationTimeout(60000);
      const errores = [];
      page.on("pageerror", (e) => errores.push(e.message));

      let tarea81 = {
        id: 81,
        tipo_id: 1,
        tipo,
        cliente_id: 1,
        cliente,
        asignado_a: editor.id,
        asignado: editor,
        creado_por: admin.id,
        creador: admin,
        titulo: "Reel lanzamiento La Sixtina",
        descripcion: "Montar reel con música aprobada y revisar color.",
        estado: "pendiente",
        fecha_limite: "2026-12-05",
        creada_en: "2026-11-20T12:00:00Z",
        drive_referencias: [refsDriveCatalogo.clips_sixtina],
        historial: [
          {
            id: 1,
            tarea_id: 81,
            actor_nombre: "Lina Editor",
            evento: "entrega_enviada",
            detalle: "Entrega enviada por Drive",
            metodo_entrega: "drive",
            enlace_medios: "https://drive.google.com/drive/folders/ent1",
            entrega_nombre: "Corte v1",
            entrega_tipo: "carpeta",
            nota: "Primera versión lista para revisión.",
            creado_en: "2026-11-21T15:00:00Z",
          },
          {
            id: 2,
            tarea_id: 81,
            actor_nombre: "Juan Admin",
            evento: "entrega_rechazada",
            detalle: "Entrega devuelta con observaciones",
            motivo: "Subir el volumen de la voz al final.",
            adjuntos: [
              { id: "adj-rej-1", tipo: "imagen", nombre: "frame-correccion.png", mime: "image/png", tamano: 1024 },
            ],
            creado_en: "2026-11-22T11:00:00Z",
          },
          {
            id: 3,
            tarea_id: 81,
            actor_nombre: "Lina Editor",
            evento: "entrega_enviada",
            detalle: "Entrega enviada por WhatsApp",
            metodo_entrega: "whatsapp",
            nota: "Corregido el audio y reenviado.",
            creado_en: "2026-11-23T16:00:00Z",
          },
          {
            id: 4,
            tarea_id: 81,
            actor_nombre: "Juan Admin",
            evento: "entrega_aceptada",
            detalle: "Entrega aprobada",
            creado_en: "2026-11-24T17:00:00Z",
          },
        ],
        precio_congelado: 90000,
      };
      let clienteState = { ...cliente };
      let tiposState = [{ ...tipo }];
      let aparienciaState = {
        modo: cfg.modo,
        tema: cfg.tema,
        movimiento: "sistema",
        contraste: false,
        oscurecido: 12,
        ...(cfg.tema === "glass" ? { imagen: `${"a".repeat(32)}.png` } : {}),
      };
      let equipoState = { nombre: "RConcept", descripcion: "Equipo de producción audiovisual.", enlaces: [], actividad: {} };
      let prefsState = { tipos_silenciados: [], silenciar_chat: false, silencio_desde: "", silencio_hasta: "" };

      await ctx.addCookies([{ name: "rc_access_token", value: "qa-ajustes", url: base }]);
      await ctx.route("**/*", async (route) => {
        const req = route.request();
        const u = new URL(req.url());
        const p = u.pathname;
        if (u.origin === "https://apis.google.com") {
          return route.fulfill({ contentType: "text/javascript", body: pickerMock });
        }
        if (u.origin !== base) return route.abort();
        if (!p.startsWith("/api/")) return route.continue();
        const enviar = (json, status = 200) => route.fulfill({ json, status });
        if (p === "/api/yo") return enviar(admin);
        if (p === "/api/yo/celular") return enviar({ celular: "+573001234567" });
        if (p === "/api/yo/apariencia") {
          if (req.method() === "PUT") aparienciaState = { ...aparienciaState, ...req.postDataJSON() };
          return enviar(aparienciaState);
        }
        if (p.startsWith("/api/yo/apariencia/fondo/")) return route.fulfill({ contentType: "image/svg+xml", body: paredSvg });
        if (p === "/api/equipo/resumen") return enviar(equipoState);
        if (p === "/api/admin/equipo" && req.method() === "PATCH") {
          equipoState = { ...equipoState, ...req.postDataJSON() };
          return enviar(equipoState);
        }
        if (p === "/api/admin/miembros") return enviar([admin, editor]);
        if (p === "/api/admin/roles") return enviar([{ id: 1, clave: "editor", nombre: "Editor", color: "#2F7FE0", orden: 1, activo: true }]);
        if (p === "/api/admin/trabajos") return enviar(tiposState);
        if (p === "/api/admin/trabajos/1" && req.method() === "PATCH") {
          tiposState = [{ ...tiposState[0], ...req.postDataJSON() }];
          return enviar(tiposState[0]);
        }
        if (p === "/api/admin/clientes") return enviar([clienteState]);
        if (p === "/api/admin/clientes/1" || p === "/api/clientes/1") {
          if (req.method() === "PATCH") {
            const body = req.postDataJSON();
            clienteState = { ...clienteState, nombre: body.nombre ?? clienteState.nombre, notas: body.notas ?? clienteState.notas, activo: body.activo ?? clienteState.activo };
            return enviar(clienteState);
          }
          return enviar({
            cliente: clienteState,
            trabajos: [tarea81],
            estadisticas: { total: 1, activos: 1, entregados: 1, por_revisar: 0, aprobados: 1, cancelados: 0, ultima_entrega: "2026-11-23T16:00:00Z" },
          });
        }
        if (p === "/api/admin/drive") return enviar({ configurado: true, conectado: true, organizado: true, correo: "equipo@rconcept.com", carpeta_raiz_id: "rc_root", carpeta_raiz_nombre: "Rohlfing concept" });
        if (p === "/api/admin/drive/picker-token") return enviar({ access_token: "tok", expires_in: 3600, carpeta_id: "sixtina_id", clave: "k", proyecto_id: "1" });
        if (p === "/api/admin/drive/referencia") {
          const id = u.searchParams.get("id");
          return enviar(refsDriveCatalogo[id] ?? { id, nombre: id, url: `https://drive.google.com/open?id=${id}`, tipo: "archivo" });
        }
        if (p === "/api/admin/tareas") return enviar({ tareas: [tarea81], por_revisar: 0 });
        if (p === "/api/admin/tareas/81") {
          if (req.method() === "PATCH") tarea81 = { ...tarea81, ...req.postDataJSON() };
          return enviar(tarea81);
        }
        if (p === "/api/admin/tareas/81/adjuntos" || p === "/api/tareas/81/adjuntos") {
          return enviar([
            { id: "11111111-1111-4111-8111-111111111111", tipo: "imagen", nombre: "brief-visual.png", mime: "image/png", tamano: 1200, resumir: false, estado_resumen: "sin_resumen" },
          ]);
        }
        if (p.includes("/adjuntos/") && p.endsWith("/firma")) {
          return enviar({ url: `${base}/qa-img.png`, expira_en: 300 });
        }
        if (p === "/qa-img.png") return route.fulfill({ body: png1x1, contentType: "image/png" });
        if (p === "/api/admin/asignaciones") return enviar({ asignaciones: [{ tarea: tarea81, novedad: false }] });
        if (p === "/api/admin/asignaciones/recientes") return enviar({ asignaciones: [], nuevas: 0 });
        if (p === "/api/admin/facturas" || p === "/api/admin/cortes" || p === "/api/admin/piezas") return enviar([]);
        if (p === "/api/tareas") return enviar([tarea81]);
        if (p === "/api/notificaciones") return enviar({ no_leidas: 0, notificaciones: [] });
        if (p === "/api/notificaciones/preferencias") {
          if (req.method() === "PUT") prefsState = req.postDataJSON();
          return enviar(prefsState);
        }
        if (p === "/api/push/clave") return enviar({ configurado: false, clave: "" });
        if (p === "/api/chat" || p === "/api/ria") return enviar([]);
        return enviar({});
      });

      // 1. Trabajo detalle: Drive refs (ruta arriba + nombre real abajo), Botones verde/rojo, Sin "Abrir fuera", Roadmap con flechas, Confirmación salida
      await page.goto(`${base}/trabajos/81`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction((t) => document.documentElement.dataset.rcTema === t, cfg.tema);
      await page.getByText("Material crudo marzo", { exact: true }).waitFor();
      await page.getByText("Mi unidad / Rohlfing concept / Clientes / La Sixtina", { exact: true }).waitFor();

      // Ajuste 4: sin "Abrir fuera" en AdjuntosAsignacion (ni guardados ni rechazo)
      await page.getByText("brief-visual.png", { exact: true }).first().waitFor();
      await page.getByText("frame-correccion.png", { exact: true }).first().waitFor();
      assert.equal(await page.getByText("Abrir fuera").count(), 0, `${cfg.slug}: Abrir fuera no debe existir`);

      // Ajuste 1: verificar ruta arriba del nombre en Referencias de Drive
      const ordenRef = await page.evaluate(() => {
        const ruta = [...document.querySelectorAll("span")].find((s) => s.textContent === "Mi unidad / Rohlfing concept / Clientes / La Sixtina");
        const nombre = [...document.querySelectorAll("span")].find((s) => s.textContent === "Material crudo marzo");
        if (!ruta || !nombre) return null;
        return {
          rutaTop: Math.round(ruta.getBoundingClientRect().top),
          rutaBottom: Math.round(ruta.getBoundingClientRect().bottom),
          nombreTop: Math.round(nombre.getBoundingClientRect().top),
          rutaTitle: ruta.getAttribute("title"),
        };
      });
      assert.ok(ordenRef && ordenRef.rutaBottom <= ordenRef.nombreTop + 2, `${cfg.slug}: ruta debe ir arriba de nombre (${JSON.stringify(ordenRef)})`);
      assert.equal(ordenRef.rutaTitle, "Mi unidad / Rohlfing concept / Clientes / La Sixtina");

      // Ajuste 2 & 3: verificar tonos verde (Guardar cambios) y rojo (Quitar / Cancelar trabajo)
      const coloresBotones = await page.evaluate(() => {
        const rgb = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
        const btnGuardar = document.querySelector(".rc-btn--guardar");
        const btnPeligro = document.querySelector(".rc-btn--peligro");
        const sg = getComputedStyle(btnGuardar);
        const sp = getComputedStyle(btnPeligro);
        return {
          guardarBg: sg.backgroundColor,
          guardarColor: sg.color,
          peligroBg: sp.backgroundColor,
          peligroColor: sp.color,
          guardarRGB: rgb(sg.color),
          peligroRGB: rgb(sp.color),
        };
      });
      // Verde: canal G > R en el texto o fondo
      assert.ok(coloresBotones.guardarRGB[1] > coloresBotones.guardarRGB[0], `${cfg.slug}: Guardar cambios debe tener tono verde (${coloresBotones.guardarColor})`);
      // Rojo: canal R > G en el texto o fondo
      assert.ok(coloresBotones.peligroRGB[0] > coloresBotones.peligroRGB[1], `${cfg.slug}: Botón peligro debe tener tono rojo (${coloresBotones.peligroColor})`);

      // Ajuste 5: verificar Roadmap cronológico y flechas según ancho
      const roadmapRegion = page.getByRole("region", { name: "Historial y entregas" });
      await roadmapRegion.scrollIntoViewIfNeeded();
      const roadmapMedida = await roadmapRegion.evaluate((el) => {
        const pasos = [...el.querySelectorAll("ol > li > div:first-child")].map((p) => {
          const r = p.getBoundingClientRect();
          return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) };
        });
        const derVisibles = [...el.querySelectorAll('[class*="roadmapFlechaDer"]')].filter((n) => getComputedStyle(n).display !== "none").length;
        const abajoVisibles = [...el.querySelectorAll('[class*="roadmapFlechaAbajo"]')].filter((n) => getComputedStyle(n).display !== "none").length;
        return {
          pasos,
          derVisibles,
          abajoVisibles,
          docScrollW: document.documentElement.scrollWidth,
          vw: window.innerWidth,
        };
      });
      assert.equal(roadmapMedida.pasos.length, 5, `${cfg.slug}: debe haber 5 pasos en roadmap`);
      assert.equal(roadmapMedida.docScrollW, cfg.width, `${cfg.slug}: sin desborde horizontal`);
      if (cfg.width === 375) {
        assert.equal(roadmapMedida.derVisibles, 0, "375px: sin flechas horizontales");
        assert.equal(roadmapMedida.abajoVisibles, 4, "375px: 4 flechas hacia abajo");
        for (let i = 0; i < 4; i++) {
          assert.ok(roadmapMedida.pasos[i + 1].top > roadmapMedida.pasos[i].bottom, "375px: pasos verticales secuenciales");
        }
      } else {
        assert.ok(roadmapMedida.derVisibles >= 3 && roadmapMedida.abajoVisibles >= 1, `1280px: flechas → (${roadmapMedida.derVisibles}) y ↓ (${roadmapMedida.abajoVisibles})`);
        assert.ok(roadmapMedida.pasos[1].left > roadmapMedida.pasos[0].right, "1280px: paso 2 a la derecha del paso 1");
      }

      // Captura del roadmap y formulario de trabajo
      await roadmapRegion.screenshot({ path: `${dir}/roadmap-${cfg.slug}.png`, animations: "disabled" });
      await page.screenshot({
        path: `${dir}/trabajo-${cfg.slug}.png`,
        fullPage: true,
        animations: "disabled",
        style: `[data-rc-shell]{height:auto!important;min-height:100dvh!important;overflow:visible!important} main, main > [data-rc-entrada]{height:auto!important;overflow:visible!important}`,
      });

      // Ajuste 6: Confirmación al salir sin guardar desde /trabajos/81
      const specs = page.getByLabel("Especificaciones");
      await specs.click();
      await specs.fill("Especificación editada sin guardar");
      // Verificar que beforeunload real del navegador dispara diálogo de confirmación cuando sucio es true
      let beforeUnloadDisparado = false;
      const onDialog = async (dialog) => {
        if (dialog.type() === "beforeunload") {
          beforeUnloadDisparado = true;
          await dialog.dismiss();
        }
      };
      page.on("dialog", onDialog);
      await page.waitForTimeout(80);
      try {
        await page.reload({ timeout: 3000 });
      } catch {
        // dismiss() en beforeunload aborta la navegación, lo cual confirma que bloqueó la recarga
      }
      page.off("dialog", onDialog);
      assert.equal(beforeUnloadDisparado, true, `${cfg.slug}: beforeunload debe avisar al recargar cuando sucio`);

      await page.getByRole("button", { name: "Volver sin guardar" }).click();
      const modalSalir = page.getByRole("dialog", { name: "Tienes cambios sin guardar" });
      await modalSalir.waitFor();
      // Verificar foco inicial seguro en "Seguir editando"
      await page.waitForFunction(() => document.activeElement?.textContent?.includes("Seguir editando"));
      await page.screenshot({ path: `${dir}/modal-unsaved-${cfg.slug}.png`, animations: "disabled" });

      // Escape cierra el modal sin descartar
      await page.keyboard.press("Escape");
      await modalSalir.waitFor({ state: "hidden" });
      assert.equal(await specs.inputValue(), "Especificación editada sin guardar");

      // Navegación por Sidebar también intercepta
      if (cfg.width === 375) {
        await page.getByRole("button", { name: "Abrir menú" }).click();
      }
      await page.getByRole("link", { name: "Gestión" }).click();
      await modalSalir.waitFor();
      await modalSalir.getByRole("button", { name: "Salir sin guardar" }).click();
      await page.waitForURL("**/admin");

      // Ajuste 6 en Admin/Gestión pestañas
      await page.getByRole("tab", { name: "Equipo" }).click();
      await page.getByLabel("Nombre del equipo").fill("RConcept Editado");
      await page.getByRole("tab", { name: "Cortes" }).click();
      await modalSalir.waitFor();
      await modalSalir.getByRole("button", { name: "Seguir editando" }).click();
      await modalSalir.waitFor({ state: "hidden" });
      assert.equal(await page.getByLabel("Nombre del equipo").inputValue(), "RConcept Editado");
      // Guardar en Equipo vuelve sucio a false y permite cambiar de pestaña sin modal
      await page.getByRole("button", { name: "Guardar", exact: true }).click();
      await page.getByText("Equipo guardado").waitFor();
      await page.getByRole("tab", { name: "Cortes" }).click();
      assert.equal(await modalSalir.count(), 0);

      // Ajuste 6 en /clientes/1/editar, /perfil y /personalizacion
      await page.goto(`${base}/clientes/1/editar`, { waitUntil: "domcontentloaded" });
      await page.getByText("Material crudo marzo").waitFor();
      await page.getByText("Mi unidad / Rohlfing concept / Clientes / La Sixtina").waitFor();
      await page.getByLabel("Notas").fill("Nota editada sin guardar");
      await page.getByRole("button", { name: "Volver sin guardar" }).click();
      await modalSalir.waitFor();
      await modalSalir.getByRole("button", { name: "Salir sin guardar" }).click();
      await page.waitForURL("**/clientes/1");

      await page.goto(`${base}/perfil`, { waitUntil: "domcontentloaded" });
      const campoNombre = page.getByLabel("Nombre de visualización");
      await page.waitForFunction(() => (document.getElementById("nombre"))?.value === "Juan Admin");
      await campoNombre.fill("Juan Admin Editado");
      if (cfg.width === 375) await page.getByRole("button", { name: "Abrir menú" }).click();
      await page.getByRole("link", { name: "Chat del equipo" }).click();
      await modalSalir.waitFor();
      await modalSalir.getByRole("button", { name: "Salir sin guardar" }).click();
      await page.waitForURL(`${base}/`);

      assert.deepEqual(errores, [], `${cfg.slug}: sin errores JS (${errores.join("; ")})`);
      resultados.push({ slug: cfg.slug, ordenRef, coloresBotones, roadmapMedida });
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

writeFileSync(`${dir}/medidas.json`, `${JSON.stringify(resultados, null, 2)}\n`);
console.log("QA completo OK:", resultados.length, "casos");
