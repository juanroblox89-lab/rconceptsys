"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check } from "lucide-react";
import { api } from "@/lib/api";
import { Perfil } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { Boton } from "@/components/ui/Boton";
import { Chip } from "@/components/ui/Chip";
import { Aviso, useAviso } from "@/components/ui/Aviso";
import { TrabajosHechos } from "@/components/TrabajosHechos";
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
    const nombreLimpio = nombre.trim();
    if (nombreLimpio.length < 2 || nombreLimpio.length > 60) {
      setErrorLocal("El nombre debe tener entre 2 y 60 caracteres.");
      return;
    }
    setErrorLocal(null);
    setGuardando(true);
    try {
      const actualizado = await api.patchYo(nombreLimpio);
      setYo(actualizado);
      setNombre(actualizado.nombre);
      mostrarAviso({
        tipo: "exito",
        titulo: "Nombre guardado",
        texto: "Tu nombre de visualización se actualizó con éxito.",
      });
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorLocal(e?.message || "No se pudo actualizar el nombre.");
      mostrarAviso({
        tipo: "error",
        titulo: "Error al guardar",
        texto: e?.message || "No se pudo actualizar el nombre.",
      });
    } finally {
      setGuardando(false);
    }
  };

  const handleSeleccionarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      mostrarAviso({
        tipo: "error",
        titulo: "Formato no permitido",
        texto: "Solo se admiten imágenes en formato JPEG, PNG o WebP.",
      });
      return;
    }

    if (file.size > 1024 * 1024) {
      mostrarAviso({
        tipo: "error",
        titulo: "Imagen muy pesada",
        texto: "La foto no debe superar 1 MB.",
      });
      return;
    }

    setSubiendoFoto(true);
    const formData = new FormData();
    formData.append("foto", file);
    try {
      const actualizado = await api.subirFoto(formData);
      setYo(actualizado);
      mostrarAviso({
        tipo: "exito",
        titulo: "Foto actualizada",
        texto: "Tu avatar se actualizó correctamente.",
      });
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({
        tipo: "error",
        titulo: "Error al subir foto",
        texto: e?.message || "No se pudo actualizar tu foto.",
      });
    } finally {
      setSubiendoFoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const sinCambios = nombre.trim() === (yo?.nombre || "").trim();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Mi perfil</h1>
        <p className={styles.subtitle}>
          Administra tus datos personales y consulta el acumulado de tus trabajos.
        </p>
      </div>

      {errorLocal && (
        <Aviso
          tipo="error"
          titulo="Atención"
          texto={errorLocal}
          onCerrar={() => setErrorLocal(null)}
        />
      )}

      {/* Tarjeta de Información Personal */}
      <div className={styles.card}>
        <div className={styles.avatarSection}>
          <div className={styles.avatarWrapper}>
            <Avatar
              tamano={40}
              src={yo?.foto_path || undefined}
              iniciales={yo?.nombre?.charAt(0).toUpperCase() || "U"}
              alt={yo?.nombre || "Usuario"}
              style={{ width: "80px", height: "80px", fontSize: "32px" }}
            />
            {yo?.es_admin ? (
              <span className={styles.adminBadge}>Admin</span>
            ) : null}
          </div>

          <div className={styles.infoCol}>
            <div className={styles.userRoleRow}>
              <span className={styles.userStateText}>
                {yo?.estado === "aprobado" ? "Miembro activo" : "Pendiente de aprobación"}
              </span>
            </div>

            <div className={styles.rolesRow}>
              {yo?.roles && yo.roles.length > 0 ? (
                yo.roles.map((r) => (
                  <Chip key={r.id} punto="azul">
                    {r.nombre}
                  </Chip>
                ))
              ) : (
                <span className={styles.sinRolesText}>Sin roles asignados</span>
              )}
            </div>
          </div>

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
            <span className="rc-input-contenedor" style={{ width: "100%", opacity: 0.85 }}>
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

      {/* Tarjeta de Trabajos Hechos (F3 / F3C) */}
      <TrabajosHechos modo={{ tipo: "yo" }} />
    </div>
  );
}
