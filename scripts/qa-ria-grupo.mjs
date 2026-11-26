// QA visual aislado. Desde la rama desde-cero: node scripts/qa-ria-grupo.mjs
// Opcional: --case=375x812-claro (reduce la matriz para diagnosticar). Usa Edge en Windows.
// Arrancar solo después de coordinar que no haya otro Next de este proyecto en ejecución.
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFile, lstat, mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = 3487;
const host = '127.0.0.1';
const base = `http://${host}:${port}`;
const windows = process.platform === 'win32';
const configs = ['package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'proxy.ts'];
const roots = ['app', 'lib', 'components', 'public'];
const matriz = [[375, 812], [1280, 800]].flatMap(([width, height]) =>
  ['claro', 'oscuro'].map(modo => ({ width, height, modo, etiqueta: `${width}x${height}-${modo}` })),
);
const filtro = process.argv[2]?.match(/^--case=(.+)$/)?.[1];
assert.ok(!process.argv[2] || matriz.some(c => c.etiqueta === filtro), 'Usa --case=<ancho>x<alto>-<claro|oscuro>');
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
assert.equal(git('branch', '--show-current').trim(), 'desde-cero');

function escucha() {
  return new Promise(resolve => {
    const s = net.connect({ host, port });
    const terminar = activo => { s.destroy(); resolve(activo); };
    s.on('connect', () => terminar(true)).on('error', () => terminar(false)).setTimeout(800, () => terminar(false));
  });
}
assert.equal(await escucha(), false, `Puerto ocupado: ${base}`);
const temp = await mkdtemp(join(tmpdir(), 'qa-ria-grupo-'));
const staging = join(temp, 'frontend');
await mkdir(staging);
console.log(`Artefactos temporales: ${temp}`);

// Lista cerrada; nunca recorremos la raíz ni datos ignorados. No se siguen enlaces de archivos fuente.
const fuentes = git('ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...roots).split('\0').filter(Boolean);
for (const rel of new Set([...fuentes, ...configs])) {
  if (!configs.includes(rel) && !/^(?:app|lib|components|public)\/(?:[^/]+\/)*[^/]+\.(?:css|[cm]?js|[cm]?ts|tsx|svg)$/i.test(rel)) continue;
  const partes = rel.split('/');
  if (partes.some(p => /^(?:\.|sensible(?:\.|$)|secrets?(?:\.|$)|datos(?:\.|$)|dumps?(?:\.|$)|privado(?:\.|$))/i.test(p) || /[:\\]/.test(p))) continue;
  for (let i = 1; i <= partes.length; ++i) {
    const dir = await lstat(join(repo, ...partes.slice(0, i)));
    assert.ok(i < partes.length ? dir.isDirectory() : dir.isFile(), `No copio enlace ni archivo no regular: ${rel}`);
  }
  const destino = join(staging, ...partes);
  await mkdir(dirname(destino), { recursive: true });
  await copyFile(join(repo, ...partes), destino);
}
await symlink(join(repo, 'node_modules'), join(staging, 'node_modules'), windows ? 'junction' : 'dir');

// next/font/google se resuelve durante la compilación en el servidor, fuera de Playwright.
// Fixture del loader de Webpack: se usa Arial local; no se descarga Inter ni se modifica la UI del repo.
const fuenteMock = join(temp, 'fuente-local.cjs');
await writeFile(fuenteMock, `module.exports = new Proxy({}, {get: () => '@font-face { font-family: Inter; font-style: normal; font-weight: 100 900; src: local("Arial"); }'});`);
// Guardia adicional para transporte Node del staging. No permite llegar al backend, ni siquiera a otro puerto local.
const redLocal = join(temp, 'red-local.cjs');
await writeFile(redLocal, `const net = require('node:net');
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const a = Array.isArray(args[0]) ? args[0] : args;
  const o = a[0];
  const p = typeof o === 'object' ? o.port : o;
  const h = typeof o === 'object' ? o.host : a[1];
  const ipc = typeof o === 'object' ? !!o.path : typeof o === 'string' && !/^\\d+$/.test(o);
  if (!ipc && !(Number(p) === ${port} && h === '${host}')) throw new Error('QA: conexión Node saliente bloqueada');
  return connect.apply(this, args);
};`);

// No se hereda ninguna variable de sitio, proxy, credencial, ni NODE_OPTIONS del shell.
const entorno = Object.fromEntries(
  ['PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'SYSTEMDRIVE', 'TEMP', 'TMP', 'TMPDIR', 'PATHEXT', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']
    .map(k => [k, process.env[k]]).filter(([, valor]) => valor !== undefined),
);
const servidor = spawn(process.execPath, [join(staging, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '--webpack', '--hostname', host, '--port', `${port}`], {
  cwd: staging, windowsHide: true, detached: !windows,
  env: {
    ...entorno, NEXT_TELEMETRY_DISABLED: '1', NEXT_DISABLE_SWC_WASM: '1',
    NODE_OPTIONS: `--require ${JSON.stringify(redLocal)} --max-old-space-size=1050`,
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fuenteMock, BACKEND_URL: ':',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const salida = createWriteStream(join(temp, 'next.log'));
servidor.stdout.pipe(salida, { end: false });
servidor.stderr.pipe(salida, { end: false });
let errorServidor;
servidor.on('error', error => { errorServidor = error; });
const pid = servidor.pid;
console.log(`Next QA PID ${pid}: ${base} (cwd ${staging})`);
let escuchaPid;
let cierreServidor;
let browser;
let cerrando;
function pidExiste(id) {
  try { process.kill(id, 0); return true; }
  catch (e) { return e.code !== 'ESRCH'; }
}
function cerrar() {
  return cerrando ??= (async () => {
    try { await browser?.close(); }
    finally {
      if (pid !== undefined && servidor.exitCode === null) {
        if (windows) spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        else { try { process.kill(-pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; } }
      } else if (windows && escuchaPid && pidExiste(escuchaPid) && await escucha()) {
        spawnSync('taskkill.exe', ['/PID', String(escuchaPid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      }
      for (let i = 0; pid && i < 30 && (pidExiste(pid) || (escuchaPid && pidExiste(escuchaPid)) || await escucha()); i++) await delay(150);
      const pidActivo = Boolean(pid && pidExiste(pid));
      const puertoActivo = await escucha();
      const escuchaPidActivo = Boolean(escuchaPid && escuchaPid !== pid && pidExiste(escuchaPid));
      cierreServidor = { pidActivo, escuchaPidActivo, puertoActivo };
      salida.end();
      console.log(`Cierre Next QA PID ${pid}, listener ${escuchaPid ?? '?'}: ${JSON.stringify(cierreServidor)}`);
      assert.ok(!pidActivo && !escuchaPidActivo && !puertoActivo, 'Verifica procesos y puerto del Next de QA');
    }
  })();
}
for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { void cerrar().finally(() => process.exit(130)); });

const fecha = '2026-11-26T14:00:00.000Z';
const perfil = (id, nombre) => ({ id, nombre, correo: `${id}@qa.invalid`, estado: 'aprobado', foto_path: null, es_admin: false, creado_en: fecha, roles: [] });
const ana = perfil('qa-ana', 'Ana QA');
const teo = perfil('qa-teo', 'Teo QA');
const uuid = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const errorRIA = 'RIA no pudo responder en este intento de QA.';
const resultadoRIA = 'QA RIA: el equipo tiene dos entregas de prueba.';
const respuestaReintento = 'QA RIA: recuperación completada sin duplicar la consulta.';
const urlExterna = 'https://qa-enlace.invalid/ria?origen=chat';
const comandoEnter = '/ria ¿Qué entregas de prueba hay para el equipo?\nIncluye el total, por favor.';
const comandoBoton = '/ria ¿Puedes repetir el resumen sintético para el equipo?';
const sse = (...eventos) => ({
  headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' },
  body: eventos.map(([tipo, dato]) => `event: ${tipo}\ndata: ${JSON.stringify(dato)}\n\n`).join(''),
});
const registros = [];

async function ejecutar(cfg) {
  const audit = { ...cfg, pasos: [], medidas: [], solicitudesRIA: [], postChat: [], privado: [], api: {}, apiDesconocida: [], externosBloqueados: [], erroresPagina: [] };
  registros.push(audit);
  let id = 100;
  const crea = (autor, cuerpo, extra = {}) => ({ id: ++id, autor_id: autor.id, autor, cuerpo, creado_en: fecha, adjuntos: [], ...extra });
  const mensajes = [crea(teo, 'Bienvenida al chat del equipo de QA.')];
  const operaciones = new Map();
  const contextos = [];
  const espera = (l, state = 'visible') => l.waitFor({ state });
  const paso = async (nombre, fn) => {
    console.log(`  ${nombre}`);
    audit.ultimoPaso = nombre;
    await fn();
    audit.pasos.push(nombre);
  };

  async function contexto(persona) {
    const ctx = await browser.newContext({
      viewport: { width: cfg.width, height: cfg.height }, colorScheme: cfg.modo === 'oscuro' ? 'dark' : 'light',
      isMobile: cfg.width === 375, hasTouch: cfg.width === 375, deviceScaleFactor: 1,
      reducedMotion: 'reduce', serviceWorkers: 'block', locale: 'es-CO',
    });
    contextos.push(ctx);
    if (persona) await ctx.addCookies([{ name: 'rc_access_token', value: `fixture-${persona.id}`, url: base, httpOnly: true }]);
    await ctx.routeWebSocket('**/*', ws => {
      const url = new URL(ws.url());
      if (url.hostname === host && url.port === String(port) && ['/_next/hmr', '/_next/webpack-hmr'].includes(url.pathname)) ws.connectToServer();
      else { audit.externosBloqueados.push(ws.url()); ws.close({ code: 1008, reason: 'QA: red bloqueada' }); }
    });
    await ctx.route('**/*', async route => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.origin !== base) {
        audit.externosBloqueados.push(req.url());
        return route.abort('blockedbyclient');
      }
      const ruta = url.pathname;
      if (!/^\/api(?:\/|$)/i.test(ruta)) return route.continue();
      const metodo = req.method();
      const clave = `${metodo} ${ruta}`;
      audit.api[clave] = (audit.api[clave] ?? 0) + 1;
      const json = datos => route.fulfill({ json: datos });
      switch (clave) {
        case 'GET /api/yo': return json(persona);
        case 'GET /api/yo/celular': return json({ celular: '+12025550104' });
        case 'GET /api/yo/apariencia': return json({ tema: 'glass', modo: cfg.modo, movimiento: 'desactivado', contraste: false, oscurecido: 5 });
        case 'GET /api/equipo/resumen': return json({ nombre: 'Equipo sintético QA', descripcion: '', enlaces: [], actividad: {} });
        case 'GET /api/notificaciones': return json({ no_leidas: 0, notificaciones: [] });
        case 'GET /api/tareas': return json([]);
        case 'GET /api/chat': {
          const despues = Number(url.searchParams.get('despues'));
          const antes = Number(url.searchParams.get('antes'));
          const limite = Number(url.searchParams.get('limite')) || 40;
          const seleccion = mensajes.filter(m => (!despues || m.id > despues) && (!antes || m.id < antes));
          return json((despues ? seleccion : seleccion.reverse()).slice(0, limite));
        }
        case 'POST /api/chat': {
          const cuerpo = req.postDataJSON()?.cuerpo;
          audit.postChat.push(cuerpo);
          const m = crea(persona, cuerpo);
          mensajes.push(m);
          return json(m);
        }
        case 'POST /api/chat/ria': {
          const body = req.postDataJSON();
          audit.solicitudesRIA.push(body);
          const valido = body && Object.keys(body).sort().join(',') === 'comando,solicitud_id' &&
            uuid.test(body.solicitud_id) && [comandoEnter, comandoBoton].includes(body.comando) &&
            req.headers()['content-type']?.includes('application/json');
          if (!valido) return route.fulfill(sse(['error', { mensaje: 'Fixture: contrato POST incorrecto.' }]));
          const fallaPrimero = body.comando === comandoBoton;
          let operacion = operaciones.get(body.solicitud_id);
          if (!operacion) {
            operacion = { consulta: crea(persona, body.comando), intentos: 0 };
            operaciones.set(body.solicitud_id, operacion);
          }
          operacion.intentos++;
          // Mantiene la petición visible el tiempo suficiente para probar el estado pendiente y ausencia de navegación.
          await delay(1200);
          if (fallaPrimero && operacion.intentos === 1) {
            return route.fulfill(sse(['consulta', operacion.consulta], ['error', { mensaje: errorRIA }]));
          }
          if (!operacion.fin) {
            operacion.fin = crea({ id: 'ria' }, fallaPrimero ? respuestaReintento : resultadoRIA, { es_ria: true });
            delete operacion.fin.autor;
            if (!mensajes.some(m => m.id === operacion.consulta.id)) mensajes.push(operacion.consulta);
            mensajes.push(operacion.fin);
          }
          return route.fulfill(sse(['consulta', operacion.consulta], ['fin', operacion.fin]));
        }
        case 'GET /api/ria': return json([{
          id: 1, rol: 'assistant', creado_en: fecha,
          cuerpo: `Historial privado sintético: /tareas debe quedar como texto.\n\n[Referencia externa de QA](${urlExterna})`,
        }]);
        case 'POST /api/ria': {
          audit.privado.push(req.postDataJSON());
          const r = { id: 3, pregunta_id: 2, rol: 'assistant', cuerpo: 'QA RIA privada: confirmación independiente.', creado_en: fecha };
          return route.fulfill(sse(['fin', r]));
        }
        default:
          audit.apiDesconocida.push(clave);
          return route.fulfill({ status: 501, json: { error: { mensaje: 'QA: sin fixture' } } });
      }
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(9000);
    page.on('pageerror', e => audit.erroresPagina.push(e.message));
    return { ctx, page };
  }
  const nav = (page, ruta) => page.goto(`${base}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const chat = page => page.getByRole('textbox', { name: 'Escribe al equipo', exact: true });
  const boton = page => page.getByRole('button', { name: 'Enviar mensaje', exact: true });
  const menu = page => page.getByRole('listbox', { name: 'Secciones' });
  const mensaje = (page, id) => page.locator(`#mensaje-${id}`);
  const enGrupo = page => assert.equal(page.url(), `${base}/`, 'el comando no debe navegar ni agregar query');
  async function captura(page, estado, input) {
    const medidas = await input.evaluate(el => {
      const caja = el.getBoundingClientRect();
      return { ventana: [innerWidth, innerHeight], documento: document.documentElement.scrollWidth, body: document.body.scrollWidth,
        compositor: { x: caja.x, y: caja.y, right: caja.right, bottom: caja.bottom },
        modo: document.documentElement.dataset.rcModo, tema: document.documentElement.dataset.rcTema };
    });
    const archivo = `${cfg.etiqueta}-${estado}.png`;
    audit.medidas.push({ estado, archivo, ...medidas });
    await page.screenshot({ path: join(temp, archivo), animations: 'disabled' });
    assert.deepEqual(medidas.ventana, [cfg.width, cfg.height]);
    assert.equal(medidas.documento, cfg.width, `${estado}: desborde del documento`);
    assert.equal(medidas.body, cfg.width, `${estado}: desborde del body`);
    assert.ok(medidas.compositor.x >= 0 && medidas.compositor.right <= cfg.width && medidas.compositor.y >= 0 && medidas.compositor.bottom <= cfg.height, `${estado}: compositor recortado`);
    assert.equal(medidas.modo, cfg.modo);
  }

  let page;
  try {
    const grupo = await contexto(ana);
    page = grupo.page;
    let entrada;
    const navegacionesImprevistas = [];
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame() && frame.url() !== `${base}/`) navegacionesImprevistas.push(frame.url());
    });
    await paso('Carga del grupo y bloqueo de red externo', async () => {
      assert.ok((await nav(page, '/'))?.ok(), 'Next debe servir el chat');
      entrada = chat(page);
      await espera(entrada);
      await espera(page.getByText(mensajes[0].cuerpo, { exact: true }));
      await page.waitForFunction(modo => document.documentElement.dataset.rcModo === modo && document.documentElement.dataset.rcTema === 'glass', cfg.modo);
      assert.equal(await page.evaluate(async u => fetch(u, { mode: 'no-cors' }).then(() => 'alcanzable', () => 'bloqueado'), urlExterna), 'bloqueado', 'la sonda externa debe bloquearse');
      assert.ok(audit.externosBloqueados.includes(urlExterna), 'la barrera Playwright debe interceptar la sonda');
    });
    await paso('Chat normal, @ria y enlace externo no invocan IA', async () => {
      const posts = ['Mensaje normal de QA.', '@ria, esto es solo un mensaje al equipo.', `Referencia externa ${urlExterna} sin comando.`];
      for (const cuerpo of posts) {
        await entrada.fill(cuerpo);
        await entrada.press('Enter');
        const id = await esperarMensaje(mensajes, cuerpo);
        await espera(mensaje(page, id));
        enGrupo(page);
      }
      assert.deepEqual(audit.postChat, posts);
      assert.deepEqual(audit.solicitudesRIA, []);
      assert.deepEqual(audit.privado, []);
      const ref = mensaje(page, mensajes.at(-1).id);
      assert.ok((await ref.innerText()).includes(urlExterna));
      const enlaces = await ref.locator('a').evaluateAll(as => as.map(a => a.getAttribute('href')));
      assert.ok(enlaces.every(href => href === urlExterna), 'si se convierte en link, conserva el destino externo');
    });
    await paso('Menú general sin atajo /ria; Escape no navega', async () => {
      await entrada.fill('/');
      await espera(menu(page).getByRole('option', { name: /^\/tareas / }));
      assert.equal(await menu(page).getByRole('option', { name: /^\/ria\b/i }).count(), 0);
      await entrada.press('Escape');
      await espera(menu(page), 'hidden');
      enGrupo(page);
      await entrada.fill('/ria');
      assert.equal(await menu(page).count(), 0, 'invocar RIA no debe abrir el menú de secciones');
      await entrada.press('Enter');
      enGrupo(page);
      assert.equal(audit.solicitudesRIA.length, 0, 'sin pregunta no debe invocar RIA');
      assert.equal(audit.postChat.length, 3, 'sin pregunta no debe crear publicación normal');
    });
    await paso('IME no envía; Shift+Enter conserva nueva línea', async () => {
      const primeraLinea = comandoEnter.split('\n')[0];
      await entrada.fill(primeraLinea);
      await entrada.dispatchEvent('compositionstart', { data: '試' });
      const keyboard = await grupo.ctx.newCDPSession(page);
      try {
        // CDP activa una composición real en Chromium; el Enter confirma la composición sin publicar.
        await keyboard.send('Input.imeSetComposition', { text: '試', selectionStart: 1, selectionEnd: 1 });
        await entrada.press('Enter');
        assert.equal(audit.solicitudesRIA.length, 0);
        assert.equal(audit.postChat.length, 3);
        assert.ok((await entrada.inputValue()).startsWith(primeraLinea), 'Enter en IME no debe vaciar la entrada');
        enGrupo(page);
        await keyboard.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
      } finally { await keyboard.detach(); }
      await entrada.dispatchEvent('compositionend', { data: '' });
      await entrada.fill(primeraLinea);
      await entrada.press('Shift+Enter');
      assert.equal(await entrada.inputValue(), `${primeraLinea}\n`);
      await page.keyboard.insertText(comandoEnter.split('\n')[1]);
      assert.equal(await entrada.inputValue(), comandoEnter);
      assert.equal(audit.solicitudesRIA.length, 0);
      await captura(page, 'borrador', entrada);
    });
    await paso('Enter: POST de grupo con UUID y fin SSE con autoría RIA', async () => {
      const req = page.waitForRequest(r => r.url() === `${base}/api/chat/ria` && r.method() === 'POST');
      await entrada.press('Enter');
      const enviado = (await req).postDataJSON();
      assert.deepEqual(Object.keys(enviado).sort(), ['comando', 'solicitud_id']);
      assert.match(enviado.solicitud_id, uuid);
      assert.equal(enviado.comando, comandoEnter);
      enGrupo(page);
      const pendiente = page.getByRole('status').filter({ hasText: /RIA está preparando una respuesta/ });
      await espera(pendiente);
      await espera(page.getByText(resultadoRIA, { exact: true }));
      const { consulta, fin } = operaciones.get(enviado.solicitud_id);
      assert.equal(fin.autor_id, 'ria');
      assert.equal(fin.es_ria, true);
      await espera(mensaje(page, consulta.id));
      const respuesta = mensaje(page, fin.id);
      await espera(respuesta.getByText(resultadoRIA, { exact: true }));
      await espera(respuesta.locator('xpath=ancestor::*[.//strong[normalize-space()="RIA"]][1]').getByText('RIA', { exact: true }).first());
      assert.ok((await mensaje(page, consulta.id).innerText()).includes('/ria'));
      assert.equal(await mensaje(page, consulta.id).getByRole('link').count(), 0, 'La consulta publicada no navega al chat privado');
      enGrupo(page);
      assert.deepEqual(audit.privado, []);
      assert.equal(audit.solicitudesRIA.length, 1);
      assert.equal(audit.postChat.length, 3);
      await captura(page, 'exito', entrada);
    });
    await paso('Botón: error SSE y reintento con el mismo UUID', async () => {
      await entrada.fill(comandoBoton);
      await boton(page).click();
      const alerta = page.getByRole('alert').filter({ hasText: errorRIA });
      await espera(alerta);
      await captura(page, 'error', entrada);
      enGrupo(page);
      const segundo = audit.solicitudesRIA[1];
      assert.equal(segundo.comando, comandoBoton);
      assert.match(segundo.solicitud_id, uuid);
      assert.notEqual(segundo.solicitud_id, audit.solicitudesRIA[0].solicitud_id);
      const op = operaciones.get(segundo.solicitud_id);
      await espera(mensaje(page, op.consulta.id)); // llega por SSE, no aparece en el fixture GET hasta aquí
      mensajes.push(op.consulta);
      await page.reload({ waitUntil: 'domcontentloaded' });
      enGrupo(page);
      await espera(mensaje(page, op.consulta.id));
      assert.equal(audit.solicitudesRIA.length, 2, 'recargar no reenvía la pregunta automáticamente');
      await page.getByRole('button', { name: 'Reintentar consulta', exact: true }).click();
      await espera(page.getByText(respuestaReintento, { exact: true }));
      await espera(alerta, 'hidden');
      assert.deepEqual(audit.solicitudesRIA[2], segundo, 'reintentar no puede crear otra llave');
      assert.equal(audit.solicitudesRIA.length, 3);
      assert.equal(op.intentos, 2);
      assert.equal(await mensaje(page, op.consulta.id).count(), 1);
      assert.equal(await mensaje(page, op.fin.id).count(), 1);
      enGrupo(page);
      await captura(page, 'reintento', entrada);
    });
    await paso('Recarga y segundo miembro ven una sola copia persistida', async () => {
      const comprobar = async vista => {
        enGrupo(vista);
        for (const { consulta, fin } of operaciones.values()) {
          await espera(mensaje(vista, consulta.id));
          await espera(mensaje(vista, fin.id).getByText(fin.cuerpo, { exact: true }));
          assert.equal(await mensaje(vista, consulta.id).count(), 1);
          assert.equal(await mensaje(vista, fin.id).count(), 1);
        }
      };
      await page.reload({ waitUntil: 'domcontentloaded' });
      await comprobar(page);
      await captura(page, 'recarga', entrada);
      const otra = await contexto(teo);
      try {
        assert.ok((await nav(otra.page, '/'))?.ok());
        await comprobar(otra.page);
        await captura(otra.page, 'otro-miembro', chat(otra.page));
      } finally { await otra.ctx.close(); }
      assert.equal(audit.solicitudesRIA.length, 3);
      assert.deepEqual(audit.privado, []);
    });
    await paso('Ruta privada independiente, protegida y ausente como atajo', async () => {
      assert.deepEqual(navegacionesImprevistas, []);
      assert.ok((await nav(page, '/ria'))?.ok());
      const privado = page.getByRole('textbox', { name: 'Mensaje para RIA', exact: true });
      await espera(privado);
      const historial = page.getByText('Historial privado sintético: /tareas debe quedar como texto.', { exact: true });
      await espera(historial);
      assert.equal(await historial.locator('a[href="/tareas"]').count(), 0, 'el historial privado no genera atajos');
      assert.equal(await page.getByRole('link', { name: 'Referencia externa de QA', exact: true }).getAttribute('href'), urlExterna);
      for (const texto of ['/', '/ria', '/tareas']) {
        await privado.fill(texto);
        assert.equal(await menu(page).count(), 0, 'el chat privado no tiene menú de comandos ni atajos');
        assert.equal(await privado.getAttribute('aria-autocomplete'), null);
        assert.equal(page.url(), `${base}/ria`);
      }
      await privado.press('Escape');
      assert.equal(await privado.inputValue(), '/tareas');
      await privado.fill('Prueba solo para el chat privado.');
      await page.getByRole('button', { name: 'Enviar a RIA', exact: true }).click();
      await espera(page.getByText('QA RIA privada: confirmación independiente.', { exact: true }));
      assert.deepEqual(audit.privado, [{ pregunta: 'Prueba solo para el chat privado.' }]);
      assert.equal(audit.solicitudesRIA.length, 3);
      assert.equal(page.url(), `${base}/ria`);
      await captura(page, 'privado', privado);
      if (cfg.etiqueta === matriz[0].etiqueta) {
        await nav(page, '/ria?q=No%20enviar%20automaticamente');
        await espera(page.getByText('Historial privado sintético: /tareas debe quedar como texto.', { exact: true }));
        assert.equal(audit.privado.length, 1, 'una query antigua no envía una pregunta al chat privado');
        const anon = await contexto(null);
        try {
          await nav(anon.page, '/ria');
          assert.equal(new URL(anon.page.url()).pathname, '/login');
          assert.equal(new URL(anon.page.url()).searchParams.get('next'), '/ria');
        } finally { await anon.ctx.close(); }
      }
    });
    assert.deepEqual(audit.apiDesconocida, [], 'se deben identificar todos los endpoints del frontend');
    assert.deepEqual(audit.erroresPagina, []);
    audit.estado = 'OK';
  } catch (e) {
    audit.estado = 'FALLÓ';
    audit.error = String(e.stack ?? e);
    if (page) await page.screenshot({ path: join(temp, `${cfg.etiqueta}-fallo-qa.png`), timeout: 3500 }).catch(() => {});
    console.error(`${cfg.etiqueta}: ${audit.ultimoPaso}\n${audit.error}`);
    process.exitCode = 1;
  } finally {
    for (const ctx of contextos) await ctx.close().catch(() => {});
  }
}

async function esperarMensaje(mensajes, cuerpo) {
  for (let i = 0; i < 60; i++) {
    const m = mensajes.find(m => m.cuerpo === cuerpo);
    if (m) return m.id;
    await delay(50);
  }
  throw new Error(`No llegó el POST de chat sintético: ${cuerpo}`);
}

try {
  for (let i = 0; i < 300 && !await escucha(); i++) {
    if (errorServidor || servidor.exitCode !== null) throw errorServidor ?? new Error(`Next terminó: ${servidor.exitCode}; revisar next.log`);
    await delay(300);
  }
  assert.equal(await escucha(), true, 'Next no arrancó a tiempo');
  if (windows) {
    const netstat = execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true });
    const linea = netstat.split(/\r?\n/).find(f => f.trim().split(/\s+/)[1] === `${host}:${port}` && /\s0\.0\.0\.0:0\s/.test(f));
    escuchaPid = Number(linea?.trim().split(/\s+/).at(-1)) || undefined;
    assert.ok(escuchaPid, 'Identifica el PID del listener loopback');
    console.log(`Listener Next QA PID ${escuchaPid}`);
  }
  browser = await chromium.launch({
    channel: windows ? 'msedge' : undefined, headless: true, env: entorno,
    args: ['--renderer-process-limit=2', '--disable-background-networking', '--disable-background-mode',
      '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
  });
  for (const cfg of matriz.filter(c => !filtro || c.etiqueta === filtro)) {
    console.log(cfg.etiqueta);
    await ejecutar(cfg);
  }
} finally {
  try { await cerrar(); }
  finally { await writeFile(join(temp, 'resultados.json'), JSON.stringify({ base, pid, escuchaPid, cierreServidor, staging, registros }, null, 2)); }
}
