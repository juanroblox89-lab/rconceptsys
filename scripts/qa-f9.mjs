import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.QA_BASE ?? 'http://127.0.0.1:3319';
const dir = process.env.QA_DIR ?? 'capturas-f9';
mkdirSync(dir, { recursive: true });

const admin = { id: 'admin-qa', nombre: 'Admin Demo', estado: 'aprobado', es_admin: true };
const miembro = { id: 'editor-qa', nombre: 'Mateo Editor', estado: 'aprobado', es_admin: false };
const carpeta = (id) => `https://drive.google.com/drive/folders/${id}`;
const clientes = [{ id: 1, nombre: 'Estudio Norte', activo: true, drive_carpeta_id: 'estudio_norte', drive_url: carpeta('estudio_norte') },
  { id: 2, nombre: 'Casa Ávila', activo: true, drive_carpeta_id: 'casa_avila', drive_url: carpeta('casa_avila') }];
const tipo = { id: 1, nombre: 'Edición de video', activo: true, unidad: 'trabajo' };
const drive = { conectado: true, configurado: true, organizado: true, correo: 'drive@example.test', carpeta_raiz_id: 'raiz_qa', carpeta_raiz_nombre: 'Rohlfing concept' };
const datos = { tipo_id: tipo.id, tipo, asignado_a: miembro.id, asignado: miembro, creado_por: admin.id, cliente_id: 2, cliente: clientes[1], titulo: 'Corte para redes', descripcion: 'Editar el corte para redes y revisar las referencias del rodaje.', estado: 'pendiente', fecha_limite: '2026-12-05', creada_en: '2026-11-24T12:00:00Z' };
const docs = [
  { id: 'clips_qa', name: 'Clips del rodaje', mimeType: 'application/vnd.google-apps.folder', url: carpeta('clips_qa') },
  { id: 'guion_qa', name: 'Guion de edición', mimeType: 'application/vnd.google-apps.document', url: 'https://docs.google.com/document/d/guion_qa/edit' },
  { id: 'color_qa', name: 'Referencias de color', mimeType: 'application/vnd.google-apps.folder' },
];
const picker = `(() => {
  const docs = ${JSON.stringify(docs)};
  window.gapi = {load:(_n, opt) => opt.callback()};
  window.google = {picker:{
    DocsView:class {setParent(id){window.__padre=id;return this} setIncludeFolders(v){window.__incluye=v;return this} setSelectFolderEnabled(v){window.__carpetas=v;return this}},
    PickerBuilder:class {
      setOAuthToken(t){window.__token=t;return this} setDeveloperKey(){return this} setOrigin(){return this} setAppId(){return this} setLocale(){return this}
      setMaxItems(n){window.__max=n;return this} addView(){return this} setCallback(cb){this.cb=cb;return this}
      build(){
        const cb=this.cb, d=document.createElement('dialog');
        d.setAttribute('aria-label','Picker Drive simulado');
        for (const doc of docs) {
          const b=document.createElement('button'); b.type='button'; b.textContent=doc.name;
          b.onclick=()=>cb({action:'picked',docs:[doc]}); d.append(b);
        }
        d.addEventListener('cancel', e=>{e.preventDefault();cb({action:'cancel'})});
        document.body.append(d); return {setVisible(v){if(v&&!d.open)d.showModal();else if(!v&&d.open)d.close()},dispose(){d.remove()}};
      }
    }, Action:{PICKED:'picked',CANCEL:'cancel'}
  }};
})();`;

