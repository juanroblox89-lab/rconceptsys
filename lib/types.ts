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

// ==========================================
// Tipos F2: Trabajos, Tareas y Facturas
// ==========================================

export interface TipoTrabajo {
  id: number;
  clave: string;
  nombre: string;
  rol_id: number | null;
  rol?: Rol;
  precio: number; // Pesos colombianos enteros
  activo: boolean;
  orden: number;
  creado_en: string;
}

export type EstadoTarea = 'pendiente' | 'hecha' | 'aceptada' | 'rechazada' | 'cancelada';

export interface Tarea {
  id: number;
  tipo_id: number;
  tipo?: TipoTrabajo;
  titulo: string;
  descripcion?: string | null;
  asignado_a: string;
  asignado?: Perfil;
  creado_por: string;
  creador?: Perfil;
  estado: EstadoTarea;
  fecha_limite?: string | null;
  nota_persona?: string | null;
  motivo_rechazo?: string | null;
  precio_congelado?: number | null;
  factura_id?: number | null;
  creada_en: string;
  hecha_en?: string | null;
  resuelta_en?: string | null;
  resuelta_por?: string | null;
}

export type EstadoFactura = 'abierta' | 'pagada';

export interface Factura {
  id: number;
  perfil_id: string;
  perfil?: Perfil;
  estado: EstadoFactura;
  creada_en: string;
  pagada_en?: string | null;
  pagada_por?: string | null;
  lineas?: Tarea[];
  total: number;
}

export interface FacturaMiaRespuesta {
  abierta: Factura | null;
  total_pendiente: number;
  pagadas: Factura[];
  total_pagado: number;
}

export interface ResumenFacturasPersona {
  perfil_id: string;
  perfil: Perfil;
  factura_abierta?: Factura | null;
  total_pendiente: number;
  pagadas: Factura[];
  total_pagado: number;
}

export interface AdminTareasRespuesta {
  tareas: Tarea[];
  por_revisar: number;
}
