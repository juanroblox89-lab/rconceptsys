"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardList, MessagesSquare } from "lucide-react";
import { api } from "@/lib/api";
import { Perfil } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { Chip } from "@/components/ui/Chip";
import { Boton } from "@/components/ui/Boton";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { TrabajosHechos } from "@/components/TrabajosHechos";
import styles from "./perfil-detalle.module.css";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function MiembroDetallePage({ params }: PageProps) {
  const { id } = use(params);
  const [yo, setYo] = useState<Perfil | null>(null);
  const [miembro, setMiembro] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let montado = true;
    Promise.allSettled([api.getYo(), api.getMiembro(id)]).then(
      ([yoRes, miembroRes]) => {
        if (!montado) return;
        if (yoRes.status === "fulfilled") {
          setYo(yoRes.value);
        }
        if (miembroRes.status === "fulfilled") {
          setMiembro(miembroRes.value);
          setCargando(false);
        } else {
          const e = miembroRes.reason as { message?: string };
          setError(e?.message || "No se encontró el miembro del equipo.");
          setCargando(false);
        }
      }
    );
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
        <ArrowLeft size={16} strokeWidth={1.75} /> Volver al equipo
      </Link>

      {cargando ? (
        <div style={{ maxWidth: 440, margin: "2rem auto", width: "100%" }}>
          <Esqueleto filas={3} />
        </div>
      ) : error || !miembro ? (
        <Tarjeta
          variante="vacia"
          tituloVacio="No encontrado"
          textoVacio={error || "No se encontró el miembro del equipo."}
        />
      ) : (
        <>
          <div className={styles.card}>
            <Avatar
              tamano={40}
              src={miembro.foto_path || undefined}
              iniciales={miembro.nombre.charAt(0).toUpperCase()}
              alt={miembro.nombre}
              style={{ width: "72px", height: "72px", fontSize: "28px" }}
            />

            <h1 className={styles.name}>{miembro.nombre}</h1>
            {miembro.correo ? <p className={styles.correo}>{miembro.correo}</p> : null}

            <div className={styles.roles}>
              {miembro.roles && miembro.roles.length > 0 ? (
                miembro.roles.map((r) => (
                  <Chip key={r.id} punto="azul">
                    {r.nombre}
                  </Chip>
                ))
              ) : (
                <span style={{ fontSize: "12px", color: "var(--rc-texto-tenue)" }}>
                  Sin roles asignados
                </span>
              )}
            </div>

            <div className={styles.details}>
              <div>{formatearFecha(miembro.creado_en)}</div>
              {miembro.es_admin && (
                <div style={{ fontWeight: 600, color: "var(--rc-gris-900)" }}>
                  Administrador del sistema
                </div>
              )}
            </div>

            <div style={{ marginTop: "var(--rc-esp-8)", width: "100%", maxWidth: "240px" }}>
              <Link href="/" style={{ display: "block" }}>
                <Boton
                  variante="vidrio"
                  envoltorioClassName="rc-escena-vidrio--bloque"
                  style={{ width: "100%", height: "34px" }}
                >
                  <MessagesSquare size={16} strokeWidth={1.75} style={{ marginRight: 6 }} />
                  Enviar mensaje en el chat
                </Boton>
              </Link>
              {yo?.es_admin && !miembro.es_admin && (
                <Link
                  href={`/admin?pestana=tareas&nueva=1&persona=${encodeURIComponent(miembro.id)}`}
                  style={{ display: "block", marginTop: "var(--rc-esp-8)" }}
                >
                  <Boton variante="primario" style={{ width: "100%", height: "34px" }}>
                    <ClipboardList size={16} strokeWidth={1.75} style={{ marginRight: 6 }} />
                    Enviar trabajo
                  </Boton>
                </Link>
              )}
            </div>
          </div>

          {/* Estadísticas de trabajos hechos: solo visible si el visor es admin y la persona NO es admin */}
          {yo?.es_admin && !miembro.es_admin && (
            <TrabajosHechos
              modo={{ tipo: "persona", id: miembro.id }}
              nombre={miembro.nombre}
              mostrarEnlaceAdminStats={true}
            />
          )}
        </>
      )}
    </div>
  );
}
