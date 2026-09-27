import type { MeResponse, Modulo } from "./types";

/**
 * Fusión de módulos F1 en el /me de F0.
 * El backend F0 no conoce "mis-tareas" ni "revision" y deja
 * produccion/clientes deshabilitados: el frontend los habilita según
 * acceso hasta que el backend F1 responda (si el backend ya trae
 * mis-tareas/revision, se confía en él y no se toca nada).
 */
export function withF1Modulos(me: MeResponse): MeResponse {
  const mods = me.modulos.map((m) => ({ ...m }));
  if (mods.some((m) => m.id === "mis-tareas" || m.id === "revision")) return me;
  const acceso = me.usuario.acceso;
  const admin = acceso === "dueno" || acceso === "admin";
  const equipo = acceso === "equipo";
  const enable = (id: string) => {
    const i = mods.findIndex((m) => m.id === id);
    if (i >= 0) mods[i] = { ...mods[i], habilitado: true };
  };
  if (admin) {
    enable("produccion");
    enable("clientes");
  }
  if (equipo) enable("clientes");
  const extras: Modulo[] = [];
  if (admin || (equipo && me.usuario.oficios.length > 0)) {
    extras.push({ id: "mis-tareas", titulo: "Mis tareas", ruta: "/mis-tareas", habilitado: true });
  }
  if (admin) {
    extras.push({ id: "revision", titulo: "Revisión", ruta: "/revision", habilitado: true });
  }
  for (const e of extras) {
    if (mods.some((m) => m.id === e.id)) continue;
    // Orden: mis-tareas y revisión van justo después de producción.
    const anchor = mods.findIndex((m) => m.id === "cobros");
    if (anchor >= 0) mods.splice(anchor, 0, e);
    else mods.push(e);
  }
  return { ...me, modulos: mods };
}
