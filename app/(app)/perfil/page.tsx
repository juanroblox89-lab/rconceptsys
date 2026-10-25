"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check } from "lucide-react";
import { api } from "@/lib/api";
import { Perfil } from "@/lib/types";
import styles from "./perfil.module.css";

export default function MiPerfilPage() {
  const [yo, setYo] = useState<Perfil | null>(null);
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let montado = true;
    api.getYo()
      .then((p) => {
        if (montado) {
          setYo(p);
          setNombre(p.nombre);
        }
      })
      .catch(() => {});
    return () => {
      montado = false;
    };
  }, []);

  const handleGuardarNombre = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje(null);
    setGuardando(true);

    try {
      const actualizado = await api.patchYo(nombre);
      setYo(actualizado);
      setMensaje({ tipo: "exito", texto: "Nombre actualizado correctamente." });
    } catch (err: unknown) {
      const e = err as { message?: string };
      setMensaje({ tipo: "error", texto: e.message || "Error al actualizar el nombre." });
    } finally {
      setGuardando(false);
    }
  };

  const handleSeleccionarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      setMensaje({ tipo: "error", texto: "La imagen no debe superar 1 MB." });
      return;
    }

    setSubiendoFoto(true);
    setMensaje(null);

    const formData = new FormData();
    formData.append("foto", file);

    try {
      const actualizado = await api.subirFoto(formData);
      setYo(actualizado);
      setMensaje({ tipo: "exito", texto: "Foto de perfil actualizada correctamente." });
    } catch (err: unknown) {
      const e = err as { message?: string };
      setMensaje({ tipo: "error", texto: e.message || "Error al subir la imagen." });
    } finally {
      setSubiendoFoto(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Mi perfil</h1>
        <p className={styles.subtitle}>Información personal y fotografía</p>
      </div>

      <div className={styles.card}>
        {mensaje && (
          <div
            className={`${styles.statusMsg} ${
              mensaje.tipo === "exito" ? styles.statusSuccess : styles.statusError
            }`}
          >
            {mensaje.texto}
          </div>
        )}

        <div className={styles.avatarSection}>
          {yo?.foto_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={yo.foto_path} alt={yo.nombre} className={styles.avatarPreview} />
          ) : (
            <div className={styles.avatarPlaceholder}>
              {yo?.nombre ? yo.nombre.charAt(0).toUpperCase() : "U"}
            </div>
          )}

          <div className={styles.avatarActions}>
            <input
              type="file"
              ref={fileInputRef}
              className={styles.fileInput}
              accept="image/jpeg,image/png,image/webp"
              onChange={handleSeleccionarFoto}
            />
            <button
              type="button"
              className={styles.uploadBtn}
              onClick={() => fileInputRef.current?.click()}
              disabled={subiendoFoto}
            >
              <Camera size={15} />
              {subiendoFoto ? "Subiendo..." : "Cambiar foto"}
            </button>
            <span className={styles.helperText}>Máx 1 MB (JPEG, PNG o WebP)</span>
          </div>
        </div>

        <form className={styles.form} onSubmit={handleGuardarNombre}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="correo">
              Correo electrónico
            </label>
            <input
              id="correo"
              type="email"
              readOnly
              className={`${styles.input} ${styles.inputReadonly}`}
              value={yo?.correo || ""}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="nombre">
              Nombre de visualización
            </label>
            <input
              id="nombre"
              type="text"
              required
              minLength={2}
              maxLength={60}
              className={styles.input}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={guardando || nombre.trim() === yo?.nombre}
            className={styles.saveBtn}
          >
            <Check size={16} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
        </form>
      </div>
    </div>
  );
}
