/** Montos del front (única utilidad, BRIEF pulido 1 §4).
 * Siempre `$290.000` (es-CO, sin decimales). Solo UI: no toca contratos.
 * Reemplaza a los fmtCOP duplicados de f1tipos/f2tipos/f4tipos (que delegan aquí).
 */

export function fmtCOP(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  try {
    return `$${Math.round(n).toLocaleString("es-CO")}`;
  } catch {
    return `$${Math.round(n)}`;
  }
}
