"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/Boton";
import { Modal } from "@/components/ui/Modal";

interface ContextoCambiosSinGuardar {
  hayCambios: boolean;
  actualizarRegistro: (id: string, sucio: boolean) => void;
  confirmarSalida: (accion: () => void) => void;
}

const ContextoPorDefecto: ContextoCambiosSinGuardar = {
  hayCambios: false,
  actualizarRegistro: () => {},
  confirmarSalida: (accion) => accion(),
};

const CambiosSinGuardarContext = createContext<ContextoCambiosSinGuardar>(ContextoPorDefecto);

export function CambiosSinGuardarProvider({
  children,
  onSalirConfirmado,
}: {
  children: ReactNode;
  onSalirConfirmado?: () => void;
}) {
  const router = useRouter();
  const suciosRef = useRef<Map<string, boolean>>(new Map());
  const [hayCambios, setHayCambios] = useState(false);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);

  const pendienteRef = useRef<(() => void) | null>(null);
  const previoFocoRef = useRef<HTMLElement | null>(null);
  const seguirBtnRef = useRef<HTMLButtonElement | null>(null);
  const saltarUnloadRef = useRef(false);
  const onSalirConfirmadoRef = useRef(onSalirConfirmado);

  useEffect(() => {
    onSalirConfirmadoRef.current = onSalirConfirmado;
  }, [onSalirConfirmado]);

  const actualizarRegistro = useCallback((id: string, sucio: boolean) => {
    const mapa = suciosRef.current;
    const tenia = mapa.has(id);
    if (sucio && !tenia) {
      mapa.set(id, true);
    } else if (!sucio && tenia) {
      mapa.delete(id);
    } else {
      return;
    }
    const siguiente = mapa.size > 0;
    setHayCambios((prev) => (prev === siguiente ? prev : siguiente));
  }, []);

  const pedirConfirmacion = useCallback((accion: () => void) => {
    if (suciosRef.current.size === 0) {
      accion();
      return;
    }
    previoFocoRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    pendienteRef.current = accion;
    setDialogoAbierto(true);
  }, []);

  const confirmarSalida = useCallback(
    (accion: () => void) => {
      pedirConfirmacion(accion);
    },
    [pedirConfirmacion],
  );

  const seguirEditando = useCallback(() => {
    pendienteRef.current = null;
    setDialogoAbierto(false);
    const previo = previoFocoRef.current;
    previoFocoRef.current = null;
    if (previo && previo.isConnected) {
      requestAnimationFrame(() => previo.focus({ preventScroll: true }));
    }
  }, []);

  const descartarYSalir = useCallback(() => {
    saltarUnloadRef.current = true;
    suciosRef.current.clear();
    setHayCambios(false);
    const accion = pendienteRef.current;
    pendienteRef.current = null;
    previoFocoRef.current = null;
    setDialogoAbierto(false);
    onSalirConfirmadoRef.current?.();
    accion?.();
    setTimeout(() => {
      saltarUnloadRef.current = false;
    }, 150);
  }, []);

  // Aviso nativo del navegador al cerrar o recargar la pestaña cuando hay cambios sin guardar.
  useEffect(() => {
    if (!hayCambios) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saltarUnloadRef.current || suciosRef.current.size === 0) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hayCambios]);

  // Interceptar clics en enlaces internos (<Link> / <a href>) en fase de captura.
  useEffect(() => {
    if (!hayCambios) return;
    const onClickCapture = (e: MouseEvent) => {
      if (suciosRef.current.size === 0) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const hrefAttr = anchor.getAttribute("href") ?? "";
      if (!hrefAttr || hrefAttr.startsWith("#") || hrefAttr.startsWith("mailto:") || hrefAttr.startsWith("tel:")) return;
      let destino: URL;
      try {
        destino = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (destino.origin !== window.location.origin) return;
      if (destino.pathname === window.location.pathname && destino.search === window.location.search) return;

      e.preventDefault();
      e.stopPropagation();
      const rutaDestino = `${destino.pathname}${destino.search}${destino.hash}`;
      pedirConfirmacion(() => router.push(rutaDestino));
    };
    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, [hayCambios, pedirConfirmacion, router]);

  // Foco inicial seguro en "Seguir editando" y Escape en captura para cerrar sin descartar.
  useEffect(() => {
    if (!dialogoAbierto) return;
    const frame = requestAnimationFrame(() => {
      seguirBtnRef.current?.focus({ preventScroll: true });
    });
    const onKeyCapture = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector("dialog[open], .picker-dialog")) return;
      e.preventDefault();
      e.stopPropagation();
      seguirEditando();
    };
    window.addEventListener("keydown", onKeyCapture, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyCapture, true);
    };
  }, [dialogoAbierto, seguirEditando]);

  const valor = useMemo<ContextoCambiosSinGuardar>(
    () => ({ hayCambios, actualizarRegistro, confirmarSalida }),
    [hayCambios, actualizarRegistro, confirmarSalida],
  );

  return (
    <CambiosSinGuardarContext.Provider value={valor}>
      {children}
      {dialogoAbierto && (
        <Modal
          abierto={true}
          titulo="Tienes cambios sin guardar"
          descripcion="Si sales ahora, perderás los cambios que no hayas guardado."
          veloStyle={{ zIndex: 980 }}
          onCerrar={seguirEditando}
          accionSecundaria={
            <Boton ref={seguirBtnRef} variante="secundario" onClick={seguirEditando}>
              Seguir editando
            </Boton>
          }
          accionPrimaria={
            <Boton variante="peligro" onClick={descartarYSalir}>
              Salir sin guardar
            </Boton>
          }
        />
      )}
    </CambiosSinGuardarContext.Provider>
  );
}

export function useConfirmarSalida() {
  return useContext(CambiosSinGuardarContext).confirmarSalida;
}

export function useCambiosSinGuardar(sucio: boolean) {
  const id = useId();
  const { hayCambios, actualizarRegistro, confirmarSalida } = useContext(CambiosSinGuardarContext);

  useEffect(() => {
    actualizarRegistro(id, sucio);
  }, [actualizarRegistro, id, sucio]);

  useEffect(() => {
    return () => {
      actualizarRegistro(id, false);
    };
  }, [actualizarRegistro, id]);

  const limpiarRegistro = useCallback(() => {
    actualizarRegistro(id, false);
  }, [actualizarRegistro, id]);

  return {
    hayCambios,
    confirmarSalida,
    limpiarRegistro,
  };
}
