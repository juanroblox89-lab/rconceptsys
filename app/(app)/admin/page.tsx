"use client";

import { useEffect, useState } from "react";
import { Check, X, Shield, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { Perfil, Rol } from "@/lib/types";
import styles from "./admin.module.css";

export default function AdminPage() {
  const [miembros, setMiembros] = useState<Perfil[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [cargando, setCargando] = useState(true);

  // Formulario nuevo rol
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaClave, setNuevaClave] = useState("");
  const [nuevoColor, setNuevoColor] = useState("#2563EB");

  const cargarDatos = async () => {
    try {
      const [mList, rList] = await Promise.all([
        api.adminGetMiembros(),
        api.adminGetRoles(),
      ]);
      setMiembros(mList);
      setRoles(rList);
    } catch {
      // Ignorar o redirigir
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    let activo = true;
    Promise.all([api.adminGetMiembros(), api.adminGetRoles()])
      .then(([mList, rList]) => {
        if (activo) {
          setMiembros(mList);
          setRoles(rList);
          setCargando(false);
        }
      })
      .catch(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  const handleAprobar = async (id: string) => {
    await api.adminAprobar(id);
    await cargarDatos();
  };

  const handleSuspender = async (id: string) => {
    await api.adminSuspender(id);
    await cargarDatos();
  };

  const handleReactivar = async (id: string) => {
    await api.adminReactivar(id);
    await cargarDatos();
  };

  const handleToggleAdmin = async (id: string, esAdminActual: boolean) => {
    try {
      await api.adminSetAdmin(id, !esAdminActual);
      await cargarDatos();
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(e.message || "No se pudo cambiar el estado de admin.");
    }
  };

  const handleToggleRol = async (miembro: Perfil, rolId: number) => {
    const rolesActuales = miembro.roles?.map((r) => r.id) || [];
    let nuevos: number[];
    if (rolesActuales.includes(rolId)) {
      nuevos = rolesActuales.filter((id) => id !== rolId);
    } else {
      nuevos = [...rolesActuales, rolId];
    }
    await api.adminSetRoles(miembro.id, nuevos);
    await cargarDatos();
  };

  const handleCrearRol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoNombre.trim() || !nuevaClave.trim()) return;

    await api.adminPostRol({
      nombre: nuevoNombre.trim(),
      clave: nuevaClave.trim().toLowerCase(),
      color: nuevoColor,
      orden: roles.length + 1,
      activo: true,
    });
    setNuevoNombre("");
    setNuevaClave("");
    await cargarDatos();
  };

  const pendientes = miembros.filter((m) => m.estado === "pendiente");
  const aprobadosYSuspendidos = miembros.filter((m) => m.estado !== "pendiente");

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Panel de administración</h1>
        <p className={styles.subtitle}>
          Control de acceso, aprobación de cuentas y configuración de roles
        </p>
      </div>

      {cargando ? (
        <div className={styles.emptyNotice}>Cargando datos administrativos...</div>
      ) : (
        <>
          {/* SECCIÓN 1: PENDIENTES */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Cuentas por aprobar ({pendientes.length})
            </h2>

            {pendientes.length === 0 ? (
              <div className={styles.emptyNotice}>
                No hay cuentas esperando aprobación en este momento.
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Correo</th>
                      <th>Roles iniciales</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendientes.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <strong>{m.nombre}</strong>
                        </td>
                        <td>{m.correo}</td>
                        <td>
                          <div className={styles.roleSelectContainer}>
                            {roles.map((r) => {
                              const activo = m.roles?.some((mr) => mr.id === r.id);
                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  className={`${styles.roleToggle} ${
                                    activo ? styles.roleToggleActive : ""
                                  }`}
                                  style={{ color: r.color }}
                                  onClick={() => handleToggleRol(m, r.id)}
                                >
                                  {r.nombre}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`${styles.btnAction} ${styles.btnApprove}`}
                            onClick={() => handleAprobar(m.id)}
                          >
                            <Check size={14} /> Aprobar acceso
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* SECCIÓN 2: MIEMBROS ACTIVOS */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Miembros del equipo ({aprobadosYSuspendidos.length})</h2>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Miembro</th>
                    <th>Estado</th>
                    <th>Roles asignados</th>
                    <th>Admin</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {aprobadosYSuspendidos.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div>
                          <strong>{m.nombre}</strong>
                        </div>
                        <div style={{ fontSize: "11.5px", color: "var(--rc-label-tertiary)" }}>
                          {m.correo}
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: "11px",
                            textTransform: "uppercase",
                            color: m.estado === "aprobado" ? "var(--rc-success)" : "var(--rc-error-primary)",
                          }}
                        >
                          {m.estado}
                        </span>
                      </td>
                      <td>
                        <div className={styles.roleSelectContainer}>
                          {roles.map((r) => {
                            const activo = m.roles?.some((mr) => mr.id === r.id);
                            return (
                              <button
                                key={r.id}
                                type="button"
                                className={`${styles.roleToggle} ${
                                  activo ? styles.roleToggleActive : ""
                                }`}
                                style={{ color: r.color }}
                                onClick={() => handleToggleRol(m, r.id)}
                              >
                                {r.nombre}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.btnAction}
                          onClick={() => handleToggleAdmin(m.id, m.es_admin)}
                        >
                          <Shield size={14} color={m.es_admin ? "#2563EB" : undefined} />
                          {m.es_admin ? "Es Admin" : "Hacer Admin"}
                        </button>
                      </td>
                      <td>
                        <div className={styles.actionsCell}>
                          {m.estado === "aprobado" ? (
                            <button
                              type="button"
                              className={`${styles.btnAction} ${styles.btnDanger}`}
                              onClick={() => handleSuspender(m.id)}
                            >
                              <X size={14} /> Suspender
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={styles.btnAction}
                              onClick={() => handleReactivar(m.id)}
                            >
                              <Check size={14} /> Reactivar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* SECCIÓN 3: GESTIÓN DE ROLES */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Roles de trabajo editables</h2>
            <p className={styles.subtitle}>
              Crea nuevos oficios configurables para el equipo
            </p>

            <form className={styles.newRoleForm} onSubmit={handleCrearRol}>
              <input
                type="text"
                placeholder="Nombre (ej. Diseñador)"
                className={styles.roleInput}
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                required
              />
              <input
                type="text"
                placeholder="Clave (ej. diseniador)"
                className={styles.roleInput}
                value={nuevaClave}
                onChange={(e) => setNuevaClave(e.target.value)}
                required
              />
              <input
                type="color"
                className={styles.roleInput}
                style={{ width: "42px", padding: 0 }}
                value={nuevoColor}
                onChange={(e) => setNuevoColor(e.target.value)}
              />
              <button
                type="submit"
                className={`${styles.btnAction} ${styles.btnApprove}`}
              >
                <Plus size={14} /> Agregar rol
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
