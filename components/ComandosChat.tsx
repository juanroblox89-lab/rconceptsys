"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type TextareaHTMLAttributes } from "react";
import { eventoApariencia } from "@/lib/apariencia";
import { buscarRutasRIA, comandoRIA, fragmentosRutasRIA, type RutaRIA } from "@/lib/rutas-ria";
import styles from "./ComandosChat.module.css";

function suscribirTema(avisar: () => void) {
  window.addEventListener(eventoApariencia, avisar);
  return () => window.removeEventListener(eventoApariencia, avisar);
}

export function useGlassChat() {
  return useSyncExternalStore(suscribirTema, () => document.documentElement.dataset.rcTema === "glass", () => false);
}

export function useComandosChat(texto: string, rutas: RutaRIA[], habilitado: boolean, limpiar: () => void) {
  const router = useRouter();
  const id = useId();
  const [cerrado, setCerrado] = useState(false);
  const [foco, setFoco] = useState(false);
  const [seleccion, setSeleccion] = useState(0);
  const [componiendo, setComponiendo] = useState(false);
  const consulta = comandoRIA(texto);
  const abierto = habilitado && foco && !cerrado && !componiendo && consulta !== undefined;
  const opciones = consulta === undefined ? [] : buscarRutasRIA(rutas, consulta);
  const etiquetaRuta = (ruta: RutaRIA) => consulta && !ruta.href.startsWith(consulta)
    ? ruta.alias?.find(alias => alias.startsWith(consulta)) ?? ruta.href
    : ruta.href;
  const actual = Math.min(seleccion, Math.max(0, opciones.length - 1));
  const idOpcion = (i: number) => `${id}-${i}`;

  function navegar(ruta: RutaRIA) {
    setCerrado(true);
    setSeleccion(0);
    limpiar();
    router.push(ruta.href);
  }

  function teclado(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!abierto || e.nativeEvent.isComposing) return false;
    if (e.key === "Escape") {
      e.preventDefault();
      setCerrado(true);
      return true;
    }
    if (!opciones.length) return false;
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      navegar(opciones[actual]);
      return true;
    }
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const siguiente = (actual + (e.key === "ArrowDown" ? 1 : -1) + opciones.length) % opciones.length;
      setSeleccion(siguiente);
      document.getElementById(idOpcion(siguiente))?.scrollIntoView({ block: "nearest" });
      return true;
    }
    return false;
  }

  return {
    teclado,
    editar: () => { setCerrado(false); setSeleccion(0); },
    propsEntrada: {
      onFocus: () => { setFoco(true); setCerrado(false); },
      onBlur: () => { setFoco(false); setComponiendo(false); },
      onCompositionStart: () => setComponiendo(true),
      onCompositionEnd: () => setComponiendo(false),
      "aria-autocomplete": (habilitado ? "list" : undefined) as "list" | undefined,
      "aria-controls": abierto ? id : undefined,
      "aria-activedescendant": abierto && opciones.length ? idOpcion(actual) : undefined,
    },
    menu: !abierto ? null : <div className={styles.menu} data-rc-menu-comandos>
      <p className={styles.titulo}>Ir a una sección</p>
      <ul id={id} role="listbox" aria-label="Secciones">
        {opciones.map((ruta, i) => <li key={ruta.href} id={idOpcion(i)} role="option" aria-selected={i === actual}
          onPointerMove={() => setSeleccion(i)} onMouseDown={e => e.preventDefault()} onClick={() => navegar(ruta)}>
          <strong>{etiquetaRuta(ruta)}</strong>
          <span>{ruta.descripcion}</span>
        </li>)}
      </ul>
      {!opciones.length && <p role="status">No hay secciones que coincidan.</p>}
    </div>,
  };
}

export function EntradaComandos({ texto, rutas, glass, autoAltura = false, ...props }:
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onScroll"> & { texto: string; rutas: RutaRIA[]; glass: boolean; autoAltura?: boolean }) {
  const campo = useRef<HTMLTextAreaElement>(null);
  const espejo = useRef<HTMLDivElement>(null);
  const consulta = comandoRIA(texto);
  const parcial = consulta !== undefined && buscarRutasRIA(rutas, consulta).length > 0;
  const partes = glass ? fragmentosRutasRIA(texto, rutas) : [];
  const resaltar = glass && (parcial || partes.some(parte => parte.href));

  function sincronizar() {
    const entrada = campo.current, fondo = espejo.current;
    if (!entrada || !fondo) return;
    fondo.style.width = `${entrada.clientWidth}px`;
    fondo.scrollTop = entrada.scrollTop;
    fondo.scrollLeft = entrada.scrollLeft;
  }

  useLayoutEffect(() => {
    const entrada = campo.current;
    if (!entrada) return;
    if (autoAltura && (!glass || !CSS.supports("field-sizing", "content"))) {
      entrada.style.height = "auto";
      entrada.style.height = `${entrada.scrollHeight}px`;
    } else {
      entrada.style.removeProperty("height");
    }
    sincronizar();
  }, [texto, glass, autoAltura, resaltar]);

  useLayoutEffect(() => {
    if (!resaltar || !campo.current) return;
    const observador = new ResizeObserver(sincronizar);
    observador.observe(campo.current);
    return () => observador.disconnect();
  }, [resaltar]);

  return <div className={styles.campo} data-rc-entrada-comandos>
    {resaltar && <div className={styles.espejo} ref={espejo} aria-hidden="true" data-rc-espejo-comandos>
      {parcial ? <span className={styles.ruta}>{texto}</span> : partes.map(({ texto, href }, i) => href ? <span key={i} className={styles.ruta}>{texto}</span> : texto)}
      {texto.endsWith("\n") ? "\u200b" : null}
    </div>}
    <textarea {...props} ref={campo} value={texto} onScroll={sincronizar} data-rc-resaltado={resaltar || undefined} />
  </div>;
}

export function TextoComandos({ texto, rutas }: { texto: string; rutas: RutaRIA[] }) {
  return fragmentosRutasRIA(texto, rutas).map((parte, i) => parte.href
    ? <Link key={i} className={styles.ruta} href={parte.href}>{parte.texto}</Link> : parte.texto);
}
