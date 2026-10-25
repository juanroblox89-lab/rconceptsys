"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  MessagesSquare,
  Users,
  User,
  Shield,
  PanelLeftClose,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { api } from "@/lib/api";
import { Perfil } from "@/lib/types";
import styles from "./Sidebar.module.css";

interface NavItemDef {
  title: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export const navItems: NavItemDef[] = [
  { title: "Chat del equipo", href: "/", icon: MessagesSquare },
  { title: "Equipo", href: "/equipo", icon: Users },
  { title: "Mi perfil", href: "/perfil", icon: User },
  { title: "Administración", href: "/admin", icon: Shield, adminOnly: true },
];

export interface SidebarProps {
  open?: boolean;
  onNavigate?: () => void;
  onCollapse?: () => void;
}

export function Sidebar({ open = false, onNavigate, onCollapse }: SidebarProps) {
  const pathname = usePathname();
  const [yo, setYo] = useState<Perfil | null>(null);

  useEffect(() => {
    let montado = true;
    api.getYo()
      .then((p) => {
        if (montado) setYo(p);
      })
      .catch(() => {
        // En caso de no auth o error
      });
    return () => {
      montado = false;
    };
  }, []);

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
