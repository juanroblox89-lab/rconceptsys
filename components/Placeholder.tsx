"use client";

import { faseDe } from "@/lib/modulos";
import { useTitle } from "@/lib/useTitle";

/** Estado vacío honesto para los módulos que llegan en F1+. */
export function Placeholder({ id, titulo }: { id: string; titulo: string }) {
  const f = faseDe(id);
  useTitle(`${titulo} · RConcept Systems`);
  return (
    <div className="page">
      <h1 className="page-title">{titulo}</h1>
      <p className="page-sub">Llega en la fase {f}.</p>
      <div className="card">
        <p style={{ margin: 0, fontSize: 13, color: "var(--c-text-2)" }}>
          Este módulo todavía no está construido. En F0 solo Equipo y Mi perfil
          funcionan.
        </p>
      </div>
    </div>
  );
}

/** Atajo legacy: placeholder deduciendo la fase del id de módulo. */
export function PlaceholderFor({ id, titulo }: { id: string; titulo: string }) {
  return <Placeholder id={id} titulo={titulo} />;
}
