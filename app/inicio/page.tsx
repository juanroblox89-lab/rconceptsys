"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/Panel";
import { HomeCard, HomeCardRow } from "@/components/HomeCard";
import { ModuleIcon } from "@/components/icons";
import { useSession } from "@/components/SessionProvider";
import { faseDe } from "@/lib/modulos";
import { useTitle } from "@/lib/useTitle";
import { getTareas } from "@/lib/f1ui";

export default function InicioPage() {
  useTitle("Inicio · RConcept Systems");
  const { me } = useSession();
  const nombre = me ? me.usuario.nombre.split(" ")[0] : "";
  const modulos = me?.modulos ?? [];
  const listos = modulos.filter((m) => m.habilitado && m.id !== "inicio" && m.id !== "mi-perfil");
  const perfil = modulos.find((m) => m.id === "mi-perfil" && m.habilitado);
  const proximos = modulos.filter((m) => !m.habilitado && m.id !== "inicio");
  const acceso = me?.usuario.acceso ?? "equipo";
  const admin = acceso === "dueno" || acceso === "admin";

  const [hoy, setHoy] = useState<number | null>(null);
  const [vencidas, setVencidas] = useState<number | null>(null);
  const [porRevisar, setPorRevisar] = useState<number | null>(null);

  useEffect(() => {
    if (me === null) return;
    let alive = true;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          if (!alive) return;
          const yo = me.usuario.id;
          const [h, v] = await Promise.all([
            getTareas({ asignado: yo, vista: "hoy" }).catch(() => null),
            getTareas({ asignado: yo, vista: "vencidas" }).catch(() => null),
          ]);
          if (!alive) return;
          if (h !== null) setHoy(h.length);
          if (v !== null) setVencidas(v.length);
          if (admin) {
            const r = await getTareas({ vista: "por_revisar" }).catch(() => null);
            if (!alive || r === null) return;
            setPorRevisar(r.length);
          }
        } catch {
          // Sin números: las tarjetas siguen mostrando los módulos.
        }
      })();
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [me, admin]);

  const metaTareas = hoy === null ? "Tus pendientes" : hoy === 0 ? "Nada para hoy" : `${hoy} para hoy`;
  const metaVenc = vencidas === null || vencidas === 0 ? "Al día" : `${vencidas} vencidas`;

  return (
    <Panel title="Inicio">
      <div className="page">
        <h1 className="page-title">Hola{nombre !== "" ? `, ${nombre}` : ""}</h1>
        <p className="page-sub">Esto es lo que hay hoy.</p>
        {listos.length > 0 && (
          <HomeCardRow>
            {listos.map((m) => (
              <HomeCard
                key={m.id}
                icon={<ModuleIcon id={m.id} size={18} />}
                title={m.titulo}
                meta={
                  m.id === "mis-tareas"
                    ? `${metaTareas} · ${metaVenc}`
                    : m.id === "revision" && porRevisar !== null
                      ? `${porRevisar} por revisar`
                      : "Disponible"
                }
                href={m.ruta}
                current
              />
            ))}
            {perfil !== undefined && (
              <HomeCard
                icon={<ModuleIcon id="mi-perfil" size={18} />}
                title={perfil.titulo}
                meta="Tus datos"
                href={perfil.ruta}
              />
            )}
          </HomeCardRow>
        )}
        {listos.length === 0 && perfil !== undefined && (
          <HomeCardRow>
            <HomeCard
              icon={<ModuleIcon id="mi-perfil" size={18} />}
              title={perfil.titulo}
              meta="Tus datos"
              href={perfil.ruta}
              current
            />
          </HomeCardRow>
        )}
        {proximos.length > 0 && (
          <>
            <p className="page-sub" style={{ marginTop: 16 }}>
              Llegan en sus fases.
            </p>
            <HomeCardRow>
              {proximos.map((m) => (
                <HomeCard
                  key={m.id}
                  icon={<ModuleIcon id={m.id} size={18} />}
                  title={m.titulo}
                  meta={`Llega en la fase ${faseDe(m.id)}`}
                  href={m.ruta}
                />
              ))}
            </HomeCardRow>
          </>
        )}
      </div>
    </Panel>
  );
}
