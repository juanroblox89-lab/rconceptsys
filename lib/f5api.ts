/**
 * Cliente F5 — Asistente IA + Métricas. Habla SIEMPRE con el backend real
 * vía el proxy (/api/backend/*). Sin fallback local: si el backend falla,
 * el error se propaga a la UI. Sin IA el resto funciona igual (§5.31).
 */

import { req } from "./api";

export interface AsistenteConversacion {
  id: string;
  titulo: string;
  created_at: string;
  updated_at: string;
}

export interface AsistenteMensaje {
  id: string;
  rol: "user" | "assistant";
  contenido: string;
  created_at: string;
}

export interface ChatRespuesta {
  conversacion: AsistenteConversacion;
  respuesta: AsistenteMensaje;
  no_disponible: boolean;
}

export function chatAsistente(b: {
  conversacion_id?: string | null;
  mensaje: string;
  contexto?: { pieza_id?: string | null; cliente_id?: string | null };
}): Promise<ChatRespuesta> {
  return req<ChatRespuesta>("/asistente/chat", {
    method: "POST",
    body: JSON.stringify(b),
  });
}

export function getConversaciones(): Promise<AsistenteConversacion[]> {
  return req<{ conversaciones: AsistenteConversacion[] }>(
    "/asistente/conversaciones",
  ).then((d) => d.conversaciones);
}

export function getConversacion(id: string): Promise<{
  conversacion: AsistenteConversacion;
  mensajes: AsistenteMensaje[];
}> {
  return req<{
    conversacion: AsistenteConversacion;
    mensajes: AsistenteMensaje[];
  }>(`/asistente/conversaciones/${id}`);
}

/* ---------- métricas (admin/dueño) ---------- */

export interface Metricas {
  piezas_publicadas_semana: { semana: string; piezas: number }[];
  piezas_por_estado: Record<string, number>;
  tareas_vencidas: number;
  carga_por_persona: {
    usuario_id: string;
    usuario_nombre: string;
    oficio: string;
    abiertas: number;
  }[];
  cobros_mes: {
    periodo: string;
    aprobado: number;
    por_confirmar: number;
    reclamado: number;
    ultimo_corte: { periodo: string; estado: string } | null;
  };
  ventas: {
    leads_por_etapa: Record<string, number>;
    conversion_mes: number;
    ganados_mes: number;
    perdidos_mes: number;
    visitas_por_vendedor: {
      usuario_id: string;
      usuario_nombre: string;
      visitas: number;
    }[];
    comisiones_mes: number;
  };
}

export function getMetricas(): Promise<Metricas> {
  return req<Metricas>("/metricas");
}
