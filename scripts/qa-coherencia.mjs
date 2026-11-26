import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const faseIdx = args.indexOf("--fase");
const fase = faseIdx >= 0 ? args[faseIdx + 1] : (process.env.QA_FASE ?? "antes");
const base = process.env.QA_BASE ?? "http://127.0.0.1:3335";
const dir = `capturas-coherencia/${fase}`;
mkdirSync(dir, { recursive: true });

const rolEditor = { id: 1, clave: "editor", nombre: "Editor", color: "#2F7FE0", orden: 1, activo: true };
const rolCamara = { id: 2, clave: "camarografo", nombre: "Camarógrafo", color: "#3AA76D", orden: 2, activo: true };
const admin = {
  id: "adm-1",
  nombre: "Juan Admin",
  correo: "juan@rconcept.com",
  estado: "aprobado",
  es_admin: true,
  roles: [],
  creado_en: "2025-05-01T12:00:00Z",
};
const miembro = {
  id: "m1",
  nombre: "Lina Torres",
  correo: "lina@rconcept.com",
  estado: "aprobado",
  es_admin: false,
  roles: [rolEditor],
  creado_en: "2025-07-10T12:00:00Z",
};
const pendienteUser = {
  id: "p1",
  nombre: "Carlos Nuevo",
  correo: "carlos@rconcept.com",
  estado: "pendiente",
  es_admin: false,
  roles: [],
  creado_en: "2026-11-20T12:00:00Z",
};
const tiposTrabajo = [
  { id: 1, clave: "edicion_reel", nombre: "Edición de reel", rol_id: 1, rol: rolEditor, precio: 85000, unidad: "trabajo", activo: true, orden: 1 },
  { id: 2, clave: "grabacion", nombre: "Grabación en sitio", rol_id: 2, rol: rolCamara, precio: 3500, unidad: "minuto", activo: true, orden: 2 },
];
const clientes = [
  { id: 1, nombre: "Estudio Norte", activo: true, paquete: "12 reels/mes", notas: "Usar tipografía principal y carpeta de referencias.", drive_carpeta_id: "carp1", drive_url: "https://drive.google.com/drive/folders/carp1" },
  { id: 2, nombre: "Café Aurora", activo: true, paquete: "8 reels/mes", notas: "Tono cálido", drive_carpeta_id: "carp2", drive_url: "https://drive.google.com/drive/folders/carp2" },
];
const tareasAdmin = [
  {
    id: 17,
    titulo: "Reel lanzamiento campaña noviembre",
    descripcion: "Montar reel vertical 9:16 con cortes dinámicos y música aprobada.",
    estado: "hecha",
    asignado_a: "m1",
    asignado: miembro,
    creador: admin,
    cliente_id: 1,
    cliente: clientes[0],
    tipo_id: 1,
    tipo: tiposTrabajo[0],
    fecha_limite: "2026-11-28",
    creada_en: "2026-11-20T14:00:00Z",
    hecha_en: "2026-11-24T16:30:00Z",
    nota_persona: "Subido en carpeta final con 2 versiones de portada.",
    metodo_entrega: "drive",
    enlace_medios: "https://drive.google.com/drive/folders/entrega17",
    entrega_nombre: "Entrega Reel Noviembre",
    entrega_tipo: "carpeta",
    drive_referencias: [{ id: "ref1", nombre: "Guion y crudos", url: "https://drive.google.com/drive/folders/ref1", tipo: "carpeta" }],
  },
  {
    id: 18,
    titulo: "Grabación evento Café Aurora",
    descripcion: "Tomas de producto y entrevista con fundador.",
    estado: "pendiente",
    asignado_a: "m1",
    asignado: miembro,
    creador: admin,
    cliente_id: 2,
    cliente: clientes[1],
    tipo_id: 2,
    tipo: tiposTrabajo[1],
    fecha_limite: "2026-11-22",
    creada_en: "2026-11-18T10:00:00Z",
    drive_referencias: [{ id: "ref2", nombre: "Brief del evento", url: "https://drive.google.com/file/d/ref2/view", tipo: "archivo" }],
  },
  {
    id: 19,
    titulo: "Edición resumen mensual",
    descripcion: "Ajustar color según corrección del cliente.",
    estado: "rechazada",
    motivo_rechazo: "Falta corregir el volumen de la voz en los últimos 10 segundos.",
    asignado_a: "m1",
    asignado: miembro,
    creador: admin,
    cliente_id: 1,
    cliente: clientes[0],
    tipo_id: 1,
    tipo: tiposTrabajo[0],
    fecha_limite: "2026-11-29",
    creada_en: "2026-11-19T10:00:00Z",
  },
  {
    id: 20,
    titulo: "Reel aniversario",
    descripcion: "Versión aprobada para pauta.",
    estado: "aceptada",
    precio_congelado: 85000,
    precio_unitario_congelado: 85000,
    asignado_a: "m1",
    asignado: miembro,
    creador: admin,
    cliente_id: 1,
    cliente: clientes[0],
    tipo_id: 1,
    tipo: tiposTrabajo[0],
    fecha_limite: "2026-11-15",
    creada_en: "2026-11-10T10:00:00Z",
    resuelta_en: "2026-11-14T18:00:00Z",
  },
];

