"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check } from "lucide-react";
import { api } from "@/lib/api";
import { Perfil } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { Boton } from "@/components/ui/Boton";
import { Aviso, useAviso } from "@/components/ui/Aviso";
import styles from "./perfil.module.css";

export default function MiPerfilPage() {
  const [yo, setYo] = useState<Perfil | null>(null);
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const { mostrarAviso } = useAviso();
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
    setErrorLocal(null);

    const limpio = nombre.trim();
    if (limpio.length < 2) {
      setErrorLocal("El nombre debe tener al menos 2 caracteres.");
      return;
    }

    setGuardando(true);

    try {
      const actualizado = await api.patchYo(limpio);
      setYo(actualizado);
      mostrarAviso({
        tipo: "exito",
        titulo: "Cambios guardados",
        texto: "Tu nombre de visualización se actualizó correctamente.",
      });
    } catch (err: unknown) {
      const e = err as { message?: string };
      const mensajeHumano =
        e.message || "No se pudo actualizar el nombre. Por favor, intenta nuevamente.";
      setErrorLocal(mensajeHumano);
      mostrarAviso({
        tipo: "error",
        titulo: "Error al guardar",
        texto: mensajeHumano,
      });
    } finally {
      setGuardando(false);
    }
  };

  const handleSeleccionarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      const msg = "La imagen supera el límite de 1 MB. Elige una imagen más liviana.";
      setErrorLocal(msg);
      mostrarAviso({ tipo: "error", titulo: "Imagen muy pesada", texto: msg });
      return;
    }

    setSubiendoFoto(true);
    setErrorLocal(null);

    const formData = new FormData();
    formData.append("foto", file);

    try {
      const actualizado = await api.subirFoto(formData);
      setYo(actualizado);
      mostrarAviso({
        tipo: "exito",
        titulo: "Foto actualizada",
        texto: "Tu nueva foto de perfil ya está visible.",
      });
    } catch (err: unknown) {
      const e = err as { message?: string };
      const mensajeHumano =
        e.message || "No se pudo subir la fotografía. Intenta con formato JPEG o PNG.";
      setErrorLocal(mensajeHumano);
      mostrarAviso({ tipo: "error", titulo: "Error al subir", texto: mensajeHumano });
    } finally {
      setSubiendoFoto(false);
    }
  };

  const sinCambios = !nombre.trim() || nombre.trim() === yo?.nombre;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Mi perfil</h1>
        <p className={styles.subtitle}>Información personal y fotografía</p>
      </div>

      <div className={styles.card}>
        {errorLocal && (
          <Aviso
            tipo="error"
            titulo="No se pudo guardar"
            texto={errorLocal}
            onCerrar={() => setErrorLocal(null)}
          />
        )}

        <div className={styles.avatarSection}>
          <Avatar
            tamano={40}
            src={yo?.foto_path || undefined}
            iniciales={yo?.nombre ? yo.nombre.charAt(0).toUpperCase() : "U"}
            alt={yo?.nombre}
            style={{ width: "64px", height: "64px", fontSize: "24px" }}
          />

          <div className={styles.avatarActions}>
            <input
              type="file"
              ref={fileInputRef}
              className={styles.fileInput}
              accept="image/jpeg,image/png,image/webp"
              onChange={handleSeleccionarFoto}
            />
            <Boton
              type="button"
              variante="secundario"
              tamano="sm"
              onClick={() => fileInputRef.current?.click()}
              cargando={subiendoFoto}
              style={{ height: "30px" }}
            >
              <Camera size={14} strokeWidth={1.75} style={{ marginRight: 6 }} />
              {subiendoFoto ? "Subiendo..." : "Cambiar foto"}
            </Boton>
            <span className={styles.helperText}>Máximo 1 MB (JPEG, PNG o WebP)</span>
          </div>
        </div>

        <form className={styles.form} onSubmit={handleGuardarNombre}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="correo">
              Correo electrónico
            </label>
            <span className="rc-input-contenedor" style={{ opacity: 0.85 }}>
              <input
                id="correo"
                type="email"
                readOnly
                className="rc-input"
                value={yo?.correo || ""}
                style={{ cursor: "not-allowed" }}
              />
            </span>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="nombre">
              Nombre de visualización
            </label>
            <div className={styles.nameRow}>
              <div className={styles.nameField}>
                <span className="rc-input-contenedor" style={{ width: "100%" }}>
                  <input
                    id="nombre"
                    type="text"
                    required
                    minLength={2}
                    maxLength={60}
                    className="rc-input"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                  />
                </span>
              </div>
              <Boton
                type="submit"
                variante="vidrio"
                cargando={guardando}
                disabled={guardando || sinCambios}
                style={{ height: "30px", whiteSpace: "nowrap" }}
              >
                <Check size={14} strokeWidth={1.75} style={{ marginRight: 4 }} />
                {guardando ? "Guardando..." : "Guardar"}
              </Boton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
