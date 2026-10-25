// lib/types.ts
export type EstadoPerfil = 'pendiente' | 'aprobado' | 'suspendido';

export interface Rol {
  id: number;
  clave: string;
  nombre: string;
  color: string;
  orden: number;
  activo: boolean;
}

export interface Perfil {
  id: string;
  correo: string;
  nombre: string;
  foto_path: string | null;
  estado: EstadoPerfil;
  es_admin: boolean;
  creado_en: string;
  roles?: Rol[];
}

export interface ChatMensaje {
  id: number;
  autor_id: string;
  cuerpo: string;
  creado_en: string;
  editado_en?: string | null;
  borrado_en?: string | null;
  autor?: Perfil;
  // UI states
  enviando?: boolean;
  error?: boolean;
}

export interface ErrorApi {
  error: {
    codigo: string;
    mensaje: string;
  };
}
