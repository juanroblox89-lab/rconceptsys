import { NextResponse, type NextRequest } from "next/server";

// Rutas que se pueden ver sin sesión
const PUBLICAS = ["/login", "/registro", "/estilo"];

/**
 * Comprobación optimista: si no hay ninguna cookie de sesión (ni de acceso ni de refresco) se manda al login
 * antes de pintar la pantalla. La validez real del token la comprueba la API; si el acceso venció, el
 * backend lo renueva solo con la cookie de refresco.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  const hayAcceso = Boolean(request.cookies.get("rc_access_token")?.value);
  const hayRefresco = Boolean(request.cookies.get("rc_refresh_token")?.value);
  if (hayAcceso || hayRefresco) return NextResponse.next();

  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

// Solo las pantallas privadas (las públicas /login, /registro y /estilo no pasan por aquí).
// Si se agrega una pantalla privada nueva, agrégala a esta lista.
export const config = {
  matcher: ["/", "/perfil", "/admin", "/tareas", "/factura", "/pendiente", "/equipo", "/equipo/:path*"],
};
