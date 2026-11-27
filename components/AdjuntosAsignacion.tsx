"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Download, Film, ImageIcon, Mic, Music2, Paperclip, Trash2 } from "lucide-react";
import { Boton } from "@/components/ui/Boton";
import { aceptarAdjuntos, adjuntos, bytesPorMBAdjunto, detectarTipoArchivo, limiteAdjunto, pesoAdjunto, validarPesoAdjunto, type AdjuntoAsignacion, type AdjuntoLocal, type TipoAdjunto } from "@/lib/adjuntos-asignacion";
import { BarraGrabacion, useGrabacionAudio } from '@/components/ui/BarraGrabacion';
import styles from "./AdjuntosAsignacion.module.css";

const textoError = (e: unknown) => e instanceof Error ? e.message : "No se pudo completar la acción.";
const posterVideo = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="#252832"/><path d="M145 64v52l42-26z" fill="#ffffff"/></svg>')}`;

function duracionMedio(e: React.SyntheticEvent<HTMLMediaElement>, guardar?: (d: number) => void) {
  const s = e.currentTarget.duration;
  if (Number.isFinite(s) && s >= 0) guardar?.(Math.round(s * 1000));
}

function Medio({ tipo, url, nombre, visor = false, duracion, renovar }: { tipo: TipoAdjunto; url: string; nombre: string; visor?: boolean; duracion?: (d: number) => void; renovar?: () => void }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [noVisible, setNoVisible] = useState(false);
  const Icono = tipo === "imagen" ? ImageIcon : tipo === "video" ? Film : Music2;
  if (!url || noVisible) return <div className={styles.visual} aria-label={url ? "Vista previa no compatible" : "Cargando vista previa"}><Icono size={24} strokeWidth={1.5} /></div>;
  // Blob y URLs efímeras: no se envían al optimizador de imágenes.
  /* eslint-disable @next/next/no-img-element */
  if (tipo === "imagen") return <>
    {visor ? <Boton className={styles.miniatura} variante="secundario" aria-label={`Ver ${nombre}`} onClick={() => dialogo.current?.showModal()}><img src={url} alt="" onError={() => setNoVisible(true)} /></Boton> :
      <div className={styles.miniatura}><img src={url} alt={nombre} onError={() => setNoVisible(true)} /></div>}
    {visor && <dialog ref={dialogo} className={styles.visor} aria-label={nombre} onClick={e => { if (e.target === e.currentTarget) dialogo.current?.close(); }}>
      <div className={styles.acciones}><strong>{nombre}</strong><Boton variante="secundario" tamano="sm" onClick={() => dialogo.current?.close()}>Cerrar</Boton></div>
      <img src={url} alt={nombre} loading="lazy" />
    </dialog>}
  </>;
  /* eslint-enable @next/next/no-img-element */
  if (tipo === "video") return <div className={styles.marcoVideo}><video src={url} poster={posterVideo} controls playsInline preload="metadata" aria-label={nombre} onError={renovar} onLoadedMetadata={e => duracionMedio(e, duracion)} /></div>;
  return <audio className={styles.audio} src={url} controls preload="metadata" aria-label={nombre} onError={renovar} onLoadedMetadata={e => duracionMedio(e, duracion)} />;
}

function BotonResumen({ activo, onClick, bloqueado, ocupando }: { activo: boolean; onClick: () => void; bloqueado?: boolean; ocupando?: boolean }) {
  return <Boton variante="secundario" tamano="sm" role="switch" aria-checked={activo} aria-busy={ocupando || undefined} disabled={bloqueado} onClick={onClick}>{activo && <Check size={15} aria-hidden="true" />}Resumir con IA</Boton>;
}

