"use client";

import React from "react";

export type EstadoVariante = "pendiente" | "aprobado" | "suspendido" | "error";

export interface EstadoProps extends React.HTMLAttributes<HTMLSpanElement> {
  variante: EstadoVariante;
  enTabla?: boolean;
}

const CONFIG_PUNTOS: Record<EstadoVariante, { punto: string; textoDefault: string }> = {
  pendiente: { punto: "ambar", textoDefault: "Pendiente" },
  aprobado: { punto: "verde", textoDefault: "Aprobado" },
  suspendido: { punto: "gris", textoDefault: "Suspendido" },
  error: { punto: "rojo", textoDefault: "Error" },
};

export function Estado({
  variante,
  enTabla = false,
  className = "",
  children,
  ...props
}: EstadoProps) {
  const cfg = CONFIG_PUNTOS[variante];
  const claseBase = enTabla ? "rc-estado-tabla" : "rc-estado";

  return (
    <span className={`${claseBase} rc-estado--${variante} ${className}`.trim()} {...props}>
      <span className={`rc-punto rc-punto--${cfg.punto}`} aria-hidden="true" />
      {children || cfg.textoDefault}
    </span>
  );
}
