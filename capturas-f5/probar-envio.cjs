/* eslint-disable */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const API='http://127.0.0.1:8311', BASE='http://localhost:3312';
async function login(e){const r=await fetch(API+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({correo:e,contrasena:'demo'})});return (await r.json()).access_token;}
(async()=>{
 const admin=await login('admin@rconcept.com');
 const bmodo = await fetch(API+'/api/chat?limite=5',{headers:{'X-Demo-User':admin}});
 const b=await chromium.launch({executablePath:'C:\\Users\\USUARIO\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe'});
 const ctx=await b.newContext({viewport:{width:375,height:812}});
 await ctx.addCookies([{name:'rc_access_token',value:admin,url:BASE}]);
 const p=await ctx.newPage();
 const errores=[]; p.on('pageerror',e=>errores.push(e.message));
 await p.goto(BASE+'/',{waitUntil:'networkidle',timeout:45000}); await p.waitForTimeout(1000);

 // 1. Adjuntar imagen por el menú +
 await p.getByRole('button',{name:'Adjuntar'}).click();
 await p.locator('input[type=file][accept*="image"]').setInputFiles('capturas-f5/_prueba.png');
 await p.waitForTimeout(2500);
 const chips = await p.locator('text=subiendo…').count();

 // 2. Escribir y enviar
 await p.getByLabel('Escribe al equipo').fill('Prueba de adjunto desde la interfaz');
 await p.getByRole('button',{name:'Enviar mensaje'}).click();
 await p.waitForTimeout(2500);
 const ultimo = await p.evaluate(async () => {
   const r = await fetch('/api/chat?limite=3', { credentials: 'include' });
   const d = await r.json();
   return d.map((m) => ({ id: m.id, cuerpo: m.cuerpo, adjuntos: (m.adjuntos||[]).length }));
 });

 // 3. Popover de carpeta de Drive
 await p.getByRole('button',{name:'Adjuntar'}).click();
 await p.getByRole('menuitem',{name:/Carpeta de Drive/}).click();
 await p.getByLabel('Enlace').fill('https://drive.google.com/drive/folders/1pruebaUI');
 await p.getByPlaceholder('Ej.: Tomas del lunes').fill('Carpeta de prueba');
 await p.getByRole('button',{name:'Compartir carpeta'}).click();
 await p.waitForTimeout(2000);
 await p.getByRole('button',{name:'Enviar mensaje'}).click();
 await p.waitForTimeout(2000);
 const conCarpeta = await p.evaluate(async () => {
   const r = await fetch('/api/chat?limite=2', { credentials: 'include' });
   const d = await r.json();
   return d.map((m) => ({ cuerpo: m.cuerpo, adjuntos: (m.adjuntos||[]).map(a=>a.tipo) }));
 });
 console.log('chips subiendo tras 2,5 s:', chips);
 console.log('ultimos:', JSON.stringify(ultimo));
 console.log('con carpeta:', JSON.stringify(conCarpeta));
 console.log('pageerrors:', errores.length ? errores.join(' | ') : 0);
 await p.screenshot({path:'capturas-f5/chat-envio-375.png', fullPage:true});
 await b.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
