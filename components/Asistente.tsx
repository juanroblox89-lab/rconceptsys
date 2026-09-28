"use client";

/**
 * Asistente F5 — chat simple estilo Globe (burbujas, input compacto).
 * Burbuja del asistente con markdown básico (negrita, listas, saltos).
 * Historial por usuario (conversaciones guardadas en el backend).
 * Sin claves → "no disponible" (§5.31); el resto funciona igual.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import {
  chatAsistente,
  getConversacion,
  getConversaciones,
  type AsistenteConversacion,
  type AsistenteMensaje,
} from "@/lib/f5api";
import f1 from "./F1.module.css";
import styles from "./Asistente.module.css";

/** Markdown básico: **negrita**, listas con -/*, párrafos. Sin librerías. */
export function mdBasico(texto: string): { __html: string } {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const enLinea = (s: string) =>
    esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  const lineas = texto.split("\n");
  let html = "";
  let enLista = false;
  for (const ln of lineas) {
    const item = ln.match(/^[-•*]\s+(.*)$/);
    if (item !== null) {
      if (!enLista) {
        html += "<ul>";
        enLista = true;
      }
      html += `<li>${enLinea(item[1] ?? "")}</li>`;
    } else {
      if (enLista) {
        html += "</ul>";
        enLista = false;
      }
      if (ln.trim() === "") continue;
      html += `<p>${enLinea(ln)}</p>`;
    }
  }
  if (enLista) html += "</ul>";
  return { __html: html === "" ? "<p>…</p>" : html };
}

function Burbujas({ mensajes }: { mensajes: AsistenteMensaje[] }) {
  const finRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [mensajes.length]);
  return (
    <div className={styles.hilo} role="log" aria-label="Conversación">
      {mensajes.length === 0 && (
        <p className={f1.f1vacio}>
          <strong>Preguntame lo que sea</strong>
          Qué tengo hoy · piezas atrasadas · cuánto llevo · escribir un guion · ideas de contenido.
        </p>
      )}
      {mensajes.map((m) => (
        <div
          key={m.id}
          className={m.rol === "user" ? styles.burbujaYo : styles.burbujaIA}
        >
          {m.rol === "user" ? (
            <p>{m.contenido}</p>
          ) : (
            <div
              className={styles.md}
              dangerouslySetInnerHTML={mdBasico(m.contenido)}
            />
          )}
        </div>
      ))}
      <div ref={finRef} />
    </div>
  );
}

export function AsistenteChat({
  piezaId,
  clienteId,
  onBorrador,
}: {
  piezaId?: string;
  clienteId?: string;
  onBorrador?: () => void;
}) {
  const [convs, setConvs] = useState<AsistenteConversacion[] | null>(null);
  const [convId, setConvId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<AsistenteMensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pedidoRef = useRef(0);

  const cargarLista = useCallback(() => {
    void getConversaciones()
      .then(setConvs)
      .catch(() => setConvs([]));
  }, []);

  useEffect(() => {
    const t = window.setTimeout(cargarLista, 0);
    return () => window.clearTimeout(t);
  }, [cargarLista]);

  const abrir = async (id: string | null) => {
    const pedido = ++pedidoRef.current;
    setConvId(id);
    setError(null);
    if (id === null) {
      setMensajes([]);
      return;
    }
    try {
      const d = await getConversacion(id);
      // W15: si el usuario ya abrió otra, no pisar sus mensajes.
      if (pedidoRef.current === pedido) setMensajes(d.mensajes);
    } catch (e) {
      if (pedidoRef.current === pedido) {
        setError(e instanceof Error ? e.message : "No se pudo abrir");
      }
    }
  };

  const enviar = async () => {
    const pregunta = texto.trim();
    if (pregunta === "" || enviando) return;
    setEnviando(true);
    setError(null);
    setTexto("");
    const optimista: AsistenteMensaje = {
      id: `tmp-${Date.now()}`,
      rol: "user",
      contenido: pregunta,
      created_at: new Date().toISOString(),
    };
    setMensajes((prev) => [...prev, optimista]);
    try {
      const r = await chatAsistente({
        conversacion_id: convId,
        mensaje: pregunta,
        contexto: { pieza_id: piezaId ?? null, cliente_id: clienteId ?? null },
      });
      setConvId(r.conversacion.id);
      setMensajes((prev) => [
        ...prev.filter((m) => m.id !== optimista.id),
        { ...optimista, id: `u-${r.respuesta.id}` },
        r.respuesta,
      ]);
      cargarLista();
      if (onBorrador !== undefined) onBorrador();
    } catch (e) {
      setMensajes((prev) => prev.filter((m) => m.id !== optimista.id));
      setError(e instanceof Error ? e.message : "No se pudo enviar");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className={styles.chat}>
      {(convs === null || convs.length > 0) && (
        <div className={styles.historial}>
          <button
            type="button"
            className={styles.nueva}
            onClick={() => void abrir(null)}
            disabled={enviando}
          >
            Nueva conversación
          </button>
          {(convs ?? []).slice(0, 8).map((c) => (
            <button
              key={c.id}
              type="button"
              className={`${styles.conv} ${c.id === convId ? styles.convActiva : ""}`}
              onClick={() => void abrir(c.id)}
              disabled={enviando}
              title={c.titulo}
            >
              {c.titulo === "" ? "Conversación" : c.titulo}
            </button>
          ))}
        </div>
      )}
      <Burbujas mensajes={mensajes} />
      {error !== null && (
        <div className="error-box" role="alert">
          <p>{error}</p>
        </div>
      )}
      <div className={styles.envio}>
        <input
          className="input"
          aria-label="Preguntale al asistente"
          placeholder="Preguntale al asistente…"
          value={texto}
          disabled={enviando}
          maxLength={2000}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void enviar();
          }}
        />
        <button
          type="button"
          className="btn btn-sm"
          disabled={texto.trim() === "" || enviando}
          onClick={() => void enviar()}
        >
          {enviando ? "…" : "Enviar"}
        </button>
      </div>
    </div>
  );
}

/** Botón global + modal (lo monta el AppShell: disponible en toda la app). */
export function AsistenteGlobal() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        className={styles.flotante}
        aria-label="Abrir asistente"
        onClick={() => setAbierto(true)}
      >
        IA
      </button>
      {abierto && (
        <Modal title="Asistente" onClose={() => setAbierto(false)}>
          <AsistenteChat />
        </Modal>
      )}
    </>
  );
}

/** Entrada contextual: abre el chat con la pieza/cliente ya en contexto. */
export function AsistenteEntrada({
  titulo,
  piezaId,
  clienteId,
  onBorrador,
}: {
  titulo: string;
  piezaId?: string;
  clienteId?: string;
  onBorrador?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setAbierto(true)}
      >
        {titulo}
      </button>
      {abierto && (
        <Modal title="Asistente" onClose={() => setAbierto(false)}>
          <AsistenteChat
            piezaId={piezaId}
            clienteId={clienteId}
            onBorrador={onBorrador}
          />
        </Modal>
      )}
    </>
  );
}
