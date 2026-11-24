"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Download, Film, ImageIcon, Mic, Music2, Paperclip, Square, Trash2 } from "lucide-react";
import { Boton } from "@/components/ui/Boton";
import { aceptarAdjuntos, adjuntos, limiteAdjunto, tipoDeArchivo, type AdjuntoAsignacion, type AdjuntoLocal, type TipoAdjunto } from "@/lib/adjuntos-asignacion";
import styles from "./AdjuntosAsignacion.module.css";

const textoError = (e: unknown) => e instanceof Error ? e.message : "No se pudo completar la acción.";
const mb = 1024 * 1024;
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

function BotonResumen({ activo, onClick, bloqueado }: { activo: boolean; onClick: () => void; bloqueado?: boolean }) {
  return <Boton variante="secundario" tamano="sm" role="switch" aria-checked={activo} disabled={bloqueado} onClick={onClick}>{activo && <Check size={15} aria-hidden="true" />}Resumir con IA</Boton>;
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
    </div></div> : <Boton variante="fantasma" tamano="sm" ref={boton} disabled={bloqueado} aria-label={`Quitar ${nombre}`} onClick={() => setConfirmar(true)}><Trash2 size={15} aria-hidden="true" /> Quitar</Boton>;
}

function FilaLocal({ a, cambiar, quitar, bloqueado }: { a: AdjuntoLocal; cambiar: (a: AdjuntoLocal) => void; quitar: () => void; bloqueado: boolean }) {
  const [url, setUrl] = useState("");
  const { archivo } = a;
  useEffect(() => {
    const objeto = URL.createObjectURL(archivo);
    // El URL del archivo solo existe mientras esta fila está montada.
    const t = setTimeout(() => setUrl(objeto), 0);
    return () => { clearTimeout(t); URL.revokeObjectURL(objeto); };
  }, [archivo]);
  return <li>
    <strong className={styles.nombre}>{archivo.name}</strong>
    <Medio tipo={a.tipo} url={url} nombre={archivo.name} duracion={d => { if (!bloqueado && a.duracion === undefined) cambiar({ ...a, duracion: d }); }} />
    {a.avance !== undefined && <><progress className={styles.progreso} aria-label={`Subida de ${archivo.name}`} max={100} value={a.avance} /><span className={styles.ayuda}>{a.avance === 95 && bloqueado ? "Guardando archivo…" : `${a.avance}%`}</span></>}
    {a.error && <span className={styles.error} role="alert">{a.error}</span>}
    <div className={styles.acciones}>
      {a.tipo === "audio" && <BotonResumen activo={a.resumir} bloqueado={bloqueado} onClick={() => cambiar({ ...a, resumir: !a.resumir })} />}
      <Quitar nombre={archivo.name} onQuitar={quitar} bloqueado={bloqueado} />
    </div>
  </li>;
}

