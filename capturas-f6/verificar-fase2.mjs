import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { access } from 'node:fs/promises';

const web = 'http://localhost:3312';
const api = 'http://127.0.0.1:8311';
async function post(ruta, datos, perfil) {
  const r = await fetch(`${api}/api/${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(perfil ? { 'X-Demo-User': perfil } : {}) }, body: JSON.stringify(datos) });
  assert.ok(r.ok, `${ruta} ${r.status}`); return await r.json();
}
await post('chat', { cuerpo: '@Mateo prueba de enlace directo de F6' }, 'admin-1');
const perfil = await post('auth/login', { correo: 'camarografo@rconcept.com', contrasena: 'demo' });
const local = chromium.executablePath();
const exe = await access(local).then(() => local, () => `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`);
const browser = await chromium.launch({ executablePath: exe });
try {
  for (const width of [375, 1280]) {
    if (width === 1280) await post('chat', { cuerpo: '@Mateo segunda prueba de enlace directo de F6' }, 'admin-1');
    const ctx = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 800 } });
    await ctx.addCookies([{ name: 'rc_access_token', value: perfil.access_token, url: web }]);
    const p = await ctx.newPage();
    const errores = []; p.on('pageerror', e => errores.push(e.message));
    const captura = async (nombre) => {
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
      await p.screenshot({ path: `capturas-f6/f2-${nombre}-${width}-claro.png`, animations: 'disabled' });
    };
    await p.goto(`${web}/tareas`);
    await p.getByRole('button', { name: /Notificaciones, \d+ sin leer/ }).click();
    const panel = p.getByRole('region', { name: 'Bandeja de notificaciones' });
    await panel.getByText('Admin Demo te mencionó').first().waitFor();
    await captura('campana');
    await panel.getByText('Admin Demo te mencionó').first().click();
    await p.waitForURL(/mensaje=/);
    await p.locator('[id^="mensaje-"]').filter({ hasText: /prueba de enlace/ }).first().waitFor();
    await captura('mensaje');
    await p.goto(`${web}/configuracion`);
    await p.getByRole('heading', { name: 'Notificaciones', exact: true }).waitFor();
    await captura('preferencias');
    await p.getByLabel('Silenciar chat del equipo').check();
    await p.getByRole('button', { name: 'Guardar preferencias' }).click();
    await p.getByText('Preferencias guardadas.').waitFor();
    await p.goto(`${web}/drive-cambio?archivo=demo-prueba-f6`);
    await p.getByRole('link', { name: 'Abrir archivo en Drive' }).waitFor();
    await captura('drive');
    assert.deepEqual(errores, []);
    console.log(`${width}: bandeja, mención, preferencias y destino Drive sin desbordes ni errores de página`);
    await ctx.close();
  }
} finally { await browser.close(); }
