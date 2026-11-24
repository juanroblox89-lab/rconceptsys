import type { ReactNode } from "react";
import styles from "./CabeceraPagina.module.css";

export function CabeceraPagina({ titulo, detalle, acciones }: { titulo: string; detalle?: ReactNode; acciones?: ReactNode }) {
  return <header className={styles.cabecera} data-rc-cabecera>
    <div><h1>{titulo}</h1>{detalle && <p>{detalle}</p>}</div>
    {acciones && <div className={styles.acciones}>{acciones}</div>}
  </header>;
}
