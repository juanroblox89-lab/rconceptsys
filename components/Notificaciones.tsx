"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconBell } from "./icons";
import { useSession } from "./SessionProvider";
import { contarNoLeidas, getNotifs, leerNotif } from "@/lib/f1api";
import type { Notificacion } from "@/lib/f1tipos";
import { fmtRelativa } from "@/lib/fechas";
import styles from "./Notificaciones.module.css";

/**
 * Campanita F1: vive junto a la pastilla del header (ver AppShell).
 * Poll de no leídas cada 60 s + lista con "marcar leída".
 */
export function Notificaciones() {
  const { me } = useSession();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notificacion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    if (me === null) return;
    contarNoLeidas().then(setCount).catch(() => {});
  }, [me]);

  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 60000);
    return () => window.clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await getNotifs());
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar");
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && items === null && !loading) void load();
  };

  const marcar = async (id: string) => {
    setSavingId(id);
    try {
      const n = await leerNotif(id);
      setItems((prev) => (prev === null ? prev : prev.map((x) => (x.id === id ? n : x))));
      setCount((c) => Math.max(0, c - 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar");
    } finally {
      setSavingId(null);
    }
  };

  if (me === null) return null;

  const destino = (n: Notificacion): string =>
    n.recurso === "tarea" ? "/mis-tareas" : n.recurso === "cliente" ? "/clientes" : "/inicio";

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.bell}
        aria-label={count > 0 ? `${count} notificaciones sin leer` : "Notificaciones"}
        aria-expanded={open}
        onClick={toggle}
      >
        <IconBell size={18} />
        {count > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>
      {open && (
        <div className={styles.drop} role="dialog" aria-label="Notificaciones">
          <div className={styles.dropHead}>
            <span>Notificaciones</span>
            <button type="button" onClick={() => void load()} disabled={loading}>
              {loading ? "Cargando…" : "Actualizar"}
            </button>
          </div>
          {error !== null && <p className={styles.err} role="alert">{error}</p>}
          {items !== null && items.length === 0 && (
            <p className={styles.empty}>Nada por aquí. Cuando te asignen, entreguen o devuelvan algo, aparece acá.</p>
          )}
          {items !== null &&
            items.slice(0, 20).map((n) => (
              <div key={n.id} className={`${styles.item} ${n.leida ? "" : styles.unread}`}>
                <p className={styles.itemTitle}>
                  <Link href={destino(n)} onClick={() => setOpen(false)} style={{ color: "inherit", textDecoration: "none" }}>
                    {n.titulo}
                  </Link>
                </p>
                {n.detalle !== null && n.detalle !== "" && <p className={styles.itemDetail}>{n.detalle}</p>}
                <div className={styles.itemMeta}>
                  <span>{fmtRelativa(n.created_at)}</span>
                  {!n.leida && (
                    <button type="button" onClick={() => void marcar(n.id)} disabled={savingId === n.id}>
                      {savingId === n.id ? "Guardando…" : "Marcar leída"}
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