function Quitar({ nombre, onQuitar, bloqueado }: { nombre: string; onQuitar: () => void; bloqueado?: boolean }) {
  const [confirmar, setConfirmar] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const cancelar = useRef<HTMLButtonElement>(null);
  function no() { setConfirmar(false); requestAnimationFrame(() => boton.current?.focus()); }
  return confirmar ? <div className={styles.confirmar} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); no(); } }}>
    <span>¿Quitar {nombre}?</span><div className={styles.acciones}>
      <Boton variante="secundario" tamano="sm" ref={el => { cancelar.current = el; el?.focus(); }} disabled={bloqueado} onClick={no}>No</Boton>
      <Boton variante="peligro" tamano="sm" disabled={bloqueado} onClick={() => { setConfirmar(false); onQuitar(); }}>Sí</Boton>
    </div></div> : <Boton variante="peligro" tamano="sm" ref={boton} disabled={bloqueado} aria-label={`Quitar ${nombre}`} onClick={() => setConfirmar(true)}><Trash2 size={15} aria-hidden="true" /> Quitar</Boton>;
}

function FilaLocal({
  a,
  actualizarItem,
  onResumir,
  quitar,
  bloqueado,
  permitirResumen = true,
}: {
  a: AdjuntoLocal;
  actualizarItem: (id: string, fn: (actual: AdjuntoLocal) => AdjuntoLocal) => void;
  onResumir: (a: AdjuntoLocal) => void;
  quitar: () => void;
  bloqueado: boolean;
  permitirResumen?: boolean;
}) {
  const [url, setUrl] = useState("");
  const { archivo } = a;
  useEffect(() => {
    const objeto = URL.createObjectURL(archivo);
    // El URL del archivo solo existe mientras esta fila está montada.
    const t = setTimeout(() => setUrl(objeto), 0);
    return () => { clearTimeout(t); URL.revokeObjectURL(objeto); };
  }, [archivo]);
  const estado = a.estadoResumen;
  const resumiendo = estado === "procesando";
  return <li>
    <strong className={styles.nombre}>{archivo.name}</strong><span className={styles.ayuda}>{pesoAdjunto(archivo.size, a.tipo)}</span>
    <Medio tipo={a.tipo} url={url} nombre={archivo.name} duracion={d => { if (!bloqueado && a.duracion === undefined) actualizarItem(a.id, x => x.duracion === undefined ? { ...x, duracion: d } : x); }} />
    {a.avance !== undefined && <><progress className={styles.progreso} aria-label={`Subida de ${archivo.name}`} max={100} value={a.avance} /><span className={styles.ayuda}>{a.avance === 95 && bloqueado ? "Guardando archivo…" : `${a.avance}%`}</span></>}
    {a.error && <span className={styles.error} role="alert">{a.error}</span>}
    <div className={styles.acciones}>
      {permitirResumen && a.tipo === "audio" && (
        <BotonResumen
          activo={a.resumir}
          ocupando={resumiendo}
          bloqueado={bloqueado || resumiendo}
          onClick={() => {
            if (!a.resumir) {
              onResumir(a);
            } else {
              actualizarItem(a.id, x => ({
                ...x,
                resumir: false,
                estadoResumen: "sin_resumen",
                resumen: undefined,
                transcripcion: undefined,
                errorResumen: undefined,
                borradorResumen: undefined,
              }));
            }
          }}
        />
      )}
      <Quitar nombre={archivo.name} onQuitar={quitar} bloqueado={bloqueado} />
    </div>
    {permitirResumen && a.tipo === "audio" && a.resumir && (
      <div className={styles.resumen}>
        <strong role="status">{estado === "listo" ? "Listo" : estado === "fallido" ? "No se pudo" : "Resumiendo…"}</strong>
        {estado === "fallido" && (
          <>
            <p role="alert" className={styles.error}>{a.errorResumen || "No pudimos resumir este audio. Intenta de nuevo."}</p>
            <div className={styles.acciones}>
              <Boton variante="secundario" tamano="sm" disabled={bloqueado} onClick={() => onResumir(a)}>Reintentar</Boton>
            </div>
          </>
        )}
        {estado === "listo" && (
          <>
            <ul aria-label="Resumen">{a.resumen?.map((p, i) => <li key={i}>{p}</li>)}</ul>
            {a.transcripcion && <details><summary>Transcripción</summary><p>{a.transcripcion}</p></details>}
          </>
        )}
      </div>
    )}
  </li>;
}

