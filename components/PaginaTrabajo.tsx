"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import type { Tarea } from "@/lib/types";
import { Boton } from "@/components/ui/Boton";
import { Modal } from "@/components/ui/Modal";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EnlaceDrive } from "@/components/ui/EnlaceDrive";
import { CarpetaDriveTarea } from "@/components/ui/CarpetaDriveTarea";
import { ReferenciasDriveTrabajo } from "@/components/ui/ReferenciasDriveTrabajo";
import { EstadoTrabajo, ESTADOS_TRABAJO, fechaTrabajo } from "./FilaTrabajo";
import { FormularioAsignacion } from "./FormularioAsignacion";
import { AdjuntosGuardados } from "./AdjuntosAsignacion";
import { usePerfilActual } from "./AppShell";
import styles from "./FlujoTrabajo.module.css";

export function PaginaTrabajo({ id, origen = "asignaciones", persona = "" }: { id?: number; origen?: string; persona?: string }) {
  const router = useRouter();
  const perfil = usePerfilActual();
  const admin = perfil?.es_admin === true;
  const [respuesta, setRespuesta] = useState<Tarea | string | null>(null);
  const [cambio, setCambio] = useState(0);
  const [confirmar, setConfirmar] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const tarea = typeof respuesta === "object" ? respuesta : null;
  const clienteOrigen = /^cliente-(\d+)$/.exec(origen)?.[1];
  const volver = !admin || origen === "tareas" ? "/tareas" : origen === "admin" ? "/admin?pestana=tareas" :
    origen === "equipo" && persona ? `/equipo/${encodeURIComponent(persona)}` : clienteOrigen ? `/clientes/${clienteOrigen}` : "/asignaciones";
  const textoVolver = !admin ? "Volver a tareas" : origen === "equipo" ? "Volver al perfil" : clienteOrigen ? "Volver al cliente" : origen === "tareas" || origen === "admin" ? "Volver a tareas" : "Volver a trabajos";
  const editable = admin && (tarea?.estado === "pendiente" || tarea?.estado === "rechazada");

  useEffect(() => {
    if (id === undefined) return;
    let activo = true;
    if (!perfil) return;
    const cargar = admin ? api.adminGetTarea(id) : api.getDetalleTarea(id);
    cargar.then(t => { if (activo) setRespuesta(t); }).catch(e => {
      if (activo) setRespuesta(e instanceof Error ? e.message : "No pudimos cargar el trabajo.");
    });
    return () => { activo = false; };
  }, [id, cambio, perfil, admin]);

  useEffect(() => {
    if (!confirmar || cancelando) return;
    const cerrar = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setConfirmar(false); }
    };
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [confirmar, cancelando]);

  async function cancelar() {
    if (!tarea || cancelando) return;
    setCancelando(true); setError(""); setExito("");
    try { setRespuesta(await api.adminCancelarTarea(tarea.id)); setConfirmar(false); setExito("El trabajo quedó cancelado."); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo cancelar el trabajo."); }
    finally { setCancelando(false); }
  }

  return <section className={`${styles.pagina} ${styles.paginaDetalle}`}>
    <Link className={`rc-btn rc-btn--secundario rc-btn--sm ${styles.enlace}`} href={volver}><ArrowLeft size={16} aria-hidden="true" />{textoVolver}</Link>
    <header className={styles.cabecera}>
      <div><h1>{id === undefined ? "Asignar trabajo" : tarea?.titulo ?? "Trabajo"}</h1>{tarea?.cliente && <p>{tarea.cliente.nombre}</p>}</div>
      {tarea && <EstadoTrabajo tarea={tarea} />}
    </header>
    {exito && <p role="status">{exito}</p>}
    {typeof respuesta === "string" ? <div className={styles.panel}><p role="alert" className={styles.error}>{respuesta}</p><Boton variante="secundario" onClick={() => { setRespuesta(null); setCambio(n => n + 1); }}>Reintentar</Boton></div> :
      id !== undefined && !tarea ? (perfil === null ? <p role="alert">No pudimos comprobar tu sesión.</p> : <Esqueleto filas={5} />) : <>
      {id === undefined && perfil === null && <p role="alert">No pudimos comprobar tu sesión.</p>}
      {id === undefined && perfil && !admin && <p role="alert">Solo un administrador puede asignar trabajos.</p>}
      {((id === undefined && admin) || editable) && <section className={styles.panel} aria-label={tarea ? "Editar trabajo" : "Datos de asignación"}>
        {tarea && <h2>Editar trabajo</h2>}
        <FormularioAsignacion key={tarea ? `${tarea.id}-${cambio}` : persona} tarea={tarea ?? undefined} personaInicial={persona}
          onCerrar={() => router.push(volver)} onGuardar={actual => {
            if (id === undefined) { router.push(`/trabajos/${actual.id}?desde=${encodeURIComponent(origen)}&persona=${encodeURIComponent(persona)}`); return; }
            setRespuesta(actual); setExito("Cambios guardados.");
          }} />
      </section>}
      {tarea && !editable && <section className={styles.panel}>
        <h2>Datos del trabajo</h2><dl className={styles.datosTrabajo}>
          <div><dt>Persona</dt><dd>{tarea.asignado?.nombre ?? "Sin asignar"}</dd></div>
          <div><dt>Tipo de trabajo</dt><dd>{tarea.tipo?.nombre ?? "Trabajo"}</dd></div>
          <div><dt>Fecha de entrega</dt><dd>{fechaTrabajo(tarea.fecha_limite)}</dd></div>
          {tarea.pieza && <div><dt>Pieza</dt><dd>{tarea.pieza.nombre}</dd></div>}
          <div><dt>Especificaciones</dt><dd className={styles.textoLargo}>{tarea.descripcion || tarea.titulo}</dd></div>
        </dl>
        <AdjuntosGuardados key={tarea.id} tarea={tarea.id} />
      </section>}
      {tarea && <section className={styles.panel}>
        <h2>Historial y entregas</h2>
        <ul className={styles.historialTrabajo}>
          <li><strong>Asignado</strong><span>{fechaTrabajo(tarea.creada_en)}{tarea.creador?.nombre ? ` · ${tarea.creador.nombre}` : ""}</span></li>
          {tarea.hecha_en && <li><strong>Entrega registrada</strong><span>{fechaTrabajo(tarea.hecha_en)}</span></li>}
          {tarea.resuelta_en && <li><strong>{ESTADOS_TRABAJO[tarea.estado]}</strong><span>{fechaTrabajo(tarea.resuelta_en)}</span></li>}
        </ul>
        {tarea.nota_persona && <p className={styles.textoLargo}><strong>Nota de entrega: </strong>{tarea.nota_persona}</p>}
        {tarea.motivo_rechazo && <p className={styles.textoLargo}><strong>Motivo de devolución: </strong>{tarea.motivo_rechazo}</p>}
        {tarea.precio_congelado != null && <p><strong>Valor aprobado: </strong>${tarea.precio_congelado.toLocaleString("es-CO")}</p>}
        {tarea.enlace_medios && <EnlaceDrive enlace={tarea.enlace_medios} />}
        {!editable && <ReferenciasDriveTrabajo tarea={tarea} />}
        {(tarea.drive_referencias != null || !(tarea.drive_carpeta_id || tarea.drive_carpeta_url)) && <CarpetaDriveTarea tarea={tarea} onActualizada={setRespuesta} />}
        {tarea.estado === "hecha" && <Link className={`rc-btn rc-btn--secundario rc-btn--sm ${styles.abrir}`} href={`/tareas?tarea=${tarea.id}#tarea-${tarea.id}`}>Revisar entrega</Link>}
      </section>}
      {editable && <Boton variante="peligro" onClick={() => { setError(""); setConfirmar(true); }}>Cancelar trabajo</Boton>}
    </>}
    {confirmar && <Modal className={styles.dialogo} titulo="¿Cancelar este trabajo?" descripcion="Esta acción no se puede deshacer." onCerrar={() => { if (!cancelando) setConfirmar(false); }}
      accionSecundaria={<Boton variante="secundario" disabled={cancelando} onClick={() => setConfirmar(false)}>Conservar trabajo</Boton>}
      accionPrimaria={<Boton variante="peligro" cargando={cancelando} onClick={() => void cancelar()}>Sí, cancelar trabajo</Boton>}>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    </Modal>}
  </section>;
}
