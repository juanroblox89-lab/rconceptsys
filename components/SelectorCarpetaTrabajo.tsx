"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { DriveArchivo } from "@/lib/types";
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
      onChange({ id: e.target.value === "existente" ? actual ?? "" : "", nombre: "" });
    }}>
      <option value="">{actual ? "Conservar carpeta actual" : "Asignar sin carpeta por ahora"}</option>
      <option value="existente" disabled={!padre}>Elegir una subcarpeta existente</option>
      <option value="nueva" disabled={!padre}>Crear una subcarpeta</option>
    </Campo>
    {!padre && <p className={styles.ayuda}>Vincula el Drive del cliente en Clientes para elegir o crear una carpeta de trabajo.</p>}
    {modo === "existente" && padre && <>
      <Campo como="select" etiqueta="Subcarpeta existente" value={valor.id} required disabled={!consulta || !!consulta.error}
        onChange={(e) => onChange({ id: e.target.value, nombre: "" })}>
        <option value="">{consulta ? "Selecciona una carpeta" : "Cargando carpetas…"}</option>
        {actual && !consulta?.carpetas.some((f) => f.id === actual) && <option value={actual}>Carpeta actual</option>}
        {consulta?.carpetas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
      </Campo>
      {consulta?.error && <p className={styles.error} role="alert">{consulta.error} <button type="button" onClick={() => { setConsulta(null); reintentar(intento + 1); }}>Reintentar</button></p>}
    </>}
    {modo === "nueva" && padre && <Campo etiqueta="Nombre de la subcarpeta" maxLength={80} required value={valor.nombre}
      onChange={(e) => onChange({ id: "", nombre: e.target.value })} />}
  </div>;
}
