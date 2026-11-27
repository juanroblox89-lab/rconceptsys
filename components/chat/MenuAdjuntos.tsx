"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  FolderOpen,
  Image as ImageIcon,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  Video,
  X,
} from "lucide-react";
import { api, type ApiError } from "@/lib/api";
import { type DialogoPicker, traducirErrorGooglePicker } from "@/lib/google-picker";
import { abrirSelectorGoogleDrive } from "@/components/PickerDriveCliente";
import { usePerfilActual } from "@/components/AppShell";
import { errorEnlaceDrive } from "@/components/ui/EnlaceDrive";
import { normalizarUrlEnlace } from "@/lib/drive-equipo";
import { Boton } from "@/components/ui/Boton";
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
  esAdmin?: boolean;
}

const MAX_MB = 20;
const TIPOS_TEXTUALES = "PDF, Word, Excel, ZIP, TXT, CSV y similares";

interface CarpetaAutorizada {
  clave: string;
  nombre: string;
  url: string;
  origen: string;
}

// Botón + del chat: imágenes, video, archivos y carpeta de Drive.
export function MenuAdjuntos({
  onArchivos,
  onDrive,
  onError,
  deshabilitado = false,
  esAdmin,
}: MenuAdjuntosProps) {
  const perfil = usePerfilActual();
  const puedeUsarPicker = esAdmin ?? Boolean(perfil?.es_admin);

  const [abierto, setAbierto] = useState(false);
  const [modoDrive, setModoDrive] = useState(false);

  // Estado Picker real (admin)
  const [estadoPicker, setEstadoPicker] = useState<"listo" | "abriendo" | "sin_drive" | "sin_organizar">("listo");
  const [errorDrive, setErrorDrive] = useState("");
  const pickerDialogo = useRef<DialogoPicker | null>(null);
  const vigenteRef = useRef(true);

  // Estado selector autorizado + enlace manual (no admin y respaldo admin si Drive no está conectado)
  const [carpetas, setCarpetas] = useState<CarpetaAutorizada[]>([]);
  const [cargandoCarpetas, setCargandoCarpetas] = useState(false);
  const [errorCarpetas, setErrorCarpetas] = useState("");
  const [mostrarPegar, setMostrarPegar] = useState(false);
  const [driveNombre, setDriveNombre] = useState("");
  const [driveURL, setDriveURL] = useState("");
  const [errorPegar, setErrorPegar] = useState("");

  const cajaRef = useRef<HTMLDivElement | null>(null);
  const masBotonRef = useRef<HTMLButtonElement | null>(null);
  const inputImagenes = useRef<HTMLInputElement | null>(null);
  const inputVideos = useRef<HTMLInputElement | null>(null);
  const inputArchivos = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    vigenteRef.current = true;
    return () => {
      vigenteRef.current = false;
      try {
        pickerDialogo.current?.setVisible(false);
        pickerDialogo.current?.dispose?.();
      } catch {
        // Ignorar limpieza de diálogo cerrado
      }
      pickerDialogo.current = null;
    };
  }, []);

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
        masBotonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", cerrarFuera);
    document.addEventListener("keydown", escapar);
    return () => {
      document.removeEventListener("mousedown", cerrarFuera);
      document.removeEventListener("keydown", escapar);
    };
  }, [abierto]);

  // Cargar carpetas autorizadas del equipo/clientes/trabajos para miembros no admin
  useEffect(() => {
    if (!modoDrive || puedeUsarPicker) return;
    let montado = true;
    const cargar = async () => {
      setCargandoCarpetas(true);
      setErrorCarpetas("");
      try {
        const [clientesRes, tareasRes, resumenRes] = await Promise.allSettled([
          api.getClientes(),
          api.getTareas(),
          api.getEquipoResumen(),
        ]);
        if (!montado) return;

        if (
          clientesRes.status === "rejected" &&
          tareasRes.status === "rejected" &&
          resumenRes.status === "rejected"
        ) {
          setErrorCarpetas("No se pudieron cargar las carpetas autorizadas.");
          return;
        }

        const vistas = new Set<string>();
        const lista: CarpetaAutorizada[] = [];
        const agregar = (nombre: string, urlRaw: string | null | undefined, origen: string) => {
          const url = (urlRaw ?? "").trim();
          const limpioNombre = nombre.trim();
          if (!limpioNombre || !url || errorEnlaceDrive(url) !== null) return;
          const clave = normalizarUrlEnlace(url);
          if (vistas.has(clave)) return;
          vistas.add(clave);
          lista.push({ clave, nombre: limpioNombre, url, origen });
        };

        if (clientesRes.status === "fulfilled") {
          for (const c of clientesRes.value ?? []) {
            if (c.drive_carpeta_id && c.drive_url) {
              agregar(c.nombre, c.drive_url, "Cliente");
            }
            for (const ref of c.drive_referencias ?? []) {
              if (ref.url) agregar(`${c.nombre} · ${ref.nombre}`, ref.url, "Cliente");
            }
          }
        }
        if (tareasRes.status === "fulfilled") {
          for (const t of tareasRes.value ?? []) {
            if (t.drive_carpeta_url) {
              agregar(t.titulo || "Carpeta de trabajo", t.drive_carpeta_url, "Trabajo");
            }
            for (const ref of t.drive_referencias ?? []) {
              agregar(ref.nombre, ref.url, "Trabajo");
            }
          }
        }
        if (resumenRes.status === "fulfilled") {
          for (const e of resumenRes.value?.enlaces ?? []) {
            agregar(e.nombre, e.url, "Equipo");
          }
        }
        setCarpetas(lista);
      } catch {
        if (!montado) return;
        setErrorCarpetas("No se pudieron cargar las carpetas autorizadas.");
      } finally {
        if (montado) setCargandoCarpetas(false);
      }
    };
    void cargar();
    return () => {
      montado = false;
    };
  }, [modoDrive, puedeUsarPicker]);

  const abrirPickerAdmin = async () => {
    if (!puedeUsarPicker || estadoPicker === "abriendo") return;
    setErrorDrive("");
    setEstadoPicker("abriendo");
    setModoDrive(true);
    setMostrarPegar(false);
    try {
      await abrirSelectorGoogleDrive({
        multiselect: false,
        maxItems: 1,
        dialogoRef: pickerDialogo,
        vigenteRef,
        onAbrir: () => {
          if (!vigenteRef.current) return;
          setEstadoPicker("listo");
          // Cerrar el popover al abrir el diálogo nativo de Google Picker para evitar solapes o cierres accidentales.
          setAbierto(false);
          setModoDrive(false);
        },
        onCancelar: () => {
          if (!vigenteRef.current) return;
          setEstadoPicker("listo");
          setAbierto(false);
          setModoDrive(false);
          requestAnimationFrame(() => masBotonRef.current?.focus());
        },
        onError: (msg) => {
          if (!vigenteRef.current) return;
          setEstadoPicker("listo");
          setErrorDrive(msg);
        },
        onSeleccion: (elementos) => {
          if (!vigenteRef.current) return;
          const doc = elementos[0];
          if (!doc) {
            onError("No pudimos leer esa carpeta o archivo de Google Drive.");
            return;
          }
          onDrive(doc.nombre, doc.url);
          setAbierto(false);
          setModoDrive(false);
          requestAnimationFrame(() => masBotonRef.current?.focus());
        },
      });
    } catch (e) {
      if (!vigenteRef.current) return;
      const codigo = (e as ApiError).codigo;
      if (codigo === "drive_no_conectado") {
        setEstadoPicker("sin_drive");
      } else if (codigo === "drive_sin_organizar") {
        setEstadoPicker("sin_organizar");
      } else {
        setEstadoPicker("listo");
        setErrorDrive(traducirErrorGooglePicker(e));
      }
    }
  };

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

  const seleccionarCarpeta = (carpeta: CarpetaAutorizada) => {
    onDrive(carpeta.nombre, carpeta.url);
    setModoDrive(false);
    setAbierto(false);
  };

  const pasarDriveManual = () => {
    const url = driveURL.trim();
    const err = errorEnlaceDrive(url);
    if (!url || err) {
      setErrorPegar(err || "Pega un enlace https válido de Google Drive.");
      return;
    }
    const nombre = driveNombre.trim() || "Carpeta de Drive";
    onDrive(nombre, url);
    setDriveNombre("");
    setDriveURL("");
    setErrorPegar("");
    setMostrarPegar(false);
    setModoDrive(false);
    setAbierto(false);
  };

  const abrirPanelDrive = () => {
    setErrorDrive("");
    setErrorPegar("");
    if (puedeUsarPicker) {
      void abrirPickerAdmin();
    } else {
      setMostrarPegar(false);
      setModoDrive(true);
    }
  };

  return (
    <div className={styles.menu} ref={cajaRef}>
      <button
        ref={masBotonRef}
        type="button"
        className={`${styles.masBoton} ${abierto ? styles.masBotonActivo : ""}`}
        onClick={() => {
          setAbierto((v) => !v);
          setModoDrive(false);
          setErrorDrive("");
          setErrorPegar("");
        }}
        disabled={deshabilitado}
        data-rc-compositor-boton
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
              <button type="button" className={styles.opcion} role="menuitem" onClick={abrirPanelDrive}>
                <FolderOpen size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>
                  Carpeta de Drive
                  <em className={styles.opcionAyuda}>
                    {puedeUsarPicker ? "Elegir desde Google Drive" : "Compartir enlace autorizado"}
                  </em>
                </span>
              </button>
            </>
          ) : (
            <div className={styles.driveForm}>
              <div className={styles.driveCabecera}>
                <strong>Carpeta de Drive</strong>
                <button
                  type="button"
                  className={styles.driveCerrar}
                  onClick={() => {
                    setModoDrive(false);
                    setErrorDrive("");
                    setErrorPegar("");
                  }}
                  aria-label="Volver"
                >
                  <X size={13} strokeWidth={2} />
                </button>
              </div>

              {puedeUsarPicker ? (
                <>
                  {estadoPicker === "abriendo" ? (
                    <div className={styles.driveCargando} role="status">
                      <Loader2 size={16} strokeWidth={2} className={styles.loader} aria-hidden="true" />
                      Abriendo Google Drive…
                    </div>
                  ) : (
                    <Boton
                      variante="secundario"
                      tamano="sm"
                      onClick={() => void abrirPickerAdmin()}
                      disabled={estadoPicker === "sin_drive" || estadoPicker === "sin_organizar"}
                    >
                      Seleccionar en Google Drive
                    </Boton>
                  )}
                  {estadoPicker === "sin_drive" && (
                    <p className={styles.driveVacio} role="status">
                      Conecta el Drive del equipo en Gestión → Equipo.
                    </p>
                  )}
                  {estadoPicker === "sin_organizar" && (
                    <p className={styles.driveVacio} role="status">
                      Organiza el Drive del equipo en Gestión → Equipo.
                    </p>
                  )}
                  {errorDrive && (
                    <p className={styles.driveError} role="alert">
                      {errorDrive}
                    </p>
                  )}
                  {!mostrarPegar ? (
                    <button
                      type="button"
                      className={styles.driveTogglePegar}
                      onClick={() => setMostrarPegar(true)}
                    >
                      <Link2 size={12} strokeWidth={2} aria-hidden="true" />
                      Pegar enlace manualmente
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <p className={styles.driveNotaSoloLectura}>
                    Solo carpetas autorizadas · para editar abre directo en Drive.
                  </p>
                  {errorCarpetas && (
                    <p className={styles.driveError} role="alert">
                      {errorCarpetas}
                    </p>
                  )}
                  {cargandoCarpetas ? (
                    <div className={styles.driveCargando} role="status">
                      <Loader2 size={16} strokeWidth={2} className={styles.loader} aria-hidden="true" />
                      Cargando carpetas…
                    </div>
                  ) : carpetas.length === 0 ? (
                    <p className={styles.driveVacio}>No hay carpetas autorizadas disponibles.</p>
                  ) : (
                    <ul className={styles.driveLista} aria-label="Carpetas autorizadas">
                      {carpetas.map((carpeta) => (
                        <li key={carpeta.clave}>
                          <button
                            type="button"
                            className={styles.driveItem}
                            onClick={() => seleccionarCarpeta(carpeta)}
                          >
                            <span className={styles.driveItemIcono}>
                              <FolderOpen size={15} strokeWidth={1.75} aria-hidden="true" />
                            </span>
                            <span className={styles.driveItemTexto}>
                              <span className={styles.driveItemNombre}>{carpeta.nombre}</span>
                              <em className={styles.driveItemOrigen}>{carpeta.origen}</em>
                            </span>
                            <ChevronRight size={13} strokeWidth={2} aria-hidden="true" className={styles.driveItemFlecha} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!mostrarPegar ? (
                    <button
                      type="button"
                      className={styles.driveTogglePegar}
                      onClick={() => setMostrarPegar(true)}
                    >
                      <Link2 size={12} strokeWidth={2} aria-hidden="true" />
                      Pegar enlace de Drive
                    </button>
                  ) : null}
                </>
              )}

              {mostrarPegar && (
                <div className={styles.drivePegarCaja}>
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
                    <span>Enlace de Drive</span>
                    <input
                      type="url"
                      value={driveURL}
                      onChange={(e) => {
                        setDriveURL(e.target.value);
                        if (errorPegar) setErrorPegar("");
                      }}
                      placeholder="https://drive.google.com/…"
                      inputMode="url"
                    />
                  </label>
                  {errorPegar && (
                    <p className={styles.driveError} role="alert">
                      {errorPegar}
                    </p>
                  )}
                  <button type="button" className={styles.driveEnviar} onClick={pasarDriveManual}>
                    Agregar carpeta
                  </button>
                </div>
              )}
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
