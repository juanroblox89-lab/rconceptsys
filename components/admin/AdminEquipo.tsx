"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUp, ArrowDown, Check, ExternalLink, Link2, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { ConfigEquipo, DriveEstado } from "@/lib/types";
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
    const mensajes: Record<string, { tipo: "exito" | "error" | "info"; titulo: string; texto: string }> = {
      conectado: { tipo: "exito", titulo: "Drive conectado", texto: "Las subcarpetas por tarea ya se crean en ese Drive." },
      cancelado: { tipo: "info", titulo: "Conexión cancelada", texto: "No se conectó ninguna cuenta de Google." },
      estado_invalido: { tipo: "error", titulo: "Enlace vencido", texto: "Vuelve a intentar la conexión desde Gestión." },
      sin_configurar: { tipo: "error", titulo: "Faltan credenciales", texto: "El servidor no tiene GOOGLE_CLIENT_ID ni GOOGLE_CLIENT_SECRET." },
      error: { tipo: "error", titulo: "No se pudo conectar", texto: "Google no devolvió el permiso. Inténtalo otra vez." },
      error_guardar: { tipo: "error", titulo: "No se pudo guardar", texto: "La conexión llegó pero no se pudo guardar en la base." },
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
      mostrarAviso({ tipo: "exito", titulo: "Equipo guardado", texto: "La barra derecha ya muestra los cambios." });
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
      mostrarAviso({ tipo: "exito", titulo: "Enlace agregado", texto: "Ya aparece en la barra derecha." });
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
        texto: err instanceof Error ? err.message : "Faltan credenciales de Google Cloud.",
      });
      setConectando(false);
    }
  };

  const desconectarDrive = async () => {
    try {
      await api.adminDesconectarDrive();
      await cargar();
      mostrarAviso({ tipo: "info", titulo: "Drive desconectado", texto: "Ya no se crean carpetas automáticas." });
    } catch {
      mostrarAviso({ tipo: "error", titulo: "No se pudo desconectar", texto: "Inténtalo de nuevo." });
    }
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
            <p className={styles.bloqueAyuda}>
              Es la tarjeta que se ve en la barra derecha del chat, en pantallas grandes.
            </p>
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
        <p className={styles.bloqueAyuda}>
          Abren en otra pestaña. Ejemplos: Drive del equipo, Materiales, Entregas.
        </p>

        {enlaces.length === 0 ? (
          <p className={styles.vacio}>Todavía no hay enlaces.</p>
        ) : (
          <ul className={styles.enlaces}>
            {enlaces.map((enlace, indice) => (
              <li key={enlace.id} className={styles.enlaceFila}>
                <Link2 size={14} strokeWidth={1.75} aria-hidden="true" className={styles.enlaceIcono} />
                <div className={styles.enlaceDatos}>
                  <span className={styles.enlaceNombre}>{enlace.nombre}</span>
                  <a href={enlace.url} target="_blank" rel="noopener noreferrer" className={styles.enlaceUrl}>
                    {enlace.url}
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
        <p className={styles.bloqueAyuda}>
          Un solo Drive para todo: cada tarea tiene su subcarpeta y lo entregado se copia ahí.
        </p>

        <div className={styles.driveEstado}>
          <span className={`${styles.pastilla} ${drive?.conectado ? styles.pastillaOk : styles.pastillaTenue}`}>
            {drive?.conectado ? <Check size={12} strokeWidth={2.5} aria-hidden="true" /> : null}
            {drive?.conectado ? "Conectado" : drive?.configurado ? "Sin conectar" : "Falta configurar"}
          </span>
          {drive?.conectado && drive.correo ? <span className={styles.driveCorreo}>{drive.correo}</span> : null}
        </div>

        {!drive?.configurado ? (
          <div className={styles.notaTecnica}>
            <p>
              Faltan las credenciales de Google Cloud en el servidor. Juan debe crear un cliente OAuth (tipo
              aplicación web) y cargar <code>GOOGLE_CLIENT_ID</code> y <code>GOOGLE_CLIENT_SECRET</code>. La URL de
              retorno es <code>https://&lt;dominio&gt;/api/drive/callback</code>.
            </p>
          </div>
        ) : (
          <div className={styles.driveAcciones}>
            {drive?.conectado ? (
              <Boton variante="secundario" onClick={desconectarDrive}>
                Desconectar Drive
              </Boton>
            ) : (
              <Boton variante="primario" onClick={conectarDrive} cargando={conectando} disabled={conectando}>
                Conectar Drive del equipo
              </Boton>
            )}
            {drive?.conectado && drive.carpeta_raiz_id ? (
              <span className={styles.driveCarpeta}>Carpeta raíz: {drive.carpeta_raiz_id}</span>
            ) : null}
            {drive?.conectado && !drive.carpeta_raiz_id ? (
              <span className={styles.driveCarpeta}>
                Sin carpeta raíz fija: las subcarpetas se crean en el Drive de la cuenta conectada.
              </span>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
