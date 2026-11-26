"use client";

import { Selector, opcionesSelector } from "@/components/ui/Selector";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Check,
  FileText,
  FolderOpen,
  MessageCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { api, type ApiError } from "@/lib/api";
import estilosTarea from "@/app/(app)/tareas/tareas.module.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FilaTrabajo } from "@/components/FilaTrabajo";
import flujo from "@/components/FlujoTrabajo.module.css";
import {
  Perfil,
  ReferenciaDriveTrabajo,
  Tarea,
} from "@/lib/types";
import { type DialogoPicker } from "@/lib/google-picker";
import { abrirSelectorGoogleDrive } from "@/components/PickerDriveCliente";
import { EditorAdjuntos } from "@/components/AdjuntosAsignacion";
import { subirAdjunto, type AdjuntoLocal } from "@/lib/adjuntos-asignacion";
import { Boton } from "@/components/ui/Boton";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { Campo } from "@/components/ui/Campo";
import { EnlaceDrive } from "@/components/ui/EnlaceDrive";
import { CarpetaDriveTarea } from "@/components/ui/CarpetaDriveTarea";
import { CabeceraPagina } from "@/components/ui/CabeceraPagina";
import { useAviso } from "@/components/ui/Aviso";
import styles from "@/app/(app)/admin/admin.module.css";

const MAX_DRIVE_RECHAZO = 5;

export interface AdminTareasProps {
  embedded?: boolean;
}

