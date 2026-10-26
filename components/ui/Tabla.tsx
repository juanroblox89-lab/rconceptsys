"use client";

import React, { forwardRef } from "react";

export interface TablaProps extends React.TableHTMLAttributes<HTMLTableElement> {
  contenedorClassName?: string;
}

export const Tabla = forwardRef<HTMLTableElement, TablaProps>(function Tabla(
  { contenedorClassName = "", className = "", children, ...props },
  ref
) {
  return (
    <div className={`rc-tabla-contenedor ${contenedorClassName}`.trim()}>
      <table ref={ref} className={`rc-tabla ${className}`.trim()} {...props}>
        {children}
      </table>
    </div>
  );
});

export interface TablaFilaProps extends React.HTMLAttributes<HTMLTableRowElement> {
  seleccionada?: boolean;
}

export const TablaFila = forwardRef<HTMLTableRowElement, TablaFilaProps>(
  function TablaFila({ seleccionada = false, className = "", children, ...props }, ref) {
    return (
      <tr
        ref={ref}
        className={`rc-tabla__fila ${
          seleccionada ? "rc-tabla__fila--seleccionada" : ""
        } ${className}`.trim()}
        {...props}
      >
        {children}
      </tr>
    );
  }
);
