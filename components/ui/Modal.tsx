"use client";

import React, { useEffect, useId, useRef } from "react";

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
  const cajaRef = useRef<HTMLDivElement>(null);
  const onCerrarRef = useRef(onCerrar);
  useEffect(() => {
    onCerrarRef.current = onCerrar;
  }, [onCerrar]);

  useEffect(() => {
    if (!abierto || enLinea) return;
    const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      if (cajaRef.current && !cajaRef.current.contains(document.activeElement)) {
        cajaRef.current.focus({ preventScroll: true });
      }
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Si hay un diálogo nativo o Google Picker encima, dejar que ese cierre primero.
      if (document.querySelector("dialog[open], .picker-dialog")) return;
      e.preventDefault();
      onCerrarRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      if (previo && previo.isConnected) {
        requestAnimationFrame(() => previo.focus({ preventScroll: true }));
      }
    };
  }, [abierto, enLinea]);

  if (!abierto && !enLinea) return null;

  const contenidoModal = (
    <div
      ref={enLinea ? undefined : cajaRef}
      tabIndex={enLinea ? undefined : -1}
      className={`rc-modal ${enLinea ? "" : "rc-modal--dialogo"} ${className}`.trim()}
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
      className="rc-modal-velo"
      onClick={(e) => {
        if (e.target === e.currentTarget && onCerrar) onCerrar();
      }}
    >
      {contenidoModal}
    </div>
  );
}
