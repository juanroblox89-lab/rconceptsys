"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { setAuthToken, api } from "@/lib/api";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);

    try {
      // Guardar identificador / token (soporta modo demo o token Supabase)
      const token = correo.trim().toLowerCase();
      setAuthToken(token);

      // Probar si el usuario existe y su estado
      const perfil = await api.getYo();
      if (perfil.estado === "pendiente") {
        router.push("/pendiente");
      } else {
        router.push("/");
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || "No se pudo iniciar sesión. Verifica tus credenciales.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <Logo size={24} />
          <h1 className={styles.title}>Iniciar sesión</h1>
          <p className={styles.subtitle}>Sistema operativo interno de RConcept</p>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="correo">
              Correo electrónico
            </label>
            <input
              id="correo"
              type="text"
              required
              autoComplete="email"
              className={styles.input}
              placeholder="tu@rconcept.com"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              className={styles.input}
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" disabled={cargando} className={styles.submitBtn}>
            {cargando ? "Iniciando sesión..." : "Entrar al sistema"}
          </button>
        </form>

        <div className={styles.footer}>
          ¿No tienes una cuenta?{" "}
          <Link href="/registro" className={styles.link}>
            Crear cuenta
          </Link>
        </div>
      </div>
    </div>
  );
}
