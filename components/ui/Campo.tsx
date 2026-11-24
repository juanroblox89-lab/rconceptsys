"use client";

import { Selector, opcionesSelector } from "./Selector";
import React, { forwardRef, useId } from "react";

export interface CampoProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  etiqueta?: React.ReactNode;
  icono?: React.ReactNode;
  error?: string;
  pildora?: boolean;
  como?: "input" | "select" | "textarea";
  opciones?: Array<{ valor: string | number; etiqueta: string; disabled?: boolean }>;
  filas?: number;
  contenedorClassName?: string;
  inputClassName?: string;
}

export const Campo = forwardRef<
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  CampoProps
>(function Campo(
  {
    id: idProp,
    etiqueta,
    icono,
    error,
    pildora = false,
    como = "input",
    opciones,
    filas = 3,
    contenedorClassName = "",
    inputClassName = "",
    className = "",
    children,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const id = idProp || generatedId;
  const errorId = `${id}-error`;

  const contenedorClases = [
    "rc-input-contenedor",
    pildora ? "rc-input-contenedor--pildora" : "",
    error ? "rc-input-contenedor--error" : "",
    inputClassName,
  ]
    .filter(Boolean)
    .join(" ");

  let controlNode: React.ReactNode = null;

  if (como === "select") {
    controlNode = <Selector id={id} etiqueta={props['aria-label'] ?? (typeof etiqueta === 'string' ? etiqueta : 'Seleccionar')}
      valor={typeof props.value === 'string' || typeof props.value === 'number' ? props.value : undefined}
      opciones={opciones ?? opcionesSelector(children)} className={className} disabled={props.disabled} requerido={props.required}
      errorId={error ? errorId : undefined}
      onCambio={valor => props.onChange?.({ target: { value: valor }, currentTarget: { value: valor } } as React.ChangeEvent<HTMLInputElement>)} />;
  } else if (como === "textarea") {
    controlNode = (
      <textarea
        id={id}
        ref={ref as React.Ref<HTMLTextAreaElement>}
        rows={filas}
        className={`rc-textarea ${error ? "rc-input-contenedor--error" : ""} ${className}`.trim()}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? errorId : undefined}
        {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
      />
    );
  } else {
    controlNode = (
      <span className={contenedorClases}>
        {icono ? (
          typeof icono === "string" ? (
            <svg className="rc-icono" aria-hidden="true">
              <use href={icono} />
            </svg>
          ) : (
            icono
          )
        ) : null}
        <input
          id={id}
          ref={ref as React.Ref<HTMLInputElement>}
          className={`rc-input ${className}`.trim()}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? errorId : undefined}
          {...(props as React.InputHTMLAttributes<HTMLInputElement>)}
        />
      </span>
    );
  }

  return (
    <div className={`rc-campo-item ${contenedorClassName}`.trim()}>
      {etiqueta && (
        <label htmlFor={id} className="rc-subtitulo">
          {etiqueta}
        </label>
      )}
      {controlNode}
      {error && (
        <span id={errorId} className="rc-mensaje-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
});
