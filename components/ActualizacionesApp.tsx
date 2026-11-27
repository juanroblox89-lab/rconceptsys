"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Boton } from "@/components/ui/Boton";
import styles from "./ActualizacionesApp.module.css";

const VERSION_CODE_ACTUAL = 2;
const VERSION_NOMBRE_ACTUAL = "1.0.1";
const KEY_BUSCAR = "rc-updates-auto-check";
const KEY_INSTALAR = "rc-updates-auto-install";

interface VersionRemota {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  notes?: string;
}

export function ActualizacionesApp() {
  const [buscarAuto, setBuscarAuto] = useState(true);
  const [instalarAuto, setInstalarAuto] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [estado, setEstado] = useState(`Versión ${VERSION_NOMBRE_ACTUAL} · Al día`);
  const [remota, setRemota] = useState<VersionRemota | null>(null);

  const comprobar = useCallback(async (silencioso = false) => {
    setBuscando(true);
    if (!silencioso) setEstado("Buscando actualizaciones...");
    try {
      const res = await fetch(`/app/version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("No disponible");
      const data = (await res.json()) as VersionRemota;
      if (typeof data.versionCode === "number" && data.versionCode > VERSION_CODE_ACTUAL && data.apkUrl) {
        setRemota(data);
        setEstado(`Nueva versión disponible: v${data.versionName}`);
      } else {
        setRemota(null);
        setEstado(`Versión ${VERSION_NOMBRE_ACTUAL} · Estás al día.`);
      }
    } catch {
      setEstado(`Versión ${VERSION_NOMBRE_ACTUAL} · No se pudo comprobar ahora.`);
    } finally {
      setBuscando(false);
    }
  }, []);

  useEffect(() => {
    try {
      const b = window.localStorage.getItem(KEY_BUSCAR);
      const i = window.localStorage.getItem(KEY_INSTALAR);
      const nb = b === null ? true : b === "true";
      const ni = i === null ? true : i === "true";
      setBuscarAuto(nb);
      setInstalarAuto(ni);
      if (nb) void comprobar(true);
      else setEstado("La búsqueda automática está desactivada.");
    } catch {
      void comprobar(true);
    }
  }, [comprobar]);

  const alternarBuscar = () => {
    const next = !buscarAuto;
    setBuscarAuto(next);
    try { window.localStorage.setItem(KEY_BUSCAR, String(next)); } catch {}
    if (!next) setEstado("La búsqueda automática está desactivada.");
    else void comprobar(true);
  };

  const alternarInstalar = () => {
    const next = !instalarAuto;
    setInstalarAuto(next);
    try { window.localStorage.setItem(KEY_INSTALAR, String(next)); } catch {}
  };

  return (
    <section data-rc-panel className={styles.caja} aria-label="Actualizaciones">
      <h2 className={styles.titulo}>Actualizaciones</h2>
      <div className={styles.grupo}>
        <div className={styles.fila}>
          <div className={styles.izq}>
            <RefreshCw size={18} className={styles.icono} aria-hidden="true" />
            <div>
              <div className={styles.etiqueta}>Buscar actualizaciones automáticamente</div>
              <p className={styles.desc}>La app comprueba si hay una versión nueva al abrirse.</p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={buscarAuto}
            aria-label="Buscar actualizaciones automáticamente"
            className={`${styles.interruptor} ${buscarAuto ? styles.interruptorActivo : ""}`}
            onClick={alternarBuscar}
          >
            <span className={styles.bolita} />
          </button>
        </div>

        <div className={`${styles.fila} ${styles.subFila}`}>
          <div className={styles.izq}>
            <div>
              <div className={styles.etiqueta}>Instalar actualizaciones automáticamente</div>
              <p className={styles.desc}>Descarga y abre el instalador cuando haya una nueva versión.</p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={instalarAuto}
            aria-label="Instalar actualizaciones automáticamente"
            className={`${styles.interruptor} ${instalarAuto ? styles.interruptorActivo : ""}`}
            onClick={alternarInstalar}
          >
            <span className={styles.bolita} />
          </button>
        </div>

        <div className={`${styles.fila} ${styles.pieFila}`}>
          <div className={styles.izq}>
            <RefreshCw size={18} className={`${styles.icono} ${buscando ? styles.girando : ""}`} aria-hidden="true" />
            <div>
              <div className={styles.etiqueta}>Esta versión (v{VERSION_NOMBRE_ACTUAL})</div>
              <p className={styles.desc}>{estado}</p>
            </div>
          </div>
          <div className={styles.acciones}>
            {remota ? (
              <a href={remota.apkUrl} download className={styles.enlaceAct}>
                Actualizar
              </a>
            ) : null}
            <Boton variante="secundario" disabled={buscando} onClick={() => void comprobar(false)}>
              {buscando ? "Buscando..." : "Buscar"}
            </Boton>
          </div>
        </div>
      </div>
    </section>
  );
}
