import { chromium } from 'playwright';
import { access } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Usa exclusivamente el servidor demo local, sin escribir en servicios reales.
const web = 'http://localhost:3312';
const base = 'http://127.0.0.1:8311';
async function api(ruta, body, usuario = 'admin-1', method = body ? 'POST' : 'GET') {
  const r = await fetch(base + '/api' + ruta, { method, headers: { 'Content-Type': 'application/json', 'X-Demo-User': usuario }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  assert.ok(r.ok, `${method} ${ruta} ${r.status} ${JSON.stringify(j)}`);
  return j;
}
const cliente = await api('/admin/clientes', { nombre: 'Cliente de prueba F6' });
await api(`/admin/clientes/${cliente.id}`, { paquete: 'Paquete de prueba', notas: 'Datos de verificación local' }, 'admin-1', 'PATCH');
const fecha = new Date().toISOString().slice(0, 10);
const tarea = await api('/admin/tareas', { cliente_id: cliente.id, tipo_id: 1, asignado_a: 'cam-1', titulo: 'Revisar tomas de prueba', descripcion: 'Revisar tomas de prueba y preparar la entrega.', fecha_limite: fecha, forzar: true });
const navegador = chromium.executablePath();
const existe = (p) => access(p).then(() => true, () => false);
const fallback = `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`;
const browser = await chromium.launch({ executablePath: await existe(navegador) ? navegador : fallback });
let errores = 0;
try {
  for (const width of [375, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 800 }, colorScheme: 'light' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { errores++; console.error(e.message); });
    const login = async (correo) => {
      const u = await api('/auth/login', { correo, contrasena: 'demo' });
      await ctx.addCookies([{ name: 'rc_access_token', value: u.access_token, url: web }]);
    };
    const captura = async (nombre) => {
      const dimensiones = await page.evaluate(() => {
        const main = document.querySelector('main');
        return [document.documentElement.scrollWidth - document.documentElement.clientWidth, main ? main.scrollWidth - main.clientWidth : 0];
      });
      assert.deepEqual(dimensiones, [0, 0]);
      await page.screenshot({ path: `capturas-f6/f1-${nombre}-${width}-claro.png`, animations: 'disabled' });
      console.log(`${nombre} ${width}: sin desbordes`);
    };
    await login('admin@rconcept.com');
    await page.goto(`${web}/asignaciones?trabajo=${tarea.id}#trabajo-${tarea.id}`);
    const trabajo = page.locator(`#trabajo-${tarea.id}`);
    await trabajo.waitFor();
    await captura('trabajos');
    await trabajo.getByRole('button', { name: 'Editar' }).click();
    await page.getByLabel('Descripción', { exact: true }).waitFor();
    await captura('editar-trabajo');
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await page.getByRole('button', { name: 'Asignar trabajo' }).click();
    await page.getByLabel('Descripción', { exact: true }).fill('Este borrador se conserva.');
    await captura('asignar');
    await page.getByRole('button', { name: 'Crear cliente', exact: true }).click();
    await page.getByLabel('Nombre del cliente').fill(`Alta de prueba ${width}`);
    await captura('alta-en-asignacion');
    await page.getByRole('button', { name: 'Crear y seleccionar' }).click();
    await page.getByLabel('Descripción', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Descripción', { exact: true }).inputValue(), 'Este borrador se conserva.');
    assert.equal(await page.getByLabel('Cliente', { exact: true }).locator('option:checked').innerText(), `Alta de prueba ${width}`);
    await page.goto(`${web}/clientes`);
    const ficha = page.getByRole('article').filter({ hasText: 'Cliente de prueba F6' });
    await ficha.waitFor();
    await captura('clientes');
    await ficha.getByRole('button', { name: 'Ver ficha' }).click();
    await page.getByRole('dialog').getByText('Trabajos activos y entregados').waitFor();
    await captura('ficha-cliente');
    await page.getByRole('button', { name: 'Editar ficha' }).click();
    await page.getByLabel('Notas', { exact: true }).waitFor();
    await captura('editar-cliente');
    await login('camarografo@rconcept.com');
    await page.goto(`${web}/tareas?tarea=${tarea.id}#tarea-${tarea.id}`);
    const card = page.locator(`#tarea-${tarea.id}`);
    await card.waitFor();
    assert.equal(await card.evaluate((el) => getComputedStyle(el).outlineStyle), 'solid');
    await captura('tareas');
    await card.getByRole('button', { name: 'Entregar', exact: true }).click();
    await captura('entrega');
    await ctx.close();
  }
  assert.equal(errores, 0);
} finally { await browser.close(); }
