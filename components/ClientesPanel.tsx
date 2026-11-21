"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { ExternalLink, Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { Cliente, DriveArchivo, Tarea } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Modal } from "@/components/ui/Modal";
import styles from "./FlujoTrabajo.module.css";

const ESTADOS: Record<Tarea["estado"], string> = { pendiente: "Pendiente", hecha: "Entregado", aceptada: "Aprobado", rechazada: "Devuelto", cancelada: "Cancelado" };
const driveURL = (id: string) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
function Carpeta({ href, texto }: { href: string; texto: string }) {
  if (!/^https:\/\/drive\.google\.com\//i.test(href)) return null;
  return <a className={styles.enlace} href={href} target="_blank" rel="noreferrer">{texto}<ExternalLink size={14} aria-hidden="true" /></a>;
}

export function ClientesPanel({ integrado = false }: { integrado?: boolean }) {
  const [datos, setDatos] = useState<{ clientes: Cliente[]; trabajos: Tarea[] } | null>(null);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);
  const [ficha, setFicha] = useState<number | null>(null);
  const [edicion, setEdicion] = useState<Cliente | "nuevo" | null>(null);
  const [filtro, setFiltro] = useState("");
  useEffect(() => {
    let vigente = true;
    Promise.all([api.adminGetClientes(), api.adminGetTareas()]).then(([clientes, res]) => {
      if (vigente) setDatos({ clientes: clientes ?? [], trabajos: res?.tareas ?? [] });
    }).catch((e: Error) => { if (vigente) setError(e.message || "No se pudieron cargar los clientes."); });
    return () => { vigente = false; };
  }, [intento]);
  const actual = datos?.clientes.find((c) => c.id === ficha);
  const trabajos = datos?.trabajos.filter((t) => t.cliente_id === ficha) ?? [];
  const clientes = datos?.clientes.filter((c) => c.nombre.toLocaleLowerCase("es").includes(filtro.trim().toLocaleLowerCase("es")));
  return <section className={integrado ? undefined : styles.pagina}>
    <header className={styles.cabecera}>
      <div>{integrado ? <h2>Clientes</h2> : <h1>Clientes</h1>}<p>Fichas, trabajos y carpetas del equipo.</p></div>
      <Boton onClick={() => setEdicion("nuevo")} disabled={!datos}><Plus size={16} aria-hidden="true" /> Nuevo cliente</Boton>
    </header>
    {!datos ? (error ? <><p className={styles.error} role="alert">{error}</p><Boton variante="secundario" onClick={() => { setError(""); setIntento(intento + 1); }}>Reintentar</Boton></> : <Esqueleto filas={4} />) : <div className={styles.lista}>
      <Campo type="search" etiqueta="Buscar cliente" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
      {!clientes?.length && <p className={styles.ayuda}>{filtro ? "No hay clientes con ese nombre." : "Aún no hay clientes. Crea el primero para asignar trabajos."}</p>}
      {clientes?.map((c) => <article className={styles.fila} key={c.id}>
        <div className={styles.identidad}><Avatar src={c.foto_url ?? undefined} iniciales={c.nombre.slice(0, 2).toUpperCase()} alt="" tamano={40} /><div><strong>{c.nombre}</strong><div className={styles.ayuda}>{c.activo ? c.paquete || "Activo" : "Inactivo"}</div></div></div>
        <div className={styles.acciones}><Boton variante="secundario" onClick={() => setFicha(c.id)}>Ver ficha</Boton><Boton variante="fantasma" onClick={() => setEdicion(c)}>Editar</Boton></div>
      </article>)}
    </div>}
    {actual && !edicion && <Modal className={styles.dialogo} titulo={actual.nombre} onCerrar={() => setFicha(null)}
      accionPrimaria={<Boton onClick={() => setEdicion(actual)}>Editar ficha</Boton>}>
      <div className={styles.lista}>
        {actual.paquete && <p><strong>Paquete:</strong> {actual.paquete}</p>}
        {actual.notas && <p><strong>Notas:</strong> {actual.notas}</p>}
        <div className={styles.acciones}>
          {actual.drive_url && <Carpeta href={actual.drive_url} texto="Carpeta del cliente" />}
          {actual.material_carpeta_id && <Carpeta href={driveURL(actual.material_carpeta_id)} texto="Material del lugar" />}
          {actual.producto_carpeta_id && <Carpeta href={driveURL(actual.producto_carpeta_id)} texto="Producto" />}
        </div>
        <strong>Trabajos activos y entregados</strong>
        {!trabajos.length && <p className={styles.ayuda}>Este cliente no tiene trabajos todavía.</p>}
        {trabajos.map((t) => <Link key={t.id} className={`${styles.fila} ${styles.enlace}`} href={`/asignaciones?trabajo=${t.id}#trabajo-${t.id}`}><span>{t.descripcion || t.titulo}</span><small>{ESTADOS[t.estado]}</small></Link>)}
      </div>
    </Modal>}
    {edicion && <EditorCliente cliente={edicion === "nuevo" ? undefined : edicion} onCerrar={() => setEdicion(null)} onGuardar={(c, terminar) => {
      setDatos((anterior) => anterior && { ...anterior, clientes: [...anterior.clientes.filter((i) => i.id !== c.id), c].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")) });
      if (terminar) { setEdicion(null); setFicha(c.id); }
    }} />}
  </section>;
}

function EditorCliente({ cliente, onCerrar, onGuardar }: { cliente?: Cliente; onCerrar: () => void; onGuardar: (c: Cliente, terminar: boolean) => void }) {
  const id = useId();
  const [guardado, setGuardado] = useState(cliente);
  const [nombre, setNombre] = useState(cliente?.nombre ?? "");
  const [foto, setFoto] = useState(cliente?.foto_url ?? "");
  const [paquete, setPaquete] = useState(cliente?.paquete ?? "");
  const [notas, setNotas] = useState(cliente?.notas ?? "");
  const [enlace, setEnlace] = useState(cliente?.drive_url ?? "");
  const [activo, setActivo] = useState(cliente?.activo ?? true);
  const [modo, setModo] = useState("");
  const [carpetas, setCarpetas] = useState<DriveArchivo[] | null>(null);
  const [carpeta, setCarpeta] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (modo !== "elegir") return;
    let vigente = true;
    api.adminGetDriveArchivos().then((r) => {
      if (vigente) setCarpetas((r ?? []).filter((a) => a.es_carpeta));
    }).catch((e: Error) => { if (vigente) { setCarpetas([]); setError(e.message || "No se pudo listar Drive."); } });
    return () => { vigente = false; };
  }, [modo]);
  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (ocupado) return;
    setOcupado(true); setError("");
    try {
      const base = guardado ?? await api.adminPostCliente(nombre.trim());
      setGuardado(base); onGuardar(base, false);
      let editado = await api.adminPatchCliente(base.id, { nombre: nombre.trim(), foto_url: foto.trim(), paquete: paquete.trim(), notas: notas.trim(), activo, ...(base.drive_carpeta_id ? {} : { drive_url: enlace.trim() }) });
      onGuardar(editado, false); setGuardado(editado);
      if (modo) editado = await api.adminClienteDrive(base.id, modo === "crear" ? { crear: true } : { carpeta_id: carpeta });
      onGuardar(editado, true);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar la ficha."); }
    finally { setOcupado(false); }
  }
  return <Modal className={styles.dialogo} titulo={cliente ? "Editar cliente" : "Nuevo cliente"} onCerrar={() => { if (!ocupado) onCerrar(); }}
    accionSecundaria={<Boton variante="secundario" disabled={ocupado} onClick={onCerrar}>Cancelar</Boton>}
    accionPrimaria={<Boton type="submit" form={id} cargando={ocupado} disabled={modo === "elegir" && !carpeta}>Guardar ficha</Boton>}>
    <form id={id} className={styles.form} onSubmit={guardar}>
      <Campo etiqueta="Nombre" required maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <Campo etiqueta="Foto de perfil (enlace HTTPS)" type="url" value={foto} maxLength={500} onChange={(e) => setFoto(e.target.value)} />
      <Campo etiqueta="Paquete contratado" maxLength={160} value={paquete} onChange={(e) => setPaquete(e.target.value)} />
      <Campo como="textarea" etiqueta="Notas" maxLength={1000} value={notas} onChange={(e) => setNotas(e.target.value)} />
      <Campo como="select" etiqueta="Carpeta de Drive del cliente" value={modo} onChange={(e) => { setModo(e.target.value); setError(""); setCarpetas(null); setCarpeta(""); }}>
        <option value="">{guardado?.drive_carpeta_id ? "Conservar carpeta vinculada" : "Vincular después"}</option>
        <option value="elegir">Elegir carpeta existente</option><option value="crear">Crear carpeta del cliente</option>
      </Campo>
      {modo === "elegir" && <Campo como="select" etiqueta="Carpeta existente" value={carpeta} required onChange={(e) => setCarpeta(e.target.value)}>
        <option value="">{!carpetas ? "Cargando carpetas…" : carpetas.length ? "Selecciona una carpeta" : "Sin carpetas disponibles"}</option>
        {carpetas?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </Campo>}
      {modo !== "" && <p className={styles.ayuda}>Se preparan las subcarpetas Material del lugar y Producto. Si Drive falla, la ficha se conserva y puedes reintentar.</p>}
      {!modo && !guardado?.drive_carpeta_id && <Campo etiqueta="Enlace de referencia en Drive" type="url" maxLength={500} value={enlace} onChange={(e) => setEnlace(e.target.value)} />}
      {cliente && <label><input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Cliente activo</label>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </form>
  </Modal>;
}
