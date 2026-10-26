"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Perfil } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { Chip } from "@/components/ui/Chip";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Esqueleto } from "@/components/ui/Esqueleto";
import styles from "./equipo.module.css";

export default function EquipoPage() {
  const [miembros, setMiembros] = useState<Perfil[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let montado = true;
    api.getEquipo()
      .then((res) => {
        if (montado) {
          setMiembros(res);
          setCargando(false);
        }
      })
      .catch(() => {
        if (montado) setCargando(false);
      });
    return () => {
      montado = false;
    };
  }, []);

  const formatearFecha = (iso: string) => {
    try {
      const d = new Date(iso);
      return `Miembro desde ${d.toLocaleDateString("es-ES", {
        month: "long",
        year: "numeric",
      })}`;
    } catch {
      return "";
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Equipo de trabajo</h1>
        <p className={styles.subtitle}>
          Miembros activos en producción, edición y distribución
        </p>
      </div>

      {cargando ? (
        <div style={{ maxWidth: 480, margin: "2rem auto", width: "100%" }}>
          <Esqueleto filas={3} />
        </div>
      ) : miembros.length === 0 ? (
        <Tarjeta
          variante="vacia"
          tituloVacio="No hay miembros"
          textoVacio="No hay miembros aprobados en este momento."
        />
      ) : (
        <div className={styles.grid}>
          {miembros.map((m) => (
            <Link key={m.id} href={`/equipo/${m.id}`} className={styles.card}>
              <Avatar
                tamano={40}
                src={m.foto_path || undefined}
                iniciales={m.nombre.charAt(0).toUpperCase()}
                alt={m.nombre}
              />

              <div className={styles.name}>{m.nombre}</div>

              <div className={styles.roles}>
                {m.roles && m.roles.length > 0 ? (
                  m.roles.map((r) => (
                    <Chip key={r.id} punto="azul">
                      {r.nombre}
                    </Chip>
                  ))
                ) : (
                  <span style={{ fontSize: "11px", color: "var(--rc-texto-tenue)" }}>
                    Sin rol asignado
                  </span>
                )}
              </div>

              <div className={styles.since}>{formatearFecha(m.creado_en)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
