"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Boton } from "@/components/ui/Boton";
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
          <Logo size={20} />
          <h1 className={styles.title}>Crear cuenta</h1>
          <p className={styles.subtitle}>Únete al equipo creativo de RConcept</p>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="nombre">
              Nombre completo
            </label>
            <span className="rc-input-contenedor">
              <input
                id="nombre"
                type="text"
                required
                className="rc-input"
                placeholder="Juan Pérez"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </span>
          </div>

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
              Contraseña (10+ caracteres)
            </label>
            <div className={styles.inputWrapper}>
              <span className="rc-input-contenedor" style={{ width: "100%" }}>
                <input
                  id="password"
                  type={mostrarPassword ? "text" : "password"}
                  required
                  minLength={10}
                  autoComplete="new-password"
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

          <div className={styles.field}>
            <label className={styles.label} htmlFor="confirmar">
              Confirmar contraseña
            </label>
            <div className={styles.inputWrapper}>
              <span className="rc-input-contenedor" style={{ width: "100%" }}>
                <input
                  id="confirmar"
                  type={mostrarPassword ? "text" : "password"}
                  required
                  minLength={10}
                  autoComplete="new-password"
                  className="rc-input"
                  placeholder="••••••••••"
                  style={{ paddingRight: "36px" }}
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                />
              </span>
            </div>
          </div>

          <Boton
            type="submit"
            variante="vidrio"
            cargando={cargando}
            envoltorioClassName="rc-escena-vidrio--bloque"
            style={{ width: "100%", height: "34px", marginTop: "var(--rc-esp-4)" }}
          >
            Registrar cuenta
          </Boton>
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
