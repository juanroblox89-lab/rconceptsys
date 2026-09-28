/** Re-exports F1 para las vistas + getUsuarios tolerante (equipo → []) + mensaje 409. */
export {
  archivarCliente,
  crearCliente,
  crearPieza,
  cancelarPieza,
  entregarTarea,
  empezarTarea,
  devolverTarea,
  aprobarTarea,
  reasignarTarea,
  getCliente,
  getClientes,
  getEventosTarea,
  getNotifs,
  getPieza,
  getPiezas,
  getTarea,
  getTareas,
  leerNotif,
  contarNoLeidas,
  mensajeConflicto,
  patchCliente,
  patchPieza,
} from "./f1api";

import { getUsuarios } from "./api";
import type { Usuario } from "./types";

/** Lista de personas para filtros/asignación: equipo sin permiso → []. */
export async function getUsuariosF1(): Promise<Usuario[]> {
  try {
    return await getUsuarios();
  } catch {
    return [];
  }
}