export function EditorAdjuntos({ locales, cambiar, quitar, cantidad, bloqueado, onGrabando }: { locales: AdjuntoLocal[]; cambiar: (actualizar: (lista: AdjuntoLocal[]) => AdjuntoLocal[]) => void; quitar: (a: AdjuntoLocal) => void; cantidad: number; bloqueado: boolean; onGrabando: (v: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const grabacion = useRef<{ r: MediaRecorder; s: MediaStream; viva: boolean } | null>(null);
  const vivo = useRef(false);
  const [soporta, setSoporta] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [error, setError] = useState("");
  const titulo = useId();
  useEffect(() => {
    vivo.current = true;
    const t = setTimeout(() => setSoporta(typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia), 0);
    return () => { vivo.current = false; clearTimeout(t); const g = grabacion.current; if (g) { g.viva = false; if (g.r.state !== "inactive") g.r.stop(); g.s.getTracks().forEach(p => p.stop()); } };
  }, []);

  function agregar(archivos: File[], duracion?: number) {
    const lote: AdjuntoLocal[] = []; const problemas: string[] = [];
    for (const archivo of archivos) {
      if (cantidad + lote.length >= 10) { problemas.push("Máximo 10 adjuntos."); break; }
      const tipo = tipoDeArchivo(archivo);
      if (!tipo) { problemas.push("Hay un formato no compatible."); continue; }
      if (!archivo.size || archivo.size > limiteAdjunto[tipo] * mb) { problemas.push(`El archivo debe pesar entre 1 byte y ${limiteAdjunto[tipo]} MB.`); continue; }
      lote.push({ id: crypto.randomUUID(), archivo, tipo, resumir: false, duracion });
    }
    setError([...new Set(problemas)].join(" ")); if (lote.length) cambiar(v => [...v, ...lote]);
  }

  async function grabar() {
    setError(""); setGrabando(true); onGrabando(true);
    let salida: MediaStream | undefined;
    try {
      salida = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!vivo.current) { salida.getTracks().forEach(p => p.stop()); return; }
      const s = salida;
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(v => MediaRecorder.isTypeSupported(v));
      if (!mime) throw new Error("formato");
      const r = new MediaRecorder(s, { mimeType: mime });
      const g = { r, s, viva: true }; grabacion.current = g;
      const bloques: Blob[] = []; let bytes = 0; const inicio = performance.now();
      r.ondataavailable = e => { if (!e.data.size) return; bloques.push(e.data); bytes += e.data.size; if (bytes > 25 * mb && r.state !== "inactive") r.stop(); };
      r.onerror = () => { g.viva = false; if (r.state !== "inactive") r.stop(); s.getTracks().forEach(p => p.stop()); if (vivo.current) { setError("No se pudo grabar el audio."); setGrabando(false); onGrabando(false); } };
      r.onstop = () => {
        s.getTracks().forEach(p => p.stop()); grabacion.current = null;
        if (!vivo.current) return;
        if (g.viva) { const tipo = (r.mimeType || mime).split(";")[0]; const ext = tipo === "audio/mp4" ? "m4a" : tipo === "audio/ogg" ? "ogg" : "webm";
          agregar([new File(bloques, `Grabación-${new Date().toISOString().slice(11, 19).replaceAll(":", "-")}.${ext}`, { type: tipo })], Math.round(performance.now() - inicio)); }
        setGrabando(false); onGrabando(false);
      };
      r.start(500);
    } catch { salida?.getTracks().forEach(p => p.stop()); if (vivo.current) { setError("No pudimos usar el micrófono."); setGrabando(false); onGrabando(false); } }
  }

  return <section className={styles.seccion} aria-labelledby={titulo}>
    <div className={styles.cabecera}><h3 id={titulo}>Adjuntos</h3><div className={styles.acciones}>
      <input ref={input} hidden type="file" multiple accept={aceptarAdjuntos} onChange={e => { agregar(Array.from(e.currentTarget.files ?? [])); e.currentTarget.value = ""; }} />
      <Boton variante="secundario" tamano="sm" disabled={bloqueado || grabando || cantidad >= 10} onClick={() => input.current?.click()}><Paperclip size={16} aria-hidden="true" /> Adjuntar</Boton>
      {soporta && (grabando ? <Boton variante="secundario" tamano="sm" onClick={() => { const r = grabacion.current?.r; if (r?.state === "recording") r.stop(); }}><Square size={15} aria-hidden="true" /> Detener</Boton> :
        <Boton variante="fantasma" tamano="sm" disabled={bloqueado || cantidad >= 10} onClick={() => void grabar()}><Mic size={16} aria-hidden="true" /> Grabar audio</Boton>)}
    </div></div>
    <span className={styles.ayuda}>{cantidad}/10 · Imagen 10 MB · Video 50 MB · Audio 25 MB</span>
    {grabando && <span role="status" className={styles.ayuda}>Grabando audio…</span>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {locales.length > 0 && <ul className={styles.lista}>{locales.map(a => <FilaLocal key={a.id} a={a} bloqueado={bloqueado || grabando} quitar={() => quitar(a)} cambiar={b => cambiar(v => v.map(x => x.id === b.id ? b : x))} />)}</ul>}
  </section>;
}

function FilaGuardada({ tarea, a, editable, bloqueado, actualizar }: { tarea: number; a: AdjuntoAsignacion; editable: boolean; bloqueado: boolean; actualizar: (id: string, v?: AdjuntoAsignacion) => void }) {
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
  return <li>
    <strong className={styles.nombre}>{a.nombre}</strong>
    <Medio key={medio?.url} tipo={a.tipo} url={medio?.url ?? ""} nombre={a.nombre} visor renovar={renovar} />
    <div className={styles.acciones}>
      <Boton variante="secundario" tamano="sm" aria-label={`Descargar ${a.nombre}`} disabled={ocupado} onClick={() => void accion(descargar)}><Download size={15} aria-hidden="true" /> Descargar</Boton>
      {editable && a.tipo === "audio" && <BotonResumen activo={a.resumir} bloqueado={ocupado || bloqueado} onClick={() => void accion(async () => actualizar(id, await adjuntos.resumir(tarea, id, !a.resumir)))} />}
      {editable && <Quitar nombre={a.nombre} bloqueado={ocupado || bloqueado} onQuitar={() => void accion(async () => { await adjuntos.quitar(tarea, id); actualizar(id); })} />}
    </div>
    {a.resumir && <div className={styles.resumen}>
      <strong role="status">{estado === "listo" ? "Listo" : estado === "fallido" ? "No se pudo" : "Resumiendo…"}</strong>
      {estado === "fallido" && <div className={styles.acciones}><Boton variante="secundario" tamano="sm" disabled={ocupado} onClick={() => void accion(async () => actualizar(id, await adjuntos.reintentar(tarea, id)))}>Reintentar</Boton></div>}
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
  const titulo = useId();
  const pendiente = lista?.some(a => a.estado_resumen === "pendiente" || a.estado_resumen === "procesando") ?? false;
  useEffect(() => {
    let vivo = true;
    const traer = () => adjuntos.listar(tarea).then(r => { if (vivo) { setLista(r); cantidad?.(r.length); setError(false); } }).catch(() => { if (vivo) setError(true); });
    void traer();
    const t = pendiente ? setInterval(() => { if (!document.hidden) void traer(); }, 5000) : undefined;
    return () => { vivo = false; clearInterval(t); };
  }, [tarea, cantidad, pendiente, intento]);
  function actualizar(id: string, v?: AdjuntoAsignacion) {
    setLista(l => (l ?? []).flatMap(a => a.id === id ? v ? [v] : [] : [a]));
    setIntento(i => i + 1);
    if (!v && lista) cantidad?.(lista.length - 1);
  }
  if (lista?.length === 0 && !error) return null;
  return <section className={styles.seccion} aria-labelledby={titulo}>
    <div className={styles.cabecera}><h3 id={titulo}>{editable ? "Adjuntos guardados" : "Adjuntos"}</h3></div>
    {!lista && !error && <span className={styles.ayuda} role="status">Cargando adjuntos…</span>}
    {error && <div className={styles.acciones}><span className={styles.error} role="alert">No se pudieron cargar los adjuntos.</span><Boton variante="secundario" tamano="sm" onClick={() => setIntento(i => i + 1)}>Reintentar</Boton></div>}
    {!!lista?.length && <ul className={styles.lista}>{lista.map(a => <FilaGuardada key={a.id} tarea={tarea} a={a} editable={editable} bloqueado={bloqueado} actualizar={actualizar} />)}</ul>}
  </section>;
}
