"use client";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { aparienciaInicial, aplicarApariencia, preferenciasApariencia, primerFotograma, type Apariencia } from "@/lib/apariencia";
import { Boton } from "@/components/ui/Boton";
import styles from "./personalizacion.module.css";

const modos=[{id:'sistema',nombre:'Sistema',Icon:Monitor},{id:'claro',nombre:'Claro',Icon:Sun},{id:'oscuro',nombre:'Oscuro',Icon:Moon}] as const;
const temas=[{id:'rconcept',nombre:'RConcept'},{id:'rconcept-dark',nombre:'RConcept Dark'},{id:'glass',nombre:'Glass'}] as const;
const colores=[{id:'fondo',nombre:'Fondo',base:'#eceef3'},{id:'texto',nombre:'Texto',base:'#1f2430'},{id:'acento',nombre:'Acento',base:'#2f7fe0'}] as const;

export default function Personalizacion(){
  const [v,setV]=useState(aparienciaInicial);
  const [listo,setListo]=useState(false);
  const [ocupado,setOcupado]=useState(false);
  const [estado,setEstado]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{let activo=true;preferenciasApariencia().then(p=>{if(activo){setV(p);setListo(true);}}).catch(e=>{if(activo)setError(e.message);});return()=>{activo=false;};},[]);
  useEffect(()=>()=>{try{const p=localStorage.getItem('rc-apariencia');aplicarApariencia(p?JSON.parse(p):aparienciaInicial);}catch{}},[]);
  const cambiar=(parcial:Partial<Apariencia>)=>{const p={...v,...parcial};setV(p);aplicarApariencia(p);setEstado('');setError('');};
  const tarea=async(f:()=>Promise<void>)=>{setOcupado(true);setEstado('');setError('');try{await f();}catch(e){setError(e instanceof Error?e.message:'No pudimos guardar la apariencia.');}finally{setOcupado(false);}};
  const guardar=()=>tarea(async()=>{const p=await preferenciasApariencia('PUT',v);setV(p);aplicarApariencia(p,true);setEstado('Apariencia guardada.');});
  const subir=(f:File)=>tarea(async()=>{
    if(f.size>2500000)throw new Error('El fondo no debe superar 2,5 MB.');
    const datos=new FormData();datos.append('fondo',f);
    if(f.type.startsWith('video/'))datos.append('fotograma',await primerFotograma(f),'fotograma.jpg');
    const p=await preferenciasApariencia('POST',datos);
    aplicarApariencia(p,true);cambiar({imagen:p.imagen,video:p.video});setEstado('Fondo guardado.');
  });
  return <div className={styles.pagina}>
    <header><h1>Personalización</h1><p>Elige cómo se ve RConcept en tu cuenta.</p></header>
    <fieldset disabled={!listo||ocupado} className={styles.contenido}>
      <section className={styles.panel} data-rc-panel>
        <h2>Apariencia</h2><p>El modo controla la luz; el tema define las superficies.</p>
        <div className={styles.opciones} aria-label="Modo de color">{modos.map(({id,nombre,Icon})=><button type="button" aria-pressed={v.modo===id} onClick={()=>cambiar({modo:id})} key={id}><span className={`${styles.muestra} ${styles[id]}`}><Icon size={20} strokeWidth={1.65}/></span>{nombre}</button>)}</div>
        <h3>Tema</h3>
        <div className={styles.opciones} aria-label="Tema">{temas.map(({id,nombre})=><button type="button" aria-pressed={v.tema===id} onClick={()=>cambiar({tema:id,modo:id==='rconcept-dark'?'oscuro':v.modo})} key={id}><span className={`${styles.muestra} ${styles[id]}`}><i/><i/></span>{nombre}</button>)}</div>
      </section>
      <section className={styles.panel} data-rc-panel>
        <h2>Colores</h2><p>Deja el código vacío para usar el color del tema.</p>
        <div className={styles.colores}>{colores.map(({id,nombre,base})=><label key={id}><span>{nombre}</span><span className={styles.campoColor}><input type="color" aria-label={`Selector de ${nombre.toLowerCase()}`} value={/^#[0-9a-f]{6}$/i.test(v[id]??'')?v[id]:base} onChange={e=>cambiar({[id]:e.currentTarget.value})}/><input aria-label={`Código hex de ${nombre.toLowerCase()}`} maxLength={7} placeholder={base} value={v[id]??''} onChange={e=>cambiar({[id]:e.currentTarget.value})} /></span></label>)}</div>
      </section>
      {v.tema==='glass'&&<section className={styles.panel} data-rc-panel>
        <h2>Fondo Glass</h2><p>Sube una imagen o un video de hasta 2,5 MB. En celular se muestra solo el primer fotograma.</p>
        <input aria-label="Subir fondo Glass" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" onChange={e=>{const f=e.currentTarget.files?.[0];if(f)void subir(f);e.currentTarget.value='';}}/>
        {(v.imagen||v.video)&&<Boton type="button" onClick={()=>cambiar({imagen:undefined,video:undefined})}>Quitar fondo</Boton>}
        <label className={styles.fila}>Oscurecido <output>{v.oscurecido}%</output><input type="range" min={0} max={85} value={v.oscurecido} onChange={e=>cambiar({oscurecido:e.currentTarget.valueAsNumber})}/></label>
      </section>}
      <details className={styles.panel} data-rc-panel>
        <summary>Avanzado</summary>
        <div className={styles.avanzado}>
          <label>Tamaño de la interfaz (px)<input type="number" min={12} max={28} value={v.interfaz??''} placeholder="Predeterminado" onChange={e=>cambiar({interfaz:e.currentTarget.valueAsNumber||undefined})}/></label>
          <label>Tamaño del contenido (px)<input type="number" min={12} max={28} value={v.contenido??''} placeholder="Predeterminado" onChange={e=>cambiar({contenido:e.currentTarget.valueAsNumber||undefined})}/></label>
          <label>Reducir movimiento<select value={v.movimiento} onChange={e=>cambiar({movimiento:e.currentTarget.value as Apariencia['movimiento']})}><option value="sistema">Sistema</option><option value="activado">Activado</option><option value="desactivado">Desactivado</option></select></label>
          <label className={styles.check}><input type="checkbox" checked={v.contraste} onChange={e=>cambiar({contraste:e.currentTarget.checked})}/> Aumentar contraste</label>
        </div>
      </details>
      <div className={styles.acciones}><Boton type="button" onClick={()=>{setV(aparienciaInicial);aplicarApariencia(aparienciaInicial);setEstado('');setError('');}}>Restablecer</Boton><Boton type="button" onClick={()=>void guardar()}>Guardar apariencia</Boton></div>
    </fieldset>
    {estado&&<p role="status">{estado}</p>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}
  </div>;
}
