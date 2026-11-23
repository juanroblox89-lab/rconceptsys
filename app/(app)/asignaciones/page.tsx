"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, CircleAlert, Filter, Plus } from "lucide-react";
import { Boton } from "@/components/ui/Boton";
import { FormularioAsignacion } from "@/components/FormularioAsignacion";
import { api } from "@/lib/api";
import { AsignacionResumen, EstadoTarea, Perfil } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { Esqueleto } from "@/components/ui/Esqueleto";
import styles from "./asignaciones.module.css";

const ETIQUETAS_ESTADO: Record<EstadoTarea, string> = {
  pendiente: "Pendiente",
  hecha: "Entregada",
  aceptada: "Aprobada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
};

function hoyISO(): string {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
}

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "Sin fecha";
  const fecha = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(fecha.getTime())) return "Sin fecha";
  return fecha.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

function estaVencida(asignacion: AsignacionResumen): boolean {
  const t = asignacion.tarea;
  if (!t.fecha_limite) return false;
  if (t.estado !== "pendiente" && t.estado !== "rechazada") return false;
  return t.fecha_limite < hoyISO();
}

export default function AsignacionesPage() {
  const router = useRouter();
  const [yo, setYo] = useState<Perfil | null>(null);
  const [asignaciones, setAsignaciones] = useState<AsignacionResumen[]>([]);
  const [miembros, setMiembros] = useState<Perfil[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [formulario, setFormulario] = useState<AsignacionResumen["tarea"] | "nueva" | null>(null);
  const [destino, setDestino] = useState("");

  useEffect(() => {
    const sincronizar = () => setDestino(new URLSearchParams(window.location.search).get("trabajo") ?? "");
    sincronizar();
    window.addEventListener("hashchange", sincronizar);
    return () => window.removeEventListener("hashchange", sincronizar);
  }, []);
  useEffect(() => {
    if (!cargando && destino) document.getElementById(`trabajo-${destino}`)?.scrollIntoView({ block: "nearest" });
  }, [cargando, destino]);

  const [persona, setPersona] = useState("");
  const [estado, setEstado] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const consulta: { persona?: string; estado?: string; desde?: string; hasta?: string } = {};
      if (persona) consulta.persona = persona;
      if (estado && estado !== "vencida") consulta.estado = estado;
      else if (estado === "vencida") consulta.estado = "pendiente";
      if (desde) consulta.desde = desde;
      if (hasta) consulta.hasta = hasta;
      const res = await api.adminGetAsignaciones(consulta);
      setAsignaciones(Array.isArray(res?.asignaciones) ? res.asignaciones : []);
      setError(false);
    } catch {
      setError(true);
      setAsignaciones([]);
    } finally {
      setCargando(false);
    }
  }, [persona, estado, desde, hasta]);

  useEffect(() => {
    let activo = true;
    api.getYo()
      .then((p) => {
        if (!activo) return;
        if (!p.es_admin) {
          router.replace("/");
          return;
        }
        setYo(p);
        api.adminGetMiembros("aprobado")
          .then((lista) => {
            if (activo) setMiembros(Array.isArray(lista) ? lista : []);
          })
          .catch(() => {});
        // Abrir la página apaga las novedades de Recientes.
        api.adminPostAsignacionesVistas([]).catch(() => {});
      })
      .catch(() => router.replace("/login"));
    return () => {
      activo = false;
    };
  }, [router]);

  useEffect(() => {
    if (!yo) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [yo, cargar]);

  const visibles = useMemo(() => {
    if (estado !== "vencida") return asignaciones;
    return asignaciones.filter((a) => estaVencida(a));
  }, [asignaciones, estado]);

  const conteo = useMemo(() => {
    const base: Record<string, number> = { pendiente: 0, hecha: 0, aceptada: 0, rechazada: 0, vencida: 0 };
    for (const a of asignaciones) {
      base[a.tarea.estado] = (base[a.tarea.estado] ?? 0) + 1;
      if (estaVencida(a)) base.vencida += 1;
    }
    return base;
  }, [asignaciones]);

  const hayFiltros = Boolean(persona || estado || desde || hasta);

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecera}>
        <div>
          <h1 className={styles.titulo}>Trabajos</h1>
          <p className={styles.subtitulo}>
            {cargando ? "Cargando…" : `${visibles.length} ${visibles.length === 1 ? "asignación" : "asignaciones"}`}
            {conteo.vencida > 0 ? ` · ${conteo.vencida} vencida${conteo.vencida === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <Boton onClick={() => setFormulario("nueva")} disabled={!yo}><Plus size={16} aria-hidden="true" /> Asignar trabajo</Boton>
        <button
          type="button"
          className={styles.botonFiltros}
          onClick={() => setFiltrosAbiertos((v) => !v)}
          aria-expanded={filtrosAbiertos}
        >
          <Filter size={14} strokeWidth={1.85} aria-hidden="true" />
          Filtros
        </button>
      </header>

      <div className={`${styles.filtros} ${filtrosAbiertos ? styles.filtrosAbiertos : ""}`}>
        <label className={styles.campo}>
          <span className={styles.campoEtiqueta}>Persona</span>
          <select value={persona} onChange={(e) => setPersona(e.target.value)}>
            <option value="">Todas</option>
            {miembros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.campo}>
          <span className={styles.campoEtiqueta}>Estado</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="hecha">Entregada</option>
            <option value="aceptada">Aprobada</option>
            <option value="rechazada">Rechazada</option>
            <option value="vencida">Vencida</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </label>
        <label className={styles.campo}>
          <span className={styles.campoEtiqueta}>Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className={styles.campo}>
          <span className={styles.campoEtiqueta}>Hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        {hayFiltros && (
          <button
            type="button"
            className={styles.limpiar}
            onClick={() => {
              setPersona("");
              setEstado("");
              setDesde("");
              setHasta("");
            }}
          >
            Limpiar
          </button>
        )}
      </div>

      {cargando ? (
        <div className={styles.esqueletoCaja}>
          <Esqueleto filas={5} />
        </div>
      ) : error ? (
        <div className={styles.vacio}>
          <CircleAlert size={18} strokeWidth={1.75} aria-hidden="true" />
          <p>No se pudieron cargar las asignaciones.</p>
          <button type="button" className={styles.reintentar} onClick={() => void cargar()}>
            Reintentar
          </button>
        </div>
      ) : visibles.length === 0 ? (
        <div className={styles.vacio}>
          <CalendarDays size={18} strokeWidth={1.75} aria-hidden="true" />
          <p>
            {hayFiltros
              ? "Ninguna asignación coincide con esos filtros."
              : "Todavía no hay asignaciones. Se crean al asignar una tarea."}
          </p>
        </div>
      ) : (
        <ul className={styles.lista}>
          {visibles.map(({ tarea, novedad }) => {
            const vencida = estaVencida({ tarea, novedad });
            return (
              <li key={tarea.id} id={`trabajo-${tarea.id}`} className={`${styles.item} ${destino === String(tarea.id) ? styles.resaltado : ""}`}>
                <div className={styles.itemEnlace}>
                  <div className={styles.itemFila}>
                    <span className={styles.itemTitulo}>{tarea.cliente ? `${tarea.cliente.nombre} · ` : ""}{tarea.descripcion || tarea.titulo}</span>
                    {novedad && <span className={styles.itemNuevo} aria-label="Nueva" />}
                  </div>
                  <div className={styles.itemMeta}>
                    <span className={styles.itemPersona}>
                      {tarea.asignado ? (
                        <Avatar
                          tamano={24}
                          src={tarea.asignado.foto_path || undefined}
                          iniciales={tarea.asignado.nombre.charAt(0).toUpperCase()}
                          alt={tarea.asignado.nombre}
                        />
                      ) : null}
                      {tarea.asignado?.nombre ?? "Sin asignar"}
                    </span>
                    <span>{tarea.tipo?.nombre ?? "Trabajo"}</span>
                    <span className={styles.itemFecha}>
                      {tarea.fecha_limite ? `Límite ${fmtFecha(tarea.fecha_limite)}` : "Sin fecha límite"}
                    </span>
                  </div>
                </div>
                {(tarea.estado === "pendiente" || tarea.estado === "rechazada") && <Boton variante="secundario" onClick={() => setFormulario(tarea)}>Editar</Boton>}
                {tarea.estado === "hecha" && <Link href={`/tareas?tarea=${tarea.id}#tarea-${tarea.id}`}>Revisar entrega</Link>}
                <span
                  className={`${styles.estado} ${
                    vencida ? styles.estadoVencida : tarea.estado === "aceptada" ? styles.estadoAprobada : ""
                  }`}
                >
                  {vencida ? "Vencida" : ETIQUETAS_ESTADO[tarea.estado]}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {formulario && <FormularioAsignacion tarea={formulario === "nueva" ? undefined : formulario}
        onCerrar={() => setFormulario(null)} onGuardar={() => { setFormulario(null); void cargar(); }} />}
    </div>
  );
}
