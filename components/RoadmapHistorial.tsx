"use client";

import {
  ArrowDown,
  ArrowRight,
  Ban,
  CheckCircle2,
  ClipboardList,
  FileText,
  FolderOpen,
  MessageCircle,
  RotateCcw,
  Send,
  XCircle,
} from "lucide-react";
import type { MetodoEntrega, Tarea, TareaHistorialItem, TipoElementoEntrega } from "@/lib/types";
import { EnlaceDrive } from "@/components/ui/EnlaceDrive";
import { AdjuntosRechazoVista, type AdjuntoRechazoItem } from "@/components/AdjuntosAsignacion";
import { ESTADOS_TRABAJO, fechaTrabajo } from "./FilaTrabajo";
import styles from "./FlujoTrabajo.module.css";

type TonoPaso = "inicio" | "entrega" | "retirada" | "devuelto" | "aprobado" | "cancelado";

interface PasoRoadmap {
  id: string;
  orden: number;
  titulo: string;
  subtitulo?: string;
  tono: TonoPaso;
  fecha?: string | null;
  actor?: string | null;
  nota?: string | null;
  motivo?: string | null;
  metodoEntrega?: MetodoEntrega | null;
  enlaceMedios?: string | null;
  entregaNombre?: string | null;
  entregaTipo?: TipoElementoEntrega | null;
  driveAdjuntos?: TareaHistorialItem["drive_adjuntos"];
  adjuntos?: AdjuntoRechazoItem[];
  valorAprobado?: number | null;
  minutosAprobados?: number | null;
}

function iconoPaso(tono: TonoPaso) {
  switch (tono) {
    case "entrega":
      return Send;
    case "retirada":
      return RotateCcw;
    case "devuelto":
      return XCircle;
    case "aprobado":
      return CheckCircle2;
    case "cancelado":
      return Ban;
    default:
      return ClipboardList;
  }
}

