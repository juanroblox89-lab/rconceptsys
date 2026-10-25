// lib/api.ts
import { Perfil, ChatMensaje, Rol } from './types';

// En el navegador usamos rutas relativas con cookies httpOnly
const API_BASE = '';

export interface ApiError extends Error {
  codigo: string;
  status: number;
}

export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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

  if (!res.ok) {
    let mensaje = 'Ha ocurrido un error inesperado.';
    let codigo = 'error_desconocido';
    try {
      const errJson = await res.json();
      if (errJson?.error?.mensaje) {
        mensaje = errJson.error.mensaje;
        codigo = errJson.error.codigo;
      }
    } catch {
      // Ignorar fallo de parsing
    }
    const err = new Error(mensaje) as ApiError;
    err.codigo = codigo;
    err.status = res.status;
    throw err;
  }

  return res.json();
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
    if (antes) q.set('antes', antes.toString());
    if (despues) q.set('despues', despues.toString());
    if (limite) q.set('limite', limite.toString());
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
};
