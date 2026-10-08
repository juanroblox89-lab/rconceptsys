"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessagesSquare, PanelLeftClose, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/Logo";
import styles from "./Sidebar.module.css";

export const navItems: { title: string; href: string; icon: LucideIcon }[] = [
  { title: "Chat del equipo", href: "/", icon: MessagesSquare },
];

export interface SidebarProps {
  /** Estado abierto/cerrado en móvil (drawer). En desktop se ignora por CSS. */
  open?: boolean;
  /** Se dispara al elegir una sección: en móvil cierra el drawer. */
  onNavigate?: () => void;
  /** Botón "Cerrar barra": en desktop la oculta, en móvil cierra el drawer. */
  onCollapse?: () => void;
}

export function Sidebar({ open = false, onNavigate, onCollapse }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className={`${styles.root} ${open ? styles.rootOpen : ""}`}>
      <div className={styles.topRow}>
        <Link href="/" className={styles.brand} aria-label="Ir al inicio" onClick={() => onNavigate?.()}>
          <Logo size={16} />
        </Link>
        <button
          type="button"
          className={styles.collapseButton}
          aria-label="Cerrar barra"
          title="Cerrar barra"
          onClick={onCollapse ?? onNavigate}
        >
          <PanelLeftClose size={18} strokeWidth={1.75} />
        </button>
      </div>

      <nav className={styles.nav} aria-label="Secciones">
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onNavigate?.()}
              className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className={styles.navIcon}>
                <Icon size={16} strokeWidth={1.75} />
              </span>
              {item.title}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
