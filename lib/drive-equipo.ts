// lib/drive-equipo.ts
// Configuración compartida de la cuenta del equipo para Google Drive.

export const CUENTA_EQUIPO_DRIVE_DEFECTO = "ladlejuan26@gmail.com";

// Constante única en frontend (configurable por NEXT_PUBLIC_DRIVE_CUENTA_EQUIPO o por backend en /api/admin/drive).
export const CUENTA_EQUIPO_DRIVE =
  (process.env.NEXT_PUBLIC_DRIVE_CUENTA_EQUIPO ?? "").trim() || CUENTA_EQUIPO_DRIVE_DEFECTO;

export function normalizarCorreoDrive(correo?: string | null): string {
  return (correo ?? "").trim().toLowerCase();
}

export function cuentaEquipoEsperada(cuentaBackend?: string | null): string {
  const desdeBackend = (cuentaBackend ?? "").trim();
  return desdeBackend || CUENTA_EQUIPO_DRIVE;
}

export function esCuentaEquipoDrive(correo?: string | null, cuentaBackend?: string | null): boolean {
  const actual = normalizarCorreoDrive(correo);
  if (!actual) return true;
  return actual === normalizarCorreoDrive(cuentaEquipoEsperada(cuentaBackend));
}

export function normalizarUrlEnlace(raw: string): string {
  const limpio = raw.trim();
  try {
    const u = new URL(limpio);
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase();
    return u.toString().replace(/\/+$/, "");
  } catch {
    return limpio.replace(/\/+$/, "");
  }
}

export function esUrlHttpsValida(raw: string): boolean {
  const limpio = raw.trim();
  if (limpio.length < 8 || limpio.length > 500) return false;
  try {
    const u = new URL(limpio);
    return u.protocol === "https:" && Boolean(u.hostname) && !u.username && !u.password;
  } catch {
    return false;
  }
}

export function truncarNombreEnlace(nombre: string, max = 40): string {
  const limpio = nombre.trim();
  const runas = Array.from(limpio);
  if (runas.length <= max) return limpio;
  return runas.slice(0, max).join("").trim();
}
