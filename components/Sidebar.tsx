"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  MessagesSquare,
  Users,
  User,
  Shield,
  CheckSquare,
  Receipt,
  PanelLeftClose,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { api } from "@/lib/api";
import { Perfil } from "@/lib/types";
import styles from "./Sidebar.module.css";

interface NavItemDef {
  id: string;
  title: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export const navItems: NavItemDef[] = [
  { id: "chat", title: "Chat del equipo", href: "/", icon: MessagesSquare },
  { id: "tareas", title: "Tareas", href: "/tareas", icon: CheckSquare },
  { id: "factura", title: "Mi factura", href: "/factura", icon: Receipt },
  { id: "equipo", title: "Equipo", href: "/equipo", icon: Users },
  { id: "perfil", title: "Mi perfil", href: "/perfil", icon: User },
  { id: "admin", title: "Gestión", href: "/admin", icon: Shield, adminOnly: true },
];

export interface SidebarProps {
  open?: boolean;
  onNavigate?: () => void;
  onCollapse?: () => void;
}

export function Sidebar({ open = false, onNavigate, onCollapse }: SidebarProps) {
  const pathname = usePathname();
  const [yo, setYo] = useState<Perfil | null>(null);
  const [pendientesCount, setPendientesCount] = useState<number>(0);
  const [porRevisarCount, setPorRevisarCount] = useState<number>(0);

  const actualizarContadores = useCallback((esAdmin: boolean) => {
    // Contador de tareas pendientes para la persona
    api.getTareas("pendiente")
      .then((tareas) => {
        setPendientesCount(Array.isArray(tareas) ? tareas.length : 0);
      })
      .catch(() => {});

    // Contador de tareas por revisar para el admin
    if (esAdmin) {
      api.adminGetTareas({ estado: "hecha" })
        .then((res) => {
          setPorRevisarCount(res?.por_revisar ?? 0);
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    let montado = true;
    api.getYo()
      .then((p) => {
        if (!montado) return;
        setYo(p);
        actualizarContadores(p.es_admin);
      })
      .catch(() => {});

    // Intervalo de actualización cada 60s si el documento está visible
    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") {
        api.getYo()
          .then((p) => {
            if (!montado) return;
            actualizarContadores(p.es_admin);
          })
          .catch(() => {});
      }
    }, 60000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        api.getYo()
          .then((p) => {
            if (!montado) return;
            actualizarContadores(p.es_admin);
          })
          .catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      montado = false;
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [actualizarContadores]);

  const itemsVisibles = navItems.filter((item) => {
    if (item.adminOnly && !yo?.es_admin) return false;
    return true;
  });

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
        {itemsVisibles.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;

          let badgeCount = 0;
          if (item.id === "tareas") {
            badgeCount = pendientesCount;
          } else if (item.id === "admin") {
            badgeCount = porRevisarCount;
          }

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
              <span className={styles.navLabel}>{item.title}</span>
              {badgeCount > 0 && (
                <span className={styles.navBadge} aria-label={`${badgeCount} pendientes`}>
                  {badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
