"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Gauge, Pause, Play } from "lucide-react";
import styles from "./adjuntos.module.css";

export interface ReproductorAudioProps {
  src: string;
  nombre?: string;
  duracion?: number | null;
  propio?: boolean;
}

const BARRAS = 34;
const VELOCIDADES = [1, 1.5, 2];

function dosDigitos(n: number): string {
  return n.toFixed(0).padStart(2, "0");
}

function fmtSegundos(seg: number): string {
  if (!Number.isFinite(seg) || seg < 0) return "0:00";
  const total = Math.round(seg);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${dosDigitos(s)}`;
}

// Reproductor de audio con onda, duración y velocidad 1x / 1,5x / 2x.
export function ReproductorAudio({ src, nombre, duracion, propio = false }: ReproductorAudioProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cajaRef = useRef<HTMLDivElement | null>(null);
  const [sonando, setSonando] = useState(false);
  const [tiempo, setTiempo] = useState(0);
  const [total, setTotal] = useState(duracion ?? 0);
  const [velocidad, setVelocidad] = useState(1);
  const [peaks, setPeaks] = useState<number[] | null>(null);

  // La onda se calcula una sola vez, cuando el audio se ve en pantalla.
  useEffect(() => {
    let cancelado = false;
    const calcular = async () => {
      try {
        const res = await fetch(src, { credentials: "include" });
        if (!res.ok) return;
        const datos = await res.arrayBuffer();
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const contexto = new Ctx();
        const buffer = await contexto.decodeAudioData(datos.slice(0));
        const canal = buffer.getChannelData(0);
        const bloque = Math.floor(canal.length / BARRAS) || 1;
        const valores: number[] = [];
        for (let i = 0; i < BARRAS; i += 1) {
          let pico = 0;
          const inicio = i * bloque;
          const fin = Math.min(inicio + bloque, canal.length);
          for (let j = inicio; j < fin; j += 1) {
            const v = Math.abs(canal[j]);
            if (v > pico) pico = v;
          }
          valores.push(pico);
        }
        const maximo = Math.max(...valores, 0.01);
        if (!cancelado) {
          setPeaks(valores.map((v) => Math.max(0.12, v / maximo)));
          if (!duracion || duracion <= 0) setTotal(buffer.duration);
        }
        await contexto.close();
      } catch {
        // Sin onda: se dibujan barras parejas.
      }
    };

    const nodo = cajaRef.current;
    if (nodo && "IntersectionObserver" in window) {
      const observador = new IntersectionObserver(
        (entradas) => {
          if (entradas.some((e) => e.isIntersecting)) {
            observador.disconnect();
            void calcular();
          }
        },
        { rootMargin: "120px" },
      );
      observador.observe(nodo);
      return () => {
        cancelado = true;
        observador.disconnect();
      };
    }
    void calcular();
    return () => {
      cancelado = true;
    };
  }, [src, duracion]);

  const barras = useMemo(() => peaks ?? Array.from({ length: BARRAS }, (_, i) => 0.35 + ((i * 37) % 11) / 22), [peaks]);

  const alternar = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (sonando) {
      audio.pause();
      return;
    }
    try {
      audio.playbackRate = velocidad;
      await audio.play();
    } catch {
      // El navegador puede bloquear la reproducción: se queda en pausa.
    }
  };

  const cambiarVelocidad = () => {
    const siguiente = VELOCIDADES[(VELOCIDADES.indexOf(velocidad) + 1) % VELOCIDADES.length];
    setVelocidad(siguiente);
    if (audioRef.current) audioRef.current.playbackRate = siguiente;
  };

  const buscar = (evento: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !total) return;
    const rect = evento.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (evento.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * total;
    setTiempo(audio.currentTime);
  };

  const progreso = total > 0 ? Math.min(1, tiempo / total) : 0;

  return (
    <div className={`${styles.audio} ${propio ? styles.audioPropio : ""}`} ref={cajaRef}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setSonando(true)}
        onPause={() => setSonando(false)}
        onEnded={() => {
          setSonando(false);
          setTiempo(0);
        }}
        onTimeUpdate={(e) => setTiempo(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (!duracion || duracion <= 0) setTotal(e.currentTarget.duration);
        }}
      />
      <button
        type="button"
        className={styles.audioPlay}
        onClick={alternar}
        aria-label={sonando ? `Pausar audio ${nombre ?? ""}` : `Reproducir audio ${nombre ?? ""}`}
      >
        {sonando ? <Pause size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={2} />}
      </button>

      <div
        className={styles.onda}
        onClick={buscar}
        role="slider"
        aria-label="Avanzar o retroceder el audio"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(tiempo)}
        tabIndex={0}
        onKeyDown={(e) => {
          const audio = audioRef.current;
          if (!audio) return;
          if (e.key === "ArrowRight") audio.currentTime = Math.min(total, audio.currentTime + 5);
          if (e.key === "ArrowLeft") audio.currentTime = Math.max(0, audio.currentTime - 5);
        }}
      >
        {barras.map((alto, i) => (
          <span
            key={i}
            className={styles.ondaBarra}
            style={{
              height: `${Math.round(alto * 100)}%`,
              opacity: i / BARRAS <= progreso ? 1 : 0.35,
            }}
          />
        ))}
      </div>

      <span className={styles.audioTiempo} aria-hidden="true">
        {fmtSegundos(tiempo)} / {fmtSegundos(total)}
      </span>

      <button
        type="button"
        className={styles.audioVelocidad}
        onClick={cambiarVelocidad}
        aria-label={`Velocidad ${velocidad}x. Toca para cambiar`}
        title="Velocidad de reproducción"
      >
        <Gauge size={12} strokeWidth={1.75} aria-hidden="true" />
        {velocidad === 1 ? "1x" : `${String(velocidad).replace(".", ",")}x`}
      </button>
    </div>
  );
}