export function construirPasosRoadmap(tarea: Tarea): PasoRoadmap[] {
  const pasos: PasoRoadmap[] = [
    {
      id: `asignado-${tarea.id}`,
      orden: 1,
      titulo: "Asignado",
      tono: "inicio",
      fecha: tarea.creada_en,
      actor: tarea.creador?.nombre,
    },
  ];

  const historial = tarea.historial ?? [];
  if (historial.length > 0) {
    let huboEntrega = false;
    const aprobacionVigente = tarea.estado === "aceptada" ? historial.findLast(h => h.evento === "entrega_aceptada") : undefined;
    for (const h of historial) {
      const orden = pasos.length + 1;
      if (h.evento === "entrega_enviada") {
        const titulo = huboEntrega ? "Nueva entrega" : "Entrega registrada";
        huboEntrega = true;
        pasos.push({
          id: `hist-${h.id}`,
          orden,
          titulo,
          subtitulo:
            h.metodo_entrega === "whatsapp"
              ? "Por WhatsApp"
              : h.enlace_medios
                ? "Por Drive"
                : h.detalle || undefined,
          tono: "entrega",
          fecha: h.creado_en,
          actor: h.actor_nombre,
          nota: h.nota,
          metodoEntrega: h.metodo_entrega,
          enlaceMedios: h.enlace_medios,
          entregaNombre: h.entrega_nombre,
          entregaTipo: h.entrega_tipo,
        });
      } else if (h.evento === "entrega_retirada") {
        pasos.push({
          id: `hist-${h.id}`,
          orden,
          titulo: "Entrega retirada",
          tono: "retirada",
          fecha: h.creado_en,
          actor: h.actor_nombre,
          nota: h.nota,
        });
      } else if (h.evento === "entrega_rechazada") {
        pasos.push({
          id: `hist-${h.id}`,
          orden,
          titulo: "Devuelto",
          tono: "devuelto",
          fecha: h.creado_en,
          actor: h.actor_nombre,
          motivo: h.motivo,
          driveAdjuntos: h.drive_adjuntos,
          adjuntos: h.adjuntos,
        });
      } else if (h.evento === "entrega_aceptada") {
        pasos.push({
          id: `hist-${h.id}`,
          orden,
          titulo: "Aprobado",
          tono: "aprobado",
          fecha: h.creado_en,
          actor: h.actor_nombre,
          valorAprobado: h === aprobacionVigente ? (tarea.precio_congelado ?? null) : null,
          minutosAprobados:
            tarea.tipo?.unidad === "minuto"
              ? (h.cantidad ?? (h === aprobacionVigente ? tarea.cantidad_aceptada : null) ?? null)
              : null,
        });
      } else if (h.evento === "pedido_de_nuevo") {
        pasos.push({
          id: `hist-${h.id}`, orden, titulo: "Se pidió rehacer", tono: "retirada",
          fecha: h.creado_en, actor: h.actor_nombre, motivo: h.motivo,
          // Si no hay entrega previa registrada (trabajos antiguos), mostrar su copia histórica aquí.
          ...(!huboEntrega && { nota: h.nota, metodoEntrega: h.metodo_entrega, enlaceMedios: h.enlace_medios, entregaNombre: h.entrega_nombre, entregaTipo: h.entrega_tipo }),
        });
      } else {
        pasos.push({
          id: `hist-${h.id}`,
          orden,
          titulo: h.detalle || h.evento,
          tono: "inicio",
          fecha: h.creado_en,
          actor: h.actor_nombre,
          nota: h.nota,
          motivo: h.motivo,
        });
      }
    }
    if (tarea.estado === "cancelada") {
      pasos.push({
        id: `cancelado-${tarea.id}`,
        orden: pasos.length + 1,
        titulo: "Cancelado",
        tono: "cancelado",
        fecha: tarea.resuelta_en,
      });
    }
    return pasos;
  }

  // Respaldo para trabajos sin filas en tarea_historial
  const tieneEntrega = Boolean(
    tarea.hecha_en ||
      tarea.nota_persona ||
      tarea.metodo_entrega ||
      tarea.enlace_medios,
  );
  if (tieneEntrega) {
    pasos.push({
      id: `entrega-${tarea.id}`,
      orden: pasos.length + 1,
      titulo: "Entrega registrada",
      tono: "entrega",
      fecha: tarea.hecha_en,
      actor: tarea.asignado?.nombre,
      nota: tarea.nota_persona,
      metodoEntrega: tarea.metodo_entrega,
      enlaceMedios: tarea.enlace_medios,
      entregaNombre: tarea.entrega_nombre,
      entregaTipo: tarea.entrega_tipo,
    });
  }

  if (tarea.resuelta_en || tarea.estado === "aceptada" || tarea.estado === "rechazada" || tarea.estado === "cancelada") {
    const tono: TonoPaso =
      tarea.estado === "aceptada"
        ? "aprobado"
        : tarea.estado === "rechazada"
          ? "devuelto"
          : tarea.estado === "cancelada"
            ? "cancelado"
            : "inicio";
    const titulo =
      tarea.estado === "aceptada"
        ? "Aprobado"
        : tarea.estado === "rechazada"
          ? "Devuelto"
          : tarea.estado === "cancelada"
            ? "Cancelado"
            : ESTADOS_TRABAJO[tarea.estado];
    pasos.push({
      id: `resolucion-${tarea.id}`,
      orden: pasos.length + 1,
      titulo,
      tono,
      fecha: tarea.resuelta_en,
      motivo: tarea.estado === "rechazada" ? tarea.motivo_rechazo : null,
      valorAprobado: tarea.estado === "aceptada" ? tarea.precio_congelado : null,
      minutosAprobados:
        tarea.estado === "aceptada" && tarea.tipo?.unidad === "minuto"
          ? tarea.cantidad_aceptada
          : null,
    });
  } else if (tarea.motivo_rechazo) {
    pasos.push({
      id: `rechazo-${tarea.id}`,
      orden: pasos.length + 1,
      titulo: "Devuelto",
      tono: "devuelto",
      motivo: tarea.motivo_rechazo,
    });
  }

  return pasos;
}

