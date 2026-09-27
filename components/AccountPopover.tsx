"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useSession } from "./SessionProvider";
import { ModuleIcon, IconClose } from "./icons";
import styles from "./AccountPopover.module.css";

export interface AccountPopoverProps {
  open: boolean;
  onClose: () => void;
  /** "sidebar" (default): abre hacia arriba a lo ancho. "rail": abre a la derecha del avatar. */
  placement?: "sidebar" | "rail";
}

/**
 * Popover de cuenta RConcept (adaptado de Globe AccountPopover).
 * Sin temas/planes/memoria/novedades: Mi perfil, Equipo (dueño/admin) y cerrar sesión.
 */
export function AccountPopover({ open, onClose, placement = "sidebar" }: AccountPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { me, signOut } = useSession();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointer = (e: PointerEvent) => {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    const first = ref.current?.querySelector("button, a");
    if (first instanceof HTMLElement) first.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open, onClose]);

  if (!open) return null;

  const user = me?.usuario ?? null;
  const initial = (user?.nombre ?? "?").charAt(0).toUpperCase();
  const acceso = user?.acceso;
  const veEquipo = acceso === "dueno" || acceso === "admin";

  return (
    <div
      ref={ref}
      className={`${styles.pop} ${placement === "rail" ? styles.popRail : ""}`}
      role="dialog"
      aria-label="Cuenta"
    >
      <div className={styles.userRow}>
        <span className={styles.avatar} aria-hidden="true">
          {user?.foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.foto} alt="" referrerPolicy="no-referrer" />
          ) : (
            initial
          )}
        </span>
        <span style={{ minWidth: 0 }}>
          <span className={styles.userName} style={{ display: "block" }}>
            {user?.nombre ?? "…"}
          </span>
          <span className={styles.userMail} style={{ display: "block" }}>
            {user?.email ?? ""}
          </span>
        </span>
      </div>
      <Link href="/mi-perfil" className={styles.item} onClick={onClose}>
        <ModuleIcon id="mi-perfil" size={15} />
        Mi perfil
      </Link>
      {veEquipo && (
        <Link href="/equipo" className={styles.item} onClick={onClose}>
          <ModuleIcon id="equipo" size={15} />
          Equipo
        </Link>
      )}
      <hr className={styles.sep} />
      <button
        type="button"
        className={styles.item}
        onClick={() => {
          onClose();
          void signOut();
        }}
      >
        <IconClose size={15} />
        Cerrar sesión
      </button>
    </div>
  );
}
