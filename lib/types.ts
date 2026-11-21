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
  adjuntos?: ChatAdjunto[];
  // UI states
  enviando?: boolean;
  error?: boolean;
}

// ==========================================
// F5: equipo, adjuntos, asignaciones, Drive, piezas, cortes y push
// ==========================================

export interface EnlaceEquipo {
  id: number;
  nombre: string;
  url: string;
  orden: number;
  creado_en: string;
}

export interface ActividadEquipo {
  mensajes: number;
  tareas: number;
  miembros: number;
  archivos: number;
}

export interface ConfigEquipo {
  nombre: string;
  descripcion: string;
  enlaces: EnlaceEquipo[];
  actividad: ActividadEquipo;
  actualizado_en?: string | null;
}

export type TipoAdjunto = 'imagen' | 'video' | 'audio' | 'archivo' | 'drive';

export interface ChatAdjunto {
  id: number;
  mensaje_id?: number | null;
  autor_id: string;
  tipo: TipoAdjunto;
  nombre: string;
  mime: string;
  tamano: number;
  duracion_seg?: number | null;
  storage_path?: string | null;
  url_externa?: string | null;
  creado_en: string;
}

export interface AsignacionResumen {
  tarea: Tarea;
  novedad: boolean;
}

export interface RecientesRespuesta {
  asignaciones: AsignacionResumen[];
  nuevas: number;
}

export type EtapaPieza = 'guion' | 'grabacion' | 'edicion' | 'revision' | 'aprobada' | 'publicada';

export interface Pieza {
  id: number;
  cliente_id?: number | null;
  cliente?: Cliente | null;
  nombre: string;
  formato: string;
  etapa: EtapaPieza;
  fecha_publicacion?: string | null;
  notas?: string | null;
  drive_carpeta_url?: string | null;
  tareas?: Tarea[];
  creado_por: string;
  creado_en: string;
  actualizado_en: string;
}

export interface LineaCorte {
  perfil_id: string;
  perfil?: Perfil;
  total: number;
  tareas: number;
  pagada_en?: string | null;
  pagada_por?: string | null;
}

export interface Corte {
  id: number;
  periodo: 'quincena' | 'mes' | 'personalizado';
  desde: string;
  hasta: string;
  estado: string;
  lineas: LineaCorte[];
  total: number;
  creado_en: string;
  creado_por?: string | null;
}

export interface DriveEstado {
  configurado: boolean;
  conectado: boolean;
  correo: string;
  carpeta_raiz_id: string;
  conectado_en?: string | null;
}

export interface DriveArchivo {
  id: string;
  nombre: string;
  mime: string;
  icono?: string;
  miniatura?: string;
  enlace?: string;
  tamano?: number;
  modificado_en?: string;
  es_carpeta: boolean;
}

export interface PushEstado {
  configurado: boolean;
  suscrito: boolean;
}


export interface ErrorApi {
  error: {
    codigo: string;
    mensaje: string;
  };
}

// ==========================================
// Tipos F2 y F3: Trabajos, Clientes, Tareas, Facturas y Estadísticas
// ==========================================

export interface Cliente {
 foto_url?: string | null;
 drive_carpeta_id?: string | null;
 material_carpeta_id?: string | null;
 producto_carpeta_id?: string | null;
  id: number;
  nombre: string;
  activo: boolean;
  paquete?: string | null;
  drive_url?: string | null;
  notas?: string | null;
  creado_en: string;
}

export type UnidadTrabajo = 'trabajo' | 'minuto';

export interface TipoTrabajo {
  id: number;
  clave: string;
  nombre: string;
  rol_id: number | null;
  rol?: Rol;
  precio: number; // Pesos colombianos enteros
  unidad: UnidadTrabajo;
  activo: boolean;
  orden: number;
  creado_en: string;
}

export type EstadoTarea = 'pendiente' | 'hecha' | 'aceptada' | 'rechazada' | 'cancelada';

export interface Tarea {
  id: number;
  tipo_id: number;
  tipo?: TipoTrabajo;
  cliente_id?: number | null;
  cliente?: Cliente | null;
  pieza_id?: number | null;
  pieza?: { id: number; nombre: string; etapa: EtapaPieza } | null;
  titulo: string;
  descripcion?: string | null;
  asignado_a: string;
  asignado?: Perfil;
  creado_por: string;
  creador?: Perfil;
  estado: EstadoTarea;
  fecha_limite?: string | null;
  nota_persona?: string | null;
  enlace_medios?: string | null;
  drive_carpeta_id?: string | null;
  drive_carpeta_url?: string | null;
  motivo_rechazo?: string | null;
  cantidad?: number | null;
  cantidad_aceptada?: number | null;
  precio_unitario_congelado?: number | null;
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

// Estadísticas F3
export interface TotalesYo {
  trabajos: number;
  minutos: number;
  valor: number;
}

export interface EstadisticaTipoYo {
  tipo_id: number;
  nombre: string;
  unidad: UnidadTrabajo;
  trabajos: number;
  minutos: number;
  valor: number;
}

export interface RangoEstadisticaYo {
  desde: string | null;
  hasta: string | null;
}

export interface EstadisticasYoResponse {
  trabajos: number;
  minutos: number;
  valor: number;
  por_tipo: EstadisticaTipoYo[];
  rango: RangoEstadisticaYo;
  este_mes: TotalesYo;
  total: TotalesYo;
}

export interface TotalesAdmin {
  trabajos: number;
  minutos: number;
  valor: number;
  personas: number;
  clientes: number;
}

export interface PuntoSerieAdmin {
  fecha: string;
  trabajos: number;
  minutos: number;
  valor: number;
}

export interface ItemPersonaEstadistica {
  perfil_id: string;
  nombre: string;
  foto: string | null;
  trabajos: number;
  minutos: number;
  valor: number;
}

export interface ItemClienteEstadistica {
  cliente_id: number | null;
  nombre: string;
  trabajos: number;
  minutos: number;
  valor: number;
}

export interface ItemTipoEstadistica {
  tipo_id: number;
  nombre: string;
  unidad: UnidadTrabajo;
  trabajos: number;
  minutos: number;
  valor: number;
}

export interface AvisoNotificacion {
  id: number;
  tipo: string;
  titulo: string;
  cuerpo: string;
  url: string;
  leida_en: string | null;
  creada_en: string;
}
export interface CortePropioDatos { id: number; desde: string; hasta: string; total: number; tareas: number; pagada_en: string | null }
export interface BandejaNotificaciones { notificaciones: AvisoNotificacion[]; no_leidas: number }
export interface PreferenciasNotificaciones {
  tipos_silenciados: string[];
  silenciar_chat: boolean;
  silencio_desde: string;
  silencio_hasta: string;
}

export interface HayMasEstadisticas {
  por_persona: boolean;
  por_cliente: boolean;
  por_tipo: boolean;
}

export interface RangoEstadisticasAdmin {
  desde: string;
  hasta: string;
  agrupar: 'dia' | 'semana' | 'mes';
}

export interface EstadisticasAdminResponse {
  rango: RangoEstadisticasAdmin;
  totales: TotalesAdmin;
  serie: PuntoSerieAdmin[];
  por_persona: ItemPersonaEstadistica[];
  por_cliente: ItemClienteEstadistica[];
  por_tipo: ItemTipoEstadistica[];
  hay_mas: HayMasEstadisticas;
  este_mes?: TotalesYo;
  total?: TotalesYo;
}
