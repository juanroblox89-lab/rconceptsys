"use client";

import { EnlaceExterno } from "@/components/ui/EnlaceExterno";
import { errorEnlaceDrive } from "@/components/ui/EnlaceDrive";
import { useEffect, useState } from "react";
import { Download, FileText, FolderOpen, X, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { ChatAdjunto } from "@/lib/types";
import { ReproductorAudio } from "./ReproductorAudio";
import styles from "./adjuntos.module.css";

export interface AdjuntoVistaProps {
  adjunto: ChatAdjunto;
  propio?: boolean;
}

// Tamaño legible: 820 B, 45,2 kB, 12,4 MB.
export function fmtPeso(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(".", ",")} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function urlDe(adjunto: ChatAdjunto): string {
  if (adjunto.tipo === "drive" && adjunto.url_externa) return adjunto.url_externa;
  return api.urlAdjunto(adjunto.id);
}

const ETIQUETA_TIPO: Record<string, string> = {
  imagen: "Imagen",
  video: "Video",
  audio: "Audio",
  archivo: "Archivo",
  drive: "Carpeta de Drive",
};

export function AdjuntoVista({ adjunto, propio = false }: AdjuntoVistaProps) {
  const [zoom, setZoom] = useState(false);
  const url = urlDe(adjunto);

  useEffect(() => {
    if (!zoom) return;
    const escapar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
    };
    window.addEventListener("keydown", escapar);
    return () => window.removeEventListener("keydown", escapar);
  }, [zoom]);

  if (adjunto.tipo === "imagen") {
    return (
      <div className={styles.imagenCaja}>
        <button type="button" className={styles.imagenBoton} onClick={() => setZoom(true)} aria-label={`Abrir ${adjunto.nombre} en grande`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={adjunto.nombre} className={styles.imagen} loading="lazy" />
        </button>
        {zoom && (
          <div className={styles.zoomFondo} onClick={() => setZoom(false)} role="dialog" aria-modal="true" aria-label={adjunto.nombre}>
            <button type="button" className={styles.zoomCerrar} aria-label="Cerrar imagen" onClick={() => setZoom(false)}>
              <X size={18} strokeWidth={2} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={adjunto.nombre} className={styles.zoomImagen} onClick={(e) => e.stopPropagation()} />
            <a href={url} download={adjunto.nombre} className={styles.zoomDescarga} onClick={(e) => e.stopPropagation()}>
              <Download size={14} strokeWidth={1.9} aria-hidden="true" />
              Descargar
            </a>
          </div>
        )}
      </div>
    );
  }

  if (adjunto.tipo === "video") {
    return (
      <div className={styles.videoCaja}>
        <video src={url} controls preload="metadata" className={styles.video} aria-label={adjunto.nombre} />
        <p className={styles.videoNombre}>
          {adjunto.nombre} · {fmtPeso(adjunto.tamano)}
        </p>
      </div>
    );
  }

  if (adjunto.tipo === "audio") {
    return (
      <div className={styles.audioCaja}>
        <ReproductorAudio src={url} nombre={adjunto.nombre} duracion={adjunto.duracion_seg} propio={propio} />
      </div>
    );
  }

  if (adjunto.tipo === "drive") {
    const enlaceValido =
      Boolean(adjunto.url_externa) &&
      errorEnlaceDrive(url) === null &&
      /^https:\/\/(drive|docs|drive\.usercontent)\.google\.com\//i.test(url);
    return (
      <div className={`${styles.tarjeta} ${styles.tarjetaDrive}`}>
        <span className={styles.tarjetaIcono}>
          <FolderOpen size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className={styles.tarjetaTexto}>
          <strong className={styles.tarjetaNombre} title={adjunto.nombre}>{adjunto.nombre}</strong>
          <em className={styles.tarjetaMeta}>Carpeta de Drive</em>
        </span>
        {enlaceValido && (
          <EnlaceExterno
            href={url}
            className={`rc-btn rc-btn--secundario rc-btn--sm ${styles.tarjetaBoton}`}
            title={`Abrir ${adjunto.nombre} en Drive`}
          >
            <span>Abrir carpeta</span>
            <ExternalLink size={13} strokeWidth={1.9} aria-hidden="true" />
          </EnlaceExterno>
        )}
      </div>
    );
  }

  return (
    <a href={url} download={adjunto.nombre} className={styles.tarjeta} title={`Descargar ${adjunto.nombre}`}>
      <span className={styles.tarjetaIcono}>
        <FileText size={16} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className={styles.tarjetaTexto}>
        <strong className={styles.tarjetaNombre}>{adjunto.nombre}</strong>
        <em className={styles.tarjetaMeta}>
          {ETIQUETA_TIPO[adjunto.tipo] ?? "Archivo"} · {fmtPeso(adjunto.tamano)}
        </em>
      </span>
      <Download size={14} strokeWidth={1.9} aria-hidden="true" className={styles.tarjetaAccion} />
    </a>
  );
}
