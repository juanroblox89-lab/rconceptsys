import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const carpeta = resolve(process.argv[2] ?? '../_qa-rconceptsys-chat-sandbox');
const out = resolve(process.argv[3] ?? '_qa-chat-whatsapp');
mkdirSync(out, { recursive: true });
const base = 'http://127.0.0.1:3397';
const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
const env = Object.fromEntries(['PATH','SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA'].map(k => [k, process.env[k]]).filter(([,v]) => v !== undefined));
const server = spawn(process.execPath, [next, 'dev', carpeta, '--webpack', '-p', '3397', '-H', '127.0.0.1'], {
  cwd: carpeta, windowsHide: true, stdio: 'inherit', env: { ...env, BACKEND_URL: 'http://127.0.0.1:1', NEXT_TELEMETRY_DISABLED: '1' },
});
const fin = new Promise(resolve => { server.once('exit', resolve); server.once('error', resolve); });
console.log(`Next QA oculto: PID ${server.pid} · ${base}`);
function cerrar() {
  if (server.exitCode !== null || !server.pid) return;
  if (process.platform === 'win32') return new Promise(done => {
    const comando = spawn('taskkill.exe', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    comando.once('error', () => { server.kill(); done(); }); comando.once('exit', done);
  });
  server.kill();
}
process.once('SIGINT', () => void cerrar());
process.once('SIGTERM', () => void cerrar());
const perfil = (id, nombre) => ({ id, nombre, estado: 'aprobado', es_admin: false, creado_en: '2026-11-09T00:00:00Z', roles: [] });
const yo = perfil('editor-qa', 'Lina Editor');
const otra = perfil('diseno-qa', 'Eva Diseño');
const fecha = min => `2026-11-27T21:${min}:00Z`;
const archivo = (id, tipo, nombre, autor = yo.id) => ({ id, tipo, nombre, autor_id: autor, storage_path: `${autor}/qa-${id}`, creado_en: fecha('12'), tamano: 58000, mime: 'audio/wav' });
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700"><defs><linearGradient id="a"><stop stop-color="#182b3b"/><stop offset="1" stop-color="#597188"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#a)"/></svg>';
const wav = Buffer.alloc(44 + 8000 * 9 * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < 8000 * 9; i++) wav.writeInt16LE(Math.sin(i * .32) * 3000 * (.2 + .8 * Math.sin(i / 2119) ** 2), 44 + i * 2);

function motivoError(errores, mensaje) { assert.deepEqual(errores, [], mensaje); }
async function menu(page, ctx, id, movil) {
  const bubble = page.locator(`#mensaje-${id}`);
  const fila = bubble.locator('xpath=../..');
  if (!movil) {
    const flecha = fila.getByRole('button', { name: 'Acciones del mensaje' });
    await bubble.hover();
    const [b, f] = await Promise.all([bubble.boundingBox(), flecha.boundingBox()]);
    assert.ok(Math.abs(b.x + b.width - f.x - f.width) <= 5 && Math.abs(b.y - f.y) <= 5, 'flecha en la esquina superior derecha');
    await flecha.click();
  } else {
    await bubble.scrollIntoViewIfNeeded();
    const b = await bubble.boundingBox();
    const client = await ctx.newCDPSession(page);
    try {
      const touchPoints = [{ x: b.x + 12, y: b.y + Math.min(b.height - 12, 17) }];
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints });
      await page.locator('[data-presion]').waitFor({ state: 'visible' });
      await page.getByRole('menuitem', { name: 'Responder', exact: true }).waitFor();
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally { await client.detach(); }
  }
  return page.getByRole('menu', { name: 'Acciones del mensaje', exact: true });
}

