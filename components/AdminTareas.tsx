"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Check,
  Plus,
  Calendar,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  Perfil,
  TipoTrabajo,
  Tarea,
} from "@/lib/types";
import { Tabla, TablaFila } from "@/components/ui/Tabla";
import { Boton } from "@/components/ui/Boton";
import { Estado } from "@/components/ui/Estado";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { Campo } from "@/components/ui/Campo";
import { useAviso } from "@/components/ui/Aviso";
import styles from "@/app/(app)/admin/admin.module.css";

export interface AdminTareasProps {
  embedded?: boolean;
}

export function AdminTareas({ embedded = false }: AdminTareasProps) {
  const [cargando, setCargando] = useState(true);
  const { mostrarAviso } = useAviso();

  const [miembros, setMiembros] = useState<Perfil[]>([]);
  const [trabajos, setTrabajos] = useState<TipoTrabajo[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);

  // Filtros
  const [filtroPersona, setFiltroPersona] = useState<string>("");
  const [filtroEstado, setFiltroEstado] = useState<string>("");

  // Modal Nueva Tarea (solo aviso y persona)
  const [modalNuevaTarea, setModalNuevaTarea] = useState(false);
  const [nuevaTareaAsignadoA, setNuevaTareaAsignadoA] = useState<string>("");
  const [aviso, setAviso] = useState("");
  const [creandoTarea, setCreandoTarea] = useState(false);

  // Modal Aceptar Tarea con corrección opcional de minutos
  const [modalAceptarTarea, setModalAceptarTarea] = useState<Tarea | null>(null);
  const [minutosAceptarInput, setMinutosAceptarInput] = useState<string>("");
  const [aceptandoTarea, setAceptandoTarea] = useState(false);

  // Modal Rechazar Tarea
  const [tareaARechazar, setTareaARechazar] = useState<Tarea | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazando, setRechazando] = useState(false);

  const cargarDatos = useCallback(async () => {
    try {
      const [m, tr, tRes] = await Promise.all([
        api.adminGetMiembros(),
        api.adminGetTrabajos(),
        api.adminGetTareas(),
      ]);
      setMiembros(Array.isArray(m) ? m : []);
      setTrabajos(Array.isArray(tr) ? tr : []);
      setTareas(tRes?.tareas || []);
    } catch {
      mostrarAviso({
        tipo: "error",
        titulo: "Error al cargar tareas",
        texto: "No se pudieron obtener las tareas del equipo.",
      });
    } finally {
      setCargando(false);
    }
  }, [mostrarAviso]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarDatos();
  }, [cargarDatos]);

  // Leer parámetros de URL al montar (?nueva=1&persona=<id>)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("nueva") === "1") {
        const pers = sp.get("persona");
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (pers) setNuevaTareaAsignadoA(pers);
        setModalNuevaTarea(true);
      }
    }
  }, []);

  const formatearFechaHora = (iso?: string | null) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("es-CO", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  const handleCrearTareaSubmit = async () => {
    if (!nuevaTareaAsignadoA) {
      mostrarAviso({ tipo: "error", titulo: "Persona requerida", texto: "Selecciona a quién asignar la tarea." });
      return;
    }

    const textoAviso = aviso.trim();
    if (!textoAviso) {
      mostrarAviso({ tipo: "error", titulo: "Aviso requerido", texto: "Escribe el aviso de la tarea." });
      return;
    }

    setCreandoTarea(true);
    try {
      const tipoDefaultId = trabajos[0]?.id || 1;
      const titulo = textoAviso.length > 100 ? `${textoAviso.slice(0, 97)}...` : textoAviso;

      await api.adminPostTarea({
        tipo_id: tipoDefaultId,
        asignado_a: nuevaTareaAsignadoA,
        titulo,
        descripcion: textoAviso,
        forzar: true,
      });

      mostrarAviso({ tipo: "exito", titulo: "Tarea creada y enviada" });
      setModalNuevaTarea(false);
      setAviso("");
      setNuevaTareaAsignadoA("");
      await cargarDatos();
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({ tipo: "error", titulo: "No se pudo crear la tarea", texto: e.message || "Error al crear tarea." });
    } finally {
      setCreandoTarea(false);
    }
  };

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
          texto: "Debes ingresar los minutos aceptados (entero entre 1 y 1440).",
        });
        return;
      }
      cantAceptada = num;
    }

    setAceptandoTarea(true);
    try {
      await api.adminAceptarTarea(modalAceptarTarea.id, cantAceptada);
      mostrarAviso({ tipo: "exito", titulo: "Tarea aceptada", texto: "La tarea se ingresó a la factura abierta de la persona." });
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

  const handleConfirmarRechazar = async () => {
    if (!tareaARechazar) return;
    if (!motivoRechazo.trim()) {
      mostrarAviso({ tipo: "error", titulo: "Motivo obligatorio", texto: "Debes explicar el motivo del rechazo." });
      return;
    }
    setRechazando(true);
    try {
      await api.adminRechazarTarea(tareaARechazar.id, motivoRechazo.trim());
      mostrarAviso({ tipo: "info", titulo: "Tarea rechazada", texto: "Se notificó a la persona con el motivo." });
      setTareaARechazar(null);
      setMotivoRechazo("");
      await cargarDatos();
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({ tipo: "error", titulo: "Error al rechazar", texto: e.message || "No se pudo rechazar la tarea." });
    } finally {
      setRechazando(false);
    }
  };

  const handleCancelarTarea = async (tarea: Tarea) => {
    try {
      await api.adminCancelarTarea(tarea.id);
      mostrarAviso({ tipo: "info", titulo: "Tarea cancelada" });
      await cargarDatos();
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({ tipo: "error", titulo: "No se pudo cancelar", texto: e.message || "Error al cancelar." });
    }
  };

  const tareasPorRevisar = tareas.filter((t) => t.estado === "hecha");
  const tareasFiltradas = tareas.filter((t) => {
    if (filtroPersona && t.asignado_a !== filtroPersona) return false;
    if (filtroEstado && t.estado !== filtroEstado) return false;
    return true;
  });

  const miembrosAprobados = miembros.filter((m) => m.estado === "aprobado" && !m.es_admin);
  const personaSeleccionada = miembrosAprobados.find((m) => m.id === nuevaTareaAsignadoA);

  return (
    <div className={embedded ? "" : styles.container}>
      {!embedded && (
        <div className={styles.header}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <h1 className={styles.title}>Gestión de tareas</h1>
              <p className={styles.subtitle}>
                Asigna tareas al equipo, revisa entregas de trabajo y aprueba valores a facturar
              </p>
            </div>
            <Boton
              variante="primario"
              onClick={() => {
                setModalNuevaTarea(true);
              }}
            >
              <Plus size={15} style={{ marginRight: 6 }} />
              Nueva tarea
            </Boton>
          </div>
        </div>
      )}

      {embedded && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--rc-esp-16)" }}>
          <Boton
            variante="primario"
            onClick={() => {
              setModalNuevaTarea(true);
            }}
          >
            <Plus size={15} style={{ marginRight: 6 }} />
            Nueva tarea
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
                textoVacio="No hay tareas pendientes de aprobación en este momento."
              />
            ) : (
              <div className={styles.bandejaReviewGrid}>
                {tareasPorRevisar.map((t) => (
                  <article key={t.id} className={styles.reviewCard}>
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

                    <div className={styles.reviewValor}>
                      <span>Valor estimado a congelar:</span>
                      <span className={styles.reviewValorMonto}>
                        {t.tipo?.unidad === "minuto" && t.cantidad && t.tipo?.precio
                          ? `$ ${(t.cantidad * t.tipo.precio).toLocaleString("es-CO")} (${t.cantidad} min × $ ${t.tipo.precio.toLocaleString("es-CO")})`
                          : `$ ${(t.tipo?.precio || 0).toLocaleString("es-CO")}`}
                      </span>
                    </div>

                    <div className={styles.reviewAcciones}>
                      <Boton
                        variante="peligro"
                        onClick={() => {
                          setTareaARechazar(t);
                          setMotivoRechazo("");
                        }}
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
              <div className={styles.filtrosRow}>
                <select
                  className={styles.selectCompacto}
                  value={filtroPersona}
                  onChange={(e) => setFiltroPersona(e.target.value)}
                >
                  <option value="">Todas las personas</option>
                  {miembrosAprobados.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>

                <select
                  className={styles.selectCompacto}
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value)}
                >
                  <option value="">Todos los estados</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="hecha">Por revisar (hecha)</option>
                  <option value="aceptada">Aceptada</option>
                  <option value="rechazada">Rechazada</option>
                  <option value="cancelada">Cancelada</option>
                </select>
              </div>
            </div>

            {tareasFiltradas.length === 0 ? (
              <Tarjeta
                variante="vacia"
                tituloVacio="Sin tareas con estos filtros"
                textoVacio="Intenta ajustando los filtros de persona o estado."
              />
            ) : (
              <>
                <div className={styles.desktopTable}>
                  <Tabla>
                    <thead>
                      <tr>
                        <th>Título / Aviso</th>
                        <th>Persona</th>
                        <th>Estado</th>
                        <th>Valor</th>
                        <th style={{ textAlign: "right" }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tareasFiltradas.map((t) => (
                        <TablaFila key={t.id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{t.titulo}</div>
                            {t.fecha_limite && (
                              <div style={{ fontSize: 11, color: "var(--rc-texto-secundario)", display: "flex", alignItems: "center", gap: 4 }}>
                                <Calendar size={11} /> Entrega: {formatearFechaHora(t.fecha_limite)}
                              </div>
                            )}
                          </td>
                          <td>{t.asignado?.nombre || "—"}</td>
                          <td>
                            <Estado
                              variante={
                                t.estado === "aceptada"
                                  ? "aprobado"
                                  : t.estado === "rechazada" || t.estado === "cancelada"
                                  ? "suspendido"
                                  : "pendiente"
                              }
                            >
                              {t.estado === "hecha" ? "por revisar" : t.estado}
                            </Estado>
                          </td>
                          <td>
                            {t.estado === "aceptada" && t.precio_congelado != null ? (
                              <div style={{ display: "flex", flexDirection: "column" }}>
                                <span style={{ fontWeight: 600, color: "var(--rc-verde-texto)" }}>
                                  $ {t.precio_congelado.toLocaleString("es-CO")}
                                </span>
                                {t.tipo?.unidad === "minuto" && t.cantidad_aceptada && (
                                  <span style={{ fontSize: 10, color: "var(--rc-texto-secundario)" }}>
                                    {t.cantidad_aceptada} min × $ {(t.precio_unitario_congelado || 0).toLocaleString("es-CO")}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: "var(--rc-texto-tenue)", fontSize: 11 }}>—</span>
                            )}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {t.estado === "hecha" && (
                              <div style={{ display: "inline-flex", gap: 6 }}>
                                <Boton
                                  variante="peligro"
                                  tamano="sm"
                                  onClick={() => {
                                    setTareaARechazar(t);
                                    setMotivoRechazo("");
                                  }}
                                >
                                  Rechazar
                                </Boton>
                                <Boton
                                  variante="primario"
                                  tamano="sm"
                                  onClick={() => handleAbrirAceptarTarea(t)}
                                >
                                  Aceptar
                                </Boton>
                              </div>
                            )}
                            {t.estado === "pendiente" && (
                              <Boton
                                variante="fantasma"
                                tamano="sm"
                                onClick={() => handleCancelarTarea(t)}
                              >
                                Cancelar
                              </Boton>
                            )}
                            {t.estado !== "hecha" && t.estado !== "pendiente" && (
                              <span style={{ fontSize: 11, color: "var(--rc-texto-secundario)" }}>
                                {formatearFechaHora(t.resuelta_en || t.creada_en)}
                              </span>
                            )}
                          </td>
                        </TablaFila>
                      ))}
                    </tbody>
                  </Tabla>
                </div>

                {/* Móvil: Tarjetas apiladas */}
                <div className={styles.mobileCards}>
                  {tareasFiltradas.map((t) => (
                    <article key={t.id} className={styles.mobileCard}>
                      <div className={styles.mobileCardHeader}>
                        <div>
                          <div className={styles.mobileCardName}>{t.titulo}</div>
                          <div className={styles.mobileCardEmail}>
                            Para: <strong>{t.asignado?.nombre || "—"}</strong>
                          </div>
                        </div>
                        <Estado
                          variante={
                            t.estado === "aceptada"
                              ? "aprobado"
                              : t.estado === "rechazada" || t.estado === "cancelada"
                              ? "suspendido"
                              : "pendiente"
                          }
                        >
                          {t.estado === "hecha" ? "por revisar" : t.estado}
                        </Estado>
                      </div>

                      {t.estado === "aceptada" && t.precio_congelado != null && (
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--rc-verde-texto)" }}>
                          Valor congelado: $ {t.precio_congelado.toLocaleString("es-CO")}
                          {t.tipo?.unidad === "minuto" && t.cantidad_aceptada && (
                            <span style={{ fontSize: 11, fontWeight: "normal", color: "var(--rc-texto-secundario)", marginLeft: 6 }}>
                              ({t.cantidad_aceptada} min × $ {(t.precio_unitario_congelado || 0).toLocaleString("es-CO")})
                            </span>
                          )}
                        </div>
                      )}

                      {t.estado === "hecha" && (
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          <Boton
                            variante="peligro"
                            tamano="sm"
                            onClick={() => {
                              setTareaARechazar(t);
                              setMotivoRechazo("");
                            }}
                          >
                            Rechazar
                          </Boton>
                          <Boton
                            variante="primario"
                            tamano="sm"
                            onClick={() => handleAbrirAceptarTarea(t)}
                          >
                            Aceptar
                          </Boton>
                        </div>
                      )}

                      {t.estado === "pendiente" && (
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <Boton
                            variante="fantasma"
                            tamano="sm"
                            onClick={() => handleCancelarTarea(t)}
                          >
                            Cancelar
                          </Boton>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: NUEVA TAREA (SIMPLIFICADO: SOLO AVISO Y PERSONA)    */}
      {/* ========================================================= */}
      {modalNuevaTarea && (
        <Modal
          abierto={true}
          titulo="Nueva tarea"
          descripcion={personaSeleccionada ? `Asigna un aviso o tarea para ${personaSeleccionada.nombre}.` : "Asigna un aviso o tarea a un miembro del equipo."}
          onCerrar={() => setModalNuevaTarea(false)}
          accionPrimaria={
            <Boton
              variante="primario"
              cargando={creandoTarea}
              onClick={handleCrearTareaSubmit}
            >
              Crear tarea
            </Boton>
          }
          accionSecundaria={
            <Boton
              variante="secundario"
              onClick={() => setModalNuevaTarea(false)}
              disabled={creandoTarea}
            >
              Cancelar
            </Boton>
          }
        >
          <div className={styles.modalForm}>
            <Campo
              como="select"
              etiqueta="Asignar a *"
              value={nuevaTareaAsignadoA}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
                setNuevaTareaAsignadoA(e.target.value);
              }}
            >
              <option value="">Selecciona un miembro del equipo</option>
              {miembrosAprobados.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} ({m.correo})
                </option>
              ))}
            </Campo>

            <Campo
              etiqueta="Aviso *"
              como="textarea"
              filas={4}
              placeholder="Escribe el aviso o detalles de la tarea a realizar..."
              value={aviso}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setAviso(e.target.value)}
            />
          </div>
        </Modal>
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
      {/* MODAL: RECHAZAR TAREA                                     */}
      {/* ========================================================= */}
      {tareaARechazar && (
        <Modal
          abierto={true}
          titulo="Rechazar tarea"
          descripcion={`Indica el motivo por el cual rechazas "${tareaARechazar.titulo}". La persona podrá ver este motivo y corregir la entrega.`}
          onCerrar={() => setTareaARechazar(null)}
          accionPrimaria={
            <Boton
              variante="peligro"
              cargando={rechazando}
              onClick={handleConfirmarRechazar}
            >
              Rechazar tarea
            </Boton>
          }
          accionSecundaria={
            <Boton
              variante="secundario"
              onClick={() => setTareaARechazar(null)}
              disabled={rechazando}
            >
              Cancelar
            </Boton>
          }
        >
          <div className={styles.modalForm}>
            <Campo
              etiqueta="Motivo del rechazo *"
              como="textarea"
              filas={3}
              placeholder="Ej. El audio tiene ruido de viento o falta el corte final..."
              value={motivoRechazo}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setMotivoRechazo(e.target.value.slice(0, 500))}
            />
            <div style={{ fontSize: 11, color: "var(--rc-texto-secundario)", textAlign: "right" }}>
              {motivoRechazo.length} / 500
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
