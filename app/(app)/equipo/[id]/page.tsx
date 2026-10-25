"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MessagesSquare } from "lucide-react";
import { api } from "@/lib/api";
import { Perfil } from "@/lib/types";
import styles from "./perfil-detalle.module.css";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function MiembroDetallePage({ params }: PageProps) {
  const { id } = use(params);
  const [miembro, setMiembro] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let montado = true;
    api.getMiembro(id)
      .then((res) => {
        if (montado) {
          setMiembro(res);
          setCargando(false);
        }
      })
      .catch((err: unknown) => {
        if (montado) {
          const e = err as { message?: string };
          setError(e.message || "No se pudo cargar el perfil.");
          setCargando(false);
        }
      });
    return () => {
      montado = false;
    };
  }, [id]);

  const formatearFecha = (iso?: string) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return `Miembro desde ${d.toLocaleDateString("es-ES", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}`;
    } catch {
      return "";
    }
  };

  return (
    <div className={styles.container}>
      <Link href="/equipo" className={styles.backBtn}>
        <ArrowLeft size={16} /> Volver al equipo
      </Link>

      {cargando ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--rc-label-secondary)" }}>
          Cargando perfil...
        </div>
      ) : error || !miembro ? (
        <div className={styles.card}>
          <p>{error || "No se encontró el miembro del equipo."}</p>
        </div>
      ) : (
        <div className={styles.card}>
          {miembro.foto_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={miembro.foto_path} alt={miembro.nombre} className={styles.avatarLarge} />
          ) : (
            <div className={styles.avatarLargePlaceholder}>
              {miembro.nombre.charAt(0).toUpperCase()}
            </div>
          )}

          <h1 className={styles.name}>{miembro.nombre}</h1>
          <p className={styles.correo}>{miembro.correo}</p>

          <div className={styles.roles}>
            {miembro.roles && miembro.roles.length > 0 ? (
              miembro.roles.map((r) => (
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
                Sin roles asignados
              </span>
            )}
          </div>

          <div className={styles.details}>
            <div>{formatearFecha(miembro.creado_en)}</div>
            {miembro.es_admin && (
              <div style={{ fontWeight: 600, color: "var(--rc-label-primary)" }}>
                Administrador del sistema
              </div>
            )}
          </div>

          <Link href="/" className={styles.chatCta}>
            <MessagesSquare size={16} /> Enviar mensaje en el chat
          </Link>
        </div>
      )}
    </div>
  );
}
