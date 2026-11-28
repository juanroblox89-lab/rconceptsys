"use client";

import { EnlaceExterno } from "@/components/ui/EnlaceExterno";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  Calendar,
  FileText,
  FolderOpen,
  Link2,
  Pencil,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { IconoWhatsApp } from "@/components/ui/IconoWhatsApp";
import { AvisoCuentaDrive } from "@/components/ui/AvisoCuentaDrive";
import { diaBogota, fechaEntrega } from "@/lib/fecha-entrega";
import { api } from "@/lib/api";
import { DriveArchivo, MetodoEntrega, ReferenciaDriveTrabajo, Tarea } from "@/lib/types";
import { type DialogoPicker, traducirErrorGooglePicker } from "@/lib/google-picker";
import { abrirPickerTrabajador } from "@/lib/picker-trabajador";
import { normalizarUrlEnlace } from "@/lib/drive-equipo";
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
import { GuionTrabajo } from "@/components/GuionTrabajo";
import {
  MAX_ELEMENTOS_ENTREGA_DRIVE,
  elementosEntregaDrive,
  enlaceReferenciaDrive,
  idElementoDrive,
  inferirTipoDrive,
} from "@/lib/referencias-trabajo";
import { useCambiosSinGuardar } from "@/components/CambiosSinGuardar";
import styles from "@/app/(app)/tareas/tareas.module.css";

function seleccionInicialDeTarea(t: Tarea): ReferenciaDriveTrabajo[] {
  const fuente =
    t.estado === "pendiente"
      ? t.borrador_entrega
      : t.borrador_entrega ?? t;
  return elementosEntregaDrive(fuente);
}

function firmaElementosDrive(lista: ReferenciaDriveTrabajo[]): string {
  return lista.map((x) => `${x.id}:${normalizarUrlEnlace(x.url)}`).join("|");
}

