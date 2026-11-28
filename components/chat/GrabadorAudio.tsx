"use client";

import { Mic } from "lucide-react";
import { BarraGrabacion, useGrabacionAudio } from "@/components/ui/BarraGrabacion";
import styles from "./adjuntos.module.css";

export interface GrabadorAudioProps {
  onGrabado: (archivo: File, duracionSeg: number) => void;
  onError: (mensaje: string) => void;
  deshabilitado?: boolean;
  onGrabando?: (grabando: boolean) => void;
}

export function GrabadorAudio({ onGrabado, onError, deshabilitado = false, onGrabando }: GrabadorAudioProps) {
  const grabacion = useGrabacionAudio((archivo, ms) => onGrabado(archivo, Math.max(1, Math.round(ms / 1000))), onError, onGrabando, 20 * 1024 * 1024);
  if (grabacion.activa) return <BarraGrabacion grabacion={grabacion.activa} detener={grabacion.detener} cancelar={grabacion.cancelar} compacta />;
  return <button type="button" className={styles.micBoton} onClick={() => void grabacion.empezar()}
    disabled={deshabilitado || grabacion.ocupado || !grabacion.soporta} data-rc-compositor-boton
    aria-label="Grabar audio" title="Grabar un audio">
    <Mic size={16} strokeWidth={1.9} />
  </button>;
}
