/* eslint-disable */
// Capturas de F5 (no es código de la app). 375 y 1280 de cada pantalla nueva o cambiada.
const { chromium } = require('playwright');

const API = 'http://127.0.0.1:8311';
const BASE = 'http://localhost:3312';

async function login(email) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: email, contrasena: 'demo' }),
  });
  const data = await res.json();
  return data.access_token;
}

async function abrir(browser, { token, ruta, ancho }) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: ancho < 500 ? 812 : 900 } });
  await ctx.addCookies([{ name: 'rc_access_token', value: token, url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(BASE + ruta, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1800);
  return { ctx, page };
}

async function capturar(browser, { nombre, token, ruta, ancho, accion }) {
  const { ctx, page } = await abrir(browser, { token, ruta, ancho });
  if (accion) {
    await accion(page);
    await page.waitForTimeout(900);
  }
  const archivo = `capturas-f5/${nombre}.png`;
  await page.screenshot({ path: archivo, fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  console.log(`${nombre}: overflowX=${overflow}px`);
  await ctx.close();
  return overflow;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Users\\USUARIO\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe',
  });
  const admin = await login('admin@rconcept.com');
  const cam = await login('camarografo@rconcept.com');

  const desbordes = [];
  const capturas = [
    { nombre: 'chat-1280', token: admin, ruta: '/', ancho: 1280 },
    {
      nombre: 'chat-riel-1280',
      token: admin,
      ruta: '/',
      ancho: 1280,
      accion: async (page) => {
        await page.getByRole('button', { name: 'Cerrar barra' }).click();
      },
    },
    { nombre: 'chat-375', token: admin, ruta: '/', ancho: 375 },
    {
      nombre: 'chat-equipo-375',
      token: admin,
      ruta: '/',
      ancho: 375,
      accion: async (page) => {
        await page.getByRole('button', { name: 'Ver resumen del equipo' }).click();
      },
    },
    { nombre: 'asignaciones-1280', token: admin, ruta: '/asignaciones', ancho: 1280 },
    { nombre: 'asignaciones-375', token: admin, ruta: '/asignaciones', ancho: 375 },
    { nombre: 'perfil-1280', token: cam, ruta: '/perfil', ancho: 1280 },
    { nombre: 'perfil-375', token: cam, ruta: '/perfil', ancho: 375 },
    { nombre: 'admin-equipo-1280', token: admin, ruta: '/admin?pestana=equipo', ancho: 1280 },
    { nombre: 'admin-equipo-375', token: admin, ruta: '/admin?pestana=equipo', ancho: 375 },
    { nombre: 'admin-piezas-1280', token: admin, ruta: '/admin?pestana=piezas', ancho: 1280 },
    { nombre: 'admin-piezas-375', token: admin, ruta: '/admin?pestana=piezas', ancho: 375 },
    { nombre: 'admin-cortes-1280', token: admin, ruta: '/admin?pestana=cortes', ancho: 1280 },
    { nombre: 'admin-cortes-375', token: admin, ruta: '/admin?pestana=cortes', ancho: 375 },
    { nombre: 'admin-clientes-375', token: admin, ruta: '/admin?pestana=clientes', ancho: 375 },
    {
      nombre: 'admin-ficha-1280',
      token: admin,
      ruta: '/admin?pestana=clientes',
      ancho: 1280,
      accion: async (page) => {
        await page.getByRole('button', { name: 'Ficha' }).first().click();
      },
    },
  ];

  for (const captura of capturas) {
    desbordes.push({ nombre: captura.nombre, overflow: await capturar(browser, captura) });
  }

  await browser.close();
  console.log('\nResumen de desbordes:', desbordes.map((d) => `${d.nombre}=${d.overflow}`).join(', '));
})().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