const resultados = [];
const browser = await chromium.launch({ headless: true, channel: 'msedge', args: ['--renderer-process-limit=2', '--disable-background-networking', '--disable-gpu'] });
try {
  for (const width of process.env.QA_WIDTH ? [Number(process.env.QA_WIDTH)] : [375, 1280]) {
    for (const modo of process.env.QA_MODE ? [process.env.QA_MODE] : ['claro', 'oscuro']) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 800 }, colorScheme: modo === 'claro' ? 'light' : 'dark', reducedMotion: 'reduce', serviceWorkers: 'block' });
      try {
        const page = await ctx.newPage();
        page.setDefaultNavigationTimeout(120_000);
        page.setDefaultTimeout(25_000);
        let perfil = admin;
        let tarea;
        let peticionesPicker = [];
        let simulaciones = 0;
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));
        await ctx.addCookies([{ name: 'rc_access_token', value: 'f9-qa', url: base }]);
        await ctx.route('**/*', async route => {
          const req = route.request();
          const u = new URL(req.url());
          const p = u.pathname;
          if (u.origin === 'https://apis.google.com') return route.fulfill({ contentType: 'text/javascript', body: picker });
          if (u.origin !== base) return route.abort();
          if (!p.startsWith('/api/')) return route.continue();
          const enviar = (json, status = 200) => route.fulfill({ json, status });
          if (!perfil.es_admin && p.startsWith('/api/admin/')) return enviar({ error: { codigo: 'solo_admin', mensaje: 'Solo administradores.' } }, 403);
          if (p === '/api/yo') return enviar(perfil);
          if (p === '/api/yo/celular') return enviar({ celular: '+573001234567' });
          if (p === '/api/yo/apariencia') return enviar({ modo, tema: 'rconcept', movimiento: 'sistema', contraste: false, oscurecido: 32 });
          if (p === '/api/equipo/resumen') return enviar({ nombre: 'RConcept', descripcion: 'Equipo de producción audiovisual.', enlaces: [] });
          if (p === '/api/admin/clientes') return enviar(clientes);
          if (p === '/api/admin/miembros') return enviar([miembro]);
          if (p === '/api/admin/trabajos') return enviar([tipo]);
          if (p === '/api/admin/drive') return enviar(drive);
          if (p === '/api/admin/drive/organizar') return enviar({ clientes_listos: 2, clientes_pendientes: [] });
          if (p === '/api/admin/drive/migrar-carpetas') {
            assert.ok(!req.postDataJSON()?.huella, 'QA solo simula');
            simulaciones++;
            return enviar({ huella: 'f9-qa', movimientos: [], omitidas: [] });
          }
          if (p === '/api/admin/drive/picker-token') {
            const id = u.searchParams.get('cliente_id');
            peticionesPicker.push(id);
            return enviar({ access_token: 'temporal-qa', expires_in: 3600, carpeta_id: clientes.find(c => String(c.id) === id)?.drive_carpeta_id ?? 'raiz_qa', clave: 'qa', proyecto_id: '123' });
          }
          if (p === '/api/admin/tareas' && req.method() === 'POST') {
            const body = req.postDataJSON();
            tarea = { ...datos, ...body, id: 81, drive_carpeta_id: 'entrega_qa', drive_carpeta_url: carpeta('entrega_qa') };
            return enviar(tarea, 201);
          }
          if (p === '/api/admin/tareas/81') {
            if (req.method() === 'PATCH') tarea = { ...tarea, ...req.postDataJSON() };
            return enviar(tarea);
          }
          if (p === '/api/tareas') return enviar([tarea, { ...datos, id: 82, titulo: 'Trabajo legado con ID', descripcion: 'Trabajo legado con ID', drive_carpeta_id: 'legado_id' }, { ...datos, id: 83, titulo: 'Trabajo legado con URL', descripcion: 'Trabajo legado con URL', drive_carpeta_url: carpeta('legado_url') }]);
          if (p === '/api/notificaciones') return enviar({ no_leidas: 0, notificaciones: [] });
          if (p === '/api/notificaciones/preferencias') return enviar({ tipos_silenciados: [], silenciar_chat: false, silencio_desde: '', silencio_hasta: '' });
          if (p === '/api/push/clave') return enviar({ configurado: false, clave: '' });
          if (p === '/api/admin/asignaciones/recientes') return enviar({ asignaciones: [], recientes: [] });
          return enviar([]);
        });
        const visita = (path) => page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
        const refs = page.getByRole('region', { name: 'Referencias de Drive', exact: true });
        const agregar = refs.getByRole('button', { name: 'Añadir carpeta', exact: true });
        const cliente = page.getByRole('combobox', { name: 'Cliente', exact: true });
        const dlg = page.getByRole('dialog', { name: 'Picker Drive simulado' });
        const ref = (nombre) => refs.getByRole('link', { name: `Abrir ${nombre}`, exact: true });
        const clickRef = (accion, nombre) => refs.getByRole('button', { name: `${accion} ${nombre}`, exact: true }).click();
        async function captura(n) {
          const slug = `asignar-${n}-ref-${width}-${modo}`;
          await page.waitForFunction(tema => document.documentElement.dataset.rcModo === tema, modo);
          assert.equal(await refs.getByRole('listitem').count(), n);
          const medidas = await refs.evaluate(el => ({ viewport: innerWidth, documento: document.documentElement.scrollWidth,
            vista: document.querySelector('main')?.clientWidth, scroll: document.querySelector('main')?.scrollWidth,
            alturas: [...el.querySelectorAll('li')].map(row => Math.round(row.getBoundingClientRect().height)),
            color: getComputedStyle(document.documentElement).colorScheme }));
          assert.equal(medidas.documento, width, slug);
          assert.equal(medidas.vista, medidas.scroll, slug);
          assert.equal(medidas.color, modo === 'claro' ? 'light' : 'dark', slug);
          // Expande solo el contenedor de scroll para que se vea el formulario entero en el PNG.
          await page.screenshot({ path: `${dir}/${slug}.png`, fullPage: true, animations: 'disabled', style: `
            body:has(main form) [class*="AppShell_root"] { height: auto; min-height: 100dvh; overflow: visible; }
            body:has(main form) main { height: auto; overflow: visible; }
            body:has(main form) main > [data-rc-entrada] { height: auto; }
          ` });
          resultados.push({ slug, ...medidas });
        }
        console.log('QA', width, modo);
        await visita('/trabajos/nuevo');
        await cliente.selectOption('1');
        await ref('Carpeta de Estudio Norte').waitFor();
        await page.getByRole('combobox', { name: 'Persona', exact: true }).selectOption(miembro.id);
        await page.getByRole('combobox', { name: 'Tipo de trabajo' }).selectOption('1');
        await page.getByLabel('Fecha de entrega').fill('2026-12-05');
        await page.getByLabel('Especificaciones').fill(datos.descripcion);
        assert.equal(peticionesPicker.length, 0);
        await captura(1);
        await agregar.click();
        await dlg.waitFor();
        assert.deepEqual(await page.evaluate(() => [window.__padre, window.__token, window.__incluye, window.__carpetas, window.__max]), ['estudio_norte', 'temporal-qa', true, true, 1]);
        await page.keyboard.press('Escape');
        await dlg.waitFor({ state: 'hidden' });
        assert.equal(await refs.getByRole('listitem').count(), 1);
        await agregar.focus();
        await page.keyboard.press('Enter');
        await dlg.getByRole('button', { name: 'Clips del rodaje' }).click();
        await ref('Clips del rodaje').waitFor();
        await captura(2);
        await agregar.click();
        await dlg.getByRole('button', { name: 'Guion de edición' }).click();
        await ref('Guion de edición').waitFor();
        assert.ok(await agregar.isDisabled());
        await captura(3);
        await cliente.selectOption('2');
        await ref('Carpeta de Casa Ávila').waitFor();
        assert.equal(await ref('Carpeta de Estudio Norte').count(), 0);
        await clickRef('Quitar', 'Clips del rodaje');
        await refs.getByRole('button', { name: 'No', exact: true }).click();
        await ref('Clips del rodaje').waitFor();
        await clickRef('Cambiar', 'Clips del rodaje');
        await dlg.waitFor();
        assert.equal(await page.evaluate(() => window.__padre), 'casa_avila');
        await dlg.getByRole('button', { name: 'Referencias de color' }).click();
        await ref('Referencias de color').waitFor();
        assert.equal(await ref('Referencias de color').getAttribute('href'), carpeta('color_qa'));
        assert.deepEqual(peticionesPicker, ['1', '1', '1', '2']);
        await page.getByRole('button', { name: 'Asignar trabajo', exact: true }).click();
        await page.waitForURL('**/trabajos/81?**');
        const editar = page.getByRole('region', { name: 'Editar trabajo' });
        await editar.getByRole('button', { name: 'Guardar cambios' }).waitFor();
        assert.deepEqual(tarea.drive_referencias.map(({ id, tipo }) => [id, tipo]), [['casa_avila', 'carpeta'], ['color_qa', 'carpeta'], ['guion_qa', 'archivo']]);
        await clickRef('Quitar', 'Guion de edición');
        await refs.getByRole('button', { name: 'Sí', exact: true }).click();
        await editar.getByRole('button', { name: 'Guardar cambios' }).click();
        await page.getByText('Cambios guardados.', { exact: true }).waitFor();
        assert.deepEqual(tarea.drive_referencias.map(r => r.id), ['casa_avila', 'color_qa']);
        tarea.estado = 'hecha';
        await visita('/trabajos/81');
        await ref('Carpeta de Casa Ávila').waitFor();
        assert.equal(await refs.getByRole('button').count(), 0);
        await visita('/admin?pestana=equipo');
        await page.getByText('Carpeta raíz: Rohlfing concept', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Organizar Drive', exact: true }).click();
        await page.getByText('Estructura de Drive preparada', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Simular movimientos', exact: true }).click();
        await page.getByRole('region', { name: 'Resultado de la simulación' }).waitFor();
        assert.equal(simulaciones, 1);
        perfil = miembro;
        await visita('/tareas');
        await ref('Carpeta de Casa Ávila').waitFor();
        assert.equal(await ref('Carpeta de Casa Ávila').getAttribute('target'), '_blank');
        await ctx.route(carpeta('casa_avila'), route => route.fulfill({ contentType: 'text/plain', body: 'Referencia de QA' }));
        const nuevaPestana = ctx.waitForEvent('page');
        await ref('Carpeta de Casa Ávila').click();
        const destino = await nuevaPestana;
        await destino.waitForURL(carpeta('casa_avila'));
        assert.equal(await destino.locator('body').innerText(), 'Referencia de QA');
        await destino.close();
        const legado = refs.getByRole('link', { name: 'Abrir Carpeta del trabajo' });
        assert.deepEqual(await legado.evaluateAll(links => links.map(a => a.href).sort()), [carpeta('legado_id'), carpeta('legado_url')]);
        assert.equal(await refs.getByRole('button').count(), 0);
        assert.deepEqual(errores, []);
      } finally { await ctx.close(); }
    }
  }
} finally { await browser.close(); }
writeFileSync(`${dir}/mediciones.json`, `${JSON.stringify(resultados, null, 2)}\n`);
