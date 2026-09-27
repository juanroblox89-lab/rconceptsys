"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoIcon } from "./Logo";
import { ModuleIcon, IconMenu } from "./icons";
import { Sidebar } from "./Sidebar";
import { AccountPopover } from "./AccountPopover";
import { Notificaciones } from "./Notificaciones";
import { useSession } from "./SessionProvider";
import type { Modulo } from "@/lib/types";
import styles from "./AppShell.module.css";

const STORAGE_KEY = "rc-sidebar";

/**
 * AppShell RConcept (adaptado de Globe AppShell.tsx).
 * Pastilla móvil + drawer (Sidebar) + sidebar desktop colapsable + riel.
 * Menú desde GET /me: no-dueño/admin solo ven sus módulos habilitados.
 */
export function AppShell({
  children,
  modulos,
}: {
  children: React.ReactNode;
  modulos: Modulo[];
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const pathname = usePathname() ?? "/";
  const { me } = useSession();

  // Menú reducido: quien no es dueño/admin solo ve sus módulos habilitados.
  const acceso = me?.usuario.acceso;
  const verTodo = acceso === "dueno" || acceso === "admin";
  const visibles = modulos.filter((m) => m.habilitado || verTodo);
  const activePath = pathname === "/" ? "/inicio" : pathname;

  useEffect(() => {
    const sync = () => {
      try {
        setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "hidden");
      } catch {
        // Sin almacenamiento: sidebar abierta.
      }
    };
    window.addEventListener("rc-sidebar-sync", sync);
    sync();
    return () => window.removeEventListener("rc-sidebar-sync", sync);
  }, []);

  // Teclado virtual (mobile): seguir la altura visible sin saltos.
  useEffect(() => {
    const vv = window.visualViewport;
    if (vv === null) return;
    const root = document.documentElement;
    const apply = () => {
      root.style.setProperty("--g-visual-viewport", `${Math.round(vv.height)}px`);
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      root.style.removeProperty("--g-visual-viewport");
    };
  }, []);

  // Con el drawer abierto el body no scrollea detrás.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  // Cerrar el drawer con Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const setHidden = (hidden: boolean) => {
    setCollapsed(hidden);
    try {
      window.localStorage.setItem(STORAGE_KEY, hidden ? "hidden" : "shown");
      if (hidden) {
        document.documentElement.dataset.sidebar = "closed";
      } else {
        delete document.documentElement.dataset.sidebar;
      }
    } catch {
      // Sin almacenamiento: solo estado en memoria.
    }
  };

  const user = me?.usuario ?? null;
  const initial = (user?.nombre ?? "?").charAt(0).toUpperCase();

  const railLinks = visibles.filter((m) => m.id !== "mi-perfil").slice(0, 5);

  return (
    <div className={styles.root}>
      {/* Pastilla: solo mobile, o desktop con la sidebar colapsada. */}
      <div className={`${styles.pill} ${collapsed ? styles.pillDesktop : ""}`}>
        {collapsed ? (
          <button
            type="button"
            className={styles.menuButton}
            aria-label="Abrir barra"
            title="Abrir barra"
            onClick={() => setHidden(false)}
          >
            <IconMenu size={18} />
          </button>
        ) : (
          <button
            type="button"
            className={styles.menuButton}
            aria-label="Abrir menú"
            onClick={() => setMobileOpen(true)}
          >
            <IconMenu size={18} />
          </button>
        )}
        <Link href="/inicio" aria-label="Ir al inicio" className={styles.mobileTitle}>
          <LogoIcon size={22} />
          <span>RConcept Systems</span>
        </Link>
      </div>

      {/* Riel flotante (solo desktop con la sidebar colapsada). */}
      <nav className={`${styles.rail} ${collapsed ? styles.railVisible : ""}`} aria-label="Accesos">
        <div className={styles.railGroup}>
          {railLinks.map((m) => (
            <Link
              key={m.id}
              href={m.ruta}
              className={`${styles.railButton} ${activePath === m.ruta ? styles.railActive : ""}`}
              aria-label={m.titulo}
              title={m.titulo}
              aria-current={activePath === m.ruta ? "page" : undefined}
            >
              <ModuleIcon id={m.id} size={18} />
            </Link>
          ))}
        </div>
        <div className={styles.railAccount}>
          <button
            type="button"
            className={styles.railAvatar}
            aria-label="Cuenta"
            aria-haspopup="dialog"
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen((v) => !v)}
          >
            {user?.foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.foto} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span>{initial}</span>
            )}
          </button>
          <AccountPopover
            open={accountOpen}
            onClose={() => setAccountOpen(false)}
            placement="rail"
          />
        </div>
      </nav>

      {mobileOpen && (
        <div className={styles.overlay} onClick={() => setMobileOpen(false)} />
      )}

      {/* Campanita F1: fija arriba a la derecha en mobile y desktop. */}
      <div className={styles.bellFloat}>
        <Notificaciones />
      </div>

      <div className={`${styles.sidebarWrap} ${collapsed ? styles.sidebarHidden : ""}`}>
        <div className={styles.sidebarPanel}>
          <div className={styles.sidebarInner}>
            <Sidebar
              open={mobileOpen}
              modulos={visibles}
              onNavigate={() => {
                if (window.innerWidth < 768) setMobileOpen(false);
              }}
              onCollapse={() => {
                if (window.innerWidth < 768) setMobileOpen(false);
                else setHidden(true);
              }}
            />
          </div>
        </div>
      </div>

      <main className={`${styles.main} ${collapsed ? styles.mainWithRail : ""}`}>{children}</main>
    </div>
  );
}

// Re-export para usos existentes.
export { faseDe } from "@/lib/modulos";
export type { SidebarProps } from "./Sidebar";
