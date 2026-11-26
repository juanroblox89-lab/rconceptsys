"use client";
import { Selector } from "@/components/ui/Selector";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Boton } from "@/components/ui/Boton";
import { Logo } from "@/components/Logo";
import { useCambiosSinGuardar } from "@/components/CambiosSinGuardar";
import styles from "./Celular.module.css";

export const paisesCelular=[['+57','Colombia',10],['+1','EE. UU. y Canadá',10],['+52','México',10],['+34','España',9],['+54','Argentina',11],['+56','Chile',9],['+51','Perú',9],['+593','Ecuador',9],['+58','Venezuela',10],['+55','Brasil',11],['+507','Panamá',8],['+506','Costa Rica',8]] as const;
export type DatosCelular={indicativo:string;numero:string};
export const inicialCelular:DatosCelular={indicativo:'+57',numero:''};
export function CampoCelular({valor,cambiar}:{valor:DatosCelular;cambiar:(v:DatosCelular)=>void}){
 const id=useId();const largo=paisesCelular.find(p=>p[0]===valor.indicativo)?.[2];
 return <div className={styles.campos}>
   <div className={styles.campo}>
     <label className={styles.etiqueta} htmlFor={`${id}-pais`}>País</label>
     <Selector id={`${id}-pais`} etiqueta="País" valor={valor.indicativo} onCambio={indicativo=>cambiar({...valor,indicativo})} opciones={paisesCelular.map(([valor,nombre])=>({valor,etiqueta:`${nombre} (${valor})`}))} />
   </div>
   <div className={styles.campo}>
     <label className={styles.etiqueta} htmlFor={`${id}-numero`}>Número de celular</label>
     <span className="rc-input-contenedor"><input id={`${id}-numero`} required type="tel" autoComplete="tel-national" inputMode="tel" maxLength={20} placeholder={largo?`${largo} dígitos`:undefined} value={valor.numero} onChange={e=>cambiar({...valor,numero:e.currentTarget.value})}/></span>
   </div>
 </div>;
}
export async function celularPropio(datos?:DatosCelular):Promise<string>{
 const r=await fetch('/api/yo/celular',{method:datos?'PUT':'GET',cache:'no-store',headers:datos?{'Content-Type':'application/json'}:undefined,body:datos&&JSON.stringify(datos)});
 const j=await r.json().catch(()=>null);if(!r.ok)throw new Error(j?.error?.mensaje??'No pudimos consultar el celular.');return j.celular;
}
function separar(celular:string){const i=paisesCelular.find(([c])=>celular.startsWith(c));return i?{indicativo:i[0],numero:celular.slice(i[0].length)}:inicialCelular;}
export function FormularioCelular({obligatorio=false,alGuardar,celularInicial}:{obligatorio?:boolean;alGuardar?:()=>void;celularInicial?:string}){
 const [valor,setValor]=useState(()=>separar(celularInicial??''));
 const [guardado,setGuardado]=useState(()=>separar(celularInicial??''));
 const [listo,setListo]=useState(celularInicial!==undefined);const [ocupado,setOcupado]=useState(false);const [estado,setEstado]=useState('');const [error,setError]=useState('');
 useCambiosSinGuardar(listo && !obligatorio && (valor.indicativo !== guardado.indicativo || valor.numero !== guardado.numero));
 useEffect(()=>{if(celularInicial!==undefined)return;let activo=true;celularPropio().then(c=>{if(activo){const sep=separar(c);setValor(sep);setGuardado(sep);setListo(true);}}).catch(e=>{if(activo)setError(e.message);});return()=>{activo=false;};},[celularInicial]);
 async function guardar(e:FormEvent){e.preventDefault();setOcupado(true);setEstado('');setError('');try{const c=await celularPropio(valor);const sep=separar(c);setValor(sep);setGuardado(sep);setEstado('Celular guardado.');alGuardar?.();}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.');}finally{setOcupado(false);}}
 return <form data-rc-panel={obligatorio ? undefined : true} className={obligatorio?styles.tarjeta:styles.form} onSubmit={guardar}>
   {obligatorio?<div className={styles.encabezado}><Logo size={20}/><h1 className={styles.titulo}>Completa tu perfil</h1><p className={styles.subtitulo}>Solo falta tu número de celular para entrar.</p></div>
     :<><h2>Celular</h2><p>Tu número de celular solo está visible en tu cuenta.</p></>}
   {error&&<div role="alert" className={styles.error}>{error}</div>}
   <fieldset disabled={!listo||ocupado}><CampoCelular valor={valor} cambiar={setValor}/></fieldset>
   <Boton type="submit" variante="guardar" disabled={!listo} cargando={ocupado} envoltorioClassName={obligatorio?styles.botonAncho:undefined}>{obligatorio?'Guardar y continuar':'Guardar celular'}</Boton>
   {estado&&<p role="status" className={styles.ok}>{estado}</p>}
 </form>;
}
