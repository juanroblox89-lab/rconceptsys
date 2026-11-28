// lib/chat-utils.ts
import type { ChatAdjunto, ChatMensaje } from './types';

export interface MensajeAgrupado {
  id: number;
  autor_id: string;
  autor_nombre: string;
  autor_foto: string | null;
  autor_roles: { id: number; nombre: string; color: string }[];
  fecha_hora: string;
  fecha_separador?: string;
  lineas: {
    id: number;
    cuerpo: string;
    hora: string;
    editado_en?: string | null;
    es_ria?: boolean;
    adjuntos?: ChatAdjunto[];
    respuesta_a_id?: ChatMensaje["respuesta_a_id"];
    cita?: ChatMensaje["cita"];
    creado_en: string;
    enviando?: boolean;
    error?: boolean;
  }[];
  es_mio: boolean;
}

export function formatearHora(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function obtenerSeparadorDia(isoString: string): string {
  try {
    const d = new Date(isoString);
    const ahora = new Date();

    const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const inicioAyer = new Date(inicioHoy);
    inicioAyer.setDate(inicioAyer.getDate() - 1);

    const inicioMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (inicioMsg.getTime() === inicioHoy.getTime()) {
      return 'Hoy';
    }
    if (inicioMsg.getTime() === inicioAyer.getTime()) {
      return 'Ayer';
    }
    return d.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: d.getFullYear() !== ahora.getFullYear() ? 'numeric' : undefined,
    });
  } catch {
    return '';
  }
}

/**
 * Agrupa mensajes consecutivos del mismo autor enviados dentro de una ventana de tiempo (5 minutos)
 * y agrega separadores de día.
 */
export function agruparMensajes(mensajes: ChatMensaje[], miID: string): MensajeAgrupado[] {
  if (!mensajes || mensajes.length === 0) return [];

  // Los mensajes vienen cronológicamente ascendentes (más viejos primero a más nuevos al final)
  const grupos: MensajeAgrupado[] = [];
  let ultimoSeparador = '';

  for (let i = 0; i < mensajes.length; i++) {
    const msg = mensajes[i];
    const separador = obtenerSeparadorDia(msg.creado_en);
    const esNuevoDia = separador !== ultimoSeparador;
    if (esNuevoDia) {
      ultimoSeparador = separador;
    }

    const grupoAnterior = grupos.length > 0 ? grupos[grupos.length - 1] : null;
    const mismoAutor = grupoAnterior && grupoAnterior.autor_id === msg.autor_id;

    // Verificar si está dentro de 5 minutos del último mensaje del grupo
    let dentroDeVentana = false;
    if (mismoAutor && !esNuevoDia && grupoAnterior) {
      const tiempoPrevio = new Date(grupoAnterior.fecha_hora).getTime();
      const tiempoActual = new Date(msg.creado_en).getTime();
      if (Math.abs(tiempoActual - tiempoPrevio) < 5 * 60 * 1000) {
        dentroDeVentana = true;
      }
    }

    if (mismoAutor && dentroDeVentana && grupoAnterior && !esNuevoDia) {
      // Agregar como línea al grupo actual
      grupoAnterior.lineas.push({
        id: msg.id,
        cuerpo: msg.cuerpo,
        hora: formatearHora(msg.creado_en),
        editado_en: msg.editado_en ?? null,
        es_ria: msg.es_ria,
        adjuntos: msg.adjuntos,
        respuesta_a_id: msg.respuesta_a_id,
        cita: msg.cita,
        creado_en: msg.creado_en,
        enviando: msg.enviando,
        error: msg.error,
      });
      grupoAnterior.fecha_hora = msg.creado_en;
    } else {
      // Iniciar nuevo grupo
      grupos.push({
        id: msg.id,
        autor_id: msg.autor_id,
        autor_nombre: msg.autor?.nombre || 'Miembro',
        autor_foto: msg.autor?.foto_path || null,
        autor_roles: msg.autor?.roles || [],
        fecha_hora: msg.creado_en,
        fecha_separador: esNuevoDia ? separador : undefined,
        lineas: [
          {
            id: msg.id,
            cuerpo: msg.cuerpo,
            hora: formatearHora(msg.creado_en),
            editado_en: msg.editado_en ?? null,
            es_ria: msg.es_ria,
            adjuntos: msg.adjuntos,
        respuesta_a_id: msg.respuesta_a_id,
        cita: msg.cita,
        creado_en: msg.creado_en,
            enviando: msg.enviando,
            error: msg.error,
          },
        ],
        es_mio: msg.autor_id === miID,
      });
    }
  }

  return grupos;
}

export const AVISO_ARCHIVO_PURGADO = "Archivo eliminado tras 15 días para liberar espacio";

export function citaVisible(m: Pick<ChatMensaje, "respuesta_a_id" | "cita">) {
  if (!m.respuesta_a_id) return null;
  return m.cita ?? { autor: "Mensaje citado", extracto: "El mensaje original ya no está disponible." };
}

export function accionesConservacion(adjuntos: ChatAdjunto[] | undefined, yo: { id: string; es_admin: boolean } | null) {
  return (adjuntos ?? []).flatMap(a => {
    if (!yo || a.purgado_en || a.url_externa || !a.storage_path || !["audio", "imagen", "video"].includes(a.tipo)) return [];
    if (a.conservar && !yo.es_admin && a.autor_id !== yo.id) return [];
    return [{ id: a.id, nombre: a.nombre, conservar: !a.conservar,
      etiqueta: a.conservar ? "Quitar protección" : "Conservar / No purgar" }];
  });
}

export function formatoTiempoAudio(segundos: number) {
  const n = Number.isFinite(segundos) ? Math.max(0, Math.floor(segundos)) : 0;
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

export function escalaOnda(canal: Float32Array, barras: number) {
  const picos = Array.from({ length: barras }, (_, i) => {
    let pico = 0;
    for (let j = Math.floor(i * canal.length / barras); j < Math.floor((i + 1) * canal.length / barras); j++) {
      pico = Math.max(pico, Math.abs(canal[j]));
    }
    return pico;
  });
  const maximo = Math.max(.01, ...picos);
  return picos.map(p => Math.max(.13, p / maximo));
}
