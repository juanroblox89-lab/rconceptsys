"use client";

import React, { useEffect, useRef, useState } from "react";

export interface ItemPestana {
  id: string;
  etiqueta: React.ReactNode;
  disabled?: boolean;
}

export interface PestanasProps {
  pestanas: ItemPestana[];
  activaId?: string;
  defaultActivaId?: string;
  onCambio?: (id: string) => void;
  etiquetaAria?: string;
  envoltorioClassName?: string;
  className?: string;
}

export function Pestanas({
  pestanas,
  activaId: activaIdProp,
  defaultActivaId,
  onCambio,
  etiquetaAria = "Pestañas",
  envoltorioClassName = "",
  className = "",
}: PestanasProps) {
  const [internalActiva, setInternalActiva] = useState(
    defaultActivaId || pestanas[0]?.id || ""
  );
  const isControlled = activaIdProp !== undefined;
  const activa = isControlled ? activaIdProp : internalActiva;
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  // La pestaña activa siempre queda a la vista cuando la barra se desplaza (muchas pestañas o pantalla angosta)
  useEffect(() => {
    const idx = pestanas.findIndex((p) => p.id === activa);
    tabsRef.current[idx]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activa, pestanas]);

  const handleSelect = (id: string) => {
    if (!isControlled) {
      setInternalActiva(id);
    }
    onCambio?.(id);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const nextIdx = (index + 1) % pestanas.length;
      tabsRef.current[nextIdx]?.focus();
      handleSelect(pestanas[nextIdx].id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prevIdx = (index - 1 + pestanas.length) % pestanas.length;
      tabsRef.current[prevIdx]?.focus();
      handleSelect(pestanas[prevIdx].id);
    }
  };

  return (
    <div className={`rc-escena-vidrio rc-escena-vidrio--bloque ${envoltorioClassName}`.trim()}>
      <span className="rc-mancha rc-mancha--azul" aria-hidden="true" />
      <div
        className={`rc-tabs rc-vidrio ${className}`.trim()}
        role="tablist"
        aria-label={etiquetaAria}
      >
        {pestanas.map((tab, idx) => {
          const isSelected = tab.id === activa;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabsRef.current[idx] = el;
              }}
              type="button"
              className="rc-tab"
              role="tab"
              aria-selected={isSelected}
              disabled={tab.disabled}
              onClick={() => handleSelect(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
            >
              {tab.etiqueta}
            </button>
          );
        })}
      </div>
    </div>
  );
}
