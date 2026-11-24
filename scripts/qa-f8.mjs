import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.QA_BASE ?? 'http://127.0.0.1:3318';
const dir = process.env.QA_DIR ?? 'capturas-f8';
mkdirSync(dir, { recursive: true });
const admin = { id: 'admin-1', nombre: 'Admin Demo', estado: 'aprobado', es_admin: true };
const miembro = { id: 'cam-1', nombre: 'Mateo Grabador', estado: 'aprobado', es_admin: false };
const cliente = { id: 1, nombre: 'Estudio Norte', activo: true, notas: 'Producción audiovisual para la próxima temporada.', drive_carpeta_id: 'estudio_norte', drive_url: 'https://drive.google.com/drive/folders/estudio_norte', material_carpeta_id: 'material_lugar', producto_carpeta_id: 'producto', drive_referencias: [{ id: 'brief_demo', nombre: 'Guía de edición', url: 'https://docs.google.com/document/d/brief_demo' }] };
const drive = { conectado: true, configurado: true, organizado: true, correo: 'drive-equipo@example.test', carpeta_raiz_id: 'rconcept_demo' };
const mov = { tarea_id: 15, carpeta_id: 'trabajo_15', nombre: 'T-15 Grabación anterior', destino_id: 'estudio_norte', destino: 'RConcept/Clientes/Estudio Norte' };
const ficha = { cliente, trabajos: [], estadisticas: { total: 0, activos: 0, entregados: 0, por_revisar: 0, aprobados: 0, cancelados: 0 } };
const picker = `(() => {
  window.gapi = {load:(_name, opt) => opt.callback()};
  window.google = {picker:{
    DocsView: class {setParent(id){window.__pickerPadre=id;return this} setIncludeFolders(){return this} setSelectFolderEnabled(){return this}},
    PickerBuilder:class {
      setOAuthToken(t){window.__pickerToken=t;return this} setDeveloperKey(){return this} setOrigin(){return this}
      setAppId(){return this} setLocale(){return this} setMaxItems(){return this} addView(){return this} enableFeature(){return this}
      setCallback(cb){this.cb=cb;return this}
      build(){
        const cb=this.cb, d=document.createElement('dialog');
        d.setAttribute('aria-label','Selector de Google Drive · doble de QA');
        d.style.cssText='margin:auto;padding:20px;width:min(90%,560px);border:1px solid var(--rc-border-subtle);border-radius:16px;background:var(--rc-superficie-clara);color:var(--rc-texto);';
        d.innerHTML='<h2>Seleccionar en Google Drive</h2><p>Simulación de QA · carpeta inicial: Estudio Norte</p><ul style="margin-block:18px"><li><label><input type="checkbox" checked> Fotos del rodaje</label></li><li><label><input type="checkbox"> Guion del proyecto</label></li></ul><div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="rc-btn rc-btn--secundario rc-btn--sm" data-cancel>Cancelar</button><button type="button" class="rc-btn rc-btn--primario rc-btn--sm" data-select>Seleccionar</button></div>';
        d.querySelector('[data-select]').onclick=()=>{cb({action:'picked',docs:[{id:'fotos_demo',name:'Fotos del rodaje',url:'https://drive.google.com/open?id=fotos_demo'}]});d.close()};
        d.querySelector('[data-cancel]').onclick=()=>{cb({action:'cancel'});d.close()};
        document.body.append(d); return {setVisible(v){if(v&&!d.open)d.showModal();else if(!v&&d.open)d.close()},dispose(){d.remove()}};
      }
    }, Action:{PICKED:'picked',CANCEL:'cancel'},Feature:{MULTISELECT_ENABLED:'multiselect'}
  }};
})();`;
const resultados = [];
const browser = await chromium.launch({ headless: true, channel: 'msedge', args: ['--renderer-process-limit=2', '--disable-background-networking', '--disable-gpu'] });
try {
  for (const width of process.env.QA_WIDTH ? [Number(process.env.QA_WIDTH)] : [375, 1280]) for (const modo of process.env.QA_MODE ? [process.env.QA_MODE] : ['claro', 'oscuro']) {
    for (const perfil of [admin, miembro]) {
      const rol = perfil.es_admin ? 'admin' : 'miembro';
      const ctx = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 800 }, colorScheme: modo === 'claro' ? 'light' : 'dark', reducedMotion: 'reduce', serviceWorkers: 'block' });
      try {
        await ctx.addCookies([{ name: 'rc_access_token', value: perfil.id, url: base }]);
        const page = await ctx.newPage();
        page.setDefaultNavigationTimeout(120_000);
        page.setDefaultTimeout(20_000);
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));
        let consentimientos = 0, token = 0, desconexiones = 0, simulaciones = 0, aplicaciones = 0;
        await ctx.route('**/*', async route => {
          const req = route.request(); const u = new URL(req.url()); const p = u.pathname;
          if (u.hostname === 'accounts.google.com') { consentimientos++; return route.abort(); }
          if (u.origin === 'https://apis.google.com') return route.fulfill({ contentType: 'text/javascript', body: picker });
          if (u.origin !== base) return route.abort();
          if (!p.startsWith('/api/')) return route.continue();
          const enviar = (json, status = 200) => route.fulfill({ json, status });
          if (!perfil.es_admin && p.startsWith('/api/admin/')) return enviar({ error: { codigo: 'solo_admin', mensaje: 'Solo administradores.' } }, 403);
          if (p === '/api/yo') return enviar(perfil);
          if (p === '/api/yo/celular') return enviar({ celular: '+573001234567' });
          if (p === '/api/yo/apariencia') return enviar({ modo, tema: 'rconcept', movimiento: 'sistema', contraste: false, oscurecido: 32 });
          if (p === '/api/clientes/1') return enviar(ficha);
          if (p === '/api/clientes' || p === '/api/admin/clientes') return enviar([cliente]);
          if (p === '/api/equipo/resumen') return enviar({ nombre: 'RConcept', descripcion: 'Equipo de producción audiovisual.', enlaces: [{ id: 1, nombre: 'Recursos de producción', url: 'https://drive.google.com/drive/folders/recursos', orden: 0 }] });
          if (p === '/api/admin/drive') return enviar({ ...drive, conectado: desconexiones === 0, organizado: desconexiones === 0 });
          if (p === '/api/admin/drive/desconectar') { desconexiones++; return enviar({ mensaje: 'Drive desconectado.' }); }
          if (p === '/api/admin/drive/organizar') return enviar({ clientes_listos: 1, clientes_pendientes: [] });
          if (p === '/api/admin/drive/migrar-carpetas') {
            if (req.postDataJSON()?.huella === 'f8-qa-plan') { aplicaciones++; return enviar({ movidas: [mov], fallidas: [] }); }
            simulaciones++; return enviar({ huella: 'f8-qa-plan', movimientos: [mov], omitidas: [21] });
          }
          if (p === '/api/admin/drive/picker-token') {
            token++; return enviar({ access_token: 'efimero-qa', expires_in: 3600, carpeta_id: u.searchParams.has('cliente_id') ? 'estudio_norte' : 'rconcept_demo', clave: 'fake', proyecto_id: '123' });
          }
          if (p === '/api/notificaciones') return enviar({ no_leidas: 0, notificaciones: [] });
          if (p === '/api/notificaciones/preferencias') return enviar({ tipos_silenciados: [], silenciar_chat: false, silencio_desde: '', silencio_hasta: '' });
          if (p === '/api/push/clave') return enviar({ configurado: false, clave: '' });
          if (p === '/api/admin/asignaciones/recientes') return enviar({ asignaciones: [], recientes: [] });
          return enviar([]);
        });
        async function captura(nombre) {
          const slug = `${nombre}-${rol}-${width}-${modo}`;
          await page.waitForFunction(tema => document.documentElement.dataset.rcModo === tema, modo);
          const medidas = await page.evaluate(() => {
            const main = document.querySelector('main');
            return { viewport: innerWidth, documento: document.documentElement.scrollWidth, anchoMain: main?.clientWidth, scrollMain: main?.scrollWidth, color: getComputedStyle(document.documentElement).colorScheme };
          });
          assert.equal(medidas.color, modo === 'oscuro' ? 'dark' : 'light', slug);
          assert.equal(medidas.documento, medidas.viewport, slug);
          assert.equal(medidas.scrollMain, medidas.anchoMain, slug);
          await page.screenshot({ path: `${dir}/${slug}.png`, animations: 'disabled' });
          resultados.push({ slug, ...medidas });
        }
        console.log('QA', rol, width, modo);
        await page.goto(`${base}/admin?pestana=equipo`, { waitUntil: 'domcontentloaded' });
        if (perfil.es_admin) {
          const desconectar = page.getByRole('button', { name: 'Desconectar Drive', exact: true });
          await desconectar.scrollIntoViewIfNeeded();
          assert.ok((await desconectar.getAttribute('class')).includes('rc-btn--peligro'));
          await captura('01-equipo');
          await desconectar.click();
          await page.getByText('¿Desconectar el Drive del equipo? Las tareas nuevas dejarán de crear carpetas.').waitFor();
          await captura('02-confirmar');
          await page.getByRole('button', { name: 'No', exact: true }).click(); assert.equal(desconexiones, 0);
          await page.getByRole('button', { name: 'Organizar Drive', exact: true }).click(); await page.getByText('Estructura de Drive preparada').waitFor();
          await page.getByRole('button', { name: 'Simular movimientos' }).click(); await page.getByRole('region', { name: 'Resultado de la simulación' }).scrollIntoViewIfNeeded();
          assert.equal(simulaciones, 1); assert.equal(aplicaciones, 0); await captura('03-simulacion');
          await page.getByRole('button', { name: 'Aplicar movimientos' }).click(); await page.getByText('1 carpetas movidas. 0 pendientes.').waitFor(); assert.equal(aplicaciones, 1);
        } else {
          await page.getByText('Solo los administradores pueden editar el equipo y el Drive.').waitFor();
          assert.equal(await page.getByRole('button', { name: /Desconectar Drive|Organizar Drive|Conectar Drive/ }).count(), 0);
          await captura('01-equipo');
        }
        await page.goto(`${base}/clientes/1`, { waitUntil: 'domcontentloaded' });
        const link = page.getByRole('link', { name: 'Guía de edición' });
        await link.waitFor();
        assert.equal(await link.getAttribute('target'), '_blank');
        await page.keyboard.press('Tab'); await link.focus();
        const estilo = await link.evaluate(e => { const s = getComputedStyle(e); return { decoracion: s.textDecorationLine, seleccion: s.userSelect, outline: s.outlineStyle }; });
        assert.deepEqual(estilo, { decoracion: 'none', seleccion: 'none', outline: 'solid' });
        assert.equal(await page.getByRole('link', { name: 'Editar', exact: true }).count(), perfil.es_admin ? 1 : 0);
        await captura('04-ficha');
        await page.goto(`${base}/clientes/1/editar`, { waitUntil: 'domcontentloaded' });
        if (perfil.es_admin) {
          await page.getByRole('button', { name: 'Guardar ficha' }).waitFor(); await captura('05-edicion');
          assert.equal(token, 0);
          await page.getByRole('button', { name: 'Añadir otra referencia de Google Drive' }).click();
          const dialogo = page.getByRole('dialog', { name: /Selector de Google Drive/ });
          await dialogo.waitFor();
          assert.deepEqual(await page.evaluate(() => [window.__pickerPadre, window.__pickerToken]), ['estudio_norte', 'efimero-qa']);
          await captura('06-picker');
          await page.keyboard.press('Escape'); await dialogo.waitFor({ state: 'hidden' });
          await page.getByRole('button', { name: 'Añadir otra referencia de Google Drive' }).click();
          await dialogo.getByRole('button', { name: 'Seleccionar' }).click(); await page.getByTitle('Fotos del rodaje', { exact: true }).waitFor();
          assert.equal(token, 2); assert.equal(consentimientos, 0);
          await page.goto(`${base}/admin?pestana=equipo`, { waitUntil: 'domcontentloaded' });
          await page.getByRole('button', { name: 'Desconectar Drive' }).click(); await page.getByRole('button', { name: 'Sí', exact: true }).click();
          await page.getByRole('button', { name: 'Conectar Drive del equipo' }).waitFor(); assert.equal(desconexiones, 1);
          await page.goto(`${base}/clientes/nuevo`, { waitUntil: 'domcontentloaded' });
          await page.getByText('Conecta el Drive del equipo en Gestión → Equipo').waitFor();
          assert.ok(await page.getByRole('button', { name: 'Seleccionar en Google Drive' }).isDisabled()); await captura('07-sin-drive');
        } else {
          await page.getByText('Ficha de solo lectura.', { exact: false }).waitFor();
          assert.equal(await page.getByRole('button', { name: /Guardar ficha|Elegir foto|Cambiar foto|Seleccionar en Google Drive|Añadir/ }).count(), 0);
          await page.getByRole('link', { name: 'Guía de edición' }).waitFor();
          await captura('05-edicion');
          assert.equal(token, 0);
        }
        await page.goto(`${base}/configuracion`, { waitUntil: 'domcontentloaded' });
        const avisos = page.getByRole('region', { name: 'Avisos push' });
        await avisos.getByText('Los avisos no están disponibles.').waitFor();
        assert.equal(await avisos.getByText(/En la APK|Tarea nueva, tarea que vence mañana|VAPID/).count(), 0);
        await avisos.scrollIntoViewIfNeeded(); await captura('08-avisos');
        assert.deepEqual(errores, []);
        writeFileSync(`${dir}/mediciones-${width}-${modo}.json`, JSON.stringify(resultados.filter(r => r.viewport === width && r.color === (modo === 'claro' ? 'light' : 'dark')), null, 2));
      } finally { await ctx.close(); }
    }
  }
} finally { await browser.close(); }
