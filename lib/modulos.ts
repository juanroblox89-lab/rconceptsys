/** Módulo → fase donde llega (para el vacío honesto). */
const FASE_DE: Record<string, string> = {
  produccion: "F1",
  cobros: "F2",
  clientes: "F1",
  ventas: "F4",
  biblioteca: "F3",
};

export function faseDe(moduloId: string): string {
  return FASE_DE[moduloId] ?? "F1";
}
