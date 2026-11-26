"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, RefreshCw } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Boton } from "@/components/ui/Boton";
import { api } from "@/lib/api";
import styles from "./pendiente.module.css";

export default function PendientePage() {
  const router = useRouter();
  const [comprobando, setComprobando] = useState(false);

  // Polling automático cada 15 segundos solo si la pestaña está visible
  useEffect(() => {
    let activo = true;

    const verificar = async () => {
      if (document.hidden) return;
      try {
        const perfil = await api.getYo();
        if (perfil.estado === "aprobado" && activo) {
          router.push("/");
        }
      } catch {
        // En espera
      }
    };

    const interval = setInterval(verificar, 15000);
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

  const cerrarSesion = async () => {
    try {
      await api.salir();
    } catch {
      // Ignorar
    }
    router.push("/login");
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <Logo size={20} />
          <div className={styles.iconCircle}>
            <Clock size={28} strokeWidth={1.75} />
          </div>
          <h1 className={styles.title}>Cuenta pendiente de aprobación</h1>
          <p className={styles.description}>
            Un administrador debe aprobar tu acceso.
          </p>
        </div>


        <div className={styles.actions}>
          <Boton
            type="button"
            variante="vidrio"
            onClick={verificarManual}
            cargando={comprobando}
            envoltorioClassName="rc-escena-vidrio--bloque"
            style={{ width: "100%" }}
          >
            <RefreshCw size={15} strokeWidth={1.75} className={comprobando ? styles.spin : ""} style={{ marginRight: 6 }} />
            {comprobando ? "Comprobando..." : "Comprobar ahora"}
          </Boton>

          <Boton
            type="button"
            variante="secundario"
            onClick={cerrarSesion}
            style={{ width: "100%" }}
          >
            Cerrar sesión
          </Boton>
        </div>
      </div>
    </div>
  );
}
