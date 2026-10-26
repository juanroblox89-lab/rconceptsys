"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Boton } from "@/components/ui/Boton";
import { api } from "@/lib/api";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);

    try {
      const res = await api.login(correo.trim(), password);
      if (res.perfil.estado === "pendiente") {
        router.push("/pendiente");
      } else {
        router.push("/");
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || "El correo o la contraseña no coinciden.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <Logo size={20} />
          <h1 className={styles.title}>Iniciar sesión</h1>
          <p className={styles.subtitle}>Sistema operativo interno de RConcept</p>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="correo">
              Correo electrónico
            </label>
            <span className="rc-input-contenedor">
              <input
                id="correo"
                type="email"
                required
                autoComplete="email"
                className="rc-input"
                placeholder="tu@rconcept.com"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
              />
            </span>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Contraseña
            </label>
            <div className={styles.inputWrapper}>
              <span className="rc-input-contenedor" style={{ width: "100%" }}>
                <input
                  id="password"
                  type={mostrarPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  className="rc-input"
                  placeholder="••••••••••"
                  style={{ paddingRight: "36px" }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </span>
              <button
                type="button"
                className={styles.togglePasswordBtn}
                aria-label={mostrarPassword ? "Ocultar contraseña" : "Ver contraseña"}
                onClick={() => setMostrarPassword((v) => !v)}
              >
                {mostrarPassword ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
              </button>
            </div>
          </div>

          <Boton
            type="submit"
            variante="vidrio"
            cargando={cargando}
            envoltorioClassName="rc-escena-vidrio--bloque"
            style={{ width: "100%", height: "34px", marginTop: "var(--rc-esp-4)" }}
          >
            Entrar al sistema
          </Boton>
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
