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
  BarChart2,
  Users2,
  Calendar,
  Edit2,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  Perfil,
  Rol,
  TipoTrabajo,
  Cliente,
  Tarea,
  ResumenFacturasPersona,
  EstadisticasAdminResponse,
  UnidadTrabajo,
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
import { GraficaLinea, GraficaBarras } from "@/components/ui/graficos";
import styles from "./admin.module.css";

type PresetFechaAdmin = "hoy" | "7dias" | "este_mes" | "mes_pasado" | "este_ano" | "todo" | "personalizado";

function obtenerFechasPresetAdmin(preset: PresetFechaAdmin): { desde?: string; hasta?: string } {
  const ahora = new Date();
  const formatYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dia}`;
  };

  const hoyStr = formatYMD(ahora);

  switch (preset) {
    case "hoy":
      return { desde: hoyStr, hasta: hoyStr };
    case "7dias": {
      const d = new Date(ahora);
      d.setDate(d.getDate() - 6);
      return { desde: formatYMD(d), hasta: hoyStr };
    }
    case "este_mes": {
      const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      return { desde: formatYMD(inicio), hasta: hoyStr };
    }
    case "mes_pasado": {
      const inicio = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
      const fin = new Date(ahora.getFullYear(), ahora.getMonth(), 0);
      return { desde: formatYMD(inicio), hasta: formatYMD(fin) };
    }
    case "este_ano": {
      const inicio = new Date(ahora.getFullYear(), 0, 1);
      return { desde: formatYMD(inicio), hasta: hoyStr };
    }
    case "todo":
    default:
      return {};
  }
}

export default function AdminPage() {
  const [pestanaActiva, setPestanaActiva] = useState("trabajos");
  const [cargando, setCargando] = useState(true);
  const { mostrarAviso } = useAviso();

  // Datos globales
  const [miembros, setMiembros] = useState<Perfil[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [trabajos, setTrabajos] = useState<TipoTrabajo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
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
  const [nuevoTrabUnidad, setNuevoTrabUnidad] = useState<UnidadTrabajo>("trabajo");
  const [guardandoTrabajo, setGuardandoTrabajo] = useState(false);

  // Estados locales - Clientes
  const [modalNuevoCliente, setModalNuevoCliente] = useState(false);
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState("");
  const [guardandoCliente, setGuardandoCliente] = useState(false);
  const [clienteAEditar, setClienteAEditar] = useState<Cliente | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  // Estados locales - Tareas
  const [filtroPersona, setFiltroPersona] = useState<string>("");
  const [filtroEstado, setFiltroEstado] = useState<string>("");
  const [modalNuevaTarea, setModalNuevaTarea] = useState(false);
  const [nuevaTareaTipoId, setNuevaTareaTipoId] = useState<number | "">("");
  const [nuevaTareaClienteId, setNuevaTareaClienteId] = useState<number | "">("");
  const [nuevaTareaAsignadoA, setNuevaTareaAsignadoA] = useState<string>("");
  const [nuevaTareaTitulo, setNuevaTareaTitulo] = useState("");
  const [nuevaTareaDescripcion, setNuevaTareaDescripcion] = useState("");
  const [nuevaTareaFechaLimite, setNuevaTareaFechaLimite] = useState("");
  const [nuevaTareaForzar, setNuevaTareaForzar] = useState(false);
  const [creandoTarea, setCreandoTarea] = useState(false);

  // Cliente al vuelo desde modal Nueva Tarea
  const [modalCrearClienteAlVuelo, setModalCrearClienteAlVuelo] = useState(false);
  const [clienteAlVueloNombre, setClienteAlVueloNombre] = useState("");
  const [guardandoClienteAlVuelo, setGuardandoClienteAlVuelo] = useState(false);

  // Modal Aceptar Tarea con corrección opcional de minutos
  const [modalAceptarTarea, setModalAceptarTarea] = useState<Tarea | null>(null);
  const [minutosAceptarInput, setMinutosAceptarInput] = useState<string>("");
  const [aceptandoTarea, setAceptandoTarea] = useState(false);

  // Modal Rechazar Tarea
  const [tareaARechazar, setTareaARechazar] = useState<Tarea | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazando, setRechazando] = useState(false);

  // Estados locales - Estadísticas
  const [statsAdmin, setStatsAdmin] = useState<EstadisticasAdminResponse | null>(null);
  const [cargandoStatsAdmin, setCargandoStatsAdmin] = useState(false);
  const [presetStats, setPresetStats] = useState<PresetFechaAdmin>("este_mes");
  const [fechaDesdeStats, setFechaDesdeStats] = useState("");
  const [fechaHastaStats, setFechaHastaStats] = useState("");
  const [agruparStats, setAgruparStats] = useState("");
  const [filtroPersonaStats, setFiltroPersonaStats] = useState("");
  const [filtroClienteStats, setFiltroClienteStats] = useState("");
  const [filtroTipoStats, setFiltroTipoStats] = useState<number | "">("");

  // Modal Pagar Factura
  const [facturaAPagar, setFacturaAPagar] = useState<{ id: number; total: number; persona: string } | null>(null);
  const [pagandoFactura, setPagandoFactura] = useState(false);
  const [personaExpandida, setPersonaExpandida] = useState<string | null>(null);

  // Formulario nuevo rol (Pestaña Miembros)
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaClave, setNuevaClave] = useState("");
  const [nuevoColor, setNuevoColor] = useState("#2F7FE0");
  const [rolesPendientes, setRolesPendientes] = useState<Record<string, number[]>>({});

  const formatearFechaHora = (iso?: string | null) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("es-CO", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  const cargarDatos = useCallback(async () => {
    try {
      const [mList, rList, tList, tareasRes, fList, cList] = await Promise.all([
        api.adminGetMiembros(),
        api.adminGetRoles(),
        api.adminGetTrabajos(),
        api.adminGetTareas(),
        api.adminGetFacturas(),
        api.adminGetClientes(),
      ]);
      setMiembros(mList);
      setRoles(rList);
      setTrabajos(tList);
      setTareas(tareasRes?.tareas || []);
      setPorRevisarCount(tareasRes?.por_revisar || 0);
      setFacturas(fList);
      setClientes(cList);

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

  const cargarEstadisticasAdmin = useCallback(async (
    p: PresetFechaAdmin,
    d?: string,
    h?: string,
    agr?: string,
    pers?: string,
    cli?: string,
    tip?: number | ""
  ) => {
    setCargandoStatsAdmin(true);
    try {
      let desdeParam = d;
      let hastaParam = h;
      if (p !== "personalizado") {
        const fechas = obtenerFechasPresetAdmin(p);
        desdeParam = fechas.desde;
        hastaParam = fechas.hasta;
      }
      const data = await api.adminGetEstadisticas({
        desde: desdeParam,
        hasta: hastaParam,
        agrupar: agr || undefined,
        persona_id: pers || undefined,
        cliente_id: cli || undefined,
        tipo_id: tip ? Number(tip) : undefined,
      });
      setStatsAdmin(data);
    } catch {
      mostrarAviso({
        tipo: "error",
        titulo: "Error al cargar estadísticas",
        texto: "No se pudieron calcular las estadísticas de administración.",
      });
    } finally {
      setCargandoStatsAdmin(false);
    }
  }, [mostrarAviso]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarDatos();
  }, [cargarDatos]);

  // F3C: Leer parámetros de URL al montar (?pestana=estadisticas&persona=<id>)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const p = sp.get("pestana");
      const pers = sp.get("persona");
      if (p) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPestanaActiva(p);
        // Atajo desde el perfil de una persona: abre "Nueva tarea" con esa persona ya elegida
        if (p === "tareas" && sp.get("nueva") === "1") {
          if (pers) setNuevaTareaAsignadoA(pers);
          setNuevaTareaForzar(false);
          setModalNuevaTarea(true);
        }
        if (p === "estadisticas") {
          if (pers) {
            setFiltroPersonaStats(pers);
            cargarEstadisticasAdmin("este_mes", undefined, undefined, undefined, pers);
          } else {
            cargarEstadisticasAdmin("este_mes");
          }
        }
      }
    }
  }, [cargarEstadisticasAdmin]);

  useEffect(() => {
    if (pestanaActiva === "estadisticas" && !statsAdmin && !cargandoStatsAdmin) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      cargarEstadisticasAdmin("este_mes", undefined, undefined, undefined, filtroPersonaStats || undefined);
    }
  }, [pestanaActiva, statsAdmin, cargandoStatsAdmin, cargarEstadisticasAdmin, filtroPersonaStats]);

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

  const handleCambiarUnidadTrabajo = async (trabajoId: number, nuevaUnidad: UnidadTrabajo) => {
    try {
      await api.adminPatchTrabajo(trabajoId, { unidad: nuevaUnidad });
      mostrarAviso({
        tipo: "exito",
        titulo: "Unidad actualizada",
        texto: `El trabajo ahora se cobra por ${nuevaUnidad === "minuto" ? "minuto" : "trabajo"}.`,
      });
      await cargarDatos();
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({ tipo: "error", titulo: "Error", texto: e.message || "No se pudo actualizar la unidad." });
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
        unidad: nuevoTrabUnidad,
        activo: true,
        orden: trabajos.length + 1,
      });
      mostrarAviso({ tipo: "exito", titulo: "Trabajo creado exitosamente" });
      setModalNuevoTrabajo(false);
      setNuevoTrabClave("");
      setNuevoTrabNombre("");
      setNuevoTrabRolId("");
      setNuevoTrabPrecio(0);
      setNuevoTrabUnidad("trabajo");
      await cargarDatos();
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({ tipo: "error", titulo: "Error al crear trabajo", texto: e.message || "Verifica los datos." });
    } finally {
      setGuardandoTrabajo(false);
    }
  };

  // ==========================================
  // Acciones: Pestaña Clientes
  // ==========================================
  const handleCrearCliente = async () => {
    const limpio = nuevoClienteNombre.trim();
    if (limpio.length < 1 || limpio.length > 80) {
      mostrarAviso({ tipo: "error", titulo: "Nombre inválido", texto: "El nombre debe tener entre 1 y 80 caracteres." });
      return;
    }
    setGuardandoCliente(true);
    try {
      await api.adminPostCliente(limpio);
      mostrarAviso({ tipo: "exito", titulo: "Cliente creado", texto: `El cliente "${limpio}" fue creado con éxito.` });
      setModalNuevoCliente(false);
      setNuevoClienteNombre("");
      const clis = await api.adminGetClientes();
      setClientes(clis);
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({ tipo: "error", titulo: "Error al crear cliente", texto: e.message || "Verifica los datos." });
    } finally {
      setGuardandoCliente(false);
    }
  };

  const handleRenombrarCliente = async () => {
    if (!clienteAEditar) return;
    const limpio = nombreEditado.trim();
    if (limpio.length < 1 || limpio.length > 80) {
      mostrarAviso({ tipo: "error", titulo: "Nombre inválido", texto: "El nombre debe tener entre 1 y 80 caracteres." });
      return;
    }
    setGuardandoEdicion(true);
    try {
      await api.adminPatchCliente(clienteAEditar.id, { nombre: limpio });
      mostrarAviso({ tipo: "exito", titulo: "Cliente actualizado", texto: "El nombre fue modificado con éxito." });
      setClienteAEditar(null);
      setNombreEditado("");
      const clis = await api.adminGetClientes();
      setClientes(clis);
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({ tipo: "error", titulo: "Error al renombrar", texto: e.message || "Error al actualizar." });
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const handleToggleClienteActivo = async (c: Cliente) => {
    try {
      await api.adminPatchCliente(c.id, { activo: !c.activo });
      mostrarAviso({
        tipo: "info",
        titulo: "Estado actualizado",
        texto: `El cliente "${c.nombre}" ahora está ${!c.activo ? "activo" : "inactivo"}.`,
      });
      const clis = await api.adminGetClientes();
      setClientes(clis);
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({ tipo: "error", titulo: "Error", texto: e.message || "No se pudo cambiar el estado." });
    }
  };

  const handleCrearClienteAlVuelo = async (e: React.FormEvent) => {
    e.preventDefault();
    const limpio = clienteAlVueloNombre.trim();
    if (limpio.length < 1 || limpio.length > 80) {
      mostrarAviso({ tipo: "error", titulo: "Nombre inválido", texto: "El nombre debe tener entre 1 y 80 caracteres." });
      return;
    }
    setGuardandoClienteAlVuelo(true);
    try {
      const nuevo = await api.adminPostCliente(limpio);
      mostrarAviso({ tipo: "exito", titulo: "Cliente creado", texto: `El cliente "${limpio}" fue creado y seleccionado.` });
      const clis = await api.adminGetClientes();
      setClientes(clis);
      setNuevaTareaClienteId(nuevo.id);
      setModalCrearClienteAlVuelo(false);
      setClienteAlVueloNombre("");
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({ tipo: "error", titulo: "Error", texto: e.message || "No se pudo crear el cliente." });
    } finally {
      setGuardandoClienteAlVuelo(false);
    }
  };

  // ==========================================
  // Acciones: Pestaña Tareas
  // ==========================================
  const handleAbrirAceptarTarea = (tarea: Tarea) => {
    setModalAceptarTarea(tarea);
    setMinutosAceptarInput(tarea.cantidad ? String(tarea.cantidad) : "1");
  };

  const handleConfirmarAceptarTarea = async () => {
    if (!modalAceptarTarea) return;
    const esMinuto = modalAceptarTarea.tipo?.unidad === "minuto";
    let cant: number | undefined = undefined;
    if (esMinuto) {
      const num = parseInt(minutosAceptarInput, 10);
      if (isNaN(num) || num < 1 || num > 1440) {
        mostrarAviso({
          tipo: "error",
          titulo: "Minutos inválidos",
          texto: "Los minutos aceptados deben ser un número entre 1 y 1440.",
        });
        return;
      }
      cant = num;
    }
    setAceptandoTarea(true);
    try {
      await api.adminAceptarTarea(modalAceptarTarea.id, cant);
      mostrarAviso({
        tipo: "exito",
        titulo: "Tarea aceptada",
        texto: `La tarea fue aceptada y su valor congelado en la factura.`,
      });
      setModalAceptarTarea(null);
      await cargarDatos();
    } catch (err: unknown) {
      const e = err as { message?: string };
      mostrarAviso({
        tipo: "error",
        titulo: "No se pudo aceptar",
        texto: e.message || "Error al aceptar tarea.",
      });
    } finally {
      setAceptandoTarea(false);
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
        cliente_id: nuevaTareaClienteId === "" ? null : Number(nuevaTareaClienteId),
        asignado_a: nuevaTareaAsignadoA,
        titulo: nuevaTareaTitulo.trim(),
        descripcion: nuevaTareaDescripcion.trim() || undefined,
        fecha_limite: nuevaTareaFechaLimite || undefined,
        forzar: nuevaTareaForzar,
      });
      mostrarAviso({ tipo: "exito", titulo: "Tarea creada y asignada" });
      setModalNuevaTarea(false);
      setNuevaTareaTipoId("");
      setNuevaTareaClienteId("");
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
    { id: "clientes", etiqueta: <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Users2 size={14} /> Clientes</span> },
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
    { id: "estadisticas", etiqueta: <span style={{ display: "flex", alignItems: "center", gap: 6 }}><BarChart2 size={14} /> Estadísticas</span> },
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
                      <th>Se cobra por</th>
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
                          <select
                            className={styles.selectCompacto}
                            value={t.unidad || "trabajo"}
                            onChange={(e) =>
                              handleCambiarUnidadTrabajo(t.id, e.target.value as UnidadTrabajo)
                            }
                          >
                            <option value="trabajo">Por trabajo</option>
                            <option value="minuto">Por minuto</option>
                          </select>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
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
                            <span style={{ fontSize: 10, color: "var(--rc-texto-secundario)", textAlign: "right" }}>
                              {t.unidad === "minuto" ? "COP por minuto" : "COP por trabajo"}
                            </span>
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

                    <div>
                      <label style={{ fontSize: 11, color: "var(--rc-texto-secundario)", display: "block", marginBottom: 4 }}>
                        Se cobra por
                      </label>
                      <select
                        className={styles.selectCompacto}
                        style={{ width: "100%" }}
                        value={t.unidad || "trabajo"}
                        onChange={(e) =>
                          handleCambiarUnidadTrabajo(t.id, e.target.value as UnidadTrabajo)
                        }
                      >
                        <option value="trabajo">Por trabajo</option>
                        <option value="minuto">Por minuto</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: 11, color: "var(--rc-texto-secundario)", display: "block", marginBottom: 4 }}>
                        Precio ({t.unidad === "minuto" ? "COP por minuto" : "COP por trabajo"})
                      </label>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
                          <span>$</span>
                          <input
                            type="number"
                            min={0}
                            max={100000000}
                            className={styles.inputPrecio}
                            style={{ width: "100%" }}
                            value={preciosEditados[t.id] ?? t.precio}
                            onChange={(e) =>
                              setPreciosEditados((prev) => ({
                                ...prev,
                                ...{ [t.id]: Math.max(0, parseInt(e.target.value, 10) || 0) },
                              }))
                            }
                            onBlur={() => handleGuardarPrecio(t)}
                          />
                        </div>
                        <Boton
                          variante="secundario"
                          disabled={preciosEditados[t.id] === t.precio}
                          onClick={() => handleGuardarPrecio(t)}
                        >
                          Guardar
                        </Boton>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* ========================================================= */}
          {/* PESTAÑA: CLIENTES                                         */}
          {/* ========================================================= */}
          {pestanaActiva === "clientes" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--rc-esp-20)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <div>
                  <h2 className={styles.sectionTitle}>Clientes</h2>
                  <div style={{ fontSize: "var(--rc-fs-secundario)", color: "var(--rc-texto-secundario)" }}>
                    Gestiona los clientes para vincularlos a tareas y reportes de facturación
                  </div>
                </div>
                <Boton
                  variante="primario"
                  onClick={() => {
                    setNuevoClienteNombre("");
                    setModalNuevoCliente(true);
                  }}
                >
                  <Plus size={14} style={{ marginRight: 6 }} />
                  Nuevo cliente
                </Boton>
              </div>

              <section className={styles.section}>
                {clientes.length === 0 ? (
                  <Tarjeta
                    variante="vacia"
                    tituloVacio="Sin clientes registrados"
                    textoVacio="Crea clientes para asociar a los trabajos y filtrar estadísticas."
                  />
                ) : (
                  <>
                    <div className={styles.desktopTable}>
                      <Tabla>
                        <thead>
                          <tr>
                            <th>Nombre del cliente</th>
                            <th>Estado</th>
                            <th>Fecha de creación</th>
                            <th style={{ textAlign: "right" }}>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clientes.map((c) => (
                            <TablaFila key={c.id}>
                              <td>
                                <strong>{c.nombre}</strong>
                              </td>
                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <Interruptor
                                    checked={c.activo}
                                    onCheckedChange={() => handleToggleClienteActivo(c)}
                                  />
                                  <span style={{ fontSize: 12, color: c.activo ? "var(--rc-verde-texto)" : "var(--rc-texto-secundario)" }}>
                                    {c.activo ? "Activo" : "Inactivo"}
                                  </span>
                                </div>
                              </td>
                              <td style={{ fontSize: "12px", color: "var(--rc-texto-secundario)" }}>
                                {formatearFechaHora(c.creado_en)}
                              </td>
                              <td style={{ textAlign: "right" }}>
                                <Boton
                                  variante="secundario"
                                  tamano="sm"
                                  onClick={() => {
                                    setClienteAEditar(c);
                                    setNombreEditado(c.nombre);
                                  }}
                                >
                                  <Edit2 size={13} style={{ marginRight: 4 }} />
                                  Renombrar
                                </Boton>
                              </td>
                            </TablaFila>
                          ))}
                        </tbody>
                      </Tabla>
                    </div>

                    <div className={styles.mobileCards}>
                      {clientes.map((c) => (
                        <article key={c.id} className={styles.mobileCard}>
                          <div className={styles.mobileCardHeader}>
                            <div>
                              <div className={styles.mobileCardName}>{c.nombre}</div>
                              <div className={styles.mobileCardEmail}>
                                Creado el {formatearFechaHora(c.creado_en)}
                              </div>
                            </div>
                            <Interruptor
                              checked={c.activo}
                              onCheckedChange={() => handleToggleClienteActivo(c)}
                            />
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <Boton
                              variante="secundario"
                              tamano="sm"
                              onClick={() => {
                                setClienteAEditar(c);
                                setNombreEditado(c.nombre);
                              }}
                            >
                              <Edit2 size={13} style={{ marginRight: 4 }} />
                              Renombrar
                            </Boton>
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
                          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <Chip punto="azul">
                              {t.tipo?.rol?.nombre || t.tipo?.nombre || "Trabajo"}
                            </Chip>
                            {t.cliente && (
                              <Chip punto="verde">
                                {t.cliente.nombre}
                              </Chip>
                            )}
                          </div>
                        </div>

                        <div className={styles.reviewTitulo}>{t.titulo}</div>
                        {t.descripcion && (
                          <div style={{ fontSize: 12, color: "var(--rc-texto-secundario)" }}>
                            {t.descripcion}
                          </div>
                        )}

                        {t.tipo?.unidad === "minuto" && (
                          <div style={{ fontSize: 12, color: "var(--rc-azul-texto)", fontWeight: 600 }}>
                            Minutos grabados reportados: {t.cantidad || 0} min
                          </div>
                        )}

                        {t.nota_persona && (
                          <div className={styles.reviewNota}>
                            <strong>Nota de la persona:</strong> {t.nota_persona}
                          </div>
                        )}

                        <div className={styles.reviewValor}>
                          <span>Valor estimado a congelar:</span>
                          <span className={styles.reviewValorMonto}>
                            {t.tipo?.unidad === "minuto" && t.cantidad && t.tipo?.precio
                              ? `$ ${(t.cantidad * t.tipo.precio).toLocaleString("es-CO")} (${t.cantidad} min × $ ${t.tipo.precio.toLocaleString("es-CO")})`
                              : `$ ${(t.tipo?.precio || 0).toLocaleString("es-CO")}`}
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
                            onClick={() => handleAbrirAceptarTarea(t)}
                          >
                            <Check size={14} style={{ marginRight: 4 }} />
                            {t.tipo?.unidad === "minuto" ? "Revisar y aceptar" : "Aceptar"}
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
                            <th>Cliente</th>
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
                                {t.cliente ? (
                                  <Chip punto="verde">{t.cliente.nombre}</Chip>
                                ) : (
                                  <span style={{ fontSize: 11, color: "var(--rc-texto-secundario)" }}>—</span>
                                )}
                              </td>
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
                                  {t.tipo?.unidad === "minuto" && t.cantidad_aceptada && t.precio_unitario_congelado
                                    ? `${t.cantidad_aceptada} min × $ ${t.precio_unitario_congelado.toLocaleString("es-CO")} = $ ${(t.precio_congelado || 0).toLocaleString("es-CO")}`
                                    : `$ ${(t.precio_congelado ?? t.tipo?.precio ?? 0).toLocaleString("es-CO")}`}
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
                          <div style={{ fontSize: 12, color: "var(--rc-texto-secundario)", display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                            <span>Asignado a: <strong>{t.asignado?.nombre || "—"}</strong> ({t.tipo?.nombre})</span>
                            {t.cliente && <Chip punto="verde">{t.cliente.nombre}</Chip>}
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span className={styles.montoVerde}>
                              {t.tipo?.unidad === "minuto" && t.cantidad_aceptada && t.precio_unitario_congelado
                                ? `${t.cantidad_aceptada} min × $ ${t.precio_unitario_congelado.toLocaleString("es-CO")} = $ ${(t.precio_congelado || 0).toLocaleString("es-CO")}`
                                : `$ ${(t.precio_congelado ?? t.tipo?.precio ?? 0).toLocaleString("es-CO")}`}
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
          {/* PESTAÑA: ESTADÍSTICAS (F3)                                */}
          {/* ========================================================= */}
          {pestanaActiva === "estadisticas" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--rc-esp-20)" }}>
              {/* Controles de Filtros y Presets */}
              <div className={styles.statsFiltrosContenedor}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                  <span style={{ fontSize: "var(--rc-fs-titulo-seccion)", fontWeight: 600, color: "var(--rc-texto)" }}>
                    Período de análisis
                  </span>
                  <div className={styles.statsPresetsBar} role="tablist">
                    {(
                      [
                        { id: "hoy", label: "Hoy" },
                        { id: "7dias", label: "7 días" },
                        { id: "este_mes", label: "Este mes" },
                        { id: "mes_pasado", label: "Mes pasado" },
                        { id: "este_ano", label: "Este año" },
                        { id: "todo", label: "Todo" },
                        { id: "personalizado", label: "Personalizado" },
                      ] as const
                    ).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        role="tab"
                        aria-selected={presetStats === p.id}
                        style={{
                          background: presetStats === p.id ? "var(--rc-luz)" : "transparent",
                          color: presetStats === p.id ? "var(--rc-azul-texto)" : "var(--rc-texto-secundario)",
                          fontWeight: presetStats === p.id ? 600 : 500,
                          border: "none",
                          borderRadius: "var(--rc-radio-sm)",
                          padding: "4px 8px",
                          fontSize: "var(--rc-fs-etiqueta)",
                          cursor: "pointer",
                          height: "26px",
                          display: "inline-flex",
                          alignItems: "center",
                          boxShadow: presetStats === p.id ? "0 1px 3px rgba(31, 36, 48, 0.12)" : "none",
                        }}
                        onClick={() => {
                          setPresetStats(p.id);
                          if (p.id !== "personalizado") {
                            cargarEstadisticasAdmin(p.id, undefined, undefined, agruparStats, filtroPersonaStats, filtroClienteStats, filtroTipoStats);
                          }
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {presetStats === "personalizado" && (
                  <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", flexWrap: "wrap", marginTop: "4px" }}>
                    <div style={{ flex: 1, minWidth: "130px" }}>
                      <Campo
                        etiqueta="Desde"
                        type="date"
                        value={fechaDesdeStats}
                        onChange={(e) => setFechaDesdeStats(e.target.value)}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: "130px" }}>
                      <Campo
                        etiqueta="Hasta"
                        type="date"
                        value={fechaHastaStats}
                        onChange={(e) => setFechaHastaStats(e.target.value)}
                      />
                    </div>
                    <Boton
                      variante="primario"
                      tamano="sm"
                      style={{ height: "36px" }}
                      onClick={() => {
                        if (!fechaDesdeStats || !fechaHastaStats) {
                          mostrarAviso({ tipo: "error", titulo: "Rango incompleto", texto: "Ingresa ambas fechas." });
                          return;
                        }
                        if (fechaDesdeStats > fechaHastaStats) {
                          mostrarAviso({ tipo: "error", titulo: "Rango inválido", texto: "La fecha 'Desde' no puede ser posterior a 'Hasta'." });
                          return;
                        }
                        cargarEstadisticasAdmin("personalizado", fechaDesdeStats, fechaHastaStats, agruparStats, filtroPersonaStats, filtroClienteStats, filtroTipoStats);
                      }}
                    >
                      <Calendar size={13} style={{ marginRight: 4 }} />
                      Aplicar
                    </Boton>
                  </div>
                )}

                {/* Filtros combinables y agrupación */}
                <div className={styles.statsFiltrosComb}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--rc-texto-secundario)" }}>
                      Agrupar por
                    </label>
                    <select
                      className={styles.selectCompacto}
                      value={agruparStats}
                      onChange={(e) => {
                        setAgruparStats(e.target.value);
                        cargarEstadisticasAdmin(presetStats, fechaDesdeStats, fechaHastaStats, e.target.value, filtroPersonaStats, filtroClienteStats, filtroTipoStats);
                      }}
                    >
                      <option value="">Automático</option>
                      <option value="dia">Por día</option>
                      <option value="semana">Por semana</option>
                      <option value="mes">Por mes</option>
                    </select>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--rc-texto-secundario)" }}>
                      Persona
                    </label>
                    <select
                      className={styles.selectCompacto}
                      value={filtroPersonaStats}
                      onChange={(e) => {
                        setFiltroPersonaStats(e.target.value);
                        cargarEstadisticasAdmin(presetStats, fechaDesdeStats, fechaHastaStats, agruparStats, e.target.value, filtroClienteStats, filtroTipoStats);
                      }}
                    >
                      <option value="">Todas las personas</option>
                      {miembrosAprobados.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--rc-texto-secundario)" }}>
                      Cliente
                    </label>
                    <select
                      className={styles.selectCompacto}
                      value={filtroClienteStats}
                      onChange={(e) => {
                        setFiltroClienteStats(e.target.value);
                        cargarEstadisticasAdmin(presetStats, fechaDesdeStats, fechaHastaStats, agruparStats, filtroPersonaStats, e.target.value, filtroTipoStats);
                      }}
                    >
                      <option value="">Todos los clientes</option>
                      <option value="sin_cliente">Sin cliente asignado</option>
                      {clientes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--rc-texto-secundario)" }}>
                      Tipo de trabajo
                    </label>
                    <select
                      className={styles.selectCompacto}
                      value={filtroTipoStats}
                      onChange={(e) => {
                        const val = e.target.value === "" ? "" : Number(e.target.value);
                        setFiltroTipoStats(val);
                        cargarEstadisticasAdmin(presetStats, fechaDesdeStats, fechaHastaStats, agruparStats, filtroPersonaStats, filtroClienteStats, val);
                      }}
                    >
                      <option value="">Todos los tipos</option>
                      {trabajos.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {cargandoStatsAdmin ? (
                <Esqueleto filas={6} />
              ) : statsAdmin ? (
                <>
                  {/* Tarjetas de Totales */}
                  <div className={styles.statsTotalesGrid}>
                    <div className={styles.statsTotalCard}>
                      <span className={styles.statsTotalLabel}>Trabajos</span>
                      <span className={styles.statsTotalValor}>{statsAdmin.totales.trabajos}</span>
                    </div>
                    <div className={styles.statsTotalCard}>
                      <span className={styles.statsTotalLabel}>Minutos grabados</span>
                      <span className={styles.statsTotalValor}>{statsAdmin.totales.minutos} min</span>
                    </div>
                    <div className={styles.statsTotalCard}>
                      <span className={styles.statsTotalLabel}>Valor total</span>
                      <span className={styles.statsTotalValor} style={{ color: "var(--rc-verde-texto)" }}>
                        $ {statsAdmin.totales.valor.toLocaleString("es-CO")}
                      </span>
                    </div>
                    <div className={styles.statsTotalCard}>
                      <span className={styles.statsTotalLabel}>Personas activas</span>
                      <span className={styles.statsTotalValor}>{statsAdmin.totales.personas}</span>
                    </div>
                    <div className={styles.statsTotalCard}>
                      <span className={styles.statsTotalLabel}>Clientes</span>
                      <span className={styles.statsTotalValor}>{statsAdmin.totales.clientes}</span>
                    </div>
                  </div>

                  {/* Gráfica de Línea de Serie Temporal */}
                  <section className={styles.section}>
                    <GraficaLinea
                      serie={statsAdmin.serie || []}
                      titulo="Evolución de trabajos"
                      subtitulo={`Serie continua por ${statsAdmin.rango.agrupar === "semana" ? "semana" : statsAdmin.rango.agrupar === "mes" ? "mes" : "día"} (${statsAdmin.rango.desde} a ${statsAdmin.rango.hasta})`}
                    />
                  </section>

                  {/* Tres Paneles de Barras Horizontales */}
                  <div className={styles.statsPanelesGrid}>
                    <section className={styles.section}>
                      <GraficaBarras
                        items={(statsAdmin.por_persona || []).map((p) => ({
                          id: p.perfil_id,
                          nombre: p.nombre,
                          avatar: p.foto,
                          href: `/equipo/${p.perfil_id}`,
                          valorPrincipal: p.trabajos,
                          etiquetaPrincipal: `${p.trabajos} trab.`,
                          valorSecundario: `${p.minutos > 0 ? `${p.minutos} min • ` : ""}$ ${p.valor.toLocaleString("es-CO")}`,
                        }))}
                        titulo="Más trabajos por persona"
                        subtitulo="Miembros con mayor volumen aceptado"
                        color="azul"
                        vacioTexto="No hay trabajos por persona en este período."
                      />
                    </section>

                    <section className={styles.section}>
                      <GraficaBarras
                        items={(statsAdmin.por_cliente || []).map((c) => ({
                          id: c.cliente_id ?? "sin_cliente",
                          nombre: c.nombre,
                          valorPrincipal: c.trabajos,
                          etiquetaPrincipal: `${c.trabajos} trab.`,
                          valorSecundario: `${c.minutos > 0 ? `${c.minutos} min • ` : ""}$ ${c.valor.toLocaleString("es-CO")}`,
                        }))}
                        titulo="Más trabajos por cliente"
                        subtitulo="Clientes con mayor actividad"
                        color="verde"
                        vacioTexto="No hay trabajos por cliente en este período."
                      />
                    </section>

                    <section className={styles.section}>
                      <GraficaBarras
                        items={(statsAdmin.por_tipo || []).map((tp) => ({
                          id: tp.tipo_id,
                          nombre: `${tp.nombre} (${tp.unidad === "minuto" ? "Minuto" : "Trabajo"})`,
                          valorPrincipal: tp.trabajos,
                          etiquetaPrincipal: `${tp.trabajos} trab.`,
                          valorSecundario: `${tp.minutos > 0 ? `${tp.minutos} min • ` : ""}$ ${tp.valor.toLocaleString("es-CO")}`,
                        }))}
                        titulo="Por tipo de trabajo"
                        subtitulo="Distribución por servicio liquidado"
                        color="morado"
                        vacioTexto="No hay tipos de trabajo en este período."
                      />
                    </section>
                  </div>
                </>
              ) : null}
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
            <div>
              <label style={{ fontSize: 13, fontWeight: "var(--rc-fw-medio)", display: "block", marginBottom: 4 }}>
                Se cobra por
              </label>
              <select
                className={styles.selectCompacto}
                style={{ width: "100%", height: 36 }}
                value={nuevoTrabUnidad}
                onChange={(e) => setNuevoTrabUnidad(e.target.value as UnidadTrabajo)}
                disabled={guardandoTrabajo}
              >
                <option value="trabajo">Por trabajo (precio fijo por entrega)</option>
                <option value="minuto">Por minuto (precio × minutos grabados)</option>
              </select>
            </div>
            <Campo
              etiqueta={nuevoTrabUnidad === "minuto" ? "Precio por minuto en pesos colombianos (COP)" : "Precio por trabajo en pesos colombianos (COP)"}
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <label style={{ fontSize: 13, fontWeight: "var(--rc-fw-medio)" }}>
                  Cliente (opcional)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setClienteAlVueloNombre("");
                    setModalCrearClienteAlVuelo(true);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--rc-azul-texto)",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <Plus size={12} />
                  Nuevo cliente al vuelo
                </button>
              </div>
              <select
                className={styles.selectCompacto}
                style={{ width: "100%", height: 36 }}
                value={nuevaTareaClienteId}
                onChange={(e) => setNuevaTareaClienteId(e.target.value === "" ? "" : Number(e.target.value))}
                disabled={creandoTarea}
              >
                <option value="">Sin cliente asociado</option>
                {clientes.filter((c) => c.activo).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
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

      {/* Modal Crear Cliente al Vuelo */}
      {modalCrearClienteAlVuelo && (
        <Modal
          abierto={true}
          titulo="Nuevo cliente"
          descripcion="Crea un cliente rápidamente para asociarlo a esta tarea."
          onCerrar={() => setModalCrearClienteAlVuelo(false)}
          accionPrimaria={
            <Boton
              variante="primario"
              cargando={guardandoClienteAlVuelo}
              onClick={handleCrearClienteAlVuelo}
            >
              Crear y seleccionar
            </Boton>
          }
          accionSecundaria={
            <Boton
              variante="secundario"
              onClick={() => setModalCrearClienteAlVuelo(false)}
              disabled={guardandoClienteAlVuelo}
            >
              Cancelar
            </Boton>
          }
        >
          <form onSubmit={handleCrearClienteAlVuelo} className={styles.modalForm}>
            <Campo
              etiqueta="Nombre del cliente (1 a 80 caracteres) *"
              placeholder="Ej. Alcaldía de Bucaramanga"
              value={clienteAlVueloNombre}
              onChange={(e) => setClienteAlVueloNombre(e.target.value.slice(0, 80))}
              disabled={guardandoClienteAlVuelo}
              autoFocus
            />
          </form>
        </Modal>
      )}

      {/* Modal Crear Cliente (desde pestaña Clientes) */}
      {modalNuevoCliente && (
        <Modal
          abierto={true}
          titulo="Nuevo cliente"
          descripcion="Registra un nuevo cliente para asociarlo a tareas y reportes."
          onCerrar={() => setModalNuevoCliente(false)}
          accionPrimaria={
            <Boton
              variante="primario"
              cargando={guardandoCliente}
              onClick={handleCrearCliente}
            >
              Guardar cliente
            </Boton>
          }
          accionSecundaria={
            <Boton
              variante="secundario"
              onClick={() => setModalNuevoCliente(false)}
              disabled={guardandoCliente}
            >
              Cancelar
            </Boton>
          }
        >
          <div className={styles.modalForm}>
            <Campo
              etiqueta="Nombre del cliente *"
              placeholder="Ej. Empresa ABC"
              value={nuevoClienteNombre}
              onChange={(e) => setNuevoClienteNombre(e.target.value.slice(0, 80))}
              disabled={guardandoCliente}
              autoFocus
            />
          </div>
        </Modal>
      )}

      {/* Modal Renombrar Cliente */}
      {clienteAEditar && (
        <Modal
          abierto={true}
          titulo="Renombrar cliente"
          descripcion={`Modifica el nombre registrado para "${clienteAEditar.nombre}".`}
          onCerrar={() => setClienteAEditar(null)}
          accionPrimaria={
            <Boton
              variante="primario"
              cargando={guardandoEdicion}
              onClick={handleRenombrarCliente}
            >
              Actualizar nombre
            </Boton>
          }
          accionSecundaria={
            <Boton
              variante="secundario"
              onClick={() => setClienteAEditar(null)}
              disabled={guardandoEdicion}
            >
              Cancelar
            </Boton>
          }
        >
          <div className={styles.modalForm}>
            <Campo
              etiqueta="Nombre del cliente *"
              value={nombreEditado}
              onChange={(e) => setNombreEditado(e.target.value.slice(0, 80))}
              disabled={guardandoEdicion}
              autoFocus
            />
          </div>
        </Modal>
      )}

      {/* Modal Aceptar Tarea con corrección opcional de minutos */}
      {modalAceptarTarea && (
        <Modal
          abierto={true}
          titulo="Aceptar tarea y congelar en factura"
          descripcion={`Revisa y confirma la liquidación para "${modalAceptarTarea.titulo}".`}
          onCerrar={() => setModalAceptarTarea(null)}
          accionPrimaria={
            <Boton
              variante="primario"
              cargando={aceptandoTarea}
              onClick={handleConfirmarAceptarTarea}
            >
              <Check size={14} style={{ marginRight: 4 }} />
              Aceptar y congelar
            </Boton>
          }
          accionSecundaria={
            <Boton
              variante="secundario"
              onClick={() => setModalAceptarTarea(null)}
              disabled={aceptandoTarea}
            >
              Cancelar
            </Boton>
          }
        >
          <div className={styles.modalForm}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, background: "var(--rc-superficie-clara)", padding: "10px", borderRadius: "var(--rc-radio-md)" }}>
              <div style={{ fontSize: "var(--rc-fs-secundario)", color: "var(--rc-texto-secundario)" }}>
                Asignado a: <strong style={{ color: "var(--rc-texto)" }}>{modalAceptarTarea.asignado?.nombre || "Miembro"}</strong>
              </div>
              <div style={{ fontSize: "var(--rc-fs-secundario)", color: "var(--rc-texto-secundario)" }}>
                Trabajo: <strong style={{ color: "var(--rc-texto)" }}>{modalAceptarTarea.tipo?.nombre}</strong> ({modalAceptarTarea.tipo?.unidad === "minuto" ? "Cobro por minuto" : "Cobro por trabajo"})
              </div>
              {modalAceptarTarea.cliente && (
                <div style={{ fontSize: "var(--rc-fs-secundario)", color: "var(--rc-verde-texto)" }}>
                  Cliente: <strong>{modalAceptarTarea.cliente.nombre}</strong>
                </div>
              )}
              {modalAceptarTarea.nota_persona && (
                <div style={{ fontSize: "11px", color: "var(--rc-azul-texto)", marginTop: 4 }}>
                  Nota: &ldquo;{modalAceptarTarea.nota_persona}&rdquo;
                </div>
              )}
            </div>

            {modalAceptarTarea.tipo?.unidad === "minuto" ? (
              <div>
                <Campo
                  etiqueta="Minutos aceptados (puedes corregir la duración) *"
                  type="number"
                  min={1}
                  max={1440}
                  value={minutosAceptarInput}
                  onChange={(e) => setMinutosAceptarInput(e.target.value)}
                  disabled={aceptandoTarea}
                />
                <div style={{ marginTop: 6, fontSize: "var(--rc-fs-secundario)", color: "var(--rc-texto-secundario)", display: "flex", justifyContent: "space-between" }}>
                  <span>Tarifa: $ {modalAceptarTarea.tipo?.precio?.toLocaleString("es-CO")} / min</span>
                  <span style={{ fontWeight: 600, color: "var(--rc-verde-texto)" }}>
                    Total a congelar: $ {((Number(minutosAceptarInput) || 0) * (modalAceptarTarea.tipo?.precio || 0)).toLocaleString("es-CO")}
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: "var(--rc-fs-cuerpo)", color: "var(--rc-texto)", padding: "8px 0" }}>
                Total a congelar en factura:{" "}
                <strong style={{ color: "var(--rc-verde-texto)" }}>
                  $ {(modalAceptarTarea.tipo?.precio || 0).toLocaleString("es-CO")}
                </strong>
              </div>
            )}
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
