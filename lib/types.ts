export type Acceso = "dueno" | "admin" | "equipo" | "pendiente" | "desactivado";

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  foto: string | null;
  telefono: string | null;
  acceso: Acceso;
  oficios: string[];
}

export interface Modulo {
  id: string;
  titulo: string;
  ruta: string;
  habilitado: boolean;
}

export interface MeResponse {
  usuario: Usuario;
  modulos: Modulo[];
}

export interface ActividadEvento {
  id: string;
  cuando: string;
  actor_id: string | null;
  actor_nombre: string;
  accion: string;
  recurso: string;
  recurso_id: string | null;
  antes: unknown;
  despues: unknown;
  motivo: string | null;
}

export interface UsuariosResponse {
  usuarios: Usuario[];
}

export interface ActividadResponse {
  eventos: ActividadEvento[];
}
