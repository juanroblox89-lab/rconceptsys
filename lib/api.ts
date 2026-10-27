// lib/api.ts
import {
  Perfil,
  ChatMensaje,
  Rol,
  TipoTrabajo,
  Cliente,
  Tarea,
  Factura,
  FacturaMiaRespuesta,
  ResumenFacturasPersona,
  AdminTareasRespuesta,
  EstadisticasYoResponse,
  EstadisticasAdminResponse,
  UnidadTrabajo,
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
  registro: (nombre: string, correo: string, contrasena: string, confirmar: string) =>
    fetchApi<Perfil>('/api/auth/registro', {
      method: 'POST',
      body: JSON.stringify({ nombre, correo, contrasena, confirmar }),
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
  postChat: (cuerpo: string) =>
    fetchApi<ChatMensaje>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ cuerpo }),
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
  postTareaHecha: (id: number, nota?: string, cantidad?: number) =>
    fetchApi<Tarea>(`/api/tareas/${id}/hecha`, {
      method: 'POST',
      body: JSON.stringify({ nota, cantidad }),
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

  adminGetClientes: () => fetchApi<Cliente[]>('/api/admin/clientes'),
  adminPostCliente: (nombre: string) =>
    fetchApi<Cliente>('/api/admin/clientes', {
      method: 'POST',
      body: JSON.stringify({ nombre }),
    }),
  adminPatchCliente: (id: number, campos: Partial<Cliente>) =>
    fetchApi<Cliente>(`/api/admin/clientes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(campos),
    }),

  adminGetTareas: (filtros?: { estado?: string; persona?: string }) => {
    const q = new URLSearchParams();
    if (filtros?.estado) q.set('estado', filtros.estado);
    if (filtros?.persona) q.set('persona', filtros.persona);
    return fetchApi<AdminTareasRespuesta>(`/api/admin/tareas?${q.toString()}`);
  },
  adminPostTarea: (tarea: {
    tipo_id: number;
    cliente_id?: number | null;
    asignado_a: string;
    titulo: string;
    descripcion?: string;
    fecha_limite?: string;
    forzar?: boolean;
  }) =>
    fetchApi<Tarea>('/api/admin/tareas', {
      method: 'POST',
      body: JSON.stringify(tarea),
    }),
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
