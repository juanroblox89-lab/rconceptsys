import type { VisualizacionRIA as Datos } from "@/lib/visualizacion-ria";
import styles from "./RespuestaRIA.module.css";

const nombres = { flujo: "Diagrama de flujo", recta: "Recta numérica", barras: "Gráfico de barras", linea: "Gráfico de líneas" };

function Recta({ min, max, puntos }: Extract<Datos, { tipo: "recta" }>) {
  const x = (valor: number) => 20 + 280 * ((valor - min) / (max - min));
  return <svg viewBox="0 0 320 38" aria-hidden="true" className={styles.grafico}>
    <path d="M20 17H300 M20 10V24 M300 10V24" className={styles.eje} />
    {puntos.map(([nombre, valor]) => <circle key={nombre} cx={x(valor)} cy="17" r="4" className={styles.marca} />)}
    <text x="20" y="36" textAnchor="start">{min}</text>
    <text x="300" y="36" textAnchor="end">{max}</text>
  </svg>;
}

function Grafico({ tipo, datos }: Extract<Datos, { tipo: "barras" | "linea" }>) {
  const valores = datos.map(([, valor]) => valor);
  const min = Math.min(...valores, ...(tipo === "barras" ? [0] : []));
  const max = Math.max(...valores, ...(tipo === "barras" ? [0] : []));
  const y = (valor: number) => max === min ? 60 : 106 - 94 * ((valor - min) / (max - min));
  const ancho = 240 / datos.length;
  const x = (i: number) => 72 + ancho * (i + .5);
  const base = tipo === "barras" ? y(0) : 106;
  return <svg viewBox="0 0 320 128" aria-hidden="true" className={styles.grafico}>
    <path d={`M72 12V106H312 M72 ${base}H312`} className={styles.eje} />
    {max === min ? <text x="68" y={y(max)} textAnchor="end">{max}</text> : <>
      <text x="68" y="16" textAnchor="end">{max}</text>
      <text x="68" y="110" textAnchor="end">{min}</text>
      {tipo === "barras" && base > 26 && base < 92 && <text x="68" y={base + 4} textAnchor="end">0</text>}
    </>}
    {tipo === "linea" && <polyline points={valores.map((valor, i) => `${x(i)},${y(valor)}`).join(" ")} className={styles.serie} />}
    {datos.map(([nombre, valor], i) => <g key={nombre}>
      {tipo === "linea" ? <circle cx={x(i)} cy={y(valor)} r="3.5" className={styles.marca} /> : valor !== 0 &&
        <rect x={x(i) - ancho * .28} y={Math.min(base, y(valor))} width={ancho * .56} height={Math.abs(base - y(valor))} className={styles.marca} />}
      <text x={x(i)} y="123" textAnchor="middle">{i + 1}</text>
    </g>)}
  </svg>;
}

export function VisualizacionRIA({ viz }: { viz: Datos }) {
  const nombre = nombres[viz.tipo];
  return <figure className={styles.figura}>
    <figcaption><strong>{nombre}{viz.titulo ? `: ${viz.titulo}` : ""}</strong></figcaption>
    {viz.tipo === "flujo" ? <ol className={styles.pasos}>
      {viz.pasos.map((paso, i) => <li key={i}>{paso}</li>)}
    </ol> : <>
      {viz.tipo === "recta" ? <>
        <Recta {...viz} />
        <p>Intervalo: {viz.min} a {viz.max}</p>
      </> : <Grafico {...viz} />}
      <ol className={styles.datos}>
        {(viz.tipo === "recta" ? viz.puntos : viz.datos).map(([etiqueta, valor]) => <li key={etiqueta}>{etiqueta}: {valor}</li>)}
      </ol>
    </>}
  </figure>;
}
