/** Fechas del front (única utilidad, BRIEF pulido 1 §3).
 * Español Colombia, zona America/Bogota. Solo UI: no toca contratos.
 * - `fmtFecha("2026-10-03")` → "vie 3 oct"
 * - `fmtFechaHora("2026-09-27T15:36:57.160Z")` → "27 sep, 10:36 a. m."
 * - `fmtRelativa(...)` → "hoy" / "mañana" / "hace 2 h" cuando ayuda.
 */

const ZONA = "America/Bogota";

function parse(iso: string | null | undefined): Date | null {
  if (iso === null || iso === undefined || iso === "") return null;
  try {
    const d =
      iso.length <= 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

function diaBogota(d: Date): string {
  // YYYY-MM-DD en Bogota para comparar días.
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONA,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(d);
  } catch {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
}

function hoyBogota(): string {
  return diaBogota(new Date());
}

/** Fecha corta tipo "vie 3 oct" (con año solo si no es el actual). */
export function fmtFecha(iso: string | null | undefined): string {
  const d = parse(iso);
  if (d === null) return "—";
  try {
    const parts = new Intl.DateTimeFormat("es-CO", {
      timeZone: ZONA,
      weekday: "short",
      day: "numeric",
      month: "short",
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const wd = get("weekday").replace(/\./g, "").toLowerCase();
    const day = get("day");
    const mon = get("month").replace(/\./g, "").replace(/^sept$/i, "sep").toLowerCase();
    const limpio = `${wd} ${day} ${mon}`.trim();
    const anioBogota = new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONA,
      year: "numeric",
    }).format(d);
    const anioHoy = new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONA,
      year: "numeric",
    }).format(new Date());
    return anioBogota === anioHoy ? limpio : `${limpio} ${anioBogota}`;
  } catch {
    return iso ?? "—";
  }
}

/** Fecha + hora tipo "27 sep, 10:36 a. m." */
export function fmtFechaHora(iso: string | null | undefined): string {
  const d = parse(iso);
  if (d === null) return "—";
  try {
    const parts = new Intl.DateTimeFormat("es-CO", {
      timeZone: ZONA,
      day: "numeric",
      month: "short",
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const day = get("day");
    const mon = get("month").replace(/\./g, "").replace(/^sept$/i, "sep").toLowerCase();
    const fecha = `${day} ${mon}`.trim();
    const hora = new Intl.DateTimeFormat("es-CO", {
      timeZone: ZONA,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
    return `${fecha}, ${hora}`;
  } catch {
    return iso ?? "—";
  }
}

/** Relativa corta en Bogota: "hoy", "mañana", "ayer", "hace 2 h", o fmtFecha. */
export function fmtRelativa(iso: string | null | undefined): string {
  const d = parse(iso);
  if (d === null) return "—";
  const dia = diaBogota(d);
  const hoy = hoyBogota();
  if (dia === hoy) {
    const diffMs = Date.now() - d.getTime();
    if (diffMs >= 0 && diffMs < 60 * 1000) return "ahora mismo";
    if (diffMs >= 0 && diffMs < 60 * 60 * 1000) {
      const min = Math.max(1, Math.floor(diffMs / 60000));
      return `hace ${min} min`;
    }
    if (diffMs >= 0 && diffMs < 24 * 60 * 60 * 1000) {
      const h = Math.floor(diffMs / 3600000);
      if (h >= 1) return `hace ${h} h`;
    }
    return "hoy";
  }
  try {
    const manana = diaBogota(new Date(Date.now() + 24 * 3600 * 1000));
    const ayer = diaBogota(new Date(Date.now() - 24 * 3600 * 1000));
    if (dia === manana) return "mañana";
    if (dia === ayer) return "ayer";
  } catch {
    // Sin relativa: cae a fecha.
  }
  return fmtFecha(iso);
}

/** Compat: antes DD/MM/AAAA numérico; ahora delega a fmtFecha. */
export function fmtFechaCorta(iso: string | null | undefined): string {
  return fmtFecha(iso);
}

/** Etiqueta de periodo YYYY-MM tipo "sep 2026". */
export function fmtPeriodo(periodo: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo);
  if (m === null) return periodo;
  const meses = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return periodo;
  return `${meses[idx]} ${m[1]}`;
}
