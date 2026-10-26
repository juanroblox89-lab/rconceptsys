"use client";

import React, { useState } from "react";

export interface InterruptorProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  etiqueta?: string;
  id?: string;
  className?: string;
}

export function Interruptor({
  checked: checkedProp,
  defaultChecked = false,
  onCheckedChange,
  disabled = false,
  etiqueta = "Interruptor",
  id,
  className = "",
}: InterruptorProps) {
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isControlled = checkedProp !== undefined;
  const activo = isControlled ? checkedProp : internalChecked;

  const handleToggle = () => {
    if (disabled) return;
    const nuevo = !activo;
    if (!isControlled) {
      setInternalChecked(nuevo);
    }
    onCheckedChange?.(nuevo);
  };

  return (
    <div className="rc-escena-vidrio">
      <span className="rc-mancha rc-mancha--azul" aria-hidden="true" />
      <button
        id={id}
        type="button"
        className={`rc-switch ${className}`.trim()}
        role="switch"
        aria-checked={activo}
        aria-label={etiqueta}
        disabled={disabled}
        onClick={handleToggle}
      >
        <span className="rc-switch__perilla rc-vidrio" />
      </button>
    </div>
  );
}
