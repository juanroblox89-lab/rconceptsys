"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Copy, MoreHorizontal, Pencil, Reply, RotateCcw, ShieldCheck, Trash2, X } from "lucide-react";
import { useAviso } from "@/components/ui/Aviso";
import { copiarCuerpoRIA } from "@/lib/copiar-ria";
import styles from "./AccionesMensaje.module.css";

export async function copiarTextoSeguro(texto: string): Promise<boolean> {
  if (!texto) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // Fallback cuando Clipboard API está restringida
    }
  }
  try {
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    area.style.pointerEvents = "none";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

function esObjetivoInteractivo(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("a, button, input, textarea, select, video, audio, [role='button'], [role='slider']"));
}

export interface AccionesMensajeProps {
  /** Contenido de la burbuja o mensaje. */
  children: ReactNode;
  /** Alineación del mensaje: propio a la derecha, ajeno a la izquierda. */
  propio?: boolean;
  /** Modo bloque (respuestas largas de RIA): botón ⋯ debajo en vez de al costado. */
  bloque?: boolean;
  /** Texto breve para vista previa en hoja móvil. */
  resumen?: string;
  /** Habilita Copiar. */
  puedeCopiar?: boolean;
  /** Habilita Editar. */
  puedeEditar?: boolean;
  /** Habilita Eliminar. */
  puedeEliminar?: boolean;
  /** Si el mensaje está en edición en línea, deshabilita el menú/pulsación larga. */
  editando?: boolean;
  /** Copia solo el cuerpo renderizado de RIA, nunca el texto del menú ni adjuntos. */
  copiarRIA?: boolean;
  burbuja?: boolean;
  onResponder?: () => void;
  conservacion?: { id: number; nombre: string; etiqueta: string; ejecutar: () => void }[];
  onCopiar?: () => void;
  onEditar?: () => void;
  onEliminar?: () => void;
}

