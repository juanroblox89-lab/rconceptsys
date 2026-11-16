"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, FolderOpen, Layers, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { Cliente, EtapaPieza, Pieza } from "@/lib/types";
import { useAviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/Boton";
import styles from "./admin-paneles.module.css";

export const ETAPAS: { clave: EtapaPieza; nombre: string }[] = [
  { clave: "guion", nombre: "Guion" },
  { clave: "grabacion", nombre: "Grabación" },
  { clave: "edicion", nombre: "Edición" },
  { clave: "revision", nombre: "Revisión" },
  { clave: "aprobada", nombre: "Aprobada" },
  { clave: "publicada", nombre: "Publicada" },
];

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "";
  const fecha = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return fecha.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

// Gestión → Piezas: cada pieza agrupa sus tareas y avanza por etapas.
export function AdminPiezas() {
  const { mostrarAviso } = useAviso();
  const [piezas, setPiezas] = useState<Pieza[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);

  const [nuevaNombre, setNuevaNombre] = useState("");
  const [nuevaCliente, setNuevaCliente] = useState("");
  const [nuevaFormato, setNuevaFormato] = useState("Reel");
  const [creando, setCreando] = useState(false);
  const [formAbierto, setFormAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [listaPiezas, listaClientes] = await Promise.all([api.adminGetPiezas(), api.adminGetClientes()]);
      setPiezas(Array.isArray(listaPiezas) ? listaPiezas : []);
      setClientes(Array.isArray(listaClientes) ? listaClientes : []);
    } catch {
      mostrarAviso({ tipo: "error", titulo: "No se pudieron cargar las piezas", texto: "Inténtalo de nuevo." });
    } finally {
      setCargando(false);
    }
  }, [mostrarAviso]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  const crear = async () => {
    setCreando(true);
    try {
      await api.adminPostPieza({
        nombre: nuevaNombre,
        cliente_id: nuevaCliente ? Number(nuevaCliente) : null,
        formato: nuevaFormato,
      });
      setNuevaNombre("");
      setNuevaCliente("");
      setNuevaFormato("Reel");
      setFormAbierto(false);
      await cargar();
      mostrarAviso({ tipo: "exito", titulo: "Pieza creada", texto: "Nace en la etapa Guion." });
    } catch (err) {
      mostrarAviso({
        tipo: "error",
        titulo: "No se pudo crear",
        texto: err instanceof Error ? err.message : "Revisa el nombre.",
      });
    } finally {
      setCreando(false);
    }
  };

  const mover = async (pieza: Pieza, etapa: EtapaPieza) => {
    try {
      const actualizada = await api.adminPatchPieza(pieza.id, { etapa });
      setPiezas((prev) => prev.map((p) => (p.id === pieza.id ? actualizada : p)));
    } catch {
      mostrarAviso({ tipo: "error", titulo: "No se pudo mover", texto: "Inténtalo de nuevo." });
    }
  };

  const porEtapa = useMemo(() => {
    const mapa = new Map<EtapaPieza, Pieza[]>();
    for (const etapa of ETAPAS) mapa.set(etapa.clave, []);
    for (const pieza of piezas) {
      const lista = mapa.get(pieza.etapa);
      if (lista) lista.push(pieza);
    }
    return mapa;
  }, [piezas]);

  return (
    <div className={styles.panel}>
      <div className={styles.bloqueCabecera}>
        <div>
          <h2 className={styles.bloqueTitulo}>Piezas de contenido</h2>
          <p className={styles.bloqueAyuda}>
            Cada pieza agrupa sus tareas y avanza: Guion → Grabación → Edición → Revisión → Aprobada → Publicada.
          </p>
        </div>
        <Boton variante="primario" onClick={() => setFormAbierto((v) => !v)}>
          <Plus size={14} style={{ marginRight: 6 }} />
          Nueva pieza
        </Boton>
      </div>

      {formAbierto && (
        <section className={styles.bloque}>
          <div className={styles.filaCampos}>
            <label className={styles.campo}>
              <span>Nombre</span>
              <input
                type="text"
                value={nuevaNombre}
                onChange={(e) => setNuevaNombre(e.target.value)}
                placeholder="Reel Día del Padre"
                maxLength={120}
              />
            </label>
            <label className={styles.campo}>
              <span>Cliente</span>
              <select value={nuevaCliente} onChange={(e) => setNuevaCliente(e.target.value)}>
                <option value="">Sin cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.campo}>
              <span>Formato</span>
              <input type="text" value={nuevaFormato} onChange={(e) => setNuevaFormato(e.target.value)} maxLength={40} />
            </label>
          </div>
          <div className={styles.accionesForm}>
            <Boton variante="fantasma" onClick={() => setFormAbierto(false)}>
              Cancelar
            </Boton>
            <Boton variante="primario" onClick={crear} cargando={creando} disabled={creando || nuevaNombre.trim().length < 2}>
              Crear pieza
            </Boton>
          </div>
        </section>
      )}

      {cargando ? (
        <p className={styles.cargando}>Cargando piezas…</p>
      ) : piezas.length === 0 ? (
        <p className={styles.vacio}>
          Todavía no hay piezas. Crea una y cuélgale las tareas desde Nueva tarea.
        </p>
      ) : (
        <div className={styles.tablero}>
          {ETAPAS.map((etapa) => {
            const lista = porEtapa.get(etapa.clave) ?? [];
            return (
              <section key={etapa.clave} className={styles.columna} aria-label={etapa.nombre}>
                <header className={styles.columnaCabecera}>
                  <span className={styles.columnaNombre}>{etapa.nombre}</span>
                  <span className={styles.columnaCuenta}>{lista.length}</span>
                </header>
                <div className={styles.columnaCuerpo}>
                  {lista.length === 0 ? (
                    <p className={styles.columnaVacia}>Sin piezas</p>
                  ) : (
                    lista.map((pieza) => (
                      <article key={pieza.id} className={styles.pieza}>
                        <p className={styles.piezaNombre}>{pieza.nombre}</p>
                        <p className={styles.piezaMeta}>
                          {pieza.cliente?.nombre ?? "Sin cliente"} · {pieza.formato}
                        </p>
                        {pieza.fecha_publicacion ? (
                          <p className={styles.piezaMeta}>Sale {fmtFecha(pieza.fecha_publicacion)}</p>
                        ) : null}
                        {pieza.drive_carpeta_url ? (
                          <a
                            href={pieza.drive_carpeta_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.piezaDrive}
                          >
                            <FolderOpen size={12} strokeWidth={1.75} aria-hidden="true" />
                            Carpeta de Drive
                          </a>
                        ) : null}
                        <ul className={styles.piezaTareas}>
                          {(pieza.tareas ?? []).length === 0 ? (
                            <li className={styles.piezaSinTareas}>Sin tareas todavía</li>
                          ) : (
                            (pieza.tareas ?? []).map((tarea) => (
                              <li key={tarea.id} className={styles.piezaTarea}>
                                <Layers size={11} strokeWidth={2} aria-hidden="true" />
                                <span>{tarea.titulo}</span>
                                <em className={styles.piezaTareaEstado}>{tarea.estado}</em>
                              </li>
                            ))
                          )}
                        </ul>
                        <label className={styles.piezaMover}>
                          <span>Etapa</span>
                          <select
                            value={pieza.etapa}
                            onChange={(e) => mover(pieza, e.target.value as EtapaPieza)}
                            aria-label={`Cambiar etapa de ${pieza.nombre}`}
                          >
                            {ETAPAS.map((e) => (
                              <option key={e.clave} value={e.clave}>
                                {e.nombre}
                              </option>
                            ))}
                          </select>
                          <ChevronRight size={12} strokeWidth={2} aria-hidden="true" />
                        </label>
                      </article>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