const statsAdmin = {
  rango: { desde: "2026-11-01", hasta: "2026-11-26", agrupar: "dia" },
  totales: { trabajos: 14, minutos: 185, valor: 1245000, personas: 3, clientes: 4 },
  este_mes: { trabajos: 14, minutos: 185, valor: 1245000 },
  total: { trabajos: 48, minutos: 620, valor: 4180000 },
  serie: [
    { fecha: "2026-11-05", trabajos: 2, minutos: 30, valor: 190000 },
    { fecha: "2026-11-10", trabajos: 4, minutos: 55, valor: 350000 },
    { fecha: "2026-11-15", trabajos: 3, minutos: 40, valor: 265000 },
    { fecha: "2026-11-20", trabajos: 5, minutos: 60, valor: 440000 },
  ],
  por_persona: [
    { perfil_id: "m1", nombre: "Lina Torres", foto: null, trabajos: 9, minutos: 120, valor: 765000 },
    { perfil_id: "m2", nombre: "Mateo Ruiz", foto: null, trabajos: 5, minutos: 65, valor: 480000 },
  ],
  por_cliente: [
    { cliente_id: 1, nombre: "Estudio Norte", trabajos: 8, minutos: 100, valor: 680000 },
    { cliente_id: 2, nombre: "Café Aurora", trabajos: 6, minutos: 85, valor: 565000 },
  ],
  por_tipo: [
    { tipo_id: 1, nombre: "Edición de reel", unidad: "trabajo", trabajos: 10, minutos: 0, valor: 850000 },
    { tipo_id: 2, nombre: "Grabación en sitio", unidad: "minuto", trabajos: 4, minutos: 185, valor: 395000 },
  ],
};

const mensajesChat = [
  {
    id: 101,
    autor_id: "m1",
    cuerpo: "Ya dejé en Drive los crudos de Estudio Norte y la primera versión del reel.",
    creado_en: "2026-11-26T14:15:00Z",
    autor: miembro,
    adjuntos: [],
  },
  {
    id: 102,
    autor_id: "adm-1",
    cuerpo: "Perfecto, revisando ahora mismo en /tareas.",
    creado_en: "2026-11-26T14:18:00Z",
    autor: admin,
    adjuntos: [],
  },
];

const mensajesRIA = [
  { id: 1, rol: "user", cuerpo: "¿Qué entregas faltan por revisar esta semana?", creado_en: "2026-11-26T13:00:00Z" },
  {
    id: 2,
    rol: "assistant",
    cuerpo: "Tienes **1 entrega pendiente de revisión** de Lina Torres para Estudio Norte.\n\n- Abre `/tareas` para aprobar o rechazar.\n- Consulta más detalles en `/asignaciones`.",
    creado_en: "2026-11-26T13:00:04Z",
  },
];

