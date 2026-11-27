import type { ChatMensaje, RespuestaRIAPublica, SolicitudRIAPublica } from './types';

export interface MensajeRIA { id:number; pregunta_id?:number; rol:'user'|'assistant'; cuerpo:string; creado_en:string; editado_en?:string|null; borrado_en?:string|null }
export const preguntasAyudaRIA = (admin: boolean) => [
  '¿Cómo entrego un trabajo?',
  admin ? '¿Cómo veo los cortes del equipo?' : '¿Dónde veo mi corte?',
  '¿Cómo cambio el tema?',
  '¿Cómo adjunto archivos?',
  '¿Cómo configuro mis avisos?',
];

export const LIMITE_COMANDO_RIA_PUBLICO = 2000;

export const comandosEquipo = [
  { nombre: '/ria', descripcion: 'Hazle una pregunta a RIA en el chat del equipo.', ejemplo: '/ria ¿Cómo entrego un trabajo?' },
  { nombre: '/help', descripcion: 'Consulta los comandos sin publicar en el grupo.', ejemplo: '/help' },
] as const;

function normalizarNombreComando(nombre: string) {
  return nombre.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function opcionesComandosEquipo(texto: string) {
  const prefijo = normalizarNombreComando(texto.trimStart());
  return /^\/[a-z]*$/.test(prefijo) ? comandosEquipo.filter(c => c.nombre.startsWith(prefijo)) : [];
}

export function esComandoAyuda(texto: string) {
  return normalizarNombreComando(texto.trim()) === '/help';
}

// null: mensaje normal; '': falta la pregunta; otro valor: comando a enviar.
export function leerComandoRIAPublico(texto: string): string | null {
  const coincidencia = /^(\S+)(?:\s+([\s\S]+))?$/.exec(texto.trim());
  if (!coincidencia || normalizarNombreComando(coincidencia[1]) !== '/ria') return null;
  return coincidencia[2] ? `/ria ${coincidencia[2]}` : '';
}

export function esComposicionIME(evento: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>): boolean {
  return evento.isComposing || evento.keyCode === 229;
}

const CLAVE_SOLICITUD = 'rc-chat-ria-pendiente';

export function recuperarSolicitudRIAPublica(storage: Storage | null, usuario: string): SolicitudRIAPublica | null {
  try {
    const valor = storage?.getItem(CLAVE_SOLICITUD);
    if (!valor) return null;
    const dato = JSON.parse(valor);
    if (dato?.usuario === usuario && typeof dato.solicitud_id === 'string' &&
        /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(dato.solicitud_id) &&
        typeof dato.comando === 'string' && dato.comando !== '' &&
        [...dato.comando].length <= LIMITE_COMANDO_RIA_PUBLICO && leerComandoRIAPublico(dato.comando) === dato.comando) {
      return { solicitud_id: dato.solicitud_id, comando: dato.comando };
    }
  } catch {
    // El navegador puede bloquear sessionStorage, o el dato no ser válido.
  }
  guardarSolicitudRIAPublica(storage, usuario, null);
  return null;
}

export function guardarSolicitudRIAPublica(storage: Storage | null, usuario: string, solicitud: SolicitudRIAPublica | null) {
  try {
    if (solicitud) {
      const { solicitud_id, comando } = solicitud;
      storage?.setItem(CLAVE_SOLICITUD, JSON.stringify({ usuario, solicitud_id, comando }));
    } else {
      storage?.removeItem(CLAVE_SOLICITUD);
    }
  } catch {
    // Si el almacenamiento no está disponible, el reintento sigue en memoria.
  }
}

export function combinarMensajesChat(prioritarios: ChatMensaje[], adicionales: Iterable<ChatMensaje>): ChatMensaje[] {
  const porId = new Map<number, ChatMensaje>();
  for (const mensaje of adicionales) porId.set(mensaje.id, mensaje);
  for (const mensaje of prioritarios) porId.set(mensaje.id, mensaje);
  return [...porId.values()].sort((a, b) => a.id - b.id);
}

const errorConexion = 'La respuesta se interrumpió. Inténtalo de nuevo.';
const errorPublico: Record<number, string> = {
  400: 'Revisa la pregunta. Usa /ria seguido de lo que quieres preguntar.',
  401: 'Tu sesión expiró. Vuelve a entrar para reintentar.',
  403: 'Tu cuenta no tiene permiso para consultar a RIA en el chat del equipo.',
  404: 'La consulta ya no está disponible en el chat del equipo.',
  409: 'Esta consulta está en curso o no se puede recuperar todavía. Espera un momento.',
  429: 'Se alcanzó el límite de consultas. Espera antes de reintentar.',
  503: 'RIA no está disponible ahora. Puedes reintentar más tarde.',
};

function esMensajeChat(valor: unknown): valor is ChatMensaje {
  if (!valor || typeof valor !== 'object') return false;
  const m = valor as Partial<ChatMensaje>;
  return typeof m.id === 'number' && Number.isSafeInteger(m.id) && m.id > 0 &&
    typeof m.autor_id === 'string' && typeof m.cuerpo === 'string' && typeof m.creado_en === 'string';
}

export async function transmitirRIAPublica(
  solicitud: SolicitudRIAPublica,
  usuario: string,
  alPublicarConsulta: (consulta: ChatMensaje) => void,
  signal: AbortSignal,
): Promise<RespuestaRIAPublica> {
  const respuesta = await fetch('/api/chat/ria', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(solicitud),
    signal,
  }).catch(() => { throw new Error(errorConexion); });
  if (!respuesta.ok) {
    await respuesta.body?.cancel().catch(() => {});
    throw new Error(errorPublico[respuesta.status] ?? 'No se pudo consultar a RIA. Inténtalo de nuevo.');
  }
  if (!respuesta.body || !respuesta.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) {
    throw new Error(errorConexion);
  }
  const lector = respuesta.body.getReader();
  const decodificador = new TextDecoder();
  const separador = /\r?\n\r?\n/;
  let buffer = '';
  let idConsulta: number | undefined;
  try {
    for (;;) {
      const { value, done } = await lector.read();
      if (done) throw new Error(errorConexion);
      buffer += decodificador.decode(value, { stream: true });
      for (let corte = separador.exec(buffer); corte; corte = separador.exec(buffer)) {
        const lineas = buffer.slice(0, corte.index).split(/\r?\n/);
        buffer = buffer.slice(corte.index + corte[0].length);
        const evento = lineas.find((linea) => linea.startsWith('event:'))?.slice(6).trim();
        // inicio, comentarios y cualquier delta público se ignoran incluso si no traen JSON.
        if (evento !== 'consulta' && evento !== 'fin' && evento !== 'error') continue;
        const texto = lineas.filter((linea) => linea.startsWith('data:')).map((linea) => linea.slice(5).replace(/^ /, '')).join('\n');
        let dato: unknown;
        try {
          dato = JSON.parse(texto);
        } catch {
          throw new Error(errorConexion);
        }
        if (evento === 'error') {
          const mensaje = (dato as { mensaje?: unknown } | null)?.mensaje;
          throw new Error(typeof mensaje === 'string' && mensaje.trim() ? mensaje : errorConexion);
        }
        if (!esMensajeChat(dato)) throw new Error(errorConexion);
        if (evento === 'consulta') {
          if (dato.autor_id !== usuario || dato.es_ria || (idConsulta !== undefined && idConsulta !== dato.id)) throw new Error(errorConexion);
          if (idConsulta === undefined) alPublicarConsulta(dato);
          idConsulta = dato.id;
        } else {
          if (idConsulta === undefined || dato.id === idConsulta || dato.es_ria !== true || dato.autor_id !== 'ria' || dato.autor != null) {
            throw new Error(errorConexion);
          }
          return { ...dato, es_ria: true, autor_id: 'ria', autor: null };
        }
      }
    }
  } finally {
    void lector.cancel().catch(() => {});
    lector.releaseLock();
  }
}

export async function transmitirRIA<T>(datos:{pregunta:string}, delta:(texto:string)=>void, signal:AbortSignal):Promise<T> {
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
    throw new Error(errorConexion);
  } finally { await lector.cancel().catch(()=>{}); lector.releaseLock(); }
}
