import { ExternalLink, FileText, FolderOpen } from "lucide-react";
import { enlaceReferenciaDrive, referenciasDelTrabajo } from "@/lib/referencias-trabajo";
import type { ReferenciaDriveTrabajo, Tarea } from "@/lib/types";
import styles from "../FlujoTrabajo.module.css";

export function AbrirReferenciaTrabajo({ referencia }: { referencia: ReferenciaDriveTrabajo }) {
  if (!enlaceReferenciaDrive(referencia.url)) return null;
  return <a className={`rc-btn rc-btn--secundario rc-btn--sm ${styles.botonReferenciaTrabajo}`} href={referencia.url}
    target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${referencia.nombre}`}>
    <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" /><span>Abrir</span>
  </a>;
}

export function ReferenciasDriveTrabajo({ tarea }: { tarea: Tarea }) {
  const referencias = referenciasDelTrabajo(tarea).filter(r => enlaceReferenciaDrive(r.url));
  if (!referencias.length) return null;
  return <section className={styles.referenciasTrabajo} aria-label="Referencias de Drive">
    <strong>Referencias de Drive</strong>
    <ul className={styles.referencias}>
      {referencias.map(ref => {
        const Icono = ref.tipo === "carpeta" ? FolderOpen : FileText;
        return <li className={styles.referenciaTrabajo} key={ref.id || ref.url}>
          <Icono size={17} strokeWidth={1.75} aria-hidden="true" />
          <span className={styles.nombreReferenciaTrabajo} title={ref.nombre}>{ref.nombre}</span>
          <div className={styles.accionesReferenciaTrabajo}><AbrirReferenciaTrabajo referencia={ref} /></div>
        </li>;
      })}
    </ul>
  </section>;
}
