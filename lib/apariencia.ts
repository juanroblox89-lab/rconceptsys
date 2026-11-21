export type Apariencia = {
  modo:'sistema'|'claro'|'oscuro'; tema:'rconcept'|'rconcept-dark'|'glass';
  fondo?:string; texto?:string; acento?:string; interfaz?:number; contenido?:number;
  movimiento:'sistema'|'activado'|'desactivado'; contraste:boolean; oscurecido:number;
  imagen?:string; video?:string;
};
export const aparienciaInicial:Apariencia={modo:'sistema',tema:'rconcept',movimiento:'sistema',contraste:false,oscurecido:32};
export const eventoApariencia='rc-apariencia';
export function aplicarApariencia(v:Apariencia, guardar=false) {
  const root=document.documentElement;
  root.dataset.rcModo=v.modo;root.dataset.rcTema=v.tema;root.dataset.rcMovimiento=v.movimiento;
  root.dataset.rcContraste=String(v.contraste===true);
  for(const [nombre,valor] of Object.entries({fondo:v.fondo,texto:v.texto,acento:v.acento})) {
    if(/^#[\da-f]{6}$/i.test(valor??''))root.style.setProperty(`--rc-personal-${nombre}`,valor!);
    else root.style.removeProperty(`--rc-personal-${nombre}`);
  }
  for(const [nombre,valor] of Object.entries({interfaz:v.interfaz,contenido:v.contenido})) {
    if(Number.isInteger(valor)&&valor!>=12&&valor!<=28)root.style.setProperty(`--rc-personal-${nombre}`,`${valor}px`);
    else root.style.removeProperty(`--rc-personal-${nombre}`);
  }
  const img=v.tema==='glass'&&/^[0-9a-f]{32}\.(jpg|png|webp)$/.test(v.imagen??'')?`url('/api/yo/apariencia/fondo/${v.imagen}')`:null;
  if(img)root.style.setProperty('--rc-personal-imagen',img);else root.style.removeProperty('--rc-personal-imagen');
  root.style.setProperty('--rc-personal-oscurecido',`${Math.min(85,Math.max(0,v.oscurecido||0))}%`);
  if(guardar===true){try{localStorage.setItem('rc-apariencia',JSON.stringify(v));}catch{}}
  window.dispatchEvent(new CustomEvent('rc-apariencia',{detail:v}));
}
// La misma función corre como script síncrono en <head> antes del primer paint.
export const scriptApariencia=`try{const v=JSON.parse(localStorage.getItem('rc-apariencia'));if(v)(${aplicarApariencia.toString()})(v)}catch{}`;
export async function preferenciasApariencia(metodo='GET',datos?:Apariencia|FormData):Promise<Apariencia>{
  const multipart=datos instanceof FormData;
  const r=await fetch('/api/yo/apariencia'+(multipart?'/fondo':''),{method:metodo,cache:'no-store',headers:multipart?undefined:{'Content-Type':'application/json'},body:datos&&(multipart?datos:JSON.stringify(datos))});
  const j=await r.json().catch(()=>null);if(!r.ok)throw new Error(j?.error?.mensaje??'No se pudo guardar la apariencia.');return j;
}
export async function primerFotograma(f:File):Promise<Blob>{
  const video=document.createElement('video'); const u=URL.createObjectURL(f);
  video.muted=true;video.playsInline=true;video.preload='auto';
  try{
    await new Promise<void>((ok,no)=>{
      const id=setTimeout(()=>no(new Error('No pudimos leer el video.')),6000);
      video.onloadeddata=()=>{clearTimeout(id);ok();};video.onerror=()=>{clearTimeout(id);no(new Error('El navegador no admite este video.'));};video.src=u;
    });
    const c=document.createElement('canvas');const escala=Math.min(1,1000/video.videoWidth);
    c.width=Math.round(video.videoWidth*escala);c.height=Math.round(video.videoHeight*escala);
    const cx=c.getContext('2d');if(!cx)throw new Error('No pudimos extraer el primer fotograma.');cx.drawImage(video,0,0,c.width,c.height);
    return await new Promise<Blob>((ok,no)=>c.toBlob(b=>b?ok(b):no(new Error('No pudimos extraer el primer fotograma.')),'image/jpeg',.78));
  }finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(u);}
}
