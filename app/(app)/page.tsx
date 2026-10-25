"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send, ArrowDown } from "lucide-react";
import { api } from "@/lib/api";
import { ChatMensaje, Perfil } from "@/lib/types";
import { agruparMensajes } from "@/lib/chat-utils";
import styles from "./chat.module.css";

export default function ChatPage() {
  const router = useRouter();
  const [mensajes, setMensajes] = useState<ChatMensaje[]>([]);
  const [cuerpo, setCuerpo] = useState("");
  const [yo, setYo] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [nuevosMensajes, setNuevosMensajes] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

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

  useEffect(() => {
    if (!yo) return;

    let montado = true;
    const cargar = async () => {
      try {
        const datos = await api.getChat(undefined, 40);
        if (montado) {
          const ordenados = [...datos].reverse();
          setMensajes(ordenados);
          setCargando(false);
        }
      } catch {
        if (montado) setCargando(false);
      }
    };
    cargar();

    const interval = setInterval(async () => {
      try {
        const datos = await api.getChat(undefined, 40);
        if (!montado) return;
        const ordenados = [...datos].reverse();
        setMensajes((prev) => {
          if (ordenados.length > prev.length) {
            const diferencia = ordenados.length - prev.length;
            if (!isNearBottomRef.current) {
              setNuevosMensajes((n) => n + diferencia);
            }
            return ordenados;
          }
          return ordenados;
        });
      } catch {
        // Ignorar
      }
    }, 3000);

    return () => {
      montado = false;
      clearInterval(interval);
    };
  }, [yo]);

  useEffect(() => {
    if (isNearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensajes]);

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

  const enviarMensaje = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const texto = cuerpo.trim();
    if (!texto || !yo) return;

    const tempID = Date.now();
    const optimista: ChatMensaje = {
      id: tempID,
      autor_id: yo.id,
      cuerpo: texto,
      creado_en: new Date().toISOString(),
      autor: yo,
      enviando: true,
    };

    setMensajes((prev) => [...prev, optimista]);
    setCuerpo("");

    try {
      const creado = await api.postChat(texto);
      setMensajes((prev) =>
        prev.map((m) => (m.id === tempID ? { ...creado, enviando: false } : m))
      );
      isNearBottomRef.current = true;
    } catch {
      setMensajes((prev) =>
        prev.map((m) => (m.id === tempID ? { ...m, enviando: false, error: true } : m))
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensaje();
    }
  };

  const reintentarEnvio = async (id: number, texto: string) => {
    setMensajes((prev) =>
      prev.map((m) => (m.id === id ? { ...m, enviando: true, error: false } : m))
    );
    try {
      const creado = await api.postChat(texto);
      setMensajes((prev) =>
        prev.map((m) => (m.id === id ? { ...creado, enviando: false } : m))
      );
    } catch {
      setMensajes((prev) =>
        prev.map((m) => (m.id === id ? { ...m, enviando: false, error: true } : m))
      );
    }
  };

  const grupos = agruparMensajes(mensajes, yo?.id || "");

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>Chat de todo el equipo</h1>
          <p className={styles.headerMeta}>Coordinación general de producción</p>
        </div>
      </header>

      <div className={styles.messageList} ref={scrollRef} onScroll={handleScroll}>
        {cargando && (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--rc-label-secondary)" }}>
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
              <Link href={`/equipo/${grupo.autor_id}`} className={styles.avatarLink}>
                {grupo.autor_foto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={grupo.autor_foto} alt={grupo.autor_nombre} className={styles.avatar} />
                ) : (
                  <div className={styles.avatarPlaceholder}>
                    {grupo.autor_nombre.charAt(0).toUpperCase()}
                  </div>
                )}
              </Link>

              <div className={styles.groupContent}>
                <div className={styles.groupHeader}>
                  <Link href={`/equipo/${grupo.autor_id}`} className={styles.authorName}>
                    {grupo.autor_nombre}
                  </Link>

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
                  {grupo.lineas.map((linea) => (
                    <div
                      key={`l-${linea.id}`}
                      className={`${styles.bubble} ${grupo.es_mio ? styles.bubbleMine : ""} ${
                        linea.enviando ? styles.bubbleSending : ""
                      } ${linea.error ? styles.bubbleError : ""}`}
                    >
                      {linea.cuerpo}

                      {linea.error && (
                        <div className={styles.bubbleFooter}>
                          <span>Error de envío</span>
                          <button
                            type="button"
                            className={styles.retryBtn}
                            onClick={() => reintentarEnvio(linea.id, linea.cuerpo)}
                          >
                            Reintentar
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
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
        <form className={styles.composer} onSubmit={enviarMensaje}>
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
          <button
            type="submit"
            disabled={!cuerpo.trim()}
            className={styles.sendBtn}
            aria-label="Enviar mensaje"
          >
            <Send size={18} />
          </button>
        </form>
        <span className={styles.composerHint}>
          Presiona Enter para enviar, Shift+Enter para salto de línea
        </span>
      </div>
    </div>
  );
}
