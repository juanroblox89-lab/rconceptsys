"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, Check, Calendar, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { Perfil, EstadisticasYoResponse } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { Boton } from "@/components/ui/Boton";
import { Chip } from "@/components/ui/Chip";
import { Campo } from "@/components/ui/Campo";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Aviso, useAviso } from "@/components/ui/Aviso";
import styles from "./perfil.module.css";

type PresetFecha = "hoy" | "7dias" | "este_mes" | "mes_pasado" | "este_ano" | "todo" | "personalizado";

function obtenerFechasPreset(preset: PresetFecha): { desde?: string; hasta?: string } {
  const ahora = new Date();
  const formatYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dia}`;
  };

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
    default:
      return {};
  }
}

export default function MiPerfilPage() {
  const [yo, setYo] = useState<Perfil | null>(null);
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  // Estadísticas F3
  const [stats, setStats] = useState<EstadisticasYoResponse | null>(null);
  const [cargandoStats, setCargandoStats] = useState(true);
  const [preset, setPreset] = useState<PresetFecha>("este_mes");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const { mostrarAviso } = useAviso();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cargarEstadisticas = useCallback(async (p: PresetFecha, d?: string, h?: string) => {
    setCargandoStats(true);
    try {
      let desdeParam = d;
      let hastaParam = h;
      if (p !== "personalizado") {
        const fechas = obtenerFechasPreset(p);
        desdeParam = fechas.desde;
        hastaParam = fechas.hasta;
      }
      const data = await api.getYoEstadisticas(desdeParam, hastaParam);
      setStats(data);
    } catch {
      // Ignorar fallo de estadísticas si no está aprobado
    } finally {
      setCargandoStats(false);
    }
  }, []);

  useEffect(() => {
    let montado = true;
    api.getYo()
      .then((p) => {
        if (montado) {
          setYo(p);
          setNombre(p.nombre);
        }
      })
      .catch(() => {});

    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarEstadisticas("este_mes");

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
      mostrarAviso({
        tipo: "error",
        titulo: "Rango incompleto",
        texto: "Selecciona las fechas 'Desde' y 'Hasta'.",
      });
      return;
    }
    if (fechaDesde > fechaHasta) {
      mostrarAviso({
        tipo: "error",
        titulo: "Rango inválido",
        texto: "La fecha 'Desde' no puede ser posterior a 'Hasta'.",
      });
      return;
    }
    cargarEstadisticas("personalizado", fechaDesde, fechaHasta);
  };

  const handleGuardarNombre = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorLocal(null);

    const limpio = nombre.trim();
    if (limpio.length < 2) {
      setErrorLocal("El nombre debe tener al menos 2 caracteres.");
      return;
    }

    setGuardando(true);

    try {
      const actualizado = await api.patchYo(limpio);
      setYo(actualizado);
      mostrarAviso({
        tipo: "exito",
        titulo: "Cambios guardados",
        texto: "Tu nombre de visualización se actualizó correctamente.",
      });
    } catch (err: unknown) {
      const e = err as { message?: string };
      const mensajeHumano =
        e.message || "No se pudo actualizar el nombre. Por favor, intenta nuevamente.";
      setErrorLocal(mensajeHumano);
      mostrarAviso({
        tipo: "error",
        titulo: "Error al guardar",
        texto: mensajeHumano,
      });
    } finally {
      setGuardando(false);
    }
  };

  const handleSeleccionarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      const msg = "La imagen supera el límite de 1 MB. Elige una imagen más liviana.";
      setErrorLocal(msg);
      mostrarAviso({ tipo: "error", titulo: "Imagen muy pesada", texto: msg });
      return;
    }

    setSubiendoFoto(true);
    setErrorLocal(null);

    const formData = new FormData();
    formData.append("foto", file);

    try {
      const actualizado = await api.subirFoto(formData);
      setYo(actualizado);
      mostrarAviso({
        tipo: "exito",
        titulo: "Foto actualizada",
        texto: "Tu nueva foto de perfil ya está visible.",
      });
    } catch (err: unknown) {
      const e = err as { message?: string };
      const mensajeHumano =
        e.message || "No se pudo subir la fotografía. Intenta con formato JPEG o PNG.";
      setErrorLocal(mensajeHumano);
      mostrarAviso({ tipo: "error", titulo: "Error al subir", texto: mensajeHumano });
    } finally {
      setSubiendoFoto(false);
    }
  };

  const sinCambios = !nombre.trim() || nombre.trim() === yo?.nombre;
  const maxTrabajosTipo = stats?.por_tipo && stats.por_tipo.length > 0
    ? Math.max(...stats.por_tipo.map((t) => t.trabajos), 1)
    : 1;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Mi perfil</h1>
        <p className={styles.subtitle}>Información personal, fotografía y resumen de trabajos hechos</p>
      </div>

      <div className={styles.card}>
        {errorLocal && (
          <Aviso
            tipo="error"
            titulo="No se pudo guardar"
            texto={errorLocal}
            onCerrar={() => setErrorLocal(null)}
          />
        )}

        <div className={styles.avatarSection}>
          <Avatar
            tamano={40}
            src={yo?.foto_path || undefined}
            iniciales={yo?.nombre ? yo.nombre.charAt(0).toUpperCase() : "U"}
            alt={yo?.nombre}
            style={{ width: "64px", height: "64px", fontSize: "24px" }}
          />

          <div className={styles.avatarActions}>
            <input
              type="file"
              ref={fileInputRef}
              className={styles.fileInput}
              accept="image/jpeg,image/png,image/webp"
              onChange={handleSeleccionarFoto}
            />
            <Boton
              type="button"
              variante="secundario"
              tamano="sm"
              onClick={() => fileInputRef.current?.click()}
              cargando={subiendoFoto}
              style={{ height: "30px" }}
            >
              <Camera size={14} strokeWidth={1.75} style={{ marginRight: 6 }} />
              {subiendoFoto ? "Subiendo..." : "Cambiar foto"}
            </Boton>
            <span className={styles.helperText}>Máximo 1 MB (JPEG, PNG o WebP)</span>
          </div>
        </div>

        <form className={styles.form} onSubmit={handleGuardarNombre}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="correo">
              Correo electrónico
            </label>
            <span className="rc-input-contenedor" style={{ opacity: 0.85 }}>
              <input
                id="correo"
                type="email"
                readOnly
                className="rc-input"
                value={yo?.correo || ""}
                style={{ cursor: "not-allowed" }}
              />
            </span>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="nombre">
              Nombre de visualización
            </label>
            <div className={styles.nameRow}>
              <div className={styles.nameField}>
                <span className="rc-input-contenedor" style={{ width: "100%" }}>
                  <input
                    id="nombre"
                    type="text"
                    required
                    minLength={2}
                    maxLength={60}
                    className="rc-input"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                  />
                </span>
              </div>
              <Boton
                type="submit"
                variante="vidrio"
                cargando={guardando}
                disabled={guardando || sinCambios}
                style={{ height: "30px", whiteSpace: "nowrap" }}
              >
                <Check size={14} strokeWidth={1.75} style={{ marginRight: 4 }} />
                {guardando ? "Guardando..." : "Guardar"}
              </Boton>
            </div>
          </div>
        </form>
      </div>

      {/* Tarjeta de Trabajos Hechos (F3) */}
      <div className={styles.cardTrabajosHechos}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
          <h2 className={styles.seccionTitulo} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <TrendingUp size={16} strokeWidth={2} color="var(--rc-azul-texto)" />
            Trabajos hechos
          </h2>
          <span style={{ fontSize: "var(--rc-fs-etiqueta)", color: "var(--rc-texto-secundario)" }}>
            Tareas aprobadas y valor acumulado
          </span>
        </div>

        {cargandoStats ? (
          <Esqueleto filas={4} />
        ) : (
          <>
            {/* Resumen Total y Este Mes */}
            <div className={styles.resumenRapido}>
              <div className={styles.resumenCard}>
                <span className={styles.resumenLabel}>Este mes</span>
                <span className={styles.resumenValor}>
                  $ {(stats?.este_mes?.valor || 0).toLocaleString("es-CO")}
                </span>
                <span className={styles.resumenDetalle}>
                  {stats?.este_mes?.trabajos || 0} trab. • {stats?.este_mes?.minutos || 0} min
                </span>
              </div>

              <div className={styles.resumenCard}>
                <span className={styles.resumenLabel}>Total acumulado</span>
                <span className={styles.resumenValor}>
                  $ {(stats?.total?.valor || 0).toLocaleString("es-CO")}
                </span>
                <span className={styles.resumenDetalle}>
                  {stats?.total?.trabajos || 0} trab. • {stats?.total?.minutos || 0} min
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
            </div>

            {/* Métricas del rango seleccionado */}
            <div className={styles.metricasGrid}>
              <div className={styles.metricaBox}>
                <span className={styles.metricaBoxValor}>
                  {stats?.trabajos || 0}
                </span>
                <span className={styles.metricaBoxLabel}>Trabajos</span>
              </div>
              <div className={styles.metricaBox}>
                <span className={styles.metricaBoxValor}>
                  {stats?.minutos || 0} min
                </span>
                <span className={styles.metricaBoxLabel}>Grabación</span>
              </div>
              <div className={styles.metricaBox}>
                <span className={styles.metricaBoxValor}>
                  $ {(stats?.valor || 0).toLocaleString("es-CO")}
                </span>
                <span className={styles.metricaBoxLabel}>Total ganado</span>
              </div>
            </div>

            {/* Desglose por Tipo de Trabajo */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}>
              <span className={styles.label}>Desglose por tipo de trabajo</span>
              {stats?.por_tipo && stats.por_tipo.length > 0 ? (
                <div className={styles.listaDesglose}>
                  {stats.por_tipo.map((tp) => {
                    const pct = Math.min(100, Math.max(5, Math.round((tp.trabajos / maxTrabajosTipo) * 100)));
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
                <div style={{ fontSize: "var(--rc-fs-secundario)", color: "var(--rc-texto-secundario)", padding: "12px 0", textAlign: "center" }}>
                  No se registraron trabajos en este período.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
