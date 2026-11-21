"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MessagesSquare,
  Users,
  Shield,
  CheckSquare,
  Receipt,
  PanelLeftClose,
  ChevronDown,
  ChevronUp,
  Briefcase, Contact,
  Settings, Sparkles, CircleHelp, SlidersHorizontal,
  LogOut,
  User,
  ChevronsUpDown,
  Video,
  Layers,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { CampanaNotificaciones } from "@/components/CampanaNotificaciones";
import { Avatar } from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { AsignacionResumen, Perfil } from "@/lib/types";
import styles from "./Sidebar.module.css";

interface NavItemDef {
  id: string;
  title: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  workerOnly?: boolean;
  soloRiel?: boolean;
}

export const navItems: NavItemDef[] = [
  { id: "chat", title: "Chat del equipo", href: "/", icon: MessagesSquare },
  { id: "ria", title: "RIA", href: "/ria", icon: Sparkles },
  { id: "tareas", title: "Tareas", href: "/tareas", icon: CheckSquare },
  { id: "factura", title: "Mi factura", href: "/factura", icon: Receipt, workerOnly: true },
  { id: "equipo", title: "Equipo", href: "/equipo", icon: Users },
  { id: "asignaciones", title: "Trabajos", href: "/asignaciones", icon: Briefcase, adminOnly: true },
  { id: "clientes", title: "Clientes", href: "/clientes", icon: Contact, adminOnly: true },
  { id: "admin", title: "Gestión", href: "/admin", icon: Shield, adminOnly: true },
];

export interface SidebarProps {
  open?: boolean;
  onNavigate?: () => void;
  onCollapse?: () => void;
}

// Título corto de una asignación: "Entrega Bruno", "Edición Mateo"...
function etiquetaReciente(asignacion: AsignacionResumen): string {
  const tarea = asignacion.tarea;
  const clave = tarea.tipo?.clave ?? "";
  const persona = (tarea.asignado?.nombre ?? "").trim().split(" ")[0];
  if (clave.includes("grabacion")) return persona ? `Grabación ${persona}` : "Grabación";
  if (clave.includes("edicion")) return persona ? `Edición ${persona}` : "Edición";
  if (clave.includes("subida")) return persona ? `Subida ${persona}` : "Subida";
  return tarea.titulo;
}

function iconoReciente(clave: string): LucideIcon {
  if (clave.includes("grabacion")) return Video;
  if (clave.includes("edicion")) return Layers;
  return Upload;
}

