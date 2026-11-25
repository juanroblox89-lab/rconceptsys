import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.QA_BASE ?? 'http://127.0.0.1:3332';
const dir = process.env.QA_DIR ?? 'capturas-f12/anexo-7';
const creado = '2026-11-24T15:00:00Z';
const pared = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700"><rect width="900" height="700" fill="#60859d"/><circle cx="450" cy="210" r="240" fill="#e7d9b8"/><path fill="#253642" d="M0 450L350 210l550 370v120H0Z"/></svg>';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--renderer-process-limit=2', '--disable-background-networking'] });
const resultados = [];
try {
  for (const [width, height] of [[375, 812], [1280, 800]]) for (const modo of ['claro', 'oscuro']) {
    console.log(`${width} ${modo}`);
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: modo === 'oscuro' ? 'dark' : 'light', hasTouch: width === 375, reducedMotion: 'reduce', serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
    try {
      const page = await ctx.newPage(), errores = [], posts = [];
      page.setDefaultTimeout(16000);
      page.on('pageerror', e => errores.push(e.message));
      await ctx.addCookies([{ name: 'rc_access_token', value: 'punto7-sintetico', url: base }]);
      let perfil = { id: 'adm', estado: 'aprobado', es_admin: true, nombre: 'Alex Rivera', roles: [] };
      let tema = 'glass';
      const equipo = [], historial = [];
      await ctx.route('**/*', route => {
        const req = route.request(), u = new URL(req.url()), p = u.pathname;
        if (u.origin !== base) return route.abort();
        if (!p.startsWith('/api/')) return route.continue();
        const json = v => route.fulfill({ json: v });
        if (p === '/api/yo') return json(perfil);
        if (p === '/api/yo/celular') return json({ celular: '+573005551234' });
        if (p === '/api/yo/apariencia') return json({ tema, modo, movimiento: 'sistema', contraste: false, oscurecido: 5, imagen: `${'a'.repeat(32)}.png`, acento: '#b6004f' });
        if (p.startsWith('/api/yo/apariencia/fondo/')) return route.fulfill({ contentType: 'image/svg+xml', body: pared });
        if (p === '/api/equipo/resumen') return json({ nombre: 'Equipo QA', enlaces: [], actividad: {} });
        if (p === '/api/notificaciones') return json({ no_leidas: 0, notificaciones: [] });
        if (p === '/api/chat' && req.method() === 'POST') {
          const cuerpo = req.postDataJSON().cuerpo;
          posts.push(['equipo', cuerpo]);
          const m = { id: equipo.length + 1, cuerpo, autor_id: perfil.id, autor: perfil, creado_en: creado };
          equipo.unshift(m);
          return json(m);
        }
        if (p === '/api/chat') return json(u.searchParams.has('despues') ? [] : equipo);
        if (p === '/api/ria' && req.method() === 'POST') {
          const cuerpo = req.postDataJSON().pregunta;
          posts.push(['ria', cuerpo]);
          const r = { id: historial.length + 2, rol: 'assistant', cuerpo: 'Recibido.', creado_en: creado };
          historial.push({ id: r.id - 1, rol: 'user', cuerpo, creado_en: creado }, r);
          return route.fulfill({ contentType: 'text/event-stream', body: `event: delta\ndata: {"texto":"Recibido."}\n\nevent: fin\ndata: ${JSON.stringify(r)}\n\n` });
        }
        if (p === '/api/ria') return json(historial);
        return json([]);
      });
      const espejo = page.locator('[data-rc-espejo-comandos]');
      const menu = page.getByRole('listbox', { name: 'Secciones' });
      const nav = async (ruta, nombre) => {
        await page.goto(`${base}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        const entrada = page.getByRole('textbox', { name: nombre });
        await entrada.waitFor();
        await page.waitForFunction(t => document.documentElement.dataset.rcTema === t, tema);
        await entrada.focus();
        return entrada;
      };
      const captura = async nombre => page.screenshot({ path: `${dir}/${nombre}-${width}-${modo}.png`, animations: 'disabled' });
      const medir = entrada => entrada.evaluate(e => {
        const r = e.getBoundingClientRect(), st = getComputedStyle(e);
        return { h: r.height, scroll: e.scrollHeight, top: e.scrollTop, caret: st.caretColor, overflow: document.documentElement.scrollWidth, botones: [...e.closest('form').querySelectorAll('[data-rc-compositor-boton]')].map(b => Math.abs(b.getBoundingClientRect().bottom - r.bottom)) };
      });
      const casos = [];
      for (const [chat, ruta, nombre, boton] of [['equipo', '/', 'Escribe al equipo', 'Enviar mensaje'], ['ria', '/ria', 'Mensaje para RIA', 'Enviar a RIA']]) {
        let entrada = await nav(ruta, nombre);
        const postsAntes = posts.length;
        await entrada.pressSequentially('/tra');
        await menu.getByRole('option', { name: /^\/trabajos\b/ }).first().waitFor();
        const azul = modo === 'claro' ? 'rgb(0, 49, 100)' : 'rgb(204, 237, 255)';
        assert.equal(await espejo.locator('span').evaluate(e => getComputedStyle(e).color), azul);
        assert.equal(await menu.getByRole('option').first().locator('strong').evaluate(e => getComputedStyle(e).color), azul);
        assert.equal(await entrada.evaluate(e => getComputedStyle(e).color), 'rgba(0, 0, 0, 0)');
        assert.notEqual((await medir(entrada)).caret, 'rgba(0, 0, 0, 0)');
        assert.equal((await medir(entrada)).h, 44);
        if (chat === 'equipo') await page.getByText(/Usa \/ para abrir secciones/).waitFor();
        await captura(`${chat}-escribiendo`);
        const primera = await entrada.getAttribute('aria-activedescendant');
        await entrada.press('ArrowDown');
        assert.notEqual(await entrada.getAttribute('aria-activedescendant'), primera);
        await entrada.press('ArrowUp');
        assert.equal(await entrada.getAttribute('aria-activedescendant'), primera);
        await entrada.press('Escape');
        await menu.waitFor({ state: 'hidden' });
        assert.equal(await entrada.inputValue(), '/tra');
        await entrada.fill('/clientes');
        await menu.getByRole('option', { name: /^\/clientes / }).waitFor();
        await entrada.press('Enter');
        await page.waitForURL('**/clientes');
        assert.equal(posts.length, postsAntes);
        entrada = await nav(ruta, nombre);
        const pegar = '/clientes\nUna línea nueva\nOtra línea';
        await page.evaluate(t => navigator.clipboard.writeText(t), pegar);
        await entrada.press('Control+v');
        await page.waitForFunction(t => document.activeElement?.value === t, pegar);
        const multi = await medir(entrada);
        assert.ok(multi.h >= 88 && multi.botones.every(d => d <= 1));
        assert.equal(multi.overflow, width);
        await entrada.press('Shift+Enter');
        assert.equal(await entrada.inputValue(), `${pegar}\n`);
        await entrada.fill(Array.from({ length: 12 }, (_, i) => `/clientes línea ${i}`).join('\n'));
        await entrada.evaluate(e => { e.scrollTop = e.scrollHeight; e.dispatchEvent(new Event('scroll')); });
        await page.waitForFunction(() => {
          const t = document.activeElement, e = document.querySelector('[data-rc-espejo-comandos]');
          return t.scrollTop > 0 && e.scrollTop === t.scrollTop;
        });
        await entrada.fill('/gestion');
        await menu.getByRole('option', { name: /^\/gestion / }).waitFor();
        await entrada.press('Escape');
        await entrada.press('Enter');
        const mensaje = page.getByRole('link', { name: '/gestion', exact: true });
        await mensaje.waitFor();
        await page.waitForFunction(color => Array.from(document.querySelectorAll('a')).some(a => a.textContent === '/gestion' && a.getAttribute('href') === '/admin' && getComputedStyle(a).color === color), azul);
        assert.deepEqual(posts.at(-1), [chat, '/gestion']);
        await captura(`${chat}-enviado`);
        await entrada.fill('Mira /clientes y https://ejemplo.test/clientes, no /clientes/inventado.');
        await page.getByRole('button', { name: boton, exact: true }).click();
        await page.getByRole('link', { name: '/clientes', exact: true }).waitFor();
        assert.equal(await page.getByRole('link', { name: '/clientes/inventado', exact: true }).count(), 0);
        assert.equal(await page.getByRole('link', { name: 'https://ejemplo.test/clientes', exact: true }).count(), 0);
        await page.getByRole('link', { name: '/clientes', exact: true }).click();
        await page.waitForURL('**/clientes');
        casos.push({ chat, azul, multi });
      }
      perfil = { ...perfil, id: 'miembro', es_admin: false };
      for (const [ruta, nombre] of [['/', 'Escribe al equipo'], ['/ria', 'Mensaje para RIA']]) {
        const entrada = await nav(ruta, nombre);
        await entrada.fill('/');
        await menu.getByRole('option', { name: /^\/factura / }).waitFor();
        assert.equal(await menu.getByRole('option', { name: /^\/(admin|asignaciones|gestion|trabajos\/nuevo)\b/ }).count(), 0);
        assert.equal(await page.getByRole('link', { name: '/gestion', exact: true }).count(), 0);
      }
      tema = 'rconcept';
      const entrada = await nav('/', 'Escribe al equipo');
      await entrada.fill('/clientes');
      assert.equal(await menu.count(), 0);
      assert.equal(await espejo.count(), 0);
      assert.deepEqual(errores, []);
      resultados.push({ width, height, modo, casos, posts });
    } finally { await ctx.close(); }
  }
} finally {
  await browser.close();
  writeFileSync(`${dir}/medidas.json`, JSON.stringify(resultados, null, 2));
}
