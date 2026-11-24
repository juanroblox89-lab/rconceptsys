"use client";

import { Children, Fragment, isValidElement, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import styles from "./controles.module.css";

export type OpcionSelector = { valor: string | number; etiqueta: string; disabled?: boolean };
export function Selector({ id, etiqueta, valor = '', opciones, onCambio, disabled, requerido, className = '', estilo, errorId }: {
  id?: string; etiqueta: string; valor?: string | number; opciones: OpcionSelector[]; onCambio?: (valor: string) => void;
  disabled?: boolean; requerido?: boolean; className?: string; estilo?: CSSProperties; errorId?: string;
}) {
  const generado = useId();
  const listaId = `${generado}-opciones`;
  const boton = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const busqueda = useRef({ valor: '', cuando: 0 });
  const [menu, setMenu] = useState<CSSProperties>();
  const [activo, setActivo] = useState(-1);
  const elegido = opciones.findIndex(o => String(o.valor) === String(valor));
  const indices = opciones.flatMap((o, i) => o.disabled ? [] : [i]);
  const abierto = Boolean(menu) && !disabled;

  function posicion() {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    const alto = window.visualViewport?.height ?? window.innerHeight;
    const arriba = alto - r.bottom < 170 && r.top > alto - r.bottom;
    setMenu({ left: r.left, width: r.width, top: arriba ? undefined : r.bottom + 4, bottom: arriba ? window.innerHeight - r.top + 4 : undefined, maxHeight: Math.min(288, Math.max(45, arriba ? r.top - 10 : alto - r.bottom - 10)) });
  }
  function abrir(indice = indices.includes(elegido) ? elegido : indices[0]) {
    if (disabled || !indices.length) return;
    setActivo(indice ?? -1); posicion();
  }
  function elegir(i: number) {
    if (opciones[i] && !opciones[i].disabled) onCambio?.(String(opciones[i].valor));
    setMenu(undefined);
  }
  function teclado(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'Escape' && abierto) { e.preventDefault(); e.stopPropagation(); setMenu(undefined); return; }
    if (e.key === 'Tab') { setMenu(undefined); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (abierto) elegir(activo); else abrir(); return; }
    if (['ArrowDown','ArrowUp','Home','End'].includes(e.key)) {
      e.preventDefault();
      const i = indices.indexOf(activo);
      const siguiente = e.key === 'Home' ? indices[0] : e.key === 'End' ? indices.at(-1) : indices[Math.max(0, Math.min(indices.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (abierto) setActivo(siguiente ?? -1); else abrir(e.key === 'Home' || e.key === 'End' ? siguiente : undefined);
      return;
    }
    if (e.key.length === 1 && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const anterior = busqueda.current;
      const palabra = (Date.now() - anterior.cuando < 650 ? anterior.valor : '') + e.key.toLocaleLowerCase('es');
      busqueda.current = { valor: palabra, cuando: Date.now() };
      const i = indices.find(i => opciones[i].etiqueta.toLocaleLowerCase('es').startsWith(palabra));
      if (i !== undefined) { e.preventDefault(); if (abierto) setActivo(i); else abrir(i); }
    }
  }
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => { const nodo = e.target as Node; if (!boton.current?.contains(nodo) && !lista.current?.contains(nodo)) setMenu(undefined); };
    const cerrar = (e: Event) => { if (!(e.target instanceof Node && lista.current?.contains(e.target))) setMenu(undefined); };
    document.addEventListener('pointerdown', fuera);
    window.addEventListener('scroll', cerrar, true);
    window.addEventListener('resize', cerrar);
    return () => { document.removeEventListener('pointerdown', fuera); window.removeEventListener('scroll', cerrar, true); window.removeEventListener('resize', cerrar); };
  }, [abierto]);
  useEffect(() => { if (abierto) document.getElementById(`${listaId}-${activo}`)?.scrollIntoView({ block: 'nearest' }); }, [abierto, activo, listaId]);

  return <>
    <button ref={boton} id={id} type="button" role="combobox" aria-label={etiqueta} aria-haspopup="listbox" aria-expanded={abierto}
      aria-controls={abierto ? listaId : undefined} aria-activedescendant={abierto && activo >= 0 ? `${listaId}-${activo}` : undefined}
      aria-required={requerido} aria-invalid={Boolean(errorId) || undefined} aria-describedby={errorId} disabled={disabled}
      className={`${styles.control} ${styles.selector} ${className}`} style={estilo} onBlur={() => setMenu(undefined)} onKeyDown={teclado} onClick={() => abierto ? setMenu(undefined) : abrir()}>
      <span>{opciones[elegido]?.etiqueta ?? 'Seleccionar'}</span><ChevronDown size={15} aria-hidden="true" />
    </button>
    {abierto && createPortal(<ul ref={lista} id={listaId} role="listbox" aria-label={etiqueta} className={styles.lista} style={menu} onMouseDown={e => e.preventDefault()}>
      {opciones.map(({ valor, etiqueta, disabled }, i) => <li key={valor} id={`${listaId}-${i}`} role="option" aria-selected={elegido === i} aria-disabled={disabled || undefined} data-activo={activo === i}
        onPointerMove={e => { if (!disabled && e.pointerType === 'mouse') setActivo(i); }} onClick={() => elegir(i)}><span>{etiqueta}</span>{elegido === i && <Check size={15} aria-hidden="true" />}</li>)}
    </ul>, document.body)}
  </>;
}

export function opcionesSelector(children: ReactNode): OpcionSelector[] {
  return Children.toArray(children).flatMap(n => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(n)) return [];
    if (n.type === Fragment) return opcionesSelector(n.props.children);
    if (n.type !== 'option') return [];
    return [{ valor: n.props.value ?? String(n.props.children ?? ''), etiqueta: Children.toArray(n.props.children).join(''), disabled: n.props.disabled }];
  });
}