export function AccionesMensaje({
  children,
  propio = false,
  bloque = false,
  resumen,
  puedeCopiar = false,
  puedeEditar = false,
  puedeEliminar = false,
  editando = false,
  burbuja = false,
  onResponder,
  conservacion = [],
  onCopiar,
  copiarRIA = false,
  onEditar,
  onEliminar,
}: AccionesMensajeProps) {
  const hayAcciones = !editando && (puedeCopiar || puedeEditar || puedeEliminar || Boolean(onResponder) || conservacion.length > 0);
  const [presion, setPresion] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [movilSheet, setMovilSheet] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contenidoRef = useRef<HTMLDivElement>(null);
  const { mostrarAviso } = useAviso();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inicioToqueRef = useRef<{ x: number; y: number } | null>(null);
  const suprimirContextoRef = useRef(0);
  const inicioEnMenuRef = useRef(false);
  const menuId = useId();

  const limpiarTemporizador = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    inicioToqueRef.current = null;
  };

  useEffect(() => () => limpiarTemporizador(), []);
  const terminarLarga = () => { limpiarTemporizador(); setPresion(false); };

  const abrirDesdeBoton = () => {
    if (!hayAcciones) return;
    if (abierto) {
      setAbierto(false);
      return;
    }
    const esMovil = typeof window !== "undefined" && (window.innerWidth < 640 || window.matchMedia("(pointer: coarse)").matches);
    setMovilSheet(esMovil);
    if (!esMovil && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setCoords({ top: r.bottom + 4, left: r.left });
    }
    setAbierto(true);
  };

  const abrirPorPulsacionLarga = (clientX: number, clientY: number) => {
    if (!hayAcciones) return;
    inicioEnMenuRef.current = false;
    suprimirContextoRef.current = Date.now() + 900;
    setPresion(false);
    const esMovil = typeof window !== "undefined" && (window.innerWidth < 640 || window.matchMedia("(hover: none)").matches);
    setMovilSheet(esMovil);
    if (!esMovil) {
      setCoords({ top: clientY + 4, left: clientX });
    }
    setAbierto(true);
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(12);
      } catch {
        // Ignorar si no está permitido
      }
    }
  };

  useLayoutEffect(() => {
    if (!abierto || movilSheet || !menuRef.current) return;
    const menuRect = menuRef.current.getBoundingClientRect();
    const margen = 12;
    let top = coords.top;
    let left = coords.left;
    if (triggerRef.current) {
      const tr = triggerRef.current.getBoundingClientRect();
      left = propio ? tr.left : tr.right - menuRect.width;
      top = tr.bottom + 4;
      if (top + menuRect.height > window.innerHeight - margen) {
        top = Math.max(margen, tr.top - menuRect.height - 4);
      }
    }
    if (left + menuRect.width > window.innerWidth - margen) {
      left = window.innerWidth - menuRect.width - margen;
    }
    if (left < margen) left = margen;
    if (top + menuRect.height > window.innerHeight - margen) {
      top = Math.max(margen, window.innerHeight - menuRect.height - margen);
    }
    if (top !== coords.top || left !== coords.left) {
      setCoords({ top, left });
    }
  }, [abierto, movilSheet, propio, coords.top, coords.left]);

  useEffect(() => {
    if (!abierto) return;
    menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setAbierto(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    const onScroll = () => {
      if (!movilSheet) setAbierto(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScroll);
    };
  }, [abierto, movilSheet]);

  const iniciarLarga = (x: number, y: number, target: EventTarget | null) => {
    if (!hayAcciones || esObjetivoInteractivo(target)) return;
    limpiarTemporizador();
    setPresion(true);
    inicioToqueRef.current = { x, y };
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      abrirPorPulsacionLarga(x, y);
    }, 410);
  };

  const moverLarga = (x: number, y: number) => {
    if (!inicioToqueRef.current) return;
    if (Math.hypot(x - inicioToqueRef.current.x, y - inicioToqueRef.current.y) > 10) {
      terminarLarga();
    }
  };

  const ejecutar = (fn?: () => void) => {
    setAbierto(false);
    triggerRef.current?.focus({ preventScroll: true });
    fn?.();
  };

  const vistaPrevia = copiarRIA ? "Respuesta de RIA" : (resumen ?? "").trim();

  const copiar = async () => {
    const cuerpo = contenidoRef.current?.querySelector<HTMLElement>("[data-rc-cuerpo-ria]") ?? null;
    let ok = false;
    try {
      ok = await copiarCuerpoRIA(cuerpo, copiarTextoSeguro);
    } catch {
      // Un fallo de serialización tampoco debe copiar el mensaje crudo.
    }
    mostrarAviso({
      tipo: ok ? "exito" : "error",
      titulo: ok ? "Respuesta copiada" : "No se pudo copiar la respuesta",
    });
  };


  const contenidoMenu = (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label="Acciones del mensaje"
      className={`${styles.menu} ${movilSheet ? styles.menuMovil : ""}`}
      style={movilSheet ? undefined : { top: `${coords.top}px`, left: `${coords.left}px` }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        const destino = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1
          : e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey) ? (i + 1) % items.length
          : e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey) ? (i - 1 + items.length) % items.length : -1;
        if (destino >= 0) { e.preventDefault(); items[destino]?.focus({ preventScroll: true }); }
      }}
    >
      {movilSheet && vistaPrevia ? <p className={styles.preview}>{vistaPrevia}</p> : null}
      {onResponder && <button type="button" role="menuitem" className={styles.opcion} onClick={() => ejecutar(onResponder)}>
        <Reply size={15} strokeWidth={1.75} aria-hidden="true" /><span>Responder</span>
      </button>}
      {puedeCopiar && (
        <button type="button" role="menuitem" className={styles.opcion} onClick={() => {
          ejecutar(copiarRIA ? () => void copiar() : onCopiar);
          if (copiarRIA && !movilSheet) triggerRef.current?.focus();
        }}>
          <Copy size={15} strokeWidth={1.75} aria-hidden="true" />
          <span>Copiar</span>
        </button>
      )}
      {puedeEditar && (
        <button type="button" role="menuitem" className={styles.opcion} onClick={() => ejecutar(onEditar)}>
          <Pencil size={15} strokeWidth={1.75} aria-hidden="true" />
          <span>Editar</span>
        </button>
      )}
      {conservacion.map((a) => <button key={a.id} type="button" role="menuitem" className={styles.opcion} onClick={() => ejecutar(a.ejecutar)}>
        <ShieldCheck size={15} strokeWidth={1.75} aria-hidden="true" />
        <span className={styles.opcionTexto}>{a.etiqueta}{conservacion.length > 1 && <small title={a.nombre}>{a.nombre}</small>}</span>
      </button>)}
      {puedeEliminar && (
        <button
          type="button"
          role="menuitem"
          className={`${styles.opcion} ${styles.opcionPeligro}`}
          onClick={() => ejecutar(onEliminar)}
        >
          <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
          <span>Eliminar</span>
        </button>
      )}
      {movilSheet && (
        <button
          type="button"
          className={`${styles.opcion} ${styles.cancelarMovil}`}
          onClick={() => ejecutar()}
        >
          Cancelar
        </button>
      )}
    </div>
  );

  const botonMenu = hayAcciones ? (
    <button
      ref={triggerRef}
      type="button"
      className={styles.trigger}
      aria-label="Acciones del mensaje"
      title="Acciones del mensaje"
      aria-haspopup="menu"
      aria-expanded={abierto}
      aria-controls={abierto ? menuId : undefined}
      onClick={abrirDesdeBoton}
    >
      {burbuja ? <ChevronDown size={15} strokeWidth={1.9} aria-hidden="true" /> : <MoreHorizontal size={15} strokeWidth={1.9} aria-hidden="true" />}
    </button>
  ) : null;

  return (
    <div
      data-rc-mensaje-fila
      data-rc-burbuja={burbuja || undefined}
      className={`${styles.fila} ${propio ? styles.filaMia : ""} ${bloque ? styles.filaBloque : ""}`}
    >
      <div
        ref={copiarRIA ? contenidoRef : undefined}
        className={`${styles.contenido} ${hayAcciones ? (copiarRIA ? styles.interactivoRIA : styles.interactivo) : ""}`}
        data-presion={presion || undefined}
        onPointerDown={(e) => {
          if (e.isPrimary && (e.pointerType === "touch" || e.pointerType === "pen")) {
            iniciarLarga(e.clientX, e.clientY, e.target);
          }
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "touch" || e.pointerType === "pen") moverLarga(e.clientX, e.clientY);
        }}
        onPointerUp={terminarLarga}
        onPointerCancel={terminarLarga}
        onPointerLeave={terminarLarga}
        onContextMenu={(e) => {
          if (!hayAcciones || esObjetivoInteractivo(e.target)) return;
          if (presion || Date.now() < suprimirContextoRef.current) e.preventDefault();
        }}
      >
        {children}
      </div>
      {bloque ? (botonMenu ? <div className={styles.pieAsistente}>{botonMenu}</div> : null) : botonMenu}

      {abierto &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={`${styles.velo} ${movilSheet ? styles.veloMovil : ""}`}
            onPointerDownCapture={() => { inicioEnMenuRef.current = true; }}
            onClickCapture={e => {
              if (e.detail && !inicioEnMenuRef.current && Date.now() < suprimirContextoRef.current) {
                e.preventDefault(); e.stopPropagation();
              }
            }}
            onClick={() => ejecutar()}
          >
            {contenidoMenu}
          </div>,
          document.body,
        )}
    </div>
  );
}

