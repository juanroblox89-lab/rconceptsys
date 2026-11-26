"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePerfilActual } from "@/components/AppShell";
import { RespuestaRIA } from "@/components/RespuestaRIA";
import { ArrowRight, ArrowUp, Mic, Square } from "lucide-react";
import { MarcaRIA } from "@/components/MarcaRIA";
import { useAviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/Boton";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Modal } from "@/components/ui/Modal";
import {
  AccionesMensaje,
  BarraDeshacer,
  EditorMensaje,
  MarcaEditado,
  copiarTextoSeguro,
} from "@/components/chat/AccionesMensaje";

import { api } from "@/lib/api";
import { esComposicionIME, preguntasAyudaRIA, transmitirRIA, type MensajeRIA } from "@/lib/ria";
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
  const { mostrarAviso } = useAviso();
  const modoAyuda = params.get("ayuda") === "1";
  const idMensaje = params.get("mensaje");
  const [historial, setHistorial] = useState<MensajeRIA[]>([]);
  const [listo, setListo] = useState(false);
  const [intento, setIntento] = useState(0);
  const [texto, setTexto] = useState("");
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [error, setError] = useState("");

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState<{ id: number; resumen: string } | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [deshacerId, setDeshacerId] = useState<number | null>(null);
  const [restaurando, setRestaurando] = useState(false);
  const deshacerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const control = useRef<AbortController | null>(null);
  const zona = useRef<HTMLDivElement>(null);
  const seguir = useRef(true);
  const saltarA = useRef("");
  const entrada = useRef<HTMLTextAreaElement>(null);
  const dictado = useDictadoRIA(frase => setTexto(t => `${t.trimEnd()}${t.trim() ? " " : ""}${frase}`.slice(0, 2000)));
  const enviando = Boolean(pregunta);
  const microActivo = dictado.estado !== "listo";

  useEffect(() => {
    return () => {
      if (deshacerTimerRef.current) clearTimeout(deshacerTimerRef.current);
    };
  }, []);

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
      if (!c.signal.aborted) {
        setHistorial(h => [...h, { id: r.pregunta_id ?? -r.id, rol: "user", cuerpo: q, creado_en: r.creado_en }, r]);
      }
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
    const campo = entrada.current;
    if (!campo || CSS.supports("field-sizing", "content")) return;
    if (!texto) campo.style.removeProperty("height");
    else {
      campo.style.height = "auto";
      campo.style.height = `${Math.max(44, campo.scrollHeight)}px`;
    }
  }, [texto]);

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

  function publicar(valor: string) {
    if (!listo || microActivo || control.current) return;
    const limpio = valor.trim();
    if (!limpio) return;
    dictado.limpiarErrorVoz();
    if (modoAyuda) router.replace("/ria", { scroll: false });
    void enviar(limpio);
  }

  const copiarMensaje = async (cuerpoMsg: string) => {
    const ok = await copiarTextoSeguro(cuerpoMsg);
    mostrarAviso({
      tipo: ok ? "exito" : "error",
      titulo: ok ? "Mensaje copiado" : "No se pudo copiar el mensaje",
      duracionMs: 2200,
    });
  };

  const guardarEdicion = async (id: number, nuevoTexto: string) => {
    setGuardandoEdicion(true);
    setErrorEdicion(null);
    try {
      const actualizado = await api.patchRIAMensaje(id, nuevoTexto);
      setHistorial(prev => prev.map(m => (m.id === id ? { ...m, ...actualizado } : m)));
      setEditandoId(null);
    } catch (err) {
      setErrorEdicion(err instanceof Error ? err.message : "No se pudo guardar el cambio.");
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const confirmarBorrado = async () => {
    if (!confirmarEliminar || eliminando) return;
    const id = confirmarEliminar.id;
    setEliminando(true);
    try {
      await api.deleteRIAMensaje(id);
      setHistorial(prev => prev.filter(m => m.id !== id));
      if (editandoId === id) setEditandoId(null);
      setConfirmarEliminar(null);
      if (deshacerTimerRef.current) clearTimeout(deshacerTimerRef.current);
      setDeshacerId(id);
      deshacerTimerRef.current = setTimeout(() => {
        setDeshacerId(null);
        deshacerTimerRef.current = null;
      }, 6000);
    } catch (err) {
      mostrarAviso({
        tipo: "error",
        titulo: err instanceof Error ? err.message : "No se pudo eliminar el mensaje.",
      });
    } finally {
      setEliminando(false);
    }
  };

  const deshacerEliminacion = async () => {
    if (!deshacerId || restaurando) return;
    setRestaurando(true);
    try {
      const restaurado = await api.restaurarRIAMensaje(deshacerId);
      setHistorial(prev =>
        prev.some(m => m.id === restaurado.id)
          ? prev
          : [...prev, restaurado].sort((a, b) => a.id - b.id),
      );
      if (deshacerTimerRef.current) {
        clearTimeout(deshacerTimerRef.current);
        deshacerTimerRef.current = null;
      }
      setDeshacerId(null);
    } catch (err) {
      setDeshacerId(null);
      mostrarAviso({
        tipo: "error",
        titulo: err instanceof Error ? err.message : "Ya no se puede deshacer la eliminación.",
      });
    } finally {
      setRestaurando(false);
    }
  };

  const sugerencia = sugerenciaPara(perfil);
  const primerNombre = perfil?.nombre.trim().split(/\s+/)[0];
  const vacio = listo && !historial.length && !enviando;
  const mostrarAyuda = modoAyuda && !enviando;

  return <>
  <section className={styles.chat} aria-label="RIA">
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
        {!mostrarAyuda && historial.map(m => {
          const esUsuario = m.rol === "user";
          const esPersistido = m.id > 0;
          const estaEditando = editandoId === m.id;

          return (
            <AccionesMensaje
              key={m.id}
              propio={esUsuario}
              bloque={!esUsuario}
              resumen={m.cuerpo}
              puedeCopiar={Boolean(m.cuerpo.trim())}
              puedeEditar={esUsuario && esPersistido}
              puedeEliminar={esUsuario && esPersistido}
              editando={estaEditando}
              onCopiar={() => void copiarMensaje(m.cuerpo)}
              onEditar={() => {
                setErrorEdicion(null);
                setEditandoId(m.id);
              }}
              onEliminar={() => setConfirmarEliminar({ id: m.id, resumen: m.cuerpo })}
            >
              <article
                id={`ria-${m.id}`}
                className={`${styles.mensaje} ${esUsuario ? styles.propia : ""}`}
                aria-label={esUsuario ? "Tu mensaje" : "Respuesta de RIA"}
              >
                {estaEditando ? (
                  <EditorMensaje
                    valorInicial={m.cuerpo}
                    guardando={guardandoEdicion}
                    error={errorEdicion}
                    onGuardar={nuevo => void guardarEdicion(m.id, nuevo)}
                    onCancelar={() => {
                      setEditandoId(null);
                      setErrorEdicion(null);
                    }}
                  />
                ) : esUsuario ? (
                  <>
                    <p>{m.cuerpo}</p>
                    <MarcaEditado fecha={m.editado_en} />
                  </>
                ) : (
                  <RespuestaRIA texto={m.cuerpo} rutas={[]} />
                )}
              </article>
            </AccionesMensaje>
          );
        })}
        {enviando && <>
          <article className={`${styles.mensaje} ${styles.propia}`} aria-label="Tu mensaje"><p>{pregunta}</p></article>
          {respuesta ? <article className={styles.mensaje} aria-label="Respuesta de RIA"><RespuestaRIA texto={respuesta} rutas={[]} /></article> : <p role="status" className={styles.pensando}>Pensando</p>}
        </>}
        {error && <div role="alert" className={styles.error}>{error} {!listo && <Boton variante="secundario" tamano="sm" onClick={() => { setError(""); setIntento(n => n + 1); }}>Reintentar</Boton>}</div>}
      </div>
    </div>
    <div className={styles.pie}>
      {deshacerId !== null && (
        <BarraDeshacer
          restaurando={restaurando}
          onDeshacer={() => void deshacerEliminacion()}
          onCerrar={() => {
            if (deshacerTimerRef.current) {
              clearTimeout(deshacerTimerRef.current);
              deshacerTimerRef.current = null;
            }
            setDeshacerId(null);
          }}
        />
      )}
      <form className={styles.form} data-rc-compositor data-rc-placeholder="Escribe a RIA…" onSubmit={e => { e.preventDefault(); publicar(texto); }}>
        <textarea ref={entrada} aria-label="Mensaje para RIA" placeholder="Escribe a RIA…" rows={1} maxLength={2000}
          value={texto} onChange={e => setTexto(e.currentTarget.value)} onKeyDown={e => {
            if (esComposicionIME(e.nativeEvent)) return;
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              publicar(texto);
            }
          }} />
        <button type="button" className={styles.micro} data-rc-compositor-boton aria-label={dictado.estado === "grabando" ? "Detener dictado" : "Dictar mensaje"}
          aria-pressed={dictado.estado === "grabando"} disabled={!listo || enviando || dictado.estado === "iniciando" || dictado.estado === "procesando"} onClick={dictado.alternar}>
          {dictado.estado === "grabando" ? <Square size={17} aria-hidden="true" /> : <Mic size={19} aria-hidden="true" />}
        </button>
        <button type="submit" className={styles.enviar} data-rc-compositor-boton aria-label="Enviar a RIA" disabled={!listo || !texto.trim() || enviando || microActivo}><ArrowUp size={20} aria-hidden="true" /></button>
      </form>
      {dictado.errorVoz ? <p role="alert" className={styles.error}>{dictado.errorVoz}</p> : microActivo && <p role="status" className={styles.voz}>{dictado.estado === "grabando" ? "Escuchando…" : dictado.estado === "iniciando" ? "Activando micrófono…" : "Transcribiendo…"}</p>}
    </div>
  </section>

    <Modal
      abierto={confirmarEliminar !== null}
      titulo="Eliminar mensaje"
      descripcion={
        confirmarEliminar?.resumen
          ? `¿Seguro que quieres eliminar «${confirmarEliminar.resumen.slice(0, 80)}${confirmarEliminar.resumen.length > 80 ? "…" : ""}»?`
          : "¿Seguro que quieres eliminar este mensaje?"
      }
      onCerrar={() => !eliminando && setConfirmarEliminar(null)}
      accionSecundaria={
        <Boton variante="secundario" onClick={() => setConfirmarEliminar(null)} disabled={eliminando}>
          Cancelar
        </Boton>
      }
      accionPrimaria={
        <Boton variante="peligro" onClick={() => void confirmarBorrado()} disabled={eliminando}>
          {eliminando ? "Eliminando…" : "Eliminar"}
        </Boton>
      }
    />
  </>;
}
