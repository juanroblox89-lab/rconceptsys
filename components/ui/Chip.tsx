"use client";

import React from "react";

export type PuntoColor = "azul" | "morado" | "verde" | "ambar" | "gris" | "rojo";

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  punto?: PuntoColor | false;
  seleccionado?: boolean;
}

export function Chip({
  punto = "azul",
  seleccionado,
  className = "",
  children,
  ...props
}: ChipProps) {
  return (
    <span
      className={`rc-chip ${seleccionado ? "rc-chip--seleccionado" : ""} ${className}`.trim()}
      {...props}
    >
      {punto && <span className={`rc-punto rc-punto--${punto}`} aria-hidden="true" />}
      {children}
    </span>
  );
}
