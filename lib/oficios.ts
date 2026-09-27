/** Oficios de la API en minúsculas sin tildes + etiquetas lindas para la UI. */
export const OFICIOS = [
  "grabacion",
  "edicion",
  "diseno",
  "estrategia",
  "publicacion",
  "ventas",
] as const;

export type Oficio = (typeof OFICIOS)[number];

export const OFICIO_LABELS: Record<Oficio, string> = {
  grabacion: "Grabación",
  edicion: "Edición",
  diseno: "Diseño",
  estrategia: "Estrategia/Guion",
  publicacion: "Publicación",
  ventas: "Ventas",
};

export function oficioLabel(oficio: string): string {
  return (OFICIO_LABELS as Record<string, string>)[oficio] ?? oficio;
}

export const ACCESO_LABELS: Record<string, string> = {
  dueno: "Dueño",
  admin: "Admin",
  equipo: "Equipo",
  pendiente: "Pendiente",
  desactivado: "Desactivado",
};

export function accesoLabel(acceso: string): string {
  return ACCESO_LABELS[acceso] ?? acceso;
}
