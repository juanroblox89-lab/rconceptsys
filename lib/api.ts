// lib/api.ts
import {
  Perfil,
  ChatMensaje,
  Rol,
  TipoTrabajo,
  Cliente,
  FichaClienteDatos,
  Tarea,
  ReferenciaDriveTrabajo,
  Factura,
  FacturaMiaRespuesta,
  ResumenFacturasPersona,
  AdminTareasRespuesta,
  EstadisticasYoResponse,
  EstadisticasAdminResponse,
  UnidadTrabajo,
  ConfigEquipo,
  EnlaceEquipo,
  ChatAdjunto,
  AsignacionResumen,
  RecientesRespuesta,
  Pieza,
  Corte,
  DriveEstado,
  PlanDrive,
  ResultadoMovimientoDrive,
  DriveArchivo,
  PushEstado,
  BandejaNotificaciones,
  CortePropioDatos,
  PreferenciasNotificaciones,
} from './types';

// En el navegador usamos rutas relativas con cookies httpOnly
const API_BASE = '';

export interface ApiError extends Error {
  codigo: string;
  status: number;
}

// Renovación de sesión compartida: varias peticiones que fallan a la vez hacen un solo refresco.
let refrescoEnCurso: Promise<boolean> | null = null;

async function renovarSesion(): Promise<boolean> {
  if (!refrescoEnCurso) {
    refrescoEnCurso = fetch(`${API_BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refrescoEnCurso = null;
      });
  }
  return refrescoEnCurso;
}

const RUTAS_SIN_SESION = ['/login', '/registro', '/estilo'];

// Sesión perdida de verdad: se limpian las cookies y se manda al login recordando a dónde iba.
async function irAlLogin(): Promise<never> {
  if (typeof window !== 'undefined') {
    const { pathname, search } = window.location;
    if (!RUTAS_SIN_SESION.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
      try {
        await fetch(`${API_BASE}/api/auth/salir`, { method: 'POST', credentials: 'include' });
      } catch {
        // Sin red: igual se manda al login
      }
      const destino = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
      window.location.replace(`/login${destino}`);
    }
  }
  // La página se está yendo: no se resuelve ni se rechaza para no mostrar un error por un instante.
  return new Promise<never>(() => {});
}

export async function fetchApi<T>(endpoint: string, options: RequestInit = {}, yaReintentado = false): Promise<T> {
  const headers = new Headers(options.headers || {});

  // Soporte explícito de modo demo en headers solo si NEXT_PUBLIC_RC_DEMO=1 en el cliente
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_RC_DEMO === '1') {
    const demoUser = localStorage.getItem('rc_demo_user');
    if (demoUser) {
      headers.set('X-Demo-User', demoUser);
    }
  }

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Envía y recibe cookies httpOnly automáticamente
  });

  // 401 en una ruta que no es de autenticación: se intenta renovar la sesión una vez y, si no se puede, al login.
  if (res.status === 401 && !endpoint.startsWith('/api/auth/')) {
    if (!yaReintentado && (await renovarSesion())) {
      return fetchApi<T>(endpoint, options, true);
    }
    return irAlLogin();
  }

  if (!res.ok) {
    let mensaje = 'Ha ocurrido un error inesperado.';
    let codigo = 'error_desconocido';
    try {
      const text = await res.text();
      if (text) {
        const errJson = JSON.parse(text);
        if (errJson?.error?.mensaje) {
          mensaje = errJson.error.mensaje;
          codigo = errJson.error.codigo;
        }
      }
    } catch {
      // Ignorar fallo de parsing
    }
    const err = new Error(mensaje) as ApiError;
    err.codigo = codigo;
    err.status = res.status;
    throw err;
  }

  const text = await res.text();
  if (!text || text.trim() === '') {
    return {} as T;
  }
  return JSON.parse(text);
}

// Endpoints
export const api = {
  // Auth Real
  registro: (nombre: string, correo: string, contrasena: string, confirmar: string, celular: { indicativo: string; numero: string }) =>
    fetchApi<Perfil>('/api/auth/registro', {
      method: 'POST',
      body: JSON.stringify({ nombre, correo, contrasena, confirmar, ...celular }),
    }),
  login: (correo: string, contrasena: string) =>
    fetchApi<{ perfil: Perfil; access_token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ correo, contrasena }),
    }),
  salir: () =>
    fetchApi<{ mensaje: string }>('/api/auth/salir', {
      method: 'POST',
    }),
  refresh: () =>
    fetchApi<{ access_token: string; expires_in: number }>('/api/auth/refresh', {
      method: 'POST',
    }),

  // Yo
  getYo: () => fetchApi<Perfil>('/api/yo'),
  patchYo: (nombre: string) =>
    fetchApi<Perfil>('/api/yo', {
      method: 'PATCH',
      body: JSON.stringify({ nombre }),
    }),
  subirFoto: (formData: FormData) =>
    fetchApi<Perfil>('/api/yo/foto', {
      method: 'POST',
      body: formData,
    }),

  // Equipo
  getEquipo: () => fetchApi<Perfil[]>('/api/equipo'),
  getMiembro: (id: string) => fetchApi<Perfil>(`/api/equipo/${id}`),

  // Chat
  getChat: (antes?: number, despues?: number, limite?: number) => {
    const q = new URLSearchParams();
    if (antes && antes > 0) q.set('antes', antes.toString());
    if (despues && despues > 0) q.set('despues', despues.toString());
    if (limite && limite > 0) q.set('limite', limite.toString());
    return fetchApi<ChatMensaje[]>(`/api/chat?${q.toString()}`);
  },
  postChat: (cuerpo: string, adjuntos?: number[]) =>
    fetchApi<ChatMensaje>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ cuerpo, adjuntos: adjuntos ?? [] }),
    }),
  postChatAdjunto: (archivo: File, duracionSeg?: number) => {
    const fd = new FormData();
    fd.append('archivo', archivo);
    if (duracionSeg && duracionSeg > 0) fd.append('duracion_seg', String(Math.round(duracionSeg)));
    return fetchApi<ChatAdjunto>('/api/chat/adjuntos', { method: 'POST', body: fd });
  },
  postChatAdjuntoDrive: (nombre: string, url: string) =>
    fetchApi<ChatAdjunto>('/api/chat/adjuntos', {
      method: 'POST',
      body: JSON.stringify({ nombre, url }),
    }),
  urlAdjunto: (id: number) => `/api/chat/adjuntos/${id}/archivo`,

  // F5: barra derecha "Equipo"
  getEquipoResumen: () => fetchApi<ConfigEquipo>('/api/equipo/resumen'),
  adminPatchEquipo: (campos: { nombre?: string; descripcion?: string }) =>
    fetchApi<ConfigEquipo>('/api/admin/equipo', {
      method: 'PATCH',
      body: JSON.stringify(campos),
    }),
  adminPostEnlaceEquipo: (nombre: string, url: string) =>
    fetchApi<EnlaceEquipo>('/api/admin/equipo/enlaces', {
      method: 'POST',
      body: JSON.stringify({ nombre, url }),
    }),
  adminPatchEnlaceEquipo: (id: number, campos: { nombre?: string; url?: string; orden?: number }) =>
    fetchApi<EnlaceEquipo>(`/api/admin/equipo/enlaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(campos),
    }),
  adminDeleteEnlaceEquipo: (id: number) =>
    fetchApi<{ mensaje: string }>(`/api/admin/equipo/enlaces/${id}`, { method: 'DELETE' }),

  // F5: Recientes y Asignaciones (admin)
  adminGetRecientes: () => fetchApi<RecientesRespuesta>('/api/admin/asignaciones/recientes'),
  adminGetAsignaciones: (filtros?: { persona?: string; estado?: string; desde?: string; hasta?: string }) => {
    const q = new URLSearchParams();
    if (filtros?.persona) q.set('persona', filtros.persona);
    if (filtros?.estado) q.set('estado', filtros.estado);
    if (filtros?.desde) q.set('desde', filtros.desde);
    if (filtros?.hasta) q.set('hasta', filtros.hasta);
    return fetchApi<{ asignaciones: AsignacionResumen[] }>(`/api/admin/asignaciones?${q.toString()}`);
  },
  adminPostAsignacionesVistas: (ids: number[]) =>
    fetchApi<{ mensaje: string }>('/api/admin/asignaciones/vistas', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  // F5: piezas
  adminGetPiezas: (filtros?: { cliente?: number; etapa?: string }) => {
    const q = new URLSearchParams();
    if (filtros?.cliente) q.set('cliente', String(filtros.cliente));
    if (filtros?.etapa) q.set('etapa', filtros.etapa);
    return fetchApi<Pieza[]>(`/api/admin/piezas?${q.toString()}`);
  },
  adminPostPieza: (pieza: { nombre: string; cliente_id?: number | null; formato?: string; etapa?: string }) =>
    fetchApi<Pieza>('/api/admin/piezas', {
      method: 'POST',
      body: JSON.stringify(pieza),
    }),
  adminPatchPieza: (
    id: number,
    campos: Partial<{
      nombre: string;
      etapa: string;
      formato: string;
      fecha_publicacion: string | null;
      notas: string | null;
      cliente_id: number | null;
      drive_carpeta_url: string | null;
    }>,
  ) =>
    fetchApi<Pieza>(`/api/admin/piezas/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(campos),
    }),

  // F5: cortes de pago
  adminGetCortes: () => fetchApi<Corte[]>('/api/admin/cortes'),
  adminPostCorte: (datos: { periodo?: 'quincena' | 'mes'; desde?: string; hasta?: string }) =>
    fetchApi<Corte>('/api/admin/cortes', {
      method: 'POST',
      body: JSON.stringify(datos),
    }),
  adminGetCorte: (id: number) => fetchApi<Corte>(`/api/admin/cortes/${id}`),
  adminPagarCorteLinea: (corteId: number, perfilId: string) =>
    fetchApi<Corte>(`/api/admin/cortes/${corteId}/lineas/${perfilId}/pagar`, { method: 'POST' }),
  urlCorteCSV: (id: number) => `/api/admin/cortes/${id}/csv`,
  urlCortePDF: (id: number) => `/api/admin/cortes/${id}/pdf`,

  // F5: conector de Google Drive
  adminGetDrive: () => fetchApi<DriveEstado>('/api/admin/drive'),
  adminConectarDrive: () => fetchApi<{ url: string }>('/api/admin/drive/conectar', { method: 'POST' }),
  adminDesconectarDrive: () =>
    fetchApi<{ mensaje: string }>('/api/admin/drive/desconectar', { method: 'POST' }),
  adminOrganizarDrive: () => fetchApi<{ clientes_listos: number; clientes_pendientes: number[] }>('/api/admin/drive/organizar', { method: 'POST', body: '{}' }),
  adminSimularMovimientosDrive: () => fetchApi<PlanDrive>('/api/admin/drive/migrar-carpetas', { method: 'POST', body: '{}' }),
  adminMoverCarpetasDrive: (huella: string) => fetchApi<ResultadoMovimientoDrive>('/api/admin/drive/migrar-carpetas', { method: 'POST', body: JSON.stringify({ huella }) }),
  adminGetDriveArchivos: (filtros?: { carpeta?: string; buscar?: string }) => {
    const q = new URLSearchParams();
    if (filtros?.carpeta) q.set('carpeta', filtros.carpeta);
    if (filtros?.buscar) q.set('buscar', filtros.buscar);
    return fetchApi<DriveArchivo[]>(`/api/admin/drive/archivos?${q.toString()}`);
  },
  adminPostTareaDriveCarpeta: (tareaId: number, datos: { crear?: boolean; carpeta_id?: string; enlace?: string }) =>
    fetchApi<Tarea>(`/api/admin/tareas/${tareaId}/drive-carpeta`, {
      method: 'POST',
      body: JSON.stringify(datos),
    }),

  getCortePropio: (id: number) => fetchApi<CortePropioDatos>(`/api/cortes/${id}/mio`),
  getNotificaciones: () => fetchApi<BandejaNotificaciones>('/api/notificaciones'),
  leerNotificaciones: (id?: number) => fetchApi<{ mensaje: string }>(id ? `/api/notificaciones/${id}/leida` : '/api/notificaciones/leidas', { method: 'POST' }),
  getPreferenciasNotificaciones: () => fetchApi<PreferenciasNotificaciones>('/api/notificaciones/preferencias'),
  guardarPreferenciasNotificaciones: (datos: PreferenciasNotificaciones) => fetchApi<PreferenciasNotificaciones>('/api/notificaciones/preferencias', { method: 'PUT', body: JSON.stringify(datos) }),

  // F5: avisos push
  getPushClave: () => fetchApi<{ configurado: boolean; clave: string }>('/api/push/clave'),
  getPushEstado: () => fetchApi<PushEstado>('/api/push/estado'),
  postPushSuscribir: (s: { endpoint: string; p256dh: string; auth: string }) =>
    fetchApi<{ id: number }>('/api/push/suscribir', {
      method: 'POST',
      body: JSON.stringify(s),
    }),
  deletePushSuscribir: (endpoint: string) =>
    fetchApi<{ mensaje: string }>('/api/push/suscribir', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    }),

  // Admin
  adminGetMiembros: (estado?: string) => {
    const q = new URLSearchParams();
    if (estado) q.set('estado', estado);
    return fetchApi<Perfil[]>(`/api/admin/miembros?${q.toString()}`);
  },
  adminAprobar: (id: string) =>
    fetchApi<Perfil>(`/api/admin/miembros/${id}/aprobar`, { method: 'POST' }),
  adminSuspender: (id: string) =>
    fetchApi<Perfil>(`/api/admin/miembros/${id}/suspender`, { method: 'POST' }),
  adminReactivar: (id: string) =>
    fetchApi<Perfil>(`/api/admin/miembros/${id}/reactivar`, { method: 'POST' }),
  adminSetRoles: (id: string, roles: number[]) =>
    fetchApi<Perfil>(`/api/admin/miembros/${id}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ roles }),
    }),
  adminSetAdmin: (id: string, es_admin: boolean) =>
    fetchApi<Perfil>(`/api/admin/miembros/${id}/admin`, {
      method: 'PUT',
      body: JSON.stringify({ es_admin }),
    }),
  adminGetRoles: () => fetchApi<Rol[]>('/api/admin/roles'),
  adminPostRol: (rol: Partial<Rol>) =>
    fetchApi<Rol>('/api/admin/roles', {
      method: 'POST',
      body: JSON.stringify(rol),
    }),
  adminPatchRol: (id: number, campos: Partial<Rol>) =>
    fetchApi<Rol>(`/api/admin/roles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(campos),
    }),

  // F2 y F3: Trabajos, Tareas y Facturas (Miembro)
  getTrabajos: () => fetchApi<TipoTrabajo[]>('/api/trabajos'),
  getClientes: () => fetchApi<Cliente[]>('/api/clientes'),
  getYoEstadisticas: (desde?: string, hasta?: string) => {
    const q = new URLSearchParams();
    if (desde) q.set('desde', desde);
    if (hasta) q.set('hasta', hasta);
    const qs = q.toString();
    return fetchApi<EstadisticasYoResponse>(`/api/yo/estadisticas${qs ? `?${qs}` : ''}`);
  },
  getTareas: (estado?: string) => {
    const q = new URLSearchParams();
    if (estado) q.set('estado', estado);
    return fetchApi<Tarea[]>(`/api/tareas?${q.toString()}`);
  },
  postTareaHecha: (id: number, nota?: string, cantidad?: number, enlaceMedios?: string) =>
    fetchApi<Tarea>(`/api/tareas/${id}/hecha`, {
      method: 'POST',
      body: JSON.stringify({ nota, cantidad, enlace_medios: enlaceMedios }),
    }),
  getFacturaMia: () => fetchApi<FacturaMiaRespuesta>('/api/facturas/mia'),

  // F2 y F3: Solo Admin (Gestión de Trabajos, Clientes, Tareas, Facturas y Estadísticas)
  adminGetTrabajos: () => fetchApi<TipoTrabajo[]>('/api/admin/trabajos'),
  adminPostTrabajo: (trabajo: {
    clave: string;
    nombre: string;
    rol_id?: number | null;
    precio?: number;
    unidad?: UnidadTrabajo;
    activo?: boolean;
    orden?: number;
  }) =>
    fetchApi<TipoTrabajo>('/api/admin/trabajos', {
      method: 'POST',
      body: JSON.stringify(trabajo),
    }),
  adminPatchTrabajo: (id: number, campos: Partial<TipoTrabajo>) =>
    fetchApi<TipoTrabajo>(`/api/admin/trabajos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(campos),
    }),

  getFichaCliente: (id: number) => fetchApi<FichaClienteDatos>(`/api/clientes/${id}`),
  adminSubirFotoCliente: (id: number, foto: File) => {
    const form = new FormData();
    form.append('foto', foto);
    return fetchApi<Cliente>(`/api/admin/clientes/${id}/foto`, { method: 'POST', body: form });
  },
  adminGetDrivePickerToken: (id?: number) => fetchApi<{ access_token: string; expires_in: number; carpeta_id: string; clave: string; proyecto_id: string }>(
    `/api/admin/drive/picker-token${id === undefined ? '' : `?cliente_id=${id}`}`, { cache: 'no-store' }),
  adminGetClientes: () => fetchApi<Cliente[]>('/api/admin/clientes'),
  adminPostCliente: (nombre: string) =>
    fetchApi<Cliente>('/api/admin/clientes', {
      method: 'POST',
      body: JSON.stringify({ nombre }),
    }),
  adminPatchCliente: (id: number, campos: Partial<Omit<Cliente, 'drive_referencias'>> & { drive_referencias?: string[] }) =>
    fetchApi<Cliente>(`/api/admin/clientes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(campos),
    }),

  adminGetTarea: (id: number) => fetchApi<Tarea>(`/api/admin/tareas/${id}`),
  adminGetTareas: (filtros?: { estado?: string; persona?: string }) => {
    const q = new URLSearchParams();
    if (filtros?.estado) q.set('estado', filtros.estado);
    if (filtros?.persona) q.set('persona', filtros.persona);
    return fetchApi<AdminTareasRespuesta>(`/api/admin/tareas?${q.toString()}`);
  },
  adminPostTarea: (tarea: {
    tipo_id: number;
    cliente_id?: number | null;
    pieza_id?: number | null;
    asignado_a: string;
    titulo: string;
    descripcion?: string;
    fecha_limite?: string;
    forzar?: boolean;
 drive_carpeta_id?: string;
 drive_crear?: string;
    drive_referencias?: ReferenciaDriveTrabajo[];
  }) =>
    fetchApi<Tarea>('/api/admin/tareas', {
      method: 'POST',
      body: JSON.stringify(tarea),
    }),
  adminPatchTarea: (id: number, campos: Partial<{ tipo_id: number; asignado_a: string; descripcion: string; fecha_limite: string; drive_carpeta_id: string; drive_crear: string; drive_referencias: ReferenciaDriveTrabajo[]; forzar: boolean }>) => fetchApi<Tarea>(`/api/admin/tareas/${id}`, { method: 'PATCH', body: JSON.stringify(campos) }),
 adminClienteDrive: (id: number, datos: {crear?: boolean; carpeta_id?: string}) => fetchApi<Cliente>(`/api/admin/clientes/${id}/drive`, {method: 'POST',body:JSON.stringify(datos)}),
 adminAceptarTarea: (id: number, cantidad?: number) =>
    fetchApi<Tarea>(`/api/admin/tareas/${id}/aceptar`, {
      method: 'POST',
      body: JSON.stringify({ cantidad }),
    }),
  adminRechazarTarea: (id: number, motivo: string) =>
    fetchApi<Tarea>(`/api/admin/tareas/${id}/rechazar`, {
      method: 'POST',
      body: JSON.stringify({ motivo }),
    }),
  adminCancelarTarea: (id: number) =>
    fetchApi<Tarea>(`/api/admin/tareas/${id}/cancelar`, { method: 'POST' }),

  adminGetFacturas: () => fetchApi<ResumenFacturasPersona[]>('/api/admin/facturas'),
  adminGetFactura: (id: number) => fetchApi<Factura>(`/api/admin/facturas/${id}`),
  adminPagarFactura: (id: number) =>
    fetchApi<Factura>(`/api/admin/facturas/${id}/pagar`, { method: 'POST' }),

  adminGetEstadisticas: (filtros?: {
    desde?: string;
    hasta?: string;
    agrupar?: string;
    persona_id?: string;
    cliente_id?: string;
    tipo_id?: number;
  }) => {
    const q = new URLSearchParams();
    if (filtros?.desde) q.set('desde', filtros.desde);
    if (filtros?.hasta) q.set('hasta', filtros.hasta);
    if (filtros?.agrupar) q.set('agrupar', filtros.agrupar);
    if (filtros?.persona_id) q.set('persona_id', filtros.persona_id);
    if (filtros?.cliente_id) q.set('cliente_id', filtros.cliente_id);
    if (filtros?.tipo_id) q.set('tipo_id', filtros.tipo_id.toString());
    const qs = q.toString();
    return fetchApi<EstadisticasAdminResponse>(`/api/admin/estadisticas${qs ? `?${qs}` : ''}`);
  },
};
