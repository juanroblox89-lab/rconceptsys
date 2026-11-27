import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, CalendarDays } from "lucide-react";
import type { EstadoTarea, Tarea } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import styles from "./FlujoTrabajo.module.css";

export const ESTADOS_TRABAJO: Record<EstadoTarea, string> = {
  pendiente: "Pendiente", hecha: "Entregado", aceptada: "Aprobado", rechazada: "Devuelto", cancelada: "Cancelado",
};

export function fechaTrabajo(iso?: string | null) {
  if (!iso) return "Sin fecha";
  const fechaCivil = iso.length === 10;
  const fecha = new Date(fechaCivil ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(fecha.getTime())) return "Sin fecha";
  return fecha.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: fechaCivil ? "UTC" : "America/Bogota" });
}

export function fechaHoraTrabajo(iso?: string | null) {
  if (!iso) return "Sin fecha";
  if (iso.length === 10) return fechaTrabajo(iso);
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "Sin fecha";
  return fecha.toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Bogota",
  });
}

export function trabajoVencido(tarea: Tarea) {
  if (!tarea.fecha_limite || !["pendiente", "rechazada"].includes(tarea.estado)) return false;
  const partes = new Intl.DateTimeFormat("en", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const hoy = ["year", "month", "day"].map(tipo => partes.find(p => p.type === tipo)?.value).join("-");
  return tarea.fecha_limite < hoy;
}

export function EstadoTrabajo({ tarea }: { tarea: Tarea }) {
  const vencido = trabajoVencido(tarea);
  return <span className={styles.estadoTrabajo} data-estado={vencido ? "vencido" : tarea.estado}>{vencido ? "Vencido" : ESTADOS_TRABAJO[tarea.estado]}</span>;
}

export function FilaTrabajo({ tarea, origen, id, novedad, resaltado, soloLectura, accion }: { tarea: Tarea; origen: string; id?: string; novedad?: boolean; resaltado?: boolean; soloLectura?: boolean; accion?: ReactNode }) {
  const persona = tarea.asignado?.nombre ?? "Sin asignar";
  return <li id={id} className={styles.filaTrabajo} data-resaltado={resaltado || undefined} data-acciones={accion ? true : undefined}>
    <div className={styles.trabajoTitulo}>
      <strong title={tarea.titulo}>{tarea.titulo}{novedad && <span className={styles.novedad} aria-label="Nuevo" />}</strong>
      <span title={tarea.cliente?.nombre}>{tarea.cliente?.nombre ?? "Sin cliente"}</span>
    </div>
    <div className={styles.trabajoPersona}>
      <Avatar src={tarea.asignado?.foto_path || undefined} iniciales={tarea.asignado?.nombre?.slice(0, 1).toUpperCase() ?? "–"} tamano={24} alt="" />
      <span title={persona}>{persona}</span>
    </div>
    <div className={styles.trabajoMeta}>
      <span>{tarea.tipo?.nombre ?? "Trabajo"}</span>
      <small><CalendarDays size={13} aria-hidden="true" />{tarea.fecha_limite ? fechaTrabajo(tarea.fecha_limite) : "Sin fecha límite"}</small>
    </div>
    <EstadoTrabajo tarea={tarea} />
    <div className={styles.filaAcciones}><Link className={`rc-btn rc-btn--secundario rc-btn--sm ${styles.abrir}`} href={soloLectura ? `/tareas?tarea=${tarea.id}#tarea-${tarea.id}` : `/trabajos/${tarea.id}?desde=${encodeURIComponent(origen)}`} aria-label={`Abrir trabajo: ${tarea.titulo}`}>Abrir <ChevronRight size={14} aria-hidden="true" /></Link>{accion}</div>
  </li>;
}
