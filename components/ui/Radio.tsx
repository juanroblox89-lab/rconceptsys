"use client";

import React, { forwardRef } from "react";

export interface RadioProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  etiqueta?: React.ReactNode;
  contenedorClassName?: string;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { etiqueta, children, contenedorClassName = "", className = "", ...props },
  ref
) {
  return (
    <label className={`rc-radio ${contenedorClassName}`.trim()}>
      <input
        ref={ref}
        type="radio"
        className={`rc-radio__input ${className}`.trim()}
        {...props}
      />
      <span className="rc-radio__circulo" aria-hidden="true" />
      {(etiqueta || children) && <span>{etiqueta || children}</span>}
    </label>
  );
});
