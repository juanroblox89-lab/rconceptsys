"use client";

/**
 * Métricas F5 (admin/dueño) — números reales del store vía GET /metricas:
 * publicadas/semana (8), en curso por estado, vencidas, carga por persona,
 * cobros del mes, ventas. Barras simples SVG B/N (un gris por serie) +
 * tabla alternativa accesible. Cada número linkea a su vista filtrada.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtCOP } from "@/lib/dinero";
import { getMetricas, type Metricas } from "@/lib/f5api";
import f1 from "@/components/F1.module.css";
import styles from "./Metricas.module.css";

/** Barra B/N: una serie por tono de gris (sin librerías pesadas). */
function Barras({
  datos,
  formato,
}: {
  datos: { etiqueta: string; valor: number; href: string }[];
  formato?: (v: number) => string;
}) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const grises = ["#0a0a0a", "#404040", "#737373", "#a3a3a3"];
  return (
    <div className={styles.barras} role="img" aria-label="Gráfico de barras">
      {datos.map((d, i) => (
        <Link
          key={d.etiqueta}
          href={d.href}
          className={styles.barraFila}
          title={`${d.etiqueta}: ${formato !== undefined ? formato(d.valor) : d.valor}`}
        >
          <span className={styles.barraEti}>{d.etiqueta}</span>
          <span className={styles.barraPista}>
            <span
              className={styles.barraRelleno}
              style={{
                width: `${Math.max(d.valor > 0 ? 6 : 0, Math.round((d.valor / max) * 100))}%`,
                background: grises[i % grises.length],
              }}
            />
          </span>
          <span className={styles.barraValor}>
            {formato !== undefined ? formato(d.valor) : d.valor}
          </span>
        </Link>
      ))}
    </div>
  );
}

function fmtSemana(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m === null) return s;
  return `${m[3]}/${m[2]}`;
}

export function MetricasPanel() {
  const [m, setM] = useState<Metricas | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = () => {
    setError(null);
    void getMetricas()
      .then(setM)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "No se pudo cargar");
      });
  };

  useEffect(() => {
    const t = window.setTimeout(cargar, 0);
    return () => window.clearTimeout(t);
  }, []);

  if (error !== null) {
    return (
      <div className="error-box" role="alert">
        <p>{error}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={cargar}>
          Reintentar
        </button>
      </div>
    );
  }
  if (m === null) return <p style={{ fontSize: 12, color: "var(--c-text-2)" }}>Cargando métricas…</p>;

  const estados = Object.entries(m.piezas_por_estado).sort((a, b) => b[1] - a[1]);
  const etapas = Object.entries(m.ventas.leads_por_etapa).sort((a, b) => b[1] - a[1]);

  return (
    <section aria-label="Métricas" style={{ marginTop: 16 }}>
      <h2 className={f1.f1sectionTitle}>Métricas</h2>
      <div className={styles.grid}>
        <div className={f1.f1card}>
          <strong className={styles.titulo}>Publicadas por semana</strong>
          <Barras
            datos={m.piezas_publicadas_semana.map((s) => ({
              etiqueta: fmtSemana(s.semana),
              valor: s.piezas,
              href: "/produccion",
            }))}
          />
          <table className={styles.tabla}>
            <caption>Publicadas por semana (tabla)</caption>
            <tbody>
              {m.piezas_publicadas_semana.map((s) => (
                <tr key={s.semana}>
                  <th scope="row">{fmtSemana(s.semana)}</th>
                  <td>
                    <Link href="/produccion">{s.piezas}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={f1.f1card}>
          <strong className={styles.titulo}>Piezas en curso por estado</strong>
          <Barras
            datos={estados.map(([e, n]) => ({
              etiqueta: e,
              valor: n,
              href: `/produccion`,
            }))}
          />
          <p className={styles.linea}>
            <Link href="/mis-tareas?vencidas=1">Tareas vencidas: {m.tareas_vencidas}</Link>
          </p>
        </div>

        <div className={f1.f1card}>
          <strong className={styles.titulo}>Carga por persona</strong>
          {m.carga_por_persona.length === 0 && (
            <p className={f1.f1vacio}>Sin tareas abiertas.</p>
          )}
          <Barras
            datos={m.carga_por_persona.slice(0, 8).map((c) => ({
              etiqueta: `${c.usuario_nombre} · ${c.oficio}`,
              valor: c.abiertas,
              href: "/mis-tareas",
            }))}
          />
        </div>

        <div className={f1.f1card}>
          <strong className={styles.titulo}>Cobros del mes ({m.cobros_mes.periodo})</strong>
          <Barras
            datos={[
              { etiqueta: "Aprobado", valor: m.cobros_mes.aprobado, href: "/cobros" },
              { etiqueta: "Por confirmar", valor: m.cobros_mes.por_confirmar, href: "/cobros" },
              { etiqueta: "Reclamado", valor: m.cobros_mes.reclamado, href: "/cobros" },
            ]}
            formato={(v) => fmtCOP(v)}
          />
          <p className={styles.linea}>
            <Link href="/cobros">
              Último corte:{" "}
              {m.cobros_mes.ultimo_corte === null
                ? "sin cortes"
                : `${m.cobros_mes.ultimo_corte.periodo} · ${m.cobros_mes.ultimo_corte.estado}`}
            </Link>
          </p>
        </div>

        <div className={f1.f1card}>
          <strong className={styles.titulo}>Ventas</strong>
          <Barras
            datos={etapas.map(([e, n]) => ({
              etiqueta: e,
              valor: n,
              href: "/ventas",
            }))}
          />
          <p className={styles.linea}>
            <Link href="/ventas">
              Conversión del mes: {Math.round(m.ventas.conversion_mes * 100)} % ·{" "}
              {m.ventas.ganados_mes} ganados · {m.ventas.perdidos_mes} perdidos
            </Link>
          </p>
          {m.ventas.visitas_por_vendedor.length > 0 && (
            <Barras
              datos={m.ventas.visitas_por_vendedor.map((v) => ({
                etiqueta: v.usuario_nombre,
                valor: v.visitas,
                href: "/ventas",
              }))}
            />
          )}
          <p className={styles.linea}>
            <Link href="/cobros">Comisiones del mes: {fmtCOP(m.ventas.comisiones_mes)}</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
