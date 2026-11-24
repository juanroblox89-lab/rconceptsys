"use client";

import { Check } from "lucide-react";
import React, { forwardRef } from "react";

export interface CasillaProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  etiqueta?: React.ReactNode;
  contenedorClassName?: string;
}

export const Casilla = forwardRef<HTMLInputElement, CasillaProps>(function Casilla(
  { etiqueta, children, contenedorClassName = "", className = "", ...props },
  ref
) {
  return (
    <label className={`rc-check ${contenedorClassName}`.trim()}>
      <input
        ref={ref}
        type="checkbox"
        className={`rc-check__input ${className}`.trim()}
        {...props}
      />
      <span className="rc-check__caja" aria-hidden="true">
        <Check size={13} strokeWidth={2.5} />
      </span>
      {(etiqueta || children) && <span>{etiqueta || children}</span>}
    </label>
  );
});
