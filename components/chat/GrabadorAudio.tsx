"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";
import styles from "./adjuntos.module.css";

export interface GrabadorAudioProps {
  onGrabado: (archivo: File, duracionSeg: number) => void;
  onError: (mensaje: string) => void;
  deshabilitado?: boolean;
}

function fmt(seg: number): string {
  const total = Math.floor(seg);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function mimeSoportado(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const opciones = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return opciones.find((m) => MediaRecorder.isTypeSupported(m));
}

// Grabadora: tocar el micrófono empieza, tocar el cuadrado envía, la cruz descarta.
export function GrabadorAudio({ onGrabado, onError, deshabilitado = false }: GrabadorAudioProps) {
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);

  const grabadorRef = useRef<MediaRecorder | null>(null);
  const trozosRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const temporizadorRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inicioRef = useRef<number>(0);
  const cancelarRef = useRef(false);

  const limpiar = () => {
    if (temporizadorRef.current) {
      clearInterval(temporizadorRef.current);
      temporizadorRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    grabadorRef.current = null;
    trozosRef.current = [];
    setGrabando(false);
    setSegundos(0);
  };

  useEffect(() => () => limpiar(), []);

  const empezar = async () => {
    if (grabando || deshabilitado) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError("Este navegador no permite grabar audio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = mimeSoportado();
      const grabador = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      trozosRef.current = [];
      grabador.ondataavailable = (e) => {
        if (e.data.size > 0) trozosRef.current.push(e.data);
      };
      grabador.onstop = () => {
        const duracion = Math.max(1, Math.round((Date.now() - inicioRef.current) / 1000));
        const tipo = grabador.mimeType || "audio/webm";
        const blob = new Blob(trozosRef.current, { type: tipo });
        const cancelado = cancelarRef.current;
        limpiar();
        cancelarRef.current = false;
        if (cancelado || blob.size === 0) return;
        const extension = tipo.includes("ogg") ? "ogg" : tipo.includes("mp4") ? "m4a" : "webm";
        const archivo = new File([blob], `audio-${Date.now()}.${extension}`, { type: tipo });
        onGrabado(archivo, duracion);
      };

      streamRef.current = stream;
      grabadorRef.current = grabador;
      inicioRef.current = Date.now();
      setSegundos(0);
      setGrabando(true);
      grabador.start(250);
      temporizadorRef.current = setInterval(() => {
        setSegundos(Math.round((Date.now() - inicioRef.current) / 1000));
      }, 500);
    } catch {
      onError("No pudimos usar el micrófono. Revisa el permiso del navegador.");
      limpiar();
    }
  };

  const detener = () => {
    if (!grabando) return;
    cancelarRef.current = false;
    grabadorRef.current?.stop();
  };

  const descartar = () => {
    cancelarRef.current = true;
    grabadorRef.current?.stop();
    limpiar();
  };

  if (!grabando) {
    return (
      <button
        type="button"
        className={styles.micBoton}
        onClick={empezar}
        disabled={deshabilitado}
        data-rc-compositor-boton
         aria-label="Grabar audio"
        title="Grabar un audio"
      >
        <Mic size={16} strokeWidth={1.9} />
      </button>
    );
  }

  return (
    <div className={styles.grabando} role="status" aria-live="polite">
      <span className={styles.grabandoPunto} aria-hidden="true" />
      <span className={styles.grabandoTiempo}>{fmt(segundos)}</span>
      <span className={styles.grabandoTexto}>Grabando…</span>
      <button type="button" className={styles.grabandoEnviar} onClick={detener} aria-label="Detener y enviar el audio">
        <Square size={12} strokeWidth={2.2} />
      </button>
      <button type="button" className={styles.grabandoCancelar} onClick={descartar} aria-label="Descartar la grabación">
        <Trash2 size={13} strokeWidth={1.9} />
      </button>
    </div>
  );
}
