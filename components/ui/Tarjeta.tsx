"use client";

import React from "react";

export interface TarjetaProps extends React.HTMLAttributes<HTMLElement> {
  variante?: "normal" | "estadistica" | "vacia";
  tituloVacio?: string;
  textoVacio?: string;
  envoltorioClassName?: string;
}

export function Tarjeta({
  variante = "normal",
  tituloVacio = "No hay resultados",
  textoVacio = "Aún no tienes contenido en esta sección.",
  envoltorioClassName = "",
  className = "",
  children,
  ...props
}: TarjetaProps) {
  if (variante === "vacia") {
    return (
      <article className={`rc-card rc-card--vacia ${className}`.trim()} {...props}>
        <svg
          className="rc-ilustracion-vacia"
          viewBox="0 0 48 48"
          fill="none"
          aria-hidden="true"
        >
          <rect x="10" y="6" width="24" height="32" rx="4" stroke="currentColor" strokeWidth="2" />
          <path
            d="M16 15h12M16 21h12M16 27h7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="33" cy="31" r="5" fill="#ECEEF3" stroke="currentColor" strokeWidth="2" />
          <path d="M36.5 34.5L40 38" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {children ? (
          children
        ) : (
          <>
            <h3 className="rc-card__titulo">{tituloVacio}</h3>
            <p className="rc-card__texto">{textoVacio}</p>
          </>
        )}
      </article>
    );
  }

  if (variante === "estadistica") {
    return (
      <div className={`rc-escena-vidrio rc-escena-vidrio--bloque ${envoltorioClassName}`.trim()}>
        <span className="rc-mancha rc-mancha--azul rc-mancha--grande" aria-hidden="true" />
        <article
          className={`rc-card rc-card--estadistica rc-vidrio rc-vidrio--azul ${className}`.trim()}
          {...props}
        >
          {children}
        </article>
      </div>
    );
  }

  return (
    <article className={`rc-card ${className}`.trim()} {...props}>
      {children}
    </article>
  );
}
