import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.QA_BASE ?? 'http://127.0.0.1:3321';
const dir = process.env.QA_DIR ?? '_qa/f11';
const matrix = [[375,812],[1280,800]];
const pais = 'Colombia (+57)';
const rol = { id: 1, nombre: 'Editor', clave: 'editor', activo: true };
const admin = { id: 'adm', nombre: 'Admin Demo', es_admin: true, estado: 'aprobado', roles: [] };
const miembro = { id: 'm1', nombre: 'Lina Torres', es_admin: false, estado: 'aprobado', roles: [rol] };
const tipo = { id: 1, clave: 'edicion', nombre: 'Edición de video', precio: 125000, activo: true, unidad: 'trabajo', rol_id: 1 };
const drive = 'https://drive.google.com/drive/folders/estudionorte';
const cliente = { id: 1, nombre: 'Estudio Norte', activo: true, drive_url: drive, drive_carpeta_id: 'estudionorte' };
const tarea = { id: 17, titulo: 'Edición del rodaje', descripcion: 'Revisa el color y monta la entrevista.', estado: 'pendiente', asignado: miembro, asignado_a: miembro.id, cliente, cliente_id: 1, tipo, tipo_id: 1, creada_en: '2026-11-24T12:00:00Z', fecha_limite: '2026-11-30' };
const corte = { id: 12, periodo: 'quincena', desde: '2026-11-01', hasta: '2026-11-15', estado: 'cerrado', total: 180000, lineas: [{ perfil_id: miembro.id, perfil: miembro, total: 180000, tareas: 2 }] };
const idImagen = 'a'.repeat(32) + '.png';
const mensajes = '1. Abre **/personalizacion** para cambiar el tema.\n2. Usa `/tareas` para consultar tus entregas.\n3. Ajusta avisos en /configuracion.\n\nSección de administración: /admin. Ejemplo de código: `RConcept`. Ruta no válida: /tareas/inventada.';
const cssCompleta = `[data-rc-shell] { height: auto!important; min-height:100dvh; overflow: visible!important; } main, main > [data-rc-entrada] { height:auto!important; overflow:visible!important; } html[data-rc-tema=glass] body { position:relative } html[data-rc-tema=glass] body::before, html[data-rc-tema=glass] body::after { position:absolute!important }`;
mkdirSync(dir, { recursive: true });
const evidencia = [];
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--renderer-process-limit=2','--disable-background-networking','--disable-gpu','--no-first-run'] });
try {
  // Fondo sintético con contornos, zonas luminosas y oscuras para verificar el vidrio.
  const lienzo = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await lienzo.setContent(`<style>body{margin:0;background:#eef0f1}</style><svg width="1280" height="800" viewBox="0 0 1280 800"><defs><linearGradient id="c" x2="1" y2="1"><stop stop-color="#243457"/><stop offset=".58" stop-color="#4679a6"/><stop offset="1" stop-color="#ecd09c"/></linearGradient></defs><rect width="1280" height="800" fill="url(#c)"/><circle cx="940" cy="235" r="105" fill="#f3d8a4"/><path d="M0 690L270 355 445 510 665 296 905 534 1080 420 1280 600V800H0Z" fill="#366d82"/><path d="M0 735L203 614 380 663 626 520 820 619 1078 555 1280 726V800H0Z" fill="#163c59"/><path d="M120 667l555-102L905 800H504Z" fill="#6398b3" opacity=".76"/></svg>`);
  const png = await lienzo.screenshot();
  await lienzo.close();
  for (const [width, height] of (process.env.QA_WIDTH ? matrix.filter(([w]) => w === Number(process.env.QA_WIDTH)) : matrix)) {
    for (const modo of (process.env.QA_MODE ? [process.env.QA_MODE] : ['claro', 'oscuro'])) {
      console.log(`F11 ${width} ${modo}`);
      const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: modo === 'claro' ? 'light' : 'dark', reducedMotion: 'reduce', serviceWorkers: 'block' });
      try {
        let perfil = admin, cortes = 'datos', posts = 0;
        let apariencia = { tema: 'glass', modo, movimiento: 'sistema', contraste: false, oscurecido: 22, imagen: idImagen, fondo_nombre: 'Montañas.png', fondo_bytes: png.length };
        let prefs = { tipos_silenciados: [], silenciar_chat: false, silencio_desde: '', silencio_hasta: '' };
        let historial = [];
        const errores = [];
        const page = await ctx.newPage(); page.setDefaultTimeout(14000); page.setDefaultNavigationTimeout(100000);
        page.on('pageerror', e => errores.push(e.message));
        await ctx.addCookies([{ name: 'rc_access_token', value: 'f11-qa', url: base }]);
        await ctx.route('**/*', async route => {
          const req = route.request(), url = new URL(req.url()), p = url.pathname, metodo = req.method();
          if (req.url() === drive) return route.fulfill({ body: 'Google Drive simulado' });
          if (url.origin !== base) return route.abort();
          if (!p.startsWith('/api/')) return route.continue();
          const json = (v, status = 200) => route.fulfill({ status, json: v });
          if (p === '/api/yo') return json(perfil);
          if (p === '/api/yo/celular') return json({ celular: '+573005551234' });
          if (p === '/api/yo/apariencia/fondo') { apariencia = { ...apariencia, imagen: idImagen, fondo_nombre: 'Nuevo paisaje.png', fondo_bytes: png.length }; return json(apariencia); }
          if (p.startsWith('/api/yo/apariencia/fondo/')) return route.fulfill({ body: metodo === 'HEAD' ? undefined : png, contentType: 'image/png', headers: { 'content-length': String(png.length) } });
          if (p === '/api/yo/apariencia') { if (metodo === 'PUT') apariencia = req.postDataJSON(); return json(apariencia); }
          if (p === '/api/ria' && metodo === 'POST') {
            posts++;
            const creado_en = '2026-11-24T15:00:00Z', respuesta = { id: 2, rol: 'assistant', cuerpo: mensajes, creado_en };
            historial = [{ id: 1, rol: 'user', cuerpo: req.postDataJSON().pregunta, creado_en }, respuesta];
            return route.fulfill({ contentType: 'text/event-stream', body: `event: delta\ndata: ${JSON.stringify({ texto: mensajes })}\n\nevent: fin\ndata: ${JSON.stringify(respuesta)}\n\n` });
          }
          if (p === '/api/ria') return json(historial);
          if (p === '/api/admin/cortes') return cortes === 'error' ? json({ error: { mensaje: 'Error de prueba' } }, 500) : json(cortes === 'datos' ? [corte] : []);
          if (p === '/api/admin/miembros' || p === '/api/equipo') return json([miembro]);
          if (p === '/api/admin/roles') return json([rol]);
          if (p === '/api/admin/trabajos') return json([tipo]);
          if (p === '/api/admin/clientes' || p === '/api/clientes') return json([cliente]);
          if (/^\/api\/(admin\/)?clientes\/1$/.test(p)) return json({ cliente, trabajos: [], estadisticas: { total: 0, pendientes: 0, aprobados: 0, aceptados: 0, entregados: 0, minutos: 0 } });
          if (p === '/api/admin/asignaciones' || p === '/api/admin/asignaciones/recientes') return json({ asignaciones: [{ tarea }] });
          if (p === '/api/admin/tareas') return json({ tareas: [tarea], por_revisar: 0 });
          if (p === '/api/tareas') return json([tarea]);
          if (p === '/api/notificaciones/preferencias') { if (metodo === 'PUT') prefs = req.postDataJSON(); return json(prefs); }
          if (p === '/api/notificaciones') return json({ no_leidas: 0, notificaciones: [] });
          if (p === '/api/push/clave') return json({ configurado: false });
          if (p === '/api/equipo/resumen') return json({ nombre: 'RConcept', descripcion: '', enlaces: [] });
          if (p === '/api/admin/estadisticas') return json(null);
          if (p.startsWith('/api/chat')) return json([]);
          return json([]);
        });
        const goto = async ruta => page.goto(`${base}${ruta}`, { waitUntil: 'domcontentloaded' });
        async function controles(etiqueta) {
          const visibles = await page.locator('main').evaluate(el => [...el.querySelectorAll('button,input,select,textarea,progress')].filter(n => {
            const s = getComputedStyle(n); return n.getClientRects().length && s.visibility !== 'hidden' && s.opacity !== '0' && (s.appearance === 'auto' || n.tagName === 'SELECT');
          }).map(n => n.outerHTML.slice(0, 200)));
          assert.deepEqual(visibles, [], `${etiqueta}: controles nativos visibles`);
        }
        async function captura(nombre, completa = false) {
          const slug = `${nombre}-${width}-${modo}`;
          await page.waitForFunction(m => document.documentElement.dataset.rcModo === m, modo);
          const medidas = await page.evaluate(() => {
            const root = document.querySelector('[data-rc-shell]'), main = document.querySelector('main');
            return { ancho: document.documentElement.scrollWidth, anchoMain: main.clientWidth, scrollMain: main.scrollWidth, modo: document.documentElement.dataset.rcModo, tema: document.documentElement.dataset.rcTema, capa: getComputedStyle(root, '::before').backdropFilter, filtros: [...root.querySelectorAll('*')].filter(n => getComputedStyle(n).backdropFilter !== 'none').length };
          });
          assert.equal(medidas.ancho, width, slug);
          assert.equal(medidas.anchoMain, medidas.scrollMain, slug);
          if (medidas.tema === 'glass') { assert.match(medidas.capa, /blur/); assert.equal(medidas.filtros, 0, slug); }
          await controles(slug);
          await page.screenshot({ path: `${dir}/${slug}.png`, animations: 'disabled', fullPage: completa, style: completa ? cssCompleta : undefined });
          evidencia.push({ slug, ...medidas });
        }
        const entrada = page.getByRole('textbox', { name: 'Mensaje para RIA' });
        await goto('/ria');
        await entrada.waitFor();
        if (width === 375) await page.getByRole('button', { name: 'Abrir menú' }).click();
        await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Ayuda' }).click();
        await page.getByRole('heading', { name: '¿Qué quieres saber de RConcept?' }).waitFor();
        assert.equal(posts, 0);
        await entrada.fill('/'); await page.getByRole('listbox', { name: 'Secciones' }).waitFor();
        assert.equal(await page.getByRole('option', { name: /\/factura/ }).count(), 0);
        assert.ok(await page.getByRole('option', { name: /^\/admin/ }).count());
        await entrada.press('ArrowDown'); await captura('02-comandos');
        await entrada.press('Escape'); await page.getByRole('listbox').waitFor({ state: 'hidden' });
        await entrada.fill(''); await captura('01-ria-ayuda-glass');
        await page.getByRole('button', { name: '¿Cómo cambio el tema?' }).click();
        const respuesta = page.getByRole('article', { name: 'Respuesta de RIA' });
        await respuesta.getByRole('link', { name: '/personalizacion' }).waitFor();
        assert.equal(posts, 1);
        assert.equal(await respuesta.locator('ol li').count(), 3);
        assert.equal(await respuesta.locator('strong').count(), 1);
        assert.equal(await respuesta.getByRole('link', { name: '/tareas/inventada' }).count(), 0);
        const color = await respuesta.getByRole('link', { name: '/tareas' }).evaluate(n => getComputedStyle(n).color);
        assert.notEqual(color, await respuesta.evaluate(n => getComputedStyle(n).color));
        await captura('03-rutas-markdown');
        await entrada.fill('/gestion'); await entrada.press('Enter'); await page.waitForURL('**/admin');
        const tab = nombre => page.getByRole('tab', { name: nombre, exact: true });
        await tab('Trabajos').waitFor();
        await page.getByRole('combobox', { name: 'Rol asignado' }).filter({visible:true}).waitFor();
        if (width === 375) {
          const mas = page.getByRole('button', { name: 'Ver más pestañas' }); await mas.waitFor(); await mas.click();
          await page.getByRole('button', { name: 'Ver pestañas anteriores' }).waitFor();
        }
        await captura('04-gestion-glass', true);
        await tab('Cortes').click(); await page.getByText('Lina Torres', { exact: true }).filter({visible:true}).last().waitFor();
        await captura('05-cortes-con-datos');
        cortes = 'vacio'; await tab('Trabajos').click(); await tab('Cortes').click();
        await page.getByText('Sin cortes.', { exact: true }).waitFor(); assert.equal(await page.locator('main').getByRole('alert').count(), 0);
        await captura('06-cortes-vacio');
        cortes = 'error'; await tab('Trabajos').click(); await tab('Cortes').click();
        await page.getByRole('alert').getByText('No se pudieron cargar los cortes.').waitFor();
        assert.equal(await page.getByText('Sin cortes.', { exact: true }).count(), 0);
        cortes = 'vacio'; await page.getByRole('button', { name: 'Reintentar' }).click(); await page.getByText('Sin cortes.').waitFor();
        await tab('Estadísticas').click(); await page.getByRole('combobox', { name: 'Agrupar por' }).waitFor(); await controles('estadísticas');
        await goto('/personalizacion');
        await page.getByText('Montañas.png', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Usar #235d91' }).click();
        const hex = page.getByRole('textbox', { name: 'Código hex' }); assert.equal(await hex.inputValue(), '#235d91');
        await hex.fill('#xx'); assert.equal(await page.getByRole('button', {name:'Guardar apariencia'}).isDisabled(), true);
        await page.getByRole('button', { name: 'Usar el del tema' }).click(); assert.equal(await hex.inputValue(), '');
        const titulo = await page.getByRole('heading', { name: 'Personalización' }).boundingBox();
        const panel = await page.getByRole('heading', { name: 'Apariencia', exact: true }).boundingBox(); assert.ok(panel.y - titulo.y - titulo.height >= 12);
        await captura('07-personalizacion-glass', true);
        const fondo = page.locator('[data-rc-panel]').filter({ has: page.getByRole('heading', { name: 'Fondo Glass' }) });
        const colores = page.locator('[data-rc-panel]').filter({ has: page.getByRole('heading', { name: 'Colores', exact:true }) });
        await fondo.screenshot({ path: `${dir}/08-fondo-${width}-${modo}.png`, animations: 'disabled' });
        await colores.screenshot({ path: `${dir}/09-colores-${width}-${modo}.png`, animations: 'disabled' });
        await page.getByRole('button', { name: 'Quitar fondo', exact: true }).click();
        await page.getByRole('button', { name: 'Cancelar', exact: true }).click(); await page.getByText('Montañas.png').waitFor();
        await page.getByRole('button', { name: 'Quitar fondo', exact: true }).click(); await page.getByRole('button', { name: 'Sí, quitar fondo' }).click();
        await page.getByRole('button', { name: /Elegir un fondo/ }).waitFor();
        await page.locator('input[type=file]').setInputFiles({ name: 'Nuevo paisaje.png', mimeType: 'image/png', buffer: png });
        await page.getByText('Nuevo paisaje.png', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Guardar apariencia' }).click(); await page.getByText('Apariencia guardada.').waitFor();
        await goto('/tareas'); const persona = page.getByRole('combobox', {name:'Filtrar por persona'}); await persona.waitFor();
        await persona.press('Enter'); await persona.press('ArrowDown'); await persona.press('Enter');
        assert.equal(await persona.getAttribute('data-valor'), miembro.id);
        await captura('10-tareas-glass');
        await goto('/asignaciones'); await page.getByRole('button', {name:'Filtros',exact:true}).click();
        await page.getByLabel('Desde', { exact:true }).fill('2026-11-24'); await page.getByText('24 nov 2026').waitFor(); await captura('11-asignaciones');
        await goto('/configuracion'); const desde = page.getByRole('combobox', {name:'Desde: hora'}); await desde.click();
        await page.getByRole('option', {name:'22',exact:true}).click();
        await page.getByRole('checkbox', {name:'Silenciar chat del equipo'}).press('Space');
        await page.getByRole('button', {name:'Guardar preferencias'}).click(); await page.getByText('Preferencias guardadas.').waitFor();
        assert.equal(prefs.silencio_desde, '22:00'); assert.equal(prefs.silenciar_chat, true);
        await captura('12-configuracion', true);
        await goto('/perfil'); await page.getByRole('combobox', {name:'País'}).getByText(pais).waitFor(); await controles('perfil');
        await goto('/clientes'); await page.getByRole('link', {name:'Ver cliente: Estudio Norte'}).click();
        const externo = page.getByRole('link', {name:'Carpeta del cliente',exact:true}); await externo.waitFor();
        const fuente = page.url();
        const popupEvent = ctx.waitForEvent('page'); await externo.click(); const popup = await popupEvent;
        await popup.waitForURL(drive); assert.equal(page.url(), fuente); assert.equal(await popup.evaluate(() => window.opener), null); await popup.close();
        await page.evaluate(() => { Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }); window.cordova = { InAppBrowser: { open(...args){ window.__fuera = args; } } }; });
        await externo.click(); assert.deepEqual(await page.evaluate(() => window.__fuera), [drive,'_system']);
        perfil = miembro; await goto('/ria'); await entrada.waitFor();
        await entrada.fill('/'); await page.getByRole('option', {name:/\/factura/}).waitFor();
        assert.equal(await page.getByRole('option', {name:/\/admin|\/asignaciones/}).count(), 0);
        assert.equal(await respuesta.getByRole('link', {name:'/admin'}).count(), 0);
        assert.equal(await respuesta.getByText('/admin.', {exact:false}).count(), 1);
        assert.deepEqual(errores, []);
        if (!process.env.QA_GLASS_ONLY) for (const normal of ['claro','oscuro']) {
          apariencia = { ...apariencia, modo: normal, tema: 'rconcept' };
          for (const ruta of ['/tareas','/asignaciones','/admin?pestana=estadisticas','/configuracion','/perfil','/clientes']) {
            perfil = admin; await goto(ruta); await page.getByRole('heading', {level:1}).waitFor();
            if (ruta === '/asignaciones') await page.getByRole('button',{name:'Filtros',exact:true}).click();
            const selector = Object.entries({'/tareas':'Filtrar por estado','/asignaciones':'Estado','/admin?pestana=estadisticas':'Agrupar por','/configuracion':'Desde: hora','/perfil':'País'}).find(([k])=>ruta===k)?.[1];
            if (selector) await page.getByRole('combobox',{name:selector,exact:true}).filter({visible:true}).waitFor();
            await page.waitForFunction(m => document.documentElement.dataset.rcModo === m && document.documentElement.dataset.rcTema === 'rconcept', normal);
            await controles(`${ruta} ${width} ${normal}`);
          }
        }
      } finally { await ctx.close(); }
    }
  }
} finally {
  await browser.close();
  writeFileSync(`${dir}/medidas.json`, JSON.stringify(evidencia, null, 2));
}
