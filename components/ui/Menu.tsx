"use client";

import React from "react";

export interface MenuItem {
  id: string;
  etiqueta: React.ReactNode;
  icono?: React.ReactNode;
  iconoDerecha?: React.ReactNode;
  onClick?: () => void;
  activo?: boolean;
  disabled?: boolean;
}

export interface MenuProps {
  items: MenuItem[];
  etiquetaAria?: string;
  envoltorioClassName?: string;
  className?: string;
}

export function Menu({
  items,
  etiquetaAria = "Menú de acciones",
  envoltorioClassName = "",
  className = "",
}: MenuProps) {
  return (
    <div className={`rc-escena-vidrio rc-escena-vidrio--bloque ${envoltorioClassName}`.trim()}>
      <span className="rc-mancha rc-mancha--azul" aria-hidden="true" />
      <div
        className={`rc-menu rc-vidrio ${className}`.trim()}
        role="menu"
        aria-label={etiquetaAria}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="rc-menu__item"
            role="menuitem"
            aria-current={item.activo ? "true" : undefined}
            disabled={item.disabled}
            onClick={item.onClick}
          >
            <span className="rc-menu__item-izq">
              {item.icono ? (
                typeof item.icono === "string" ? (
                  <svg className="rc-icono rc-icono--sm" aria-hidden="true">
                    <use href={item.icono} />
                  </svg>
                ) : (
                  item.icono
                )
              ) : null}
              <span>{item.etiqueta}</span>
            </span>
            {item.iconoDerecha ? (
              typeof item.iconoDerecha === "string" ? (
                <svg className="rc-icono rc-icono--sm" aria-hidden="true">
                  <use href={item.iconoDerecha} />
                </svg>
              ) : (
                item.iconoDerecha
              )
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
