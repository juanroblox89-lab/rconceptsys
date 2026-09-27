import { authFetch } from "./supabase";
import type {
  ActividadEvento,
  ActividadResponse,
  MeResponse,
  Usuario,
  UsuariosResponse,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseError(res: Response): Promise<string> {
  const fallback =
    res.status === 401
      ? "Sesión vencida, volvé a entrar"
      : res.status === 403
        ? "No tenés permiso para eso"
        : `Error ${res.status}`;
  try {
    const text = await res.text();
    if (text === "") return fallback;
    try {
      const data = JSON.parse(text) as { error?: unknown };
      return typeof data.error === "string" && data.error !== "" ? data.error : fallback;
    } catch {
      return fallback;
    }
  } catch {
    return fallback;
  }
}

export async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const res = await authFetch(`/api/backend${path}`, { ...init, headers });
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  if (res.status === 204) return null as T;
  const text = await res.text();
  return (text === "" ? null : JSON.parse(text)) as T;
}

export function getMe(): Promise<MeResponse> {
  return req<MeResponse>("/me");
}

export function getUsuarios(): Promise<Usuario[]> {
  return req<UsuariosResponse>("/usuarios").then((d) => d.usuarios);
}

export function aprobarUsuario(
  id: string,
  body: { acceso?: string; oficios?: string[]; motivo?: string },
): Promise<Usuario> {
  return req<Usuario>(`/usuarios/${id}/aprobar`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchUsuario(
  id: string,
  body: { acceso?: string; oficios?: string[]; motivo?: string },
): Promise<Usuario> {
  return req<Usuario>(`/usuarios/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function desactivarUsuario(id: string, motivo?: string): Promise<Usuario> {
  return req<Usuario>(`/usuarios/${id}/desactivar`, {
    method: "POST",
    body: JSON.stringify({ motivo }),
  });
}

/** Historial de una persona: el backend filtra por ?recurso=<id> (tipo o id). */
export function getActividad(usuarioId: string): Promise<ActividadEvento[]> {
  return req<ActividadResponse>(
    `/actividad?recurso=${encodeURIComponent(usuarioId)}`,
  ).then((d) =>
    // Seguridad extra: si el backend trajera de más, filtrar en cliente.
    d.eventos.filter((e) => e.recurso_id === null || e.recurso_id === usuarioId),
  );
}
