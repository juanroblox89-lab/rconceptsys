"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Boton } from "@/components/ui/Boton";
import { api } from "@/lib/api";
import type { BandejaNotificaciones } from "@/lib/types";
import styles from "./CampanaNotificaciones.module.css";

export function CampanaNotificaciones({ barra = false }: { barra?: boolean }) {
  const panel = useId();
  const boton = useRef<HTMLButtonElement>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLElement>(null);
  const [abierta, setAbierta] = useState(false);
  const [datos, setDatos] = useState<BandejaNotificaciones | null>(null);
  const [error, setError] = useState(false);
  const [marcando, setMarcando] = useState(false);
  const cargar = useCallback(async () => {
    try { setDatos(await api.getNotificaciones()); setError(false); } catch { setError(true); }
  }, []);
  useEffect(() => {
    const visible = () => { if (!document.hidden) void cargar(); };
    visible();
    const timer = setInterval(visible, 30000);
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
  async function leerTodas() {
    setMarcando(true);
    try { await api.leerNotificaciones(); await cargar(); } catch { setError(true); }
    finally { setMarcando(false); }
  }
  return <div className={`${styles.raiz} ${barra ? styles.barra : styles.pastilla}`} ref={raiz}>
    <button type="button" ref={boton} className={styles.boton} aria-label={noLeidas ? `Notificaciones, ${noLeidas} sin leer` : "Notificaciones"} aria-expanded={abierta} aria-controls={panel} onClick={() => {
      setAbierta(!abierta); if (!abierta) void cargar();
    }}><Bell size={19} strokeWidth={1.75} aria-hidden="true" />{noLeidas > 0 && <span className={styles.punto} />}</button>
    {abierta && (() => { const contenido = <section id={panel} ref={caja} className={styles.panel} aria-label="Bandeja de notificaciones">
      <header><strong>Notificaciones{noLeidas ? ` (${noLeidas})` : ""}</strong><button type="button" disabled={!noLeidas || marcando} onClick={() => void leerTodas()}><CheckCheck size={16} aria-hidden="true" /> Marcar todo leído</button></header>
      {error && <p role="alert">No pudimos actualizar tus avisos. <Boton variante="secundario" tamano="sm" onClick={() => void cargar()}>Reintentar</Boton></p>}
      {!datos && !error && <p role="status">Cargando avisos…</p>}
      {datos && !datos.notificaciones.length && <p>Sin notificaciones.</p>}
      {datos && datos.notificaciones.length > 0 && <ul>{datos.notificaciones.map((n) => <li key={n.id}>
        <Link href={n.url.startsWith("/") && !n.url.startsWith("//") ? n.url : "/"} className={n.leida_en ? undefined : styles.noLeida} onClick={() => {
          setAbierta(false); if (!n.leida_en) void api.leerNotificaciones(n.id).then(cargar, () => setError(true));
        }}><strong>{n.titulo}</strong><span>{n.cuerpo}</span><time dateTime={n.creada_en}>{new Date(n.creada_en).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</time></Link>
      </li>)}</ul>}
      <Link href="/configuracion" className={styles.ajustes} onClick={() => setAbierta(false)}>Preferencias de notificaciones</Link>
    </section>;
      // En la barra lateral el panel va al body: la barra recorta lo que sobresale de su ancho.
      return barra ? createPortal(contenido, document.body) : contenido; })()}
  </div>;
}
