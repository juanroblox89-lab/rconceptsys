/* eslint-disable */
// Script de capturas F4 (no es código de la app).
const { chromium } = require('playwright');

const API = 'http://127.0.0.1:8310';

async function login(email) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: email, contrasena: 'demo' }),
  });
  const data = await res.json();
  // Demo: access token = id del perfil
  return data.access_token || data.token || data.usuario?.id || data.id;
}

async function capturar(browser, { nombre, base, email, ruta, ancho, alto }) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  const token = await login(email);
  await ctx.addCookies([{ name: 'rc_access_token', value: token, url: base }]);
  const page = await ctx.newPage();
  await page.goto(base + ruta, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  const archivo = `capturas-f4/${nombre}.png`;
  await page.screenshot({ path: archivo, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${nombre}: overflowX=${overflow}px`);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Users\\USUARIO\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe',
  });
  const admin = { base: 'http://localhost:3310', email: 'admin@rconcept.com' };
  // Nota: en 127.0.0.1 la hidratación dev quedó bloqueada (sin peticiones /api);
  // se captura el trabajador también en localhost (misma app, otra sesión).
  const worker = { base: 'http://localhost:3310', email: 'camarografo@rconcept.com' };
  await capturar(browser, { nombre: 'admin-tareas-1280', ...admin, ruta: '/admin', ancho: 1280, alto: 900 });
  await capturar(browser, { nombre: 'admin-tareas-375', ...admin, ruta: '/admin', ancho: 375, alto: 812 });
  await capturar(browser, { nombre: 'trabajador-tareas-1280', ...worker, ruta: '/tareas', ancho: 1280, alto: 900 });
  await capturar(browser, { nombre: 'trabajador-tareas-375', ...worker, ruta: '/tareas', ancho: 375, alto: 812 });
  await capturar(browser, { nombre: 'trabajador-equipo-375', ...worker, ruta: '/equipo', ancho: 375, alto: 812 });
  await capturar(browser, { nombre: 'trabajador-perfil-375', ...worker, ruta: '/perfil', ancho: 375, alto: 812 });
  await browser.close();
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
