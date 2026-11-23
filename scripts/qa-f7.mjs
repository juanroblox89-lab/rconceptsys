import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:3313';
const dir = 'capturas-f7';
mkdirSync(dir, { recursive: true });
const admin = { id: 'admin-1', nombre: 'Admin Demo', estado: 'aprobado', es_admin: true };
const persona = { id: 'cam-1', nombre: 'Juan Esteban Álvarez Giraldo de la Torre', estado: 'aprobado', roles: [{ id: 1, clave: 'camarografo', nombre: 'Camarógrafo', activo: true }] };
const tipo = { id: 1, nombre: 'Grabación de video', unidad: 'minuto', precio: 5000, rol_id: 1, activo: true };
const clienteInicial = { id: 1, nombre: 'Estudio Norte', activo: true, notas: 'Producción audiovisual para el lanzamiento de la temporada.', paquete: 'No mostrar' };
const tareaInicial = { id: 1, titulo: 'Grabación de lanzamiento', descripcion: 'Grabar entrevistas y tomas del lugar.', estado: 'pendiente', asignado: persona, asignado_a: persona.id, cliente: clienteInicial, cliente_id: 1, tipo, tipo_id: 1, creada_en: '2026-11-22T15:00:00Z', fecha_limite: '2026-12-05' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXY0AAAAASUVORK5CYII=', 'base64');
const browser = await chromium.launch({ headless: true, channel: 'msedge', args: ['--renderer-process-limit=2'] });
const resultados = [];
try {
  for (const width of (process.env.QA_WIDTH ? [Number(process.env.QA_WIDTH)] : [375, 1280])) for (const modo of (process.env.QA_MODE ? [process.env.QA_MODE] : ['claro', 'oscuro'])) {
    const size = { width, height: width === 375 ? 812 : 800 };
    const sufijo = `${width}-${modo}`;
    const ctx = await browser.newContext({ viewport: size, colorScheme: modo === 'claro' ? 'light' : 'dark', reducedMotion: 'reduce', serviceWorkers: 'block' });
    await ctx.addCookies([{ name: 'rc_access_token', value: 'demo-f7', url: base }]);
    const page = await ctx.newPage();
    page.setDefaultNavigationTimeout(90_000);
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    await page.addInitScript(() => {
      class Voz {
        start() { this.onstart?.(); }
        stop() { this.onresult?.({ results: [{ isFinal: true, 0: { transcript: 'Texto dictado de prueba' } }] }); this.onend?.(); }
        abort() { this.onend?.(); }
      }
      window.SpeechRecognition = Voz;
    });
    let cliente = { ...clienteInicial };
    let tareas = [{ ...tareaInicial }, { ...tareaInicial, id: 2, titulo: 'Entrevista en estudio', estado: 'hecha', hecha_en: '2026-11-21T18:00:00Z', nota_persona: 'Entrevista entregada', cantidad: 12 }];
    let historial = [];
    let terminarRIA;
    let esperando;
    await ctx.route('**/*', async route => {
      const req = route.request(); const u = new URL(req.url()); const p = u.pathname;
      if (u.origin === 'https://apis.google.com') return route.fulfill({ contentType: 'text/javascript', body: 'window.gapi={load:(name,o)=>o.callback()};window.google??={};const chain=()=>new Proxy({build:()=>({setVisible:()=>window.pickCb({action:"picked",docs:[{id:"archivo_f7",name:"Guía de edición"}]})})},{get:(o,p)=>o[p]??((a)=>{if(p==="setCallback")window.pickCb=a;return chain()})});window.google.picker={PickerBuilder:class{constructor(){return chain()}},DocsView:class{constructor(){return chain()}},Action:{PICKED:"picked",CANCEL:"cancel"}};' });
      if (u.origin === 'https://accounts.google.com') return route.fulfill({ contentType: 'text/javascript', body: 'window.google??={};window.google.accounts={oauth2:{initTokenClient:o=>({requestAccessToken:()=>o.callback({access_token:"mock"})})}};' });
      if (u.origin !== base) return route.abort();
      if (!p.startsWith('/api/')) return route.continue();
      const enviar = j => route.fulfill({ json: j });
      const post = req.method() === 'POST'; const patch = req.method() === 'PATCH';
      if (p === '/api/yo/celular') return enviar({ celular: '+573001234567' });
      if (p === '/api/yo') return enviar(admin);
      if (p === '/api/yo/apariencia') return enviar({ modo, tema: 'rconcept', movimiento: 'sistema', contraste: false, oscurecido: 32 });
      if (p === '/api/admin/miembros') return enviar([persona, admin]);
      if (p === '/api/equipo/cam-1') return enviar(persona);
      if (p === '/api/admin/trabajos') return enviar([tipo]);
      if (p === '/api/admin/piezas') return enviar([]);
      if (p === '/api/admin/drive/picker') return enviar({ cliente_id: 'demo', clave: 'demo', proyecto_id: '123' });
      if (p === '/api/admin/clientes') return enviar([cliente]);
      if (p === '/api/admin/clientes/1' && patch) {
        const cuerpo = req.postDataJSON(); assert.equal('paquete' in cuerpo, false);
        cliente = { ...cliente, ...cuerpo, ...(cuerpo.drive_referencia_id ? { drive_referencia_nombre: 'Guía de edición', drive_referencia_url: 'https://drive.google.com/open?id=archivo_f7' } : {}) }; return enviar(cliente);
      }
      if (p === '/api/admin/clientes/1') return enviar({ cliente, trabajos: tareas, estadisticas: { total: tareas.length, activos: 1, entregados: 1, por_revisar: 1, aprobados: 0, cancelados: 0, ultima_entrega: tareas[1].hecha_en } });
      if (p === '/api/admin/clientes/1/foto' && post) { cliente = { ...cliente, foto_url: `/api/admin/clientes/1/foto/${'a'.repeat(32)}.png` }; return enviar(cliente); }
      if (p.startsWith('/api/admin/clientes/1/foto/')) return route.fulfill({ body: png, contentType: 'image/png' });
      if (p === '/api/admin/tareas' && post) { const t = { ...tareaInicial, ...req.postDataJSON(), id: 3 }; tareas.push(t); return enviar(t); }
      if (p === '/api/admin/tareas') return enviar({ tareas });
      if (p === '/api/admin/asignaciones') return enviar({ asignaciones: tareas.map(tarea => ({ tarea })) });
      if (p.startsWith('/api/admin/asignaciones/')) return enviar({ asignaciones: [], recientes: [] });
      const m = /^\/api\/admin\/tareas\/(\d+)(\/cancelar)?$/.exec(p);
      if (m) { const t = tareas.find(t => t.id === Number(m[1])); if (patch) Object.assign(t, req.postDataJSON()); if (m[2]) t.estado = 'cancelada'; return enviar(t); }
      if (p === '/api/notificaciones') return enviar({ no_leidas: 1, notificaciones: [{ id: 2, titulo: 'Mateo hizo una entrega', cuerpo: tareas[1].titulo, url: '/trabajos/2?desde=tareas', creada_en: tareas[1].hecha_en }] });
      if (p === '/api/ria' && !post) return enviar(historial);
      if (p === '/api/ria' && post) {
        const { pregunta } = req.postDataJSON(); const id = historial.length + 2;
        const larga = ('Esta es una respuesta de prueba para confirmar que el historial no salta al inicio mientras llega texto. ').repeat(22);
        const respuesta = { id, rol: 'assistant', cuerpo: larga, creado_en: '2026-11-22T15:00:00Z' };
        historial = [...historial, { id: id - 1, rol: 'user', cuerpo: pregunta }, respuesta];
        if (esperando) await esperando;
        return route.fulfill({ contentType: 'text/event-stream', body: `event: delta\ndata: ${JSON.stringify({ texto: larga })}\n\nevent: fin\ndata: ${JSON.stringify(respuesta)}\n\n` });
      }
      return enviar({});
    });
    async function captura(nombre) {
      await page.waitForFunction(tema => document.documentElement.dataset.rcModo === tema, modo);
      const medidas = await page.evaluate(() => {
        const main = document.querySelector('main');
        return { viewport: innerWidth, documento: document.documentElement.scrollWidth, anchoMain: main?.clientWidth, scrollMain: main?.scrollWidth, color: getComputedStyle(document.documentElement).colorScheme, fondo: getComputedStyle(main).backgroundColor };
      });
      assert.equal(medidas.color, modo === 'oscuro' ? 'dark' : 'light', `${nombre}: tema real (${medidas.fondo})`);
      const canales = medidas.fondo.match(/\d+/g)?.slice(0, 3).map(Number) ?? [];
      assert.ok(canales.length === 3 && (modo === 'oscuro' ? canales.every(c => c < 100) : canales.every(c => c > 160)), `${nombre}: fondo real ${medidas.fondo}`);
      assert.equal(medidas.documento, medidas.viewport, `${nombre}: documento sin desborde`);
      assert.equal(medidas.scrollMain, medidas.anchoMain, `${nombre}: contenido sin desborde`);
      await page.screenshot({ path: `${dir}/${nombre}-${sufijo}.png`, animations: 'disabled' });
      resultados.push({ nombre, modo, ...medidas });
    }
    console.log('QA', sufijo);
    await page.goto(`${base}/ria`);
    const mensaje = page.getByRole('textbox', { name: 'Mensaje para RIA' });
    const sugerencia = page.getByRole('button', { name: /Qué entregas faltan/ });
    await sugerencia.waitFor(); await captura('01-ria-vacio');
    await page.getByRole('button', { name: 'Dictar mensaje' }).click();
    await page.getByRole('button', { name: 'Detener dictado' }).click();
    assert.equal(await mensaje.inputValue(), 'Texto dictado de prueba');
    await mensaje.clear();
    esperando = new Promise(r => { terminarRIA = r; });
    await sugerencia.click(); await page.getByText('Pensando', { exact: true }).waitFor(); await captura('02-ria-pensando'); terminarRIA(); esperando = null;
    await page.getByRole('article', { name: 'Respuesta de RIA' }).waitFor();
    await page.waitForFunction(() => { const e = document.querySelector('[aria-label="Conversación con RIA"]'); return e.scrollHeight - e.scrollTop - e.clientHeight < 5; });
    await mensaje.fill('Segunda prueba de scroll'); await mensaje.press('Enter');
    await page.getByText('Segunda prueba de scroll', { exact: true }).waitFor();
    await page.waitForFunction(() => { const e = document.querySelector('[aria-label="Conversación con RIA"]'); return e.querySelectorAll('article').length === 4 && e.scrollHeight - e.scrollTop - e.clientHeight < 5; });
    await captura('03-ria-respuesta');
    await page.goto(`${base}/tareas`); await page.getByRole('heading', { name: /Todas las tareas/ }).waitFor(); await page.getByRole('heading', { name: /Todas las tareas/ }).scrollIntoViewIfNeeded(); await captura('04-tareas');
    await page.getByRole('link', { name: 'Abrir trabajo: Grabación de lanzamiento' }).click();
    const specs = page.getByRole('textbox', { name: 'Especificaciones' }); await specs.waitFor();
    assert.equal(await specs.getAttribute('placeholder'), 'En este video, coge los medios de...');
    await captura('05-trabajo'); await specs.fill('Actualizar especificaciones para la grabación');
    await page.getByRole('button', { name: 'Guardar cambios' }).click(); await page.getByText('Cambios guardados.').waitFor();
    await page.getByRole('button', { name: 'Cancelar trabajo', exact: true }).click(); await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Cancelar trabajo', exact: true }).click();
    await page.getByRole('button', { name: 'Sí, cancelar trabajo' }).click(); await page.getByText('El trabajo quedó cancelado.').waitFor();
    await page.goto(`${base}/asignaciones`); await page.getByRole('link', { name: 'Abrir trabajo: Entrevista en estudio' }).waitFor(); await captura('06-trabajos');
    await page.getByRole('link', { name: 'Abrir trabajo: Entrevista en estudio' }).click(); await page.getByText('Entrevista entregada', { exact: false }).waitFor();
    await page.goto(`${base}/equipo/cam-1`); await page.getByRole('button', { name: 'Enviar trabajo' }).waitFor(); await captura('07-perfil');
    await page.getByRole('button', { name: 'Enviar trabajo' }).click();
    const personaCampo = page.getByLabel('Persona', { exact: true }); await personaCampo.waitFor(); assert.equal(await personaCampo.inputValue(), 'cam-1');
    await captura('08-asignar'); await page.getByLabel('Cliente', { exact: true }).selectOption('1'); await page.getByLabel('Tipo de trabajo').selectOption('1');
    await page.getByLabel('Fecha de entrega').fill('2026-12-05'); await page.getByLabel('Especificaciones').fill('Nuevo rodaje con equipo');
    await page.getByRole('button', { name: 'Asignar trabajo', exact: true }).click(); await page.waitForURL('**/trabajos/3?*');
    await page.goto(`${base}/clientes`); const buscar = page.getByRole('searchbox', { name: 'Buscar clientes' }); await buscar.fill('norte');
    await captura('09-clientes'); await page.getByRole('link', { name: 'Ver cliente: Estudio Norte' }).click();
    await page.getByRole('heading', { name: 'Estadísticas' }).waitFor(); await captura('10-cliente');
    await page.getByRole('link', { name: 'Editar', exact: true }).click(); await page.getByLabel('Foto de perfil').waitFor(); await captura('11-editar-cliente');
    await page.getByLabel('Foto de perfil').setInputFiles({ name: 'perfil.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('button', { name: 'Seleccionar en Drive' }).click(); await page.getByRole('button', { name: 'Abrir Google Picker' }).click();
    await page.getByText('Guía de edición', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Guardar ficha' }).click(); await page.getByRole('link', { name: 'Guía de edición' }).waitFor();
    await page.getByRole('button', { name: /^Notificaciones/ }).filter({ visible: true }).first().click();
    await page.getByRole('link', { name: /Mateo hizo una entrega/ }).waitFor(); await captura('12-notificaciones');
    await page.getByRole('link', { name: /Mateo hizo una entrega/ }).click(); await page.waitForURL('**/trabajos/2?desde=tareas');
    assert.deepEqual(errores, []);
    await ctx.close();
    writeFileSync(`${dir}/mediciones-${sufijo}.json`, JSON.stringify(resultados.filter(r => r.viewport === width && r.modo === modo), null, 2));
  }
} finally { await browser.close(); }
