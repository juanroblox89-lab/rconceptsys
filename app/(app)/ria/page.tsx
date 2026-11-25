"use client";

import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePerfilActual } from "@/components/AppShell";
import { RespuestaRIA } from "@/components/RespuestaRIA";
import { buscarRutasRIA, rutasVisiblesRIA, type RutaRIA } from "@/lib/rutas-ria";
import { ArrowRight, ArrowUp, Mic, Square } from "lucide-react";
import { MarcaRIA } from "@/components/MarcaRIA";
import { Boton } from "@/components/ui/Boton";
import { Esqueleto } from "@/components/ui/Esqueleto";

import { preguntasAyudaRIA, transmitirRIA, type MensajeRIA } from "@/lib/ria";
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
  return <Suspense fallback={<Esqueleto filas={3} />}><ConversacionRIA /></Suspense>;
}

function ConversacionRIA() {
  const perfil = usePerfilActual() ?? null;
  const router = useRouter();
  const params = useSearchParams();
  const modoAyuda = params.get("ayuda") === "1";
  const idMensaje = params.get("mensaje");
  const [comandoCerrado, setComandoCerrado] = useState(false);
  const [seleccion, setSeleccion] = useState(0);
  const rutas = rutasVisiblesRIA(perfil);
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
  const esComando = /^\/[a-z/-]*$/i.test(texto);
  const opciones = esComando ? buscarRutasRIA(rutas, texto) : [];
  const menuAbierto = esComando && !comandoCerrado && !microActivo && !enviando;
  const actual = Math.min(seleccion, Math.max(0, opciones.length - 1));

  function irA(ruta: RutaRIA) {
    setTexto("");
    setComandoCerrado(true);
    router.push(ruta.href);
  }

  async function enviar(valor: string) {
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
  }

  useEffect(() => {
    const carga = new AbortController();
    fetch("/api/ria", { cache: "no-store", signal: carga.signal }).then(async r => {
      if (!r.ok) throw new Error();
      return await r.json() as MensajeRIA[];
    }).then(h => {
      if (carga.signal.aborted) return;
      setHistorial(h); setListo(true);
    }).catch(() => { if (!carga.signal.aborted) setError("No pudimos cargar tu conversación."); });
    return () => {
      carga.abort();
      control.current?.abort();
      control.current = null;
    };
  }, [intento]);

  useLayoutEffect(() => {
    const scroll = zona.current;
    if (!scroll) return;
    if (idMensaje && /^\d+$/.test(idMensaje) && saltarA.current !== idMensaje) {
      const mensaje = document.getElementById(`ria-${idMensaje}`);

      if (mensaje && scroll.contains(mensaje)) {
        saltarA.current = idMensaje;
        seguir.current = false;
        scroll.scrollTop += mensaje.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 20;
        return;
      }
    }
    if (seguir.current) scroll.scrollTop = scroll.scrollHeight;
  }, [historial, pregunta, respuesta, error, listo, idMensaje, modoAyuda]);

  useLayoutEffect(() => {
    const campo = entrada.current;
    if (!campo) return;
    campo.style.height = "auto";
    campo.style.height = `${campo.scrollHeight}px`;
  }, [texto]);

  function publicar(valor: string) {
    if (!listo || microActivo || !valor.trim() || control.current) return;
    dictado.limpiarErrorVoz();
    if (modoAyuda) router.replace("/ria", { scroll: false });
    void enviar(valor);
  }
  const sugerencia = sugerenciaPara(perfil);
  const primerNombre = perfil?.nombre.trim().split(/\s+/)[0];
  const vacio = listo && !historial.length && !enviando;
  const mostrarAyuda = modoAyuda && !enviando;

  return <section className={styles.chat} aria-label="RIA">
    <header className={styles.cabecera}>
      <MarcaRIA size={30} /><h1>RIA</h1><span>Conversación privada</span>
    </header>
    <div className={styles.mensajes} ref={zona} aria-label="Conversación con RIA" onScroll={e => {
      const scroll = e.currentTarget;
      seguir.current = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 48;
    }}>
      <div className={`${styles.hilo} ${vacio || mostrarAyuda ? styles.hiloVacio : ""}`}>
        {!listo && !error && <div role="status" aria-label="Cargando conversación"><Esqueleto filas={3} /></div>}
        {mostrarAyuda && <div className={styles.saludo}>
          <h2>¿Qué quieres saber de RConcept?</h2>
          <div className={styles.fichas}>{preguntasAyudaRIA(perfil?.es_admin === true).map(ficha =>
            <button key={ficha} type="button" className={styles.sugerencia} onClick={() => publicar(ficha)} disabled={!listo || !perfil || microActivo}>
              {ficha}<ArrowRight size={15} aria-hidden="true" />
            </button>
          )}</div>
          {historial.length > 0 && <Boton variante="fantasma" tamano="sm" onClick={() => router.replace("/ria", { scroll: false })}>Volver a la conversación</Boton>}
        </div>}
        {vacio && !mostrarAyuda && <div className={styles.saludo}>
          <h2>{primerNombre ? `¿En qué te ayudo, ${primerNombre}?` : "¿En qué te ayudo?"}</h2>
          <button type="button" className={styles.sugerencia} onClick={() => publicar(sugerencia)} disabled={microActivo}>
            {sugerencia}<ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>}
        {!mostrarAyuda && historial.map(m => <article id={`ria-${m.id}`} className={`${styles.mensaje} ${m.rol === "user" ? styles.propia : ""}`} aria-label={m.rol === "user" ? "Tu mensaje" : "Respuesta de RIA"} key={m.id}>{m.rol === "assistant" ? <RespuestaRIA texto={m.cuerpo} rutas={rutas} /> : <p>{m.cuerpo}</p>}</article>)}
        {enviando && <>
          <article className={`${styles.mensaje} ${styles.propia}`} aria-label="Tu mensaje"><p>{pregunta}</p></article>
          {respuesta ? <article className={styles.mensaje} aria-label="Respuesta de RIA"><RespuestaRIA texto={respuesta} rutas={rutas} /></article> : <p role="status" className={styles.pensando}>Pensando</p>}
        </>}
        {error && <div role="alert" className={styles.error}>{error} {!listo && <Boton variante="secundario" tamano="sm" onClick={() => { setError(""); setIntento(n => n + 1); }}>Reintentar</Boton>}</div>}
      </div>
    </div>
    <div className={styles.pie}>
      {menuAbierto && <div className={styles.comandos}>
        <p className={styles.comandosTitulo}>Ir a una sección</p>
        <ul id="ria-rutas" role="listbox" aria-label="Secciones">
          {opciones.map((ruta, i) => <li key={ruta.href} id={`ria-ruta-${i}`} role="option" aria-selected={i === actual}
            onPointerMove={() => setSeleccion(i)} onMouseDown={e => e.preventDefault()} onClick={() => irA(ruta)}>
            <strong>{ruta.href}</strong><span>{ruta.descripcion}</span>
          </li>)}
        </ul>
        {!opciones.length && <p role="status">No hay secciones que coincidan.</p>}
      </div>}
      <form className={styles.form} data-rc-compositor data-rc-placeholder="Escribe a RIA…" onSubmit={e => { e.preventDefault(); if (menuAbierto && opciones[actual]) irA(opciones[actual]); else if (!esComando) publicar(texto); }}>
        <textarea ref={entrada} aria-label="Mensaje para RIA" placeholder="Escribe a RIA… o usa / para ir a una sección" rows={1} maxLength={2000} value={texto}
          aria-autocomplete="list" aria-controls={menuAbierto ? "ria-rutas" : undefined} aria-activedescendant={menuAbierto && opciones.length ? `ria-ruta-${actual}` : undefined}
          onBlur={() => setComandoCerrado(true)} onFocus={() => setComandoCerrado(false)}
          onChange={e => { setTexto(e.currentTarget.value); setComandoCerrado(false); setSeleccion(0); }} onKeyDown={e => {
            if (e.nativeEvent.isComposing) return;
            if (menuAbierto && e.key === "Escape") { e.preventDefault(); setComandoCerrado(true); return; }
            if (menuAbierto && opciones.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              const i = (actual + (e.key === "ArrowDown" ? 1 : -1) + opciones.length) % opciones.length;
              setSeleccion(i);
              document.getElementById(`ria-ruta-${i}`)?.scrollIntoView({ block: "nearest" });
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (menuAbierto && opciones[actual]) irA(opciones[actual]);
              else if (!esComando) publicar(texto);
            }
          }} />
        <button type="button" className={styles.micro} data-rc-compositor-boton aria-label={dictado.estado === "grabando" ? "Detener dictado" : "Dictar mensaje"}
          aria-pressed={dictado.estado === "grabando"} disabled={!listo || enviando || dictado.estado === "iniciando" || dictado.estado === "procesando"} onClick={dictado.alternar}>
          {dictado.estado === "grabando" ? <Square size={17} aria-hidden="true" /> : <Mic size={19} aria-hidden="true" />}
        </button>
        <button type="submit" className={styles.enviar} data-rc-compositor-boton aria-label="Enviar a RIA" disabled={!listo || !texto.trim() || esComando || enviando || microActivo}><ArrowUp size={20} aria-hidden="true" /></button>
      </form>
      <p data-rc-compositor-ayuda="solo-glass">Enter envía · Shift+Enter baja de línea · / abre secciones</p>
      {dictado.errorVoz ? <p role="alert" className={styles.error}>{dictado.errorVoz}</p> : microActivo && <p role="status" className={styles.voz}>{dictado.estado === "grabando" ? "Escuchando…" : dictado.estado === "iniciando" ? "Activando micrófono…" : "Transcribiendo…"}</p>}
    </div>
  </section>;
}
