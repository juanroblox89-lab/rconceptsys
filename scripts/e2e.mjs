// scripts/e2e.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const QA_DIR = join(__dirname, '..', '_qa', 'f0');
mkdirSync(QA_DIR, { recursive: true });

const BASE_URL = 'http://localhost:3310';

async function main() {
  console.log('[E2E] Iniciando suite Playwright contra', BASE_URL);
  const browser = await chromium.launch({
    headless: true,
    channel: 'msedge',
  });

  const viewports = [
    { name: '375', width: 375, height: 812 },
    { name: '1280', width: 1280, height: 800 },
  ];

  for (const vp of viewports) {
    console.log(`\n--- Probando a resolución ${vp.name} (${vp.width}x${vp.height}) ---`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    const page = await context.newPage();

    // 1. Pantalla Login
    console.log(`[${vp.name}] Capturando login...`);
    await page.goto(`${BASE_URL}/login`);
    await page.waitForSelector('h1');
    await page.screenshot({ path: join(QA_DIR, `login-${vp.name}.png`), fullPage: true });

    // 2. Pantalla Registro
    console.log(`[${vp.name}] Capturando registro...`);
    await page.goto(`${BASE_URL}/registro`);
    await page.waitForSelector('h1');
    await page.screenshot({ path: join(QA_DIR, `registro-${vp.name}.png`), fullPage: true });

    // 3. Pantalla Pendiente
    console.log(`[${vp.name}] Capturando pendiente...`);
    await page.goto(`${BASE_URL}/pendiente`);
    await page.waitForSelector('h1');
    await page.screenshot({ path: join(QA_DIR, `pendiente-${vp.name}.png`), fullPage: true });

    // 4. Iniciar sesión como Admin Demo (admin-1)
    console.log(`[${vp.name}] Login como Admin...`);
    await page.goto(`${BASE_URL}/login`);
    await page.fill('#correo', 'admin-1');
    await page.fill('#password', 'password12345');
    await page.click('button[type="submit"]');

    // Esperar a que cargue el Chat
    await page.waitForURL(`${BASE_URL}/`);
    await page.waitForSelector('textarea');
    console.log(`[${vp.name}] Capturando chat inicial...`);
    await page.screenshot({ path: join(QA_DIR, `chat-${vp.name}.png`), fullPage: true });

    // Enviar un mensaje de prueba en el chat
    console.log(`[${vp.name}] Enviando mensaje al chat...`);
    await page.fill('textarea', `Mensaje E2E prueba ${vp.name}`);
    await page.click('button[aria-label="Enviar mensaje"]');
    await page.waitForTimeout(1000);

    // 5. Pantalla Equipo
    console.log(`[${vp.name}] Capturando equipo...`);
    await page.goto(`${BASE_URL}/equipo`);
    await page.waitForSelector('h1');
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(QA_DIR, `equipo-${vp.name}.png`), fullPage: true });

    // 6. Detalle de Miembro (cam-1)
    console.log(`[${vp.name}] Capturando detalle de perfil miembro...`);
    await page.goto(`${BASE_URL}/equipo/cam-1`);
    await page.waitForSelector('h1');
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(QA_DIR, `equipo-detalle-${vp.name}.png`), fullPage: true });

    // 7. Mi Perfil
    console.log(`[${vp.name}] Capturando mi perfil...`);
    await page.goto(`${BASE_URL}/perfil`);
    await page.waitForSelector('h1');
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(QA_DIR, `perfil-${vp.name}.png`), fullPage: true });

    // 8. Panel Admin
    console.log(`[${vp.name}] Capturando panel admin...`);
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForSelector('h1');
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(QA_DIR, `admin-${vp.name}.png`), fullPage: true });

    // 9. Comprobar que un usuario pendiente NO puede acceder al chat
    console.log(`[${vp.name}] Verificando que usuario pendiente es redirigido...`);
    await page.evaluate(() => {
      localStorage.setItem('rc_token', 'pend-1');
    });
    await page.goto(`${BASE_URL}/`);
    await page.waitForURL(`${BASE_URL}/pendiente`);
    console.log(`[${vp.name}] OK: Usuario pendiente redirigido automáticamente a /pendiente.`);

    await context.close();
  }

  await browser.close();
  console.log('\n[E2E] ¡Pruebas E2E completadas y capturas generadas con éxito en _qa/f0!');
}

main().catch((err) => {
  console.error('[E2E] Error fatal:', err);
  process.exit(1);
});
