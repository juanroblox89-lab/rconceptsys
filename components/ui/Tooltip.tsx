"use client";

import React, { useId, useState } from "react";

export interface TooltipProps {
  texto: React.ReactNode;
  children: React.ReactNode;
  visibleSiempre?: boolean;
  mostrarCursorDemo?: boolean;
  className?: string;
}

export function Tooltip({
  texto,
  children,
  visibleSiempre = false,
  mostrarCursorDemo = false,
  className = "",
}: TooltipProps) {
  const [hover, setHover] = useState(false);
  const id = useId();
  const visible = visibleSiempre || hover;

  return (
    <div
      className={`rc-tooltip-demo ${className}`.trim()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <span
        id={id}
        className="rc-tooltip rc-vidrio"
        role="tooltip"
        aria-hidden={!visible}
        style={{
          opacity: visible ? 1 : 0,
          pointerEvents: "none",
          transition: "opacity var(--rc-transicion)",
        }}
      >
        {texto}
      </span>
      {children}
      {mostrarCursorDemo && (
        <svg className="rc-cursor-mano" aria-hidden="true">
          <use href="#rc-ico-cursor-v2" />
        </svg>
      )}
    </div>
  );
}