export function EditorAdjuntos({
  locales,
  cambiar,
  quitar,
  cantidad,
  bloqueado,
  onGrabando,
  permitirResumen = true,
  tituloSeccion = "Adjuntos",
  compacto = false,
}: {
  locales: AdjuntoLocal[];
  cambiar: (actualizar: (lista: AdjuntoLocal[]) => AdjuntoLocal[]) => void;
  quitar: (a: AdjuntoLocal) => void;
  cantidad: number;
  bloqueado: boolean;
  onGrabando: (v: boolean) => void;
  permitirResumen?: boolean;
  tituloSeccion?: string;
  compacto?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const vivo = useRef(false);
  const enCursoBorrador = useRef<Set<string>>(new Set());
  const [error, setError] = useState("");
  const titulo = useId();
  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);

  function actualizarItem(id: string, fn: (actual: AdjuntoLocal) => AdjuntoLocal) {
    cambiar(lista => lista.map(x => x.id === id ? fn(x) : x));
  }

  async function resumirBorrador(a: AdjuntoLocal) {
    if (enCursoBorrador.current.has(a.id)) return;
    enCursoBorrador.current.add(a.id);
    actualizarItem(a.id, x => ({
      ...x,
      resumir: true,
      estadoResumen: "procesando",
      errorResumen: undefined,
      resumen: undefined,
      transcripcion: undefined,
      borradorResumen: undefined,
    }));
    try {
      const res = await adjuntos.resumirBorrador(a);
      if (!vivo.current) return;
      actualizarItem(a.id, x => ({
        ...x,
        resumir: true,
        estadoResumen: "listo",
        resumen: res.resumen,
        transcripcion: res.transcripcion,
        borradorResumen: res.borrador_resumen,
        errorResumen: undefined,
      }));
    } catch (e) {
      if (!vivo.current) return;
      actualizarItem(a.id, x => ({
        ...x,
        resumir: true,
        estadoResumen: "fallido",
        errorResumen: textoError(e),
        resumen: undefined,
        transcripcion: undefined,
        borradorResumen: undefined,
      }));
    } finally {
      enCursoBorrador.current.delete(a.id);
    }
  }

  async function agregar(archivos: File[], duracion?: number) {
    const lote: AdjuntoLocal[] = []; const problemas: string[] = [];
    for (let archivo of archivos) {
      if (cantidad + lote.length >= 10) { problemas.push("Máximo 10 adjuntos."); break; }
      const tipo = await detectarTipoArchivo(archivo);
      if (!vivo.current) return;
      if (!tipo) { problemas.push("Hay un formato no compatible."); continue; }
      const errorPeso = validarPesoAdjunto(archivo.size, tipo);
      if (errorPeso) { problemas.push(errorPeso); continue; }
      if (tipo === "audio" && archivo.name.toLowerCase().endsWith(".webm") && archivo.type !== "audio/webm") {
        archivo = new File([archivo], archivo.name, { type: "audio/webm", lastModified: archivo.lastModified });
      }
      lote.push({ id: crypto.randomUUID(), archivo, tipo, resumir: false, estadoResumen: "sin_resumen", duracion });
    }
    setError([...new Set(problemas)].join(" ")); if (lote.length) cambiar(v => [...v, ...lote]);
  }

  const grabacion = useGrabacionAudio((archivo, duracion) => void agregar([archivo], duracion), setError, onGrabando, limiteAdjunto.audio * bytesPorMBAdjunto);
  const grabando = grabacion.ocupado;

  return <section className={styles.seccion} aria-labelledby={titulo}>
    <div className={styles.cabecera}><h3 id={titulo}>{tituloSeccion}</h3><div className={styles.acciones}>
      <input ref={input} hidden type="file" multiple accept={aceptarAdjuntos} onChange={e => { const fs = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ""; void agregar(fs); }} />
      <Boton variante="secundario" tamano="sm" disabled={bloqueado || grabando || cantidad >= 10} onClick={() => input.current?.click()}><Paperclip size={16} aria-hidden="true" /> Adjuntar</Boton>
      {grabacion.soporta && !grabacion.activa && <Boton variante="fantasma" tamano="sm" disabled={bloqueado || grabando || cantidad >= 10} onClick={() => { setError(""); void grabacion.empezar(); }}><Mic size={16} aria-hidden="true" /> Grabar audio</Boton>}
    </div></div>
    <span className={styles.ayuda}>{cantidad}/10 · Imagen 10 MB · Video 50 MB · Audio 25 MB</span>
    {grabacion.activa ? <BarraGrabacion grabacion={grabacion.activa} detener={grabacion.detener} cancelar={grabacion.cancelar} /> : grabando && <span role="status" className={styles.ayuda}>Esperando acceso al micrófono…</span>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {locales.length > 0 && <ul className={`${styles.lista} ${compacto ? styles.listaCompacta : ""}`.trim()}>{locales.map(a => <FilaLocal key={a.id} a={a} bloqueado={bloqueado || grabando} permitirResumen={permitirResumen} quitar={() => quitar(a)} actualizarItem={actualizarItem} onResumir={item => void resumirBorrador(item)} />)}</ul>}
  </section>;
}

function FilaGuardada({
  tarea,
  a,
  editable,
  bloqueado,
  actualizar,
  onProcesar,
}: {
  tarea: number;
  a: AdjuntoAsignacion;
  editable: boolean;
  bloqueado: boolean;
  actualizar: (id: string, v?: AdjuntoAsignacion) => void;
  onProcesar: (id: string) => Promise<void>;
}) {
  const [medio, setMedio] = useState<{ url: string; expira: number }>();
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [version, setVersion] = useState(0);
  const id = a.id;
  useEffect(() => {
    let vivo = true;
    adjuntos.firma(tarea, id).then(r => { if (vivo) setMedio({ url: r.url, expira: Date.now() + r.expira_en * 1000 }); }).catch(() => { if (vivo) setError("No se pudo cargar la vista previa."); });
    return () => { vivo = false; };
  }, [tarea, id, version]);
  function renovar() { if (medio && Date.now() >= medio.expira - 3000) setVersion(n => n + 1); }
  async function accion(fn: () => Promise<unknown>) {
    setOcupado(true); setError(""); try { await fn(); } catch (e) { setError(textoError(e)); } finally { setOcupado(false); }
  }
  async function descargar() {
    const { url } = await adjuntos.firma(tarea, id, true);
    const enlace = document.createElement("a"); enlace.href = url; enlace.rel = "noreferrer"; enlace.download = a.nombre;
    document.body.append(enlace); enlace.click(); enlace.remove();
  }
  const estado = a.estado_resumen;
  const resumiendo = a.resumir && (estado === "pendiente" || estado === "procesando");
  return <li>
    <strong className={styles.nombre}>{a.nombre}</strong><span className={styles.ayuda}>{pesoAdjunto(a.tamano, a.tipo)}</span>
    <Medio key={medio?.url} tipo={a.tipo} url={medio?.url ?? ""} nombre={a.nombre} visor renovar={renovar} />
    <div className={styles.acciones}>
      <Boton variante="secundario" tamano="sm" aria-label={`Descargar ${a.nombre}`} disabled={ocupado} onClick={() => void accion(descargar)}><Download size={15} aria-hidden="true" /> Descargar</Boton>
      {editable && a.tipo === "audio" && (
        <BotonResumen
          activo={a.resumir}
          ocupando={resumiendo}
          bloqueado={ocupado || bloqueado || resumiendo}
          onClick={() => void accion(async () => {
            const activar = !a.resumir;
            const resp = await adjuntos.resumir(tarea, id, activar);
            actualizar(id, resp);
            if (activar && (resp.estado_resumen === "pendiente" || resp.estado_resumen === "procesando")) {
              await onProcesar(id);
            }
          })}
        />
      )}
      {editable && <Quitar nombre={a.nombre} bloqueado={ocupado || bloqueado} onQuitar={() => void accion(async () => { await adjuntos.quitar(tarea, id); actualizar(id); })} />}
    </div>
    {a.resumir && <div className={styles.resumen}>
      <strong role="status">{estado === "listo" ? "Listo" : estado === "fallido" ? "No se pudo" : "Resumiendo…"}</strong>
      {estado === "fallido" && (
        <>
          <p role="alert" className={styles.error}>{a.error_resumen || "No pudimos resumir este audio. Pulsa Reintentar para intentarlo de nuevo."}</p>
          <div className={styles.acciones}>
            <Boton variante="secundario" tamano="sm" disabled={ocupado} onClick={() => void accion(async () => {
              const resp = await adjuntos.reintentar(tarea, id);
              actualizar(id, resp);
              await onProcesar(id);
            })}>Reintentar</Boton>
          </div>
        </>
      )}
      {estado === "listo" && <><ul aria-label="Resumen">{a.resumen?.map((p, i) => <li key={i}>{p}</li>)}</ul>
        <details><summary>Transcripción</summary><p>{a.transcripcion}</p></details></>}
    </div>}
    {error && <span role="alert" className={styles.error}>{error}</span>}
  </li>;
}

export function AdjuntosGuardados({ tarea, editable = false, bloqueado = false, cantidad }: { tarea: number; editable?: boolean; bloqueado?: boolean; cantidad?: (n: number) => void }) {
  const [lista, setLista] = useState<AdjuntoAsignacion[] | null>(null);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);
  const vivoRef = useRef(true);
  const enCurso = useRef<Map<string, Promise<void>>>(new Map());
  const autoDisparados = useRef<Set<string>>(new Set());
  const titulo = useId();
  const pendiente = lista?.some(a => a.resumir && (a.estado_resumen === "pendiente" || a.estado_resumen === "procesando")) ?? false;

  useEffect(() => {
    vivoRef.current = true;
    autoDisparados.current.clear();
    return () => { vivoRef.current = false; };
  }, [tarea]);

  const procesar = useCallback((id: string): Promise<void> => {
    const existente = enCurso.current.get(id);
    if (existente) return existente;
    autoDisparados.current.add(id);
    setLista(prev => prev ? prev.map(a => a.id === id && a.estado_resumen === "pendiente" ? { ...a, estado_resumen: "procesando", error_resumen: undefined } : a) : prev);
    const promesa = (async () => {
      try {
        const res = await adjuntos.procesarResumen(tarea, id);
        if (!vivoRef.current) return;
        setLista(prev => prev ? prev.map(a => a.id === id ? res : a) : prev);
      } catch (e) {
        if (!vivoRef.current) return;
        setLista(prev => prev ? prev.map(a => a.id === id ? { ...a, estado_resumen: "fallido", error_resumen: textoError(e) } : a) : prev);
      } finally {
        enCurso.current.delete(id);
      }
    })();
    enCurso.current.set(id, promesa);
    return promesa;
  }, [tarea]);

  useEffect(() => {
    let vivo = true;
    const traer = () => adjuntos.listar(tarea).then(r => {
      if (!vivo) return;
      setLista(prev => {
        const siguientes = r.map(item => {
          if (enCurso.current.has(item.id) && item.estado_resumen === "pendiente") {
            return { ...item, estado_resumen: "procesando" as const };
          }
          const ant = prev?.find(x => x.id === item.id);
          if (item.estado_resumen === "fallido" && !item.error_resumen && ant?.error_resumen) {
            return { ...item, error_resumen: ant.error_resumen };
          }
          return item;
        });
        return siguientes;
      });
      cantidad?.(r.length);
      setError(false);
    }).catch(() => { if (vivo) setError(true); });
    void traer();
    const t = pendiente ? setInterval(() => { if (!document.hidden) void traer(); }, 12000) : undefined;
    return () => { vivo = false; clearInterval(t); };
  }, [tarea, cantidad, pendiente, intento]);

  useEffect(() => {
    if (!lista) return;
    for (const a of lista) {
      if (a.tipo === "audio" && a.resumir && a.estado_resumen === "pendiente" && !enCurso.current.has(a.id) && !autoDisparados.current.has(a.id)) {
        autoDisparados.current.add(a.id);
        void procesar(a.id);
      }
    }
  }, [lista, procesar]);

  function actualizar(id: string, v?: AdjuntoAsignacion) {
    if (v?.estado_resumen === "pendiente" || v?.estado_resumen === "sin_resumen") {
      autoDisparados.current.delete(id);
    }
    setLista(l => {
      const sig = (l ?? []).flatMap(a => a.id === id ? v ? [v] : [] : [a]);
      if (!v) cantidad?.(sig.length);
      return sig;
    });
  }
  if (lista?.length === 0 && !error) return null;
  return <section className={styles.seccion} aria-labelledby={titulo}>
    <div className={styles.cabecera}><h3 id={titulo}>{editable ? "Adjuntos guardados" : "Adjuntos"}</h3></div>
    {!lista && !error && <span className={styles.ayuda} role="status">Cargando adjuntos…</span>}
    {error && <div className={styles.acciones}><span className={styles.error} role="alert">No se pudieron cargar los adjuntos.</span><Boton variante="secundario" tamano="sm" onClick={() => setIntento(i => i + 1)}>Reintentar</Boton></div>}
    {!!lista?.length && <ul className={styles.lista}>{lista.map(a => <FilaGuardada key={a.id} tarea={tarea} a={a} editable={editable} bloqueado={bloqueado} actualizar={actualizar} onProcesar={id => procesar(id)} />)}</ul>}
  </section>;
}