export function AdminTareas({ embedded = false }: AdminTareasProps) {
  const router = useRouter();
  const [cargando, setCargando] = useState(true);
  const { mostrarAviso } = useAviso();

  const [miembros, setMiembros] = useState<Perfil[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);

  // Filtros
  const [filtroPersona, setFiltroPersona] = useState<string>("");
  const [filtroEstado, setFiltroEstado] = useState<string>("");

  // Modal Aceptar Tarea con corrección opcional de minutos
  const [modalAceptarTarea, setModalAceptarTarea] = useState<Tarea | null>(null);
  const [minutosAceptarInput, setMinutosAceptarInput] = useState<string>("");
  const [aceptandoTarea, setAceptandoTarea] = useState(false);

  // Modal Rechazar Tarea (texto + audio/imagen/video + Google Drive)
  const [tareaARechazar, setTareaARechazar] = useState<Tarea | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazoLocales, setRechazoLocales] = useState<AdjuntoLocal[]>([]);
  const [rechazoDrive, setRechazoDrive] = useState<ReferenciaDriveTrabajo[]>([]);
  const [grabandoRechazo, setGrabandoRechazo] = useState(false);
  const [abriendoPickerRechazo, setAbriendoPickerRechazo] = useState(false);
  const [errorPickerRechazo, setErrorPickerRechazo] = useState("");
  const [errorRechazo, setErrorRechazo] = useState("");
  const [rechazoGuardadoId, setRechazoGuardadoId] = useState<number | null>(null);
  const [rechazando, setRechazando] = useState(false);

  const pickerDialogo = useRef<DialogoPicker | null>(null);
  const pickerVigente = useRef(true);

  useEffect(() => {
    pickerVigente.current = true;
    return () => {
      pickerVigente.current = false;
      try {
        pickerDialogo.current?.setVisible(false);
        pickerDialogo.current?.dispose?.();
      } catch {
        // Ignorar limpieza de diálogo cerrado
      }
      pickerDialogo.current = null;
    };
  }, []);

  const cargarDatos = useCallback(async () => {
    try {
      const [m, tRes] = await Promise.all([
        api.adminGetMiembros(),
        api.adminGetTareas(),
      ]);
      setMiembros(Array.isArray(m) ? m : []);
      setTareas(tRes?.tareas || []);
    } catch {
      mostrarAviso({
        tipo: "error",
        titulo: "No se pudieron cargar las tareas",
      });
    } finally {
      setCargando(false);
    }
  }, [mostrarAviso]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarDatos();
  }, [cargarDatos]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("nueva") === "1") router.replace(`/trabajos/nuevo?desde=tareas&persona=${encodeURIComponent(sp.get("persona") ?? "")}`);
  }, [router]);

  const [destino, setDestino] = useState("");
  useEffect(() => {
    const sincronizar = () => setDestino(new URLSearchParams(window.location.search).get("tarea") ?? "");
    sincronizar();
    window.addEventListener("hashchange", sincronizar);
    return () => window.removeEventListener("hashchange", sincronizar);
  }, []);
  useEffect(() => {
    if (!cargando && destino) document.getElementById(`tarea-${destino}`)?.scrollIntoView({ block: "nearest" });
  }, [cargando, destino]);

  const handleAbrirAceptarTarea = (t: Tarea) => {
    setModalAceptarTarea(t);
    setMinutosAceptarInput(t.cantidad ? String(t.cantidad) : "");
  };

  const handleConfirmarAceptar = async () => {
    if (!modalAceptarTarea) return;
    const esMinuto = modalAceptarTarea.tipo?.unidad === "minuto";
    let cantAceptada: number | undefined = undefined;

    if (esMinuto) {
      const num = parseInt(minutosAceptarInput, 10);
      if (isNaN(num) || num < 1 || num > 1440) {
        mostrarAviso({
          tipo: "error",
          titulo: "Minutos requeridos",
          texto: "Ingresa entre 1 y 1440 minutos.",
        });
        return;
      }
      cantAceptada = num;
    }

    setAceptandoTarea(true);
    try {
      await api.adminAceptarTarea(modalAceptarTarea.id, cantAceptada);
      mostrarAviso({ tipo: "exito", titulo: "Tarea aceptada", texto: "Se añadió a la factura abierta." });
      setModalAceptarTarea(null);
      setMinutosAceptarInput("");
      await cargarDatos();
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({ tipo: "error", titulo: "Error al aceptar", texto: e.message || "No se pudo aceptar la tarea." });
    } finally {
      setAceptandoTarea(false);
    }
  };

  const abrirModalRechazar = (t: Tarea) => {
    setTareaARechazar(t);
    setMotivoRechazo("");
    setRechazoLocales([]);
    setRechazoDrive([]);
    setGrabandoRechazo(false);
    setAbriendoPickerRechazo(false);
    setErrorPickerRechazo("");
    setErrorRechazo("");
    setRechazoGuardadoId(null);
  };

  const cerrarModalRechazar = () => {
    if (rechazando || grabandoRechazo || abriendoPickerRechazo) return;
    const recargar = rechazoGuardadoId !== null;
    setTareaARechazar(null);
    setMotivoRechazo("");
    setRechazoLocales([]);
    setRechazoDrive([]);
    setErrorPickerRechazo("");
    setErrorRechazo("");
    setRechazoGuardadoId(null);
    if (recargar) void cargarDatos();
  };

  const handleElegirDriveRechazo = async () => {
    if (!tareaARechazar || abriendoPickerRechazo || rechazando || rechazoDrive.length >= MAX_DRIVE_RECHAZO) return;
    setErrorPickerRechazo("");
    setAbriendoPickerRechazo(true);
    try {
      await abrirSelectorGoogleDrive({
        clienteId: tareaARechazar.cliente_id ?? undefined,
        multiselect: true,
        maxItems: Math.max(1, MAX_DRIVE_RECHAZO - rechazoDrive.length),
        dialogoRef: pickerDialogo,
        vigenteRef: pickerVigente,
        onAbrir: () => {
          if (pickerVigente.current) setAbriendoPickerRechazo(false);
        },
        onCancelar: () => {
          if (pickerVigente.current) setAbriendoPickerRechazo(false);
        },
        onSeleccion: (elementos) => {
          if (!pickerVigente.current) return;
          setAbriendoPickerRechazo(false);
          setRechazoDrive((prev) => {
            const ids = new Set(prev.map((x) => x.id));
            const nuevos: ReferenciaDriveTrabajo[] = [];
            for (const el of elementos) {
              if (ids.has(el.id)) continue;
              ids.add(el.id);
              nuevos.push({ id: el.id, nombre: el.nombre, url: el.url, tipo: el.tipo });
            }
            return [...prev, ...nuevos].slice(0, MAX_DRIVE_RECHAZO);
          });
        },
      });
    } catch (err) {
      if (!pickerVigente.current) return;
      setAbriendoPickerRechazo(false);
      const apiErr = err as ApiError;
      if (apiErr.codigo === "drive_no_conectado") {
        setErrorPickerRechazo("Conecta el Drive del equipo en Gestión → Equipo.");
      } else if (apiErr.codigo === "drive_sin_organizar") {
        setErrorPickerRechazo("Organiza el Drive del equipo en Gestión → Equipo.");
      } else {
        setErrorPickerRechazo(err instanceof Error ? err.message : "No pudimos abrir Google Drive.");
      }
    }
  };

  const handleConfirmarRechazar = async () => {
    if (!tareaARechazar || rechazando || grabandoRechazo || abriendoPickerRechazo) return;
    if (!rechazoGuardadoId && !motivoRechazo.trim()) {
      mostrarAviso({ tipo: "error", titulo: "Motivo obligatorio" });
      return;
    }

    setRechazando(true);
    setErrorRechazo("");
    try {
      let historialId = rechazoGuardadoId;
      if (!historialId) {
        const rechazada = await api.adminRechazarTarea(
          tareaARechazar.id,
          motivoRechazo.trim(),
          rechazoDrive,
        );
        historialId = rechazada.rechazo_actual?.historial_id ?? null;
      }

      if (rechazoLocales.length > 0 && historialId) {
        let fallos = 0;
        for (const archivo of rechazoLocales) {
          const ajustar = (campos: Partial<AdjuntoLocal>) =>
            setRechazoLocales((prev) =>
              prev.map((x) => (x.id === archivo.id ? { ...x, ...campos } : x)),
            );
          ajustar({ avance: 0, error: undefined });
          try {
            await subirAdjunto(
              tareaARechazar.id,
              archivo,
              (avance) => ajustar({ avance }),
              { origen: "rechazo", historialId },
            );
            setRechazoLocales((prev) => prev.filter((x) => x.id !== archivo.id));
          } catch (e) {
            fallos++;
            ajustar({ error: e instanceof Error ? e.message : "No se pudo subir este archivo." });
          }
        }
        if (fallos > 0) {
          setRechazoGuardadoId(historialId);
          setErrorRechazo("El rechazo quedó guardado. Reintenta subir los archivos pendientes o quítalos.");
          return;
        }
      }

      mostrarAviso({ tipo: "info", titulo: "Tarea rechazada" });
      setTareaARechazar(null);
      setMotivoRechazo("");
      setRechazoLocales([]);
      setRechazoDrive([]);
      setRechazoGuardadoId(null);
      await cargarDatos();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorRechazo(e.message || "No se pudo rechazar la tarea.");
      mostrarAviso({ tipo: "error", titulo: "Error al rechazar", texto: e.message || "No se pudo rechazar la tarea." });
    } finally {
      setRechazando(false);
    }
  };

  const tareasPorRevisar = tareas.filter((t) => t.estado === "hecha");
  const tareasFiltradas = tareas.filter((t) => {
    if (filtroPersona && t.asignado_a !== filtroPersona) return false;
    if (filtroEstado && t.estado !== filtroEstado) return false;
    return true;
  });

  const miembrosAprobados = miembros.filter((m) => m.estado === "aprobado" && !m.es_admin);
  return (
    <div className={embedded ? "" : styles.container}>
      {!embedded && (
        <CabeceraPagina
          titulo="Gestión de tareas"
          acciones={
            <Boton
              variante="primario"
              onClick={() => router.push("/trabajos/nuevo?desde=tareas")}
            >
              <Plus size={15} style={{ marginRight: 6 }} />
              Asignar trabajo
            </Boton>
          }
        />
      )}

      {embedded && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--rc-esp-16)" }}>
          <Boton
            variante="primario"
            onClick={() => router.push("/trabajos/nuevo?desde=admin")}
          >
            <Plus size={15} style={{ marginRight: 6 }} />
            Asignar trabajo
          </Boton>
        </div>
      )}

      {cargando ? (
        <div style={{ maxWidth: 840, margin: "2rem auto", width: "100%" }}>
          <Esqueleto filas={5} />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--rc-esp-20)" }}>
          {/* 1. Bandeja Por Revisar */}
          <section className={styles.section}>
            <div className={styles.sectionHeaderRow}>
              <h2 className={styles.sectionTitle} style={{ color: "var(--rc-azul-texto)" }}>
                Bandeja por revisar ({tareasPorRevisar.length})
              </h2>
            </div>

            {tareasPorRevisar.length === 0 ? (
              <Tarjeta
                variante="vacia"
                tituloVacio="Todo revisado"
              />
            ) : (
              <div className={styles.bandejaReviewGrid}>
                {tareasPorRevisar.map((t) => (
                  <article key={t.id} id={`tarea-${t.id}`} className={`${styles.reviewCard} ${destino === String(t.id) ? estilosTarea.tareaResaltada : ""}`}>
                    <div className={styles.reviewHeader}>
                      <span className={styles.reviewPersona}>
                        {t.asignado?.nombre || "Miembro"}
                      </span>
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <Chip punto="azul">
                          {t.tipo?.rol?.nombre || t.tipo?.nombre || "Trabajo"}
                        </Chip>
                        {t.cliente && (
                          <Chip punto="verde">
                            {t.cliente.nombre}
                          </Chip>
                        )}
                      </div>
                    </div>

                    <div className={styles.reviewTitulo}>{t.titulo}</div>
                    {t.descripcion && t.descripcion !== t.titulo && (
                      <div style={{ fontSize: 12, color: "var(--rc-texto-secundario)", whiteSpace: "pre-wrap" }}>
                        {t.descripcion}
                      </div>
                    )}

                    {t.tipo?.unidad === "minuto" && (
                      <div style={{ fontSize: 12, color: "var(--rc-azul-texto)", fontWeight: 600 }}>
                        Minutos grabados reportados: {t.cantidad || 0} min
                      </div>
                    )}

                    {t.nota_persona && (
                      <div className={styles.reviewNota}>
                        <strong>Nota de la persona:</strong> {t.nota_persona}
                      </div>
                    )}

                    {t.metodo_entrega === "whatsapp" ? (
                      <div className={styles.entregaDriveBloque}>
                        <span className={styles.entregaWhatsappChip}>
                          <MessageCircle size={14} aria-hidden="true" />
                          Entregado por WhatsApp
                        </span>
                      </div>
                    ) : t.enlace_medios ? (
                      <div className={styles.entregaDriveBloque}>
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
                      </div>
                    ) : null}

                    <div style={{ marginTop: "var(--rc-esp-6)" }}>
                      <CarpetaDriveTarea tarea={t} />
                    </div>

                    <div className={styles.reviewValor}>
                      <span>Valor estimado a congelar:</span>
                      <span className={styles.reviewValorMonto}>
                        {t.tipo?.unidad === "minuto" && t.cantidad && t.tipo?.precio
                          ? `$ ${(t.cantidad * t.tipo.precio).toLocaleString("es-CO")} (${t.cantidad} min × $ ${t.tipo.precio.toLocaleString("es-CO")})`
                          : `$ ${(t.tipo?.precio || 0).toLocaleString("es-CO")}`}
                      </span>
                    </div>

                    <div className={styles.reviewAcciones}>
                      <Link className="rc-btn rc-btn--fantasma rc-btn--sm" href={`/trabajos/${t.id}?desde=tareas`}>Abrir</Link>
                      <Boton
                        variante="peligro"
                        onClick={() => abrirModalRechazar(t)}
                      >
                        Rechazar
                      </Boton>
                      <Boton
                        variante="primario"
                        onClick={() => handleAbrirAceptarTarea(t)}
                      >
                        <Check size={14} style={{ marginRight: 4 }} />
                        {t.tipo?.unidad === "minuto" ? "Revisar y aceptar" : "Aceptar"}
                      </Boton>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* 2. Listado general de tareas con filtros */}
          <section className={styles.section}>
            <div className={styles.sectionHeaderRow}>
              <h2 className={styles.sectionTitle}>Todas las tareas ({tareasFiltradas.length})</h2>

              {/* Filtros */}
              <div className={flujo.filtrosTrabajo}>
                <Selector etiqueta="Filtrar por persona" valor={filtroPersona} onCambio={seleccion => setFiltroPersona(seleccion)}  opciones={opcionesSelector(<><option value="">Cualquier persona</option>
                  {miembrosAprobados.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}</>)} />

                <Selector etiqueta="Filtrar por estado" valor={filtroEstado} onCambio={seleccion => setFiltroEstado(seleccion)}  opciones={opcionesSelector(<><option value="">Todo estado</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="hecha">Por revisar (hecha)</option>
                  <option value="aceptada">Aceptada</option>
                  <option value="rechazada">Rechazada</option>
                  <option value="cancelada">Cancelada</option></>)} />
              </div>
            </div>

            {tareasFiltradas.length === 0 ? (
              <Tarjeta
                variante="vacia"
                tituloVacio="Sin tareas con estos filtros"
                textoVacio="Intenta ajustando los filtros de persona o estado."
              />
            ) : (
              <ul className={flujo.listaTrabajos}>
                {tareasFiltradas.map(t => <FilaTrabajo key={t.id} tarea={t} origen={embedded ? "admin" : "tareas"}
                  id={t.estado === "hecha" ? undefined : `tarea-${t.id}`} resaltado={destino === String(t.id)} />)}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ACEPTAR TAREA (con ajuste de minutos si aplica)    */}
      {/* ========================================================= */}
      {modalAceptarTarea && (
        <Modal
          abierto={true}
          titulo="Aceptar tarea y congelar valor"
          descripcion={`Se congelará el precio y se añadirá a la factura abierta de ${modalAceptarTarea.asignado?.nombre || "la persona"}.`}
          onCerrar={() => setModalAceptarTarea(null)}
          accionPrimaria={
            <Boton
              variante="primario"
              cargando={aceptandoTarea}
              onClick={handleConfirmarAceptar}
            >
              Confirmar y congelar
            </Boton>
          }
          accionSecundaria={
            <Boton
              variante="secundario"
              onClick={() => setModalAceptarTarea(null)}
              disabled={aceptandoTarea}
            >
              Cancelar
            </Boton>
          }
        >
          <div className={styles.modalForm}>
            <div style={{ fontSize: 13, color: "var(--rc-texto)" }}>
              <strong>Tarea:</strong> {modalAceptarTarea.titulo}
            </div>
            <div style={{ fontSize: 13, color: "var(--rc-texto)" }}>
              <strong>Trabajador:</strong> {modalAceptarTarea.asignado?.nombre || "—"}
            </div>
            {modalAceptarTarea.nota_persona && (
              <div className={styles.reviewNota}>
                <strong>Nota de la persona:</strong> {modalAceptarTarea.nota_persona}
              </div>
            )}

            {modalAceptarTarea.tipo?.unidad === "minuto" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--rc-esp-8)" }}>
                <Campo
                  etiqueta="Minutos grabados aceptados *"
                  type="number"
                  min={1}
                  max={1440}
                  value={minutosAceptarInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setMinutosAceptarInput(e.target.value)}
                />
                <div style={{ fontSize: 11, color: "var(--rc-texto-secundario)" }}>
                  La persona reportó {modalAceptarTarea.cantidad || 0} min. Puedes corregir los minutos antes de congelar.
                </div>
                {Boolean(parseInt(minutosAceptarInput, 10)) && (
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--rc-verde-texto)" }}>
                    Total a congelar: $ {((parseInt(minutosAceptarInput, 10) || 0) * (modalAceptarTarea.tipo?.precio || 0)).toLocaleString("es-CO")}
                    <span style={{ fontSize: 11, fontWeight: "normal", color: "var(--rc-texto-secundario)", marginLeft: 6 }}>
                      ({parseInt(minutosAceptarInput, 10)} min × $ {(modalAceptarTarea.tipo?.precio || 0).toLocaleString("es-CO")})
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--rc-verde-texto)" }}>
                Total a congelar: $ {(modalAceptarTarea.tipo?.precio || 0).toLocaleString("es-CO")}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ========================================================= */}
      {/* MODAL: RECHAZAR TAREA (texto + medios + Google Drive)     */}
      {/* ========================================================= */}
      {tareaARechazar && (
        <Modal
          abierto={true}
          titulo="Rechazar tarea"
          descripcion={`La persona verá el motivo y podrá corregir «${tareaARechazar.titulo}».`}
          onCerrar={cerrarModalRechazar}
          accionPrimaria={
            <Boton
              variante="peligro"
              cargando={rechazando}
              disabled={grabandoRechazo || abriendoPickerRechazo}
              onClick={handleConfirmarRechazar}
            >
              {rechazoGuardadoId ? "Reintentar subida" : "Rechazar tarea"}
            </Boton>
          }
          accionSecundaria={
            <Boton
              variante="secundario"
              onClick={cerrarModalRechazar}
              disabled={rechazando || grabandoRechazo || abriendoPickerRechazo}
            >
              {rechazoGuardadoId ? "Cerrar" : "Cancelar"}
            </Boton>
          }
        >
          <div className={styles.modalForm}>
            <div>
              <Campo
                etiqueta="Motivo del rechazo *"
                como="textarea"
                filas={3}
                placeholder="Ej. El audio tiene ruido de viento o falta el corte final..."
                value={motivoRechazo}
                disabled={rechazando || rechazoGuardadoId !== null}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setMotivoRechazo(e.target.value.slice(0, 500))}
              />
              <div style={{ fontSize: 11, color: "var(--rc-texto-secundario)", textAlign: "right", marginTop: 4 }}>
                {motivoRechazo.length} / 500
              </div>
            </div>

            <div className={styles.rechazoAdjuntosBloque}>
              <EditorAdjuntos
                locales={rechazoLocales}
                cambiar={setRechazoLocales}
                quitar={(a) => setRechazoLocales((prev) => prev.filter((x) => x.id !== a.id))}
                cantidad={rechazoLocales.length}
                bloqueado={rechazando}
                onGrabando={setGrabandoRechazo}
                permitirResumen={false}
                tituloSeccion="Audio, imágenes o video (opcional)"
                compacto={true}
              />
            </div>

            {rechazoGuardadoId === null && (
              <div className={styles.rechazoAdjuntosBloque}>
                <div className={styles.rechazoDriveCabecera}>
                  <h3>Elemento de Drive (opcional)</h3>
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    cargando={abriendoPickerRechazo}
                    disabled={rechazando || grabandoRechazo || rechazoDrive.length >= MAX_DRIVE_RECHAZO}
                    onClick={() => void handleElegirDriveRechazo()}
                  >
                    <FolderOpen size={15} aria-hidden="true" />
                    Elegir de Drive
                  </Boton>
                </div>
                {errorPickerRechazo && (
                  <p className={styles.errorTexto} role="alert">
                    {errorPickerRechazo}
                  </p>
                )}
                {rechazoDrive.length > 0 && (
                  <ul className={styles.rechazoDriveLista} aria-label="Elementos de Drive adjuntos al rechazo">
                    {rechazoDrive.map((d) => (
                      <li key={d.id} className={styles.rechazoDriveItem}>
                        <div className={styles.rechazoDriveInfo}>
                          {d.tipo === "carpeta" ? (
                            <FolderOpen size={15} aria-hidden="true" />
                          ) : (
                            <FileText size={15} aria-hidden="true" />
                          )}
                          <span title={d.nombre}>{d.nombre}</span>
                        </div>
                        <div className={styles.rechazoDriveAcciones}>
                          <EnlaceDrive enlace={d.url} etiqueta="Abrir" />
                          <Boton
                            variante="fantasma"
                            tamano="sm"
                            disabled={rechazando}
                            aria-label={`Quitar ${d.nombre}`}
                            onClick={() => setRechazoDrive((prev) => prev.filter((x) => x.id !== d.id))}
                          >
                            <Trash2 size={14} aria-hidden="true" /> Quitar
                          </Boton>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {errorRechazo && (
              <p className={styles.errorTexto} role="alert">
                {errorRechazo}
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
