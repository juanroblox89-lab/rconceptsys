"use client";

import { CampoFecha } from "@/components/ui/CamposEspeciales";
import { CabeceraPagina } from "@/components/ui/CabeceraPagina";
import { Selector, opcionesSelector } from "@/components/ui/Selector";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CircleAlert, Filter, Plus } from "lucide-react";
import { Boton } from "@/components/ui/Boton";
import { FilaTrabajo, trabajoVencido } from "@/components/FilaTrabajo";
import flujo from "@/components/FlujoTrabajo.module.css";
import { api } from "@/lib/api";
import { AsignacionResumen, Perfil } from "@/lib/types";
import { Esqueleto } from "@/components/ui/Esqueleto";
import styles from "./asignaciones.module.css";

export default function AsignacionesPage() {
  const router = useRouter();
  const [yo, setYo] = useState<Perfil | null>(null);
  const [asignaciones, setAsignaciones] = useState<AsignacionResumen[]>([]);
  const [miembros, setMiembros] = useState<Perfil[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
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
    return asignaciones.filter((a) => trabajoVencido(a.tarea));
  }, [asignaciones, estado]);

  const conteo = useMemo(() => {
    const base: Record<string, number> = { pendiente: 0, hecha: 0, aceptada: 0, rechazada: 0, vencida: 0 };
    for (const a of asignaciones) {
      base[a.tarea.estado] = (base[a.tarea.estado] ?? 0) + 1;
      if (trabajoVencido(a.tarea)) base.vencida += 1;
    }
    return base;
  }, [asignaciones]);

  const hayFiltros = Boolean(persona || estado || desde || hasta);

  return (
    <div className={styles.pagina}>
      <CabeceraPagina titulo="Trabajos" detalle={<>{cargando ? "Cargando…" : `${visibles.length} ${visibles.length === 1 ? "asignación" : "asignaciones"}`}{conteo.vencida > 0 ? ` · ${conteo.vencida} vencida${conteo.vencida === 1 ? "" : "s"}` : ""}</>} acciones={<><Boton onClick={() => router.push("/trabajos/nuevo?desde=asignaciones")} disabled={!yo}><Plus size={16} aria-hidden="true" /> Asignar trabajo</Boton><Boton variante="secundario" onClick={() => setFiltrosAbiertos(v => !v)} aria-expanded={filtrosAbiertos}><Filter size={14} aria-hidden="true" /> Filtros</Boton></>} />

      <div className={`${styles.filtros} ${filtrosAbiertos ? styles.filtrosAbiertos : ""}`}>
        <div className={styles.campo}>
          <span className={styles.campoEtiqueta}>Persona</span>
          <Selector etiqueta="Persona" valor={persona} onCambio={seleccion => setPersona(seleccion)}  opciones={opcionesSelector(<><option value="">Todas</option>
            {miembros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}</>)} />
         </div>
        <div className={styles.campo}>
          <span className={styles.campoEtiqueta}>Estado</span>
          <Selector etiqueta="Estado" valor={estado} onCambio={seleccion => setEstado(seleccion)}  opciones={opcionesSelector(<><option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="hecha">Entregada</option>
            <option value="aceptada">Aprobada</option>
            <option value="rechazada">Rechazada</option>
            <option value="vencida">Vencida</option>
            <option value="cancelada">Cancelada</option></>)} />
         </div>
        <div className={styles.campo}><CampoFecha etiqueta="Desde" valor={desde} onCambio={setDesde} /></div>
        <div className={styles.campo}><CampoFecha etiqueta="Hasta" valor={hasta} onCambio={setHasta} /></div>
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
              : "Sin asignaciones."}
          </p>
        </div>
      ) : (
        <ul className={flujo.listaTrabajos}>
          {visibles.map(({ tarea, novedad }) => <FilaTrabajo key={tarea.id} tarea={tarea} novedad={novedad} origen="asignaciones"
            id={`trabajo-${tarea.id}`} resaltado={destino === String(tarea.id)} />)}
        </ul>
      )}
    </div>
  );
}
