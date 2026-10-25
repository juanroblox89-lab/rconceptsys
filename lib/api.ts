// lib/api.ts
import { Perfil, ChatMensaje, Rol } from './types';

// En el navegador usamos rutas relativas que Next.js reescribe al backend Go
const API_BASE = '';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('rc_token') || localStorage.getItem('rc_demo_user') || 'admin-1';
}

export function setAuthToken(token: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('rc_token', token);
}

export function clearAuthToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('rc_token');
  localStorage.removeItem('rc_demo_user');
}

export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Demo-User', token);
  }

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
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
    const err = new Error(mensaje);
    (err as unknown as { codigo: string; status: number }).codigo = codigo;
    (err as unknown as { codigo: string; status: number }).status = res.status;
    throw err;
  }

  return res.json();
}

// Endpoints
export const api = {
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
  getEquipo: () => fetchApi<Perfil[]>('/api/equipo'),
  getMiembro: (id: string) => fetchApi<Perfil>(`/api/equipo/${id}`),
  getChat: (antes?: number, limite?: number) => {
    const q = new URLSearchParams();
    if (antes) q.set('antes', antes.toString());
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
