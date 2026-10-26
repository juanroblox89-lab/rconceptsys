"use client";

import { useEffect, useState } from "react";
import { Receipt, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "@/lib/api";
import { FacturaMiaRespuesta } from "@/lib/types";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Chip } from "@/components/ui/Chip";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Tabla, TablaFila } from "@/components/ui/Tabla";
import { useAviso } from "@/components/ui/Aviso";
import styles from "./factura.module.css";

export default function MiFacturaPage() {
  const [datos, setDatos] = useState<FacturaMiaRespuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [facturaExpandida, setFacturaExpandida] = useState<number | null>(null);
  const { mostrarAviso } = useAviso();

  useEffect(() => {
    let montado = true;
    (async () => {
      try {
        const res = await api.getFacturaMia();
        if (montado) setDatos(res);
      } catch {
        if (montado) {
          mostrarAviso({
            tipo: "error",
            titulo: "Error al cargar factura",
            texto: "No pudimos consultar tu estado de facturación.",
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

  const toggleExpandir = (id: number) => {
    setFacturaExpandida((prev) => (prev === id ? null : id));
  };

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

  const lineas = datos?.abierta?.lineas || [];
  const cantidadTrabajos = lineas.length;
  const totalAbierta = datos?.total_pendiente || datos?.abierta?.total || 0;
  const pagadas = datos?.pagadas || [];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Mi factura</h1>
        <p className={styles.subtitle}>
          Consulta tus trabajos aceptados acumulados y el historial de pagos recibidos
        </p>
      </div>

      {cargando ? (
        <div style={{ maxWidth: 640, margin: "2rem auto", width: "100%" }}>
          <Esqueleto filas={4} />
        </div>
      ) : (
        <>
          {/* Tarjetas de estadísticas */}
          <div className={styles.statsRow}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Factura abierta actual</span>
              <span className={styles.statValor}>
                $ {totalAbierta.toLocaleString("es-CO")}
              </span>
              <span className={styles.statSub}>
                {cantidadTrabajos === 1 ? "1 trabajo aceptado" : `${cantidadTrabajos} trabajos aceptados`}
              </span>
            </div>

            <div className={styles.statCard}>
              <span className={styles.statLabel}>Total histórico cobrado</span>
              <span className={styles.statValor}>
                $ {(datos?.total_pagado || 0).toLocaleString("es-CO")}
              </span>
              <span className={styles.statSub}>
                {pagadas.length === 1 ? "1 factura pagada" : `${pagadas.length} facturas pagadas`}
              </span>
            </div>
          </div>

          {/* Líneas de la factura abierta */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                Trabajos en la factura abierta ({cantidadTrabajos})
              </h2>
            </div>

            {cantidadTrabajos === 0 ? (
              <Tarjeta
                variante="vacia"
                tituloVacio="Aún no tienes trabajos aceptados"
                textoVacio="Cuando el administrador acepte tus tareas hechas, su valor congelado aparecerá aquí."
              />
            ) : (
              <>
                {/* Escritorio: Tabla */}
                <div className={styles.desktopTable}>
                  <Tabla>
                    <thead>
                      <tr>
                        <th>Fecha aceptada</th>
                        <th>Trabajo</th>
                        <th>Título</th>
                        <th style={{ textAlign: "right" }}>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineas.map((t) => (
                        <TablaFila key={t.id}>
                          <td>{formatearFechaHora(t.resuelta_en)}</td>
                          <td>
                            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
                              <Chip punto="azul">
                                {t.tipo?.rol?.nombre || t.tipo?.nombre || "Trabajo"}
                              </Chip>
                              {t.cliente && (
                                <Chip punto="verde">
                                  {t.cliente.nombre}
                                </Chip>
                              )}
                            </div>
                          </td>
                          <td>
                            <strong>{t.titulo}</strong>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <span className={styles.monto}>
                              {t.tipo?.unidad === "minuto" && t.cantidad_aceptada && t.precio_unitario_congelado
                                ? `${t.cantidad_aceptada} min × $ ${t.precio_unitario_congelado.toLocaleString("es-CO")} = $ ${(t.precio_congelado || 0).toLocaleString("es-CO")}`
                                : `$ ${(t.precio_congelado || 0).toLocaleString("es-CO")}`}
                            </span>
                          </td>
                        </TablaFila>
                      ))}
                    </tbody>
                  </Tabla>
                </div>

                {/* Móvil: Tarjetas apiladas */}
                <div className={styles.mobileCards}>
                  {lineas.map((t) => (
                    <article key={t.id} className={styles.lineaCard}>
                      <div className={styles.lineaCardTop}>
                        <strong>{t.titulo}</strong>
                        <span className={styles.lineaCardPrecio}>
                          {t.tipo?.unidad === "minuto" && t.cantidad_aceptada && t.precio_unitario_congelado
                            ? `${t.cantidad_aceptada} min × $ ${t.precio_unitario_congelado.toLocaleString("es-CO")} = $ ${(t.precio_congelado || 0).toLocaleString("es-CO")}`
                            : `$ ${(t.precio_congelado || 0).toLocaleString("es-CO")}`}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                        <Chip punto="azul">
                          {t.tipo?.rol?.nombre || t.tipo?.nombre || "Trabajo"}
                        </Chip>
                        {t.cliente && (
                          <Chip punto="verde">
                            {t.cliente.nombre}
                          </Chip>
                        )}
                        <span style={{ fontSize: "11px", color: "var(--rc-texto-secundario)" }}>
                          {formatearFechaHora(t.resuelta_en)}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Historial de facturas pagadas */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Historial de facturas pagadas</h2>
            </div>

            {pagadas.length === 0 ? (
              <Tarjeta
                variante="vacia"
                tituloVacio="Sin facturas pagadas"
                textoVacio="Aún no tienes cortes de factura pagados registrados en el sistema."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {pagadas.map((f) => {
                  const expandida = facturaExpandida === f.id;
                  const lineasPagada = f.lineas || [];
                  return (
                    <div key={f.id} className={styles.historialItem}>
                      <div
                        className={styles.historialSummary}
                        onClick={() => toggleExpandir(f.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleExpandir(f.id);
                          }
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <Receipt size={16} strokeWidth={1.75} color="var(--rc-verde-texto)" />
                          <div>
                            <div style={{ fontWeight: "var(--rc-fw-semibold)", fontSize: "var(--rc-fs-cuerpo)" }}>
                              Factura #{f.id}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--rc-texto-secundario)" }}>
                              Pagada el {formatearFechaHora(f.pagada_en)} ({lineasPagada.length} trabajos)
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <span className={styles.monto}>
                            $ {f.total.toLocaleString("es-CO")}
                          </span>
                          {expandida ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>

                      {expandida && (
                        <div className={styles.historialDetalle}>
                          {lineasPagada.length === 0 ? (
                            <div style={{ fontSize: "12px", color: "var(--rc-texto-secundario)" }}>
                              No hay detalle de líneas disponible para esta factura.
                            </div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              {lineasPagada.map((linea) => (
                                <div
                                  key={linea.id}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    fontSize: "12px",
                                    padding: "4px 0",
                                    flexWrap: "wrap",
                                    gap: "4px",
                                  }}
                                >
                                  <span>
                                    {linea.titulo}
                                    {linea.cliente && (
                                      <span style={{ color: "var(--rc-verde-texto)", marginLeft: "6px", fontSize: "11px" }}>
                                        ({linea.cliente.nombre})
                                      </span>
                                    )}
                                  </span>
                                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: "var(--rc-fw-medium)" }}>
                                    {linea.tipo?.unidad === "minuto" && linea.cantidad_aceptada && linea.precio_unitario_congelado
                                      ? `${linea.cantidad_aceptada} min × $ ${linea.precio_unitario_congelado.toLocaleString("es-CO")} = $ ${(linea.precio_congelado || 0).toLocaleString("es-CO")}`
                                      : `$ ${(linea.precio_congelado || 0).toLocaleString("es-CO")}`}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
