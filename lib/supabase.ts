import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Clave de localStorage con el usuario demo elegido (id, email o acceso). */
export const DEMO_USER_KEY = "rc-demo-user";

let cached: SupabaseClient | null | undefined;

function buildClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url === undefined || url === "" || anonKey === undefined || anonKey === "") {
    return null;
  }
  return createClient(url, anonKey, {
    auth: {
      // PKCE: el callback de Google vuelve con ?code= y el cliente lo canjea solo.
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

/** Cliente de Supabase, o `null` si faltan las variables de entorno. Nunca tira al importar. */
export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null; // solo en el navegador
  if (cached === undefined) {
    try {
      cached = buildClient();
    } catch {
      cached = null;
    }
  }
  return cached;
}

/** true si la app corre con login (hay Supabase configurado). */
export function isAuthConfigured(): boolean {
  return (
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") !== "" &&
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "") !== ""
  );
}

/** Usuario demo elegido (modo sin Supabase). Solo navegador. */
export function getDemoUser(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(DEMO_USER_KEY);
  } catch {
    return null;
  }
}

export function setDemoUser(value: string | null): void {
  try {
    if (value === null || value === "") window.localStorage.removeItem(DEMO_USER_KEY);
    else window.localStorage.setItem(DEMO_USER_KEY, value);
  } catch {
    // Sin almacenamiento: solo memoria (la sesión se pierde al recargar).
  }
}

/**
 * fetch al backend con auth: Authorization Bearer (Supabase) o X-Demo-User
 * (modo demo sin Supabase). Ante un 401 con sesión, refresca el token y
 * reintenta 1 vez.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const supabase = getSupabase();
  if (supabase !== null) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token !== undefined) headers.set("Authorization", `Bearer ${token}`);
  } else {
    const demo = getDemoUser();
    if (demo !== null && demo !== "") headers.set("X-Demo-User", demo);
  }
  const res = await fetch(input, { ...init, headers });
  if (res.status !== 401 || supabase === null) return res;
  // 401: intentar refrescar 1 vez (sesión vencida).
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error !== null || data.session === null) throw error ?? new Error("sin sesión");
    const retry = new Headers(init.headers);
    retry.set("Authorization", `Bearer ${data.session.access_token}`);
    return fetch(input, { ...init, headers: retry });
  } catch {
    return res;
  }
}
