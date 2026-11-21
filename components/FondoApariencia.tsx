"use client";
import { useEffect, useState } from "react";
import { aplicarApariencia, eventoApariencia, preferenciasApariencia, type Apariencia } from "@/lib/apariencia";

export function FondoApariencia(){
  const [video,setVideo]=useState<string>();
  useEffect(()=>{
    const desktop=matchMedia('(min-width: 768px) and (pointer: fine)');
    const reducido=matchMedia('(prefers-reduced-motion: reduce)');
    let actual:Apariencia|undefined;let activo=true;
    const sync=()=>{
      const archivo=actual?.video;
      setVideo(desktop.matches&&actual?.tema==='glass'&&actual.movimiento!=='activado'&&(!reducido.matches||actual.movimiento==='desactivado')&&/^[0-9a-f]{32}\.(mp4|webm)$/.test(archivo??'')?archivo:undefined);
    };
    const cambio=(e:Event)=>{actual=(e as CustomEvent<Apariencia>).detail;sync();};
    window.addEventListener(eventoApariencia,cambio);
    desktop.addEventListener('change',sync);reducido.addEventListener('change',sync);
    preferenciasApariencia().then(v=>{if(activo)aplicarApariencia(v,true);}).catch(()=>{});
    return()=>{activo=false;window.removeEventListener(eventoApariencia,cambio);desktop.removeEventListener('change',sync);reducido.removeEventListener('change',sync);};
  },[]);
  return video?<video className="rc-fondo-video" key={video} src={`/api/yo/apariencia/fondo/${video}`} autoPlay muted loop playsInline aria-hidden="true"/>:null;
}
