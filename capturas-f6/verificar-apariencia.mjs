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
  for(const ancho of [375,1280]) {
    const ctx=await browser.newContext({viewport:{width:ancho,height:ancho===375?812:850},colorScheme:'light',hasTouch:ancho===375});
    await ctx.addCookies([{name:'rc_access_token',value:access_token,url:base}]);
    const p=await ctx.newPage();
    const errores=[];p.on('pageerror',e=>errores.push(e.message));
    const captura=async n=>{assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);await p.screenshot({path:`capturas-f6/f4-${n}-${ancho}.png`,animations:'disabled'});};
    await p.goto(`${base}/personalizacion`);
    const guardar=p.getByRole('button',{name:'Guardar apariencia'});await guardar.waitFor();
    await p.getByRole('button',{name:'Claro',exact:true}).click();await guardar.click();await p.getByText('Apariencia guardada.').waitFor();
    await captura('claro');
    await p.getByText('Avanzado',{exact:true}).click();await captura('avanzado-claro');
    await p.getByRole('button',{name:'Oscuro',exact:true}).click();await guardar.click();await p.getByText('Apariencia guardada.').waitFor();
    await captura('avanzado-oscuro');
    await p.reload();await p.getByRole('button',{name:'Oscuro',exact:true}).waitFor();
    assert.equal(await p.locator('html').getAttribute('data-rc-modo'),'oscuro');
    await captura('oscuro');
    await p.getByRole('button',{name:'Glass',exact:true}).click();await guardar.click();await p.getByText('Apariencia guardada.').waitFor();
    await captura('glass');
    const mp4=[];p.on('request',r=>{if(/\/apariencia\/fondo\/.*\.mp4/.test(r.url()))mp4.push(r.url());});
    await p.getByLabel('Subir fondo Glass').setInputFiles('capturas-f6/fondo-qa.mp4');
    await p.getByText('Fondo guardado.').waitFor({timeout:9000}).catch(async e=>{throw new Error(`${ancho}: ${await p.getByRole('alert').allTextContents()}`, {cause:e});});
    await p.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--rc-personal-imagen').includes('.jpg'));
    if(ancho===1280){await p.locator('video.rc-fondo-video').waitFor();await p.waitForFunction(()=>document.querySelector('video.rc-fondo-video')?.readyState>=2);}else{assert.equal(await p.locator('video.rc-fondo-video').count(),0);assert.equal(mp4.length,0);}
    await captura('glass-video');
    await p.getByRole('button',{name:'Restablecer'}).click();await guardar.click();await p.getByText('Apariencia guardada.').waitFor();
    await p.goto(`${base}/`);
    if(ancho===375)await p.getByRole('button',{name:'Abrir menú'}).click();
    await p.getByRole('button',{name:'Mi perfil',exact:true}).click();
    const menu=p.getByRole('menu',{name:'Opciones de mi perfil'});
    assert.deepEqual(await menu.getByRole('menuitem').allTextContents(),['Personalización','Perfil','Configuración','Ayuda','Cerrar sesión']);
    await captura('menu');
    await menu.getByRole('menuitem',{name:'Ayuda'}).click();
    await p.getByText('Tengo una duda sobre cómo usar rconceptsys',{exact:true}).last().waitFor();
    assert.deepEqual(errores,[]);
    console.log(`${ancho}: modo, Glass, persistencia al recargar, restablecer, orden del menú y Ayuda`);
    await ctx.close();
  }
}finally{await browser.close()}
