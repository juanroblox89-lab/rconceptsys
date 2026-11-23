"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, Mic, Square } from "lucide-react";
import { MarcaRIA } from "@/components/MarcaRIA";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { api } from "@/lib/api";
import { PREGUNTA_AYUDA, transmitirRIA, type MensajeRIA } from "@/lib/ria";
import type { Perfil } from "@/lib/types";
import { useDictadoRIA } from "@/lib/use-dictado-ria";
import styles from "./ria.module.css";

function sugerenciaPara(perfil: Perfil | null) {
  if (perfil?.es_admin) return "¿Qué entregas faltan por revisar esta semana?";
  const roles = (perfil?.roles ?? []).filter(r => r.activo).map(r => `${r.clave} ${r.nombre}`).join(" ")
    .normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (/edit/.test(roles)) return "¿Qué trabajos de edición tengo pendientes?";
  if (/camar|grab|film/.test(roles)) return "¿Qué grabaciones tengo esta semana?";
  return "¿Qué trabajos tengo pendientes?";
}

export default function RIAPage() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [historial, setHistorial] = useState<MensajeRIA[]>([]);
  const [listo, setListo] = useState(false);
  const [intento, setIntento] = useState(0);
  const [texto, setTexto] = useState("");
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [error, setError] = useState("");
  const control = useRef<AbortController | null>(null);
  const zona = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLTextAreaElement>(null);
  const seguir = useRef(true);
  const saltarA = useRef("");
  const dictado = useDictadoRIA(frase => setTexto(t => `${t.trimEnd()}${t.trim() ? " " : ""}${frase}`.slice(0, 2000)));
  const enviando = Boolean(pregunta);
  const microActivo = dictado.estado !== "listo";

  const enviar = useCallback(async (valor: string) => {
    const q = valor.trim();
    if (!q || control.current) return;
    const c = new AbortController();
    control.current = c;
    saltarA.current = "";
    seguir.current = true;
    setPregunta(q); setRespuesta(""); setError(""); setTexto("");
    try {
      const r = await transmitirRIA<MensajeRIA>({ pregunta: q }, s => setRespuesta(t => t + s), c.signal);
      if (!c.signal.aborted) setHistorial(h => [...h, { id: -r.id, rol: "user", cuerpo: q, creado_en: r.creado_en }, r]);
    } catch (e) {
      if (!c.signal.aborted) {
        setTexto(t => t.trim() ? t : q);
        setError(e instanceof Error ? e.message : "RIA no está disponible ahora.");
      }
    } finally {
      if (control.current === c) {
        control.current = null;
        if (!c.signal.aborted) { setPregunta(""); setRespuesta(""); }
      }
    }
  }, []);

  useEffect(() => {
    let activo = true;
    api.getYo().then(p => { if (activo) setPerfil(p); }).catch(() => {});
    return () => { activo = false; };
  }, []);

  useEffect(() => {
    const carga = new AbortController();
    fetch("/api/ria", { cache: "no-store", signal: carga.signal }).then(async r => {
      if (!r.ok) throw new Error();
      return await r.json() as MensajeRIA[];
    }).then(h => {
      if (carga.signal.aborted) return;
      const url = new URL(location.href);
      const id = url.searchParams.get("mensaje");
      saltarA.current = id && /^\d+$/.test(id) ? id : "";
      setHistorial(h); setListo(true);
      if (url.searchParams.get("ayuda") === "1") {
        url.searchParams.delete("ayuda");
        history.replaceState(history.state, "", url.pathname + url.search);
        void enviar(PREGUNTA_AYUDA);
      }
    }).catch(() => { if (!carga.signal.aborted) setError("No pudimos cargar tu conversación."); });
    return () => {
      carga.abort();
      control.current?.abort();
      control.current = null;
    };
  }, [enviar, intento]);

  useLayoutEffect(() => {
    const scroll = zona.current;
    if (!scroll) return;
    if (saltarA.current) {
      const mensaje = document.getElementById(`ria-${saltarA.current}`);
      saltarA.current = "";
      if (mensaje && scroll.contains(mensaje)) {
        seguir.current = false;
        scroll.scrollTop += mensaje.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 20;
        return;
      }
    }
    if (seguir.current) scroll.scrollTop = scroll.scrollHeight;
  }, [historial, pregunta, respuesta, error, listo]);

  useLayoutEffect(() => {
    const campo = entrada.current;
    if (!campo) return;
    campo.style.height = "auto";
    campo.style.height = `${campo.scrollHeight}px`;
  }, [texto]);

  function publicar(valor: string) {
    if (!listo || microActivo || !valor.trim() || control.current) return;
    dictado.limpiarErrorVoz();
    void enviar(valor);
  }
  const sugerencia = sugerenciaPara(perfil);
  const primerNombre = perfil?.nombre.trim().split(/\s+/)[0];
  const vacio = listo && !historial.length && !enviando;

  return <section className={styles.chat} aria-label="RIA">
    <header className={styles.cabecera}>
      <MarcaRIA size={30} /><h1>RIA</h1><span>Conversación privada</span>
    </header>
    <div className={styles.mensajes} ref={zona} aria-label="Conversación con RIA" onScroll={e => {
      const scroll = e.currentTarget;
      seguir.current = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 48;
    }}>
      <div className={`${styles.hilo} ${vacio ? styles.hiloVacio : ""}`}>
        {!listo && !error && <div role="status" aria-label="Cargando conversación"><Esqueleto filas={3} /></div>}
        {vacio && <div className={styles.saludo}>
          <h2>{primerNombre ? `¿En qué te ayudo, ${primerNombre}?` : "Listo cuando quieras."}</h2>
          <button type="button" className={styles.sugerencia} onClick={() => publicar(sugerencia)} disabled={microActivo}>
            {sugerencia}<ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>}
        {historial.map(m => <article id={`ria-${m.id}`} className={`${styles.mensaje} ${m.rol === "user" ? styles.propia : ""}`} aria-label={m.rol === "user" ? "Tu mensaje" : "Respuesta de RIA"} key={m.id}><p>{m.cuerpo}</p></article>)}
        {enviando && <>
          <article className={`${styles.mensaje} ${styles.propia}`} aria-label="Tu mensaje"><p>{pregunta}</p></article>
          {respuesta ? <article className={styles.mensaje} aria-label="Respuesta de RIA"><p>{respuesta}</p></article> : <p role="status" className={styles.pensando}>Pensando</p>}
        </>}
        {error && <div role="alert" className={styles.error}>{error} {!listo && <button type="button" onClick={() => { setError(""); setIntento(n => n + 1); }}>Reintentar</button>}</div>}
      </div>
    </div>
    <div className={styles.pie}>
      <form className={styles.form} onSubmit={e => { e.preventDefault(); publicar(texto); }}>
        <textarea ref={entrada} aria-label="Mensaje para RIA" placeholder="Escribe a RIA…" rows={1} maxLength={2000} value={texto}
          onChange={e => setTexto(e.currentTarget.value)} onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); publicar(texto); }
          }} />
        <button type="button" className={styles.micro} aria-label={dictado.estado === "grabando" ? "Detener dictado" : "Dictar mensaje"}
          aria-pressed={dictado.estado === "grabando"} disabled={!listo || enviando || dictado.estado === "iniciando" || dictado.estado === "procesando"} onClick={dictado.alternar}>
          {dictado.estado === "grabando" ? <Square size={17} aria-hidden="true" /> : <Mic size={19} aria-hidden="true" />}
        </button>
        <button type="submit" className={styles.enviar} aria-label="Enviar a RIA" disabled={!listo || !texto.trim() || enviando || microActivo}><ArrowUp size={20} aria-hidden="true" /></button>
      </form>
      {dictado.errorVoz ? <p role="alert" className={styles.error}>{dictado.errorVoz}</p> : microActivo && <p role="status" className={styles.voz}>{dictado.estado === "grabando" ? "Escuchando…" : dictado.estado === "iniciando" ? "Activando micrófono…" : "Transcribiendo…"}</p>}
    </div>
  </section>;
}
