"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { TrendingUp, Calendar, BarChart3 } from "lucide-react";
import { api } from "@/lib/api";
import { Boton } from "@/components/ui/Boton";
import { Chip } from "@/components/ui/Chip";
import { Campo } from "@/components/ui/Campo";
import { Esqueleto } from "@/components/ui/Esqueleto";
import styles from "./trabajos-hechos.module.css";

export type ModoTrabajosHechos =
  | { tipo: "yo" }
  | { tipo: "persona"; id: string };

export interface TrabajosHechosProps {
  modo: ModoTrabajosHechos;
  nombre?: string;
  mostrarEnlaceAdminStats?: boolean;
}

type PresetFecha = "hoy" | "7dias" | "este_mes" | "mes_pasado" | "este_ano" | "todo" | "personalizado";

function formatYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function obtenerFechasPreset(preset: PresetFecha, esPersona: boolean): { desde?: string; hasta?: string } {
  const ahora = new Date();
  const hoyStr = formatYMD(ahora);

  switch (preset) {
    case "hoy":
      return { desde: hoyStr, hasta: hoyStr };
    case "7dias": {
      const d = new Date(ahora);
      d.setDate(d.getDate() - 6);
      return { desde: formatYMD(d), hasta: hoyStr };
    }
    case "este_mes": {
      const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      return { desde: formatYMD(inicio), hasta: hoyStr };
    }
    case "mes_pasado": {
      const inicio = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
      const fin = new Date(ahora.getFullYear(), ahora.getMonth(), 0);
      return { desde: formatYMD(inicio), hasta: formatYMD(fin) };
    }
    case "este_ano": {
      const inicio = new Date(ahora.getFullYear(), 0, 1);
      return { desde: formatYMD(inicio), hasta: hoyStr };
    }
    case "todo":
      if (esPersona) {
        // En backend admin/estadisticas sin fechas toma 30 días por defecto, por lo que cubrimos hasta 5 años (tope backend)
        const d = new Date(ahora);
        d.setFullYear(d.getFullYear() - 5);
        return { desde: formatYMD(d), hasta: hoyStr };
      }
      return {};
    default:
      return {};
  }
}

interface DatosTrabajosHechos {
  trabajos: number;
  minutos: number;
  valor: number;
  este_mes: { trabajos: number; minutos: number; valor: number };
  total: { trabajos: number; minutos: number; valor: number };
  por_tipo: Array<{
    tipo_id: number;
    nombre: string;
    unidad: string;
    trabajos: number;
    minutos: number;
    valor: number;
  }>;
}

