"use client";

import { useState } from "react";
import { ExternalLink, FolderOpen, FolderPlus } from "lucide-react";
import { api } from "@/lib/api";
import { Tarea } from "@/lib/types";
import { useAviso } from "@/components/ui/Aviso";

export interface CarpetaDriveTareaProps {
  tarea: Tarea;
  onActualizada?: (tarea: Tarea) => void;
}

// Subcarpeta de la tarea en el Drive del equipo (F5).
// Si ya existe muestra el enlace; si no, el admin puede crearla.
export function CarpetaDriveTarea({ tarea, onActualizada }: CarpetaDriveTareaProps) {
  const { mostrarAviso } = useAviso();
  const [creando, setCreando] = useState(false);

  const crear = async () => {
    setCreando(true);
    try {
      const actualizada = await api.adminPostTareaDriveCarpeta(tarea.id, { crear: true });
      onActualizada?.(actualizada);
      mostrarAviso({ tipo: "exito", titulo: "Carpeta creada", texto: "La entrega se copiará ahí al marcarla hecha." });
    } catch (err) {
      mostrarAviso({
        tipo: "error",
        titulo: "No se pudo crear la carpeta",
        texto: err instanceof Error ? err.message : "Conecta el Drive del equipo en Gestión.",
      });
    } finally {
      setCreando(false);
    }
  };

  if (tarea.drive_carpeta_url) {
    return (
      <a
        href={tarea.drive_carpeta_url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 12,
          color: "var(--rc-azul-texto)",
          textDecoration: "none",
        }}
        title="Abrir la carpeta de la tarea en Drive"
      >
        <FolderOpen size={13} strokeWidth={1.9} aria-hidden="true" />
        Carpeta de la tarea
        <ExternalLink size={11} strokeWidth={2} aria-hidden="true" />
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={crear}
      disabled={creando}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        border: "none",
        background: "none",
        padding: 0,
        fontSize: 12,
        color: "var(--rc-texto-secundario)",
        cursor: creando ? "default" : "pointer",
        textDecoration: "underline",
      }}
      title="Crea la subcarpeta de esta tarea en el Drive del equipo"
    >
      <FolderPlus size={13} strokeWidth={1.9} aria-hidden="true" />
      {creando ? "Creando carpeta…" : "Crear carpeta en Drive"}
    </button>
  );
}
