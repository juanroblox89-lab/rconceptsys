"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Bell,
  Briefcase,
  CheckCheck,
  CheckCircle2,
  FolderOpen,
  MessageSquare,
  PackageCheck,
  Pencil,
  RotateCcw,
  Settings,
  Sparkles,
  UserPlus,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { tiposAviso } from "@/lib/tipos-aviso";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Boton } from "@/components/ui/Boton";
import { api } from "@/lib/api";
import type { BandejaNotificaciones } from "@/lib/types";
import styles from "./CampanaNotificaciones.module.css";

type TonoAviso = "peligro" | "aviso" | "exito" | "ria" | "chat" | "acento";

function estiloAviso(tipo: string): { tono: TonoAviso; Icono: LucideIcon; etiqueta: string } {
  const etiqueta = tiposAviso[tipo as keyof typeof tiposAviso] ?? "Aviso";
  switch (tipo) {
    case "entrega-devuelta":
      return { tono: "peligro", Icono: XCircle, etiqueta };
    case "tarea-cancelada":
      return { tono: "peligro", Icono: Ban, etiqueta };
    case "pedido-de-nuevo":
    case "entrega-retirada":
      return { tono: "aviso", Icono: RotateCcw, etiqueta };
    case "vencio":
    case "vence-manana":
      return { tono: "aviso", Icono: AlertTriangle, etiqueta };
    case "entrega-aprobada":
      return { tono: "exito", Icono: CheckCircle2, etiqueta };
    case "entrega-hecha":
      return { tono: "exito", Icono: PackageCheck, etiqueta };
    case "corte-listo":
    case "corte-pagado":
      return { tono: "exito", Icono: Wallet, etiqueta };
    case "ria":
      return { tono: "ria", Icono: Sparkles, etiqueta };
    case "chat":
      return { tono: "chat", Icono: MessageSquare, etiqueta };
    case "tarea-editada":
      return { tono: "acento", Icono: Pencil, etiqueta };
    case "drive":
      return { tono: "acento", Icono: FolderOpen, etiqueta };
    case "solicitud":
      return { tono: "acento", Icono: UserPlus, etiqueta };
    case "tarea-nueva":
      return { tono: "acento", Icono: Briefcase, etiqueta };
    default:
      return { tono: "acento", Icono: Bell, etiqueta };
  }
}

