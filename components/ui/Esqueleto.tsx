"use client";

import React from "react";

export interface EsqueletoProps extends React.HTMLAttributes<HTMLDivElement> {
  filas?: number;
  tipo?: "tarjeta" | "linea" | "circulo";
  ancho?: string | number;
  alto?: string | number;
}

export function Esqueleto({
  filas = 3,
  tipo = "tarjeta",
  ancho,
  alto,
  className = "",
  style,
  ...props
}: EsqueletoProps) {
  if (tipo === "circulo") {
    return (
      <span
        className={`rc-skeleton-circulo ${className}`.trim()}
        aria-hidden="true"
        style={{ width: ancho, height: alto, ...style }}
        {...props}
      />
    );
  }

  if (tipo === "linea") {
    return (
      <span
        className={`rc-skeleton-barra ${className}`.trim()}
        aria-hidden="true"
        style={{ width: ancho, height: alto, ...style }}
        {...props}
      />
    );
  }

  return (
    <div
      className={`rc-skeleton-card ${className}`.trim()}
      aria-hidden="true"
      style={style}
      {...props}
    >
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="rc-skeleton-fila">
          <span className="rc-skeleton-circulo" />
          <div className="rc-skeleton-lineas">
            <span className="rc-skeleton-barra" />
            <span className="rc-skeleton-barra rc-skeleton-barra--corta" />
          </div>
        </div>
      ))}
    </div>
  );
}
