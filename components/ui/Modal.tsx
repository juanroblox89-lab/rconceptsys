"use client";

import React, { useId } from "react";

export interface ModalProps {
  abierto?: boolean;
  enLinea?: boolean; // Para renderizar directamente en el catálogo sin overlay
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  onCerrar?: () => void;
  accionPrimaria?: React.ReactNode;
  accionSecundaria?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function Modal({
  abierto = true,
  enLinea = false,
  titulo,
  descripcion,
  onCerrar,
  accionPrimaria,
  accionSecundaria,
  className = "",
  children,
}: ModalProps) {
  const tituloId = useId();

  if (!abierto && !enLinea) return null;

  const contenidoModal = (
    <div
      className={`rc-modal ${className}`.trim()}
      role="dialog"
      aria-modal={enLinea ? "false" : "true"}
      aria-labelledby={tituloId}
    >
      <div className="rc-modal__cabecera">
        <h3 id={tituloId} className="rc-modal__titulo">
          {titulo}
        </h3>
        {onCerrar && (
          <button
            type="button"
            className="rc-toast__cerrar"
            aria-label="Cerrar modal"
            onClick={onCerrar}
          >
            <svg className="rc-icono rc-icono--sm" aria-hidden="true">
              <use href="#rc-ico-cerrar-v2" />
            </svg>
          </button>
        )}
      </div>

      {descripcion && <p className="rc-toast__texto">{descripcion}</p>}
      {children}

      {(accionPrimaria || accionSecundaria) && (
        <div className="rc-modal__acciones">
          {accionSecundaria}
          {accionPrimaria}
        </div>
      )}
    </div>
  );

  if (enLinea) {
    return contenidoModal;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(31, 36, 48, 0.45)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--rc-esp-16)",
        zIndex: 900,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && onCerrar) onCerrar();
      }}
    >
      {contenidoModal}
    </div>
  );
}
