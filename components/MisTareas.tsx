"use client";

import { useEffect, useState, useCallback } from "react";
import { Check, Calendar } from "lucide-react";
import { api } from "@/lib/api";
import { Tarea } from "@/lib/types";
import { Boton } from "@/components/ui/Boton";
import { Chip } from "@/components/ui/Chip";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Modal } from "@/components/ui/Modal";
import { Campo } from "@/components/ui/Campo";
import { useAviso } from "@/components/ui/Aviso";
import styles from "@/app/(app)/tareas/tareas.module.css";

export function MisTareas() {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalTarea, setModalTarea] = useState<Tarea | null>(null);
  const [nota, setNota] = useState("");
  const [minutos, setMinutos] = useState<string>("");
  const [enviando, setEnviando] = useState(false);
  const { mostrarAviso } = useAviso();

  const cargarTareas = useCallback(async () => {
    try {
      const data = await api.getTareas();
      setTareas(Array.isArray(data) ? data : []);
    } catch {
      mostrarAviso({
        tipo: "error",
        titulo: "Error al cargar tareas",
        texto: "No pudimos obtener la lista de tus tareas.",
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
            titulo: "Error al cargar tareas",
            texto: "No pudimos obtener la lista de tus tareas.",
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
    setModalTarea(t);
    setNota(t.nota_persona || "");
    setMinutos(t.cantidad ? String(t.cantidad) : "");
  };

  const cerrarModal = () => {
    setModalTarea(null);
    setNota("");
    setMinutos("");
  };

  const handleMarcarHecha = async () => {
    if (!modalTarea) return;
    const esMinuto = modalTarea.tipo?.unidad === "minuto";
    let cantNum: number | undefined = undefined;

    if (esMinuto) {
      const num = parseInt(minutos, 10);
      if (isNaN(num) || num < 1 || num > 1440) {
        mostrarAviso({
          tipo: "error",
          titulo: "Minutos requeridos",
          texto: "Debes ingresar los minutos grabados (entero entre 1 y 1440).",
        });
        return;
      }
      cantNum = num;
    }

    setEnviando(true);
    try {
      await api.postTareaHecha(modalTarea.id, nota.trim() || undefined, cantNum);
      mostrarAviso({
        tipo: "exito",
        titulo: "Tarea completada",
        texto: "Tu tarea fue enviada a revisión por el administrador.",
      });
      cerrarModal();
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

  const formatearFecha = (fechaStr?: string | null) => {
    if (!fechaStr) return null;
    const partes = fechaStr.split("-");
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return fechaStr;
  };

  const [hoy] = useState(() => Date.now());

  const esFechaVencida = (fechaStr?: string | null) => {
    if (!fechaStr) return false;
    const [y, m, d] = fechaStr.split("-").map(Number);
    const limite = new Date(y, m - 1, d, 23, 59, 59);
    return limite.getTime() < hoy;
  };

  const pendientes = tareas.filter((t) => t.estado === "pendiente");
  const porRevisar = tareas.filter((t) => t.estado === "hecha");
  const rechazadas = tareas.filter((t) => t.estado === "rechazada");
  const aceptadas = tareas.filter((t) => t.estado === "aceptada");

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Mis tareas</h1>
        <p className={styles.subtitle}>
          Gestiona las tareas asignadas según tu rol y marca tu trabajo completado
        </p>
      </div>

      {cargando ? (
        <div style={{ maxWidth: 640, margin: "2rem auto", width: "100%" }}>
          <Esqueleto filas={5} />
        </div>
      ) : tareas.length === 0 ? (
        <Tarjeta
          variante="vacia"
          tituloVacio="Sin tareas asignadas"
          textoVacio="Aún no tienes tareas pendientes o completadas en el sistema."
        />
      ) : (
        <>
          {/* 1. Pendientes */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Pendientes ({pendientes.length})</h2>
            </div>
            {pendientes.length === 0 ? (
              <Tarjeta
                variante="vacia"
                tituloVacio="Todo al día"
                textoVacio="No tienes tareas pendientes por realizar."
              />
            ) : (
              <div className={styles.grid}>
                {pendientes.map((t) => renderTarjeta(t, abrirModalHecha, formatearFecha, esFechaVencida))}
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
                {rechazadas.map((t) => renderTarjeta(t, abrirModalHecha, formatearFecha, esFechaVencida))}
              </div>
            </section>
          )}

          {/* 3. Por revisar */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Por revisar ({porRevisar.length})</h2>
            </div>
            {porRevisar.length === 0 ? (
              <Tarjeta
                variante="vacia"
                tituloVacio="Sin revisiones pendientes"
                textoVacio="No hay tareas esperando aprobación del administrador."
              />
            ) : (
              <div className={styles.grid}>
                {porRevisar.map((t) => renderTarjeta(t, abrirModalHecha, formatearFecha, esFechaVencida))}
              </div>
            )}
          </section>

          {/* 4. Aceptadas */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Aceptadas ({aceptadas.length})</h2>
            </div>
            {aceptadas.length === 0 ? (
              <Tarjeta
                variante="vacia"
                tituloVacio="Sin tareas aceptadas"
                textoVacio="Las tareas aceptadas por el administrador aparecerán aquí con su valor congelado."
              />
            ) : (
              <div className={styles.grid}>
                {aceptadas.map((t) => renderTarjeta(t, abrirModalHecha, formatearFecha, esFechaVencida))}
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
              onClick={handleMarcarHecha}
            >
              Enviar a revisión
            </Boton>
          }
          accionSecundaria={
            <Boton variante="secundario" onClick={cerrarModal} disabled={enviando}>
              Cancelar
            </Boton>
          }
        >
          <div className={styles.modalContent}>
            {modalTarea.tipo?.unidad === "minuto" && (
              <div style={{ marginBottom: "var(--rc-esp-12)" }}>
                <Campo
                  etiqueta="Minutos grabados *"
                  type="number"
                  min={1}
                  max={1440}
                  placeholder="Ej. 120 (entre 1 y 1440)"
                  value={minutos}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setMinutos(e.target.value)}
                  disabled={enviando}
                />
                <div style={{ fontSize: "var(--rc-fs-etiqueta)", color: "var(--rc-texto-secundario)", marginTop: "4px" }}>
                  Este trabajo se cobra por minuto. Ingresa la duración real de grabación (1 a 1440).
                </div>
              </div>
            )}
            <Campo
              etiqueta="Nota opcional (hasta 500 caracteres)"
              como="textarea"
              filas={3}
              placeholder="Ej. Enlace de Drive, detalles de la entrega o anotaciones..."
              value={nota}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setNota(e.target.value.slice(0, 500))}
              disabled={enviando}
            />
            <div className={styles.charCounter}>{nota.length} / 500</div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function renderTarjeta(
  t: Tarea,
  onAbrirModal: (t: Tarea) => void,
  formatearFecha: (f?: string | null) => string | null,
  esFechaVencida: (f?: string | null) => boolean
) {
  const vencida = t.estado === "pendiente" && esFechaVencida(t.fecha_limite);
  const chipRol = t.tipo?.rol?.nombre || t.tipo?.nombre || "Trabajo";

  return (
    <article key={t.id} className={styles.tareaCard}>
      <div className={styles.tareaCardTop}>
        <h3 className={styles.tareaTitulo}>{t.titulo}</h3>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Chip punto="azul">{chipRol}</Chip>
          {t.cliente && <Chip punto="verde">{t.cliente.nombre}</Chip>}
        </div>
      </div>

      {t.descripcion && <p className={styles.tareaDescripcion}>{t.descripcion}</p>}

      <div className={styles.tareaMeta}>
        {t.fecha_limite && (
          <span className={`${styles.fechaLimite} ${vencida ? styles.fechaVencida : ""}`}>
            <Calendar size={13} strokeWidth={1.75} />
            {vencida ? "Venció:" : "Entrega:"} {formatearFecha(t.fecha_limite)}
          </span>
        )}

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
          <div className={styles.motivoRechazoTitulo}>Motivo del rechazo:</div>
          <div>{t.motivo_rechazo}</div>
        </div>
      )}

      {t.nota_persona && t.estado !== "pendiente" && (
        <div className={styles.notaPersonaBox}>
          <strong>Tu nota:</strong> {t.nota_persona}
        </div>
      )}

      {(t.estado === "pendiente" || t.estado === "rechazada") && (
        <div className={styles.tareaFooter}>
          <Boton
            variante="primario"
            tamano="sm"
            onClick={() => onAbrirModal(t)}
          >
            <Check size={14} strokeWidth={1.75} style={{ marginRight: 4 }} />
            {t.estado === "rechazada" ? "Reenviar como hecha" : "Marcar como hecha"}
          </Boton>
        </div>
      )}
    </article>
  );
}
