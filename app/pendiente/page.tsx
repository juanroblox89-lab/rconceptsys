"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, RefreshCw } from "lucide-react";
import { Logo } from "@/components/Logo";
import { api, clearAuthToken } from "@/lib/api";
import styles from "./pendiente.module.css";

export default function PendientePage() {
  const router = useRouter();
  const [comprobando, setComprobando] = useState(false);

  // Polling automático cada 4 segundos
  useEffect(() => {
    let activo = true;

    const verificar = async () => {
      try {
        const perfil = await api.getYo();
        if (perfil.estado === "aprobado" && activo) {
          router.push("/");
        }
      } catch {
        // En espera
      }
    };

    const interval = setInterval(verificar, 4000);
    return () => {
      activo = false;
      clearInterval(interval);
    };
  }, [router]);

  const verificarManual = async () => {
    setComprobando(true);
    try {
      const perfil = await api.getYo();
      if (perfil.estado === "aprobado") {
        router.push("/");
      }
    } catch {
      // Sigue pendiente
    } finally {
      setComprobando(false);
    }
  };

  const cerrarSesion = () => {
    clearAuthToken();
    router.push("/login");
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <Logo size={24} />
          <div className={styles.iconCircle}>
            <Clock size={32} strokeWidth={1.5} />
          </div>
          <h1 className={styles.title}>Cuenta en espera de aprobación</h1>
          <p className={styles.description}>
            Tu cuenta ha sido creada exitosamente. Un administrador debe aprobar tu acceso antes de que puedas usar el chat y las herramientas de RConcept.
          </p>
        </div>

        <div className={styles.infoBox}>
          Esta pantalla se actualizará automáticamente en cuanto tu cuenta sea aprobada.
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={verificarManual}
            disabled={comprobando}
          >
            <RefreshCw size={15} className={comprobando ? styles.spin : ""} />
            {comprobando ? "Comprobando..." : "Comprobar ahora"}
          </button>

          <button type="button" className={styles.logoutBtn} onClick={cerrarSesion}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