export function CampanaNotificaciones({ barra = false }: { barra?: boolean }) {
  const panel = useId();
  const boton = useRef<HTMLButtonElement>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLElement>(null);
  const [abierta, setAbierta] = useState(false);
  const [pestana, setPestana] = useState<"bandeja" | "leidas">("bandeja");
  const [datos, setDatos] = useState<BandejaNotificaciones | null>(null);
  const [error, setError] = useState(false);
  const [marcando, setMarcando] = useState(false);
  const cargar = useCallback(async () => {
    try { setDatos(await api.getNotificaciones()); setError(false); } catch { setError(true); }
  }, []);
  useEffect(() => {
    let ultima = 0;
    const visible = () => {
      if (document.hidden) return;
      const ahora = Date.now();
      if (ahora - ultima < 30000) return;
      ultima = ahora;
      void cargar();
    };
    visible();
    const timer = setInterval(visible, 120000);
    document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [cargar]);
  useEffect(() => {
    if (!abierta) return;
    function click(e: PointerEvent) { if (e.target instanceof Node && !raiz.current?.contains(e.target) && !caja.current?.contains(e.target)) setAbierta(false); }
    function teclado(e: KeyboardEvent) { if (e.key === "Escape") { setAbierta(false); boton.current?.focus(); } }
    document.addEventListener("pointerdown", click); document.addEventListener("keydown", teclado);
    return () => { document.removeEventListener("pointerdown", click); document.removeEventListener("keydown", teclado); };
  }, [abierta]);

  const noLeidas = datos?.no_leidas ?? 0;
  const bandeja = (datos?.notificaciones ?? []).filter((n) => !n.leida_en);
  const leidas = (datos?.notificaciones ?? []).filter((n) => Boolean(n.leida_en));
  const visibles = pestana === "bandeja" ? bandeja : leidas;

  async function leerTodas() {
    setMarcando(true);
    try { await api.leerNotificaciones(); await cargar(); } catch { setError(true); }
    finally { setMarcando(false); }
  }

  return <div className={`${styles.raiz} ${barra ? styles.barra : styles.pastilla}`} data-rc-chrome={barra ? undefined : "campana"} ref={raiz}>
    <button type="button" ref={boton} className={styles.boton} aria-label={noLeidas ? `Notificaciones, ${noLeidas} sin leer` : "Notificaciones"} aria-expanded={abierta} aria-controls={panel} onClick={() => {
      setAbierta(!abierta); if (!abierta) void cargar();
    }}><Bell size={19} strokeWidth={1.75} aria-hidden="true" />{noLeidas > 0 && <span className={styles.punto} />}</button>
    {abierta && (() => { const contenido = <section id={panel} ref={caja} className={styles.panel} aria-label="Bandeja de notificaciones">
      <header className={styles.cabecera}>
        <div className={styles.cabeceraTitulo}>
          <strong>Notificaciones</strong>
          {noLeidas > 0 && <span className={styles.contador}>{noLeidas}</span>}
        </div>
        <div className={styles.cabeceraAcciones}>
          <button type="button" className={styles.marcarTodo} disabled={!noLeidas || marcando} onClick={() => void leerTodas()}>
            <CheckCheck size={15} aria-hidden="true" /> Marcar todo
          </button>
          <Link href="/configuracion" className={styles.engranaje} aria-label="Preferencias de notificaciones" title="Preferencias de notificaciones" onClick={() => setAbierta(false)}>
            <Settings size={16} strokeWidth={1.8} aria-hidden="true" />
          </Link>
        </div>
      </header>
      <div className={styles.pestanas} role="tablist" aria-label="Filtrar notificaciones">
        <button type="button" role="tab" aria-selected={pestana === "bandeja"} className={styles.pestana} onClick={() => setPestana("bandeja")}>
          Bandeja{bandeja.length > 0 ? ` (${bandeja.length})` : ""}
        </button>
        <button type="button" role="tab" aria-selected={pestana === "leidas"} className={styles.pestana} onClick={() => setPestana("leidas")}>
          Leídas{leidas.length > 0 ? ` (${leidas.length})` : ""}
        </button>
      </div>
      {error && <p className={styles.estadoTexto} role="alert">No pudimos actualizar tus avisos. <Boton variante="secundario" tamano="sm" onClick={() => void cargar()}>Reintentar</Boton></p>}
      {!datos && !error && <p className={styles.estadoTexto} role="status">Cargando avisos…</p>}
      {datos && visibles.length === 0 && (
        <p className={styles.estadoTexto}>
          {pestana === "bandeja" ? "Sin notificaciones sin leer." : "Aún no hay notificaciones leídas."}
        </p>
      )}
      {datos && visibles.length > 0 && (
        <ul className={styles.lista}>
          {visibles.map((n) => {
            const { tono, Icono, etiqueta } = estiloAviso(n.tipo);
            return (
              <li key={n.id} data-tono={tono}>
                <Link
                  href={n.url.startsWith("/") && !n.url.startsWith("//") ? n.url : "/"}
                  className={`${styles.item} ${n.leida_en ? styles.leida : styles.noLeida}`}
                  onClick={() => {
                    setAbierta(false);
                    if (!n.leida_en) void api.leerNotificaciones(n.id).then(cargar, () => setError(true));
                  }}
                >
                  <span className={styles.icono}><Icono size={15} strokeWidth={2} aria-hidden="true" /></span>
                  <div className={styles.contenido}>
                    <div className={styles.metaFila}>
                      <span className={styles.categoria}>{etiqueta}</span>
                      <time dateTime={n.creada_en}>
                        {new Date(n.creada_en).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                      </time>
                    </div>
                    <strong className={styles.titulo}>{n.titulo}</strong>
                    {n.cuerpo && <span className={styles.cuerpo}>{n.cuerpo}</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>;
      // En la barra lateral el panel va al body: la barra recorta lo que sobresale de su ancho.
      return barra ? createPortal(contenido, document.body) : contenido; })()}
  </div>;
}
