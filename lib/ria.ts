export interface MensajeRIA { id:number; rol:'user'|'assistant'; cuerpo:string; creado_en:string }
export const preguntasAyudaRIA = (admin: boolean) => [
  "¿Cómo entrego un trabajo?",
  admin ? "¿Cómo veo los cortes del equipo?" : "¿Dónde veo mi corte?",
  "¿Cómo cambio el tema?",
  "¿Cómo adjunto archivos?",
  "¿Cómo configuro mis avisos?",
];
export const mencionaRIA = (texto:string) => /(^|[^\p{L}\p{N}_])@ria([^\p{L}\p{N}_]|$)/iu.test(texto);
export async function transmitirRIA<T>(datos:{pregunta?:string;mensaje_id?:number}, delta:(texto:string)=>void, signal:AbortSignal):Promise<T> {
  const r=await fetch('/api/ria',{method:'POST',headers:{'Content-Type':'application/json',Accept:'text/event-stream'},body:JSON.stringify(datos),signal});
  if(!r.ok){const j=await r.json().catch(()=>null);throw new Error(j?.error?.mensaje ?? 'RIA no está disponible ahora.');}
  if(!r.body) throw new Error('No se pudo abrir la conversación en vivo.');
  const lector=r.body.getReader();const d=new TextDecoder();let buffer='';
  try {
    for(;;){
      const {value,done}=await lector.read();if(done) break;buffer+=d.decode(value,{stream:true});
      for(let i=buffer.indexOf('\n\n');i>=0;i=buffer.indexOf('\n\n')){
        const frame=buffer.slice(0,i);buffer=buffer.slice(i+2);
        const evento=frame.match(/^event: (.+)$/m)?.[1];const texto=frame.match(/^data: (.+)$/m)?.[1];if(!texto)continue;
        const dato=JSON.parse(texto);
        if(evento==='delta')delta(dato.texto);
        if(evento==='error')throw new Error(dato.mensaje);
        if(evento==='fin')return dato as T;
      }
    }
    throw new Error('La respuesta se interrumpió. Inténtalo de nuevo.');
  } finally { await lector.cancel().catch(()=>{}); lector.releaseLock(); }
}
