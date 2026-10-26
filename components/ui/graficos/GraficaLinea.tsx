"use client";

import React, { useState, useId } from "react";
import styles from "./graficos.module.css";
import { PuntoSerieAdmin } from "@/lib/types";

export type MetricaGrafica = "trabajos" | "minutos" | "valor";

export interface GraficaLineaProps {
  serie: PuntoSerieAdmin[];
  titulo?: string;
  subtitulo?: string;
  metricaInicial?: MetricaGrafica;
  onCambiarMetrica?: (metrica: MetricaGrafica) => void;
  className?: string;
}

export function GraficaLinea({
  serie = [],
  titulo = "Evolución en el tiempo",
  subtitulo,
  metricaInicial = "trabajos",
  onCambiarMetrica,
  className = "",
}: GraficaLineaProps) {
  const [metrica, setMetrica] = useState<MetricaGrafica>(metricaInicial);
  const [indiceHover, setIndiceHover] = useState<number | null>(null);
  const gradientId = useId();

  const cambiarMetrica = (nueva: MetricaGrafica) => {
    setMetrica(nueva);
    if (onCambiarMetrica) onCambiarMetrica(nueva);
  };

  const getValor = (p: PuntoSerieAdmin, m: MetricaGrafica): number => {
    switch (m) {
      case "minutos":
        return p.minutos;
      case "valor":
        return p.valor;
      case "trabajos":
      default:
        return p.trabajos;
    }
  };

  const formatearValor = (val: number, m: MetricaGrafica): string => {
    if (m === "valor") {
      return `$ ${new Intl.NumberFormat("es-CO").format(val)}`;
    }
    if (m === "minutos") {
      return `${new Intl.NumberFormat("es-CO").format(val)} min`;
    }
    return `${new Intl.NumberFormat("es-CO").format(val)}`;
  };

  const etiquetaMetrica = (m: MetricaGrafica): string => {
    switch (m) {
      case "minutos":
        return "Minutos";
      case "valor":
        return "Valor (COP)";
      case "trabajos":
      default:
        return "Trabajos";
    }
  };

  const valores = serie.map((p) => getValor(p, metrica));
  const maxValor = Math.max(...valores, 1);
  const minValor = 0;

  // Dimensiones SVG
  const anchoSvg = 640;
  const altoSvg = 200;
  const paddingX = 40;
  const paddingY = 25;
  const areaAncho = anchoSvg - paddingX * 2;
  const areaAlto = altoSvg - paddingY * 2;

  const getCoordenadas = (indice: number, valor: number) => {
    const x =
      serie.length > 1
        ? paddingX + (indice / (serie.length - 1)) * areaAncho
        : paddingX + areaAncho / 2;
    const rango = maxValor - minValor;
    const ratio = rango > 0 ? (valor - minValor) / rango : 0;
    const y = altoSvg - paddingY - ratio * areaAlto;
    return { x, y };
  };

  const puntosCoordenadas = serie.map((p, i) => getCoordenadas(i, getValor(p, metrica)));

  // Generar path de línea
  let lineaPath = "";
  let areaPath = "";
  if (puntosCoordenadas.length > 0) {
    lineaPath = puntosCoordenadas.reduce(
      (acc, curr, i) => (i === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`),
      ""
    );
    const primerX = puntosCoordenadas[0].x;
    const ultimoX = puntosCoordenadas[puntosCoordenadas.length - 1].x;
    const baseY = altoSvg - paddingY;
    areaPath = `${lineaPath} L ${ultimoX} ${baseY} L ${primerX} ${baseY} Z`;
  }

  // Generar 4 niveles de cuadrícula Y
  const nivelesY = [0, 0.33, 0.66, 1].map((ratio) => {
    const val = Math.round(minValor + ratio * (maxValor - minValor));
    const y = altoSvg - paddingY - ratio * areaAlto;
    return { valor: val, y };
  });

  // Etiquetas eje X (mostrar máximo 6 etiquetas uniformes para evitar solapamiento)
  const pasoX = serie.length > 6 ? Math.ceil(serie.length / 6) : 1;
  const etiquetasX = serie
    .map((p, i) => ({ fecha: p.fecha, i, x: getCoordenadas(i, 0).x }))
    .filter((_, idx) => idx % pasoX === 0 || idx === serie.length - 1);

  const puntoSeleccionado =
    indiceHover !== null && serie[indiceHover] ? serie[indiceHover] : null;

  return (
    <div className={`${styles.contenedorGrafica} ${className}`.trim()}>
      <div className={styles.cabeceraGrafica}>
        <div>
          <h3 className={styles.tituloGrafica}>{titulo}</h3>
          {subtitulo && <div className={styles.subtituloGrafica}>{subtitulo}</div>}
        </div>
        <div className={styles.tabsMetrica} role="tablist" aria-label="Métrica de gráfica">
          <button
            type="button"
            role="tab"
            aria-selected={metrica === "trabajos"}
            className={`${styles.tabBtn} ${metrica === "trabajos" ? styles.tabBtnActivo : ""}`}
            onClick={() => cambiarMetrica("trabajos")}
          >
            Trabajos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={metrica === "minutos"}
            className={`${styles.tabBtn} ${metrica === "minutos" ? styles.tabBtnActivo : ""}`}
            onClick={() => cambiarMetrica("minutos")}
          >
            Minutos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={metrica === "valor"}
            className={`${styles.tabBtn} ${metrica === "valor" ? styles.tabBtnActivo : ""}`}
            onClick={() => cambiarMetrica("valor")}
          >
            Valor
          </button>
        </div>
      </div>

      <div className={styles.cajaSvg}>
        {puntoSeleccionado && (
          <div className={styles.tooltipCaja} role="status" aria-live="polite">
            <span className={styles.tooltipFecha}>{puntoSeleccionado.fecha}</span>
            <span className={styles.tooltipValor}>
              {formatearValor(getValor(puntoSeleccionado, metrica), metrica)}
            </span>
          </div>
        )}

        {serie.length === 0 ? (
          <div className={styles.vacioGrafica}>No hay datos en el rango seleccionado.</div>
        ) : (
          <svg
            className={styles.svgLinea}
            viewBox={`0 0 ${anchoSvg} ${altoSvg}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`${titulo}: serie temporal de ${etiquetaMetrica(metrica)}`}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5AA9FF" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#5AA9FF" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Líneas de cuadrícula horizontal */}
            {nivelesY.map((lvl, idx) => (
              <g key={idx}>
                <line
                  x1={paddingX}
                  y1={lvl.y}
                  x2={anchoSvg - paddingX}
                  y2={lvl.y}
                  className={styles.gridLinea}
                />
                <text
                  x={paddingX - 6}
                  y={lvl.y + 3}
                  textAnchor="end"
                  className={styles.ejeTexto}
                >
                  {metrica === "valor"
                    ? lvl.valor >= 1_000_000
                      ? `$ ${(lvl.valor / 1_000_000).toFixed(1)}M`
                      : lvl.valor >= 1000
                      ? `$ ${Math.round(lvl.valor / 1000)}k`
                      : `$ ${lvl.valor}`
                    : lvl.valor}
                </text>
              </g>
            ))}

            {/* Área sombreada */}
            {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}

            {/* Línea principal */}
            {lineaPath && (
              <path
                d={lineaPath}
                fill="none"
                stroke="#2F7FE0"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Puntos interactivos */}
            {puntosCoordenadas.map((coord, i) => {
              const esHover = indiceHover === i;
              return (
                <g key={i}>
                  <circle
                    cx={coord.x}
                    cy={coord.y}
                    r={esHover ? 6 : serie.length <= 15 ? 4 : 2.5}
                    fill={esHover ? "#2F7FE0" : "#FFFFFF"}
                    stroke="#2F7FE0"
                    strokeWidth={esHover ? "2.5" : "1.75"}
                    className={styles.puntoActivo}
                    onMouseEnter={() => setIndiceHover(i)}
                    onMouseLeave={() => setIndiceHover(null)}
                    onTouchStart={() => setIndiceHover(i)}
                  />
                  {/* Zona táctil expandida */}
                  <circle
                    cx={coord.x}
                    cy={coord.y}
                    r={14}
                    fill="transparent"
                    onMouseEnter={() => setIndiceHover(i)}
                    onMouseLeave={() => setIndiceHover(null)}
                    onTouchStart={() => setIndiceHover(i)}
                  />
                </g>
              );
            })}

            {/* Etiquetas eje X */}
            {etiquetasX.map((et, idx) => {
              const partes = et.fecha.split("-");
              const label = partes.length >= 3 ? `${partes[2]}/${partes[1]}` : et.fecha;
              return (
                <text
                  key={idx}
                  x={et.x}
                  y={altoSvg - paddingY + 16}
                  textAnchor="middle"
                  className={styles.ejeTexto}
                >
                  {label}
                </text>
              );
            })}
          </svg>
        )}

        {/* Tabla alternativa accesible para lectores de pantalla */}
        <table className={styles.tablaOculta}>
          <caption>{titulo}</caption>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">{etiquetaMetrica(metrica)}</th>
            </tr>
          </thead>
          <tbody>
            {serie.map((p) => (
              <tr key={p.fecha}>
                <td>{p.fecha}</td>
                <td>{formatearValor(getValor(p, metrica), metrica)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
