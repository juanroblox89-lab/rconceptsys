type Punto = [etiqueta: string, valor: number];

export type VisualizacionRIA =
  | { tipo: "flujo"; titulo?: string; pasos: string[] }
  | { tipo: "recta"; titulo?: string; min: number; max: number; puntos: Punto[] }
  | { tipo: "barras" | "linea"; titulo?: string; datos: Punto[] };

const MAX_PUNTOS = 8;
const MAX_PASOS = 6;
const MAX_ETIQUETA = 48;
const MAX_VALOR = 1e9;

function etiqueta(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim() !== "" && valor.length <= MAX_ETIQUETA && !/[\p{Cc}\p{Cf}]/u.test(valor);
}

function numero(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor) && Math.abs(valor) <= MAX_VALOR;
}

function puntos(valor: unknown, min = 1): valor is Punto[] {
  return Array.isArray(valor) && valor.length >= min && valor.length <= MAX_PUNTOS &&
    valor.every(punto => Array.isArray(punto) && punto.length === 2 && etiqueta(punto[0]) && numero(punto[1])) &&
    new Set(valor.map(([nombre]) => nombre.trim())).size === valor.length;
}

export function leerVisualizacionRIA(codigo: string): VisualizacionRIA | null {
  if (codigo.length > 2000) return null;
  try {
    const v: unknown = JSON.parse(codigo);
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const { tipo, titulo, pasos, min, max, puntos: marcas, datos } = v as Record<string, unknown>;
    if (titulo !== undefined && !etiqueta(titulo)) return null;
    const solo = (...claves: string[]) => Object.keys(v).every(k => k === "tipo" || k === "titulo" || claves.includes(k));
    if (tipo === "flujo" && solo("pasos") && Array.isArray(pasos) && pasos.length >= 1 && pasos.length <= MAX_PASOS && pasos.every(etiqueta)) {
      return { tipo, titulo, pasos };
    }
    if (tipo === "recta" && solo("min", "max", "puntos") && numero(min) && numero(max) && min < max &&
      puntos(marcas) && marcas.every(([, valor]) => valor >= min && valor <= max)) {
      return { tipo, titulo, min, max, puntos: [...marcas].sort((a, b) => a[1] - b[1]) };
    }
    if ((tipo === "barras" || tipo === "linea") && solo("datos") && puntos(datos, tipo === "linea" ? 2 : 1)) {
      return { tipo, titulo, datos };
    }
  } catch {
    // El modelo puede entregar JSON inválido o truncado.
  }
  return null;
}

export function cercaVisualizacionCerrada(fragmento: string): boolean {
  const lineas = fragmento.split(/\r?\n/);
  const apertura = lineas[0].match(/^(`{3,}|~{3,})ria-viz\b/);
  if (!apertura || lineas.length < 3) return false;
  const cierre = lineas[lineas.length - 1].replace(/^[\t >]*/, "").trimEnd();
  return cierre.length >= apertura[1].length && [...cierre].every(c => c === apertura[1][0]);
}
