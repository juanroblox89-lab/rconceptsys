import { EnlaceExterno } from "@/components/ui/EnlaceExterno";
import { ExternalLink, FileText, FolderOpen } from "lucide-react";
import { enlaceReferenciaDrive, nombreReferenciaVisible, referenciasDelTrabajo } from "@/lib/referencias-trabajo";
import type { ReferenciaDriveTrabajo, Tarea } from "@/lib/types";
import styles from "../FlujoTrabajo.module.css";

export function AbrirReferenciaTrabajo({ referencia }: { referencia: ReferenciaDriveTrabajo }) {
  if (!enlaceReferenciaDrive(referencia.url)) return null;
  const nombre = nombreReferenciaVisible(referencia);
  return <EnlaceExterno className={`rc-btn rc-btn--secundario rc-btn--sm ${styles.botonReferenciaTrabajo}`} href={referencia.url} aria-label={`Abrir ${nombre}`}>
    <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" /><span>Abrir</span>
  </EnlaceExterno>;
}

export function ReferenciasDriveTrabajo({ tarea }: { tarea: Tarea }) {
  const referencias = referenciasDelTrabajo(tarea).filter(r => enlaceReferenciaDrive(r.url));
  if (!referencias.length) return null;
  return <section className={styles.referenciasTrabajo} aria-label="Referencias de Drive">
    <strong>Referencias de Drive</strong>
    <ul className={styles.referencias}>
      {referencias.map(ref => {
        const Icono = ref.tipo === "carpeta" ? FolderOpen : FileText;
        const nombre = nombreReferenciaVisible(ref);
        return <li className={styles.referenciaTrabajo} key={ref.id || ref.url}>
          <Icono size={17} strokeWidth={1.75} aria-hidden="true" />
          <div className={styles.referenciaTexto}>
            {ref.ruta && <span className={styles.rutaReferenciaTrabajo} title={ref.ruta}>{ref.ruta}</span>}
            <span className={styles.nombreReferenciaTrabajo} title={nombre}>{nombre}</span>
          </div>
          <div className={styles.accionesReferenciaTrabajo}><AbrirReferenciaTrabajo referencia={{ ...ref, nombre }} /></div>
        </li>;
      })}
    </ul>
  </section>;
}
