"use client";

import { useId, useState } from "react";
import { Copy } from "lucide-react";
import { normalizarGuion, previsualizarGuion } from "@/lib/guion-trabajo";
import { Boton } from "@/components/ui/Boton";
import styles from "./FlujoTrabajo.module.css";

export function GuionTrabajo({ guion }: { guion?: string }) {
  const id = useId();
  const [expandido, setExpandido] = useState(false);
  const [estadoCopia, setEstadoCopia] = useState<{ guion: string; mensaje: string }>();
  if (!guion || !normalizarGuion(guion)) return null;

  const vistaPrevia = previsualizarGuion(guion);
  const tieneMas = vistaPrevia !== guion;
  const textoCompleto = guion;
  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoCompleto);
      setEstadoCopia({ guion: textoCompleto, mensaje: "Guion copiado." });
    } catch {
      setExpandido(true);
      setEstadoCopia({ guion: textoCompleto, mensaje: "No se pudo copiar. Selecciona el texto para copiarlo manualmente." });
    }
  }

  return <section className={styles.guionBloque} aria-labelledby={`${id}-titulo`}>
    <strong id={`${id}-titulo`}>Guion</strong>
    <p id={`${id}-texto`} data-testid="guion-texto" className={styles.guionTexto}>{expandido ? guion : vistaPrevia}</p>
    <div className={styles.guionAcciones}>
      {tieneMas && <Boton variante="secundario" tamano="sm" className={styles.guionAccion}
        aria-expanded={expandido} aria-controls={`${id}-texto`} onClick={() => setExpandido(!expandido)}>
        {expandido ? "Ver menos" : "Ver completo"}
      </Boton>}
      <Boton variante="fantasma" tamano="sm" className={styles.guionAccion} onClick={() => void copiar()}>
        <Copy size={15} aria-hidden="true" /> Copiar guion
      </Boton>
      <span role="status" className={styles.guionEstado}>{estadoCopia?.guion === guion ? estadoCopia.mensaje : ""}</span>
    </div>
  </section>;
}