export interface EditorMensajeProps {
  valorInicial: string;
  permitirVacio?: boolean;
  guardando?: boolean;
  error?: string | null;
  onGuardar: (nuevoTexto: string) => void;
  onCancelar: () => void;
}

export function EditorMensaje({
  valorInicial,
  permitirVacio = false,
  guardando = false,
  error,
  onGuardar,
  onCancelar,
}: EditorMensajeProps) {
  const [texto, setTexto] = useState(valorInicial);
  const campoRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = campoRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const limpio = texto.trim();
  const valido = (permitirVacio || limpio.length > 0) && limpio.length <= 2000;

  return (
    <div className={styles.editor}>
      <textarea
        ref={campoRef}
        className={styles.editorCampo}
        aria-label="Editar mensaje"
        value={texto}
        maxLength={2000}
        rows={2}
        disabled={guardando}
        onChange={(e) => setTexto(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Escape") {
            e.preventDefault();
            onCancelar();
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (valido && !guardando) onGuardar(limpio);
          }
        }}
      />
      {error && (
        <p className={styles.editorError} role="alert">
          {error}
        </p>
      )}
      <div className={styles.editorPie}>
        <button type="button" className={styles.editorBtn} onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
        <button
          type="button"
          className={`${styles.editorBtn} ${styles.editorBtnPrimario}`}
          disabled={!valido || guardando}
          onClick={() => onGuardar(limpio)}
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}

export function MarcaEditado({ fecha }: { fecha?: string | null }) {
  if (!fecha) return null;
  let titulo = "Mensaje editado";
  try {
    titulo = `Editado el ${new Date(fecha).toLocaleString("es-ES")}`;
  } catch {
    // Mantener etiqueta base
  }
  return (
    <span className={styles.editadoMarca} title={titulo}>
      editado
    </span>
  );
}

export function BarraDeshacer({
  texto = "Mensaje eliminado",
  restaurando = false,
  onDeshacer,
  onCerrar,
}: {
  texto?: string;
  restaurando?: boolean;
  onDeshacer: () => void;
  onCerrar: () => void;
}) {
  return (
    <div className={styles.deshacerBarra} role="status" aria-live="polite">
      <span>{texto}</span>
      <div className={styles.deshacerAcciones}>
        <button type="button" className={styles.deshacerBtn} onClick={onDeshacer} disabled={restaurando}>
          <RotateCcw size={12} strokeWidth={2} aria-hidden="true" />
          {restaurando ? "Deshaciendo…" : "Deshacer"}
        </button>
        <button type="button" className={styles.deshacerCerrar} onClick={onCerrar} aria-label="Cerrar aviso">
          <X size={13} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