export interface AdjuntoRechazoItem {
  id: string;
  tipo: TipoAdjunto;
  nombre: string;
  mime: string;
  tamano: number;
  duracion_ms?: number | null;
  resumir?: boolean;
  estado_resumen?: string;
  resumen?: string[];
  transcripcion?: string | null;
  error_resumen?: string | null;
}

function FilaRechazo({ tarea, a: inicial }: { tarea: number; a: AdjuntoRechazoItem }) {
  const [override, setOverride] = useState<{ fuente: AdjuntoRechazoItem; valor: AdjuntoRechazoItem } | null>(null);
  const item = override?.fuente === inicial ? override.valor : inicial;
  const [medio, setMedio] = useState<{ url: string; expira: number }>();
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [version, setVersion] = useState(0);
  const procesandoRef = useRef(false);

  const actualizarItem = useCallback(
    (fn: (actual: AdjuntoRechazoItem) => AdjuntoRechazoItem) => {
      setOverride((prev) => {
        const base = prev?.fuente === inicial ? prev.valor : inicial;
        return { fuente: inicial, valor: fn(base) };
      });
    },
    [inicial],
  );

  useEffect(() => {
    let vivo = true;
    adjuntos
      .firma(tarea, item.id)
      .then((r) => {
        if (vivo) setMedio({ url: r.url, expira: Date.now() + r.expira_en * 1000 });
      })
      .catch(() => {
        if (vivo) setError("No se pudo cargar la vista previa.");
      });
    return () => {
      vivo = false;
    };
  }, [tarea, item.id, version]);

  useEffect(() => {
    if (
      item.tipo !== "audio" ||
      !item.resumir ||
      (item.estado_resumen !== "pendiente" && item.estado_resumen !== "procesando") ||
      procesandoRef.current
    ) {
      return;
    }
    procesandoRef.current = true;
    let vivo = true;
    adjuntos
      .procesarResumen(tarea, item.id)
      .then((res) => {
        if (vivo) actualizarItem((prev) => ({ ...prev, ...res }));
      })
      .catch((e) => {
        if (vivo) {
          actualizarItem((prev) => ({
            ...prev,
            estado_resumen: "fallido",
            error_resumen: textoError(e),
          }));
        }
      })
      .finally(() => {
        procesandoRef.current = false;
      });
    return () => {
      vivo = false;
    };
  }, [tarea, item.id, item.tipo, item.resumir, item.estado_resumen, actualizarItem]);

  function renovar() {
    if (medio && Date.now() >= medio.expira - 3000) setVersion((n) => n + 1);
  }

  async function descargar() {
    setOcupado(true);
    setError("");
    try {
      const { url } = await adjuntos.firma(tarea, item.id, true);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.rel = "noreferrer";
      enlace.download = item.nombre;
      document.body.append(enlace);
      enlace.click();
      enlace.remove();
    } catch (e) {
      setError(textoError(e));
    } finally {
      setOcupado(false);
    }
  }

  async function reintentarResumen() {
    setOcupado(true);
    setError("");
    try {
      const resp = await adjuntos.reintentar(tarea, item.id);
      actualizarItem((prev) => ({ ...prev, ...resp }));
    } catch (e) {
      setError(textoError(e));
    } finally {
      setOcupado(false);
    }
  }

  const estado = item.estado_resumen;
  return (
    <li>
      <strong className={styles.nombre}>{item.nombre}</strong>
      <span className={styles.ayuda}>{pesoAdjunto(item.tamano, item.tipo)}</span>
      <Medio key={medio?.url} tipo={item.tipo} url={medio?.url ?? ""} nombre={item.nombre} visor renovar={renovar} />
      <div className={styles.acciones}>
        <Boton
          variante="secundario"
          tamano="sm"
          aria-label={`Descargar ${item.nombre}`}
          disabled={ocupado}
          onClick={() => void descargar()}
        >
          <Download size={15} aria-hidden="true" /> Descargar
        </Boton>
      </div>
      {item.resumir && item.tipo === "audio" && (
        <div className={styles.resumen}>
          <strong role="status">
            {estado === "listo" ? "Listo" : estado === "fallido" ? "No se pudo" : "Resumiendo…"}
          </strong>
          {estado === "fallido" && (
            <>
              <p role="alert" className={styles.error}>
                {item.error_resumen || "No pudimos resumir este audio. Pulsa Reintentar para intentarlo de nuevo."}
              </p>
              <div className={styles.acciones}>
                <Boton variante="secundario" tamano="sm" disabled={ocupado} onClick={() => void reintentarResumen()}>
                  Reintentar
                </Boton>
              </div>
            </>
          )}
          {estado === "listo" && (
            <>
              <ul aria-label="Resumen">{item.resumen?.map((p, i) => <li key={i}>{p}</li>)}</ul>
              {item.transcripcion && (
                <details>
                  <summary>Transcripción</summary>
                  <p>{item.transcripcion}</p>
                </details>
              )}
            </>
          )}
        </div>
      )}
      {error && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </li>
  );
}

export function AdjuntosRechazoVista({
  tarea,
  items,
  compacto = true,
}: {
  tarea: number;
  items?: AdjuntoRechazoItem[];
  compacto?: boolean;
}) {
  if (!items || items.length === 0) return null;
  return (
    <ul className={`${styles.lista} ${compacto ? styles.listaCompacta : ""}`.trim()} aria-label="Adjuntos del rechazo">
      {items.map((a) => (
        <FilaRechazo key={a.id} tarea={tarea} a={a} />
      ))}
    </ul>
  );
}
