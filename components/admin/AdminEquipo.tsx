"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUp, ArrowDown, Check, ExternalLink, Link2, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { ConfigEquipo, DriveEstado, PlanDrive, ResultadoMovimientoDrive } from "@/lib/types";
import { useAviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/Boton";
import styles from "./admin-paneles.module.css";

// Gestión → Equipo: nombre y descripción del equipo, enlaces rápidos de la
// barra derecha y conexión del Drive del equipo (OAuth con una cuenta de Google).
export function AdminEquipo() {
  const { mostrarAviso } = useAviso();
  const [config, setConfig] = useState<ConfigEquipo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [enlaceNombre, setEnlaceNombre] = useState("");
  const [enlaceUrl, setEnlaceUrl] = useState("");
  const [agregando, setAgregando] = useState(false);

  const [drive, setDrive] = useState<DriveEstado | null>(null);
  const [conectando, setConectando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [accionDrive, setAccionDrive] = useState("");
  const [plan, setPlan] = useState<PlanDrive | null>(null);
  const [movimientos, setMovimientos] = useState<ResultadoMovimientoDrive | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [resumen, estadoDrive] = await Promise.all([api.getEquipoResumen(), api.adminGetDrive()]);
      setConfig(resumen);
      setNombre(resumen.nombre);
      setDescripcion(resumen.descripcion ?? "");
      setDrive(estadoDrive);
    } catch {
      mostrarAviso({ tipo: "error", titulo: "No se pudo cargar", texto: "Revisa la conexión e inténtalo de nuevo." });
    } finally {
      setCargando(false);
    }
  }, [mostrarAviso]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  // Vuelta del OAuth de Google: /admin?drive=conectado
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resultado = params.get("drive");
    if (!resultado) return;
    const mensajes: Record<string, { tipo: "exito" | "error" | "info"; titulo: string; texto?: string }> = {
      organizacion_pendiente: { tipo: "info", titulo: "Drive conectado", texto: "Pulsa «Organizar Drive» para completar las carpetas." },
      conectado: { tipo: "exito", titulo: "Drive conectado" },
      cancelado: { tipo: "info", titulo: "Conexión cancelada" },
      estado_invalido: { tipo: "error", titulo: "Enlace vencido", texto: "Vuelve a intentar la conexión desde Gestión." },
      sin_configurar: { tipo: "error", titulo: "Falta configurar Drive", texto: "Pide a soporte que lo habilite." },
      error: { tipo: "error", titulo: "No se pudo conectar", texto: "Google no devolvió el permiso. Inténtalo otra vez." },
      error_guardar: { tipo: "error", titulo: "No se pudo guardar la conexión" },
    };
    const aviso = mensajes[resultado];
    if (aviso) mostrarAviso(aviso);
    window.history.replaceState({}, "", "/admin?pestana=equipo");
  }, [mostrarAviso]);

  const guardarEquipo = async () => {
    setGuardando(true);
    try {
      const actualizado = await api.adminPatchEquipo({ nombre, descripcion });
      setConfig(actualizado);
      mostrarAviso({ tipo: "exito", titulo: "Equipo guardado" });
    } catch (err) {
      mostrarAviso({
        tipo: "error",
        titulo: "No se pudo guardar",
        texto: err instanceof Error ? err.message : "Inténtalo de nuevo.",
      });
    } finally {
      setGuardando(false);
    }
  };

  const agregarEnlace = async () => {
    setAgregando(true);
    try {
      await api.adminPostEnlaceEquipo(enlaceNombre, enlaceUrl);
      setEnlaceNombre("");
      setEnlaceUrl("");
      await cargar();
      mostrarAviso({ tipo: "exito", titulo: "Enlace agregado" });
    } catch (err) {
      mostrarAviso({
        tipo: "error",
        titulo: "Enlace no válido",
        texto: err instanceof Error ? err.message : "Revisa el nombre y la URL https.",
      });
    } finally {
      setAgregando(false);
    }
  };

  const moverEnlace = async (id: number, orden: number) => {
    try {
      await api.adminPatchEnlaceEquipo(id, { orden });
      await cargar();
    } catch {
      mostrarAviso({ tipo: "error", titulo: "No se pudo ordenar", texto: "Inténtalo de nuevo." });
    }
  };

  const borrarEnlace = async (id: number) => {
    try {
      await api.adminDeleteEnlaceEquipo(id);
      await cargar();
    } catch {
      mostrarAviso({ tipo: "error", titulo: "No se pudo quitar", texto: "Inténtalo de nuevo." });
    }
  };

  const conectarDrive = async () => {
    setConectando(true);
    try {
      const res = await api.adminConectarDrive();
      window.location.href = res.url;
    } catch (err) {
      mostrarAviso({
        tipo: "error",
        titulo: "No se pudo iniciar la conexión",
        texto: err instanceof Error ? err.message : "Pide a soporte que revise la conexión.",
      });
      setConectando(false);
    }
  };

  const desconectarDrive = async () => {
    setAccionDrive("desconectar");
    try {
      await api.adminDesconectarDrive();
      setConfirmar(false); setPlan(null); setMovimientos(null);
      await cargar();
      mostrarAviso({ tipo: "info", titulo: "Drive desconectado" });
    } catch {
      mostrarAviso({ tipo: "error", titulo: "No se pudo desconectar", texto: "Inténtalo de nuevo." });
    } finally { setAccionDrive(""); }
  };

  const organizar = async () => {
    setAccionDrive("organizar"); setPlan(null);
    try {
      const r = await api.adminOrganizarDrive();
      await cargar();
      mostrarAviso({ tipo: r.clientes_pendientes.length ? "info" : "exito", titulo: "Estructura de Drive preparada",
        texto: `${r.clientes_listos} fichas listas.${r.clientes_pendientes.length ? ` Pendientes: ${r.clientes_pendientes.join(", ")}. Puedes reintentar.` : ""}` });
    } catch (e) { mostrarAviso({ tipo: "error", titulo: "No se pudo organizar", texto: (e as Error).message }); }
    finally { setAccionDrive(""); }
  };

  const simular = async () => {
    setAccionDrive("simular"); setPlan(null); setMovimientos(null);
    try { setPlan(await api.adminSimularMovimientosDrive()); }
    catch (e) { mostrarAviso({ tipo: "error", titulo: "No se pudo simular", texto: (e as Error).message }); }
    finally { setAccionDrive(""); }
  };

  const aplicar = async () => {
    if (!plan?.movimientos.length) return;
    setAccionDrive("mover");
    try { setMovimientos(await api.adminMoverCarpetasDrive(plan.huella)); setPlan(null); }
    catch (e) { setPlan(null); mostrarAviso({ tipo: "error", titulo: "No se aplicaron los movimientos", texto: (e as Error).message }); }
    finally { setAccionDrive(""); }
  };

  const enlaces = (config?.enlaces ?? []).slice().sort((a, b) => a.orden - b.orden);

  if (cargando) {
    return <p className={styles.cargando}>Cargando el equipo…</p>;
  }

  return (
    <div className={styles.panel}>
      <section className={styles.bloque}>
        <div className={styles.bloqueCabecera}>
          <div>
            <h2 className={styles.bloqueTitulo}>Este equipo</h2>
          </div>
          <Boton variante="primario" onClick={guardarEquipo} cargando={guardando} disabled={guardando}>
            Guardar
          </Boton>
        </div>
        <label className={styles.campo}>
          <span>Nombre del equipo</span>
          <input type="text" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className={styles.campo}>
          <span>Descripción corta</span>
          <textarea rows={2} value={descripcion} maxLength={300} onChange={(e) => setDescripcion(e.target.value)} />
        </label>
        <p className={styles.contador}>{descripcion.length}/300</p>
      </section>

      <section className={styles.bloque}>
        <h2 className={styles.bloqueTitulo}>Enlaces rápidos</h2>

        {enlaces.length === 0 ? (
          <p className={styles.vacio}>Sin enlaces.</p>
        ) : (
          <ul className={styles.enlaces}>
            {enlaces.map((enlace, indice) => (
              <li key={enlace.id} className={styles.enlaceFila}>
                <Link2 size={14} strokeWidth={1.75} aria-hidden="true" className={styles.enlaceIcono} />
                <div className={styles.enlaceDatos}>
                  <span className={styles.enlaceNombre}>{enlace.nombre}</span>
                  <a href={enlace.url} target="_blank" rel="noopener noreferrer" className={`rc-btn rc-btn--secundario rc-btn--sm ${styles.enlaceUrl}`} aria-label={`Abrir ${enlace.nombre}`} title={enlace.url}>
                    Abrir
                    <ExternalLink size={11} strokeWidth={2} aria-hidden="true" />
                  </a>
                </div>
                <div className={styles.enlaceAcciones}>
                  <button
                    type="button"
                    className={styles.miniBoton}
                    aria-label={`Subir ${enlace.nombre}`}
                    disabled={indice === 0}
                    onClick={() => moverEnlace(enlace.id, enlaces[indice - 1].orden)}
                  >
                    <ArrowUp size={13} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className={styles.miniBoton}
                    aria-label={`Bajar ${enlace.nombre}`}
                    disabled={indice === enlaces.length - 1}
                    onClick={() => moverEnlace(enlace.id, enlaces[indice + 1].orden)}
                  >
                    <ArrowDown size={13} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className={styles.miniBoton}
                    aria-label={`Quitar ${enlace.nombre}`}
                    onClick={() => borrarEnlace(enlace.id)}
                  >
                    <Trash2 size={13} strokeWidth={1.9} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.enlaceNuevo}>
          <input
            type="text"
            value={enlaceNombre}
            onChange={(e) => setEnlaceNombre(e.target.value)}
            placeholder="Nombre (Drive del equipo)"
            maxLength={40}
            aria-label="Nombre del enlace"
          />
          <input
            type="url"
            value={enlaceUrl}
            onChange={(e) => setEnlaceUrl(e.target.value)}
            placeholder="https://drive.google.com/…"
            aria-label="URL del enlace"
            inputMode="url"
          />
          <Boton
            variante="secundario"
            onClick={agregarEnlace}
            cargando={agregando}
            disabled={agregando || !enlaceNombre.trim() || !enlaceUrl.trim()}
          >
            <Plus size={13} style={{ marginRight: 4 }} />
            Agregar
          </Boton>
        </div>
      </section>

      <section className={styles.bloque}>
        <h2 className={styles.bloqueTitulo}>Google Drive del equipo</h2>

        <div className={styles.driveEstado}>
          <span className={`${styles.pastilla} ${drive?.conectado ? styles.pastillaOk : styles.pastillaTenue}`}>
            {drive?.conectado ? <Check size={12} strokeWidth={2.5} aria-hidden="true" /> : null}
            {drive?.conectado ? "Conectado" : drive?.configurado ? "Sin conectar" : "Falta configurar"}
          </span>
          {drive?.conectado && drive.correo ? <span className={styles.driveCorreo}>{drive.correo}</span> : null}
        </div>

        {!drive?.configurado ? (
          <div className={styles.notaTecnica}>
            <p>Pide a soporte que habilite Google Drive.</p>
          </div>
        ) : !drive.conectado && (
          <div><Boton variante="primario" onClick={conectarDrive} cargando={conectando}>Conectar Drive del equipo</Boton></div>
        )}
        {drive?.conectado && <>
          <div className={styles.driveAcciones}>
            <span className={styles.driveCarpeta}>{drive.organizado ? "Carpeta raíz: RConcept" : "Carpetas sin organizar."}</span>
            {drive.organizado && <a className="rc-btn rc-btn--secundario rc-btn--sm" href={`https://drive.google.com/drive/folders/${encodeURIComponent(drive.carpeta_raiz_id)}`} target="_blank" rel="noreferrer">Abrir en Drive <ExternalLink size={14} aria-hidden="true" /></a>}
          </div>
          {confirmar ? <div className={styles.confirmacionDrive} role="group" aria-labelledby="confirmar-drive">
            <p id="confirmar-drive">¿Desconectar el Drive del equipo? Las tareas nuevas dejarán de crear carpetas.</p>
            <Boton variante="peligro" tamano="sm" onClick={desconectarDrive} cargando={accionDrive === "desconectar"}>Sí</Boton>
            <Boton variante="secundario" tamano="sm" disabled={!!accionDrive} onClick={() => setConfirmar(false)}>No</Boton>
          </div> : <div className={styles.driveAcciones}>
            <Boton variante="secundario" onClick={organizar} disabled={!drive.configurado || !!accionDrive} cargando={accionDrive === "organizar"}>Organizar Drive</Boton>
            <Boton variante="peligro" onClick={() => setConfirmar(true)} disabled={!!accionDrive}>Desconectar Drive</Boton>
          </div>}
          {drive.organizado && <div className={styles.planDrive}>
            <h3>Carpetas antiguas</h3>
            <p className={styles.bloqueAyuda}>Revisa qué carpetas de Mi unidad se moverían. No se borra nada.</p>
            <div><Boton variante="secundario" tamano="sm" onClick={simular} disabled={!drive.configurado || !!accionDrive || confirmar} cargando={accionDrive === "simular"}>Simular movimientos</Boton></div>
            {plan && <div className={styles.planDrive} role="region" aria-label="Resultado de la simulación">
              <p>{plan.movimientos.length ? `${plan.movimientos.length} carpetas por mover. Aún no se movió nada.` : "No hay carpetas verificadas por mover."}</p>
              {plan.movimientos.length > 0 && <ul>{plan.movimientos.map(m => <li key={m.tarea_id}><strong>{m.nombre}</strong> → {m.destino}</li>)}</ul>}
              {plan.omitidas.length > 0 && <p className={styles.bloqueAyuda}>Tareas omitidas (carpetas sin verificar): {plan.omitidas.join(", ")}.</p>}
              {plan.movimientos.length > 0 && <div className={styles.driveAcciones}>
                <Boton tamano="sm" variante="primario" disabled={!!accionDrive || confirmar} cargando={accionDrive === "mover"} onClick={aplicar}>Aplicar movimientos</Boton>
                <Boton tamano="sm" variante="secundario" disabled={!!accionDrive} onClick={() => setPlan(null)}>Cancelar</Boton>
              </div>}
            </div>}
            {movimientos && <div className={styles.planDrive} role="status">
              <p>{movimientos.movidas.length} carpetas movidas. {movimientos.fallidas.length} pendientes.</p>
              {movimientos.movidas.length > 0 && <ul>{movimientos.movidas.map(m => <li key={m.tarea_id}><strong>{m.nombre}</strong> → {m.destino}</li>)}</ul>}
              {movimientos.fallidas.length > 0 && <p>Simula de nuevo para reintentar: {movimientos.fallidas.map(m => m.nombre).join(", ")}.</p>}
            </div>}
          </div>}
        </>}
      </section>
    </div>
  );
}
