"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, Info, Send, X } from "lucide-react";
import { api } from "@/lib/api";
import { ChatAdjunto, ChatMensaje, Perfil } from "@/lib/types";
import { agruparMensajes } from "@/lib/chat-utils";
import { Avatar } from "@/components/ui/Avatar";
import { EquipoBarra } from "@/components/EquipoBarra";
import { AdjuntoVista } from "@/components/chat/AdjuntoVista";
import { GrabadorAudio } from "@/components/chat/GrabadorAudio";
import { MenuAdjuntos, type ArchivoNuevo } from "@/components/chat/MenuAdjuntos";
import adjuntosStyles from "@/components/chat/adjuntos.module.css";
import styles from "./chat.module.css";

interface Pendiente {
  id: string;
  nombre: string;
  estado: "subiendo" | "listo" | "error";
  adjunto?: ChatAdjunto;
}

import { mencionaRIA, transmitirRIA } from "@/lib/ria";
import { MarcaRIA } from "@/components/MarcaRIA";

export default function ChatPage() {
  const router = useRouter();
  const [mensajes, setMensajes] = useState<ChatMensaje[]>([]);
  const [destinoMensaje, setDestinoMensaje] = useState(0);
  const [riaTexto, setRiaTexto] = useState("");
  const [riaActiva, setRiaActiva] = useState(false);
  const [riaError, setRiaError] = useState<{ id: number; texto: string } | null>(null);
  const riaControl = useRef<AbortController | null>(null);
  const [cuerpo, setCuerpo] = useState("");
  const [yo, setYo] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [nuevosMensajes, setNuevosMensajes] = useState(0);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [errorAdjunto, setErrorAdjunto] = useState<string | null>(null);
  const [barraAbierta, setBarraAbierta] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    const destino = () => setDestinoMensaje(Number(new URLSearchParams(location.search).get("mensaje")) || 0);
    destino(); window.addEventListener("hashchange", destino);
    return () => window.removeEventListener("hashchange", destino);
  }, []);
  useEffect(() => {
    if (!destinoMensaje || !yo) return;
    let activo = true;
    api.getChat(undefined, destinoMensaje - 1, 2).then((datos) => {
      const exacto = datos.find((m) => m.id === destinoMensaje);
      if (activo && exacto) setMensajes((prev) => prev.some((m) => m.id === exacto.id) ? prev : [...prev, exacto].sort((a,b) => a.id-b.id));
    }).catch(() => {});
    return () => { activo = false; };
  }, [destinoMensaje, yo]);
  useEffect(() => {
    if (destinoMensaje) document.getElementById(`mensaje-${destinoMensaje}`)?.scrollIntoView({ block: "center" });
  }, [destinoMensaje, mensajes]);

  // Cargar usuario autenticado
  useEffect(() => {
    let activo = true;
    api.getYo()
      .then((p) => {
        if (!activo) return;
        if (p.estado === "pendiente") {
          router.push("/pendiente");
          return;
        }
        setYo(p);
      })
      .catch(() => {
        router.push("/login");
      });
    return () => {
      activo = false;
    };
  }, [router]);

  const ultimoIdRef = useRef<number>(0);

  // Mantener el último ID real registrado para polling con 'despues'
  useEffect(() => {
    if (mensajes.length > 0) {
      const reales = mensajes.filter((m) => !m.enviando && m.id < 1000000000000);
      if (reales.length > 0) {
        const maxId = Math.max(...reales.map((m) => m.id));
        if (maxId > ultimoIdRef.current) {
          ultimoIdRef.current = maxId;
        }
      }
    }
  }, [mensajes]);

  useEffect(() => {
    if (!yo) return;

    let montado = true;
    const cargar = async () => {
      try {
        const datos = await api.getChat(undefined, undefined, 40);
        if (montado) {
          const ordenados = [...datos].reverse();
          setMensajes((prev) => { const exacto = prev.find((m) => m.id === destinoMensaje); return exacto && !ordenados.some((m) => m.id === exacto.id) ? [exacto,...ordenados] : ordenados; });
          setCargando(false);
        }
      } catch {
        if (montado) setCargando(false);
      }
    };
    cargar();

    let pollTimer: NodeJS.Timeout;

    const ejecutarPolling = async () => {
      if (!montado) return;
      try {
        const datos = await api.getChat(undefined, undefined, 40);
        if (montado && datos && Array.isArray(datos)) {
          const ordenados = [...datos].reverse();
          setMensajes((prev) => {
            const exacto = prev.find((m) => m.id === destinoMensaje);
            if (exacto && !ordenados.some((m) => m.id === exacto.id)) ordenados.unshift(exacto);
            if (ordenados.length > prev.length) {
              const diff = ordenados.length - prev.length;
              if (!isNearBottomRef.current) {
                setNuevosMensajes((count) => count + diff);
              }
              return ordenados;
            }
            return ordenados;
          });
        }
      } catch {
        // Ignorar
      } finally {
        if (montado) {
          const delay = typeof document !== "undefined" && document.hidden ? 15000 : 3000;
          pollTimer = setTimeout(ejecutarPolling, delay);
        }
      }
    };

    pollTimer = setTimeout(ejecutarPolling, 3000);

    const onVisibilityChange = () => {
      clearTimeout(pollTimer);
      if (typeof document !== "undefined" && !document.hidden) {
        ejecutarPolling();
      } else {
        pollTimer = setTimeout(ejecutarPolling, 15000);
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      montado = false;
      clearTimeout(pollTimer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
  }, [yo, destinoMensaje]);

  useEffect(() => {
    if (!destinoMensaje && isNearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensajes, destinoMensaje]);

  // Con la hoja del equipo abierta en móvil el fondo no scrollea.
  useEffect(() => {
    if (!barraAbierta) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [barraAbierta]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    isNearBottomRef.current = distanceToBottom < 60;
    if (isNearBottomRef.current) {
      setNuevosMensajes(0);
    }
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setNuevosMensajes(0);
    }
  };

  const subirAdjunto = useCallback(async (clave: string, tarea: Promise<ChatAdjunto>) => {
    try {
      const adjunto = await tarea;
      setPendientes((prev) =>
        prev.map((p) => (p.id === clave ? { ...p, estado: "listo", adjunto } : p)),
      );
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "No se pudo subir el archivo.";
      setErrorAdjunto(mensaje);
      setPendientes((prev) => prev.map((p) => (p.id === clave ? { ...p, estado: "error" } : p)));
    }
  }, []);

  const agregarArchivos = (archivos: ArchivoNuevo[]) => {
    setErrorAdjunto(null);
    for (const { archivo, duracionSeg } of archivos) {
      const clave = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setPendientes((prev) => [...prev, { id: clave, nombre: archivo.name, estado: "subiendo" }]);
      void subirAdjunto(clave, api.postChatAdjunto(archivo, duracionSeg));
    }
  };

  const agregarDrive = (nombre: string, url: string) => {
    setErrorAdjunto(null);
    const clave = `${Date.now()}-drive`;
    setPendientes((prev) => [...prev, { id: clave, nombre: nombre, estado: "subiendo" }]);
    void subirAdjunto(clave, api.postChatAdjuntoDrive(nombre, url));
  };

  useEffect(() => () => riaControl.current?.abort(), []);
  const consultarRIA = async (id: number) => {
    if (riaControl.current) return;
    const c = new AbortController(); riaControl.current = c;
    setRiaActiva(true); setRiaTexto(""); setRiaError(null); setDestinoMensaje(0);
    try {
      const r = await transmitirRIA<ChatMensaje>({ mensaje_id: id }, (s) => setRiaTexto((t) => t + s), c.signal);
      setMensajes((m) => m.some((v) => v.id === r.id) ? m : [...m, r].sort((a,b) => a.id-b.id));
    } catch (e) {
      if (!c.signal.aborted) setRiaError({ id, texto: e instanceof Error ? e.message : "RIA no pudo responder." });
    } finally {
      riaControl.current = null; setRiaActiva(false); setRiaTexto("");
    }
  };
  useEffect(() => {
    if (riaActiva && isNearBottomRef.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [riaActiva, riaTexto]);

  const enviarMensaje = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const texto = cuerpo.trim();
    const listos = pendientes.filter((p) => p.estado === "listo" && p.adjunto).map((p) => p.adjunto as ChatAdjunto);
    if ((!texto && listos.length === 0) || !yo) return;
    if (pendientes.some((p) => p.estado === "subiendo")) {
      setErrorAdjunto("Espera a que terminen de subir los archivos.");
      return;
    }

    // Solo se ejecuta desde eventos de envío; no durante el render.
    // eslint-disable-next-line react-hooks/purity
    const tempID = Date.now();
    const optimista: ChatMensaje = {
      id: tempID,
      autor_id: yo.id,
      cuerpo: texto,
      creado_en: new Date().toISOString(),
      autor: yo,
      adjuntos: listos,
      enviando: true,
    };

    setMensajes((prev) => [...prev, optimista]);
    setCuerpo("");
    setPendientes([]);
    setErrorAdjunto(null);

    try {
      const creado = await api.postChat(texto, listos.map((a) => a.id));
      setMensajes((prev) =>
        [...prev.filter((m) => m.id !== tempID && m.id !== creado.id), creado].sort((a,b) => a.id-b.id),
      );
      isNearBottomRef.current = true;
      if (mencionaRIA(texto)) void consultarRIA(creado.id);
    } catch {
      setMensajes((prev) =>
        prev.map((m) => (m.id === tempID ? { ...m, enviando: false, error: true } : m)),
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensaje();
    }
  };

  const reintentarEnvio = async (id: number, texto: string, adjuntos?: ChatAdjunto[]) => {
    setMensajes((prev) =>
      prev.map((m) => (m.id === id ? { ...m, enviando: true, error: false } : m)),
    );
    try {
      const creado = await api.postChat(texto, (adjuntos ?? []).map((a) => a.id));
      setMensajes((prev) =>
        [...prev.filter((m) => m.id !== id && m.id !== creado.id), creado].sort((a,b) => a.id-b.id),
      );
      if (mencionaRIA(texto)) void consultarRIA(creado.id);
    } catch {
      setMensajes((prev) =>
        prev.map((m) => (m.id === id ? { ...m, enviando: false, error: true } : m)),
      );
    }
  };

  const grupos = agruparMensajes(mensajes, yo?.id || "");
  const hayPendientes = pendientes.length > 0;
  const enviando = pendientes.some((p) => p.estado === "subiendo");

  return (
    <div className={styles.contenedor}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerTexto}>
            <h1 className={styles.headerTitle}>Chat del equipo</h1>
          </div>
          <button
            type="button"
            className={styles.infoBoton}
            onClick={() => setBarraAbierta(true)}
            aria-label="Ver resumen del equipo"
            title="Resumen del equipo"
            aria-controls="barra-equipo"
            aria-expanded={barraAbierta}
          >
            <Info size={16} strokeWidth={1.85} />
          </button>
        </header>

        <div className={styles.messageList} ref={scrollRef} onScroll={handleScroll}>
          {cargando && (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--rc-texto-secundario)" }}>
              Cargando mensajes...
            </div>
          )}

          {grupos.map((grupo) => (
            <div key={`g-${grupo.id}`} style={{ display: "contents" }}>
              {grupo.fecha_separador && (
                <div className={styles.dateSeparator}>
                  <span className={styles.datePill}>{grupo.fecha_separador}</span>
                </div>
              )}

              <div className={`${styles.group} ${grupo.es_mio ? styles.groupMine : ""}`}>
                {grupo.autor_id === "ria" ? <MarcaRIA size={32} /> : <Link href={`/equipo/${grupo.autor_id}`} className={styles.avatarLink}>
                  <Avatar
                    tamano={32}
                    src={grupo.autor_foto || undefined}
                    iniciales={grupo.autor_nombre.charAt(0).toUpperCase()}
                    alt={grupo.autor_nombre}
                  />
                </Link>}

                <div className={styles.groupContent}>
                  <div className={styles.groupHeader}>
                    {grupo.autor_id === "ria" ? <strong className={styles.authorName}>RIA</strong> : <Link href={`/equipo/${grupo.autor_id}`} className={styles.authorName}>
                      {grupo.autor_nombre}
                    </Link>}

                    {grupo.autor_roles.map((rol) => (
                      <span
                        key={rol.id}
                        className={styles.roleChip}
                        style={{ color: rol.color, borderColor: rol.color }}
                      >
                        {rol.nombre}
                      </span>
                    ))}
                    <span className={styles.time}>{grupo.lineas[0]?.hora}</span>
                  </div>

                  <div className={styles.bubbles}>
                    {grupo.lineas.map((linea) => {
                      const tieneAdjuntos = (linea.adjuntos?.length ?? 0) > 0;
                      return (
                        <div
                          key={`l-${linea.id}`}
                          id={`mensaje-${linea.id}`}
                          style={linea.id === destinoMensaje ? { outline: "2px solid var(--rc-azul-texto)" } : undefined}
                          className={`${styles.bubble} ${grupo.es_mio ? styles.bubbleMine : ""} ${
                            tieneAdjuntos ? styles.bubbleConAdjuntos : ""
                          } ${linea.enviando ? styles.bubbleSending : ""} ${linea.error ? styles.bubbleError : ""}`}
                        >
                          {linea.cuerpo ? <p className={styles.bubbleTexto}>{linea.cuerpo}</p> : null}
                          {tieneAdjuntos && (
                            <div className={styles.adjuntosLista}>
                              {linea.adjuntos?.map((adjunto) => (
                                <AdjuntoVista key={adjunto.id} adjunto={adjunto} propio={grupo.es_mio} />
                              ))}
                            </div>
                          )}

                          {linea.error && (
                            <div className={styles.bubbleFooter}>
                              <span>Error de envío</span>
                              <button
                                type="button"
                                className={styles.retryBtn}
                                onClick={() => reintentarEnvio(linea.id, linea.cuerpo, linea.adjuntos)}
                              >
                                Reintentar
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {riaActiva && <div className={`${styles.group} ${styles.riaEntrada}`}>
            <MarcaRIA size={32} />
            <div className={styles.groupContent}><strong className={styles.authorName}>RIA</strong><div className={styles.bubble}>
              {riaTexto && <p className={styles.bubbleTexto}>{riaTexto}</p>}
              <span className={styles.riaEscribiendo} role="status">RIA está escribiendo…</span>
            </div></div>
          </div>}
          {riaError && <p role="alert">{riaError.texto} <button type="button" className={styles.retryBtn} onClick={() => void consultarRIA(riaError.id)}>Reintentar</button></p>}

        </div>

        {nuevosMensajes > 0 && (
          <button type="button" className={styles.newMsgNotice} onClick={scrollToBottom}>
            <ArrowDown size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
            {nuevosMensajes} {nuevosMensajes === 1 ? "mensaje nuevo" : "mensajes nuevos"}
          </button>
        )}

        <div className={styles.composerWrapper}>
          {hayPendientes && (
            <div className={adjuntosStyles.pendientes}>
              {pendientes.map((p) => (
                <span
                  key={p.id}
                  className={`${adjuntosStyles.pendiente} ${p.estado === "error" ? adjuntosStyles.pendienteError : ""}`}
                  title={p.nombre}
                >
                  <span className={adjuntosStyles.pendienteNombre}>{p.nombre}</span>
                  {p.estado === "subiendo" && <span className={adjuntosStyles.pendienteEstado}>subiendo…</span>}
                  {p.estado === "error" && <span className={adjuntosStyles.pendienteEstado}>error</span>}
                  <button
                    type="button"
                    className={adjuntosStyles.pendienteQuitar}
                    aria-label={`Quitar ${p.nombre}`}
                    onClick={() => setPendientes((prev) => prev.filter((x) => x.id !== p.id))}
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {errorAdjunto && (
            <p className={styles.errorAdjunto} role="alert">
              {errorAdjunto}
              <button type="button" className={styles.errorCerrar} onClick={() => setErrorAdjunto(null)} aria-label="Cerrar aviso">
                <X size={12} strokeWidth={2} />
              </button>
            </p>
          )}

          <form className={styles.composer} data-rc-compositor onSubmit={enviarMensaje}>
            <MenuAdjuntos
              onArchivos={agregarArchivos}
              onDrive={agregarDrive}
              onError={(m) => setErrorAdjunto(m)}
            />
            <div className={styles.composerCaja}>
              <textarea
                className={styles.textarea}
                rows={1}
                placeholder="Escribe al equipo..."
                aria-label="Escribe al equipo"
                title="Enter para enviar, Shift+Enter para salto de línea"
                value={cuerpo}
                onChange={(e) => setCuerpo(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <GrabadorAudio
              onGrabado={(archivo, duracion) => agregarArchivos([{ archivo, duracionSeg: duracion }])}
              onError={(m) => setErrorAdjunto(m)}
              deshabilitado={enviando}
            />
            <div className="rc-escena-vidrio">
              <span className="rc-mancha rc-mancha--azul" aria-hidden="true" />
              <button
                type="submit"
                disabled={(!cuerpo.trim() && !pendientes.some((p) => p.estado === "listo")) || enviando}
                className="rc-btn-enviar rc-vidrio rc-vidrio--azul"
                 data-rc-compositor-boton
                aria-label="Enviar mensaje"
                style={{
                  width: "34px",
                  height: "34px",
                  cursor: cuerpo.trim() || hayPendientes ? "pointer" : "default",
                }}
              >
                <Send size={15} strokeWidth={1.75} color="var(--rc-azul-texto)" />
              </button>
            </div>
          </form>
          <span className={styles.composerHint} data-rc-compositor-ayuda>
            Enter envía · Shift+Enter baja de línea · El micrófono graba un audio
          </span>
        </div>
      </div>

      <EquipoBarra abierta={barraAbierta} onCerrar={() => setBarraAbierta(false)} />
    </div>
  );
}
