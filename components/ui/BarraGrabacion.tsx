"use client";

import { useEffect, useRef, useState } from "react";
import { Square, X } from "lucide-react";
import styles from "./BarraGrabacion.module.css";

export type GrabacionActiva = { stream: MediaStream; inicio: number };
type SesionGrabacion = { cancelada: boolean; recorder?: MediaRecorder; stream?: MediaStream };

export function useGrabacionAudio(onGrabado: (archivo: File, duracionMs: number) => void, onError: (error: string) => void, onGrabando?: (activo: boolean) => void, maxBytes?: number) {
  const [activa, setActiva] = useState<GrabacionActiva | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [soporta, setSoporta] = useState(false);
  const vigente = useRef(false);
  const sesion = useRef<SesionGrabacion | null>(null);

  useEffect(() => {
    vigente.current = true;
    const timer = setTimeout(() => setSoporta(typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia), 0);
    return () => {
      vigente.current = false;
      clearTimeout(timer);
      const actual = sesion.current;
      if (!actual) return;
      actual.cancelada = true;
      if (actual.recorder && actual.recorder.state !== "inactive") actual.recorder.stop();
      actual.stream?.getTracks().forEach(pista => pista.stop());
      sesion.current = null;
    };
  }, []);

  async function empezar() {
    if (sesion.current || !soporta) return;
    const actual: SesionGrabacion = { cancelada: false };
    sesion.current = actual;
    setOcupado(true);
    onGrabando?.(true);

    function finalizar() {
      actual.stream?.getTracks().forEach(pista => pista.stop());
      if (!vigente.current || sesion.current !== actual) return false;
      sesion.current = null;
      setActiva(null);
      setOcupado(false);
      onGrabando?.(false);
      return true;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      actual.stream = stream;
      if (!vigente.current || sesion.current !== actual || actual.cancelada) { finalizar(); return; }
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find(tipo => MediaRecorder.isTypeSupported(tipo));
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      actual.recorder = recorder;
      const inicio = performance.now();
      const bloques: Blob[] = [];
      let bytes = 0;
      let limite = false;
      recorder.ondataavailable = e => {
        if (actual.cancelada || !e.data.size) return;
        bytes += e.data.size;
        if (maxBytes && bytes > maxBytes) {
          limite = true;
          if (recorder.state !== "inactive") recorder.stop();
        } else bloques.push(e.data);
      };
      recorder.onerror = () => {
        actual.cancelada = true;
        if (recorder.state !== "inactive") recorder.stop();
        if (finalizar()) onError("No pudimos grabar el audio. Intenta de nuevo.");
      };
      recorder.onstop = () => {
        if (!finalizar() || actual.cancelada) return;
        if (limite) { onError(`El audio grabado supera el límite de ${maxBytes! / (1024 * 1024)} MB.`); return; }
        if (!bytes) { onError("No se capturó audio. Intenta grabarlo de nuevo."); return; }
        const tipo = (recorder.mimeType || mime || "audio/webm").split(";")[0].toLowerCase().replace(/^video\//, "audio/");
        const ext = tipo === "audio/mp4" ? "m4a" : tipo === "audio/ogg" ? "ogg" : "webm";
        onGrabado(new File(bloques, `audio-${Date.now()}.${ext}`, { type: tipo }), Math.round(performance.now() - inicio));
      };
      recorder.start(300);
      setActiva({ stream, inicio });
    } catch {
      if (finalizar() && !actual.cancelada) onError("No pudimos usar el micrófono. Revisa el permiso del navegador.");
    }
  }

  function detener() {
    const recorder = sesion.current?.recorder;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  function cancelar() {
    const actual = sesion.current;
    if (!actual) return;
    actual.cancelada = true;
    if (actual.recorder && actual.recorder.state !== "inactive") {
      actual.recorder.stop();
    } else {
      actual.stream?.getTracks().forEach(pista => pista.stop());
      if (vigente.current && sesion.current === actual) {
        sesion.current = null;
        setActiva(null);
        setOcupado(false);
        onGrabando?.(false);
      }
    }
  }

  return { activa, ocupado, soporta, empezar, detener, cancelar };
}

export function BarraGrabacion({ grabacion, detener, cancelar, compacta = false }: { grabacion: GrabacionActiva; detener: () => void; cancelar: () => void; compacta?: boolean }) {
  const [segundos, setSegundos] = useState(0);
  const onda = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setSegundos(Math.floor((performance.now() - grabacion.inicio) / 1000)), 200);
    const medidor = onda.current;
    let contexto: AudioContext | undefined;
    let frame = 0;
    let activo = true;
    if (medidor && typeof AudioContext !== "undefined" && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      try {
        contexto = new AudioContext();
        const analizador = contexto.createAnalyser();
        analizador.fftSize = 256;
        contexto.createMediaStreamSource(grabacion.stream).connect(analizador);
        const valores = new Uint8Array(analizador.fftSize);
        const barras = Array.from(medidor.children) as HTMLElement[];
        const tamGrupo = Math.max(1, Math.floor(valores.length / Math.max(1, barras.length)));
        function medir() {
          if (!activo) return;
          analizador.getByteTimeDomainData(valores);
          barras.forEach((barra, i) => {
            let energia = 0;
            const ini = i * tamGrupo;
            const fin = Math.min(valores.length, ini + tamGrupo);
            for (let j = ini; j < fin; j++) energia += ((valores[j] - 128) / 128) ** 2;
            const rms = fin > ini ? Math.sqrt(energia / (fin - ini)) : 0;
            barra.style.setProperty("--nivel", String(Math.min(1, .17 + rms * 4)));
          });
          frame = requestAnimationFrame(medir);
        }
        void contexto.resume().then(() => {
          if (activo) { medidor.dataset.reactivo = "true"; medir(); }
        }).catch(() => { /* La onda CSS queda como señal de grabación. */ });
      } catch { /* Compatibilidad: queda la onda CSS. */ }
    }
    return () => {
      activo = false;
      clearInterval(timer);
      cancelAnimationFrame(frame);
      if (contexto && contexto.state !== "closed") void contexto.close().catch(() => {});
    };
  }, [grabacion]);

  const tiempo = `${String(Math.floor(segundos / 60)).padStart(2, "0")}:${String(segundos % 60).padStart(2, "0")}`;
  return <div className={styles.barra} data-compacta={compacta || undefined} aria-label="Grabación de audio">
    <span className={styles.punto} aria-hidden="true" />
    <span className={styles.etiqueta} role="status">Grabando</span>
    <span className={styles.tiempo} aria-label={`Tiempo de grabación: ${tiempo}`}>{tiempo}</span>
    <span className={styles.onda} ref={onda} aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <i key={i} />)}</span>
    <span className={styles.controles}>
      <button type="button" onClick={detener} aria-label="Detener grabación" title="Detener grabación"><Square size={14} /><span>Detener</span></button>
      <button type="button" onClick={cancelar} aria-label="Cancelar grabación" title="Cancelar grabación"><X size={16} /><span>Cancelar</span></button>
    </span>
  </div>;
}