export function MisTareas() {
  const router = useRouter();
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [confirmarReentrega, setConfirmarReentrega] = useState<Tarea | null>(null);
  const [modalTarea, setModalTarea] = useState<Tarea | null>(null);
  const [metodoEntrega, setMetodoEntrega] = useState<MetodoEntrega>("drive");
  const [nota, setNota] = useState("");
  const [minutos, setMinutos] = useState<string>("");
  const [seleccionDrive, setSeleccionDrive] = useState<ReferenciaDriveTrabajo[]>([]);
  const [avisoCuentaDrive, setAvisoCuentaDrive] = useState(false);
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
  const [whatsappInfo, setWhatsappInfo] = useState<{
    estado: "cargando" | "listo" | "error";
    url: string;
    nombre: string;
  } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [revirtiendoId, setRevirtiendoId] = useState<number | null>(null);
  const [inicialEntrega, setInicialEntrega] = useState<{
    metodo: MetodoEntrega;
    nota: string;
    minutos: string;
    driveFirma: string;
  } | null>(null);

  const modalEntregaSucio = Boolean(
    modalTarea &&
      inicialEntrega &&
      (metodoEntrega !== inicialEntrega.metodo ||
        nota !== inicialEntrega.nota ||
        minutos !== inicialEntrega.minutos ||
        firmaElementosDrive(seleccionDrive) !== inicialEntrega.driveFirma ||
        enlaceManual.trim() !== "" ||
        nombreManual.trim() !== ""),
  );
  const { confirmarSalida, limpiarRegistro } = useCambiosSinGuardar(modalEntregaSucio);

  const pickerDialogo = useRef<DialogoPicker | null>(null);
  const pickerVigente = useRef(true);
  const tokenSelectorRef = useRef<string>("");
  const whatsappSolicitudRef = useRef(0);
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

  const cargarContactoWhatsApp = useCallback(async (tareaId: number) => {
    const ticket = ++whatsappSolicitudRef.current;
    setWhatsappInfo({ estado: "cargando", url: "", nombre: "" });
    try {
      const res = await api.getTareaWhatsApp(tareaId);
      if (whatsappSolicitudRef.current !== ticket) return;
      setWhatsappInfo({
        estado: "listo",
        url: typeof res?.url === "string" ? res.url : "",
        nombre: typeof res?.nombre === "string" ? res.nombre : "",
      });
    } catch {
      if (whatsappSolicitudRef.current !== ticket) return;
      setWhatsappInfo({ estado: "error", url: "", nombre: "" });
    }
  }, []);

  const abrirModalHecha = (t: Tarea) => {
    const borrador = t.estado === "pendiente" ? t.borrador_entrega : (t.borrador_entrega ?? null);
    const metodoInicial: MetodoEntrega =
      borrador?.metodo_entrega === "whatsapp" || (!borrador && t.metodo_entrega === "whatsapp")
        ? "whatsapp"
        : "drive";
    const selInicial = seleccionInicialDeTarea(t);

    tokenSelectorRef.current = "";
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
      driveFirma: firmaElementosDrive(selInicial),
    });
    setAvisoCuentaDrive(false);
    setMostrarPegar(false);
    setEnlaceManual("");
    setNombreManual("");
    setErrorPicker("");
    setMostrarCarpetaEquipo(false);
    setArchivosEquipo([]);
    setErrorEquipo("");
    setPilaCarpetas([]);
    void cargarContactoWhatsApp(t.id);
  };

  const cerrarModal = () => {
    if (enviando || abriendoPicker) return;
    confirmarSalida(() => {
      whatsappSolicitudRef.current++;
      tokenSelectorRef.current = "";
      setModalTarea(null);
      setInicialEntrega(null);
      setMetodoEntrega("drive");
      setNota("");
      setMinutos("");
      setSeleccionDrive([]);
      setAvisoCuentaDrive(false);
      setMostrarPegar(false);
      setEnlaceManual("");
      setNombreManual("");
      setErrorPicker("");
      setMostrarCarpetaEquipo(false);
      setArchivosEquipo([]);
      setErrorEquipo("");
      setPilaCarpetas([]);
      setWhatsappInfo(null);
    });
  };

  const agregarElementosDrive = (nuevos: ReferenciaDriveTrabajo[]): boolean => {
    let aviso = "";
    let agregados = 0;
    setSeleccionDrive((prev) => {
      const ids = new Set(prev.map((x) => x.id));
      const urls = new Set(prev.map((x) => normalizarUrlEnlace(x.url)));
      const salida = [...prev];
      let duplicado = false;
      let excedido = false;
      for (const el of nuevos) {
        const claveUrl = normalizarUrlEnlace(el.url);
        if (ids.has(el.id) || urls.has(claveUrl)) {
          duplicado = true;
          continue;
        }
        if (salida.length >= MAX_ELEMENTOS_ENTREGA_DRIVE) {
          excedido = true;
          break;
        }
        ids.add(el.id);
        urls.add(claveUrl);
        salida.push(el);
        agregados++;
      }
      if (excedido) {
        aviso = `Puedes entregar hasta ${MAX_ELEMENTOS_ENTREGA_DRIVE} elementos de Drive.`;
      } else if (duplicado && agregados === 0) {
        aviso = "Ese elemento ya está en tu entrega.";
      }
      return salida;
    });
    if (aviso) {
      setErrorPicker(aviso);
      return false;
    }
    setErrorPicker("");
    return agregados > 0;
  };

  const handleElegirDeDrive = async () => {
    if (!modalTarea || abriendoPicker || enviando || seleccionDrive.length >= MAX_ELEMENTOS_ENTREGA_DRIVE) return;
    setErrorPicker("");
    setAbriendoPicker(true);
    try {
      await abrirPickerTrabajador({
        tareaId: modalTarea.id,
        multiselect: true,
        maxItems: Math.max(1, MAX_ELEMENTOS_ENTREGA_DRIVE - seleccionDrive.length),
        dialogoRef: pickerDialogo,
        vigenteRef: pickerVigente,
        onAbrir: () => {
          if (pickerVigente.current) setAbriendoPicker(false);
        },
        onCancelar: () => {
          if (pickerVigente.current) setAbriendoPicker(false);
        },
        onError: (msg) => {
          if (!pickerVigente.current) return;
          setAbriendoPicker(false);
          setErrorPicker(msg);
        },
        onSeleccion: (elementos, accessToken) => {
          if (!pickerVigente.current) return;
          setAbriendoPicker(false);
          if (accessToken) {
            tokenSelectorRef.current = accessToken;
          }
          const nuevos: ReferenciaDriveTrabajo[] = elementos.map((el) => ({
            id: el.id,
            nombre: el.nombre,
            url: el.url,
            tipo: el.tipo,
          }));
          agregarElementosDrive(nuevos);
          setMostrarPegar(false);
          setEnlaceManual("");
          setMostrarCarpetaEquipo(false);
        },
      });
    } catch (err) {
      if (!pickerVigente.current) return;
      setAbriendoPicker(false);
      setErrorPicker(traducirErrorGooglePicker(err));
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

  const construirElementoManual = (urlRaw: string, nombreRaw: string): ReferenciaDriveTrabajo | null => {
    const limpio = urlRaw.trim();
    const err = errorEnlaceDrive(limpio);
    if (!limpio || err) {
      setErrorPicker(err || "Pega un enlace válido de Google Drive.");
      return null;
    }
    const id = idElementoDrive(limpio);
    if (!id) {
      setErrorPicker("El enlace de Drive debe incluir el identificador del archivo o carpeta.");
      return null;
    }
    const tipo = inferirTipoDrive(limpio);
    const nombre = nombreRaw.trim() || (tipo === "carpeta" ? "Carpeta de Drive" : "Archivo de Drive");
    return { id, nombre, url: limpio, tipo };
  };

  const aplicarEnlaceManual = () => {
    if (seleccionDrive.length >= MAX_ELEMENTOS_ENTREGA_DRIVE) {
      setErrorPicker(`Puedes entregar hasta ${MAX_ELEMENTOS_ENTREGA_DRIVE} elementos de Drive.`);
      return;
    }
    const el = construirElementoManual(enlaceManual, nombreManual);
    if (!el) return;
    if (agregarElementosDrive([el])) {
      setMostrarPegar(false);
      setEnlaceManual("");
      setNombreManual("");
    }
  };

  const errorEnlace = enlaceManual.trim() ? errorEnlaceDrive(enlaceManual) : null;

  const handleMarcarHecha = async () => {
    if (!modalTarea || enviando || abriendoPicker) return;

    let elementosFinales: ReferenciaDriveTrabajo[] | undefined;

    if (metodoEntrega === "drive") {
      const lista = [...seleccionDrive];
      if (mostrarPegar && enlaceManual.trim()) {
        if (lista.length >= MAX_ELEMENTOS_ENTREGA_DRIVE) {
          setErrorPicker(`Puedes entregar hasta ${MAX_ELEMENTOS_ENTREGA_DRIVE} elementos de Drive.`);
          return;
        }
        const manual = construirElementoManual(enlaceManual, nombreManual);
        if (!manual) return;
        const yaExiste = lista.some(
          (x) => x.id === manual.id || normalizarUrlEnlace(x.url) === normalizarUrlEnlace(manual.url),
        );
        if (yaExiste) {
          setErrorPicker("Ese elemento ya está en tu entrega.");
          return;
        }
        lista.push(manual);
      }

      if (lista.length === 0) {
        setErrorPicker("Elige al menos una carpeta o archivo de Drive, o cambia a Entrega por WhatsApp.");
        return;
      }
      if (lista.length > MAX_ELEMENTOS_ENTREGA_DRIVE) {
        setErrorPicker(`Puedes entregar hasta ${MAX_ELEMENTOS_ENTREGA_DRIVE} elementos de Drive.`);
        return;
      }
      for (const item of lista) {
        const errSel = errorEnlaceDrive(item.url);
        if (errSel) {
          setErrorPicker(errSel);
          return;
        }
      }
      elementosFinales = lista;
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
      const primero = elementosFinales?.[0];
      await api.postTareaHecha(modalTarea.id, nota.trim() || undefined, cantNum, primero?.url, {
        metodo_entrega: metodoEntrega,
        entrega_nombre: primero?.nombre,
        entrega_tipo: primero?.tipo,
        ...(elementosFinales ? { entrega_drive: elementosFinales } : {}),
        ...(elementosFinales && tokenSelectorRef.current ? { token_selector: tokenSelectorRef.current } : {}),
      });
      mostrarAviso({
        tipo: "exito",
        titulo: "Entrega enviada a revisión",
      });
      limpiarRegistro();
      tokenSelectorRef.current = "";
      whatsappSolicitudRef.current++;
      setModalTarea(null);
      setInicialEntrega(null);
      setNota("");
      setMinutos("");
      setSeleccionDrive([]);
      setWhatsappInfo(null);
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
  const porCorregir = tareas.filter((t) => t.estado === "rechazada");
  const aceptadas = tareas.filter((t) => t.estado === "aceptada");

  const tieneCarpetaTrabajo = Boolean(
    modalTarea?.drive_carpeta_id ||
      modalTarea?.drive_referencias?.some((r) => r.tipo === "carpeta" && r.id),
  );
  const puedeAgregarMasDrive = seleccionDrive.length < MAX_ELEMENTOS_ENTREGA_DRIVE;

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
                {pendientes.map((t) => (
                  <TarjetaTarea
                    key={t.id}
                    t={t}
                    onAbrirModal={abrirModalHecha}
                    onConfirmarReentrega={setConfirmarReentrega}
                    onRevertir={handleRevertirEntrega}
                    revirtiendoId={revirtiendoId}
                    hoy={hoy}
                    destino={destino}
                  />
                ))}
              </div>
            )}
          </section>

          {/* 2. Por corregir */}
          {porCorregir.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle} style={{ color: "var(--rc-naranja-texto, var(--rc-ambar-texto))" }}>
                  Por corregir ({porCorregir.length})
                </h2>
              </div>
              <div className={styles.gridPorCorregir}>
                {porCorregir.map((t) => (
                  <TarjetaTarea
                    key={t.id}
                    t={t}
                    onAbrirModal={abrirModalHecha}
                    onConfirmarReentrega={setConfirmarReentrega}
                    onRevertir={handleRevertirEntrega}
                    revirtiendoId={revirtiendoId}
                    hoy={hoy}
                    destino={destino}
                  />
                ))}
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
                {porRevisar.map((t) => (
                  <TarjetaTarea
                    key={t.id}
                    t={t}
                    onAbrirModal={abrirModalHecha}
                    onConfirmarReentrega={setConfirmarReentrega}
                    onRevertir={handleRevertirEntrega}
                    revirtiendoId={revirtiendoId}
                    hoy={hoy}
                    destino={destino}
                  />
                ))}
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
                {aceptadas.map((t) => (
                  <TarjetaTarea
                    key={t.id}
                    t={t}
                    onAbrirModal={abrirModalHecha}
                    onConfirmarReentrega={setConfirmarReentrega}
                    onRevertir={handleRevertirEntrega}
                    revirtiendoId={revirtiendoId}
                    hoy={hoy}
                    destino={destino}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Confirmación antes de volver a entregar una tarea por corregir */}
      {confirmarReentrega && (
        <Modal
          abierto={true}
          titulo="¿Estás seguro de que corregiste lo que te pidieron?"
          descripcion={`Confirma que revisaste las correcciones de «${confirmarReentrega.titulo}» antes de volver a enviarla.`}
          onCerrar={() => setConfirmarReentrega(null)}
          accionSecundaria={
            <Boton
              variante="secundario"
              onClick={() => {
                const id = confirmarReentrega.id;
                setConfirmarReentrega(null);
                router.push(`/trabajos/${id}?desde=tareas`);
              }}
            >
              Ver trabajo y correcciones
            </Boton>
          }
          accionPrimaria={
            <Boton
              variante="primario"
              onClick={() => {
                const t = confirmarReentrega;
                setConfirmarReentrega(null);
                abrirModalHecha(t);
              }}
            >
              Sí, continuar
            </Boton>
          }
        >
          {confirmarReentrega.motivo_rechazo && (
            <div className={styles.motivoRechazoBox} style={{ marginTop: "var(--rc-esp-8)" }}>
              <div className={styles.motivoRechazoTitulo}>Correcciones solicitadas:</div>
              <div>{confirmarReentrega.motivo_rechazo}</div>
            </div>
          )}
        </Modal>
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
                  setAvisoCuentaDrive(false);
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
                  setAvisoCuentaDrive(false);
                }}
                disabled={enviando}
              >
                <IconoWhatsApp size={15} />
                Entrega por WhatsApp
              </button>
            </div>

            {metodoEntrega === "drive" ? (
              <div className={styles.driveBloque}>
                {seleccionDrive.length > 0 && (
                  <>
                    <div className={styles.driveSeleccionCabecera}>
                      <span>Elementos de la entrega</span>
                      <span>{seleccionDrive.length} / {MAX_ELEMENTOS_ENTREGA_DRIVE}</span>
                    </div>
                    <ul className={styles.driveSeleccionLista} aria-label="Elementos de Drive para entregar">
                      {seleccionDrive.map((el) => (
                        <li key={el.id} className={styles.driveSeleccionCard}>
                          <div className={styles.driveSeleccionInfo}>
                            {el.tipo === "carpeta" ? (
                              <FolderOpen size={18} aria-hidden="true" />
                            ) : (
                              <FileText size={18} aria-hidden="true" />
                            )}
                            <div className={styles.driveSeleccionTexto}>
                              <strong title={el.nombre}>{el.nombre}</strong>
                              <span>{el.tipo === "carpeta" ? "Carpeta de Drive" : "Archivo de Drive"}</span>
                            </div>
                          </div>
                          <div className={styles.driveSeleccionBotones}>
                            <EnlaceDrive enlace={el.url} etiqueta="Abrir" />
                            <Boton
                              variante="peligro"
                              tamano="sm"
                              onClick={() => {
                                setSeleccionDrive((prev) => prev.filter((x) => x.id !== el.id));
                                setErrorPicker("");
                              }}
                              disabled={enviando}
                              aria-label={`Quitar ${el.nombre}`}
                            >
                              <Trash2 size={14} aria-hidden="true" /> Quitar
                            </Boton>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {puedeAgregarMasDrive ? (
                  <>
                    {avisoCuentaDrive ? (
                      <AvisoCuentaDrive
                        abriendo={abriendoPicker}
                        onCancelar={() => setAvisoCuentaDrive(false)}
                        onContinuar={() => {
                          setAvisoCuentaDrive(false);
                          void handleElegirDeDrive();
                        }}
                      />
                    ) : (
                      <div className={styles.driveAcciones}>
                        <Boton
                          variante="secundario"
                          cargando={abriendoPicker}
                          disabled={enviando}
                          onClick={() => {
                            setErrorPicker("");
                            setAvisoCuentaDrive(true);
                          }}
                        >
                          <FolderOpen size={15} aria-hidden="true" />
                          {seleccionDrive.length > 0 ? "Agregar de Drive" : "Elegir de Drive"}
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
                    )}

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
                                      const agregado = agregarElementosDrive([
                                        { id: item.id, url: item.enlace, nombre: item.nombre, tipo: "archivo" },
                                      ]);
                                      if (agregado) setMostrarCarpetaEquipo(false);
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
                                    const agregado = agregarElementosDrive([
                                      {
                                        id: item.id,
                                        url,
                                        nombre: item.nombre,
                                        tipo: item.es_carpeta ? "carpeta" : "archivo",
                                      },
                                    ]);
                                    if (agregado) setMostrarCarpetaEquipo(false);
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
                            Agregar enlace
                          </Boton>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: "var(--rc-fs-etiqueta)", color: "var(--rc-texto-secundario)" }}>
                    Máximo {MAX_ELEMENTOS_ENTREGA_DRIVE} elementos por entrega. Quita uno para elegir otro.
                  </span>
                )}

                {errorPicker && (
                  <p className={styles.errorInline} role="alert">
                    {errorPicker}
                  </p>
                )}
              </div>
            ) : (
              <div className={styles.whatsappAvisoBloque}>
                <div className={styles.whatsappAvisoBox} role="status">
                  <IconoWhatsApp size={17} />
                  <span>Se registrará que entregaste este trabajo por WhatsApp.</span>
                </div>
                {whatsappInfo?.estado === "cargando" ? (
                  <span style={{ fontSize: "var(--rc-fs-etiqueta)", color: "var(--rc-texto-secundario)" }} role="status">
                    Consultando contacto de WhatsApp…
                  </span>
                ) : whatsappInfo?.estado === "error" ? (
                  <div className={styles.whatsappContactoFila}>
                    <span className={styles.errorInline} role="alert">No pudimos consultar el contacto de WhatsApp.</span>
                    <Boton variante="secundario" tamano="sm" onClick={() => void cargarContactoWhatsApp(modalTarea.id)}>
                      Reintentar
                    </Boton>
                  </div>
                ) : whatsappInfo?.url ? (
                  <div className={styles.whatsappContactoFila}>
                    <EnlaceExterno
                      href={whatsappInfo.url}
                      className="rc-btn rc-btn--secundario rc-btn--sm"
                    >
                      <IconoWhatsApp size={15} />
                      {whatsappInfo.nombre ? `Abrir WhatsApp de ${whatsappInfo.nombre}` : "Abrir WhatsApp de quien asignó"}
                    </EnlaceExterno>
                    <span style={{ fontSize: "var(--rc-fs-etiqueta)", color: "var(--rc-texto-secundario)" }}>
                      Abrir el chat no envía nada ni marca la entrega.
                    </span>
                  </div>
                ) : (
                  <p className={styles.whatsappNoDisponible} role="status">
                    {whatsappInfo?.nombre
                      ? `El WhatsApp de ${whatsappInfo.nombre} no está disponible porque aún no tiene un número válido configurado.`
                      : "El contacto de WhatsApp de quien asignó este trabajo no está disponible."}
                  </p>
                )}
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

function TarjetaTarea({
  t,
  onAbrirModal,
  onConfirmarReentrega,
  onRevertir,
  revirtiendoId,
  hoy,
  destino,
}: {
  t: Tarea;
  onAbrirModal: (t: Tarea) => void;
  onConfirmarReentrega: (t: Tarea) => void;
  onRevertir: (t: Tarea) => void;
  revirtiendoId: number | null;
  hoy: string;
  destino: string;
}) {
  const fecha = fechaEntrega(t.fecha_limite, hoy);
  const cliente = t.cliente?.nombre ?? "Sin cliente";
  const activa = t.estado === "pendiente" || t.estado === "rechazada";
  const esPorCorregir = t.estado === "rechazada";
  const esEntregada = t.estado === "hecha" || t.estado === "aceptada";
  const rechazoDrive = t.rechazo_actual?.drive_adjuntos ?? [];
  const rechazoMedios = t.rechazo_actual?.adjuntos ?? [];
  const tieneAdjuntosRechazo = rechazoDrive.length > 0 || rechazoMedios.length > 0;
  const elementosEntregados = elementosEntregaDrive(t);

  return (
    <article
      id={`tarea-${t.id}`}
      className={`${styles.tareaCard} ${esPorCorregir ? styles.tareaCardPorCorregir : ""} ${destino === String(t.id) ? styles.tareaResaltada : ""}`}
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

      <div className={`${styles.porCorregirCuerpo} ${esPorCorregir && tieneAdjuntosRechazo ? styles.porCorregirCuerpoConAdjuntos : ""}`}>
        <div className={styles.porCorregirPrincipal}>
          <p className={styles.tareaDescripcion}>{t.descripcion || t.titulo}</p>
          <GuionTrabajo guion={t.guion} />
          {t.estado === "aceptada" && t.precio_congelado != null && (
            <div className={styles.tareaMeta}>
              <span className={styles.precioCongelado}>
                {t.tipo?.unidad === "minuto" && t.cantidad_aceptada
                  ? `${t.cantidad_aceptada} min × $ ${(t.precio_unitario_congelado || 0).toLocaleString("es-CO")} = $ ${t.precio_congelado.toLocaleString("es-CO")}`
                  : `$ ${t.precio_congelado.toLocaleString("es-CO")}`}
              </span>
            </div>
          )}

          {esPorCorregir && t.motivo_rechazo && (
            <div className={styles.motivoRechazoBox}>
              <div>
                <div className={styles.motivoRechazoTitulo}>Motivo de corrección:</div>
                <div>{t.motivo_rechazo}</div>
              </div>
            </div>
          )}
        </div>

        {esPorCorregir && tieneAdjuntosRechazo && (
          <div className={styles.porCorregirAdjuntos}>
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
            {rechazoMedios.length > 0 && <AdjuntosRechazoVista tarea={t.id} items={rechazoMedios} compacto={false} />}
          </div>
        )}
      </div>

      {t.nota_persona && t.estado !== "pendiente" && (
        <div className={styles.notaPersonaBox}>
          <strong>Tu nota:</strong> {t.nota_persona}
        </div>
      )}

      {esEntregada && (t.metodo_entrega === "whatsapp" || elementosEntregados.length > 0) && (
        <div className={styles.entregaResumenBox}>
          {t.metodo_entrega === "whatsapp" ? (
            <span className={styles.entregaWhatsappChip}>
              <IconoWhatsApp size={14} />
              Entregado por WhatsApp
            </span>
          ) : (
            <ul className={styles.entregaDriveLista} aria-label="Elementos entregados en Drive">
              {elementosEntregados.map((el) => (
                <li key={el.id || el.url} className={styles.entregaDriveItem}>
                  <span className={styles.entregaDriveNombre}>
                    {el.tipo === "carpeta" ? (
                      <FolderOpen size={14} aria-hidden="true" />
                    ) : (
                      <FileText size={14} aria-hidden="true" />
                    )}
                    <span>{el.nombre}</span>
                  </span>
                  <EnlaceDrive enlace={el.url} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!esEntregada && elementosEntregados.length > 0 && (
        <div className={styles.entregaResumenBox}>
          <ul className={styles.entregaDriveLista} aria-label="Elementos seleccionados en Drive">
            {elementosEntregados.map((el) => (
              <li key={el.id || el.url} className={styles.entregaDriveItem}>
                <span className={styles.entregaDriveNombre}>
                  {el.tipo === "carpeta" ? (
                    <FolderOpen size={14} aria-hidden="true" />
                  ) : (
                    <FileText size={14} aria-hidden="true" />
                  )}
                  <span>{el.nombre}</span>
                </span>
                <EnlaceDrive enlace={el.url} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <ReferenciasDriveTrabajo tarea={t} />
      <div className={styles.tareaFooter}>
        <Link className="rc-btn rc-btn--secundario rc-btn--sm" href={`/trabajos/${t.id}?desde=tareas`}>
          {esPorCorregir ? "Corregir" : "Ver trabajo"}
        </Link>
        {t.drive_referencias != null && enlaceReferenciaDrive(t.drive_carpeta_url) && (
          <EnlaceExterno className={styles.carpetaTrabajo} href={t.drive_carpeta_url}>
            <FolderOpen size={16} aria-hidden="true" /> Carpeta de entrega
          </EnlaceExterno>
        )}
        {t.estado === "hecha" && (
          <Boton
            variante="secundario"
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
          <Boton
            variante="primario"
            tamano="sm"
            onClick={() => (esPorCorregir ? onConfirmarReentrega(t) : onAbrirModal(t))}
          >
            <Check size={14} strokeWidth={1.75} style={{ marginRight: 4 }} />
            {esPorCorregir ? "Volver a entregar" : "Entregar"}
          </Boton>
        )}
      </div>
    </article>
  );
}
