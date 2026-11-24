"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CircleAlert, Info, RefreshCw, X } from "lucide-react";
import { api } from "@/lib/api";
import { ConfigEquipo } from "@/lib/types";
import styles from "./EquipoBarra.module.css";

export interface EquipoBarraProps {
  abierta?: boolean;
  onCerrar?: () => void;
}

// Abrevia cifras como Juan las escribió en el plan: 212,5 k.
function abreviar(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) {
    const miles = n / 1000;
    const texto = miles >= 100 ? String(Math.round(miles)) : miles.toFixed(1).replace(".", ",");
    return `${texto.replace(/,0$/, "")} k`;
  }
  const millones = n / 1_000_000;
  return `${millones.toFixed(1).replace(".", ",").replace(/,0$/, "")} M`;
}

const FILAS_ACTIVIDAD = [
  { clave: "mensajes", etiqueta: "Mensajes" },
  { clave: "tareas", etiqueta: "Tareas" },
  { clave: "miembros", etiqueta: "Miembros" },
  { clave: "archivos", etiqueta: "Archivos" },
] as const;

export function EquipoBarra({ abierta = false, onCerrar }: EquipoBarraProps) {
  const [config, setConfig] = useState<ConfigEquipo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const datos = await api.getEquipoResumen();
      setConfig(datos);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    let activo = true;
    api
      .getEquipoResumen()
      .then((datos) => {
        if (!activo) return;
        setConfig(datos);
        setError(false);
      })
      .catch(() => {
        if (activo) setError(true);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  // Con la hoja abierta en móvil, Escape la cierra.
  useEffect(() => {
    if (!abierta) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierta, onCerrar]);

  const enlaces = config?.enlaces ?? [];

  return (
    <>
      {abierta && <div className={styles.fondo} onClick={() => onCerrar?.()} aria-hidden="true" />}
      <aside
        id="barra-equipo"
        className={`${styles.barra} ${abierta ? styles.abierta : ""}`}
        aria-label="Equipo"
      >
        <div className={styles.cabecera}>
          <h2 className={styles.titulo}>Equipo</h2>
          <div className={styles.cabeceraAcciones}>
            <button
              type="button"
              className={styles.iconoBoton}
              aria-label="Actualizar resumen del equipo"
              title="Actualizar"
              onClick={() => {
                setCargando(true);
                cargar();
              }}
            >
              <RefreshCw size={14} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className={styles.iconoBoton}
              aria-label="Qué muestra esta barra"
              title="Resumen del equipo: nombre, accesos rápidos y actividad total."
            >
              <Info size={14} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className={`${styles.iconoBoton} ${styles.cerrar}`}
              aria-label="Cerrar"
              onClick={() => onCerrar?.()}
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {cargando ? (
          <div className={styles.esqueleto} aria-hidden="true">
            <div className={styles.lineaEsqueleto} />
            <div className={styles.lineaEsqueleto} />
            <div className={styles.lineaEsqueleto} />
          </div>
        ) : error ? (
          <div className={styles.vacio}>
            <CircleAlert size={16} strokeWidth={1.75} />
            <p>No se pudo cargar el resumen del equipo.</p>
            <button type="button" className={styles.reintentar} onClick={() => setCargando(true)}>
              Reintentar
            </button>
          </div>
        ) : (
          <>
            <section className={styles.tarjeta}>
              <p className={styles.etiqueta}>Este equipo</p>
              <h3 className={styles.nombreEquipo}>{config?.nombre}</h3>
              {config?.descripcion ? <p className={styles.descripcion}>{config.descripcion}</p> : null}
            </section>

            <section className={styles.seccion}>
              <p className={styles.etiqueta}>Accesos rápidos</p>
              {enlaces.length === 0 ? (
                <p className={styles.nota}>
                  Sin enlaces.
                </p>
              ) : (
                <ul className={styles.enlaces}>
                  {enlaces
                    .slice()
                    .sort((a, b) => a.orden - b.orden)
                    .map((enlace) => (
                      <li key={enlace.id}>
                        <a
                          href={enlace.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.enlace}
                          title={enlace.url}
                        >
                          <span className={styles.enlaceNombre}>{enlace.nombre}</span>
                          <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden="true" />
                        </a>
                      </li>
                    ))}
                </ul>
              )}
            </section>

            <section className={styles.seccion}>
              <p className={styles.etiqueta}>Actividad</p>
              <ul className={styles.actividad}>
                {FILAS_ACTIVIDAD.map((fila) => (
                  <li key={fila.clave} className={styles.actividadFila}>
                    <span className={styles.actividadNombre}>{fila.etiqueta}</span>
                    <span className={styles.actividadCifra} title={String(config?.actividad[fila.clave] ?? 0)}>
                      {abreviar(config?.actividad[fila.clave] ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className={styles.nota}>Archivos: adjuntos del chat y enlaces de tareas.</p>
            </section>

            <p className={styles.pie}>
              <Link href="/equipo" className={styles.pieEnlace}>
                Ver miembros
              </Link>
            </p>
          </>
        )}
      </aside>
    </>
  );
}
