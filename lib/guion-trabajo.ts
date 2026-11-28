export const MAX_CARACTERES_GUION = 20_000;

/** La misma propiedad White_Space que usa strings.TrimSpace en Go. */
export function normalizarGuion(guion?: string | null): string {
  return (guion ?? "").replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "");
}

export function medirGuion(texto: string): number {
  // Contar puntos de código, no unidades UTF-16 ni grafemas.
  return [...texto].length;
}

/** Omite el campo sin cambio; una cadena vacía sí elimina el guion guardado. */
export function cambiosDeGuion(guion: string, anterior?: string | null): { guion?: string } {
  const texto = normalizarGuion(guion);
  return texto === normalizarGuion(anterior) ? {} : { guion: texto };
}

export function previsualizarGuion(guion: string): string {
  const comienzo = guion.split(/\r\n|\n|\r/, 7);
  const lineas = comienzo.slice(0, 6).join("\n");
  const puntos = [...lineas];
  if (comienzo.length <= 6 && puntos.length <= 320) return guion;
  return `${puntos.slice(0, 320).join("").trimEnd()}…`;
}
