"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Perfil } from "@/lib/types";
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
        <div className={styles.empty}>Cargando equipo...</div>
      ) : miembros.length === 0 ? (
        <div className={styles.empty}>No hay miembros aprobados en este momento.</div>
      ) : (
        <div className={styles.grid}>
          {miembros.map((m) => (
            <Link key={m.id} href={`/equipo/${m.id}`} className={styles.card}>
              {m.foto_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.foto_path} alt={m.nombre} className={styles.avatar} />
              ) : (
                <div className={styles.avatarPlaceholder}>
                  {m.nombre.charAt(0).toUpperCase()}
                </div>
              )}

              <div className={styles.name}>{m.nombre}</div>

              <div className={styles.roles}>
                {m.roles && m.roles.length > 0 ? (
                  m.roles.map((r) => (
                    <span
                      key={r.id}
                      className={styles.roleChip}
                      style={{ color: r.color, borderColor: r.color }}
                    >
                      {r.nombre}
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: "12px", color: "var(--rc-label-tertiary)" }}>
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
