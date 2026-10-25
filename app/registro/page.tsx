"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Logo } from "@/components/Logo";
import { api } from "@/lib/api";
import styles from "../login/login.module.css";

export default function RegistroPage() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 10) {
      setError("La contraseña debe tener al menos 10 caracteres.");
      return;
    }
    if (password !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setCargando(true);

    try {
      await api.registro(nombre.trim(), correo.trim(), password, confirmar);
      // Tras registrarse correctamente, iniciamos sesión para obtener la cookie httpOnly
      try {
        const loginRes = await api.login(correo.trim(), password);
        if (loginRes.perfil.estado === "pendiente") {
          router.push("/pendiente");
        } else {
          router.push("/");
        }
      } catch {
        router.push("/pendiente");
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || "No se pudo completar el registro.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <Logo size={24} />
          <h1 className={styles.title}>Crear cuenta</h1>
          <p className={styles.subtitle}>Únete al equipo creativo de RConcept</p>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="nombre">
              Nombre completo
            </label>
            <input
              id="nombre"
              type="text"
              required
              className={styles.input}
              placeholder="Juan Pérez"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="correo">
              Correo electrónico
            </label>
            <input
              id="correo"
              type="email"
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
              Contraseña (10+ caracteres)
            </label>
            <div className={styles.inputWrapper}>
              <input
                id="password"
                type={mostrarPassword ? "text" : "password"}
                required
                minLength={10}
                autoComplete="new-password"
                className={styles.input}
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className={styles.togglePasswordBtn}
                aria-label={mostrarPassword ? "Ocultar contraseña" : "Ver contraseña"}
                onClick={() => setMostrarPassword((v) => !v)}
              >
                {mostrarPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="confirmar">
              Confirmar contraseña
            </label>
            <div className={styles.inputWrapper}>
              <input
                id="confirmar"
                type={mostrarPassword ? "text" : "password"}
                required
                minLength={10}
                autoComplete="new-password"
                className={styles.input}
                placeholder="••••••••••"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
              />
            </div>
          </div>

          <button type="submit" disabled={cargando} className={styles.submitBtn}>
            {cargando ? "Registrando..." : "Registrar cuenta"}
          </button>
        </form>

        <div className={styles.footer}>
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className={styles.link}>
            Iniciar sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
