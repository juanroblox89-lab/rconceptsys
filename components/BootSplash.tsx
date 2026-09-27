"use client";

import { useEffect, useState } from "react";
import { LogoIcon } from "./Logo";
import styles from "./BootSplash.module.css";

/**
 * Pantalla de carga al entrar (adaptada de Globe BootSplash).
 * Logo marca/ + barra sólida; ofrece reintentar si tarda más de 7 s.
 */
export function BootSplash({ label = "Cargando RConcept Systems" }: { label?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 7000);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className={styles.root} role="status" aria-busy="true" aria-label={label}>
      <div className={styles.inner}>
        <LogoIcon size={56} />
        <span className={styles.bar} aria-hidden="true">
          <i />
        </span>
        {slow && (
          <p className={styles.slow}>
            Tardando en conectar ·{" "}
            <button type="button" onClick={() => window.location.reload()}>
              Reintentar
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
