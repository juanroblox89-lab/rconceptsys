"use client";

import { EnlaceExterno } from "@/components/ui/EnlaceExterno";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Check,
  Calendar,
  FileText,
  FolderOpen,
  Link2,
  MessageCircle,
  Pencil,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { diaBogota, fechaEntrega } from "@/lib/fecha-entrega";
import { api } from "@/lib/api";
import { DriveArchivo, MetodoEntrega, Tarea, TipoElementoEntrega } from "@/lib/types";
import { type DialogoPicker } from "@/lib/google-picker";
import { abrirPickerTrabajador } from "@/lib/picker-trabajador";
import { Boton } from "@/components/ui/Boton";
import { Chip } from "@/components/ui/Chip";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Modal } from "@/components/ui/Modal";
import { Campo } from "@/components/ui/Campo";
import { EnlaceDrive, errorEnlaceDrive } from "@/components/ui/EnlaceDrive";
import { CabeceraPagina } from "@/components/ui/CabeceraPagina";
import { useAviso } from "@/components/ui/Aviso";
import { ReferenciasDriveTrabajo } from "@/components/ui/ReferenciasDriveTrabajo";
import { AdjuntosRechazoVista } from "@/components/AdjuntosAsignacion";
import { enlaceReferenciaDrive } from "@/lib/referencias-trabajo";
import { useCambiosSinGuardar } from "@/components/CambiosSinGuardar";
import styles from "@/app/(app)/tareas/tareas.module.css";

interface SeleccionDrive {
  url: string;
  nombre: string;
  tipo: TipoElementoEntrega;
}

function inferirTipoDrive(url: string, tipoActual?: TipoElementoEntrega | null): TipoElementoEntrega {
  if (tipoActual === "carpeta" || tipoActual === "archivo") return tipoActual;
  return url.includes("/folders/") ? "carpeta" : "archivo";
}

function seleccionInicialDeTarea(t: Tarea): SeleccionDrive | null {
  const fuente = t.estado === "pendiente" && t.borrador_entrega ? t.borrador_entrega : null;
  const enlace = fuente ? fuente.enlace_medios : t.enlace_medios;
  if (!enlace || errorEnlaceDrive(enlace) !== null) return null;
  const tipo = inferirTipoDrive(enlace, fuente ? fuente.entrega_tipo : t.entrega_tipo);
  const nombre =
    (fuente ? fuente.entrega_nombre : t.entrega_nombre)?.trim() ||
    (tipo === "carpeta" ? "Carpeta de Drive" : "Archivo de Drive");
  return { url: enlace, nombre, tipo };
}

