"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, Info, Send, X } from "lucide-react";
import { api } from "@/lib/api";
import type { ChatAdjunto, ChatMensaje, Perfil, SolicitudRIAPublica } from "@/lib/types";
import { agruparMensajes } from "@/lib/chat-utils";
import { Avatar } from "@/components/ui/Avatar";
import { useAviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/Boton";
import { Modal } from "@/components/ui/Modal";
import { EquipoBarra } from "@/components/EquipoBarra";
import { useCambiosSinGuardar } from "@/components/CambiosSinGuardar";
import { AdjuntoVista } from "@/components/chat/AdjuntoVista";
import { RespuestaRIA } from "@/components/RespuestaRIA";
import { GrabadorAudio } from "@/components/chat/GrabadorAudio";
import { MenuAdjuntos, type ArchivoNuevo } from "@/components/chat/MenuAdjuntos";
import {
  AccionesMensaje,
  BarraDeshacer,
  EditorMensaje,
  MarcaEditado,
  copiarTextoSeguro,
} from "@/components/chat/AccionesMensaje";
import adjuntosStyles from "@/components/chat/adjuntos.module.css";
import styles from "./chat.module.css";

interface Pendiente {
  id: string;
  nombre: string;
  estado: "subiendo" | "listo" | "error";
  adjunto?: ChatAdjunto;
  urlDrive?: string;
}

import { normalizarUrlEnlace } from "@/lib/drive-equipo";
import {
  LIMITE_COMANDO_RIA_PUBLICO,
  combinarMensajesChat,
  comandosEquipo,
  esComandoAyuda,
  opcionesComandosEquipo,
  esComposicionIME,
  guardarSolicitudRIAPublica,
  leerComandoRIAPublico,
  recuperarSolicitudRIAPublica,
  transmitirRIAPublica,
} from "@/lib/ria";
import { MarcaRIA } from "@/components/MarcaRIA";
import { EntradaComandos, TextoComandos, useComandosChat, useComandosEquipo, useGlassChat } from "@/components/ComandosChat";
import { rutasVisiblesRIA } from "@/lib/rutas-ria";

function almacenamientoRIA() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export default function ChatPage() {
  const router = useRouter();
  const { mostrarAviso } = useAviso();
  const [mensajes, setMensajes] = useState<ChatMensaje[]>([]);
  const [destinoMensaje, setDestinoMensaje] = useState(0);
  const [riaPendiente, setRiaPendiente] = useState<SolicitudRIAPublica | null>(null);
  const [riaActiva, setRiaActiva] = useState(false);
  const [riaError, setRiaError] = useState<string | null>(null);
  const [ayudaComandos, setAyudaComandos] = useState(false);
  const [avisoRIA, setAvisoRIA] = useState<string | null>(null);
  const riaControl = useRef<AbortController | null>(null);
  const revisionChat = useRef(0);
  const recibidosRIA = useRef(new Map<number, { mensaje: ChatMensaje; revision: number }>());
  const destinoRef = useRef(0);
  const [cuerpo, setCuerpo] = useState("");
  const [yo, setYo] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [nuevosMensajes, setNuevosMensajes] = useState(0);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [errorAdjunto, setErrorAdjunto] = useState<string | null>(null);
  const [barraAbierta, setBarraAbierta] = useState(false);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState<{ id: number; resumen: string } | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [deshacerId, setDeshacerId] = useState<number | null>(null);
  const [restaurando, setRestaurando] = useState(false);
  const deshacerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useCambiosSinGuardar(
    editandoId !== null ||
      pendientes.length > 0 ||
      (cuerpo.trim() !== "" && !cuerpo.trim().startsWith("/")),
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    return () => {
      if (deshacerTimerRef.current) clearTimeout(deshacerTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const destino = () => {
      destinoRef.current = Number(new URLSearchParams(location.search).get("mensaje")) || 0;
      setDestinoMensaje(destinoRef.current);
    };
    destino(); window.addEventListener("hashchange", destino);
    return () => window.removeEventListener("hashchange", destino);
  }, []);
  useEffect(() => {
    if (!destinoMensaje || !yo) return;
    let activo = true;
    api.getChat(undefined, destinoMensaje - 1, 2).then((datos) => {
      const exacto = datos.find((m) => m.id === destinoMensaje);
      if (activo && exacto) setMensajes((prev) => combinarMensajesChat(prev, [exacto]));
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
        setRiaPendiente(recuperarSolicitudRIAPublica(almacenamientoRIA(), p.id));
        setYo(p);
      })
      .catch(() => {
        if (activo) router.push("/login");
      });
    return () => {
      activo = false;
    };
  }, [router]);

  useEffect(() => {
    if (!yo) return;

    let montado = true;
    let consultando = false;
    let ultimoIdVisto: number | undefined;
    let pollTimer: ReturnType<typeof setTimeout>;

    const ejecutarPolling = async () => {
      if (!montado || consultando) return;
      consultando = true;
      const revisionAlIniciar = revisionChat.current;
      try {
        const datos = await api.getChat(undefined, undefined, 40);
        if (!montado || !Array.isArray(datos)) return;
        const ids = new Set(datos.map((m) => m.id));
        const retenidos: ChatMensaje[] = [];
        for (const [id, entrada] of recibidosRIA.current) {
          if (ids.has(id) || entrada.revision <= revisionAlIniciar) {
            recibidosRIA.current.delete(id);
          } else {
            // Un GET iniciado antes del SSE puede traer una lista que aún no lo incluye.
            retenidos.push(entrada.mensaje);
          }
        }
        const destino = destinoRef.current;
        setMensajes((prev) => combinarMensajesChat(datos, [
          ...retenidos,
          ...prev.filter((m) => m.enviando || m.error || m.id === destino),
        ]));
        if (ultimoIdVisto !== undefined && !isNearBottomRef.current) {
          const anterior = ultimoIdVisto;
          const nuevos = [...ids].filter((id) => id > anterior).length;
          if (nuevos) setNuevosMensajes((count) => count + nuevos);
        }
        ultimoIdVisto = Math.max(ultimoIdVisto ?? 0, ...ids);
      } catch {
        // Mantener el chat visible y seguir consultando.
      } finally {
        consultando = false;
        if (montado) {
          setCargando(false);
          pollTimer = setTimeout(ejecutarPolling, document.hidden ? 15000 : 3000);
        }
      }
    };

    void ejecutarPolling();
    const onVisibilityChange = () => {
      clearTimeout(pollTimer);
      if (consultando) return;
      if (document.hidden) pollTimer = setTimeout(ejecutarPolling, 15000);
      else void ejecutarPolling();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      montado = false;
      clearTimeout(pollTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [yo]);

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
    const claveUrl = normalizarUrlEnlace(url);
    const yaExiste = pendientes.some(
      (p) =>
        p.estado !== "error" &&
        ((p.urlDrive && p.urlDrive === claveUrl) ||
          (p.adjunto?.tipo === "drive" && p.adjunto.url_externa && normalizarUrlEnlace(p.adjunto.url_externa) === claveUrl)),
    );
    if (yaExiste) {
      setErrorAdjunto("Esa carpeta ya está adjunta en el borrador.");
      return;
    }
    const clave = `${Date.now()}-drive`;
    setPendientes((prev) => [...prev, { id: clave, nombre: nombre, estado: "subiendo", urlDrive: claveUrl }]);
    void subirAdjunto(clave, api.postChatAdjuntoDrive(nombre, url));
  };

  useEffect(() => () => riaControl.current?.abort(), []);

  function agregarMensajeRIA(mensaje: ChatMensaje) {
    // Del polling se prefiere la versión ya visible (puede tener una edición posterior).
    recibidosRIA.current.set(mensaje.id, { mensaje, revision: ++revisionChat.current });
    setMensajes((prev) => combinarMensajesChat(prev, [mensaje]));
  }

  const consultarRIA = async (solicitud: SolicitudRIAPublica) => {
    if (!yo || riaControl.current) return;
    const c = new AbortController();
    riaControl.current = c;
    setRiaActiva(true);
    setRiaError(null);
    setAvisoRIA(null);
    setRiaPendiente(solicitud);
    guardarSolicitudRIAPublica(almacenamientoRIA(), yo.id, solicitud);
    destinoRef.current = 0;
    setDestinoMensaje(0);
    try {
      const fin = await transmitirRIAPublica(solicitud, yo.id, (consulta) => {
        if (!c.signal.aborted) agregarMensajeRIA(consulta);
      }, c.signal);
      if (!c.signal.aborted) {
        agregarMensajeRIA(fin);
        guardarSolicitudRIAPublica(almacenamientoRIA(), yo.id, null);
        setRiaPendiente(null);
      }
    } catch (e) {
      if (!c.signal.aborted) setRiaError(e instanceof Error ? e.message : "RIA no pudo responder.");
    } finally {
      if (riaControl.current === c) riaControl.current = null;
      if (!c.signal.aborted) setRiaActiva(false);
    }
  };

  const descartarRIA = () => {
    if (!yo || riaControl.current) return;
    guardarSolicitudRIAPublica(almacenamientoRIA(), yo.id, null);
    setRiaPendiente(null);
    setRiaError(null);
    setAvisoRIA(null);
  };

  const mostrarAyudaComandos = () => {
    setCuerpo("");
    setAvisoRIA(null);
    setAyudaComandos(true);
  };

  const enviarMensaje = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const texto = cuerpo.trim();
    const listos = pendientes.filter((p) => p.estado === "listo" && p.adjunto).map((p) => p.adjunto as ChatAdjunto);
    if ((!texto && listos.length === 0) || !yo) return;
    if (esComandoAyuda(texto)) {
      mostrarAyudaComandos();
      return;
    }
    const comando = leerComandoRIAPublico(texto);
    if (comando !== null) {
      if (comando === "") {
        setAvisoRIA("Escribe tu pregunta después de /ria.");
      } else if (pendientes.length) {
        setAvisoRIA("Quita los adjuntos antes de enviar una consulta a RIA.");
      } else if ([...comando].length > LIMITE_COMANDO_RIA_PUBLICO) {
        setAvisoRIA(`El comando completo no puede superar ${LIMITE_COMANDO_RIA_PUBLICO} caracteres.`);
      } else if (riaControl.current) {
        return;
      } else if (riaPendiente) {
        setAvisoRIA("Reintenta o descarta la consulta pendiente antes de iniciar otra.");
      } else {
        setCuerpo("");
        setErrorAdjunto(null);
        void consultarRIA({ solicitud_id: crypto.randomUUID(), comando });
      }
      return;
    }

    if (pendientes.some((p) => p.estado === "subiendo")) {
      setErrorAdjunto("Espera a que terminen de subir los archivos.");
      return;
    }

    // Solo se ejecuta desde eventos de envío; no durante el render.
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
    } catch {
      setMensajes((prev) =>
        prev.map((m) => (m.id === tempID ? { ...m, enviando: false, error: true } : m)),
      );
    }
  };

  const glass = useGlassChat();
  const rutas = rutasVisiblesRIA(yo);
  const rutasMenu = rutas.filter((ruta) => ruta.href !== "/ria");
  const comandoRIA = leerComandoRIAPublico(cuerpo);
  const usarComandosEquipo = opcionesComandosEquipo(cuerpo).length > 0 || !glass;
  const equipo = useComandosEquipo(cuerpo, usarComandosEquipo, nombre => {
    if (nombre === "/help") mostrarAyudaComandos();
    else { setCuerpo("/ria "); setAyudaComandos(false); setAvisoRIA(null); }
  });
  const secciones = useComandosChat(cuerpo, rutasMenu, glass && !usarComandosEquipo && rutasMenu.length > 0 && comandoRIA === null, () => setCuerpo(""));
  const comandos = usarComandosEquipo ? equipo : secciones;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (esComposicionIME(e.nativeEvent) || comandos.teclado(e)) return;
    if (e.key === "Escape" && ayudaComandos) {
      e.preventDefault();
      setAyudaComandos(false);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void enviarMensaje();
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
    } catch {
      setMensajes((prev) =>
        prev.map((m) => (m.id === id ? { ...m, enviando: false, error: true } : m)),
      );
    }
  };

  const copiarMensaje = async (texto: string) => {
    const ok = await copiarTextoSeguro(texto);
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
      const actualizado = await api.patchChatMensaje(id, nuevoTexto);
      setMensajes((prev) => prev.map((m) => (m.id === id ? { ...m, ...actualizado } : m)));
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
      await api.deleteChatMensaje(id);
      recibidosRIA.current.delete(id);
      setMensajes((prev) => prev.filter((m) => m.id !== id));
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
      const restaurado = await api.restaurarChatMensaje(deshacerId);
      setMensajes((prev) =>
        prev.some((m) => m.id === restaurado.id)
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
                {grupo.autor_id === "ria" ? <Link href="/ria" className={styles.avatarLink} aria-label="Abrir conversación privada con RIA"><MarcaRIA size={32} /></Link> : <Link href={`/equipo/${grupo.autor_id}`} className={styles.avatarLink}>
                  <Avatar
                    tamano={32}
                    src={grupo.autor_foto || undefined}
                    iniciales={grupo.autor_nombre.charAt(0).toUpperCase()}
                    alt={grupo.autor_nombre}
                  />
                </Link>}

                <div className={`${styles.groupContent} ${grupo.autor_id === "ria" ? styles.groupContentRIA : ""}`}>
                  <div className={styles.groupHeader}>
                    {grupo.autor_id === "ria" ? <Link href="/ria" className={styles.authorName} aria-label="RIA: abrir conversación privada">RIA</Link> : <Link href={`/equipo/${grupo.autor_id}`} className={styles.authorName}>
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
                      const esPersistido = !linea.enviando && !linea.error && linea.id > 0 && linea.id < 1000000000000;
                      const esRia = Boolean(linea.es_ria) || grupo.autor_id === "ria";
                      const textoCopiar =
                        linea.cuerpo.trim() ||
                        linea.adjuntos?.find((a) => a.tipo === "drive" && a.url_externa)?.url_externa ||
                        "";
                      const puedeCopiar = esPersistido && Boolean(esRia ? linea.cuerpo.trim() : textoCopiar);
                      const puedeEditar = esPersistido && grupo.es_mio && !esRia;
                      const puedeEliminar = esPersistido && ((grupo.es_mio && !esRia) || Boolean(yo?.es_admin));
                      const estaEditando = editandoId === linea.id;

                      return (
                        <AccionesMensaje
                          key={`l-${linea.id}`}
                          propio={grupo.es_mio}
                          resumen={textoCopiar || "Mensaje con adjunto"}
                          puedeCopiar={puedeCopiar}
                          puedeEditar={puedeEditar}
                          puedeEliminar={puedeEliminar}
                          editando={estaEditando}
                          copiarRIA={esRia}
                          onCopiar={esRia ? undefined : () => void copiarMensaje(textoCopiar)}
                          onEditar={() => {
                            setErrorEdicion(null);
                            setEditandoId(linea.id);
                          }}
                          onEliminar={() =>
                            setConfirmarEliminar({
                              id: linea.id,
                              resumen: textoCopiar || "Mensaje con adjunto",
                            })
                          }
                        >
                          <div
                            id={`mensaje-${linea.id}`}
                            style={linea.id === destinoMensaje ? { outline: "2px solid var(--rc-azul-texto)" } : undefined}
                            className={`${styles.bubble} ${grupo.es_mio ? styles.bubbleMine : ""} ${
                              tieneAdjuntos ? styles.bubbleConAdjuntos : ""
                            } ${linea.enviando ? styles.bubbleSending : ""} ${linea.error ? styles.bubbleError : ""}`}
                          >
                            {estaEditando ? (
                              <EditorMensaje
                                valorInicial={linea.cuerpo}
                                permitirVacio={tieneAdjuntos}
                                guardando={guardandoEdicion}
                                error={errorEdicion}
                                onGuardar={(nuevo) => void guardarEdicion(linea.id, nuevo)}
                                onCancelar={() => {
                                  setEditandoId(null);
                                  setErrorEdicion(null);
                                }}
                              />
                            ) : (
                              <>
                                {linea.cuerpo ? esRia ? (
                                  <RespuestaRIA texto={linea.cuerpo} grupo />
                                ) : (
                                  <p className={styles.bubbleTexto}>
                                    {glass && leerComandoRIAPublico(linea.cuerpo) === null
                                      ? <TextoComandos texto={linea.cuerpo} rutas={rutas} />
                                      : linea.cuerpo}
                                  </p>
                                ) : null}
                                {tieneAdjuntos && (
                                  <div className={styles.adjuntosLista}>
                                    {linea.adjuntos?.map((adjunto) => (
                                      <AdjuntoVista key={adjunto.id} adjunto={adjunto} propio={grupo.es_mio} />
                                    ))}
                                  </div>
                                )}
                                <MarcaEditado fecha={linea.editado_en} />
                              </>
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
                        </AccionesMensaje>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}

        </div>

        {nuevosMensajes > 0 && (
          <button type="button" className={styles.newMsgNotice} onClick={scrollToBottom}>
            <ArrowDown size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
            {nuevosMensajes} {nuevosMensajes === 1 ? "mensaje nuevo" : "mensajes nuevos"}
          </button>
        )}

        <div className={styles.composerWrapper}>
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
                    onClick={() => { setPendientes((prev) => prev.filter((x) => x.id !== p.id)); setAvisoRIA(null); }}
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

          {riaActiva ? (
            <p className={styles.riaAviso} role="status">RIA está preparando una respuesta para el equipo…</p>
          ) : riaPendiente && (
            <div className={styles.riaAviso}>
              <p className={styles.riaAvisoTexto} role={riaError ? "alert" : "status"}>
                {riaError ?? "Tienes una consulta pendiente en el chat del equipo."}
              </p>
              <div className={styles.riaAcciones}>
                <button type="button" className={styles.retryBtn} onClick={() => void consultarRIA(riaPendiente)}>Reintentar consulta</button>
                <button type="button" className={styles.retryBtn} onClick={descartarRIA}>Descartar reintento</button>
              </div>
            </div>
          )}

          {(avisoRIA || comandoRIA !== null) && (
            <p id="ayuda-ria-publica" className={styles.riaAviso} role={avisoRIA ? "alert" : "status"}>
              {avisoRIA ?? (comandoRIA
                ? "La pregunta y la respuesta se publicarán en el chat del equipo. No incluyas datos privados."
                : "Escribe tu pregunta después de /ria. Ejemplo: /ria ¿Cómo entrego un trabajo?")}
            </p>
          )}

          {ayudaComandos && <section className={styles.ayudaComandos} aria-label="Ayuda de comandos">
            <div className={styles.ayudaCabecera}>
              <strong role="status">Comandos del chat · Solo tú ves esta ayuda</strong>
              <button type="button" aria-label="Cerrar ayuda de comandos" onClick={() => setAyudaComandos(false)}><X size={16} /></button>
            </div>
            <ul>{comandosEquipo.map(c => <li key={c.nombre}><code>{c.ejemplo}</code><span>{c.descripcion}</span></li>)}</ul>
          </section>}
          <form className={styles.composer} data-rc-compositor onSubmit={enviarMensaje}>
             {comandos.menu}
            <MenuAdjuntos
              onArchivos={agregarArchivos}
              onDrive={agregarDrive}
              onError={(m) => setErrorAdjunto(m)}
              esAdmin={Boolean(yo?.es_admin)}
              deshabilitado={comandoRIA !== null}
            />
            <div className={styles.composerCaja}>
              <EntradaComandos
                className={styles.textarea}
                rows={1}
                placeholder="Escribe al equipo..."
                aria-label="Escribe al equipo"
                title="Enter para enviar, Shift+Enter para salto de línea"
                texto={cuerpo} rutas={rutasMenu} glass={glass} autoAltura {...comandos.propsEntrada}
                 onFocus={() => { equipo.propsEntrada.onFocus(); secciones.propsEntrada.onFocus(); }}
                 onBlur={() => { equipo.propsEntrada.onBlur(); secciones.propsEntrada.onBlur(); }}
                 onCompositionStart={() => { equipo.propsEntrada.onCompositionStart(); secciones.propsEntrada.onCompositionStart(); }}
                 onCompositionEnd={() => { equipo.propsEntrada.onCompositionEnd(); secciones.propsEntrada.onCompositionEnd(); }}
                aria-describedby={avisoRIA || comandoRIA !== null ? "ayuda-ria-publica" : undefined}
                onChange={e => { setCuerpo(e.currentTarget.value); setAvisoRIA(null); equipo.editar(); secciones.editar(); }}
                onKeyDown={handleKeyDown}
              />
            </div>
            <GrabadorAudio
              onGrabado={(archivo, duracion) => agregarArchivos([{ archivo, duracionSeg: duracion }])}
              onError={(m) => setErrorAdjunto(m)}
              deshabilitado={enviando || comandoRIA !== null}
            />
            <div className="rc-escena-vidrio">
              <span className="rc-mancha rc-mancha--azul" aria-hidden="true" />
              <button
                type="submit"
                disabled={!yo || (comandoRIA === null ? (!cuerpo.trim() && !pendientes.some((p) => p.estado === "listo")) || enviando : riaActiva)}
                className="rc-btn-enviar rc-vidrio rc-vidrio--azul"
                data-rc-compositor-boton
                aria-label="Enviar mensaje"
                style={{
                  cursor: cuerpo.trim() || hayPendientes ? "pointer" : "default",
                }}
              >
                <Send size={15} strokeWidth={1.75} color="var(--rc-azul-texto)" />
              </button>
            </div>
          </form>
        </div>
      </div>

      <EquipoBarra abierta={barraAbierta} onCerrar={() => setBarraAbierta(false)} />

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
    </div>
  );
}
