import { EnlaceExterno } from "@/components/ui/EnlaceExterno";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import styles from "@/components/FlujoTrabajo.module.css";

export default async function DriveCambioPage({ searchParams }: { searchParams: Promise<{ archivo?: string; volver?: string }> }) {
  const { archivo, volver } = await searchParams;
  const id = typeof archivo === "string" && /^[\w-]{3,160}$/.test(archivo) ? archivo : "";
  const destino = typeof volver === "string" && /^(?:\/clientes(?:\/\d+|\?cliente=\d+)?|\/tareas(?:\?tarea=\d+#tarea-\d+)?|\/asignaciones\?trabajo=\d+#trabajo-\d+)$/.test(volver) ? volver : "/";
  return <div className={styles.pagina}>
    <header className={styles.cabecera}><div><h1>Cambio en Drive</h1>{!id && <p>No encontramos el archivo de este aviso.</p>}</div></header>
    <div className={styles.acciones}>
      {id && <EnlaceExterno className={`rc-btn rc-btn--secundario rc-btn--sm ${styles.enlace}`} href={`https://drive.google.com/open?id=${encodeURIComponent(id)}`}>Abrir archivo en Drive <ExternalLink size={16} aria-hidden="true" /></EnlaceExterno>}
      <Link className={`rc-btn rc-btn--secundario rc-btn--sm ${styles.enlace}`} href={destino}>Volver al trabajo o cliente</Link>
    </div>
  </div>;
}
