import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { access } from 'node:fs/promises';
const base='http://localhost:3312';
const r=await fetch('http://127.0.0.1:8311/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({correo:'camarografo@rconcept.com',contrasena:'demo'})});
assert.equal(r.status,200);
const {access_token}=await r.json();
const local=chromium.executablePath();
const browser=await chromium.launch({executablePath:await access(local).then(()=>local,()=>`${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`)});
try {
  for(const ancho of [375,1280]) for(const chat of ['privado','equipo']) {
    const ctx=await browser.newContext({viewport:{width:ancho,height:ancho===375?812:800}});
    await ctx.addCookies([{name:'rc_access_token',value:access_token,url:base}]);
    const p=await ctx.newPage();
    const errores=[];p.on('pageerror',e=>errores.push(e.message));
    await p.goto(`${base}/${chat==='privado'?'ria':''}`);
    if(chat==='privado'){
      const campo=p.getByRole('textbox',{name:'Mensaje para RIA'});await campo.fill('¿Dónde están mis trabajos?');await p.getByRole('button',{name:'Enviar a RIA'}).click();
    }else{
      await p.getByText('Listo para la producción de hoy.', { exact: true }).waitFor();
      const campo=p.getByRole('textbox', { name: 'Escribe al equipo' });await campo.fill('@RIA ¿Dónde están mis trabajos?');await p.getByRole('button', { name: 'Enviar mensaje' }).click();
    }
    const indicador=p.getByText('RIA está escribiendo…',{exact:true});await indicador.waitFor();
    const progreso=indicador.locator('..');
    const captura=async n=>{assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);await p.screenshot({path:`capturas-f6/f3-ria-${chat}-${ancho}-${n}.png`});};
    await progreso.getByText('Para empezar, abre Tareas.',{exact:true}).waitFor();await captura('1');
    await progreso.getByText(/Allí puedes ver tus trabajos/).waitFor();assert.ok(await indicador.isVisible());await captura('2');
    await indicador.waitFor({state:'hidden'});
    assert.deepEqual(errores,[]);
    console.log(`${chat} ${ancho}: dos fragmentos visibles con indicador antes del fin, sin desborde`);
    await ctx.close();
  }
}finally{await browser.close()}
