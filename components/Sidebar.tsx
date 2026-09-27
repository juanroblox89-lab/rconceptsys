"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogoIcon } from "./Logo";
import { AccountPopover } from "./AccountPopover";
import { ModuleIcon, IconClose } from "./icons";
import { useSession } from "./SessionProvider";
import { faseDe } from "@/lib/modulos";
import type { Modulo } from "@/lib/types";
import styles from "./Sidebar.module.css";

export interface SidebarProps {
  /** Estado abierto/cerrado en mobile (offcanvas). En desktop se ignora via CSS. */
  open?: boolean;
  /** Se dispara al elegir un item del menú - usado en mobile para cerrar el drawer. */
  onNavigate?: () => void;
  /** Módulos visibles (ya filtrados por acceso en AppShell). */
  modulos: Modulo[];
  /** Botón "Cerrar barra": en desktop la oculta, en mobile cierra el drawer. */
  onCollapse?: () => void;
}

/**
 * Sidebar RConcept (adaptada de Globe Sidebar.tsx).
 * Sin Recientes/conversaciones/búsqueda/pines, sin "Nuevo chat", sin planes:
 * marca + navegación de módulos (GET /me) + pie de cuenta.
 */
export function Sidebar({ open = false, onNavigate, modulos, onCollapse }: SidebarProps) {
  const pathname = usePathname() ?? "/";
  const activePath = pathname === "/" ? "/inicio" : pathname;
  const [accountOpen, setAccountOpen] = useState(false);
  const { me } = useSession();
  const user = me?.usuario ?? null;
  const initial = (user?.nombre ?? "?").charAt(0).toUpperCase();

  return (
    <div className={`${styles.root} ${open ? styles.rootOpen : styles.rootClosed}`}>
      <div className={styles.topRow}>
        <Link
          href="/inicio"
          className={styles.brand}
          aria-label="Ir al inicio"
          onClick={onNavigate}
        >
          <LogoIcon size={26} />
          <span>
            <span className={styles.brandName}>RConcept Systems</span>
            <span className={styles.brandSub}>Rohlfing Concept</span>
          </span>
        </Link>
        <button
          type="button"
          className={styles.collapseButton}
          aria-label="Cerrar barra"
          title="Cerrar barra"
          onClick={onCollapse ?? onNavigate}
        >
          <IconClose size={18} />
        </button>
      </div>

      <nav className={styles.nav} aria-label="Módulos">
        {modulos.map((m) => {
          const active = activePath === m.ruta;
          return (
            <Link
              key={m.id}
              href={m.ruta}
              className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
            >
              <span className={styles.navIcon}>
                <ModuleIcon id={m.id} size={16} />
              </span>
              {m.titulo}
              {!m.habilitado && <span className={styles.soon}>{faseDe(m.id)}</span>}
            </Link>
          );
        })}
      </nav>

      <div className={styles.grow} />

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.profileRow}
          aria-expanded={accountOpen}
          aria-haspopup="dialog"
          onClick={() => setAccountOpen((v) => !v)}
        >
          {user?.foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.avatar} src={user.foto} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className={styles.avatar}>{initial}</span>
          )}
          <span className={styles.profileText}>
            <span className={styles.profileName}>{user?.nombre ?? "…"}</span>
            <span className={styles.profileSub}>{user?.email ?? ""}</span>
          </span>
        </button>
        <AccountPopover open={accountOpen} onClose={() => setAccountOpen(false)} />
      </div>
    </div>
  );
}
