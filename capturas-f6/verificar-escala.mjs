import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { access } from 'node:fs/promises';
const base=process.env.QA_WEB??'http://localhost:3312';
const r=await fetch('http://127.0.0.1:8311/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({correo:'admin@rconcept.com',contrasena:'demo'})});
assert.equal(r.status,200); const {access_token}=await r.json();
await fetch('http://127.0.0.1:8311/api/yo/celular',{method:'PUT',headers:{Authorization:`Bearer ${access_token}`,'Content-Type':'application/json'},body:JSON.stringify({indicativo:'+57',numero:'3005550100'})});
const exe=chromium.executablePath();const b=await chromium.launch({executablePath:await access(exe).then(()=>exe,()=>`${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`)});
try{
 for(const ancho of [375,1280,1920]) for(const modo of ancho===1920?['claro']:['claro','oscuro']){
  const c=await b.newContext({viewport:{width:ancho,height:ancho===375?812:900},colorScheme:modo==='claro'?'light':'dark',reducedMotion:modo==='oscuro'?'reduce':'no-preference'});await c.addCookies([{name:'rc_access_token',value:access_token,url:base}]);const p=await c.newPage();
  const captura=async n=>{assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);await p.screenshot({path:`capturas-f6/f6-${n}-${ancho}-${modo}.png`,animations:'disabled'});};
  await p.goto(base);await p.getByText('Listo para la producción de hoy.',{exact:true}).waitFor();
  assert.equal(await p.getByText('Listo para la producción de hoy.',{exact:true}).evaluate(e=>getComputedStyle(e).fontSize),'16px');
  if(modo==='oscuro')assert.equal(await p.locator('[data-rc-entrada]').evaluate(e=>getComputedStyle(e).animationName),'none');
  if(ancho===1920){assert.equal(await p.locator('[class*="sidebarWrap"]').evaluate(e=>e.getBoundingClientRect().width),290);assert.equal(await p.locator('#barra-equipo').evaluate(e=>e.getBoundingClientRect().width),330);}
  await captura('chat');
  if(ancho===375){await p.getByRole('button',{name:'Ver resumen del equipo'}).click();await captura('equipo');await p.keyboard.press('Escape');await p.getByRole('button',{name:'Abrir menú'}).click();await captura('barra-abierta');}
  else {await p.getByRole('button',{name:'Cerrar barra'}).click();await p.getByRole('button',{name:'Abrir barra'}).waitFor();await captura('barra-colapsada');}
  await c.close();console.log(`${ancho} ${modo}: escala, shell y desplazamiento sin desborde`);
 }
}finally{await b.close();}
