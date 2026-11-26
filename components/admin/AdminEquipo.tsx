"use client";

import { EnlaceExterno } from "@/components/ui/EnlaceExterno";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown, Check, ExternalLink, FolderOpen, Link2, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { ConfigEquipo, DriveEstado, PlanDrive, ResultadoMovimientoDrive } from "@/lib/types";
import { Aviso, useAviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/Boton";
import { type DialogoPicker } from "@/lib/google-picker";
import { abrirSelectorGoogleDrive } from "@/components/PickerDriveCliente";
import {
  cuentaEquipoEsperada,
  esCuentaEquipoDrive,
  esUrlHttpsValida,
  normalizarCorreoDrive,
  normalizarUrlEnlace,
  truncarNombreEnlace,
} from "@/lib/drive-equipo";
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
  const [autorizacionDrive, setAutorizacionDrive] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [accionDrive, setAccionDrive] = useState("");
  const [plan, setPlan] = useState<PlanDrive | null>(null);
  const [movimientos, setMovimientos] = useState<ResultadoMovimientoDrive | null>(null);

  // Estados para "Elegir de Drive"
  const pickerDialogo = useRef<DialogoPicker | null>(null);
  const pickerVigente = useRef(false);
  const [pickerAbriendo, setPickerAbriendo] = useState(false);
  const [guardandoPicker, setGuardandoPicker] = useState(false);
  const [pickerError, setPickerError] = useState("");
  const [enlacePendienteCuenta, setEnlacePendienteCuenta] = useState<{
    nombre: string;
    url: string;
    correoDetectado: string;
  } | null>(null);

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

  // Limpieza del Picker al desmontar
  useEffect(() => {
    pickerVigente.current = true;
    return () => {
      pickerVigente.current = false;
      try {
        pickerDialogo.current?.setVisible(false);
        pickerDialogo.current?.dispose?.();
      } catch {
        // Ignorar limpieza de diálogo ya cerrado
      }
      pickerDialogo.current = null;
    };
  }, []);

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

  const enlacesActualesRef = useRef(config?.enlaces ?? []);
  useEffect(() => {
    enlacesActualesRef.current = config?.enlaces ?? [];
  }, [config?.enlaces]);

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

  const cuentaEquipo = cuentaEquipoEsperada(drive?.cuenta_equipo);
  const cuentaDriveIncorrecta = Boolean(
    drive?.conectado && drive.correo && !esCuentaEquipoDrive(drive.correo, drive.cuenta_equipo),
  );

  const crearEnlaceDesdeDrive = async (nombreEnlace: string, urlEnlace: string) => {
    setGuardandoPicker(true);
    setPickerError("");
    try {
      await api.adminPostEnlaceEquipo(nombreEnlace, urlEnlace);
      await cargar();
      mostrarAviso({ tipo: "exito", titulo: "Enlace agregado desde Drive" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo crear el enlace.";
      setPickerError(msg);
      mostrarAviso({ tipo: "error", titulo: "No se pudo crear el enlace", texto: msg });
    } finally {
      if (pickerVigente.current) setGuardandoPicker(false);
    }
  };

  const agregarEnlace = async () => {
    const limpioNombre = enlaceNombre.trim();
    const limpioUrl = enlaceUrl.trim();
    setPickerError("");
    if (!limpioNombre || !limpioUrl) return;
    if (!esUrlHttpsValida(limpioUrl)) {
      setPickerError("El enlace debe ser una URL https válida (máximo 500 caracteres).");
      return;
    }
    const claveNueva = normalizarUrlEnlace(limpioUrl);
    if (enlacesActualesRef.current.some((e) => normalizarUrlEnlace(e.url) === claveNueva)) {
      setPickerError("Ese enlace ya está en la lista.");
      return;
    }
    if (enlacesActualesRef.current.length >= 12) {
      setPickerError("Máximo 12 enlaces rápidos permitidos.");
      return;
    }
    setAgregando(true);
    try {
      await api.adminPostEnlaceEquipo(limpioNombre, limpioUrl);
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

  // "Elegir de Drive" - abrir Google Picker reutilizando PickerDriveCliente y /api/admin/drive/picker-token
  const abrirPickerDrive = async () => {
    if (pickerAbriendo || guardandoPicker || !drive?.conectado) return;
    if (enlacesActualesRef.current.length >= 12) {
      setPickerError("Máximo 12 enlaces rápidos permitidos.");
      return;
    }
    const boton = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPickerError("");
    setEnlacePendienteCuenta(null);
    setPickerAbriendo(true);
    const restaurarFoco = () => requestAnimationFrame(() => boton?.focus());

    try {
      await abrirSelectorGoogleDrive({
        maxItems: 1,
        multiselect: false,
        dialogoRef: pickerDialogo,
        vigenteRef: pickerVigente,
        onAbrir: (conf) => {
          if (!pickerVigente.current) return;
          setPickerAbriendo(false);
          if (conf.correo && (!drive?.correo || normalizarCorreoDrive(conf.correo) !== normalizarCorreoDrive(drive.correo))) {
            setDrive((prev) => (prev ? { ...prev, correo: conf.correo ?? prev.correo } : prev));
          }
        },
        onCancelar: () => {
          if (!pickerVigente.current) return;
          setPickerAbriendo(false);
          restaurarFoco();
        },
        onSeleccion: async (elementos, conf, correoPicker) => {
          if (!pickerVigente.current) return;
          const doc = elementos[0];
          if (!doc) {
            setPickerError("No pudimos leer ese archivo o carpeta. Elige otra referencia.");
            restaurarFoco();
            return;
          }

          const nombreEnlace = truncarNombreEnlace(doc.nombre, 40);
          const urlEnlace = doc.url.trim();

          if (!nombreEnlace || !esUrlHttpsValida(urlEnlace)) {
            setPickerError("El elemento seleccionado no tiene un enlace https válido.");
            restaurarFoco();
            return;
          }

          const listaActual = enlacesActualesRef.current;
          const claveNueva = normalizarUrlEnlace(urlEnlace);
          if (listaActual.some((e) => normalizarUrlEnlace(e.url) === claveNueva)) {
            setPickerError("Ese enlace ya está en la lista.");
            restaurarFoco();
            return;
          }

          if (listaActual.length >= 12) {
            setPickerError("Máximo 12 enlaces rápidos permitidos.");
            restaurarFoco();
            return;
          }

          // Verificar si el token del Picker o el usuario del Picker corresponden a otra cuenta antes de crear
          const esperada = cuentaEquipoEsperada(conf.cuenta_equipo ?? drive?.cuenta_equipo);
          const correoToken = conf.correo?.trim() || "";
          const correoEstado = drive?.correo?.trim() || "";
          const mismatchPicker = Boolean(correoPicker && !esCuentaEquipoDrive(correoPicker, esperada));
          const mismatchToken = Boolean(correoToken && !esCuentaEquipoDrive(correoToken, esperada));
          const mismatchEstado = Boolean(correoEstado && !esCuentaEquipoDrive(correoEstado, esperada));
          const discrepancia = Boolean(
            correoEstado && correoToken && normalizarCorreoDrive(correoEstado) !== normalizarCorreoDrive(correoToken),
          );

          if (mismatchPicker || mismatchToken || mismatchEstado || discrepancia) {
            const detectado =
              (mismatchPicker && correoPicker) ||
              (mismatchToken && correoToken) ||
              (discrepancia && correoToken) ||
              correoEstado ||
              "otra cuenta";
            setEnlacePendienteCuenta({
              nombre: nombreEnlace,
              url: urlEnlace,
              correoDetectado: detectado,
            });
            restaurarFoco();
            return;
          }

          await crearEnlaceDesdeDrive(nombreEnlace, urlEnlace);
          restaurarFoco();
        },
      });
    } catch (e) {
      if (!pickerVigente.current) return;
      setPickerError(e instanceof Error ? e.message : "No pudimos abrir Google Drive.");
      setPickerAbriendo(false);
      restaurarFoco();
    }
  };

  const conectarDrive = async () => {
    setConectando(true);
    try {
      const res = await api.adminConectarDrive();
      if (new URL(res.url).origin !== "https://accounts.google.com") throw new Error("Google Drive no devolvió un enlace válido.");
      setAutorizacionDrive(res.url);
    } catch (err) {
      mostrarAviso({
        tipo: "error",
        titulo: "No se pudo iniciar la conexión",
        texto: err instanceof Error ? err.message : "Pide a soporte que revise la conexión.",
      });
    } finally {
      setConectando(false);
    }
  };

  const desconectarDrive = async () => {
    setAccionDrive("desconectar");
    try {
      await api.adminDesconectarDrive();
      setConfirmar(false);
      setPlan(null);
      setMovimientos(null);
      setAutorizacionDrive("");
      setEnlacePendienteCuenta(null);
      await cargar();
      mostrarAviso({ tipo: "info", titulo: "Drive desconectado" });
    } catch {
      mostrarAviso({ tipo: "error", titulo: "No se pudo desconectar", texto: "Inténtalo de nuevo." });
    } finally {
      setAccionDrive("");
    }
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
                  <EnlaceExterno href={enlace.url} className={`rc-btn rc-btn--secundario rc-btn--sm ${styles.enlaceUrl}`} aria-label={`Abrir ${enlace.nombre}`} title={enlace.url}>
                    Abrir
                    <ExternalLink size={11} strokeWidth={2} aria-hidden="true" />
                  </EnlaceExterno>
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
            onChange={(e) => {
              setEnlaceNombre(e.target.value);
              if (pickerError) setPickerError("");
            }}
            placeholder="Nombre del enlace"
            maxLength={40}
            aria-label="Nombre del enlace"
          />
          <input
            type="url"
            value={enlaceUrl}
            onChange={(e) => {
              setEnlaceUrl(e.target.value);
              if (pickerError) setPickerError("");
            }}
            placeholder="https://…"
            aria-label="URL del enlace"
            inputMode="url"
          />
          <Boton
            variante="secundario"
            onClick={agregarEnlace}
            cargando={agregando}
            disabled={agregando || guardandoPicker || enlaces.length >= 12 || !enlaceNombre.trim() || !enlaceUrl.trim()}
          >
            <Plus size={13} style={{ marginRight: 4 }} />
            Agregar
          </Boton>
          {drive?.conectado && (
            <Boton
              variante="secundario"
              onClick={abrirPickerDrive}
              cargando={pickerAbriendo || guardandoPicker}
              disabled={pickerAbriendo || guardandoPicker || enlaces.length >= 12}
              title="Elegir archivo o carpeta desde Google Drive"
            >
              <FolderOpen size={13} style={{ marginRight: 4 }} />
              Elegir de Drive
            </Boton>
          )}
        </div>

        {!drive?.conectado && (
          <p className={styles.pickerNoConectado}>Conecta Drive del equipo para elegir.</p>
        )}
        {enlaces.length >= 12 && (
          <p className={styles.pickerNoConectado}>Máximo 12 enlaces rápidos.</p>
        )}
        {(pickerAbriendo || guardandoPicker) && (
          <p className={styles.pickerEstado} role="status">
            {guardandoPicker ? "Guardando enlace de Drive…" : "Abriendo Google Drive…"}
          </p>
        )}
        {pickerError && <p className={styles.pickerError} role="alert">{pickerError}</p>}

        {enlacePendienteCuenta && (
          <div className={styles.pickerCuentaAlerta}>
            <Aviso
              tipo="advertencia"
              titulo="La cuenta del selector no coincide"
              texto={
                <>
                  El selector usó <strong>{enlacePendienteCuenta.correoDetectado}</strong>. Reconecta Drive con{" "}
                  <strong>{cuentaEquipo}</strong> antes de agregar «{enlacePendienteCuenta.nombre}».
                </>
              }
            />
            <div className={styles.driveAcciones}>
              <Boton
                variante="secundario"
                tamano="sm"
                onClick={() => setEnlacePendienteCuenta(null)}
                disabled={guardandoPicker}
              >
                Cancelar
              </Boton>
              <Boton
                variante="primario"
                tamano="sm"
                cargando={guardandoPicker}
                onClick={async () => {
                  const pendiente = enlacePendienteCuenta;
                  setEnlacePendienteCuenta(null);
                  await crearEnlaceDesdeDrive(pendiente.nombre, pendiente.url);
                }}
              >
                Agregar de todas formas
              </Boton>
            </div>
          </div>
        )}
      </section>

      <section className={styles.bloque}>
        <h2 className={styles.bloqueTitulo}>Google Drive del equipo</h2>

        {cuentaDriveIncorrecta && (
          <Aviso
            tipo="advertencia"
            titulo="Cuenta de Drive distinta a la del equipo"
            texto={
              <>
                Drive está conectado con otra cuenta ({drive?.correo}). Reconecta con{" "}
                <strong>{cuentaEquipo}</strong>.
              </>
            }
          />
        )}
        {!drive?.conectado && (
          <Aviso
            tipo="advertencia"
            titulo="Inicia sesión con la cuenta del equipo"
            texto={
              <>
                Para usar bien la integración de Drive, inicia sesión con{" "}
                <strong>{cuentaEquipo}</strong>. Con otra cuenta no verás las carpetas del equipo.
              </>
            }
          />
        )}

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
          <div className={styles.driveAcciones}>
            <Boton variante="primario" onClick={conectarDrive} cargando={conectando}>
              Conectar Drive del equipo
            </Boton>
            {autorizacionDrive && (
              <EnlaceExterno className="rc-btn rc-btn--secundario" href={autorizacionDrive}>
                Autorizar en Google <ExternalLink size={14} aria-hidden="true" />
              </EnlaceExterno>
            )}
          </div>
        )}
        {drive?.conectado && <>
          <div className={styles.driveAcciones}>
            <span className={styles.driveCarpeta}>{drive.carpeta_raiz_nombre ? `Carpeta raíz: ${drive.carpeta_raiz_nombre}` : drive.carpeta_raiz_id ? "Carpeta raíz: nombre no disponible" : "Carpetas sin organizar."}</span>
            {drive.organizado && <EnlaceExterno className="rc-btn rc-btn--secundario rc-btn--sm" href={`https://drive.google.com/drive/folders/${encodeURIComponent(drive.carpeta_raiz_id)}`}>Abrir en Drive <ExternalLink size={14} aria-hidden="true" /></EnlaceExterno>}
          </div>
          {confirmar ? <div className={styles.confirmacionDrive} role="group" aria-labelledby="confirmar-drive">
            <p id="confirmar-drive">¿Desconectar el Drive del equipo? Las tareas nuevas dejarán de crear carpetas.</p>
            <Boton variante="peligro" tamano="sm" onClick={desconectarDrive} cargando={accionDrive === "desconectar"}>Sí</Boton>
            <Boton variante="secundario" tamano="sm" disabled={!!accionDrive} onClick={() => setConfirmar(false)}>No</Boton>
          </div> : <div className={styles.driveAcciones}>
            <Boton variante="secundario" onClick={organizar} disabled={!drive.configurado || !!accionDrive} cargando={accionDrive === "organizar"}>Organizar Drive</Boton>
            {cuentaDriveIncorrecta && drive.configurado && (
              <Boton variante="primario" onClick={conectarDrive} disabled={!!accionDrive} cargando={conectando}>
                Reconectar
              </Boton>
            )}
            <Boton variante="peligro" onClick={() => setConfirmar(true)} disabled={!!accionDrive}>Desconectar Drive</Boton>
          </div>}
          {cuentaDriveIncorrecta && autorizacionDrive && (
            <div className={styles.driveAcciones}>
              <EnlaceExterno className="rc-btn rc-btn--secundario rc-btn--sm" href={autorizacionDrive}>
                Autorizar cuenta correcta en Google <ExternalLink size={14} aria-hidden="true" />
              </EnlaceExterno>
            </div>
          )}
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
