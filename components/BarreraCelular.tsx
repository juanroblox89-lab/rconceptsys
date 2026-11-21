"use client";
import { useEffect, useState } from 'react';
import { celularPropio, FormularioCelular } from './Celular';
import styles from './Celular.module.css';
export function BarreraCelular({children}:{children:React.ReactNode}) {
  const [estado,setEstado]=useState<'cargando'|'falta'|'ok'|'error'>('cargando');
  const [intento,setIntento]=useState(0);
  useEffect(()=>{let activo=true;celularPropio().then(c=>{if(activo)setEstado(c?'ok':'falta');}).catch(()=>{if(activo)setEstado('error');});return()=>{activo=false;};},[intento]);
  if(estado==='ok')return children;
  return <div className={styles.barrera}>
    {estado==='falta'?<FormularioCelular obligatorio celularInicial="" alGuardar={()=>setEstado('ok')}/>:estado==='error'?<><p role="alert">No pudimos comprobar tu perfil.</p><button onClick={()=>{setEstado('cargando');setIntento(a=>a+1);}}>Reintentar</button></>:<p role="status">Comprobando tu perfil…</p>}
  </div>;
}