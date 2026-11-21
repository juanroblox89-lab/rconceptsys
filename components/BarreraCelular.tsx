"use client";
import { useEffect, useState } from 'react';
import { Boton } from '@/components/ui/Boton';
import { celularPropio, FormularioCelular } from './Celular';
import styles from './Celular.module.css';
export function BarreraCelular({children}:{children:React.ReactNode}) {
  const [estado,setEstado]=useState<'cargando'|'falta'|'ok'|'error'>('cargando');
  const [intento,setIntento]=useState(0);
  useEffect(()=>{let activo=true;celularPropio().then(c=>{if(activo)setEstado(c?'ok':'falta');}).catch(()=>{if(activo)setEstado('error');});return()=>{activo=false;};},[intento]);
  if(estado==='ok')return children;
  return <div className={styles.barrera}>
    {estado==='falta'?<FormularioCelular obligatorio celularInicial="" alGuardar={()=>setEstado('ok')}/>
      :estado==='error'?<div className={styles.estadoBarrera}><p role="alert">No pudimos comprobar tu perfil.</p><Boton variante="secundario" onClick={()=>{setEstado('cargando');setIntento(a=>a+1);}}>Reintentar</Boton></div>
      :<div className={styles.estadoBarrera}><p role="status">Comprobando tu perfil…</p></div>}
  </div>;
}