const cortes = [
  {
    id: 12,
    periodo: "quincena",
    desde: "2026-11-01",
    hasta: "2026-11-15",
    estado: "cerrado",
    total: 425000,
    lineas: [{ perfil_id: "m1", perfil: miembro, tareas: 5, total: 425000, pagada_en: null }],
  },
];

const idFondo = "a".repeat(32) + ".png";

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--renderer-process-limit=2", "--disable-background-networking", "--disable-gpu", "--no-first-run"],
});

const reporte = { fase, base, checks: [], fallos: [], capturas: [] };

try {
  // Generar imagen de fondo sintética para modo Glass
  const pLienzo = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await pLienzo.setContent(
    `<style>body{margin:0}</style><svg width="1280" height="800" viewBox="0 0 1280 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1d2f4e"/><stop offset="55%" stop-color="#4d79a7"/><stop offset="100%" stop-color="#e9cda0"/></linearGradient></defs><rect width="1280" height="800" fill="url(#g)"/><circle cx="960" cy="220" r="140" fill="#f3d9a8" opacity=".8"/><path d="M0 680L290 360L510 530L760 310L1040 540L1280 420V800H0Z" fill="#234864"/></svg>`,
  );
  const fondoPng = await pLienzo.screenshot();
  await pLienzo.close();

  async function crearContexto({ width, height, modo, tema, perfilActual = admin, sidebarCerrada = false }) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      colorScheme: modo === "oscuro" ? "dark" : "light",
      hasTouch: width < 768,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });

    await ctx.addCookies([{ name: "rc_access_token", value: "qa-coherencia-token", url: base }]);
    await ctx.addInitScript(({ ap, sb }) => {
      try {
        localStorage.setItem("rc-apariencia", JSON.stringify(ap));
        if (sb) localStorage.setItem("rc-sidebar", "hidden");
        else localStorage.removeItem("rc-sidebar");
      } catch {}
    }, {
      ap: {
        tema,
        modo,
        movimiento: "sistema",
        contraste: false,
        oscurecido: tema === "glass" ? 18 : 5,
        imagen: tema === "glass" ? idFondo : undefined,
        fondo_nombre: tema === "glass" ? "Paisaje.png" : undefined,
        fondo_bytes: tema === "glass" ? fondoPng.length : undefined,
      },
      sb: sidebarCerrada,
    });

    let perfil = perfilActual;
    await ctx.route("**/*", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const p = url.pathname;
      const m = req.method();
      if (url.origin !== base) return route.abort();
      if (!p.startsWith("/api/")) return route.continue();
      const json = (v, status = 200) => route.fulfill({ status, json: v });
      if (p === "/api/yo") return json(perfil);
      if (p === "/api/yo/celular") return json({ celular: "+573005551234" });
      if (p === "/api/yo/apariencia") {
        return json({
          tema,
          modo,
          movimiento: "sistema",
          contraste: false,
          oscurecido: tema === "glass" ? 18 : 5,
          imagen: tema === "glass" ? idFondo : undefined,
          fondo_nombre: tema === "glass" ? "Paisaje.png" : undefined,
          fondo_bytes: tema === "glass" ? fondoPng.length : undefined,
        });
      }
      if (p.startsWith("/api/yo/apariencia/fondo/")) {
        return route.fulfill({
          status: 200,
          body: m === "HEAD" ? undefined : fondoPng,
          contentType: "image/png",
          headers: { "content-length": String(fondoPng.length) },
        });
      }
      if (p === "/api/yo/estadisticas") {
        return json({
          trabajos: statsAdmin.totales.trabajos,
          minutos: statsAdmin.totales.minutos,
          valor: statsAdmin.totales.valor,
          este_mes: statsAdmin.este_mes,
          total: statsAdmin.total,
          por_tipo: statsAdmin.por_tipo,
        });
      }
      if (p === "/api/notificaciones") {
        return json({
          no_leidas: 2,
          notificaciones: [
            { id: 1, titulo: "Entrega recibida", cuerpo: "Lina Torres entregó Reel lanzamiento", url: "/tareas?tarea=17", leida_en: null, creada_en: "2026-11-26T14:20:00Z" },
            { id: 2, titulo: "Nuevo mensaje", cuerpo: "Mención en chat del equipo", url: "/", leida_en: "2026-11-26T12:00:00Z", creada_en: "2026-11-26T12:00:00Z" },
          ],
        });
      }
      if (p === "/api/notificaciones/preferencias") {
        return json({ silenciar_chat: false, tipos_silenciados: [], silencio_desde: "22:00", silencio_hasta: "07:00" });
      }
      if (p === "/api/push/clave") return json({ configurado: false });
      if (p === "/api/equipo/resumen") {
        return json({
          nombre: "RConcept Studio",
          descripcion: "Producción audiovisual y contenido.",
          enlaces: [{ id: 1, nombre: "Carpeta maestra Drive", url: "https://drive.google.com/drive/folders/root1", orden: 1 }],
          actividad: { mensajes: 1240, tareas: 84, miembros: 6, archivos: 312 },
        });
      }
      if (p === "/api/equipo") return json([admin, miembro]);
      if (p === "/api/equipo/m1") return json(miembro);
      if (p === "/api/chat") return json(mensajesChat);
      if (p === "/api/ria") return json(mensajesRIA);
      if (p === "/api/tareas") return json(tareasAdmin);
      if (p === "/api/tareas/17") return json(tareasAdmin[0]);
      if (p === "/api/tareas/17/adjuntos") return json([]);
      if (p === "/api/tareas/17/corte") return json({});
      if (p === "/api/cortes/12/mio" || p === "/api/cortes/12/propio" || p === "/api/yo/cortes/12") {
        return json({ id: 12, desde: "2026-11-01", hasta: "2026-11-15", tareas: 5, total: 425000, pagada_en: null });
      }
      if (p === "/api/factura/mia" || p === "/api/facturas/mia") {
        return json({
          abierta: { id: 9, total: 85000, lineas: [tareasAdmin[3]] },
          total_pendiente: 85000,
          total_pagado: 425000,
          pagadas: [{ id: 8, total: 425000, pagada_en: "2026-11-16T15:00:00Z", lineas: [tareasAdmin[3]] }],
        });
      }
      if (p === "/api/clientes" || p === "/api/admin/clientes") return json(clientes);
      if (p === "/api/clientes/1" || p === "/api/admin/clientes/1") {
        return json({
          cliente: clientes[0],
          estadisticas: { total: 3, activos: 1, entregados: 1, por_revisar: 1, aprobados: 1, cancelados: 0, ultima_entrega: "2026-11-24T16:30:00Z" },
          trabajos: [tareasAdmin[0], tareasAdmin[3]],
        });
      }
      if (p === "/api/admin/miembros") return json([admin, miembro, pendienteUser]);
      if (p === "/api/admin/roles") return json([rolEditor, rolCamara]);
      if (p === "/api/admin/trabajos") return json(tiposTrabajo);
      if (p === "/api/admin/piezas") return json([]);
      if (p === "/api/admin/tareas") return json({ tareas: tareasAdmin, por_revisar: 1 });
      if (p === "/api/admin/tareas/17") return json(tareasAdmin[0]);
      if (p === "/api/admin/tareas/17/adjuntos") return json([]);
      if (p === "/api/admin/asignaciones") return json({ asignaciones: tareasAdmin.map((t) => ({ tarea: t, novedad: t.id === 17 })) });
      if (p === "/api/admin/asignaciones/recientes") return json({ asignaciones: [{ tarea: tareasAdmin[0], novedad: true }] });
      if (p === "/api/admin/facturas") {
        return json([{ perfil_id: "m1", perfil: miembro, total_pendiente: 85000, factura_abierta: { id: 9, lineas: [tareasAdmin[3]] } }]);
      }
      if (p === "/api/admin/cortes") return json(cortes);
      if (p === "/api/admin/estadisticas") return json(statsAdmin);
      if (p === "/api/admin/drive") return json({ configurado: true, conectado: true, organizado: true, correo: "equipo@rconcept.com", carpeta_raiz_nombre: "RConcept Drive", carpeta_raiz_id: "root1" });
      return json([]);
    });

    return ctx;
  }

  async function auditarPagina(page, { ruta, width, modo, tema, slug, capturar = true, scrollProbar = true }) {
    await page.goto(`${base}${ruta}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(450);

    // Esperar a que salga de skeletons si existen
    try {
      await page.waitForFunction(() => !document.querySelector('[data-rc-esqueleto]'), { timeout: 3500 });
    } catch {}
    await page.waitForTimeout(200);

    const medir = async (etiquetaScroll) => {
      return page.evaluate((etq) => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const docScrollW = document.documentElement.scrollWidth;
        const main = document.querySelector("main");
        const mainClientW = main ? main.clientWidth : vw;
        const mainScrollW = main ? main.scrollWidth : vw;

        const rectObj = (r) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) });
        const seSolapan = (a, b) => a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0 && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;

        // Elementos flotantes o fijos del shell (pastilla, campana, riel)
        const chromeSelectors = [
          '[data-rc-chrome="pill"]',
          '[data-rc-chrome="campana"]',
          '[data-rc-chrome="rail"]',
          'button[aria-label="Abrir menú"]',
          'button[aria-label="Abrir barra"]',
          'button[aria-label^="Notificaciones"]',
          'nav[aria-label="Accesos"]',
        ];
        const chromeSet = new Set();
        const chromeEls = [];
        for (const sel of chromeSelectors) {
          for (const node of document.querySelectorAll(sel)) {
            const el = sel.startsWith('button[aria-label="Abrir') ? (node.parentElement || node) : node;
            if (chromeSet.has(el)) continue;
            const st = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            if (st.display !== "none" && st.visibility !== "hidden" && r.width > 0 && r.height > 0) {
              chromeSet.add(el);
              chromeEls.push({ sel, el, rect: r });
            }
          }
        }

        const solapes = [];
        const recortes = [];
        const scope = main || document.body;
        const mainRect = main ? main.getBoundingClientRect() : { top: 0, bottom: vh, left: 0, right: vw };
        const objetivos = [...scope.querySelectorAll("h1, h2, button, a.rc-btn, .rc-btn, input, textarea, [role='tab']")];

        for (const el of objetivos) {
          const st = getComputedStyle(el);
          if (st.display === "none" || st.visibility === "hidden" || st.opacity === "0") continue;
          const rawR = el.getBoundingClientRect();
          if (rawR.width <= 1 || rawR.height <= 1) continue;
          // Recortar al contenedor con scroll (main) para no contar contenido ya desplazado fuera del viewport del scroll
          const r = {
            left: Math.max(rawR.left, mainRect.left),
            right: Math.min(rawR.right, mainRect.right),
            top: Math.max(rawR.top, mainRect.top),
            bottom: Math.min(rawR.bottom, mainRect.bottom),
            get width() { return Math.max(0, this.right - this.left); },
            get height() { return Math.max(0, this.bottom - this.top); },
          };
          if (r.width <= 1 || r.height <= 1) continue;
          if (r.bottom <= 0 || r.top >= vh) continue;

          // Ignorar pestañas dentro de un tablist con desplazamiento horizontal propio
          const tablist = el.closest('[role="tablist"]');
          if (el.getAttribute("role") === "tab" && tablist && tablist.scrollWidth > tablist.clientWidth + 1 && tablist.getBoundingClientRect().right <= vw + 1) {
            continue;
          }

          if (rawR.right > vw + 1 || rawR.left < -1) {
            recortes.push({ tipo: "fuera-viewport-x", texto: (el.innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 40), rect: rectObj(rawR), vw });
          }

          // Comprobar colisión geométrica con pastilla/campana/riel
          for (const ch of chromeEls) {
            if (ch.el.contains(el) || el.contains(ch.el)) continue;
            if (seSolapan(r, ch.rect)) {
              solapes.push({
                etq,
                chrome: ch.sel,
                chromeRect: rectObj(ch.rect),
                objetivo: (el.innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 40),
                objetivoRect: rectObj(r),
              });
            }
          }

          // Comprobar con elementFromPoint en el centro y borde izquierdo/derecho visible
          if (r.top >= 0 && r.top < 140 && main) {
            const puntos = [
              [Math.min(vw - 2, Math.max(2, r.left + 8)), Math.min(vh - 2, Math.max(2, r.top + r.height / 2))],
              [Math.min(vw - 2, Math.max(2, r.right - 8)), Math.min(vh - 2, Math.max(2, r.top + r.height / 2))],
            ];
            for (const [px, py] of puntos) {
              const hit = document.elementFromPoint(px, py);
              if (hit && !el.contains(hit) && !hit.contains(el)) {
                const esChrome = chromeEls.some((c) => c.el === hit || c.el.contains(hit));
                if (esChrome) {
                  solapes.push({
                    etq: `${etq}:elementFromPoint`,
                    hitTag: hit.tagName,
                    objetivo: (el.innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 40),
                    punto: [Math.round(px), Math.round(py)],
                    objetivoRect: rectObj(r),
                  });
                }
              }
            }
          }
        }

        // Verificar también si hay texto truncado en cabecera de página o botones
        for (const h of scope.querySelectorAll("h1, header button, header a")) {
          const st = getComputedStyle(h);
          if (st.display === "none" || st.visibility === "hidden") continue;
          const r = h.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || r.bottom <= 0 || r.top >= vh) continue;
          if (h.scrollWidth > h.clientWidth + 2 && st.overflowX === "hidden") {
            recortes.push({ tipo: "texto-truncado", texto: h.innerText.trim().slice(0, 40), scrollW: h.scrollWidth, clientW: h.clientWidth });
          }
        }

        return {
          etq,
          vw,
          vh,
          docScrollW,
          mainClientW,
          mainScrollW,
          desbordeX: docScrollW > vw || mainScrollW > mainClientW + 1,
          solapes,
          recortes,
        };
      }, etiquetaScroll);
    };

    const m0 = await medir("top");
    let mScroll = null;
    if (scrollProbar) {
      const hizoScroll = await page.evaluate(() => {
        const main = document.querySelector("main");
        if (!main || main.scrollHeight <= main.clientHeight + 20) return false;
        main.scrollTop = 56;
        return main.scrollTop > 0;
      });
      if (hizoScroll) {
        await page.waitForTimeout(100);
        mScroll = await medir("scroll-56");
        await page.evaluate(() => {
          const main = document.querySelector("main");
          if (main) main.scrollTop = 0;
        });
        await page.waitForTimeout(100);
      }
    }

    if (capturar) {
      const rutaPng = `${dir}/${slug}.png`;
      await page.screenshot({ path: rutaPng, animations: "disabled" });
      reporte.capturas.push(rutaPng);
    }

    const res = { slug, ruta, width, modo, tema, m0, mScroll };
    reporte.checks.push(res);
    if (m0.desbordeX || m0.solapes.length > 0 || m0.recortes.length > 0 || (mScroll && mScroll.solapes.length > 0)) {
      reporte.fallos.push(res);
    }
    return res;
  }

  // 1) Matriz principal: 375 y 1280 en claro y oscuro (tema rconcept) de TODAS las pantallas
  const rutasAdmin = [
    ["01-chat", "/"],
    ["02-ria", "/ria"],
    ["03-tareas-admin", "/tareas"],
    ["04-trabajos", "/asignaciones"],
    ["05-trabajo-nuevo", "/trabajos/nuevo"],
    ["06-trabajo-detalle", "/trabajos/17"],
    ["07-clientes", "/clientes"],
    ["08-cliente-detalle", "/clientes/1"],
    ["09-admin-trabajos", "/admin?pestana=trabajos"],
    ["10-admin-estadisticas", "/admin?pestana=estadisticas"],
    ["11-admin-facturas", "/admin?pestana=facturas"],
    ["12-admin-cortes", "/admin?pestana=cortes"],
    ["13-admin-equipo", "/admin?pestana=equipo"],
    ["14-admin-miembros", "/admin?pestana=miembros"],
    ["15-equipo", "/equipo"],
    ["16-equipo-perfil", "/equipo/m1"],
    ["17-configuracion", "/configuracion"],
    ["18-personalizacion", "/personalizacion"],
    ["19-perfil", "/perfil"],
  ];

  for (const [width, height] of [[375, 812], [1280, 800]]) {
    for (const modo of ["claro", "oscuro"]) {
      const tema = modo === "oscuro" ? "rconcept-dark" : "rconcept";
      const ctx = await crearContexto({ width, height, modo, tema, perfilActual: admin });
      const page = await ctx.newPage();
      for (const [nombre, ruta] of rutasAdmin) {
        await auditarPagina(page, { ruta, width, modo, tema, slug: `${nombre}-${width}-${modo}` });
      }
      // Trabajador: /tareas (Mis tareas) y /factura?corte=12
      const ctxW = await crearContexto({ width, height, modo, tema, perfilActual: miembro });
      const pageW = await ctxW.newPage();
      await auditarPagina(pageW, { ruta: "/tareas", width, modo, tema, slug: `20-mis-tareas-${width}-${modo}` });
      await auditarPagina(pageW, { ruta: "/factura?corte=12", width, modo, tema, slug: `21-factura-${width}-${modo}` });
      await ctxW.close();

      // Pantallas públicas / auth
      await auditarPagina(page, { ruta: "/login", width, modo, tema, slug: `22-login-${width}-${modo}`, scrollProbar: false });
      await auditarPagina(page, { ruta: "/pendiente", width, modo, tema, slug: `23-pendiente-${width}-${modo}`, scrollProbar: false });
      if (width === 1280) {
        await auditarPagina(page, { ruta: "/estilo", width, modo, tema, slug: `24-estilo-${width}-${modo}`, scrollProbar: false });
      }
      await ctx.close();
    }
  }

  // 2) Matriz Glass (claro y oscuro a 375 y 1280 en pantallas clave)
  for (const [width, height] of [[375, 812], [1280, 800]]) {
    for (const modo of ["claro", "oscuro"]) {
      const ctx = await crearContexto({ width, height, modo, tema: "glass", perfilActual: admin });
      const page = await ctx.newPage();
      for (const [nombre, ruta] of [
        ["glass-01-chat", "/"],
        ["glass-02-ria", "/ria"],
        ["glass-03-tareas", "/tareas"],
        ["glass-04-admin-stats", "/admin?pestana=estadisticas"],
        ["glass-05-configuracion", "/configuracion"],
        ["glass-06-personalizacion", "/personalizacion"],
      ]) {
        await auditarPagina(page, { ruta, width, modo, tema: "glass", slug: `${nombre}-${width}-${modo}` });
      }
      await ctx.close();
    }
  }

  // 3) Auditoría de anchos adicionales (320, 414, 768) + barra colapsada en 768/1280 + modales / campana / barra equipo
  for (const [width, height, sbCerrada] of [
    [320, 640, false],
    [414, 896, false],
    [768, 1024, false],
    [768, 1024, true],
    [1280, 800, true],
  ]) {
    const ctx = await crearContexto({ width, height, modo: "claro", tema: "rconcept", perfilActual: admin, sidebarCerrada: sbCerrada });
    const page = await ctx.newPage();
    for (const [nombre, ruta] of [
      ["extra-tareas", "/tareas"],
      ["extra-asignaciones", "/asignaciones"],
      ["extra-admin-stats", "/admin?pestana=estadisticas"],
      ["extra-clientes", "/clientes"],
      ["extra-configuracion", "/configuracion"],
      ["extra-chat", "/"],
    ]) {
      await auditarPagina(page, {
        ruta,
        width,
        modo: "claro",
        tema: "rconcept",
        slug: `${nombre}-${width}${sbCerrada ? "-colapsada" : ""}`,
        capturar: width === 320 || width === 768,
      });
    }
    await ctx.close();
  }

  // 4) Pruebas interactivas: campana, modal, equipo barra, teclado móvil, selector
  {
    const ctx = await crearContexto({ width: 375, height: 812, modo: "claro", tema: "rconcept", perfilActual: admin });
    const page = await ctx.newPage();

    // Campana abierta en /tareas
    await page.goto(`${base}/tareas`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Notificaciones/ }).click();
    await page.getByRole("region", { name: "Bandeja de notificaciones" }).waitFor();
    const rectCampana = await page.getByRole("region", { name: "Bandeja de notificaciones" }).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), vw: window.innerWidth };
    });
    assert.ok(rectCampana.left >= 0 && rectCampana.right <= 375, `Campana desborda: ${JSON.stringify(rectCampana)}`);
    await page.screenshot({ path: `${dir}/inter-campana-375-claro.png`, animations: "disabled" });
    await page.keyboard.press("Escape");

    // Modal rechazar en /tareas
    await page.getByRole("button", { name: "Rechazar" }).click();
    await page.getByRole("dialog").waitFor();
    const rectModal = await page.getByRole("dialog").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), vw: window.innerWidth, vh: window.innerHeight };
    });
    assert.ok(rectModal.left >= 0 && rectModal.right <= 375 && rectModal.bottom <= 812, `Modal desborda: ${JSON.stringify(rectModal)}`);
    await page.screenshot({ path: `${dir}/inter-modal-375-claro.png`, animations: "disabled" });
    await page.keyboard.press("Escape");

    // Barra equipo móvil en /
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Ver resumen del equipo" }).click();
    await page.locator("#barra-equipo").waitFor();
    await page.screenshot({ path: `${dir}/inter-equipo-barra-375-claro.png`, animations: "disabled" });

    // Simular teclado móvil abierto en / (375x440)
    await page.getByRole("button", { name: "Cerrar", exact: true }).click();
    await page.setViewportSize({ width: 375, height: 440 });
    await page.waitForTimeout(150);
    const rectComp = await page.locator("[data-rc-compositor]").evaluate((el) => {
      const r = el.getBoundingClientRect();
      const pill = document.querySelector('[data-rc-chrome="pill"]').getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), pillBottom: Math.round(pill.bottom), vh: window.innerHeight };
    });
    assert.ok(rectComp.top > rectComp.pillBottom && rectComp.bottom <= 440, `Compositor con teclado solapa o desborda: ${JSON.stringify(rectComp)}`);
    await page.screenshot({ path: `${dir}/inter-teclado-chat-375-claro.png`, animations: "disabled" });

    await ctx.close();
  }

  writeFileSync(`${dir}/mediciones.json`, JSON.stringify(reporte, null, 2), "utf8");
  console.log(`QA ${fase}: ${reporte.checks.length} checks, ${reporte.fallos.length} fallos, ${reporte.capturas.length} capturas`);
  for (const f of reporte.fallos) {
    console.log(`FALLO ${f.slug} (${f.width} ${f.modo} ${f.tema}): desborde0=${f.m0.desbordeX} solapes0=${f.m0.solapes.length} recortes0=${f.m0.recortes.length} solapesScroll=${f.mScroll?.solapes.length ?? 0}`);
  }
} finally {
  await browser.close();
}