export function MisTareas() {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalTarea, setModalTarea] = useState<Tarea | null>(null);
  const [metodoEntrega, setMetodoEntrega] = useState<MetodoEntrega>("drive");
  const [nota, setNota] = useState("");
  const [minutos, setMinutos] = useState<string>("");
  const [seleccionDrive, setSeleccionDrive] = useState<SeleccionDrive | null>(null);
  const [mostrarPegar, setMostrarPegar] = useState(false);
  const [enlaceManual, setEnlaceManual] = useState("");
  const [nombreManual, setNombreManual] = useState("");
  const [abriendoPicker, setAbriendoPicker] = useState(false);
  const [errorPicker, setErrorPicker] = useState("");
  const [mostrarCarpetaEquipo, setMostrarCarpetaEquipo] = useState(false);
  const [archivosEquipo, setArchivosEquipo] = useState<DriveArchivo[]>([]);
  const [cargandoEquipo, setCargandoEquipo] = useState(false);
  const [errorEquipo, setErrorEquipo] = useState("");
  const [pilaCarpetas, setPilaCarpetas] = useState<Array<{ id?: string; nombre: string }>>([]);
  const [enviando, setEnviando] = useState(false);
  const [revirtiendoId, setRevirtiendoId] = useState<number | null>(null);
  const [inicialEntrega, setInicialEntrega] = useState<{
    metodo: MetodoEntrega;
    nota: string;
    minutos: string;
    driveUrl: string;
  } | null>(null);

  const modalEntregaSucio = Boolean(
    modalTarea &&
      inicialEntrega &&
      (metodoEntrega !== inicialEntrega.metodo ||
        nota !== inicialEntrega.nota ||
        minutos !== inicialEntrega.minutos ||
        (seleccionDrive?.url ?? "") !== inicialEntrega.driveUrl ||
        enlaceManual.trim() !== "" ||
        nombreManual.trim() !== ""),
  );
  const { confirmarSalida, limpiarRegistro } = useCambiosSinGuardar(modalEntregaSucio);

  const pickerDialogo = useRef<DialogoPicker | null>(null);
  const pickerVigente = useRef(true);
  const { mostrarAviso } = useAviso();

  useEffect(() => {
    pickerVigente.current = true;
    return () => {
      pickerVigente.current = false;
      try {
        pickerDialogo.current?.setVisible(false);
        pickerDialogo.current?.dispose?.();
      } catch {
        // Ignorar cierre previo
      }
      pickerDialogo.current = null;
    };
  }, []);

  const cargarTareas = useCallback(async () => {
    try {
      const data = await api.getTareas();
      setTareas(Array.isArray(data) ? data : []);
    } catch {
      mostrarAviso({
        tipo: "error",
        titulo: "No se pudieron cargar tus tareas",
      });
    } finally {
      setCargando(false);
    }
  }, [mostrarAviso]);

  useEffect(() => {
    let montado = true;
    (async () => {
      try {
        const data = await api.getTareas();
        if (montado) setTareas(Array.isArray(data) ? data : []);
      } catch {
        if (montado) {
          mostrarAviso({
            tipo: "error",
            titulo: "No se pudieron cargar tus tareas",
          });
        }
      } finally {
        if (montado) setCargando(false);
      }
    })();

    return () => {
      montado = false;
    };
  }, [mostrarAviso]);

  const abrirModalHecha = (t: Tarea) => {
    const borrador = t.estado === "pendiente" ? t.borrador_entrega : null;
    const metodoInicial: MetodoEntrega =
      borrador?.metodo_entrega === "whatsapp" || (!borrador && t.metodo_entrega === "whatsapp")
        ? "whatsapp"
        : "drive";
    const selInicial = seleccionInicialDeTarea(t);

    setModalTarea(t);
    setMetodoEntrega(metodoInicial);
    const notaIni = borrador?.nota ?? t.nota_persona ?? "";
    setNota(notaIni);
    const cantInicial = borrador?.cantidad ?? t.cantidad;
    const minIni = cantInicial ? String(cantInicial) : "";
    setMinutos(minIni);
    setSeleccionDrive(selInicial);
    setInicialEntrega({
      metodo: metodoInicial,
      nota: notaIni,
      minutos: minIni,
      driveUrl: selInicial?.url ?? "",
    });
    setMostrarPegar(false);
    setEnlaceManual("");
    setNombreManual("");
    setErrorPicker("");
    setMostrarCarpetaEquipo(false);
    setArchivosEquipo([]);
    setErrorEquipo("");
    setPilaCarpetas([]);
  };

  const cerrarModal = () => {
    if (enviando || abriendoPicker) return;
    confirmarSalida(() => {
      setModalTarea(null);
      setInicialEntrega(null);
      setMetodoEntrega("drive");
      setNota("");
      setMinutos("");
      setSeleccionDrive(null);
      setMostrarPegar(false);
      setEnlaceManual("");
      setNombreManual("");
      setErrorPicker("");
      setMostrarCarpetaEquipo(false);
      setArchivosEquipo([]);
      setErrorEquipo("");
      setPilaCarpetas([]);
    });
  };

  const handleElegirDeDrive = async () => {
    if (!modalTarea || abriendoPicker || enviando) return;
    setErrorPicker("");
    setAbriendoPicker(true);
    try {
      await abrirPickerTrabajador({
        tareaId: modalTarea.id,
        dialogoRef: pickerDialogo,
        vigenteRef: pickerVigente,
        onAbrir: () => {
          if (pickerVigente.current) setAbriendoPicker(false);
        },
        onCancelar: () => {
          if (pickerVigente.current) setAbriendoPicker(false);
        },
        onSeleccion: (el) => {
          if (!pickerVigente.current) return;
          setAbriendoPicker(false);
          setSeleccionDrive({ url: el.url, nombre: el.nombre, tipo: el.tipo });
          setMostrarPegar(false);
          setEnlaceManual("");
          setMostrarCarpetaEquipo(false);
          setErrorPicker("");
        },
      });
    } catch (err) {
      if (!pickerVigente.current) return;
      setAbriendoPicker(false);
      setErrorPicker(err instanceof Error ? err.message : "No pudimos abrir Google Drive.");
    }
  };

  const cargarCarpetaEquipo = async (carpetaId?: string, nombre?: string, retroceder = false) => {
    if (!modalTarea) return;
    setCargandoEquipo(true);
    setErrorEquipo("");
    try {
      const lista = await api.getTareaDriveArchivos(modalTarea.id, carpetaId);
      setArchivosEquipo(Array.isArray(lista) ? lista : []);
      if (!retroceder) {
        if (!carpetaId) {
          setPilaCarpetas([{ id: undefined, nombre: "Carpeta del trabajo" }]);
        } else {
          setPilaCarpetas((prev) => [...prev, { id: carpetaId, nombre: nombre || "Carpeta" }]);
        }
      }
    } catch (err) {
      setErrorEquipo(err instanceof Error ? err.message : "No se pudo abrir la carpeta del trabajo.");
    } finally {
      setCargandoEquipo(false);
    }
  };

  const handleAbrirCarpetaEquipo = () => {
    if (mostrarCarpetaEquipo) {
      setMostrarCarpetaEquipo(false);
      return;
    }
    setMostrarCarpetaEquipo(true);
    void cargarCarpetaEquipo();
  };

  const handleRetrocederCarpeta = () => {
    if (pilaCarpetas.length <= 1) return;
    const nuevaPila = pilaCarpetas.slice(0, -1);
    const destino = nuevaPila[nuevaPila.length - 1];
    setPilaCarpetas(nuevaPila);
    void cargarCarpetaEquipo(destino?.id, destino?.nombre, true);
  };

  const aplicarEnlaceManual = () => {
    const limpio = enlaceManual.trim();
    const err = errorEnlaceDrive(limpio);
    if (!limpio || err) {
      setErrorPicker(err || "Pega un enlace válido de Google Drive.");
      return;
    }
    const tipo = inferirTipoDrive(limpio);
    const nombre = nombreManual.trim() || (tipo === "carpeta" ? "Carpeta de Drive" : "Archivo de Drive");
    setSeleccionDrive({ url: limpio, nombre, tipo });
    setMostrarPegar(false);
    setEnlaceManual("");
    setNombreManual("");
    setErrorPicker("");
  };

  const errorEnlace = enlaceManual.trim() ? errorEnlaceDrive(enlaceManual) : null;

  const handleMarcarHecha = async () => {
    if (!modalTarea || enviando || abriendoPicker) return;

    let enlaceFinal: string | undefined;
    let nombreFinal: string | undefined;
    let tipoFinal: TipoElementoEntrega | undefined;

    if (metodoEntrega === "drive") {
      if (seleccionDrive) {
        const errSel = errorEnlaceDrive(seleccionDrive.url);
        if (errSel) {
          setErrorPicker(errSel);
          return;
        }
        enlaceFinal = seleccionDrive.url;
        nombreFinal = seleccionDrive.nombre;
        tipoFinal = seleccionDrive.tipo;
      } else if (mostrarPegar && enlaceManual.trim()) {
        const errMan = errorEnlaceDrive(enlaceManual);
        if (errMan) {
          setErrorPicker(errMan);
          return;
        }
        enlaceFinal = enlaceManual.trim();
        tipoFinal = inferirTipoDrive(enlaceFinal);
        nombreFinal = nombreManual.trim() || (tipoFinal === "carpeta" ? "Carpeta de Drive" : "Archivo de Drive");
      } else {
        setErrorPicker("Elige una carpeta o archivo de Drive, o cambia a Entrega por WhatsApp.");
        return;
      }
    }

    const esMinuto = modalTarea.tipo?.unidad === "minuto";
    let cantNum: number | undefined = undefined;
    if (esMinuto) {
      const num = parseInt(minutos, 10);
      if (isNaN(num) || num < 1 || num > 1440) {
        mostrarAviso({
          tipo: "error",
          titulo: "Minutos requeridos",
          texto: "Ingresa entre 1 y 1440 minutos.",
        });
        return;
      }
      cantNum = num;
    }

    setEnviando(true);
    setErrorPicker("");
    try {
      await api.postTareaHecha(modalTarea.id, nota.trim() || undefined, cantNum, enlaceFinal, {
        metodo_entrega: metodoEntrega,
        entrega_nombre: nombreFinal,
        entrega_tipo: tipoFinal,
      });
      mostrarAviso({
        tipo: "exito",
        titulo: "Entrega enviada a revisión",
      });
      limpiarRegistro();
      setModalTarea(null);
      setInicialEntrega(null);
      setNota("");
      setMinutos("");
      setSeleccionDrive(null);
      await cargarTareas();
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({
        tipo: "error",
        titulo: "No se pudo actualizar",
        texto: e.message || "Ocurrió un error al marcar la tarea.",
      });
    } finally {
      setEnviando(false);
    }
  };

  const handleRevertirEntrega = async (t: Tarea) => {
    if (revirtiendoId !== null) return;
    setRevirtiendoId(t.id);
    try {
      const actualizada = await api.revertirEntregaTarea(t.id);
      setTareas((prev) => prev.map((x) => (x.id === actualizada.id ? actualizada : x)));
      abrirModalHecha(actualizada);
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({
        tipo: "error",
        titulo: "No se pudo cambiar la entrega",
        texto: e.message || "La tarea cambió de estado y ya no se puede retirar.",
      });
      await cargarTareas();
    } finally {
      setRevirtiendoId(null);
    }
  };

  const [hoy] = useState(() => diaBogota());
  const [destino, setDestino] = useState("");
  useEffect(() => {
    const sincronizar = () => setDestino(new URLSearchParams(window.location.search).get("tarea") ?? "");
    sincronizar();
    window.addEventListener("hashchange", sincronizar);
    return () => window.removeEventListener("hashchange", sincronizar);
  }, []);
  useEffect(() => {
    if (!cargando && destino) document.getElementById(`tarea-${destino}`)?.scrollIntoView({ block: "nearest" });
  }, [destino, cargando]);

  const pendientes = tareas.filter((t) => t.estado === "pendiente");
  const porRevisar = tareas.filter((t) => t.estado === "hecha");
  const rechazadas = tareas.filter((t) => t.estado === "rechazada");
  const aceptadas = tareas.filter((t) => t.estado === "aceptada");

  const tieneCarpetaTrabajo = Boolean(
    modalTarea?.drive_carpeta_id ||
      modalTarea?.drive_referencias?.some((r) => r.tipo === "carpeta" && r.id),
  );

  return (
    <div className={styles.container}>
      <CabeceraPagina titulo="Mis tareas" />

      {cargando ? (
        <div style={{ maxWidth: 640, margin: "2rem auto", width: "100%" }}>
          <Esqueleto filas={5} />
        </div>
      ) : tareas.length === 0 ? (
        <Tarjeta variante="vacia" tituloVacio="Sin tareas asignadas" />
      ) : (
        <>
          {/* 1. Pendientes */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Pendientes ({pendientes.length})</h2>
            </div>
            {pendientes.length === 0 ? (
              <Tarjeta variante="vacia" tituloVacio="Todo al día" />
            ) : (
              <div className={styles.grid}>
                {pendientes.map((t) =>
                  renderTarjeta(t, abrirModalHecha, handleRevertirEntrega, revirtiendoId, hoy, destino),
                )}
              </div>
            )}
          </section>

          {/* 2. Rechazadas */}
          {rechazadas.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle} style={{ color: "var(--rc-rojo-texto)" }}>
                  Rechazadas ({rechazadas.length})
                </h2>
              </div>
              <div className={styles.grid}>
                {rechazadas.map((t) =>
                  renderTarjeta(t, abrirModalHecha, handleRevertirEntrega, revirtiendoId, hoy, destino),
                )}
              </div>
            </section>
          )}

          {/* 3. Por revisar */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Por revisar ({porRevisar.length})</h2>
            </div>
            {porRevisar.length === 0 ? (
              <Tarjeta variante="vacia" tituloVacio="Sin revisiones pendientes" />
            ) : (
              <div className={styles.grid}>
                {porRevisar.map((t) =>
                  renderTarjeta(t, abrirModalHecha, handleRevertirEntrega, revirtiendoId, hoy, destino),
                )}
              </div>
            )}
          </section>

          {/* 4. Aceptadas */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Aceptadas ({aceptadas.length})</h2>
            </div>
            {aceptadas.length === 0 ? (
              <Tarjeta variante="vacia" tituloVacio="Sin tareas aceptadas" />
            ) : (
              <div className={styles.grid}>
                {aceptadas.map((t) =>
                  renderTarjeta(t, abrirModalHecha, handleRevertirEntrega, revirtiendoId, hoy, destino),
                )}
              </div>
            )}
          </section>
        </>
      )}

      {/* Modal para marcar como hecha */}
      {modalTarea && (
        <Modal
          abierto={true}
          titulo="Marcar tarea como hecha"
          descripcion={`Confirma la entrega de "${modalTarea.titulo}".`}
          onCerrar={cerrarModal}
          accionPrimaria={
            <Boton
              variante="primario"
              cargando={enviando}
              disabled={abriendoPicker}
              onClick={handleMarcarHecha}
            >
              Enviar a revisión
            </Boton>
          }
          accionSecundaria={
            <Boton variante="secundario" onClick={cerrarModal} disabled={enviando || abriendoPicker}>
              Cancelar
            </Boton>
          }
        >
          <div className={styles.modalContent}>
            {modalTarea.tipo?.unidad === "minuto" && (
              <div>
                <Campo
                  etiqueta="Minutos grabados *"
                  type="number"
                  min={1}
                  max={1440}
                  placeholder="Ej. 120 (entre 1 y 1440)"
                  value={minutos}
                  onChange={(
                    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
                  ) => setMinutos(e.target.value)}
                  disabled={enviando}
                />
                <div
                  style={{
                    fontSize: "var(--rc-fs-etiqueta)",
                    color: "var(--rc-texto-secundario)",
                    marginTop: "4px",
                  }}
                >
                  Se cobra por minuto grabado.
                </div>
              </div>
            )}

            {/* Selector segmentado de método de entrega */}
            <div
              className={styles.entregaMetodoGrupo}
              role="radiogroup"
              aria-label="Método de entrega"
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  const siguiente: MetodoEntrega = metodoEntrega === "drive" ? "whatsapp" : "drive";
                  setMetodoEntrega(siguiente);
                  setErrorPicker("");
                }
              }}
            >
              <button
                type="button"
                role="radio"
                aria-checked={metodoEntrega === "drive"}
                className={`${styles.entregaMetodoBtn} ${
                  metodoEntrega === "drive" ? styles.entregaMetodoActivo : ""
                }`}
                onClick={() => {
                  setMetodoEntrega("drive");
                  setErrorPicker("");
                }}
                disabled={enviando}
              >
                <FolderOpen size={15} aria-hidden="true" />
                Entrega por Drive
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={metodoEntrega === "whatsapp"}
                className={`${styles.entregaMetodoBtn} ${
                  metodoEntrega === "whatsapp" ? styles.entregaMetodoActivo : ""
                }`}
                onClick={() => {
                  setMetodoEntrega("whatsapp");
                  setErrorPicker("");
                }}
                disabled={enviando}
              >
                <MessageCircle size={15} aria-hidden="true" />
                Entrega por WhatsApp
              </button>
            </div>

            {metodoEntrega === "drive" ? (
              <div className={styles.driveBloque}>
                {seleccionDrive ? (
                  <div className={styles.driveSeleccionCard}>
                    <div className={styles.driveSeleccionInfo}>
                      {seleccionDrive.tipo === "carpeta" ? (
                        <FolderOpen size={18} aria-hidden="true" />
                      ) : (
                        <FileText size={18} aria-hidden="true" />
                      )}
                      <div className={styles.driveSeleccionTexto}>
                        <strong title={seleccionDrive.nombre}>{seleccionDrive.nombre}</strong>
                        <span>{seleccionDrive.tipo === "carpeta" ? "Carpeta de Drive" : "Archivo de Drive"}</span>
                      </div>
                    </div>
                    <div className={styles.driveSeleccionBotones}>
                      <EnlaceDrive enlace={seleccionDrive.url} etiqueta="Abrir" />
                      <Boton
                        variante="peligro"
                        tamano="sm"
                        onClick={() => setSeleccionDrive(null)}
                        disabled={enviando}
                        aria-label={`Quitar ${seleccionDrive.nombre}`}
                      >
                        <Trash2 size={14} aria-hidden="true" /> Quitar
                      </Boton>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={styles.driveAcciones}>
                      <Boton
                        variante="secundario"
                        cargando={abriendoPicker}
                        disabled={enviando}
                        onClick={() => void handleElegirDeDrive()}
                      >
                        <FolderOpen size={15} aria-hidden="true" />
                        Elegir de Drive
                      </Boton>
                      {tieneCarpetaTrabajo && (
                        <Boton
                          variante="fantasma"
                          tamano="sm"
                          disabled={enviando || abriendoPicker}
                          onClick={handleAbrirCarpetaEquipo}
                        >
                          {mostrarCarpetaEquipo ? "Ocultar carpeta del trabajo" : "Carpeta del trabajo"}
                        </Boton>
                      )}
                    </div>

                    {mostrarCarpetaEquipo && (
                      <div className={styles.carpetaEquipoCaja} aria-label="Carpeta del trabajo en Drive">
                        <div className={styles.carpetaEquipoCabecera}>
                          <span>{pilaCarpetas[pilaCarpetas.length - 1]?.nombre || "Carpeta del trabajo"}</span>
                          {pilaCarpetas.length > 1 && (
                            <Boton variante="fantasma" tamano="sm" onClick={handleRetrocederCarpeta} disabled={cargandoEquipo}>
                              <ArrowLeft size={13} aria-hidden="true" /> Subir
                            </Boton>
                          )}
                        </div>
                        {cargandoEquipo ? (
                          <span style={{ fontSize: "var(--rc-fs-etiqueta)", color: "var(--rc-texto-secundario)" }} role="status">
                            Cargando elementos…
                          </span>
                        ) : errorEquipo ? (
                          <span className={styles.errorInline} role="alert">{errorEquipo}</span>
                        ) : archivosEquipo.length === 0 ? (
                          <span style={{ fontSize: "var(--rc-fs-etiqueta)", color: "var(--rc-texto-secundario)" }}>
                            Esta carpeta está vacía.
                          </span>
                        ) : (
                          <ul className={styles.carpetaEquipoLista}>
                            {archivosEquipo.map((item) => (
                              <li key={item.id} className={styles.carpetaEquipoItem}>
                                <button
                                  type="button"
                                  className={styles.carpetaEquipoNombre}
                                  onClick={() => {
                                    if (item.es_carpeta) {
                                      void cargarCarpetaEquipo(item.id, item.nombre);
                                    } else if (item.enlace) {
                                      setSeleccionDrive({ url: item.enlace, nombre: item.nombre, tipo: "archivo" });
                                      setMostrarCarpetaEquipo(false);
                                      setErrorPicker("");
                                    }
                                  }}
                                >
                                  {item.es_carpeta ? (
                                    <FolderOpen size={15} aria-hidden="true" />
                                  ) : (
                                    <FileText size={15} aria-hidden="true" />
                                  )}
                                  <span title={item.nombre}>{item.nombre}</span>
                                </button>
                                <Boton
                                  variante="secundario"
                                  tamano="sm"
                                  onClick={() => {
                                    const url =
                                      item.enlace ||
                                      (item.es_carpeta
                                        ? `https://drive.google.com/drive/folders/${item.id}`
                                        : `https://drive.google.com/open?id=${item.id}`);
                                    setSeleccionDrive({
                                      url,
                                      nombre: item.nombre,
                                      tipo: item.es_carpeta ? "carpeta" : "archivo",
                                    });
                                    setMostrarCarpetaEquipo(false);
                                    setErrorPicker("");
                                  }}
                                >
                                  Elegir
                                </Boton>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      className={styles.togglePegar}
                      aria-expanded={mostrarPegar}
                      onClick={() => {
                        setMostrarPegar((v) => !v);
                        setErrorPicker("");
                      }}
                    >
                      <Link2 size={13} aria-hidden="true" />
                      {mostrarPegar ? "Ocultar enlace manual" : "Pegar enlace manualmente"}
                    </button>

                    {mostrarPegar && (
                      <div className={styles.pegarCaja}>
                        <Campo
                          etiqueta="Nombre (opcional)"
                          placeholder="Ej. Carpeta final del reel"
                          value={nombreManual}
                          onChange={(
                            e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
                          ) => setNombreManual(e.target.value.slice(0, 200))}
                          disabled={enviando}
                        />
                        <Campo
                          etiqueta="Enlace de Drive"
                          type="url"
                          inputMode="url"
                          placeholder="https://drive.google.com/..."
                          value={enlaceManual}
                          onChange={(
                            e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
                          ) => {
                            setEnlaceManual(e.target.value.slice(0, 500));
                            if (errorPicker) setErrorPicker("");
                          }}
                          error={errorEnlace ?? undefined}
                          disabled={enviando}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <Boton variante="secundario" tamano="sm" onClick={aplicarEnlaceManual} disabled={enviando}>
                            Usar enlace
                          </Boton>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {errorPicker && (
                  <p className={styles.errorInline} role="alert">
                    {errorPicker}
                  </p>
                )}
              </div>
            ) : (
              <div className={styles.whatsappAvisoBox} role="status">
                <MessageCircle size={17} aria-hidden="true" />
                <span>Se registrará que entregaste este trabajo por WhatsApp.</span>
              </div>
            )}

            <div>
              <Campo
                etiqueta="Nota (opcional)"
                como="textarea"
                filas={3}
                value={nota}
                onChange={(
                  e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
                ) => setNota(e.target.value.slice(0, 500))}
                disabled={enviando}
              />
              <div className={styles.charCounter}>{nota.length} / 500</div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function renderTarjeta(
  t: Tarea,
  onAbrirModal: (t: Tarea) => void,
  onRevertir: (t: Tarea) => void,
  revirtiendoId: number | null,
  hoy: string,
  destino: string,
) {
  const fecha = fechaEntrega(t.fecha_limite, hoy);
  const cliente = t.cliente?.nombre ?? "Sin cliente";
  const activa = t.estado === "pendiente" || t.estado === "rechazada";
  const esEntregada = t.estado === "hecha" || t.estado === "aceptada";
  const rechazoDrive = t.rechazo_actual?.drive_adjuntos ?? [];
  const rechazoMedios = t.rechazo_actual?.adjuntos ?? [];

  return (
    <article
      key={t.id}
      id={`tarea-${t.id}`}
      className={`${styles.tareaCard} ${destino === String(t.id) ? styles.tareaResaltada : ""}`}
    >
      <div className={styles.tareaCardTop}>
        <h3 className={styles.tareaIdentidad}>
          <Avatar
            src={t.cliente?.foto_url ?? undefined}
            iniciales={cliente.slice(0, 2).toUpperCase()}
            alt=""
            tamano={40}
          />
          <span>{cliente}</span>
        </h3>
        {fecha && (
          <time
            dateTime={t.fecha_limite ?? undefined}
            className={`${styles.entregaFecha} ${activa && fecha.urgente ? styles.fechaVencida : ""}`}
          >
            <span>
              <Calendar size={15} aria-hidden="true" /> {fecha.relativa}
            </span>
            <small>{fecha.absoluta}</small>
          </time>
        )}
      </div>
      <div>
        <Chip punto="azul">{t.tipo?.nombre ?? "Trabajo"}</Chip>
      </div>
      <p className={styles.tareaDescripcion}>{t.descripcion || t.titulo}</p>
      <div className={styles.tareaMeta}>
        {t.estado === "aceptada" && t.precio_congelado != null && (
          <span className={styles.precioCongelado}>
            {t.tipo?.unidad === "minuto" && t.cantidad_aceptada
              ? `${t.cantidad_aceptada} min × $ ${(t.precio_unitario_congelado || 0).toLocaleString("es-CO")} = $ ${t.precio_congelado.toLocaleString("es-CO")}`
              : `$ ${t.precio_congelado.toLocaleString("es-CO")}`}
          </span>
        )}
      </div>

      {t.estado === "rechazada" && t.motivo_rechazo && (
        <div className={styles.motivoRechazoBox}>
          <div>
            <div className={styles.motivoRechazoTitulo}>Motivo del rechazo:</div>
            <div>{t.motivo_rechazo}</div>
          </div>
          {rechazoDrive.length > 0 && (
            <ul className={styles.rechazoDriveLista} aria-label="Elementos de Drive del rechazo">
              {rechazoDrive.map((d) => (
                <li key={d.id || d.url} className={styles.rechazoDriveItem}>
                  <span className={styles.rechazoDriveItemInfo}>
                    {d.tipo === "carpeta" ? (
                      <FolderOpen size={15} aria-hidden="true" />
                    ) : (
                      <FileText size={15} aria-hidden="true" />
                    )}
                    <span>{d.nombre}</span>
                  </span>
                  <EnlaceDrive enlace={d.url} />
                </li>
              ))}
            </ul>
          )}
          {rechazoMedios.length > 0 && <AdjuntosRechazoVista tarea={t.id} items={rechazoMedios} />}
        </div>
      )}

      {t.nota_persona && t.estado !== "pendiente" && (
        <div className={styles.notaPersonaBox}>
          <strong>Tu nota:</strong> {t.nota_persona}
        </div>
      )}

      {esEntregada && (t.metodo_entrega === "whatsapp" || t.enlace_medios) && (
        <div className={styles.entregaResumenBox}>
          {t.metodo_entrega === "whatsapp" ? (
            <span className={styles.entregaWhatsappChip}>
              <MessageCircle size={14} aria-hidden="true" />
              Entregado por WhatsApp
            </span>
          ) : (
            <>
              {t.entrega_nombre && (
                <span className={styles.entregaDriveNombre}>
                  {t.entrega_tipo === "carpeta" ? (
                    <FolderOpen size={14} aria-hidden="true" />
                  ) : (
                    <FileText size={14} aria-hidden="true" />
                  )}
                  <span>{t.entrega_nombre}</span>
                </span>
              )}
              <EnlaceDrive enlace={t.enlace_medios} />
            </>
          )}
        </div>
      )}

      {!esEntregada && t.enlace_medios && (
        <div style={{ marginTop: "var(--rc-esp-8)" }}>
          <EnlaceDrive enlace={t.enlace_medios} />
        </div>
      )}

      <ReferenciasDriveTrabajo tarea={t} />
      <div className={styles.tareaFooter}>
        <Link className="rc-btn rc-btn--secundario rc-btn--sm" href={`/trabajos/${t.id}?desde=tareas`}>
          Ver trabajo
        </Link>
        {t.drive_referencias != null && enlaceReferenciaDrive(t.drive_carpeta_url) && (
          <EnlaceExterno className={styles.carpetaTrabajo} href={t.drive_carpeta_url}>
            <FolderOpen size={16} aria-hidden="true" /> Carpeta de entrega
          </EnlaceExterno>
        )}
        {t.estado === "hecha" && (
          <Boton
            variante="fantasma"
            tamano="sm"
            cargando={revirtiendoId === t.id}
            disabled={revirtiendoId !== null}
            onClick={() => onRevertir(t)}
          >
            <Pencil size={13} strokeWidth={1.75} aria-hidden="true" />
            Cambiar
          </Boton>
        )}
        {activa && (
          <Boton variante="primario" tamano="sm" onClick={() => onAbrirModal(t)}>
            <Check size={14} strokeWidth={1.75} style={{ marginRight: 4 }} />
            {t.estado === "rechazada" ? "Volver a entregar" : "Entregar"}
          </Boton>
        )}
      </div>
    </article>
  );
}
