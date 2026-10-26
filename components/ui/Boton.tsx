"use client";

import React, { forwardRef } from "react";

export type BotonVariante =
  | "primario"
  | "vidrio"
  | "secundario"
  | "fantasma"
  | "peligro"
  | "peligro-vidrio"
  | "pildora"
  | "icono";

export type BotonTamano = "sm" | "md";

export interface BotonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: BotonVariante;
  tamano?: BotonTamano;
  cargando?: boolean;
  /** Clase forzada de estado para exhibición estática (hover/activo/deshabilitado) */
  estadoVisual?: "hover" | "activo" | "deshabilitado";
  envoltorioClassName?: string;
}

export const Boton = forwardRef<HTMLButtonElement, BotonProps>(function Boton(
  {
    variante = "primario",
    tamano = "md",
    cargando = false,
    estadoVisual,
    envoltorioClassName = "",
    className = "",
    disabled,
    children,
    type = "button",
    ...props
  },
  ref
) {
  const clases: string[] = ["rc-btn"];

  if (variante === "primario") clases.push("rc-btn--primario");
  else if (variante === "vidrio") clases.push("rc-btn--vidrio rc-vidrio rc-vidrio--azul");
  else if (variante === "secundario") clases.push("rc-btn--secundario");
  else if (variante === "fantasma") clases.push("rc-btn--fantasma");
  else if (variante === "peligro") clases.push("rc-btn--peligro");
  else if (variante === "peligro-vidrio") clases.push("rc-btn--peligro-vidrio rc-vidrio rc-vidrio--rojo");
  else if (variante === "pildora") clases.push("rc-btn--pildora");
  else if (variante === "icono") clases.push("rc-btn--icono");

  if (tamano === "sm") clases.push("rc-btn--sm");

  if (cargando) clases.push("rc-btn--cargando");
  if (estadoVisual === "hover") clases.push("rc-btn--hover");
  if (estadoVisual === "activo") clases.push("rc-btn--activo");
  if (estadoVisual === "deshabilitado" || disabled) clases.push("rc-btn--deshabilitado");

  if (className) clases.push(className);

  const btnElement = (
    <button
      ref={ref}
      type={type}
      className={clases.join(" ")}
      disabled={disabled || cargando || estadoVisual === "deshabilitado"}
      aria-busy={cargando ? "true" : undefined}
      {...props}
    >
      {cargando ? <span className="rc-spinner" aria-hidden="true" /> : children}
    </button>
  );

  if (variante === "vidrio") {
    return (
      <div className={`rc-escena-vidrio ${envoltorioClassName}`.trim()}>
        <span className="rc-mancha rc-mancha--azul" aria-hidden="true" />
        {btnElement}
      </div>
    );
  }

  if (variante === "peligro-vidrio") {
    return (
      <div className={`rc-escena-vidrio ${envoltorioClassName}`.trim()}>
        <span className="rc-mancha rc-mancha--rojo" aria-hidden="true" />
        {btnElement}
      </div>
    );
  }

  return btnElement;
});