const resultados = [];
try {
  for (let i = 0; ; i++) {
    assert.ok(i < 140 && server.exitCode === null, 'No arrancó Next QA');
    const r = await fetch(`${base}/login`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
    if (r?.ok) break;
    await delay(600);
  }
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-background-networking','--disable-gpu','--renderer-process-limit=2','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'] });
  try {
    for (const width of [375, 1280]) for (const tema of ['claro','oscuro','glass']) {
      const movil = width === 375, slug = `${width}-${tema}`;
      console.log(`QA ${slug}`);
      const ctx = await browser.newContext({ viewport: { width, height: movil ? 812 : 800 }, hasTouch: movil, isMobile: movil,
        colorScheme: tema === 'claro' ? 'light' : 'dark', reducedMotion: 'reduce', serviceWorkers: 'block', permissions: ['microphone','clipboard-read','clipboard-write'] });
      try {
        await ctx.addCookies([{ name: 'rc_access_token', value: 'qa-local', url: base }]);
        const page = await ctx.newPage(); page.setDefaultTimeout(10000);
        const errores = [], posts = [], pendientes = new Map();
        let sec = 90, msgID = 30, grabaciones = 0;
        const original = { id: 10, autor_id: otra.id, autor: otra, cuerpo: 'Revisen las tomas del lunes antes del corte final.', creado_en: fecha('10') };
        let mensajes = [original,
          { id:11, autor_id:otra.id, autor:otra, cuerpo:'El corte principal ya está listo.', creado_en:fecha('11') },
          { id:12, autor_id:yo.id, autor:yo, cuerpo:'Perfecto. Dejo una nota de voz.', creado_en:fecha('12'), adjuntos:[{ ...archivo(1,'audio','nota.wav'), mensaje_id:12, duracion_seg:5 }] },
          { id:13, autor_id:otra.id, autor:otra, cuerpo:'La indicación anterior queda en el historial.', creado_en:fecha('13'), adjuntos:[{ ...archivo(2,'audio','historial.wav',otra.id), mensaje_id:13, purgado_en:fecha('01') }] },
          { id:14, autor_id:yo.id, autor:yo, cuerpo:'Estoy revisando el material.', creado_en:fecha('14'), respuesta_a_id:10, cita:{ autor:otra.nombre, extracto:original.cuerpo } },
        ];
        page.on('pageerror', e => errores.push(e.message));
        await ctx.route('**/*', route => {
          const req = route.request(), u = new URL(req.url()), p = u.pathname;
          if (u.origin !== base) return route.abort();
          if (!p.startsWith('/api/')) return route.continue();
          const json = (data, status = 200) => route.fulfill({ status, json: data });
          if (p === '/api/yo') return json(yo);
          if (p === '/api/yo/celular') return json({ celular: '+573001112233' });
          if (p === '/api/yo/apariencia') return json({ tema: tema === 'claro' ? 'rconcept' : tema === 'oscuro' ? 'rconcept-dark' : 'glass', modo: tema === 'claro' ? 'claro' : 'oscuro', contraste:false,movimiento:'sistema',oscurecido:8,imagen:tema === 'glass' ? 'a'.repeat(32)+'.png' : undefined });
          if (p.startsWith('/api/yo/apariencia/fondo/')) return route.fulfill({ contentType:'image/svg+xml', body:svg });
          if (p === '/api/notificaciones') return json({ no_leidas:0, notificaciones:[] });
          if (p === '/api/equipo/resumen') return json({ nombre:'RConcept Systems', descripcion:'Equipo de producción', enlaces:[], actividad:{mensajes:5,tareas:2,miembros:2,archivos:2} });
          if (p === '/api/chat' && req.method() === 'GET') return json(mensajes.slice().reverse());
          if (p === '/api/chat' && req.method() === 'POST') {
            const data = req.postDataJSON(); posts.push(data);
            const parent = mensajes.find(m => m.id === data.respuesta_a_id);
            const id = msgID++;
            const msg = { id, autor_id:yo.id, autor:yo,cuerpo:data.cuerpo,creado_en:fecha('16'),
              respuesta_a_id:data.respuesta_a_id,cita:parent ? {autor:parent.autor.nombre,extracto:parent.cuerpo} : undefined,
              adjuntos:data.adjuntos.map(a => ({ ...pendientes.get(a), mensaje_id:id })) };
            mensajes.push(msg);return json(msg,201);
          }
          if (p === '/api/chat/adjuntos' && req.method() === 'POST') {
            let a;
            if (req.headers()['content-type'].startsWith('application/json')) {
              const { nombre, url } = req.postDataJSON(); a = { ...archivo(sec++,'drive',nombre), url_externa:url, storage_path:null };
            } else { grabaciones++; a = archivo(sec++,'audio','nota-grabada.webm'); }
            pendientes.set(a.id,a);return json(a,201);
          }
          const r = p.match(/^\/api\/chat\/adjuntos\/(\d+)\/(archivo|conservar)$/);
          if (r?.[2] === 'archivo') {
            assert.notEqual(r[1], '2', 'un archivo purgado no debe montar peticiones de medios');
            const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers().range ?? '');
            if (range) {
              const inicio = Number(range[1]), fin = range[2] ? Math.min(wav.length - 1, Number(range[2])) : wav.length - 1;
              return route.fulfill({ status:206, contentType:'audio/wav',body:wav.subarray(inicio,fin+1),headers:{'accept-ranges':'bytes','content-range': 'bytes '+inicio+'-'+fin+'/'+wav.length} });
            }
            return route.fulfill({ contentType:'audio/wav',body:wav,headers:{'accept-ranges':'bytes'} });
          }
          if (r?.[2] === 'conservar' && req.method() === 'PATCH') {
            const a = mensajes.flatMap(m=>m.adjuntos??[]).find(a=>a.id===Number(r[1]));
            a.conservar=req.postDataJSON().conservar;return json(a);
          }
          return json([]);
        });
        await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.locator('#mensaje-14').waitFor();
        await page.waitForFunction(t => document.documentElement.dataset.rcTema === t, tema === 'glass' ? 'glass' : tema === 'oscuro' ? 'rconcept-dark' : 'rconcept');
        await page.getByText('Archivo eliminado tras 15 días para liberar espacio', { exact:true }).waitFor();
        const input = page.getByRole('textbox', {name:'Escribe al equipo'});
        await page.getByRole('button', {name:'Adjuntar',exact:true}).click();
        await page.getByRole('menuitem',{name:/Carpeta de Drive/}).click();
        await page.getByRole('button',{name:/Pegar enlace de Drive/}).click();
        await page.getByLabel('Nombre',{exact:true}).fill('El Jerez del Caballero');
        await page.getByLabel('Enlace de Drive',{exact:true}).fill('https://drive.google.com/drive/folders/qa-sintetico');
        await page.getByRole('button',{name:'Agregar carpeta'}).click();
        await page.getByRole('button',{name:'Quitar El Jerez del Caballero'}).waitFor();
        const chip = page.locator('[data-rc-chips-chat] > span').first();
        const [c, campo, mas] = await Promise.all([chip.boundingBox(),input.boundingBox(),page.getByRole('button',{name:'Adjuntar',exact:true}).boundingBox()]);
        assert.ok(c.x >= mas.x+mas.width && Math.abs(c.x-campo.x) < 14 && c.y+c.height < campo.y+3, `chip alineado: ${JSON.stringify({c,campo,mas})}`);
        const otro = await page.locator('#mensaje-10').boundingBox(), propio=await page.locator('#mensaje-12').boundingBox();
        const alineacion = await page.evaluate(() => {
          function medir(id) {
            const b = document.getElementById(`mensaje-${id}`);
            const r = b.getBoundingClientRect();
            const lista = b.closest('[class*="messageList"]').getBoundingClientRect();
            return { izq: r.left-lista.left, der: lista.right-r.right };
          }
          return { otro:medir(10), propio:medir(12) };
        });
        await page.screenshot({ path:resolve(out,`${slug}-chat.png`) });
        const margen = movil ? 52 : 60;
        assert.ok(otro && propio && alineacion.otro.izq <= margen && alineacion.propio.der <= margen, `alineación lateral: ${JSON.stringify(alineacion)}`);
        await page.waitForFunction(() => document.querySelector('[data-rc-tiempo-audio]')?.textContent?.endsWith('0:09'));
        const slider = page.getByRole('slider',{name:'Posición del audio'}).first();
        await slider.scrollIntoViewIfNeeded();
        await page.waitForFunction(() => document.querySelector('audio')?.readyState >= 1);
        const b = await slider.boundingBox();
        await page.mouse.move(b.x+b.width*.2,b.y+b.height/2); await page.mouse.down();
        await page.mouse.move(b.x+b.width*.72,b.y+b.height/2,{steps:6}); await page.mouse.up();
        assert.ok(Number(await slider.inputValue()) > 4, 'arrastrar adelanta la posición');
        await slider.press('Home'); assert.equal(Number(await slider.inputValue()),0);
        await page.getByRole('button',{name:'Reproducir audio nota.wav'}).click();
        await page.getByRole('button',{name:'Pausar audio nota.wav'}).click();
        await page.screenshot({ path:resolve(out,`${slug}-chat.png`) });
        let acciones = await menu(page, ctx, 12, movil);
        await page.screenshot({path:resolve(out,`${slug}-menu.png`)});
        await acciones.getByRole('menuitem',{name:'Conservar / No purgar'}).click();
        await page.getByText('Conservado',{exact:true}).waitFor();
        acciones = await menu(page,ctx,10,movil);
        assert.equal(await acciones.getByRole('menuitem',{name:'Editar'}).count(),0);
        await acciones.getByRole('menuitem',{name:'Responder',exact:true}).click();
        await page.getByText('Respondiendo a Eva Diseño').waitFor();
        await input.fill('Recibido, dejo la carpeta'); await input.press('Enter');
        await page.getByText('Recibido, dejo la carpeta',{exact:true}).waitFor();
        assert.equal(posts[0].respuesta_a_id,10); assert.equal(posts[0].adjuntos.length,1);
        await page.locator('#mensaje-30').getByRole('button',{name:'Ir al mensaje citado de Eva Diseño'}).click();
        assert.equal(await page.locator('#mensaje-10').getAttribute('data-rc-resaltado'),'true');
        if (tema === 'claro') {
          await page.getByRole('button',{name:'Grabar audio'}).click();
          await page.getByRole('button',{name:'Detener grabación'}).waitFor();
          await delay(550);
          await page.getByRole('button',{name:'Detener grabación'}).click();
          await page.getByRole('button',{name:/Quitar audio-.*\.webm/}).waitFor();
          await page.getByRole('button',{name:'Enviar mensaje'}).click();
          await page.locator('#mensaje-31').waitFor();
          assert.equal(grabaciones,1); assert.equal(posts[1].adjuntos.length,1);
        }
        const medida = await page.evaluate(() => ({ ancho:innerWidth,total:document.documentElement.scrollWidth }));
        assert.equal(medida.total,medida.ancho); motivoError(errores,`Errores JS ${slug}`);
        resultados.push({ slug, ...medida, chipX:Math.round(c.x), entradaX:Math.round(campo.x), finBoton:Math.round(mas.x+mas.width), grabada:tema==='claro' });
        writeFileSync(resolve(out,'resultados.json'),JSON.stringify(resultados,null,2));
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); }
} finally {
  await cerrar(); await Promise.race([fin,delay(1500)]);
  console.log(`Servidor QA PID ${server.pid} cerrado`);
}
