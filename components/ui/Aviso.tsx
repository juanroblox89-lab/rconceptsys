"use client";

import React, { createContext, useCallback, useContext, useState } from "react";

export type TipoAviso = "exito" | "info" | "advertencia" | "error";

export interface AvisoProps {
  tipo?: TipoAviso;
  titulo: React.ReactNode;
  texto?: React.ReactNode;
  onCerrar?: () => void;
  className?: string;
  envoltorioClassName?: string;
}

const CONFIG_AVISOS: Record<
  TipoAviso,
  { mancha: string; claseToast: string; icono: string; role: "status" | "alert" }
> = {
  exito: {
    mancha: "rc-mancha--verde",
    claseToast: "rc-toast--exito",
    icono: "#rc-ico-check-v2",
    role: "status",
  },
  info: {
    mancha: "rc-mancha--azul",
    claseToast: "rc-toast--info",
    icono: "#rc-ico-info-v2",
    role: "status",
  },
  advertencia: {
    mancha: "rc-mancha--ambar",
    claseToast: "rc-toast--advertencia",
    icono: "#rc-ico-alerta-v2",
    role: "alert",
  },
  error: {
    mancha: "rc-mancha--rojo",
    claseToast: "rc-toast--error",
    icono: "#rc-ico-cerrar-v2",
    role: "alert",
  },
};

export function Aviso({
  tipo = "info",
  titulo,
  texto,
  onCerrar,
  className = "",
  envoltorioClassName = "",
}: AvisoProps) {
  const cfg = CONFIG_AVISOS[tipo];

  return (
    <div className={`rc-escena-vidrio rc-escena-vidrio--bloque ${envoltorioClassName}`.trim()}>
      <span className={`rc-mancha ${cfg.mancha}`} aria-hidden="true" />
      <div className={`rc-toast ${cfg.claseToast} rc-vidrio ${className}`.trim()} role={cfg.role}>
        <span className="rc-toast__icono">
          <svg className="rc-icono rc-icono--sm" aria-hidden="true">
            <use href={cfg.icono} />
          </svg>
        </span>
        <div className="rc-toast__contenido">
          <span className="rc-toast__titulo">{titulo}</span>
          {texto && <span className="rc-toast__texto">{texto}</span>}
        </div>
        {onCerrar && (
          <button
            type="button"
            className="rc-toast__cerrar"
            aria-label="Cerrar aviso"
            onClick={onCerrar}
          >
            <svg className="rc-icono rc-icono--sm" aria-hidden="true">
              <use href="#rc-ico-cerrar-v2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Contexto, Proveedor y Hook para Avisos flotantes
// -------------------------------------------------------------
export interface AvisoItem {
  id: string;
  tipo: TipoAviso;
  titulo: React.ReactNode;
  texto?: React.ReactNode;
  duracionMs?: number;
}

interface ContextoAvisosType {
  mostrarAviso: (aviso: Omit<AvisoItem, "id">) => string;
  cerrarAviso: (id: string) => void;
}

const ContextoAvisos = createContext<ContextoAvisosType | null>(null);

export function ProveedorAvisos({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<AvisoItem[]>([]);

  const cerrarAviso = useCallback((id: string) => {
    setAvisos((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const mostrarAviso = useCallback(
    ({ tipo, titulo, texto, duracionMs = 4000 }: Omit<AvisoItem, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const nuevo: AvisoItem = { id, tipo, titulo, texto, duracionMs };

      setAvisos((prev) => [...prev, nuevo]);

      if (duracionMs > 0) {
        setTimeout(() => {
          cerrarAviso(id);
        }, duracionMs);
      }

      return id;
    },
    [cerrarAviso]
  );

  return (
    <ContextoAvisos.Provider value={{ mostrarAviso, cerrarAviso }}>
      {children}
      {avisos.length > 0 && (
        <aside
          aria-live="polite"
          style={{
            position: "fixed",
            top: "var(--rc-esp-16)",
            right: "var(--rc-esp-16)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            gap: "var(--rc-esp-10)",
            maxWidth: "360px",
            width: "calc(100vw - 32px)",
            pointerEvents: "none",
          }}
        >
          {avisos.map((item) => (
            <div key={item.id} style={{ pointerEvents: "auto" }}>
              <Aviso
                tipo={item.tipo}
                titulo={item.titulo}
                texto={item.texto}
                onCerrar={() => cerrarAviso(item.id)}
              />
            </div>
          ))}
        </aside>
      )}
    </ContextoAvisos.Provider>
  );
}

export function useAviso() {
  const ctx = useContext(ContextoAvisos);
  if (!ctx) {
    // Si se usa fuera del proveedor, fallback seguro en consola
    return {
      mostrarAviso: (aviso: Omit<AvisoItem, "id">) => {
        console.warn("useAviso usado fuera de ProveedorAvisos:", aviso);
        return "";
      },
      cerrarAviso: () => {},
    };
  }
  return ctx;
}
