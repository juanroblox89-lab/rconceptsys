"use client";

import { Panel } from "@/components/Panel";
import { EquipoView } from "@/components/EquipoView";
import { useSession } from "@/components/SessionProvider";
import { useTitle } from "@/lib/useTitle";

export default function EquipoPage() {
  useTitle("Equipo · RConcept Systems");
  const { me } = useSession();
  const acceso = me?.usuario.acceso ?? "equipo";
  const puedeGestionar = acceso === "dueno" || acceso === "admin";
  return (
    <Panel title="Equipo">
      <EquipoView
        yo={me?.usuario.id ?? ""}
        soyDueno={acceso === "dueno"}
        puedeGestionar={puedeGestionar}
      />
    </Panel>
  );
}
