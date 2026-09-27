"use client";

import { useEffect } from "react";
import { IconClose } from "./icons";
import styles from "./Modal.module.css";

/**
 * Modal genérico (patrón de Globe SettingsModal: overlay + dialog,
 * animación pop-in/sheet-up, Escape y clic-fuera para cerrar).
 * El body deja de scrollear mientras está abierto.
 */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={title}>
        <button
          type="button"
          className={styles.close}
          aria-label="Cerrar"
          onClick={onClose}
        >
          <IconClose size={18} />
        </button>
        <div className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
