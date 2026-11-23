"use client";

import { useEffect, useRef, useState } from "react";

type ResultadoVoz = { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
type Reconocedor = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((evento: { error: string }) => void) | null;
  onresult: ((evento: ResultadoVoz) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

const errores: Record<string, string> = {
  "not-allowed": "Permite el acceso al micrófono en tu navegador para dictar.",
  "service-not-allowed": "El navegador no permite el dictado. Puedes escribir el mensaje.",
  "audio-capture": "No encontramos un micrófono disponible.",
  "no-speech": "No escuchamos ninguna palabra. Intenta dictar de nuevo.",
  network: "No se pudo conectar con el servicio de dictado. Revisa tu conexión o escribe el mensaje.",
};

export function useDictadoRIA(anexar: (frase: string) => void) {
  const activo = useRef<Reconocedor | null>(null);
  const [estado, setEstado] = useState<"listo" | "iniciando" | "grabando" | "procesando">("listo");
  const [errorVoz, setErrorVoz] = useState("");

  useEffect(() => () => {
    if (!activo.current) return;
    const voz = activo.current;
    activo.current = null;
    voz.abort();
  }, []);

  function alternar() {
    if (activo.current) {
      if (estado !== "grabando") return;
      setEstado("procesando");
      activo.current.stop();
      return;
    }
    setErrorVoz("");
    const navegador = window as Window & {
      SpeechRecognition?: new () => Reconocedor;
      webkitSpeechRecognition?: new () => Reconocedor;
    };
    const Voz = navegador.SpeechRecognition ?? navegador.webkitSpeechRecognition;
    if (!Voz) {
      setErrorVoz("Este navegador no admite el dictado. Puedes escribir aquí o usar el micrófono de tu teclado.");
      return;
    }
    const voz = new Voz();
    voz.lang = "es-CO";
    voz.continuous = false;
    voz.interimResults = false;
    voz.onstart = () => { if (activo.current === voz) setEstado("grabando"); };
    voz.onresult = ({ results }) => {
      if (activo.current !== voz) return;
      const frase = Array.from(results).filter(r => r.isFinal).map(r => r[0].transcript.trim()).filter(Boolean).join(" ");
      if (frase) anexar(frase);
    };
    voz.onerror = ({ error }) => {
      if (activo.current === voz && error !== "aborted") setErrorVoz(errores[error] ?? "No pudimos transcribir el audio. Puedes reintentar o escribir el mensaje.");
    };
    voz.onend = () => {
      if (activo.current !== voz) return;
      activo.current = null;
      setEstado("listo");
    };
    try {
      activo.current = voz;
      setEstado("iniciando");
      voz.start();
    } catch {
      activo.current = null;
      setEstado("listo");
      setErrorVoz("No pudimos iniciar el micrófono. Revisa los permisos e inténtalo de nuevo.");
    }
  }
  return { estado, errorVoz, alternar, limpiarErrorVoz: () => setErrorVoz("") };
}
