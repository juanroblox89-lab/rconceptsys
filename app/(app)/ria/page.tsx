"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { PREGUNTA_AYUDA, transmitirRIA, type MensajeRIA } from "@/lib/ria";
import { Boton } from "@/components/ui/Boton";
import styles from "./ria.module.css";

export default function RIAPage() {
  const [historial,setHistorial]=useState<MensajeRIA[]>([]);
  const [listo,setListo]=useState(false);
  const [texto,setTexto]=useState("");
  const [pregunta,setPregunta]=useState("");
  const [respuesta,setRespuesta]=useState("");
  const [error,setError]=useState("");
  const control=useRef<AbortController|null>(null);
  const zona=useRef<HTMLDivElement>(null);
  const hizoAyuda=useRef(false);
  const enviar=useCallback(async (valor:string)=>{
    const q=valor.trim();if(!q||control.current)return;
    const c=new AbortController(); control.current=c;
    setPregunta(q);setRespuesta("");setError("");setTexto("");
    try{
      const r=await transmitirRIA<MensajeRIA>({pregunta:q},(s)=>setRespuesta((t)=>t+s),c.signal);
      setHistorial((h)=>[...h,{id:-r.id,rol:"user",cuerpo:q,creado_en:r.creado_en},r]);
    }catch(e){ if(!c.signal.aborted){setTexto(q);setError(e instanceof Error?e.message:"RIA no está disponible.");} }
    finally{if(control.current===c){control.current=null;setPregunta("");setRespuesta("");}}
  },[]);
  useEffect(()=>{
    let activo=true;
    fetch('/api/ria',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error();return await r.json() as MensajeRIA[];}).then(h=>{
      if(!activo)return;
      setHistorial(h);setListo(true);
      const q=new URLSearchParams(location.search);
      if(q.get('ayuda')==='1'&&!hizoAyuda.current){hizoAyuda.current=true; history.replaceState(history.state,'','/ria');void enviar(PREGUNTA_AYUDA);}
    }).catch(()=>{if(activo){setError('No pudimos cargar tu conversación.');setListo(true);}});
    return()=>{activo=false;control.current?.abort();};
  },[enviar]);
  useEffect(()=>{
    const id=new URLSearchParams(location.search).get('mensaje');
    const ref=id?document.getElementById(`ria-${id}`):null;
    if(ref) ref.scrollIntoView({block:'center'}); else if(zona.current)zona.current.scrollTop=zona.current.scrollHeight;
  },[historial,pregunta,respuesta]);
  return <section className={styles.chat}>
    <header className={styles.cabecera}><span className={styles.avatar}><Sparkles size={20} strokeWidth={1.6}/></span><div><h1>RIA</h1><p>Conversación privada contigo</p></div></header>
    <div className={styles.mensajes} ref={zona} aria-label="Conversación con RIA">
      {!listo && <p role="status">Cargando conversación…</p>}
      {listo&&!historial.length&&!pregunta&&<p>Pregúntame cómo funciona la app o sobre tus trabajos.</p>}
      {historial.map(m=><article id={`ria-${m.id}`} className={`${styles.burbuja} ${m.rol==='user'?styles.propia:''}`} key={m.id}><strong>{m.rol==='user'?'Tú':'RIA'}</strong><p>{m.cuerpo}</p></article>)}
      {pregunta&&<><article className={`${styles.burbuja} ${styles.propia}`}><strong>Tú</strong><p>{pregunta}</p></article><article className={styles.burbuja}><strong>RIA</strong>{respuesta&&<p>{respuesta}</p>}<span role="status" className={styles.escribiendo}>RIA está escribiendo…</span></article></>}
      {error&&<p role="alert" className={styles.error}>{error}</p>}
    </div>
    <form className={styles.form} onSubmit={e=>{e.preventDefault();void enviar(texto);}}>
      <textarea aria-label="Mensaje para RIA" placeholder="Escribe a RIA…" rows={1} maxLength={2000} value={texto} onChange={e=>setTexto(e.currentTarget.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void enviar(texto);}}}/>
      <Boton type="submit" aria-label="Enviar a RIA" disabled={!listo||!texto.trim()||!!pregunta}><Send size={19} strokeWidth={1.6}/></Boton>
    </form>
  </section>;
}
