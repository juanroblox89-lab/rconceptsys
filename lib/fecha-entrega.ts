const zona = "America/Bogota";
export function diaBogota(ahora = new Date()): string {
  const p = new Intl.DateTimeFormat("es-CO", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ahora);
  return ["year", "month", "day"].map((k) => p.find((a) => a.type === k)?.value).join("-");
}
export function fechaEntrega(fecha: string | null | undefined, hoy: string) {
  if (!fecha) return null;
  const f = new Date(`${fecha}T00:00:00Z`);
  const diferencia = (f.getTime() - new Date(`${hoy}T00:00:00Z`).getTime()) / 86400000;
  if (!Number.isFinite(diferencia)) return null;
  // La fecha completa ya va debajo (absoluta): la frase relativa no la repite.
  const dias = Math.abs(diferencia);
  const unidad = dias === 1 ? "día" : "días";
  const relativa = diferencia === 0 ? "Hoy" : diferencia === 1 ? "Mañana" : diferencia === 2 ? "Pasado mañana" : diferencia < 0 ? `Venció hace ${dias} ${unidad}` : `En ${dias} días`;
  return { relativa, urgente: diferencia <= 0, absoluta: f.toLocaleDateString("es-CO", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) };
}
