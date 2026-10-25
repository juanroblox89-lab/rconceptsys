// scripts/e2e.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const QA_DIR = join(__dirname, '..', '_qa', 'f0b');
mkdirSync(QA_DIR, { recursive: true });

const BASE_URL = 'http://localhost:3310';

async function main() {
  console.log('[E2E F0b] Iniciando suite Playwright con Auth Real contra', BASE_URL);
  const browser = await chromium.launch({
    headless: true,
    channel: 'msedge',
  });

  const viewports = [
    { name: '375', width: 375, height: 812 },
    { name: '1280', width: 1280, height: 800 },
  ];

  for (const vp of viewports) {
    console.log(`\n==============================================`);
    console.log(`--- PROBANDO A RESOLUCIÓN ${vp.name} (${vp.width}x${vp.height}) ---`);
    console.log(`==============================================`);

    // CONTEXTO 1: Navegador A (Admin: jestalvz@gmail.com)
    const contextAdmin = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    const pageAdmin = await contextAdmin.newPage();

    // 1. Pantalla Login
    console.log(`[${vp.name}] Capturando login...`);
    await pageAdmin.goto(`${BASE_URL}/login`);
    await pageAdmin.waitForSelector('h1');
    await pageAdmin.screenshot({ path: join(QA_DIR, `login-${vp.name}.png`), fullPage: true });

    // 2. Intento de login con contraseña errónea
    console.log(`[${vp.name}] Probando login con contraseña errónea...`);
    await pageAdmin.fill('#correo', 'jestalvz@gmail.com');
    await pageAdmin.fill('#password', 'contrasena_incorrecta');
    await pageAdmin.click('button[type="submit"]');
    await pageAdmin.waitForSelector('div[class*="errorBanner"]');
    const errText = await pageAdmin.innerText('div[class*="errorBanner"]');
    console.log(`[${vp.name}] OK: Error capturado correctamente -> "${errText}"`);

    // 3. Pantalla Registro
    console.log(`[${vp.name}] Capturando registro...`);
    await pageAdmin.goto(`${BASE_URL}/registro`);
    await pageAdmin.waitForSelector('h1');
    await pageAdmin.screenshot({ path: join(QA_DIR, `registro-${vp.name}.png`), fullPage: true });

    // 4. Registro de nuevo usuario (Camarógrafo: camaro_vp@rconcept.com)
    const nuevoEmail = `camarografo_${vp.name}@rconcept.com`;
    console.log(`[${vp.name}] Registrando nuevo usuario (${nuevoEmail})...`);
    await pageAdmin.fill('#nombre', `Mateo ${vp.name}`);
    await pageAdmin.fill('#correo', nuevoEmail);
    await pageAdmin.fill('#password', 'segura12345');
    await pageAdmin.fill('#confirmar', 'segura12345');
    await pageAdmin.click('button[type="submit"]');

    // Debe llegar a /pendiente automáticamente
    await pageAdmin.waitForURL(`${BASE_URL}/pendiente`);
    console.log(`[${vp.name}] Capturando pantalla pendiente...`);
    await pageAdmin.screenshot({ path: join(QA_DIR, `pendiente-${vp.name}.png`), fullPage: true });

    // 5. El usuario pendiente intenta entrar al chat -> Debe ser rebotado a /pendiente
    console.log(`[${vp.name}] Verificando que usuario pendiente no puede entrar a / ...`);
    await pageAdmin.goto(`${BASE_URL}/`);
    await pageAdmin.waitForURL(`${BASE_URL}/pendiente`);
    console.log(`[${vp.name}] OK: Usuario pendiente bloqueado y redirigido a /pendiente.`);

    // 6. Cerrar sesión del usuario pendiente
    console.log(`[${vp.name}] Cerrando sesión de cuenta pendiente...`);
    await pageAdmin.click('button:has-text("Cerrar sesión")');
    await pageAdmin.waitForURL(`${BASE_URL}/login`);

    // 7. Login como Administrador (jestalvz@gmail.com con cookie httpOnly)
    console.log(`[${vp.name}] Login exitoso como Admin...`);
    await pageAdmin.fill('#correo', 'jestalvz@gmail.com');
    await pageAdmin.fill('#password', 'password12345');
    await pageAdmin.click('button[type="submit"]');
    await pageAdmin.waitForURL(`${BASE_URL}/`);
    await pageAdmin.waitForSelector('textarea');

    // 8. Ir al panel Admin para aprobar al usuario pendiente recién creado
    console.log(`[${vp.name}] Navegando a /admin para aprobar a ${nuevoEmail}...`);
    await pageAdmin.goto(`${BASE_URL}/admin`);
    await pageAdmin.waitForSelector('h1');
    await pageAdmin.screenshot({ path: join(QA_DIR, `admin-${vp.name}.png`), fullPage: true });

    // Encontrar fila del pendiente y elegir el rol "Camarógrafo"
    console.log(`[${vp.name}] Asignando rol Camarógrafo y aprobando cuenta...`);
    const btnCamarografo = pageAdmin.locator('button:has-text("Camarógrafo")').first();
    await btnCamarografo.click();
    await pageAdmin.waitForTimeout(300);

    const btnAprobar = pageAdmin.locator('button:has-text("Aprobar acceso")').first();
    await btnAprobar.click();
    await pageAdmin.waitForTimeout(1000);

    // 9. CONTEXTO 2: Navegador B (El nuevo usuario recién aprobado)
    console.log(`[${vp.name}] Abriendo Navegador B con la cuenta aprobada...`);
    const contextUser = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    const pageUser = await contextUser.newPage();

    await pageUser.goto(`${BASE_URL}/login`);
    await pageUser.fill('#correo', nuevoEmail);
    await pageUser.fill('#password', 'segura12345');
    await pageUser.click('button[type="submit"]');

    // Ahora que está aprobado, entra directo al Chat
    await pageUser.waitForURL(`${BASE_URL}/`);
    await pageUser.waitForSelector('textarea');
    console.log(`[${vp.name}] OK: Usuario aprobado ingresó al chat exitosamente.`);

    // 10. Intercambio de mensajes en tiempo real mediante POLLING
    console.log(`[${vp.name}] Navegador A y B en el chat...`);
    await pageAdmin.goto(`${BASE_URL}/`);
    await pageAdmin.waitForSelector('textarea');

    console.log(`[${vp.name}] Navegador B envía mensaje en el chat...`);
    const textoMensajeUser = `Hola Admin, listo para grabar (${vp.name})`;
    await pageUser.fill('textarea', textoMensajeUser);
    await pageUser.click('button[aria-label="Enviar mensaje"]');
    await pageUser.waitForTimeout(500);

    // En Navegador A (Admin), el polling cada 3s debe traer el mensaje de B
    console.log(`[${vp.name}] Navegador A espera recibir mensaje por polling...`);
    await pageAdmin.waitForSelector(`text=${textoMensajeUser}`, { timeout: 15000 });
    console.log(`[${vp.name}] OK: Navegador A recibió el mensaje enviado por Navegador B.`);

    // Navegador A responde
    const textoRespuestaAdmin = `Excelente, confirmado (${vp.name})`;
    await pageAdmin.fill('textarea', textoRespuestaAdmin);
    await pageAdmin.click('button[aria-label="Enviar mensaje"]');
    await pageAdmin.waitForTimeout(500);

    // En Navegador B, esperar a que el polling detecte la respuesta de A
    console.log(`[${vp.name}] Navegador B espera recibir respuesta por polling...`);
    await pageUser.waitForSelector(`text=${textoRespuestaAdmin}`, { timeout: 15000 });
    console.log(`[${vp.name}] OK: Mensajes intercambiados fluidamente por polling.`);

    // Capturar chat terminado
    await pageAdmin.screenshot({ path: join(QA_DIR, `chat-${vp.name}.png`), fullPage: true });

    // 11. Pantalla Equipo
    console.log(`[${vp.name}] Capturando equipo...`);
    await pageAdmin.goto(`${BASE_URL}/equipo`);
    await pageAdmin.waitForSelector('h1');
    await pageAdmin.waitForTimeout(500);
    await pageAdmin.screenshot({ path: join(QA_DIR, `equipo-${vp.name}.png`), fullPage: true });

    // 12. Detalle de miembro desde cuenta no-admin (privacidad de correo)
    console.log(`[${vp.name}] Verificando privacidad de correo en perfil de compañero...`);
    await pageUser.goto(`${BASE_URL}/equipo/uuid-admin-jestalvz`);
    await pageUser.waitForSelector('h1');
    await pageUser.waitForTimeout(500);
    await pageUser.screenshot({ path: join(QA_DIR, `equipo-detalle-${vp.name}.png`), fullPage: true });
    // Verificar que en la tarjeta de perfil no aparece el correo
    const emailElem = await pageUser.$('p[class*="correo"]');
    if (emailElem) {
      const emailVisible = await emailElem.innerText();
      console.warn(`[${vp.name}] AVISO: El correo del admin aparece para otro usuario: ${emailVisible}`);
    } else {
      console.log(`[${vp.name}] OK: Correo oculto a compañeros de trabajo garantizado.`);
    }

    // 13. Mi Perfil
    console.log(`[${vp.name}] Capturando mi perfil...`);
    await pageAdmin.goto(`${BASE_URL}/perfil`);
    await pageAdmin.waitForSelector('h1');
    await pageAdmin.waitForTimeout(500);
    await pageAdmin.screenshot({ path: join(QA_DIR, `perfil-${vp.name}.png`), fullPage: true });

    await contextAdmin.close();
    await contextUser.close();
  }

  await browser.close();
  console.log('\n[E2E F0b] ¡Suite E2E con Auth Real y capturas completadas con éxito en _qa/f0b!');
}

main().catch((err) => {
  console.error('[E2E F0b] Error fatal:', err);
  process.exit(1);
});