export function Sidebar({ open = false, onNavigate, onCollapse }: SidebarProps) {
  const pathname = usePathname();
  const [yo, setYo] = useState<Perfil | null>(null);
  const [pendientesCount, setPendientesCount] = useState<number>(0);
  const [porRevisarCount, setPorRevisarCount] = useState<number>(0);
  const [recientes, setRecientes] = useState<AsignacionResumen[]>([]);
  const [recientesAbierto, setRecientesAbierto] = useState(true);
  const [menuPerfil, setMenuPerfil] = useState(false);
  const perfilRef = useRef<HTMLDivElement | null>(null);

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
      api.adminGetRecientes()
        .then((res) => {
          setRecientes(Array.isArray(res?.asignaciones) ? res.asignaciones : []);
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

  // El menú del perfil se cierra al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!menuPerfil) return;
    const fuera = (e: MouseEvent) => {
      if (perfilRef.current && !perfilRef.current.contains(e.target as Node)) setMenuPerfil(false);
    };
    const escapar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuPerfil(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", escapar);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", escapar);
    };
  }, [menuPerfil]);

  const cerrarSesion = async () => {
    try {
      await api.salir();
    } catch {
      // Aunque falle, se va al login.
    }
    window.location.replace("/login");
  };

  const itemsVisibles = navItems.filter((item) => {
    if (item.soloRiel) return false;
    if (item.adminOnly && !yo?.es_admin) return false;
    if (item.workerOnly && yo?.es_admin) return false;
    return true;
  });

  const novedades = recientes.filter((r) => r.novedad).length;
  const rolEtiqueta = yo?.es_admin
    ? "Admin"
    : yo?.roles && yo.roles.length > 0
      ? yo.roles.map((r) => r.nombre).join(" · ")
      : null;

  return (
    <div className={`${styles.root} ${open ? styles.rootOpen : ""}`}>
      <div className={styles.topRow}>
        <Link href="/" className={styles.brand} aria-label="Ir al inicio" onClick={() => onNavigate?.()}>
          <Logo size={16} />
        </Link>
        {yo?.estado === "aprobado" && <CampanaNotificaciones barra />}
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
            // Para admin: cantidad de tareas esperando revisión
            // Para trabajador: cantidad de tareas pendientes por realizar
            badgeCount = yo?.es_admin ? porRevisarCount : pendientesCount;
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
                <Icon size={20} strokeWidth={1.75} />
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

        {yo?.es_admin && (
          <section className={styles.recientes} aria-label="Recientes">
            <button
              type="button"
              className={styles.recientesCabecera}
              onClick={() => setRecientesAbierto((v) => !v)}
              aria-expanded={recientesAbierto}
            >
              <span className={styles.recientesTitulo}>Recientes</span>
              {novedades > 0 && <span className={styles.recientesPunto} aria-label={`${novedades} sin ver`} />}
              {recientesAbierto ? (
                <ChevronUp size={13} strokeWidth={2} aria-hidden="true" />
              ) : (
                <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
              )}
            </button>

            {recientesAbierto && (
              <div className={styles.recientesLista}>
                {recientes.length === 0 ? (
                  <p className={styles.recientesVacio}>Sin movimiento todavía.</p>
                ) : (
                  recientes.map((asignacion) => {
                    const Icono = iconoReciente(asignacion.tarea.tipo?.clave ?? "");
                    return (
                      <Link
                        key={asignacion.tarea.id}
                        href="/asignaciones"
                        className={styles.recienteItem}
                        onClick={() => onNavigate?.()}
                        title={asignacion.tarea.titulo}
                      >
                        <span className={styles.recienteIcono}>
                          <Icono size={13} strokeWidth={1.75} aria-hidden="true" />
                        </span>
                        <span className={styles.recienteTexto}>{etiquetaReciente(asignacion)}</span>
                        {asignacion.novedad && <span className={styles.recientePunto} aria-label="Nueva" />}
                      </Link>
                    );
                  })
                )}
                <Link href="/asignaciones" className={styles.recienteVerTodas} onClick={() => onNavigate?.()}>
                  Ver todas
                </Link>
              </div>
            )}
          </section>
        )}
      </nav>

      <div className={styles.perfil} ref={perfilRef}>
        <button
          type="button"
          className={styles.perfilBoton}
          onClick={() => setMenuPerfil((v) => !v)}
          aria-expanded={menuPerfil}
          aria-haspopup="menu"
          aria-label="Mi perfil"
        >
          <Avatar
            tamano={32}
            src={yo?.foto_path || undefined}
            iniciales={(yo?.nombre || "?").charAt(0).toUpperCase()}
            alt={yo?.nombre || "Mi perfil"}
          />
          <span className={styles.perfilTexto}>
            <span className={styles.perfilNombre}>{yo?.nombre || "Mi perfil"}</span>
            {rolEtiqueta ? <span className={styles.perfilRol}>· {rolEtiqueta}</span> : null}
          </span>
          <ChevronsUpDown size={13} strokeWidth={2} className={styles.perfilFlecha} aria-hidden="true" />
        </button>

        {menuPerfil && (
          <div className={styles.perfilMenu} role="menu" aria-label="Opciones de mi perfil">
            {[
              { href: "/personalizacion", nombre: "Personalización", Icon: SlidersHorizontal },
              { href: "/perfil", nombre: "Perfil", Icon: User },
              { href: "/configuracion", nombre: "Configuración", Icon: Settings },
              { href: "/ria?ayuda=1", nombre: "Ayuda", Icon: CircleHelp },
            ].map(({ href, nombre, Icon }, i) => (
              <div key={href} role="none">
                {i === 3 && <hr role="separator" className={styles.perfilSeparador} />}
                <Link href={href} role="menuitem" className={styles.perfilMenuItem} onClick={() => { setMenuPerfil(false); onNavigate?.(); }}>
                  <Icon size={20} strokeWidth={1.75} aria-hidden="true" />{nombre}
                </Link>
              </div>
            ))}
            <button
              type="button"
              role="menuitem"
              className={styles.perfilMenuItem}
              onClick={() => {
                setMenuPerfil(false);
                void cerrarSesion();
              }}
            >
              <LogOut size={14} strokeWidth={1.75} aria-hidden="true" />
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
