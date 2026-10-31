"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftOpen } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Sidebar, navItems } from "@/components/Sidebar";
import { api } from "@/lib/api";
import { Perfil } from "@/lib/types";
import styles from "./AppShell.module.css";

const STORAGE_KEY = "rc-sidebar";

// Layout copiado de Globe: sidebar fija en desktop (se puede ocultar y queda un
// riel), drawer en móvil con pastilla flotante. El primer render es idéntico al
// del server (sidebar abierta); localStorage se lee tras montar y el script
// anti-flash del layout raíz ya aplicó data-sidebar="closed" si hacía falta.
export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [yo, setYo] = useState<Perfil | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    let montado = true;
    api.getYo()
      .then((p) => {
        if (montado) setYo(p);
      })
      .catch(() => {});
    return () => {
      montado = false;
    };
  }, []);

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

  // Teclado virtual (móvil): altura visible como variable para que el layout lo siga.
  useEffect(() => {
    const vv = window.visualViewport;
    if (vv === null) return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty("--rc-visual-viewport", `${Math.round(vv.height)}px`);
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      root.style.removeProperty("--rc-visual-viewport");
    };
  }, []);

  // Con el drawer abierto el body no scrollea detrás; Escape lo cierra.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  const setHidden = (hidden: boolean) => {
    setCollapsed(hidden);
    try {
      window.localStorage.setItem(STORAGE_KEY, hidden ? "hidden" : "shown");
      if (hidden) document.documentElement.dataset.sidebar = "closed";
      else delete document.documentElement.dataset.sidebar;
    } catch {
      // Sin almacenamiento: solo estado en memoria.
    }
  };

  return (
    <div className={styles.root}>
      {/* Pastilla: solo móvil, o desktop con la sidebar colapsada. */}
      <div className={`${styles.pill} ${collapsed ? styles.pillDesktop : ""}`}>
        <button
          type="button"
          className={styles.menuButton}
          aria-label={collapsed ? "Abrir barra" : "Abrir menú"}
          title={collapsed ? "Abrir barra" : undefined}
          onClick={() => (collapsed && window.innerWidth >= 768 ? setHidden(false) : setMobileOpen(true))}
        >
          <PanelLeftOpen size={18} strokeWidth={1.75} />
        </button>
        <Link href="/" aria-label="Ir al inicio">
          <Logo size={16} className={styles.mobileTitle} />
        </Link>
      </div>

      {/* Riel flotante (solo desktop con la sidebar colapsada). */}
      <nav className={`${styles.rail} ${collapsed ? styles.railVisible : ""}`} aria-label="Accesos">
        <div className={styles.railGroup}>
          {navItems
            .filter((item) => {
              if (item.adminOnly && !yo?.es_admin) return false;
              if (item.workerOnly && yo?.es_admin) return false;
              return true;
            })
            .map(({ title, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`${styles.railButton} ${pathname === href ? styles.railActive : ""}`}
                aria-label={title}
                title={title}
                aria-current={pathname === href ? "page" : undefined}
              >
                <Icon size={18} strokeWidth={1.75} />
              </Link>
            ))}
        </div>
      </nav>

      {mobileOpen && <div className={styles.overlay} onClick={() => setMobileOpen(false)} />}

      <div className={`${styles.sidebarWrap} ${collapsed ? styles.sidebarHidden : ""}`}>
        <div className={styles.sidebarPanel} aria-hidden={collapsed || undefined}>
          <div className={styles.sidebarInner}>
            <Sidebar
              open={mobileOpen}
              onNavigate={() => {
                // Desktop: la barra queda como está. Móvil: el drawer se cierra al elegir.
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
