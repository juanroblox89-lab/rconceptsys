import type { Perfil } from "./types";

export type RutaRIA = {
  href: string;
  descripcion: string;
  alias?: string[];
  adminOnly?: boolean;
  workerOnly?: boolean;
};

const rutas: RutaRIA[] = [
  { href: "/tareas", descripcion: "Consulta, entrega o revisa tareas." },
  { href: "/factura", descripcion: "Consulta tus cortes y pagos.", workerOnly: true },
  { href: "/configuracion", descripcion: "Administra tus avisos y ajustes." },
  { href: "/perfil", descripcion: "Edita tu nombre, foto y celular." },
  { href: "/personalizacion", descripcion: "Cambia el tema, los colores y el fondo." },
  { href: "/asignaciones", alias: ["/trabajos"], descripcion: "Consulta los trabajos asignados.", adminOnly: true },
  { href: "/trabajos/nuevo", descripcion: "Asigna un trabajo al equipo.", adminOnly: true },
  { href: "/clientes", descripcion: "Consulta el directorio de clientes." },
  { href: "/clientes/nuevo", descripcion: "Crea la ficha de un cliente.", adminOnly: true },
  { href: "/admin", alias: ["/gestion"], descripcion: "Abre Gestión: equipo, Drive y cortes.", adminOnly: true },
  { href: "/equipo", descripcion: "Consulta el directorio del equipo." },
  { href: "/", descripcion: "Abre el chat del equipo." },
];

export function rutaVisible(ruta: Pick<RutaRIA, "adminOnly" | "workerOnly">, perfil: Perfil | null | undefined) {
  return (!ruta.adminOnly || perfil?.es_admin === true) && (!ruta.workerOnly || perfil?.es_admin === false);
}

export function rutasVisiblesRIA(perfil: Perfil | null | undefined) {
  return perfil?.estado === "aprobado" ? rutas.filter(ruta => rutaVisible(ruta, perfil)) : [];
}

export function buscarRutasRIA(visibles: RutaRIA[], consulta: string) {
  const buscar = consulta.toLowerCase();
  return visibles.filter(ruta => [ruta.href, ...(ruta.alias ?? [])].some(ruta => ruta.startsWith(buscar)));
}

export function destinoRIA(visibles: RutaRIA[], ruta: string) {
  const destino = visibles.find(item => item.href === ruta || item.alias?.includes(ruta))?.href;
  if (destino) return destino;
  if (visibles.some(item => item.href === "/clientes") && /^\/clientes\/\d+$/.test(ruta)) return ruta;
  if (visibles.some(item => item.href === "/clientes/nuevo") && /^\/clientes\/\d+\/editar$/.test(ruta)) return ruta;
  if (visibles.some(item => item.href === "/tareas") && /^\/trabajos\/\d+$/.test(ruta)) return ruta; // el endpoint autoriza el trabajo individual
  if (visibles.some(item => item.href === "/equipo") && /^\/equipo\/[0-9a-f-]{36}$/i.test(ruta)) return ruta;
  return undefined;
}
