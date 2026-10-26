"use client";

import React from "react";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  tamano?: 24 | 32 | 40;
  iniciales?: string;
  src?: string;
  iconoSimbolo?: string;
  presencia?: boolean;
  fondoAzul?: boolean;
  alt?: string;
}

export function Avatar({
  tamano = 32,
  iniciales,
  src,
  iconoSimbolo,
  presencia = false,
  fondoAzul = false,
  alt = "",
  className = "",
  children,
  ...props
}: AvatarProps) {
  const tamanoSvg = tamano === 40 ? 38 : tamano === 32 ? 30 : 24;

  return (
    <div className={`rc-avatar rc-avatar--${tamano} ${className}`.trim()} {...props}>
      <div
        className={`rc-avatar__interior ${
          fondoAzul ? "rc-avatar__interior--azul" : ""
        }`.trim()}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : iconoSimbolo ? (
          <svg width={tamanoSvg} height={tamanoSvg} aria-hidden="true">
            <use href={iconoSimbolo} />
          </svg>
        ) : iniciales ? (
          iniciales
        ) : (
          children
        )}
      </div>
      {presencia && <span className="rc-avatar__estado" aria-hidden="true" />}
    </div>
  );
}
