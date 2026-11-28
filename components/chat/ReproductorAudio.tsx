"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Mic, Pause, Play } from "lucide-react";
import { escalaOnda, formatoTiempoAudio } from "@/lib/chat-utils";
import styles from "./adjuntos.module.css";

const BARRAS = 30;
const VELOCIDADES = [1, 1.5, 2];
const BASE = Array.from({ length: BARRAS }, (_, i) => .27 + ((i * 37) % 13) / 25);
let audioEnCurso: HTMLAudioElement | null = null;

export function ReproductorAudio({ src, nombre, duracion, propio = false }: {
  src: string; nombre?: string; duracion?: number | null; propio?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const cajaRef = useRef<HTMLDivElement>(null);
  const duracionReal = useRef(false);
  const [sonando, setSonando] = useState(false);
  const [tiempo, setTiempo] = useState(0);
  const [total, setTotal] = useState(duracion ?? 0);
  const [velocidad, setVelocidad] = useState(1);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const control = new AbortController();
    const audio = audioRef.current;
    let observador: IntersectionObserver | undefined;
    const calcular = async () => {
      try {
        const Ctx = window.OfflineAudioContext ?? (window as Window & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
        if (!Ctx) return;
        const res = await fetch(src, { credentials: "same-origin", signal: control.signal });
        if (!res.ok) return;
        const datos = await res.arrayBuffer();
        if (control.signal.aborted) return;
        const buffer = await new Ctx(1, 1, 44100).decodeAudioData(datos);
        if (!control.signal.aborted) {
          setPeaks(escalaOnda(buffer.getChannelData(0), BARRAS));
          if (!duracionReal.current) setTotal(buffer.duration);
        }
      } catch { /* Si no se puede decodificar, el elemento Audio conserva su reproducción nativa. */ }
    };
    if (cajaRef.current && "IntersectionObserver" in window) {
      observador = new IntersectionObserver(entradas => {
        if (!entradas.some(e => e.isIntersecting)) return;
        observador?.disconnect();
        void calcular();
      }, { rootMargin: "80px" });
      observador.observe(cajaRef.current);
    } else void calcular();
    return () => {
      control.abort();
      observador?.disconnect();
      if (audio && audioEnCurso === audio) { audio.pause(); audioEnCurso = null; }
    };
  }, [src]);

  function tomarDuracion(audio: HTMLAudioElement) {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      duracionReal.current = true;
      setTotal(audio.duration);
    }
  }
  async function alternar() {
    const audio = audioRef.current;
    if (!audio) return;
    if (sonando) { audio.pause(); return; }
    try { audio.playbackRate = velocidad; await audio.play(); } catch { setError(true); }
  }
  function buscar(segundos: number) {
    const audio = audioRef.current;
    if (!audio || !total || error) return;
    const destino = Math.min(total, Math.max(0, segundos));
    audio.currentTime = destino;
    setTiempo(destino);
  }
  function buscarPorPuntero(e: PointerEvent<HTMLInputElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    buscar((e.clientX - r.left) / r.width * total);
  }
  const valor = Math.min(tiempo, total);
  const progreso = total > 0 ? valor / total : 0;

  return (
    <div className={`${styles.audio} ${propio ? styles.audioPropio : ""}`} ref={cajaRef} data-rc-reproductor-chat>
      <audio
        ref={audioRef} src={src} preload="metadata"
        onPlay={e => {
          const audio = e.currentTarget;
          if (audioEnCurso && audioEnCurso !== audio) audioEnCurso.pause();
          audioEnCurso = audio; setSonando(true); setError(false);
        }}
        onPause={() => setSonando(false)}
        onEnded={e => { setSonando(false); e.currentTarget.currentTime = 0; setTiempo(0); }}
        onError={() => setError(true)}
        onTimeUpdate={e => setTiempo(e.currentTarget.currentTime)}
        onDurationChange={e => tomarDuracion(e.currentTarget)}
        onLoadedMetadata={e => tomarDuracion(e.currentTarget)}
      />
      <button type="button" className={styles.audioPlay} onClick={() => void alternar()}
        aria-label={`${sonando ? "Pausar" : "Reproducir"} audio${nombre ? ` ${nombre}` : ""}`}>
        {sonando ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
      </button>
      <div className={styles.ondaCaja}>
        <span className={styles.onda} aria-hidden="true">{(peaks ?? BASE).map((alto, i) => (
          <i key={i} className={styles.ondaBarra} data-avance={i / BARRAS < progreso || undefined} style={{ height: `${Math.round(alto * 100)}%` }} />
        ))}</span>
        <input type="range" min={0} max={total || 1} step={0.01} value={valor} disabled={!total || error}
          aria-label="Posición del audio" aria-valuetext={`${formatoTiempoAudio(valor)} de ${formatoTiempoAudio(total)}`}
          onPointerDown={e => {
            if (!e.isPrimary || e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.focus({ preventScroll: true });
            e.currentTarget.setPointerCapture(e.pointerId);
            buscarPorPuntero(e);
          }}
          onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) buscarPorPuntero(e); }}
          onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) buscarPorPuntero(e); }}
          onChange={e => buscar(Number(e.currentTarget.value))} />
      </div>
      <span className={styles.audioMic} title="Nota de voz"><Mic size={17} aria-hidden="true" /></span>
      <span className={styles.audioTiempo} data-rc-tiempo-audio>{formatoTiempoAudio(valor)} / {total ? formatoTiempoAudio(total) : "–:––"}</span>
      <button type="button" className={styles.audioVelocidad} title="Velocidad de reproducción" aria-label={`Velocidad ${velocidad}x. Toca para cambiar`}
        onClick={() => {
          const siguiente = VELOCIDADES[(VELOCIDADES.indexOf(velocidad) + 1) % VELOCIDADES.length];
          setVelocidad(siguiente);
          if (audioRef.current) audioRef.current.playbackRate = siguiente;
        }}>{String(velocidad).replace(".", ",")}x</button>
      {error && <small className={styles.audioError} role="status">No se pudo reproducir este audio.</small>}
    </div>
  );
}
