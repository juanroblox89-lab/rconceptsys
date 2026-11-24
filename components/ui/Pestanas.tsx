"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";

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

  const barra = useRef<HTMLDivElement>(null);
  const [bordes, setBordes] = useState({ antes: false, despues: false });
  const medir = useCallback(() => {
    const el = barra.current;
    if (el) setBordes({ antes: el.scrollLeft > 2, despues: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    const el = barra.current;
    if (!el) return;
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [medir]);
  const indiceActivo = pestanas.findIndex(p => p.id === activa);
  useEffect(() => {
    const el = barra.current;
    const tab = tabsRef.current[indiceActivo];
    if (!el || !tab) return;
    const r = tab.getBoundingClientRect();
    const cont = el.getBoundingClientRect();
    if (r.left < cont.left + 20) el.scrollLeft += r.left - cont.left - 22;
    else if (r.right > cont.right - 20) el.scrollLeft += r.right - cont.right + 22;
  }, [indiceActivo]);
  function desplazar(dir: number) {
    if (barra.current) barra.current.scrollLeft += dir * Math.max(100, barra.current.clientWidth - 64);
  }

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
    <div className={`rc-escena-vidrio rc-escena-vidrio--bloque rc-pestanas-marco ${envoltorioClassName}`.trim()}>
      <span className="rc-mancha rc-mancha--azul" aria-hidden="true" />
      <div
        className={`rc-tabs rc-vidrio ${className}`.trim()}
        ref={barra}
        onScroll={medir}
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
      {bordes.antes && <button type="button" className="rc-pestanas-flecha rc-pestanas-flecha--antes" aria-label="Ver pestañas anteriores" onClick={() => desplazar(-1)}><ChevronLeft size={15} aria-hidden="true" /></button>}
      {bordes.despues && <button type="button" className="rc-pestanas-flecha rc-pestanas-flecha--despues" aria-label="Ver más pestañas" onClick={() => desplazar(1)}><ChevronRight size={15} aria-hidden="true" /></button>}
    </div>
  );
}
