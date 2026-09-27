"use client";

import { Panel } from "@/components/Panel";
import { HomeCard, HomeCardRow } from "@/components/HomeCard";
import { ModuleIcon } from "@/components/icons";
import { useSession } from "@/components/SessionProvider";
import { faseDe } from "@/lib/modulos";
import { useTitle } from "@/lib/useTitle";

export default function InicioPage() {
  useTitle("Inicio · RConcept Systems");
  const { me } = useSession();
  const nombre = me ? me.usuario.nombre.split(" ")[0] : "";
  const modulos = me?.modulos ?? [];
  const listos = modulos.filter((m) => m.habilitado && m.id !== "inicio" && m.id !== "mi-perfil");
  const perfil = modulos.find((m) => m.id === "mi-perfil" && m.habilitado);
  const proximos = modulos.filter((m) => !m.habilitado && m.id !== "inicio");
  return (
    <Panel title="Inicio">
      <div className="page">
        <h1 className="page-title">Hola{nombre !== "" ? `, ${nombre}` : ""}</h1>
        <p className="page-sub">Esto es lo que hay hoy en F0.</p>
        {listos.length > 0 && (
          <HomeCardRow>
            {listos.map((m) => (
              <HomeCard
                key={m.id}
                icon={<ModuleIcon id={m.id} size={18} />}
                title={m.titulo}
                meta="Disponible"
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
