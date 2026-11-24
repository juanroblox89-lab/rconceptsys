"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Check,
  Plus,
} from "lucide-react";
import { api } from "@/lib/api";
import estilosTarea from "@/app/(app)/tareas/tareas.module.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FilaTrabajo } from "@/components/FilaTrabajo";
import flujo from "@/components/FlujoTrabajo.module.css";
import {
  Perfil,
  Tarea,
} from "@/lib/types";
import { Boton } from "@/components/ui/Boton";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { Campo } from "@/components/ui/Campo";
import { EnlaceDrive } from "@/components/ui/EnlaceDrive";
import { CarpetaDriveTarea } from "@/components/ui/CarpetaDriveTarea";
import { useAviso } from "@/components/ui/Aviso";
import styles from "@/app/(app)/admin/admin.module.css";

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

  // Modal Rechazar Tarea
  const [tareaARechazar, setTareaARechazar] = useState<Tarea | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazando, setRechazando] = useState(false);

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

  const handleConfirmarRechazar = async () => {
    if (!tareaARechazar) return;
    if (!motivoRechazo.trim()) {
      mostrarAviso({ tipo: "error", titulo: "Motivo obligatorio" });
      return;
    }
    setRechazando(true);
    try {
      await api.adminRechazarTarea(tareaARechazar.id, motivoRechazo.trim());
      mostrarAviso({ tipo: "info", titulo: "Tarea rechazada" });
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
        <div className={styles.header}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <h1 className={styles.title}>Gestión de tareas</h1>
            </div>
            <Boton
              variante="primario"
              onClick={() => router.push("/trabajos/nuevo?desde=tareas")}
            >
              <Plus size={15} style={{ marginRight: 6 }} />
              Asignar trabajo
            </Boton>
          </div>
        </div>
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

                    {t.enlace_medios && (
                      <div style={{ marginTop: "var(--rc-esp-8)" }}>
                        <EnlaceDrive enlace={t.enlace_medios} />
                      </div>
                    )}

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
                      <Link className={flujo.enlace} href={`/trabajos/${t.id}?desde=tareas`}>Abrir</Link>
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
              <div className={flujo.filtrosTrabajo}>
                <select
                  aria-label="Filtrar por persona"
                  value={filtroPersona}
                  onChange={(e) => setFiltroPersona(e.target.value)}
                >
                  <option value="">Cualquier persona</option>
                  {miembrosAprobados.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filtrar por estado"
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value)}
                >
                  <option value="">Todo estado</option>
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
      {/* MODAL: RECHAZAR TAREA                                     */}
      {/* ========================================================= */}
      {tareaARechazar && (
        <Modal
          abierto={true}
          titulo="Rechazar tarea"
          descripcion={`La persona verá el motivo y podrá corregir «${tareaARechazar.titulo}».`}
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
