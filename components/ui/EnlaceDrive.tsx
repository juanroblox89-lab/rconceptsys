"use client";

import { ExternalLink } from "lucide-react";

const HOSTS_PERMITIDOS = ["drive.google.com", "docs.google.com", "drive.usercontent.google.com"];

/** Valida un enlace de Google Drive. Devuelve el error o null si es válido/vacío. */
export function errorEnlaceDrive(enlace: string): string | null {
  const limpio = enlace.trim();
  if (limpio === "") return null;
  if (limpio.length > 500) return "El enlace no puede superar los 500 caracteres.";
  let url: URL;
  try {
    url = new URL(limpio);
  } catch {
    return "Escribe una URL completa, por ejemplo https://drive.google.com/...";
  }
  if (url.protocol !== "https:") return "El enlace debe empezar con https://";
  if (!HOSTS_PERMITIDOS.includes(url.hostname.toLowerCase()))
    return "El enlace debe ser de Google Drive (drive.google.com, docs.google.com o drive.usercontent.google.com).";
  return null;
}

export function EnlaceDrive({ enlace, etiqueta = "Abrir en Drive" }: { enlace?: string | null; etiqueta?: string }) {
  if (!enlace || errorEnlaceDrive(enlace)) return null;
  return (
    <a
      href={enlace}
      target="_blank"
      rel="noopener noreferrer"
      className="rc-btn rc-btn--secundario rc-btn--sm"
    >
      <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
      {etiqueta}
    </a>
  );
}
