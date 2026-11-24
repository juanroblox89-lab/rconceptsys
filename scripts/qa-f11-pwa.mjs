import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.QA_BASE ?? 'http://127.0.0.1:3321';
const destino = 'https://drive.google.com/open?id=f11-demo';
const perfil = { id: 'f11-pwa', nombre: 'PWA de prueba', estado: 'aprobado', es_admin: false, roles: [] };
const navegador = await chromium.launchPersistentContext('_qa/f11-runtime/edge-pwa', {
  channel: 'msedge', headless: true, args: ['--disable-background-networking','--disable-gpu','--no-first-run'],
});
try {
  await navegador.addCookies([{ name: 'rc_access_token', value: 'f11-pwa', url: base }]);
  await navegador.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.href === destino) return route.fulfill({ body: 'Drive simulado' });
    if (u.origin !== base) return route.abort();
    const w = { '/api/yo': perfil, '/api/yo/celular': { celular: '+573001234567' }, '/api/yo/apariencia': { modo: 'claro', tema: 'glass' }, '/api/notificaciones': { no_leidas: 0, notificaciones: [] } };
    return u.pathname.startsWith('/api/') ? route.fulfill({ json: w[u.pathname] ?? [] }) : route.continue();
  });
  const ruta = `${base}/drive-cambio?archivo=f11-demo`;
  const basePage = navegador.pages()[0] ?? await navegador.newPage();
  await basePage.goto(ruta);
  const manifest = await basePage.evaluate(async () => {
    const href = document.querySelector('link[rel=manifest]').href;
    return await (await fetch(href)).json();
  });
  assert.equal(manifest.display, 'standalone');
  const appId = new URL(manifest.id ?? manifest.start_url, base).href;
  const cdp = await navegador.newCDPSession(basePage);
  let instalada = false;
  try {
    await cdp.send('PWA.install', { manifestId: appId, installUrlOrBundleUrl: ruta });
    instalada = true;
    const nueva = navegador.waitForEvent('page', { timeout: 12000 }); nueva.catch(() => {});
    await cdp.send('PWA.launch', { manifestId: appId, url: ruta });
    const app = await nueva;
    await app.waitForFunction(() => matchMedia('(display-mode: standalone)').matches, undefined, { timeout: 12000 });
    const popup = navegador.waitForEvent('page', { timeout: 12000 }); popup.catch(() => {});
    await app.getByRole('link', { name: 'Abrir archivo en Drive' }).click();
    const externa = await popup;
    await externa.waitForURL(destino);
    assert.equal(app.url(), ruta);
    assert.ok(await externa.evaluate(() => !window.opener && !matchMedia('(display-mode: standalone)').matches));
    console.log('PWA instalada: apertura en otro contexto, fuera de standalone.');
  } finally {
    if (instalada) await cdp.send('PWA.uninstall', { manifestId: appId }).catch(() => {});
  }
} finally {
  await navegador.close();
}