export function TrabajosHechos({
  modo,
  nombre,
  mostrarEnlaceAdminStats = true,
}: TrabajosHechosProps) {
  const [datos, setDatos] = useState<DatosTrabajosHechos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<PresetFecha>("este_mes");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [errorRango, setErrorRango] = useState<string | null>(null);

  const modoTipo = modo.tipo;
  const personaId = modo.tipo === "persona" ? modo.id : undefined;

  const cargarEstadisticas = useCallback(
    async (p: PresetFecha, d?: string, h?: string) => {
      setCargando(true);
      setError(null);
      setErrorRango(null);
      try {
        let desdeParam = d;
        let hastaParam = h;
        if (p !== "personalizado") {
          const fechas = obtenerFechasPreset(p, modoTipo === "persona");
          desdeParam = fechas.desde;
          hastaParam = fechas.hasta;
        }

        if (modoTipo === "yo") {
          const res = await api.getYoEstadisticas(desdeParam, hastaParam);
          setDatos({
            trabajos: res.trabajos,
            minutos: res.minutos,
            valor: res.valor,
            este_mes: res.este_mes || { trabajos: 0, minutos: 0, valor: 0 },
            total: res.total || { trabajos: 0, minutos: 0, valor: 0 },
            por_tipo: res.por_tipo || [],
          });
        } else {
          if (!personaId) return;
          const res = await api.adminGetEstadisticas({
            persona_id: personaId,
            desde: desdeParam,
            hasta: hastaParam,
          });
          setDatos({
            trabajos: res.totales.trabajos,
            minutos: res.totales.minutos,
            valor: res.totales.valor,
            este_mes: res.este_mes || { trabajos: 0, minutos: 0, valor: 0 },
            total: res.total || { trabajos: 0, minutos: 0, valor: 0 },
            por_tipo: (res.por_tipo || []).map((tp) => ({
              tipo_id: tp.tipo_id,
              nombre: tp.nombre,
              unidad: tp.unidad,
              trabajos: tp.trabajos,
              minutos: tp.minutos,
              valor: tp.valor,
            })),
          });
        }
      } catch (err: unknown) {
        const e = err as { message?: string };
        setError(e?.message || "No se pudieron cargar las estadísticas.");
      } finally {
        setCargando(false);
      }
    },
    [modoTipo, personaId]
  );

  useEffect(() => {
    let montado = true;
    if (montado) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      cargarEstadisticas("este_mes");
    }
    return () => {
      montado = false;
    };
  }, [cargarEstadisticas]);

  const handleCambiarPreset = (nuevoPreset: PresetFecha) => {
    setPreset(nuevoPreset);
    if (nuevoPreset !== "personalizado") {
      cargarEstadisticas(nuevoPreset);
    }
  };

  const handleAplicarPersonalizado = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fechaDesde || !fechaHasta) {
      setErrorRango("Selecciona fecha desde y hasta.");
      return;
    }
    if (fechaDesde > fechaHasta) {
      setErrorRango("La fecha 'Desde' no puede ser posterior a 'Hasta'.");
      return;
    }
    cargarEstadisticas("personalizado", fechaDesde, fechaHasta);
  };

  const titulo =
    modoTipo === "persona"
      ? nombre
        ? `Trabajos hechos de ${nombre}`
        : "Trabajos hechos"
      : "Trabajos hechos";

  const maxTrabajosTipo = Math.max(
    ...(datos?.por_tipo?.map((t) => t.trabajos) || [1]),
    1
  );

  const textoVacio =
    modoTipo === "persona"
      ? "Aún no tiene trabajos aprobados en este período."
      : "No se registraron trabajos en este período.";

  return (
    <div className={styles.cardTrabajosHechos}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <h2
          className={styles.seccionTitulo}
          style={{ display: "flex", alignItems: "center", gap: "6px" }}
        >
          <TrendingUp size={16} strokeWidth={2} color="var(--rc-azul-texto)" />
          {titulo}
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {modoTipo === "persona" && personaId && mostrarEnlaceAdminStats && (
            <Link
              href={`/admin?pestana=estadisticas&persona=${encodeURIComponent(personaId)}`}
              className={styles.enlaceAdminStats}
            >
              <BarChart3 size={13} strokeWidth={1.75} />
              Ver en Estadísticas
            </Link>
          )}
          <span style={{ fontSize: "var(--rc-fs-etiqueta)", color: "var(--rc-texto-secundario)" }}>
            Tareas aprobadas y valor acumulado
          </span>
        </div>
      </div>

      {cargando ? (
        <Esqueleto filas={4} />
      ) : error ? (
        <div className={styles.errorTexto}>{error}</div>
      ) : (
        <>
          {/* Resumen Total y Este Mes */}
          <div className={styles.resumenRapido}>
            <div className={styles.resumenCard}>
              <span className={styles.resumenLabel}>Este mes</span>
              <span className={styles.resumenValor}>
                $ {(datos?.este_mes?.valor || 0).toLocaleString("es-CO")}
              </span>
              <span className={styles.resumenDetalle}>
                {datos?.este_mes?.trabajos || 0} trab. • {datos?.este_mes?.minutos || 0} min
              </span>
            </div>

            <div className={styles.resumenCard}>
              <span className={styles.resumenLabel}>Total acumulado</span>
              <span className={styles.resumenValor}>
                $ {(datos?.total?.valor || 0).toLocaleString("es-CO")}
              </span>
              <span className={styles.resumenDetalle}>
                {datos?.total?.trabajos || 0} trab. • {datos?.total?.minutos || 0} min
              </span>
            </div>
          </div>

          {/* Selector de Presets de Rango */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span className={styles.label}>Filtrar por período</span>
            <div className={styles.presetsRow} role="tablist">
              {(
                [
                  { id: "hoy", label: "Hoy" },
                  { id: "7dias", label: "7 días" },
                  { id: "este_mes", label: "Este mes" },
                  { id: "mes_pasado", label: "Mes pasado" },
                  { id: "este_ano", label: "Este año" },
                  { id: "todo", label: "Todo" },
                  { id: "personalizado", label: "Personalizado" },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={preset === p.id}
                  className={`${styles.btnPreset} ${preset === p.id ? styles.btnPresetActivo : ""}`}
                  onClick={() => handleCambiarPreset(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {preset === "personalizado" && (
              <form onSubmit={handleAplicarPersonalizado} className={styles.personalizadoRow} style={{ marginTop: "6px" }}>
                <div style={{ flex: 1, minWidth: "120px" }}>
                  <Campo
                    etiqueta="Desde"
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1, minWidth: "120px" }}>
                  <Campo
                    etiqueta="Hasta"
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                  />
                </div>
                <Boton type="submit" variante="primario" tamano="sm" style={{ height: "36px" }}>
                  <Calendar size={13} style={{ marginRight: 4 }} />
                  Aplicar
                </Boton>
              </form>
            )}
            {errorRango && (
              <span style={{ fontSize: "var(--rc-fs-etiqueta)", color: "var(--rc-rojo-texto)", marginTop: "2px" }}>
                {errorRango}
              </span>
            )}
          </div>

          {/* Métricas del rango seleccionado */}
          <div className={styles.metricasGrid}>
            <div className={styles.metricaBox}>
              <span className={styles.metricaBoxValor}>
                {datos?.trabajos || 0}
              </span>
              <span className={styles.metricaBoxLabel}>Trabajos</span>
            </div>
            <div className={styles.metricaBox}>
              <span className={styles.metricaBoxValor}>
                {datos?.minutos || 0} min
              </span>
              <span className={styles.metricaBoxLabel}>Grabación</span>
            </div>
            <div className={styles.metricaBox}>
              <span className={styles.metricaBoxValor}>
                $ {(datos?.valor || 0).toLocaleString("es-CO")}
              </span>
              <span className={styles.metricaBoxLabel}>Total ganado</span>
            </div>
          </div>

          {/* Desglose por Tipo de Trabajo */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}>
            <span className={styles.label}>Desglose por tipo de trabajo</span>
            {datos?.por_tipo && datos.por_tipo.length > 0 ? (
              <div className={styles.listaDesglose}>
                {datos.por_tipo.map((tp) => {
                  const pct = Math.min(
                    100,
                    Math.max(5, Math.round((tp.trabajos / maxTrabajosTipo) * 100))
                  );
                  return (
                    <div key={tp.tipo_id} className={styles.itemDesglose}>
                      <div className={styles.itemDesgloseTop}>
                        <div className={styles.itemDesgloseNombre}>
                          <span>{tp.nombre}</span>
                          <Chip punto={tp.unidad === "minuto" ? "azul" : "gris"}>
                            {tp.unidad === "minuto" ? "Por minuto" : "Por trabajo"}
                          </Chip>
                        </div>
                        <div className={styles.itemDesgloseCifras}>
                          <strong>{tp.trabajos} trab.</strong>
                          {tp.unidad === "minuto" && (
                            <span style={{ color: "var(--rc-azul-texto)", fontSize: "11px" }}>
                              ({tp.minutos} min)
                            </span>
                          )}
                          <span style={{ color: "var(--rc-texto-secundario)", fontWeight: 500 }}>
                            $ {tp.valor.toLocaleString("es-CO")}
                          </span>
                        </div>
                      </div>
                      <div className={styles.pistaProgreso}>
                        <div className={styles.rellenoProgreso} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.vacioTexto}>
                {textoVacio}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
