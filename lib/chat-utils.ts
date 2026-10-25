// lib/chat-utils.ts
import type { ChatMensaje } from './types';

export interface MensajeAgrupado {
  id: number;
  autor_id: string;
  autor_nombre: string;
  autor_foto: string | null;
  autor_roles: { id: number; nombre: string; color: string }[];
  fecha_hora: string;
  fecha_separador?: string;
  lineas: { id: number; cuerpo: string; hora: string; enviando?: boolean; error?: boolean }[];
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
        enviando: msg.enviando,
        error: msg.error,
      });
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
