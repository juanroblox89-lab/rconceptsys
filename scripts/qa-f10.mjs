import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

async function elegir(control, nombre) {
  await control.click();
  await control.page().getByRole('listbox').getByRole('option', { name: nombre, exact: true }).click();
}

const base = process.env.QA_BASE ?? 'http://127.0.0.1:3320';
const dir = process.env.QA_DIR ?? 'capturas-f10';
const media = process.env.QA_MEDIA_DIR;
if (!media) throw new Error('Indica QA_MEDIA_DIR con foto.png, corte.webm y voz.wav sintéticos.');
const foto = readFileSync(`${media}/foto.png`);
const video = readFileSync(`${media}/corte.webm`);
const voz = readFileSync(`${media}/voz.wav`);
const prueba = { 'foto.png': [foto, 'image/png'], 'corte.webm': [video, 'video/webm'], 'voz.wav': [voz, 'audio/wav'] };
const texto = 'Ordena los clips y revisa el color antes de entregar el corte.';
const resumen = ['Ordena los clips.', 'Revisa el color.', 'Entrega el corte el viernes.'];
const transcripcion = 'Primero ordena los clips. Luego revisa el color. Entrega el corte el viernes.';
const admin = { id: 'admin-qa', nombre: 'Admin Demo', estado: 'aprobado', es_admin: true };
const miembro = { id: 'editor-qa', nombre: 'Mateo Editor', estado: 'aprobado', es_admin: false };
const tipo = { id: 2, nombre: 'Edición de video', activo: true, unidad: 'trabajo' };
const cliente = { id: 1, nombre: 'Estudio Norte', activo: true, drive_carpeta_id: 'estudio-norte', drive_url: 'https://drive.google.com/drive/folders/estudio-norte' };
mkdirSync(dir, { recursive: true });
const resultados = [];
const navegador = await chromium.launch({ headless: true, channel: 'msedge', args: ['--renderer-process-limit=2', '--disable-background-networking', '--disable-gpu', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
try {
  for (const width of [375, 1280]) for (const modo of ['claro', 'oscuro']) {
    const ctx = await navegador.newContext({ viewport: { width, height: width === 375 ? 812 : 800 }, colorScheme: modo === 'claro' ? 'light' : 'dark', reducedMotion: 'reduce', serviceWorkers: 'block', permissions: ['microphone'], acceptDownloads: true });
    try {
      let tarea;
      let perfil = admin;
      let descargas = 0;
      let altas = 0;
      let bloquear = true;
      let reintentos = 0;
      const archivos = new Map();
      const errores = [];
      const page = await ctx.newPage();
      page.on('pageerror', e => errores.push(e.message));
      page.setDefaultNavigationTimeout(120_000);
      page.setDefaultTimeout(25_000);
      await ctx.addCookies([{ name: 'rc_access_token', value: 'f10-qa', url: base }]);
      await ctx.route('**/*', async route => {
        const req = route.request(), u = new URL(req.url()), p = u.pathname, method = req.method();
        if (u.origin !== base) return route.abort();
        const enviar = (json, status = 200) => route.fulfill({ json, status });
        if (p.startsWith('/medios-f10/')) {
          const nombre = decodeURIComponent(p.split('/').at(-1));
          const [body, contentType] = prueba[nombre] ?? [voz, 'audio/wav'];
          const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers().range ?? '');
          if (range && Number(range[1]) < body.length) {
            const inicio = Number(range[1]); const fin = range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
            return route.fulfill({ status: 206, body: body.subarray(inicio, fin + 1), contentType, headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${inicio}-${fin}/${body.length}` } });
          }
          return route.fulfill({ body, contentType, headers: u.searchParams.has('download') ? { 'Content-Disposition': `attachment; filename="${nombre}"` } : {} });
        }
        if (!p.startsWith('/api/')) return route.continue();
        if (!perfil.es_admin && p.startsWith('/api/admin/')) return enviar({ error: { codigo: 'solo_admin', mensaje: 'Solo administradores.' } }, 403);
        if (p === '/api/yo') return enviar(perfil);
        if (p === '/api/yo/celular') return enviar({ celular: '+573001234567' });
        if (p === '/api/yo/apariencia') return enviar({ modo, tema: 'rconcept', movimiento: 'sistema', contraste: false, oscurecido: 32 });
        if (p === '/api/equipo/resumen') return enviar({ nombre: 'RConcept', descripcion: '', enlaces: [] });
        if (p === '/api/admin/clientes') return enviar([cliente]);
        if (p === '/api/admin/miembros') return enviar([miembro]);
        if (p === '/api/admin/trabajos') return enviar([tipo]);
        if (p === '/api/notificaciones') return enviar({ no_leidas: 0, notificaciones: [] });
        if (p === '/api/notificaciones/preferencias') return enviar({ tipos_silenciados: [] });
        if (p === '/api/push/clave') return enviar({ configurado: false, clave: '' });
        if (p === '/api/admin/tareas' && method === 'POST') {
          altas++;
          const b = req.postDataJSON();
          assert.equal(b.drive_referencias[0].id, cliente.drive_carpeta_id);
          tarea = { ...b, id: 81, tipo, cliente, asignado: miembro, creador: admin, estado: 'pendiente', creada_en: '2026-11-24T12:00:00Z' };
          return enviar(tarea, 201);
        }
        if (p === '/api/admin/tareas/81' || p === '/api/tareas/81/detalle') {
          if (method === 'PATCH') tarea = { ...tarea, ...req.postDataJSON() };
          return enviar(tarea);
        }
        if (p === '/api/tareas') return enviar(tarea ? [tarea] : []);
        const m = /^\/api\/(admin\/)?tareas\/81\/adjuntos(?:\/([^/]+))?(?:\/(.*))?$/.exec(p);
        if (m) {
          const [, esAdmin, id, accion] = m;
          if (!id && method === 'GET') return enviar([...archivos.values()].filter(a => a.listo).map(a => ({ ...a, partes: undefined })));
          if (esAdmin && !id && method === 'POST') {
            const b = req.postDataJSON();
            if (!archivos.has(b.id)) archivos.set(b.id, { ...b, partes: [], listo: false, estado_resumen: 'sin_resumen' });
            return enviar({ id: b.id, parte_bytes: 64 * 1024, listo: archivos.get(b.id).listo });
          }
          const a = archivos.get(id);
          if (!a) return enviar({}, 404);
          if (esAdmin && accion?.startsWith('partes/')) { a.partes[Number(accion.split('/')[1])] = req.postDataBuffer(); return route.fulfill({ status: 204 }); }
          if (esAdmin && accion === 'finalizar') {
            if (a.nombre === 'corte.webm' && bloquear) { bloquear = false; return enviar({ error: { mensaje: 'Error de red de prueba.' } }, 503); }
            if (prueba[a.nombre]) assert.deepEqual(Buffer.concat(a.partes), prueba[a.nombre][0]);
            a.listo = true;
            if (a.resumir) a.estado_resumen = 'fallido';
            return enviar(a, 201);
          }
          if (esAdmin && method === 'DELETE') { archivos.delete(id); return route.fulfill({ status: 204 }); }
          if (esAdmin && method === 'PATCH') { a.resumir = req.postDataJSON().resumir; return enviar(a); }
          if (!esAdmin && accion === 'firma') {
            if (u.searchParams.has('descargar')) descargas++;
            return enviar({ url: `${base}/medios-f10/${encodeURIComponent(a.nombre)}${u.searchParams.has('descargar') ? '?download=1' : ''}`, expira_en: 90 });
          }
          if (!esAdmin && accion === 'reintentar' && method === 'POST') {
            reintentos++;
            a.estado_resumen = 'pendiente';
            setTimeout(() => Object.assign(a, { estado_resumen: 'listo', resumen, transcripcion }), 1200);
            return enviar(a, 202);
          }
        }
        return enviar([]);
      });
      const root = () => page.getByRole('region', { name: 'Adjuntos', exact: true });
      const guardados = () => page.getByRole('region', { name: 'Adjuntos guardados', exact: true });
      async function captura(nombre) {
        const slug = `${nombre}-${width}-${modo}`;
        await page.waitForFunction(t => document.documentElement.dataset.rcModo === t, modo);
        const medidas = await root().evaluate(el => ({ viewport: innerWidth, ancho: document.documentElement.scrollWidth,
          main: document.querySelector('main')?.clientWidth, mainScroll: document.querySelector('main')?.scrollWidth,
          tema: getComputedStyle(document.documentElement).colorScheme,
          filas: [...el.querySelectorAll(':scope > ul > li')].map(e => ({ w: Math.round(e.getBoundingClientRect().width), y: Math.round(e.getBoundingClientRect().top) })) }));
        assert.equal(medidas.filas.length, 3);
        assert.equal(medidas.ancho, width); assert.equal(medidas.main, medidas.mainScroll); assert.equal(medidas.tema, modo === 'claro' ? 'light' : 'dark');
        if (width === 1280) assert.equal(new Set(medidas.filas.slice(0, 3).map(f => f.y)).size, 1, 'primera fila alineada');
        await page.screenshot({ path: `${dir}/${slug}.png`, fullPage: true, animations: 'disabled', style: '[class*="AppShell_root"] { height:auto; min-height:100dvh; overflow:visible } main, main > [data-rc-entrada] {height:auto!important; overflow:visible!important}' });
        resultados.push({ slug, ...medidas });
      }
      console.log(`F10 ${width} ${modo}`);
      await page.goto(`${base}/trabajos/nuevo`, { waitUntil: 'domcontentloaded' });
      await elegir(page.getByRole('combobox', { name: 'Cliente', exact: true }), cliente.nombre);
      await elegir(page.getByRole('combobox', { name: 'Persona', exact: true }), miembro.nombre);
      await elegir(page.getByRole('combobox', { name: 'Tipo de trabajo', exact: true }), tipo.nombre);
      await page.getByLabel('Fecha de entrega').fill('2026-12-05');
      await page.getByLabel('Especificaciones').fill(texto);
      const selector = root().locator('input[type=file]');
      for (const [name, [buffer, mimeType]] of Object.entries(prueba)) await selector.setInputFiles({ name, mimeType, buffer });
      await root().getByRole('switch', { name: 'Resumir con IA' }).click();
      await root().getByRole('switch', { checked: true }).waitFor();
      await root().getByRole('button', { name: 'Quitar foto.png' }).click();
      await root().getByRole('button', { name: 'No', exact: true }).press('Escape');
      await root().getByRole('button', { name: 'Quitar foto.png' }).waitFor();
      if (width === 375 && modo === 'claro') {
        await root().getByRole('button', { name: 'Grabar audio' }).click();
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Detener')));
        // Se usa un dispositivo sintético de Edge, nunca el micrófono físico.
        await page.waitForTimeout(850);
        await root().getByRole('button', { name: 'Detener' }).click();
        const grab = root().getByRole('button', { name: /^Quitar Grabación-/ });
        await grab.click();
        await root().getByRole('button', { name: 'Sí', exact: true }).click();
        assert.equal(await grab.count(), 0);
      }
      await root().locator('img').evaluate(img => img.decode());
      await captura('formulario');
      await page.getByRole('button', { name: 'Asignar trabajo', exact: true }).click();
      await page.getByText('Error de red de prueba.').waitFor();
      await root().getByRole('progressbar', { name: 'Subida de corte.webm' }).waitFor();
      await page.getByRole('button', { name: 'Guardar cambios' }).click();
      await page.waitForURL(/\/trabajos\/81/);
      assert.equal(altas, 1, 'el reintento no duplica el trabajo');
      await guardados().getByText('No se pudo', { exact: true }).waitFor();
      await guardados().getByRole('button', { name: 'Reintentar', exact: true }).click();
      await guardados().getByText('Resumiendo…').waitFor();
      await guardados().getByText('Listo', { exact: true }).waitFor();
      assert.equal(reintentos, 1);
      await root().locator('input[type=file]').setInputFiles({ name:'extra.png', mimeType:'image/png', buffer:foto });
      await page.getByRole('button', { name: 'Guardar cambios' }).click();
      await guardados().getByRole('button', { name: 'Quitar extra.png' }).click();
      await guardados().getByRole('button', { name: 'Sí', exact: true }).click();
      await guardados().getByRole('button', { name: 'Quitar extra.png' }).waitFor({ state: 'hidden' });
      perfil = miembro;
      await page.goto(`${base}/tareas`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('link', { name: 'Ver trabajo' }).click();
      await root().getByRole('button', { name: 'Ver foto.png' }).click();
      await page.getByRole('dialog', { name: 'foto.png' }).waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: 'foto.png' }).waitFor({ state: 'hidden' });
      const descarga = page.waitForEvent('download');
      await root().getByRole('button', { name: 'Descargar voz.wav' }).click();
      assert.equal((await descarga).suggestedFilename(), 'voz.wav');
      assert.equal(descargas, 1);
      await root().getByText('Transcripción', { exact: true }).click();
      await root().getByText(transcripcion, { exact: true }).waitFor();
      assert.equal(await root().getByRole('list', { name: 'Resumen' }).getByRole('listitem').count(), 3);
      assert.equal(await root().getByRole('switch').count(), 0);
      assert.equal(await page.getByRole('link', { name: 'Abrir Carpeta de Estudio Norte' }).count(), 1);
      await captura('detalle');
      assert.deepEqual(errores, []);
    } finally { await ctx.close(); }
  }
} finally { await navegador.close(); }
writeFileSync(`${dir}/mediciones.json`, JSON.stringify(resultados, null, 2));
console.log(`F10: ${resultados.length} capturas, sin desborde`);
