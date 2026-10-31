"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Perfil } from "@/lib/types";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { AdminTareas } from "@/components/AdminTareas";
import { MisTareas } from "@/components/MisTareas";

export default function TareasPage() {
  const [yo, setYo] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let montado = true;
    api.getYo()
      .then((p) => {
        if (montado) setYo(p);
      })
      .catch(() => {})
      .finally(() => {
        if (montado) setCargando(false);
      });

    return () => {
      montado = false;
    };
  }, []);

  if (cargando) {
    return (
      <div style={{ maxWidth: 840, margin: "2rem auto", padding: "0 1rem" }}>
        <Esqueleto filas={6} />
      </div>
    );
  }

  if (yo?.es_admin) {
    return <AdminTareas />;
  }

  return <MisTareas />;
}
