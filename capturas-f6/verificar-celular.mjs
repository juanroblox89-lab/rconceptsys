import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { access } from 'node:fs/promises';
const base='http://localhost:3312';
const api='http://127.0.0.1:8311/api';
const local=chromium.executablePath();
const browser=await chromium.launch({executablePath:await access(local).then(()=>local,()=>`${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`)});
try {
 for(const ancho of [375,1280]) for(const modo of ['claro','oscuro']) {
  const r=await fetch(`${api}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({correo:ancho===375?'camarografo@rconcept.com':'admin@rconcept.com',contrasena:'demo'})});
  assert.equal(r.status,200);const {access_token}=await r.json();
  const ctx=await browser.newContext({viewport:{width:ancho,height:ancho===375?812:850},colorScheme:modo==='oscuro'?'dark':'light'});
  const p=await ctx.newPage();
  const captura=async nombre=>{assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);await p.screenshot({path:`capturas-f6/f5-${nombre}-${ancho}-${modo}.png`,animations:'disabled'});};
  await p.goto(`${base}/registro`);assert.equal(await p.getByLabel('País e indicativo').inputValue(),'+57');await captura('registro');
  await ctx.addCookies([{name:'rc_access_token',value:access_token,url:base}]);
  await p.goto(`${base}/perfil`);
  const falta=p.getByRole('heading',{name:'Completa tu perfil'});
  await p.getByLabel('Número de celular').waitFor();
  if(await falta.isVisible()){
   await captura('primera-entrada');await p.getByLabel('Número de celular').fill('6015550100');await p.getByRole('button',{name:'Guardar y continuar'}).click();await p.getByRole('alert').getByText(/indicativo seleccionado/).waitFor();
   await p.getByLabel('Número de celular').fill('3005550100');await p.getByRole('button',{name:'Guardar y continuar'}).click();
  }
  await p.getByRole('heading',{name:'Mi perfil',exact:true}).waitFor();
  await p.getByLabel('Número de celular').scrollIntoViewIfNeeded();await captura('perfil');
  await p.goto(`${base}/configuracion`);
  await p.getByLabel('País e indicativo').selectOption('+34');await p.getByLabel('Número de celular').fill('612345678');await p.getByRole('button',{name:'Guardar celular'}).click();await p.getByText('Celular guardado.',{exact:true}).waitFor();await captura('configuracion');
  const guardado=await ctx.request.get(`${base}/api/yo/celular`);assert.equal((await guardado.json()).celular,'+34612345678');
  const privado=await ctx.request.get(`${base}/api/equipo`);assert.ok(!(await privado.text()).includes('+34612345678'));
  await ctx.close();console.log(`${ancho} ${modo}: registro, perfil, configuración, formato y privacidad`);
 }
}finally{await browser.close();}
