"use client";

import { useEffect, useRef, useState } from "react";
import { FolderOpen, Image as ImageIcon, Paperclip, Plus, Video, X } from "lucide-react";
import styles from "./adjuntos.module.css";

export interface ArchivoNuevo {
  archivo: File;
  duracionSeg?: number;
}

export interface MenuAdjuntosProps {
  onArchivos: (archivos: ArchivoNuevo[]) => void;
  onDrive: (nombre: string, url: string) => void;
  onError: (mensaje: string) => void;
  deshabilitado?: boolean;
}

const MAX_MB = 20;
const TIPOS_TEXTUALES = "PDF, Word, Excel, ZIP, TXT, CSV y similares";

// Botón + del chat: imágenes, video, archivos y carpeta de Drive.
export function MenuAdjuntos({ onArchivos, onDrive, onError, deshabilitado = false }: MenuAdjuntosProps) {
  const [abierto, setAbierto] = useState(false);
  const [modoDrive, setModoDrive] = useState(false);
  const [driveNombre, setDriveNombre] = useState("");
  const [driveURL, setDriveURL] = useState("");
  const cajaRef = useRef<HTMLDivElement | null>(null);
  const inputImagenes = useRef<HTMLInputElement | null>(null);
  const inputVideos = useRef<HTMLInputElement | null>(null);
  const inputArchivos = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrarFuera = (e: MouseEvent) => {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) {
        setAbierto(false);
        setModoDrive(false);
      }
    };
    const escapar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        setModoDrive(false);
      }
    };
    document.addEventListener("mousedown", cerrarFuera);
    document.addEventListener("keydown", escapar);
    return () => {
      document.removeEventListener("mousedown", cerrarFuera);
      document.removeEventListener("keydown", escapar);
    };
  }, [abierto]);

  const escoger = (lista: FileList | null) => {
    if (!lista || lista.length === 0) return;
    const archivos: ArchivoNuevo[] = [];
    for (const archivo of Array.from(lista).slice(0, 6)) {
      if (archivo.size > MAX_MB * 1024 * 1024) {
        onError(`${archivo.name} pesa más de ${MAX_MB} MB. Para videos pesados comparte la carpeta de Drive.`);
        continue;
      }
      archivos.push({ archivo });
    }
    if (archivos.length > 0) onArchivos(archivos);
    setAbierto(false);
  };

  const pasarDrive = () => {
    const nombre = driveNombre.trim() || "Carpeta de Drive";
    const url = driveURL.trim();
    if (!/^https:\/\/(drive|docs)\.google\.com\//i.test(url)) {
      onError("Pega un enlace https de Google Drive (drive.google.com o docs.google.com).");
      return;
    }
    onDrive(nombre, url);
    setDriveNombre("");
    setDriveURL("");
    setModoDrive(false);
    setAbierto(false);
  };

  return (
    <div className={styles.menu} ref={cajaRef}>
      <button
        type="button"
        className={`${styles.masBoton} ${abierto ? styles.masBotonActivo : ""}`}
        onClick={() => {
          setAbierto((v) => !v);
          setModoDrive(false);
        }}
        disabled={deshabilitado}
        aria-label="Adjuntar"
        aria-expanded={abierto}
        aria-haspopup="menu"
        title="Adjuntar"
      >
        <Plus size={16} strokeWidth={2} />
      </button>

      {abierto && (
        <div className={styles.popover} role="menu" aria-label="Adjuntar al chat">
          {!modoDrive ? (
            <>
              <button type="button" className={styles.opcion} role="menuitem" onClick={() => inputImagenes.current?.click()}>
                <ImageIcon size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>
                  Imágenes
                  <em className={styles.opcionAyuda}>JPG, PNG, WebP o GIF</em>
                </span>
              </button>
              <button type="button" className={styles.opcion} role="menuitem" onClick={() => inputVideos.current?.click()}>
                <Video size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>
                  Video
                  <em className={styles.opcionAyuda}>Hasta {MAX_MB} MB</em>
                </span>
              </button>
              <button type="button" className={styles.opcion} role="menuitem" onClick={() => inputArchivos.current?.click()}>
                <Paperclip size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>
                  Archivos
                  <em className={styles.opcionAyuda}>{TIPOS_TEXTUALES}</em>
                </span>
              </button>
              <button type="button" className={styles.opcion} role="menuitem" onClick={() => setModoDrive(true)}>
                <FolderOpen size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>
                  Carpeta de Drive
                  <em className={styles.opcionAyuda}>Se comparte el enlace</em>
                </span>
              </button>
            </>
          ) : (
            <div className={styles.driveForm}>
              <div className={styles.driveCabecera}>
                <strong>Carpeta de Drive</strong>
                <button type="button" className={styles.driveCerrar} onClick={() => setModoDrive(false)} aria-label="Volver">
                  <X size={13} strokeWidth={2} />
                </button>
              </div>
              <label className={styles.driveCampo}>
                <span>Nombre</span>
                <input
                  type="text"
                  value={driveNombre}
                  onChange={(e) => setDriveNombre(e.target.value)}
                  placeholder="Ej.: Tomas del lunes"
                  maxLength={120}
                />
              </label>
              <label className={styles.driveCampo}>
                <span>Enlace</span>
                <input
                  type="url"
                  value={driveURL}
                  onChange={(e) => setDriveURL(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/…"
                  inputMode="url"
                />
              </label>
              <button type="button" className={styles.driveEnviar} onClick={pasarDrive}>
                Compartir carpeta
              </button>
            </div>
          )}
        </div>
      )}

      <input
        ref={inputImagenes}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        hidden
        onChange={(e) => {
          escoger(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={inputVideos}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        hidden
        onChange={(e) => {
          escoger(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={inputArchivos}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          escoger(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