export function RoadmapHistorial({ tarea }: { tarea: Tarea }) {
  const pasos = construirPasosRoadmap(tarea);
  const cols = pasos.length <= 1 ? "1" : pasos.length === 2 ? "2" : "3";

  return (
    <ol className={styles.roadmapLista} data-cols={cols} aria-label="Flujo de historial y entregas">
      {pasos.map((paso, idx) => {
        const esUltimo = idx === pasos.length - 1;
        const Icono = iconoPaso(paso.tono);
        const meta = [paso.fecha ? fechaTrabajo(paso.fecha) : "", paso.actor ?? ""]
          .filter(Boolean)
          .join(" · ");

        return (
          <li key={paso.id} className={styles.roadmapItem}>
            <div className={styles.roadmapPaso} data-tono={paso.tono}>
              <div className={styles.roadmapCabecera}>
                <span className={styles.roadmapNodo} aria-hidden="true">
                  <Icono size={14} strokeWidth={2} />
                </span>
                <div className={styles.roadmapTitulos}>
                  <div className={styles.roadmapTituloFila}>
                    <strong>{paso.titulo}</strong>
                    <span className={styles.roadmapOrden}>#{paso.orden}</span>
                  </div>
                  {meta && <span className={styles.roadmapMeta}>{meta}</span>}
                </div>
              </div>

              {paso.nota && (
                <p className={styles.roadmapCajaNota}>
                  <strong>Nota: </strong>
                  {paso.nota}
                </p>
              )}

              {paso.motivo && (
                <p className={styles.roadmapCajaMotivo}>
                  <strong>Motivo de devolución: </strong>
                  {paso.motivo}
                </p>
              )}

              {paso.metodoEntrega === "whatsapp" ? (
                <span className={styles.entregaWhatsappChip}>
                  <MessageCircle size={13} aria-hidden="true" />
                  Entregado por WhatsApp
                </span>
              ) : paso.enlaceMedios ? (
                <div className={styles.roadmapEntregaDrive}>
                  {paso.entregaNombre && (
                    <span className={styles.historialDriveNombre}>
                      {paso.entregaTipo === "carpeta" ? (
                        <FolderOpen size={14} aria-hidden="true" />
                      ) : (
                        <FileText size={14} aria-hidden="true" />
                      )}
                      <span>{paso.entregaNombre}</span>
                    </span>
                  )}
                  <EnlaceDrive enlace={paso.enlaceMedios} />
                </div>
              ) : null}

              {paso.driveAdjuntos && paso.driveAdjuntos.length > 0 && (
                <ul className={styles.historialDriveLista} aria-label="Elementos de Drive del rechazo">
                  {paso.driveAdjuntos.map((d) => (
                    <li key={d.id || d.url} className={styles.historialDriveItem}>
                      <span className={styles.historialDriveNombre}>
                        {d.tipo === "carpeta" ? (
                          <FolderOpen size={14} aria-hidden="true" />
                        ) : (
                          <FileText size={14} aria-hidden="true" />
                        )}
                        <span>{d.nombre}</span>
                      </span>
                      <EnlaceDrive enlace={d.url} />
                    </li>
                  ))}
                </ul>
              )}

              {paso.adjuntos && paso.adjuntos.length > 0 && (
                <AdjuntosRechazoVista tarea={tarea.id} items={paso.adjuntos} compacto={true} />
              )}

              {paso.valorAprobado != null && (
                <p className={styles.roadmapValor}>
                  <strong>Valor aprobado: </strong>
                  ${paso.valorAprobado.toLocaleString("es-CO")}
                  {paso.minutosAprobados ? ` (${paso.minutosAprobados} min)` : ""}
                </p>
              )}
            </div>

            {!esUltimo && (
              <div className={styles.roadmapConector} aria-hidden="true">
                <span className={`${styles.roadmapFlecha} ${styles.roadmapFlechaDer}`}>
                  <ArrowRight size={14} strokeWidth={2.2} />
                </span>
                <span className={`${styles.roadmapFlecha} ${styles.roadmapFlechaAbajo}`}>
                  <ArrowDown size={14} strokeWidth={2.2} />
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
