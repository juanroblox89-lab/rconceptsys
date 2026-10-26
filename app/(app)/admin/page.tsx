"use client";

import { useEffect, useState } from "react";
import { Check, X, Shield, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { Perfil, Rol } from "@/lib/types";
import { Tabla, TablaFila } from "@/components/ui/Tabla";
import { Boton } from "@/components/ui/Boton";
import { Estado } from "@/components/ui/Estado";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Esqueleto } from "@/components/ui/Esqueleto";
import styles from "./admin.module.css";

export default function AdminPage() {
  const [miembros, setMiembros] = useState<Perfil[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [cargando, setCargando] = useState(true);

  // Formulario nuevo rol
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaClave, setNuevaClave] = useState("");
  const [nuevoColor, setNuevoColor] = useState("#2F7FE0");

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

  const [rolesPendientes, setRolesPendientes] = useState<Record<string, number[]>>({});

  const handleToggleRolPendiente = (miembroId: string, rolId: number) => {
    setRolesPendientes((prev) => {
      const actuales = prev[miembroId] || [];
      if (actuales.includes(rolId)) {
        return { ...prev, [miembroId]: actuales.filter((id) => id !== rolId) };
      }
      return { ...prev, [miembroId]: [...actuales, rolId] };
    });
  };

  const handleAprobar = async (id: string) => {
    const rolesElegidos = rolesPendientes[id] || [];
    if (rolesElegidos.length > 0) {
      await api.adminSetRoles(id, rolesElegidos);
    }
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
        <div style={{ maxWidth: 640, margin: "2rem auto", width: "100%" }}>
          <Esqueleto filas={4} />
        </div>
      ) : (
        <>
          {/* SECCIÓN 1: PENDIENTES */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Cuentas por aprobar ({pendientes.length})
            </h2>

            {pendientes.length === 0 ? (
              <Tarjeta
                variante="vacia"
                tituloVacio="Sin pendientes"
                textoVacio="No hay cuentas esperando aprobación en este momento."
              />
            ) : (
              <>
                {/* Escritorio: Tabla */}
                <div className={styles.desktopTable}>
                  <Tabla>
                    <thead>
                      <tr>
                        <th>Nombre y correo</th>
                        <th>Roles iniciales</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendientes.map((m) => (
                        <TablaFila key={m.id}>
                          <td>
                            <div>
                              <strong>{m.nombre}</strong>
                            </div>
                            <div style={{ fontSize: "11.5px", color: "var(--rc-texto-secundario)" }}>
                              {m.correo}
                            </div>
                          </td>
                          <td>
                            <div className={styles.roleSelectContainer}>
                              {roles.map((r) => {
                                const elegidos = rolesPendientes[m.id] || [];
                                const activo = elegidos.includes(r.id);
                                return (
                                  <button
                                    key={r.id}
                                    type="button"
                                    className={`${styles.roleToggle} ${
                                      activo ? styles.roleToggleActive : ""
                                    }`}
                                    style={
                                      activo
                                        ? { color: r.color }
                                        : { color: "var(--rc-texto-secundario)" }
                                    }
                                    onClick={() => handleToggleRolPendiente(m.id, r.id)}
                                  >
                                    {r.nombre}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                          <td>
                            <Boton
                              type="button"
                              variante="vidrio"
                              tamano="sm"
                              onClick={() => handleAprobar(m.id)}
                              style={{ height: "30px", whiteSpace: "nowrap" }}
                            >
                              <Check size={14} strokeWidth={1.75} style={{ marginRight: 4 }} />
                              Aprobar acceso
                            </Boton>
                          </td>
                        </TablaFila>
                      ))}
                    </tbody>
                  </Tabla>
                </div>

                {/* Móvil (375px): Tarjetas apiladas */}
                <div className={styles.mobileCards}>
                  {pendientes.map((m) => (
                    <div key={m.id} className={styles.mobileCard}>
                      <div className={styles.mobileCardHeader}>
                        <div>
                          <div className={styles.mobileCardName}>{m.nombre}</div>
                          <div className={styles.mobileCardEmail}>{m.correo}</div>
                        </div>
                        <Estado variante="pendiente">Pendiente</Estado>
                      </div>

                      <div>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--rc-gris-700)", marginBottom: 4 }}>
                          Roles iniciales:
                        </div>
                        <div className={styles.roleSelectContainer}>
                          {roles.map((r) => {
                            const elegidos = rolesPendientes[m.id] || [];
                            const activo = elegidos.includes(r.id);
                            return (
                              <button
                                key={r.id}
                                type="button"
                                className={`${styles.roleToggle} ${
                                  activo ? styles.roleToggleActive : ""
                                }`}
                                style={
                                  activo
                                    ? { color: r.color }
                                    : { color: "var(--rc-texto-secundario)" }
                                }
                                onClick={() => handleToggleRolPendiente(m.id, r.id)}
                              >
                                {r.nombre}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <Boton
                        type="button"
                        variante="vidrio"
                        tamano="sm"
                        onClick={() => handleAprobar(m.id)}
                        envoltorioClassName="rc-escena-vidrio--bloque"
                        style={{ width: "100%", height: "32px" }}
                      >
                        <Check size={14} strokeWidth={1.75} style={{ marginRight: 4 }} />
                        Aprobar acceso
                      </Boton>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* SECCIÓN 2: MIEMBROS ACTIVOS */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Miembros del equipo ({aprobadosYSuspendidos.length})
            </h2>

            {/* Escritorio: Tabla */}
            <div className={styles.desktopTable}>
              <Tabla>
                <thead>
                  <tr>
                    <th>Miembro</th>
                    <th>Estado</th>
                    <th>Roles asignados</th>
                    <th>Privilegios</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {aprobadosYSuspendidos.map((m) => (
                    <TablaFila key={m.id}>
                      <td>
                        <div>
                          <strong>{m.nombre}</strong>
                        </div>
                        <div style={{ fontSize: "11.5px", color: "var(--rc-texto-secundario)" }}>
                          {m.correo}
                        </div>
                      </td>
                      <td>
                        <Estado
                          variante={m.estado === "aprobado" ? "aprobado" : "error"}
                          enTabla
                        >
                          {m.estado === "aprobado" ? "Activo" : "Suspendido"}
                        </Estado>
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
                                style={
                                  activo
                                    ? { color: r.color }
                                    : { color: "var(--rc-texto-secundario)" }
                                }
                                onClick={() => handleToggleRol(m, r.id)}
                              >
                                {r.nombre}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td>
                        <Boton
                          type="button"
                          variante="fantasma"
                          tamano="sm"
                          onClick={() => handleToggleAdmin(m.id, m.es_admin)}
                          style={{ height: "28px" }}
                        >
                          <Shield
                            size={14}
                            strokeWidth={1.75}
                            color={m.es_admin ? "var(--rc-azul-texto)" : "var(--rc-icono)"}
                            style={{ marginRight: 4 }}
                          />
                          {m.es_admin ? "Es Admin" : "Hacer Admin"}
                        </Boton>
                      </td>
                      <td>
                        <div className={styles.actionsCell}>
                          {m.estado === "aprobado" ? (
                            <Boton
                              type="button"
                              variante="peligro"
                              tamano="sm"
                              onClick={() => handleSuspender(m.id)}
                              style={{ height: "28px" }}
                            >
                              <X size={14} strokeWidth={1.75} style={{ marginRight: 4 }} />
                              Suspender
                            </Boton>
                          ) : (
                            <Boton
                              type="button"
                              variante="secundario"
                              tamano="sm"
                              onClick={() => handleReactivar(m.id)}
                              style={{ height: "28px" }}
                            >
                              <Check size={14} strokeWidth={1.75} style={{ marginRight: 4 }} />
                              Reactivar
                            </Boton>
                          )}
                        </div>
                      </td>
                    </TablaFila>
                  ))}
                </tbody>
              </Tabla>
            </div>

            {/* Móvil (375px): Tarjetas apiladas */}
            <div className={styles.mobileCards}>
              {aprobadosYSuspendidos.map((m) => (
                <div key={m.id} className={styles.mobileCard}>
                  <div className={styles.mobileCardHeader}>
                    <div>
                      <div className={styles.mobileCardName}>{m.nombre}</div>
                      <div className={styles.mobileCardEmail}>{m.correo}</div>
                    </div>
                    <Estado
                      variante={m.estado === "aprobado" ? "aprobado" : "error"}
                    >
                      {m.estado === "aprobado" ? "Activo" : "Suspendido"}
                    </Estado>
                  </div>

                  <div>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--rc-gris-700)", marginBottom: 4 }}>
                      Roles:
                    </div>
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
                            style={
                              activo
                                ? { color: r.color }
                                : { color: "var(--rc-texto-secundario)" }
                            }
                            onClick={() => handleToggleRol(m, r.id)}
                          >
                            {r.nombre}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className={styles.actionsCell} style={{ marginTop: 4 }}>
                    <Boton
                      type="button"
                      variante="fantasma"
                      tamano="sm"
                      onClick={() => handleToggleAdmin(m.id, m.es_admin)}
                      style={{ height: "30px", flex: 1 }}
                    >
                      <Shield
                        size={14}
                        strokeWidth={1.75}
                        color={m.es_admin ? "var(--rc-azul-texto)" : "var(--rc-icono)"}
                        style={{ marginRight: 4 }}
                      />
                      {m.es_admin ? "Es Admin" : "Hacer Admin"}
                    </Boton>

                    {m.estado === "aprobado" ? (
                      <Boton
                        type="button"
                        variante="peligro"
                        tamano="sm"
                        onClick={() => handleSuspender(m.id)}
                        style={{ height: "30px", flex: 1 }}
                      >
                        <X size={14} strokeWidth={1.75} style={{ marginRight: 4 }} />
                        Suspender
                      </Boton>
                    ) : (
                      <Boton
                        type="button"
                        variante="secundario"
                        tamano="sm"
                        onClick={() => handleReactivar(m.id)}
                        style={{ height: "30px", flex: 1 }}
                      >
                        <Check size={14} strokeWidth={1.75} style={{ marginRight: 4 }} />
                        Reactivar
                      </Boton>
                    )}
                  </div>
                </div>
              ))}
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
                style={{ width: "42px", height: "32px", padding: 2, cursor: "pointer" }}
                value={nuevoColor}
                onChange={(e) => setNuevoColor(e.target.value)}
                title="Color del rol"
              />
              <Boton
                type="submit"
                variante="vidrio"
                tamano="sm"
                style={{ height: "32px" }}
              >
                <Plus size={14} strokeWidth={1.75} style={{ marginRight: 4 }} />
                Agregar rol
              </Boton>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
