"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { DriveArchivo } from "@/lib/types";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import styles from "./FlujoTrabajo.module.css";

export interface EleccionCarpeta { id: string; nombre: string }

export function SelectorCarpetaTrabajo({ padre, actual, valor, onChange }: {
  padre: string; actual?: string | null; valor: EleccionCarpeta;
  onChange: (valor: EleccionCarpeta) => void;
}) {
  const [modo, setModo] = useState(actual ? "existente" : "");
  const [intento, reintentar] = useState(0);
  const [consulta, setConsulta] = useState<{ carpetas: DriveArchivo[]; error: string } | null>(null);
  useEffect(() => {
    if (!padre || modo !== "existente") return;
    let vigente = true;
    api.adminGetDriveArchivos({ carpeta: padre }).then((datos) => {
      if (vigente) setConsulta({ carpetas: (datos ?? []).filter((f) => f.es_carpeta), error: "" });
    }).catch((e: Error) => {
      if (vigente) setConsulta({ carpetas: [], error: e.message || "No se pudieron listar las carpetas." });
    });
    return () => { vigente = false; };
  }, [padre, modo, intento]);

  return <div className={styles.form}>
    <Campo como="select" etiqueta="Carpeta de Drive" value={modo} onChange={(e) => {
      setModo(e.target.value);
      setConsulta(null);
      onChange({ id: e.target.value === "existente" ? actual ?? "" : "", nombre: e.target.value === "nueva" ? "automatica" : "" });
    }}>
      <option value="">{actual ? "Conservar carpeta actual" : "Crear automáticamente si Drive está conectado"}</option>
      <option value="existente" disabled={!padre}>Elegir una subcarpeta existente</option>
      {actual && <option value="nueva" disabled={!padre}>Preparar carpeta con el nombre del trabajo</option>}
    </Campo>
    {!padre && <p className={styles.ayuda}>Si Drive está conectado, la carpeta se prepara al asignar.</p>}
    {modo === "existente" && padre && <>
      <Campo como="select" etiqueta="Subcarpeta existente" value={valor.id} required disabled={!consulta || !!consulta.error}
        onChange={(e) => onChange({ id: e.target.value, nombre: "" })}>
        <option value="">{consulta ? "Selecciona una carpeta" : "Cargando carpetas…"}</option>
        {actual && !consulta?.carpetas.some((f) => f.id === actual) && <option value={actual}>Carpeta actual</option>}
        {consulta?.carpetas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
      </Campo>
      {consulta?.error && <p className={styles.error} role="alert">{consulta.error} <Boton variante="secundario" tamano="sm" onClick={() => { setConsulta(null); reintentar(intento + 1); }}>Reintentar</Boton></p>}
    </>}
  </div>;
}
