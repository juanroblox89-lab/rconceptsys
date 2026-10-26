"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Check,
  Shield,
  Plus,
  Briefcase,
  CheckSquare,
  Receipt,
  Users,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  Perfil,
  Rol,
  TipoTrabajo,
  Tarea,
  ResumenFacturasPersona,
} from "@/lib/types";
import { Tabla, TablaFila } from "@/components/ui/Tabla";
import { Boton } from "@/components/ui/Boton";
import { Estado } from "@/components/ui/Estado";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Pestanas } from "@/components/ui/Pestanas";
import { Interruptor } from "@/components/ui/Interruptor";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { Campo } from "@/components/ui/Campo";
import { useAviso } from "@/components/ui/Aviso";
import styles from "./admin.module.css";

export default function AdminPage() {
  const [pestanaActiva, setPestanaActiva] = useState("trabajos");
  const [cargando, setCargando] = useState(true);
  const { mostrarAviso } = useAviso();

  // Datos globales
  const [miembros, setMiembros] = useState<Perfil[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [trabajos, setTrabajos] = useState<TipoTrabajo[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [porRevisarCount, setPorRevisarCount] = useState(0);
  const [facturas, setFacturas] = useState<ResumenFacturasPersona[]>([]);

  // Estados locales - Trabajos
  const [preciosEditados, setPreciosEditados] = useState<Record<number, number>>({});
  const [modalNuevoTrabajo, setModalNuevoTrabajo] = useState(false);
  const [nuevoTrabClave, setNuevoTrabClave] = useState("");
  const [nuevoTrabNombre, setNuevoTrabNombre] = useState("");
  const [nuevoTrabRolId, setNuevoTrabRolId] = useState<number | "">("");
  const [nuevoTrabPrecio, setNuevoTrabPrecio] = useState<number>(0);
  const [guardandoTrabajo, setGuardandoTrabajo] = useState(false);

  // Estados locales - Tareas
  const [filtroPersona, setFiltroPersona] = useState<string>("");
  const [filtroEstado, setFiltroEstado] = useState<string>("");
  const [modalNuevaTarea, setModalNuevaTarea] = useState(false);
  const [nuevaTareaTipoId, setNuevaTareaTipoId] = useState<number | "">("");
  const [nuevaTareaAsignadoA, setNuevaTareaAsignadoA] = useState<string>("");
  const [nuevaTareaTitulo, setNuevaTareaTitulo] = useState("");
  const [nuevaTareaDescripcion, setNuevaTareaDescripcion] = useState("");
  const [nuevaTareaFechaLimite, setNuevaTareaFechaLimite] = useState("");
  const [nuevaTareaForzar, setNuevaTareaForzar] = useState(false);
  const [creandoTarea, setCreandoTarea] = useState(false);

  // Modal Rechazar Tarea
  const [tareaARechazar, setTareaARechazar] = useState<Tarea | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazando, setRechazando] = useState(false);

  // Modal Pagar Factura
  const [facturaAPagar, setFacturaAPagar] = useState<{ id: number; total: number; persona: string } | null>(null);
  const [pagandoFactura, setPagandoFactura] = useState(false);
  const [personaExpandida, setPersonaExpandida] = useState<string | null>(null);

  // Formulario nuevo rol (Pestaña Miembros)
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaClave, setNuevaClave] = useState("");
  const [nuevoColor, setNuevoColor] = useState("#2F7FE0");
  const [rolesPendientes, setRolesPendientes] = useState<Record<string, number[]>>({});

  const cargarDatos = useCallback(async () => {
    try {
      const [mList, rList, tList, tareasRes, fList] = await Promise.all([
        api.adminGetMiembros(),
        api.adminGetRoles(),
        api.adminGetTrabajos(),
        api.adminGetTareas(),
        api.adminGetFacturas(),
      ]);
      setMiembros(mList);
      setRoles(rList);
      setTrabajos(tList);
      setTareas(tareasRes?.tareas || []);
      setPorRevisarCount(tareasRes?.por_revisar || 0);
      setFacturas(fList);

      const preciosMap: Record<number, number> = {};
      tList.forEach((t) => {
        preciosMap[t.id] = t.precio;
      });
      setPreciosEditados(preciosMap);
    } catch {
      mostrarAviso({
        tipo: "error",
        titulo: "Error al cargar datos",
        texto: "No se pudieron sincronizar los datos de administración.",
      });
    } finally {
      setCargando(false);
    }
  }, [mostrarAviso]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarDatos();
  }, [cargarDatos]);

  // ==========================================
  // Acciones: Pestaña Miembros
  // ==========================================
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
    mostrarAviso({ tipo: "exito", titulo: "Miembro aprobado", texto: "La cuenta ya tiene acceso al sistema." });
    await cargarDatos();
  };

  const handleSuspender = async (id: string) => {
    await api.adminSuspender(id);
    mostrarAviso({ tipo: "info", titulo: "Miembro suspendido", texto: "El acceso ha sido revocado." });
    await cargarDatos();
  };

  const handleReactivar = async (id: string) => {
    await api.adminReactivar(id);
    mostrarAviso({ tipo: "exito", titulo: "Miembro reactivado", texto: "El acceso ha sido restablecido." });
    await cargarDatos();
  };

  const handleToggleAdmin = async (id: string, esAdminActual: boolean) => {
    try {
      await api.adminSetAdmin(id, !esAdminActual);
      mostrarAviso({
        tipo: "exito",
        titulo: "Permisos actualizados",
        texto: `Se ${esAdminActual ? "removió" : "concedió"} el rol de administrador.`,
      });
      await cargarDatos();
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({ tipo: "error", titulo: "No se pudo actualizar", texto: e.message || "Error al cambiar admin." });
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
    try {
      await api.adminPostRol({
        nombre: nuevoNombre.trim(),
        clave: nuevaClave.trim().toLowerCase(),
        color: nuevoColor,
        orden: roles.length + 1,
        activo: true,
      });
      mostrarAviso({ tipo: "exito", titulo: "Rol creado", texto: `El rol "${nuevoNombre}" fue creado.` });
      setNuevoNombre("");
      setNuevaClave("");
      await cargarDatos();
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({ tipo: "error", titulo: "Error al crear rol", texto: e.message || "No se pudo crear el rol." });
    }
  };

  // ==========================================
  // Acciones: Pestaña Trabajos
  // ==========================================
  const handleGuardarPrecio = async (trabajo: TipoTrabajo) => {
    const nuevoPrecio = preciosEditados[trabajo.id];
    if (nuevoPrecio === undefined || nuevoPrecio < 0 || nuevoPrecio > 100000000) {
      mostrarAviso({ tipo: "error", titulo: "Precio inválido", texto: "Ingresa un valor entre 0 y 100.000.000 COP." });
      return;
    }
    try {
      await api.adminPatchTrabajo(trabajo.id, { precio: nuevoPrecio });
      mostrarAviso({
        tipo: "exito",
        titulo: "Precio actualizado",
        texto: `El precio de "${trabajo.nombre}" ahora es $ ${nuevoPrecio.toLocaleString("es-CO")}.`,
      });
      await cargarDatos();
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({ tipo: "error", titulo: "No se pudo guardar", texto: e.message || "Error al actualizar precio." });
    }
  };

  const handleToggleTrabajoActivo = async (trabajo: TipoTrabajo) => {
    try {
      await api.adminPatchTrabajo(trabajo.id, { activo: !trabajo.activo });
      mostrarAviso({
        tipo: "info",
        titulo: "Estado actualizado",
        texto: `El trabajo "${trabajo.nombre}" ahora está ${!trabajo.activo ? "activo" : "inactivo"}.`,
      });
      await cargarDatos();
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({ tipo: "error", titulo: "Error", texto: e.message || "No se pudo cambiar estado." });
    }
  };

  const handleCambiarRolTrabajo = async (trabajoId: number, nuevoRolId: number | null) => {
    try {
      await api.adminPatchTrabajo(trabajoId, { rol_id: nuevoRolId });
      mostrarAviso({ tipo: "exito", titulo: "Rol asociado actualizado" });
      await cargarDatos();
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({ tipo: "error", titulo: "Error", texto: e.message || "No se pudo asociar el rol." });
    }
  };

  const handleCrearTrabajo = async () => {
    if (!nuevoTrabNombre.trim() || !nuevoTrabClave.trim()) {
      mostrarAviso({ tipo: "error", titulo: "Campos requeridos", texto: "El nombre y la clave son obligatorios." });
      return;
    }
    setGuardandoTrabajo(true);
    try {
      await api.adminPostTrabajo({
        clave: nuevoTrabClave.trim().toLowerCase().replace(/\s+/g, "_"),
        nombre: nuevoTrabNombre.trim(),
        rol_id: nuevoTrabRolId === "" ? null : Number(nuevoTrabRolId),
        precio: nuevoTrabPrecio || 0,
        activo: true,
        orden: trabajos.length + 1,
      });
      mostrarAviso({ tipo: "exito", titulo: "Trabajo creado exitosamente" });
      setModalNuevoTrabajo(false);
      setNuevoTrabClave("");
      setNuevoTrabNombre("");
      setNuevoTrabRolId("");
      setNuevoTrabPrecio(0);
      await cargarDatos();
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({ tipo: "error", titulo: "Error al crear trabajo", texto: e.message || "Verifica los datos." });
    } finally {
      setGuardandoTrabajo(false);
    }
  };

  // ==========================================
  // Acciones: Pestaña Tareas
  // ==========================================
  const handleAceptarTarea = async (tarea: Tarea) => {
    try {
      await api.adminAceptarTarea(tarea.id);
      mostrarAviso({
        tipo: "exito",
        titulo: "Tarea aceptada",
        texto: `Se congeló el valor vigente y se añadió a la factura de ${tarea.asignado?.nombre || "la persona"}.`,
      });
      await cargarDatos();
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({ tipo: "error", titulo: "No se pudo aceptar", texto: e.message || "Error al aceptar tarea." });
    }
  };

  const handleRechazarTareaConfirm = async () => {
    if (!tareaARechazar) return;
    if (!motivoRechazo.trim()) {
      mostrarAviso({ tipo: "error", titulo: "Motivo obligatorio", texto: "Debes ingresar una razón de rechazo." });
      return;
    }
    setRechazando(true);
    try {
      await api.adminRechazarTarea(tareaARechazar.id, motivoRechazo.trim());
      mostrarAviso({
        tipo: "advertencia",
        titulo: "Tarea rechazada",
        texto: "La tarea regresó a la persona con el motivo indicado para su corrección.",
      });
      setTareaARechazar(null);
      setMotivoRechazo("");
      await cargarDatos();
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({ tipo: "error", titulo: "Error al rechazar", texto: e.message || "No se pudo rechazar la tarea." });
    } finally {
      setRechazando(false);
    }
  };

  const handleCancelarTarea = async (tarea: Tarea) => {
    try {
      await api.adminCancelarTarea(tarea.id);
      mostrarAviso({ tipo: "info", titulo: "Tarea cancelada" });
      await cargarDatos();
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({ tipo: "error", titulo: "No se pudo cancelar", texto: e.message || "Error al cancelar." });
    }
  };

  const handleCrearTareaSubmit = async () => {
    if (!nuevaTareaTitulo.trim() || nuevaTareaTipoId === "" || !nuevaTareaAsignadoA) {
      mostrarAviso({ tipo: "error", titulo: "Campos incompletos", texto: "Selecciona trabajo, persona y título." });
      return;
    }

    setCreandoTarea(true);
    try {
      await api.adminPostTarea({
        tipo_id: Number(nuevaTareaTipoId),
        asignado_a: nuevaTareaAsignadoA,
        titulo: nuevaTareaTitulo.trim(),
        descripcion: nuevaTareaDescripcion.trim() || undefined,
        fecha_limite: nuevaTareaFechaLimite || undefined,
        forzar: nuevaTareaForzar,
      });
      mostrarAviso({ tipo: "exito", titulo: "Tarea creada y asignada" });
      setModalNuevaTarea(false);
      setNuevaTareaTipoId("");
      setNuevaTareaAsignadoA("");
      setNuevaTareaTitulo("");
      setNuevaTareaDescripcion("");
      setNuevaTareaFechaLimite("");
      setNuevaTareaForzar(false);
      await cargarDatos();
    } catch (err: unknown) {
      const e = err as { codigo?: string; message?: string };
      if (e.codigo === "rol_no_coincide" || e.message?.includes("rol")) {
        setNuevaTareaForzar(true);
        mostrarAviso({
          tipo: "advertencia",
          titulo: "Rol no coincide",
          texto: e.message || "La persona no tiene el rol asignado. Marca 'Asignar de todos modos' para forzar.",
        });
      } else {
        mostrarAviso({ tipo: "error", titulo: "Error al crear tarea", texto: e.message || "Verifica los datos." });
      }
    } finally {
      setCreandoTarea(false);
    }
  };

  // ==========================================
  // Acciones: Pestaña Facturas
  // ==========================================
  const handlePagarFacturaConfirm = async () => {
    if (!facturaAPagar) return;
    setPagandoFactura(true);
    try {
      await api.adminPagarFactura(facturaAPagar.id);
      mostrarAviso({
        tipo: "exito",
        titulo: "Factura marcada como pagada",
        texto: `La factura de ${facturaAPagar.persona} fue cerrada. La próxima tarea abrirá un nuevo corte.`,
      });
      setFacturaAPagar(null);
      await cargarDatos();
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({ tipo: "error", titulo: "No se pudo pagar", texto: e.message || "Error al procesar pago." });
    } finally {
      setPagandoFactura(false);
    }
  };

  // ==========================================
  // Filtros de Tareas
  // ==========================================
  const tareasPorRevisar = tareas.filter((t) => t.estado === "hecha");
  const tareasFiltradas = tareas.filter((t) => {
    if (filtroPersona && t.asignado_a !== filtroPersona) return false;
    if (filtroEstado && t.estado !== filtroEstado) return false;
    return true;
  });

  const pendientesMiembros = miembros.filter((m) => m.estado === "pendiente");
  const aprobadosYSuspendidos = miembros.filter((m) => m.estado !== "pendiente");

  // Opciones de personas agrupadas para el modal Nueva Tarea
  const tipoTrabajoSeleccionado = trabajos.find((t) => t.id === Number(nuevaTareaTipoId));
  const miembrosAprobados = miembros.filter((m) => m.estado === "aprobado" && !m.es_admin);
  const miembrosConRol = tipoTrabajoSeleccionado?.rol_id
    ? miembrosAprobados.filter((m) => m.roles?.some((r) => r.id === tipoTrabajoSeleccionado.rol_id))
    : miembrosAprobados;
  const miembrosSinRol = tipoTrabajoSeleccionado?.rol_id
    ? miembrosAprobados.filter((m) => !m.roles?.some((r) => r.id === tipoTrabajoSeleccionado.rol_id))
    : [];

  const personaSeleccionadaTieneRol =
    !tipoTrabajoSeleccionado?.rol_id ||
    miembrosConRol.some((m) => m.id === nuevaTareaAsignadoA);

  const tabsItems = [
    { id: "trabajos", etiqueta: <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Briefcase size={14} /> Trabajos</span> },
    {
      id: "tareas",
      etiqueta: (
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <CheckSquare size={14} /> Tareas
          {porRevisarCount > 0 && (
            <span
              style={{
                background: "var(--rc-azul)",
                color: "#fff",
                fontSize: 10,
                fontWeight: "bold",
                borderRadius: 99,
                padding: "1px 5px",
                lineHeight: 1,
              }}
            >
              {porRevisarCount}
            </span>
          )}
        </span>
      ),
    },
    { id: "facturas", etiqueta: <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Receipt size={14} /> Facturas</span> },
    { id: "miembros", etiqueta: <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Users size={14} /> Miembros</span> },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Panel de administración</h1>
        <p className={styles.subtitle}>
          Control de acceso, configuración de trabajos, bandeja de tareas y facturación por persona
        </p>
      </div>

      <Pestanas
        pestanas={tabsItems}
        activaId={pestanaActiva}
        onCambio={(id) => setPestanaActiva(id)}
      />

      {cargando ? (
        <div style={{ maxWidth: 640, margin: "2rem auto", width: "100%" }}>
          <Esqueleto filas={5} />
        </div>
      ) : (
        <>
          {/* ========================================================= */}
          {/* PESTAÑA 1: TRABAJOS                                       */}
          {/* ========================================================= */}
          {pestanaActiva === "trabajos" && (
            <section className={styles.section}>
              <div className={styles.sectionHeaderRow}>
                <div>
                  <h2 className={styles.sectionTitle}>Tipos de trabajo configurables</h2>
                  <p className={styles.avisoInfo}>
                    El precio configurado aplica para nuevas tareas. Modificar el precio <strong>no afecta</strong> las tareas ya aceptadas.
                  </p>
                </div>
                <Boton
                  variante="primario"
                  onClick={() => setModalNuevoTrabajo(true)}
                >
                  <Plus size={14} style={{ marginRight: 6 }} />
                  Nuevo trabajo
                </Boton>
              </div>

              {/* Escritorio: Tabla */}
              <div className={styles.desktopTable}>
                <Tabla>
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Rol que lo realiza</th>
                      <th>Precio (COP)</th>
                      <th>Estado</th>
                      <th style={{ textAlign: "right" }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trabajos.map((t) => (
                      <TablaFila key={t.id}>
                        <td>
                          <strong>{t.nombre}</strong>
                          <div style={{ fontSize: 11, color: "var(--rc-texto-secundario)" }}>
                            clave: {t.clave}
                          </div>
                        </td>
                        <td>
                          <select
                            className={styles.selectCompacto}
                            value={t.rol_id ?? ""}
                            onChange={(e) =>
                              handleCambiarRolTrabajo(t.id, e.target.value === "" ? null : Number(e.target.value))
                            }
                          >
                            <option value="">Sin rol específico</option>
                            {roles.filter((r) => r.activo).map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.nombre}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span>$</span>
                            <input
                              type="number"
                              min={0}
                              max={100000000}
                              className={styles.inputPrecio}
                              value={preciosEditados[t.id] ?? t.precio}
                              onChange={(e) =>
                                setPreciosEditados((prev) => ({
                                  ...prev,
                                  [t.id]: Math.max(0, parseInt(e.target.value, 10) || 0),
                                }))
                              }
                              onBlur={() => handleGuardarPrecio(t)}
                            />
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Interruptor
                              checked={t.activo}
                              onCheckedChange={() => handleToggleTrabajoActivo(t)}
                            />
                            <span style={{ fontSize: 12, color: t.activo ? "var(--rc-verde-texto)" : "var(--rc-texto-secundario)" }}>
                              {t.activo ? "Activo" : "Inactivo"}
                            </span>
                          </div>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <Boton
                            variante="secundario"
                            disabled={preciosEditados[t.id] === t.precio}
                            onClick={() => handleGuardarPrecio(t)}
                          >
                            Guardar
                          </Boton>
                        </td>
                      </TablaFila>
                    ))}
                  </tbody>
                </Tabla>
              </div>

              {/* Móvil: Tarjetas apiladas */}
              <div className={styles.mobileCards}>
                {trabajos.map((t) => (
                  <article key={t.id} className={styles.mobileCard}>
                    <div className={styles.mobileCardHeader}>
                      <div>
                        <div className={styles.mobileCardName}>{t.nombre}</div>
                        <div className={styles.mobileCardEmail}>clave: {t.clave}</div>
                      </div>
                      <Interruptor
                        checked={t.activo}
                        onCheckedChange={() => handleToggleTrabajoActivo(t)}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, color: "var(--rc-texto-secundario)", display: "block", marginBottom: 4 }}>
                        Rol asignado
                      </label>
                      <select
                        className={styles.selectCompacto}
                        style={{ width: "100%" }}
                        value={t.rol_id ?? ""}
                        onChange={(e) =>
                          handleCambiarRolTrabajo(t.id, e.target.value === "" ? null : Number(e.target.value))
                        }
                      >
                        <option value="">Sin rol específico</option>
                        {roles.filter((r) => r.activo).map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.nombre}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span>$</span>
                        <input
                          type="number"
                          min={0}
                          max={100000000}
                          className={styles.inputPrecio}
                          value={preciosEditados[t.id] ?? t.precio}
                          onChange={(e) =>
                            setPreciosEditados((prev) => ({
                              ...prev,
                              [t.id]: Math.max(0, parseInt(e.target.value, 10) || 0),
                            }))
                          }
                        />
                      </div>
                      <Boton
                        variante="secundario"
                        disabled={preciosEditados[t.id] === t.precio}
                        onClick={() => handleGuardarPrecio(t)}
                      >
                        Guardar precio
                      </Boton>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* ========================================================= */}
          {/* PESTAÑA 2: TAREAS                                         */}
          {/* ========================================================= */}
          {pestanaActiva === "tareas" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--rc-esp-20)" }}>
              {/* Botón superior de nueva tarea */}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Boton
                  variante="primario"
                  onClick={() => {
                    setModalNuevaTarea(true);
                    setNuevaTareaForzar(false);
                  }}
                >
                  <Plus size={14} style={{ marginRight: 6 }} />
                  Nueva tarea
                </Boton>
              </div>

              {/* 1. Bandeja Por Revisar */}
              <section className={styles.section}>
                <h2 className={styles.sectionTitle} style={{ color: "var(--rc-azul-texto)" }}>
                  Bandeja por revisar ({tareasPorRevisar.length})
                </h2>

                {tareasPorRevisar.length === 0 ? (
                  <Tarjeta
                    variante="vacia"
                    tituloVacio="Todo revisado"
                    textoVacio="No hay tareas pendientes de aprobación en este momento."
                  />
                ) : (
                  <div className={styles.bandejaReviewGrid}>
                    {tareasPorRevisar.map((t) => (
                      <article key={t.id} className={styles.reviewCard}>
                        <div className={styles.reviewHeader}>
                          <span className={styles.reviewPersona}>
                            {t.asignado?.nombre || "Miembro"}
                          </span>
                          <Chip punto="azul">
                            {t.tipo?.rol?.nombre || t.tipo?.nombre || "Trabajo"}
                          </Chip>
                        </div>

                        <div className={styles.reviewTitulo}>{t.titulo}</div>
                        {t.descripcion && (
                          <div style={{ fontSize: 12, color: "var(--rc-texto-secundario)" }}>
                            {t.descripcion}
                          </div>
                        )}

                        {t.nota_persona && (
                          <div className={styles.reviewNota}>
                            <strong>Nota de la persona:</strong> {t.nota_persona}
                          </div>
                        )}

                        <div className={styles.reviewValor}>
                          <span>Valor que se congelará:</span>
                          <span className={styles.reviewValorMonto}>
                            $ {(t.tipo?.precio || 0).toLocaleString("es-CO")}
                          </span>
                        </div>

                        <div className={styles.reviewAcciones}>
                          <Boton
                            variante="peligro"
                            onClick={() => {
                              setTareaARechazar(t);
                              setMotivoRechazo("");
                            }}
                          >
                            Rechazar
                          </Boton>
                          <Boton
                            variante="primario"
                            onClick={() => handleAceptarTarea(t)}
                          >
                            <Check size={14} style={{ marginRight: 4 }} />
                            Aceptar
                          </Boton>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {/* 2. Listado general de tareas con filtros */}
              <section className={styles.section}>
                <div className={styles.sectionHeaderRow}>
                  <h2 className={styles.sectionTitle}>Todas las tareas</h2>

                  {/* Filtros */}
                  <div className={styles.filtrosRow}>
                    <select
                      className={styles.selectCompacto}
                      value={filtroPersona}
                      onChange={(e) => setFiltroPersona(e.target.value)}
                    >
                      <option value="">Todas las personas</option>
                      {miembrosAprobados.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>

                    <select
                      className={styles.selectCompacto}
                      value={filtroEstado}
                      onChange={(e) => setFiltroEstado(e.target.value)}
                    >
                      <option value="">Todos los estados</option>
                      <option value="pendiente">Pendiente</option>
                      <option value="hecha">Por revisar (hecha)</option>
                      <option value="aceptada">Aceptada</option>
                      <option value="rechazada">Rechazada</option>
                      <option value="cancelada">Cancelada</option>
                    </select>
                  </div>
                </div>

                {tareasFiltradas.length === 0 ? (
                  <Tarjeta
                    variante="vacia"
                    tituloVacio="Sin tareas con estos filtros"
                    textoVacio="Intenta ajustando los filtros de persona o estado."
                  />
                ) : (
                  <>
                    <div className={styles.desktopTable}>
                      <Tabla>
                        <thead>
                          <tr>
                            <th>Título</th>
                            <th>Persona</th>
                            <th>Trabajo</th>
                            <th>Estado</th>
                            <th>Valor</th>
                            <th style={{ textAlign: "right" }}>Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tareasFiltradas.map((t) => (
                            <TablaFila key={t.id}>
                              <td>
                                <strong>{t.titulo}</strong>
                                {t.fecha_limite && (
                                  <div style={{ fontSize: 11, color: "var(--rc-texto-secundario)" }}>
                                    Límite: {t.fecha_limite}
                                  </div>
                                )}
                              </td>
                              <td>{t.asignado?.nombre || "—"}</td>
                              <td>{t.tipo?.nombre || "—"}</td>
                              <td>
                                <Estado
                                  variante={
                                    t.estado === "aceptada"
                                      ? "aprobado"
                                      : t.estado === "rechazada" || t.estado === "cancelada"
                                      ? "suspendido"
                                      : "pendiente"
                                  }
                                >
                                  {t.estado === "hecha" ? "por revisar" : t.estado}
                                </Estado>
                              </td>
                              <td>
                                <span className={styles.montoVerde}>
                                  $ {(t.precio_congelado ?? t.tipo?.precio ?? 0).toLocaleString("es-CO")}
                                </span>
                              </td>
                              <td style={{ textAlign: "right" }}>
                                {(t.estado === "pendiente" || t.estado === "rechazada") && (
                                  <Boton
                                    variante="secundario"
                                    onClick={() => handleCancelarTarea(t)}
                                  >
                                    Cancelar
                                  </Boton>
                                )}
                              </td>
                            </TablaFila>
                          ))}
                        </tbody>
                      </Tabla>
                    </div>

                    {/* Móvil */}
                    <div className={styles.mobileCards}>
                      {tareasFiltradas.map((t) => (
                        <article key={t.id} className={styles.mobileCard}>
                          <div className={styles.mobileCardHeader}>
                            <strong>{t.titulo}</strong>
                            <Estado
                              variante={
                                t.estado === "aceptada"
                                  ? "aprobado"
                                  : t.estado === "rechazada" || t.estado === "cancelada"
                                  ? "suspendido"
                                  : "pendiente"
                              }
                            >
                              {t.estado === "hecha" ? "por revisar" : t.estado}
                            </Estado>
                          </div>
                          <div style={{ fontSize: 12, color: "var(--rc-texto-secundario)" }}>
                            Asignado a: <strong>{t.asignado?.nombre || "—"}</strong> ({t.tipo?.nombre})
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span className={styles.montoVerde}>
                              $ {(t.precio_congelado ?? t.tipo?.precio ?? 0).toLocaleString("es-CO")}
                            </span>
                            {(t.estado === "pendiente" || t.estado === "rechazada") && (
                              <Boton
                                variante="secundario"
                                onClick={() => handleCancelarTarea(t)}
                              >
                                Cancelar
                              </Boton>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </section>
            </div>
          )}

          {/* ========================================================= */}
          {/* PESTAÑA 3: FACTURAS                                       */}
          {/* ========================================================= */}
          {pestanaActiva === "facturas" && (
            <section className={styles.section}>
              <div className={styles.sectionHeaderRow}>
                <h2 className={styles.sectionTitle}>Facturación por persona</h2>
              </div>

              {facturas.length === 0 ? (
                <Tarjeta
                  variante="vacia"
                  tituloVacio="Sin facturas activas"
                  textoVacio="Aún no hay registros de facturas para los miembros del equipo."
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--rc-esp-12)" }}>
                  {facturas.map((rf) => {
                    const expandida = personaExpandida === rf.perfil_id;
                    const lineas = rf.factura_abierta?.lineas || [];

                    return (
                      <article key={rf.perfil_id} className={styles.facturaPersonaCard}>
                        <div
                          className={styles.facturaPersonaHeader}
                          onClick={() => setPersonaExpandida(expandida ? null : rf.perfil_id)}
                        >
                          <div>
                            <div style={{ fontWeight: "var(--rc-fw-bold)", fontSize: "var(--rc-fs-cuerpo)" }}>
                              {rf.perfil?.nombre}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--rc-texto-secundario)" }}>
                              {rf.perfil?.correo}
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{ textAlign: "right" }}>
                              <div className={styles.montoVerde} style={{ fontSize: 16 }}>
                                $ {rf.total_pendiente.toLocaleString("es-CO")}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--rc-texto-secundario)" }}>
                                {lineas.length} trabajos por pagar
                              </div>
                            </div>
                            {expandida ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </div>

                        {expandida && (
                          <div className={styles.lineasDesplegadas}>
                            {lineas.length === 0 ? (
                              <div style={{ fontSize: 12, color: "var(--rc-texto-secundario)" }}>
                                No hay trabajos pendientes de pago en la factura abierta.
                              </div>
                            ) : (
                              <>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  {lineas.map((linea) => (
                                    <div
                                      key={linea.id}
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        fontSize: 12,
                                        padding: "4px 0",
                                      }}
                                    >
                                      <span>
                                        {linea.titulo} ({linea.tipo?.nombre})
                                      </span>
                                      <span style={{ fontWeight: "var(--rc-fw-medium)" }}>
                                        $ {(linea.precio_congelado || 0).toLocaleString("es-CO")}
                                      </span>
                                    </div>
                                  ))}
                                </div>

                                {rf.factura_abierta && (
                                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                                    <Boton
                                      variante="primario"
                                      onClick={() =>
                                        setFacturaAPagar({
                                          id: rf.factura_abierta!.id,
                                          total: rf.total_pendiente,
                                          persona: rf.perfil.nombre,
                                        })
                                      }
                                    >
                                      Marcar factura pagada ($ {rf.total_pendiente.toLocaleString("es-CO")})
                                    </Boton>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* ========================================================= */}
          {/* PESTAÑA 4: MIEMBROS                                       */}
          {/* ========================================================= */}
          {pestanaActiva === "miembros" && (
            <>
              {/* Cuentas por aprobar */}
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>
                  Cuentas por aprobar ({pendientesMiembros.length})
                </h2>

                {pendientesMiembros.length === 0 ? (
                  <Tarjeta
                    variante="vacia"
                    tituloVacio="Sin pendientes"
                    textoVacio="No hay cuentas esperando aprobación en este momento."
                  />
                ) : (
                  <>
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
                          {pendientesMiembros.map((m) => (
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
                                  {roles
                                    .filter((r) => r.activo)
                                    .map((rol) => {
                                      const seleccionado = (rolesPendientes[m.id] || []).includes(rol.id);
                                      return (
                                        <button
                                          key={rol.id}
                                          type="button"
                                          className={`${styles.roleToggle} ${seleccionado ? styles.roleToggleActive : ""}`}
                                          style={{
                                            borderLeft: seleccionado ? `3px solid ${rol.color}` : "none",
                                            color: seleccionado ? "var(--rc-gris-900)" : "inherit",
                                          }}
                                          onClick={() => handleToggleRolPendiente(m.id, rol.id)}
                                        >
                                          {rol.nombre}
                                        </button>
                                      );
                                    })}
                                </div>
                              </td>
                              <td>
                                <Boton variante="primario" onClick={() => handleAprobar(m.id)}>
                                  <Check size={14} style={{ marginRight: "4px" }} />
                                  Aprobar acceso
                                </Boton>
                              </td>
                            </TablaFila>
                          ))}
                        </tbody>
                      </Tabla>
                    </div>

                    <div className={styles.mobileCards}>
                      {pendientesMiembros.map((m) => (
                        <div key={m.id} className={styles.mobileCard}>
                          <div className={styles.mobileCardHeader}>
                            <div>
                              <div className={styles.mobileCardName}>{m.nombre}</div>
                              <div className={styles.mobileCardEmail}>{m.correo}</div>
                            </div>
                            <Estado variante="pendiente">Pendiente</Estado>
                          </div>
                          <div>
                            <div style={{ fontSize: "12px", color: "var(--rc-texto-secundario)", marginBottom: "6px" }}>
                              Roles iniciales:
                            </div>
                            <div className={styles.roleSelectContainer}>
                              {roles
                                .filter((r) => r.activo)
                                .map((rol) => {
                                  const seleccionado = (rolesPendientes[m.id] || []).includes(rol.id);
                                  return (
                                    <button
                                      key={rol.id}
                                      type="button"
                                      className={`${styles.roleToggle} ${seleccionado ? styles.roleToggleActive : ""}`}
                                      style={{
                                        borderLeft: seleccionado ? `3px solid ${rol.color}` : "none",
                                        color: seleccionado ? "var(--rc-gris-900)" : "inherit",
                                      }}
                                      onClick={() => handleToggleRolPendiente(m.id, rol.id)}
                                    >
                                      {rol.nombre}
                                    </button>
                                  );
                                })}
                            </div>
                          </div>
                          <Boton variante="primario" onClick={() => handleAprobar(m.id)}>
                            <Check size={14} style={{ marginRight: "4px" }} />
                            Aprobar acceso
                          </Boton>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>

              {/* Miembros del equipo */}
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>
                  Miembros activos y suspendidos ({aprobadosYSuspendidos.length})
                </h2>

                <div className={styles.desktopTable}>
                  <Tabla>
                    <thead>
                      <tr>
                        <th>Nombre y correo</th>
                        <th>Estado</th>
                        <th>Roles de trabajo</th>
                        <th>Administrador</th>
                        <th style={{ textAlign: "right" }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aprobadosYSuspendidos.map((m) => {
                        const rolesActualesIds = m.roles?.map((r) => r.id) || [];
                        return (
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
                              <Estado variante={m.estado === "aprobado" ? "aprobado" : "suspendido"}>
                                {m.estado}
                              </Estado>
                            </td>
                            <td>
                              <div className={styles.roleSelectContainer}>
                                {roles
                                  .filter((r) => r.activo)
                                  .map((rol) => {
                                    const activo = rolesActualesIds.includes(rol.id);
                                    return (
                                      <button
                                        key={rol.id}
                                        type="button"
                                        className={`${styles.roleToggle} ${activo ? styles.roleToggleActive : ""}`}
                                        style={{
                                          borderLeft: activo ? `3px solid ${rol.color}` : "none",
                                          color: activo ? "var(--rc-gris-900)" : "inherit",
                                        }}
                                        onClick={() => handleToggleRol(m, rol.id)}
                                      >
                                        {rol.nombre}
                                      </button>
                                    );
                                  })}
                              </div>
                            </td>
                            <td>
                              <button
                                type="button"
                                className={`${styles.roleToggle} ${m.es_admin ? styles.roleToggleActive : ""}`}
                                style={{
                                  borderLeft: m.es_admin ? "3px solid #7C3AED" : "none",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                                onClick={() => handleToggleAdmin(m.id, m.es_admin)}
                              >
                                <Shield size={11} />
                                {m.es_admin ? "Admin" : "Hacer admin"}
                              </button>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <div className={styles.actionsCell} style={{ justifyContent: "flex-end" }}>
                                {m.estado === "aprobado" ? (
                                  <Boton variante="peligro" onClick={() => handleSuspender(m.id)}>
                                    Suspender
                                  </Boton>
                                ) : (
                                  <Boton variante="secundario" onClick={() => handleReactivar(m.id)}>
                                    Reactivar
                                  </Boton>
                                )}
                              </div>
                            </td>
                          </TablaFila>
                        );
                      })}
                    </tbody>
                  </Tabla>
                </div>

                {/* Móvil */}
                <div className={styles.mobileCards}>
                  {aprobadosYSuspendidos.map((m) => {
                    const rolesActualesIds = m.roles?.map((r) => r.id) || [];
                    return (
                      <div key={m.id} className={styles.mobileCard}>
                        <div className={styles.mobileCardHeader}>
                          <div>
                            <div className={styles.mobileCardName}>{m.nombre}</div>
                            <div className={styles.mobileCardEmail}>{m.correo}</div>
                          </div>
                          <Estado variante={m.estado === "aprobado" ? "aprobado" : "suspendido"}>
                            {m.estado}
                          </Estado>
                        </div>
                        <div>
                          <div style={{ fontSize: "12px", color: "var(--rc-texto-secundario)", marginBottom: "6px" }}>
                            Roles asignados:
                          </div>
                          <div className={styles.roleSelectContainer}>
                            {roles
                              .filter((r) => r.activo)
                              .map((rol) => {
                                const activo = rolesActualesIds.includes(rol.id);
                                return (
                                  <button
                                    key={rol.id}
                                    type="button"
                                    className={`${styles.roleToggle} ${activo ? styles.roleToggleActive : ""}`}
                                    style={{
                                      borderLeft: activo ? `3px solid ${rol.color}` : "none",
                                      color: activo ? "var(--rc-gris-900)" : "inherit",
                                    }}
                                    onClick={() => handleToggleRol(m, rol.id)}
                                  >
                                    {rol.nombre}
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <button
                            type="button"
                            className={`${styles.roleToggle} ${m.es_admin ? styles.roleToggleActive : ""}`}
                            style={{
                              borderLeft: m.es_admin ? "3px solid #7C3AED" : "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                            onClick={() => handleToggleAdmin(m.id, m.es_admin)}
                          >
                            <Shield size={11} />
                            {m.es_admin ? "Admin" : "Hacer admin"}
                          </button>
                          {m.estado === "aprobado" ? (
                            <Boton variante="peligro" onClick={() => handleSuspender(m.id)}>
                              Suspender
                            </Boton>
                          ) : (
                            <Boton variante="secundario" onClick={() => handleReactivar(m.id)}>
                              Reactivar
                            </Boton>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Crear nuevo rol */}
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Crear nuevo rol de equipo</h2>
                <form onSubmit={handleCrearRol} className={styles.newRoleForm}>
                  <input
                    type="text"
                    placeholder="Nombre del rol (ej. Productor)"
                    className={styles.roleInput}
                    value={nuevoNombre}
                    onChange={(e) => setNuevoNombre(e.target.value)}
                    required
                  />
                  <input
                    type="text"
                    placeholder="clave_interna"
                    className={styles.roleInput}
                    value={nuevaClave}
                    onChange={(e) => setNuevaClave(e.target.value)}
                    required
                  />
                  <input
                    type="color"
                    value={nuevoColor}
                    onChange={(e) => setNuevoColor(e.target.value)}
                    title="Color del rol"
                    style={{ height: "32px", width: "36px", border: "none", cursor: "pointer", background: "none" }}
                  />
                  <Boton variante="primario" type="submit">
                    <Plus size={14} style={{ marginRight: "4px" }} />
                    Crear rol
                  </Boton>
                </form>
              </section>
            </>
          )}
        </>
      )}

      {/* Modal Nuevo Trabajo */}
      {modalNuevoTrabajo && (
        <Modal
          abierto={true}
          titulo="Nuevo tipo de trabajo"
          descripcion="Define un nuevo trabajo disponible para asignación y facturación."
          onCerrar={() => setModalNuevoTrabajo(false)}
          accionPrimaria={
            <Boton
              variante="primario"
              cargando={guardandoTrabajo}
              onClick={handleCrearTrabajo}
            >
              Guardar trabajo
            </Boton>
          }
          accionSecundaria={
            <Boton
              variante="secundario"
              onClick={() => setModalNuevoTrabajo(false)}
              disabled={guardandoTrabajo}
            >
              Cancelar
            </Boton>
          }
        >
          <div className={styles.modalForm}>
            <Campo
              etiqueta="Nombre del trabajo"
              placeholder="Ej. Animación Motion Graphics"
              value={nuevoTrabNombre}
              onChange={(e) => setNuevoTrabNombre(e.target.value)}
              disabled={guardandoTrabajo}
            />
            <Campo
              etiqueta="Clave única (minúsculas y guiones bajos)"
              placeholder="ej. animacion_motion"
              value={nuevoTrabClave}
              onChange={(e) => setNuevoTrabClave(e.target.value)}
              disabled={guardandoTrabajo}
            />
            <div>
              <label style={{ fontSize: 13, fontWeight: "var(--rc-fw-medio)", display: "block", marginBottom: 4 }}>
                Rol que lo realiza (opcional)
              </label>
              <select
                className={styles.selectCompacto}
                style={{ width: "100%", height: 36 }}
                value={nuevoTrabRolId}
                onChange={(e) => setNuevoTrabRolId(e.target.value === "" ? "" : Number(e.target.value))}
                disabled={guardandoTrabajo}
              >
                <option value="">Cualquier rol</option>
                {roles.filter((r) => r.activo).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </div>
            <Campo
              etiqueta="Precio por trabajo en pesos colombianos (COP)"
              type="number"
              min={0}
              max={100000000}
              placeholder="0"
              value={nuevoTrabPrecio.toString()}
              onChange={(e) => setNuevoTrabPrecio(parseInt(e.target.value, 10) || 0)}
              disabled={guardandoTrabajo}
            />
          </div>
        </Modal>
      )}

      {/* Modal Nueva Tarea */}
      {modalNuevaTarea && (
        <Modal
          abierto={true}
          titulo="Nueva tarea"
          descripcion="Asigna una tarea a un miembro del equipo según su rol."
          onCerrar={() => setModalNuevaTarea(false)}
          accionPrimaria={
            <Boton
              variante="primario"
              cargando={creandoTarea}
              onClick={handleCrearTareaSubmit}
            >
              Crear tarea
            </Boton>
          }
          accionSecundaria={
            <Boton
              variante="secundario"
              onClick={() => setModalNuevaTarea(false)}
              disabled={creandoTarea}
            >
              Cancelar
            </Boton>
          }
        >
          <div className={styles.modalForm}>
            <div>
              <label style={{ fontSize: 13, fontWeight: "var(--rc-fw-medio)", display: "block", marginBottom: 4 }}>
                Tipo de trabajo
              </label>
              <select
                className={styles.selectCompacto}
                style={{ width: "100%", height: 36 }}
                value={nuevaTareaTipoId}
                onChange={(e) => setNuevaTareaTipoId(e.target.value === "" ? "" : Number(e.target.value))}
                disabled={creandoTarea}
              >
                <option value="">Selecciona un tipo de trabajo...</option>
                {trabajos.filter((t) => t.activo).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre} {t.rol ? `(${t.rol.nombre})` : ""} — $ {t.precio.toLocaleString("es-CO")}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: "var(--rc-fw-medio)", display: "block", marginBottom: 4 }}>
                Persona asignada
              </label>
              <select
                className={styles.selectCompacto}
                style={{ width: "100%", height: 36 }}
                value={nuevaTareaAsignadoA}
                onChange={(e) => setNuevaTareaAsignadoA(e.target.value)}
                disabled={creandoTarea}
              >
                <option value="">Selecciona una persona...</option>
                {miembrosConRol.length > 0 && (
                  <optgroup label="Personas con el rol requerido">
                    {miembrosConRol.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                      </option>
                    ))}
                  </optgroup>
                )}
                {miembrosSinRol.length > 0 && (
                  <optgroup label="Otras personas (sin el rol)">
                    {miembrosSinRol.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre} (sin rol para este trabajo)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {!personaSeleccionadaTieneRol && nuevaTareaAsignadoA && (
              <div className={styles.advertenciaRol}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: "bold" }}>
                  <AlertTriangle size={14} />
                  Atención
                </div>
                Esta persona no tiene el rol de este trabajo. Se requerirá forzar la asignación para continuar.
                <div style={{ marginTop: 6 }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={nuevaTareaForzar}
                      onChange={(e) => setNuevaTareaForzar(e.target.checked)}
                    />
                    Asignar de todos modos (forzar)
                  </label>
                </div>
              </div>
            )}

            <Campo
              etiqueta="Título de la tarea"
              placeholder="Ej. Grabar toma en exteriores"
              value={nuevaTareaTitulo}
              onChange={(e) => setNuevaTareaTitulo(e.target.value.slice(0, 120))}
              disabled={creandoTarea}
            />

            <Campo
              etiqueta="Descripción (opcional)"
              como="textarea"
              filas={3}
              placeholder="Indicaciones, requisitos o especificaciones..."
              value={nuevaTareaDescripcion}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
                setNuevaTareaDescripcion(e.target.value.slice(0, 1000))
              }
              disabled={creandoTarea}
            />

            <Campo
              etiqueta="Fecha límite (opcional)"
              type="date"
              value={nuevaTareaFechaLimite}
              onChange={(e) => setNuevaTareaFechaLimite(e.target.value)}
              disabled={creandoTarea}
            />
          </div>
        </Modal>
      )}

      {/* Modal Rechazar Tarea */}
      {tareaARechazar && (
        <Modal
          abierto={true}
          titulo="Rechazar tarea"
          descripcion={`Indica el motivo de rechazo para "${tareaARechazar.titulo}". La persona podrá corregirla y volver a enviarla.`}
          onCerrar={() => setTareaARechazar(null)}
          accionPrimaria={
            <Boton
              variante="peligro"
              cargando={rechazando}
              onClick={handleRechazarTareaConfirm}
            >
              Rechazar tarea
            </Boton>
          }
          accionSecundaria={
            <Boton
              variante="secundario"
              onClick={() => setTareaARechazar(null)}
              disabled={rechazando}
            >
              Cancelar
            </Boton>
          }
        >
          <div className={styles.modalForm}>
            <Campo
              etiqueta="Motivo del rechazo (obligatorio, hasta 500 caracteres)"
              como="textarea"
              filas={3}
              placeholder="Explica qué correcciones son necesarias..."
              value={motivoRechazo}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
                setMotivoRechazo(e.target.value.slice(0, 500))
              }
              disabled={rechazando}
            />
            <div style={{ fontSize: 11, color: "var(--rc-texto-secundario)", textAlign: "right" }}>
              {motivoRechazo.length} / 500
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Pagar Factura */}
      {facturaAPagar && (
        <Modal
          abierto={true}
          titulo="Confirmar pago de factura"
          descripcion={`¿Deseas marcar como pagada la factura abierta de ${facturaAPagar.persona} por valor de $ ${facturaAPagar.total.toLocaleString("es-CO")}?`}
          onCerrar={() => setFacturaAPagar(null)}
          accionPrimaria={
            <Boton
              variante="primario"
              cargando={pagandoFactura}
              onClick={handlePagarFacturaConfirm}
            >
              Confirmar pago
            </Boton>
          }
          accionSecundaria={
            <Boton
              variante="secundario"
              onClick={() => setFacturaAPagar(null)}
              disabled={pagandoFactura}
            >
              Cancelar
            </Boton>
          }
        >
          <p style={{ fontSize: 13, color: "var(--rc-texto-secundario)", marginTop: 8 }}>
            Al confirmar, esta factura se archivará en el historial de pagadas y la próxima tarea aceptada de esta persona abrirá un nuevo corte automáticamente.
          </p>
        </Modal>
      )}
    </div>
  );
}
