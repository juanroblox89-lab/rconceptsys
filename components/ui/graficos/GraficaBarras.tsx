"use client";

import React from "react";
import styles from "./graficos.module.css";
import { Avatar } from "@/components/ui/Avatar";

export interface ItemBarraGrafica {
  id: string | number;
  nombre: string;
  subtitulo?: string;
  valorPrincipal: number;
  etiquetaPrincipal?: string;
  valorSecundario?: string;
  avatar?: string | null;
}

export interface GraficaBarrasProps {
  items: ItemBarraGrafica[];
  titulo: string;
  subtitulo?: string;
  color?: "azul" | "verde" | "ambar" | "morado" | "gris";
  vacioTexto?: string;
  maximo?: number;
  className?: string;
}

export function GraficaBarras({
  items = [],
  titulo,
  subtitulo,
  color = "azul",
  vacioTexto = "No hay registros",
  maximo,
  className = "",
}: GraficaBarrasProps) {
  const max =
    maximo !== undefined && maximo > 0
      ? maximo
      : Math.max(...items.map((i) => i.valorPrincipal), 1);

  const getClaseBarra = (c: string) => {
    switch (c) {
      case "verde":
        return styles.barraVerde;
      case "ambar":
        return styles.barraAmbar;
      case "morado":
        return styles.barraMorado;
      case "gris":
        return styles.barraGris;
      case "azul":
      default:
        return styles.barraAzul;
    }
  };

  return (
    <div className={`${styles.contenedorGrafica} ${className}`.trim()}>
      <div className={styles.cabeceraGrafica}>
        <div>
          <h3 className={styles.tituloGrafica}>{titulo}</h3>
          {subtitulo && <div className={styles.subtituloGrafica}>{subtitulo}</div>}
        </div>
      </div>

      <div className={styles.cajaSvg}>
        {items.length === 0 ? (
          <div className={styles.vacioGrafica}>{vacioTexto}</div>
        ) : (
          <div className={styles.listaBarras} role="list" aria-label={titulo}>
            {items.map((item, idx) => {
              const porcentaje = Math.min(
                100,
                Math.max(3, Math.round((item.valorPrincipal / max) * 100))
              );
              return (
                <div key={item.id} className={styles.filaBarra} role="listitem">
                  <div className={styles.infoBarra}>
                    <div className={styles.nombreBarra}>
                      {item.avatar !== undefined && (
                        <Avatar
                          iniciales={item.nombre.slice(0, 2).toUpperCase()}
                          src={item.avatar || undefined}
                          tamano={24}
                        />
                      )}
                      <span>
                        <strong style={{ fontWeight: 600, color: "var(--rc-texto-secundario)" }}>
                          #{idx + 1}
                        </strong>{" "}
                        {item.nombre}
                      </span>
                    </div>
                    <div className={styles.cifrasBarra}>
                      <span className={styles.cifraPrincipal}>
                        {item.etiquetaPrincipal || `${item.valorPrincipal} trab.`}
                      </span>
                      {item.valorSecundario && (
                        <span className={styles.cifraSecundaria}>
                          {item.valorSecundario}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.pistaBarra}>
                    <div
                      className={`${styles.rellenoBarra} ${getClaseBarra(color)}`}
                      style={{ width: `${porcentaje}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tabla alternativa accesible para lectores de pantalla */}
        <table className={styles.tablaOculta}>
          <caption>{titulo}</caption>
          <thead>
            <tr>
              <th scope="col">Nombre</th>
              <th scope="col">Cantidad</th>
              <th scope="col">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.nombre}</td>
                <td>{it.etiquetaPrincipal || it.valorPrincipal}</td>
                <td>{it.valorSecundario || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
