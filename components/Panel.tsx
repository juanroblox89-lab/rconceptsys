"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "./AppShell";
import { BootSplash } from "./BootSplash";
import { DisabledScreen, WaitingScreen } from "./AccessScreens";
import { useSession } from "./SessionProvider";
import { useTitle } from "@/lib/useTitle";

/**
 * Gate de sesión para las páginas del panel: carga (BootSplash Globe),
 * error con reintentar, redirect a /login sin credencial, y pantallas de
 * pendiente/desactivado. Con sesión válida envuelve en AppShell (Globe
 * adaptado) con el menú de GET /me.
 */
export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  const {
    authEnabled,
    session,
    demoUser,
    me,
    meLoading,
    meError,
    unauthorized,
    retryMe,
  } = useSession();
  const router = useRouter();
  useTitle(`${title} · RConcept Systems`);

  const checkingAuth = authEnabled && session === undefined;
  const needLogin =
    (authEnabled && session === null) ||
    (!authEnabled && demoUser === null) ||
    unauthorized;

  useEffect(() => {
    if (needLogin) router.replace("/login");
  }, [needLogin, router]);

  if (checkingAuth || meLoading) {
    return <BootSplash />;
  }

  if (needLogin) {
    return <BootSplash />;
  }

  if (meError !== null || me === null) {
    return (
      <div className="center">
        <div className="error-box" style={{ maxWidth: 340 }}>
          <p>{meError ?? "No se pudo cargar tu sesión"}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={retryMe}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (me.usuario.acceso === "pendiente") return <WaitingScreen />;
  if (me.usuario.acceso === "desactivado") return <DisabledScreen />;

  return <AppShell modulos={me.modulos}>{children}</AppShell>;
}
