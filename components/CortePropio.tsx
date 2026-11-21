"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { CortePropioDatos } from "@/lib/types";
import styles from "./FlujoTrabajo.module.css";

export function CortePropio() {
  const [id, setId] = useState(0);
  const [estado, setEstado] = useState<{ id: number; datos?: CortePropioDatos }>();
  useEffect(() => {
    const leer = () => setId(Number(new URLSearchParams(window.location.search).get("corte")) || 0);
    leer(); window.addEventListener("hashchange", leer);
    return () => window.removeEventListener("hashchange", leer);
  }, []);
  useEffect(() => {
    if (id <= 0) return;
    let vigente = true;
    api.getCortePropio(id).then((datos) => { if (vigente) setEstado({ id, datos }); }).catch(() => { if (vigente) setEstado({ id }); });
    return () => { vigente = false; };
  }, [id]);
  if (id <= 0) return null;
  const datos = estado?.id === id ? estado.datos : undefined;
  return <section className={styles.fila} id={`corte-${id}`} aria-label="Tu corte de pago">
    <div><h2>Tu corte de pago</h2>{datos ? <><p>{datos.desde} a {datos.hasta}</p><p>{datos.tareas} {datos.tareas === 1 ? "trabajo" : "trabajos"} · {datos.pagada_en ? "Pagado" : "Por pagar"}</p></> : <p>{estado?.id === id ? "No encontramos ese corte para tu cuenta." : "Consultando el corte…"}</p>}</div>
    {datos && <strong>{new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(datos.total)}</strong>}
  </section>;
}
