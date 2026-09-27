"use client";

import { useSession } from "./SessionProvider";
import { useTitle } from "@/lib/useTitle";
import { accesoLabel } from "@/lib/oficios";

/** Pantalla "Esperando aprobación" para acceso pendiente. */
export function WaitingScreen() {
  useTitle("Esperando aprobación · RConcept Systems");
  const { me, signOut } = useSession();
  return (
    <div className="center">
      <h1 className="page-title">Esperando aprobación</h1>
      <p className="page-sub" style={{ marginBottom: 0, maxWidth: 340 }}>
        Hola{me?.usuario.nombre ? `, ${me.usuario.nombre}` : ""}. Tu cuenta está
        pendiente: un dueño o admin tiene que aprobarla antes de que puedas entrar.
      </p>
      <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
        Salir
      </button>
    </div>
  );
}

/** Pantalla de acceso desactivado. */
export function DisabledScreen() {
  useTitle("Acceso desactivado · RConcept Systems");
  const { signOut } = useSession();
  return (
    <div className="center">
      <h1 className="page-title">Acceso desactivado</h1>
      <p className="page-sub" style={{ marginBottom: 0, maxWidth: 340 }}>
        Esta cuenta fue desactivada. Si creés que es un error, hablá con un dueño
        o admin de Rohlfing Concept.
      </p>
      <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
        Salir
      </button>
    </div>
  );
}

/** Etiqueta de acceso como chip. */
export function AccesoChip({ acceso }: { acceso: string }) {
  const dark = acceso === "dueno" || acceso === "admin" || acceso === "pendiente";
  return (
    <span className={`chip ${dark ? "chip-dark" : ""}`}>{accesoLabel(acceso)}</span>
  );
}
