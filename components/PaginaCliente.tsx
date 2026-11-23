"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import type { Cliente, FichaClienteDatos, DriveArchivo } from "@/lib/types";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { FotoCliente } from "./ClientesPanel";
import { FilaTrabajo, fechaTrabajo } from "./FilaTrabajo";
import { PickerDriveCliente, type ReferenciaDrive } from "./PickerDriveCliente";
import styles from "./FlujoTrabajo.module.css";

function EnlaceCliente({ href, children }: { href?: string | null; children: string }) {
  return href && /^https:\/\/drive\.google\.com\//.test(href) ? <a className={styles.enlace} href={href} target="_blank" rel="noreferrer">{children}<ExternalLink size={14} aria-hidden="true" /></a> : null;
}

export function PaginaCliente({ id, editar = false, admin = false }: { id?: number; editar?: boolean; admin?: boolean }) {
  const router = useRouter();
  const [respuesta, setRespuesta] = useState<FichaClienteDatos | string | null>(null);
  const [intento, setIntento] = useState(0);
  const desde = admin ? "?desde=admin" : "";
  const lista = admin ? "/admin?pestana=clientes" : "/clientes";
  const ficha = id === undefined ? lista : `/clientes/${id}${desde}`;
  const dato = typeof respuesta === "object" ? respuesta : null;
  const cliente = dato?.cliente;
  useEffect(() => {
    if (id === undefined) return;
    let vigente = true;
    api.adminGetCliente(id).then(d => { if (vigente) setRespuesta(d); }).catch(e => { if (vigente) setRespuesta(e instanceof Error ? e.message : "No pudimos cargar la ficha."); });
    return () => { vigente = false; };
  }, [id, intento]);

  return <section className={`${styles.pagina} ${styles.paginaDetalle}`}>
    <Link className={styles.enlace} href={editar ? ficha : lista}><ArrowLeft size={16} aria-hidden="true" />{editar && cliente ? "Volver a la ficha" : "Volver a clientes"}</Link>
    <header className={styles.cabecera}>
      <div className={styles.identidad}>{cliente && !editar && <FotoCliente cliente={cliente} grande />}<div>
        <h1>{id === undefined ? "Nuevo cliente" : editar ? "Editar cliente" : cliente?.nombre ?? "Cliente"}</h1>
        <p>{id === undefined ? "Crea la ficha del cliente." : editar ? cliente?.nombre : cliente?.activo ? "Cliente activo" : cliente ? "Cliente inactivo" : "Ficha del cliente"}</p>
      </div></div>
      {cliente && !editar && <Link className={styles.abrir} href={`/clientes/${cliente.id}/editar${desde}`}><Pencil size={15} aria-hidden="true" /> Editar</Link>}
    </header>
    {typeof respuesta === "string" ? <div className={styles.panel}><p role="alert" className={styles.error}>{respuesta}</p><Boton variante="secundario" onClick={() => { setRespuesta(null); setIntento(n => n + 1); }}>Reintentar</Boton></div> :
      id !== undefined && !dato ? <Esqueleto filas={5} /> : editar || id === undefined ?
      <EditorCliente cliente={cliente} onCerrar={() => router.push(ficha)} onGuardar={c => router.push(`/clientes/${c.id}${desde}`)} /> : dato && <>
        <section className={styles.panel}>
          <h2>Notas y referencias</h2>
          <p className={styles.textoLargo}>{dato.cliente.notas || "Sin notas."}</p>
          <div className={styles.acciones}>
            <EnlaceCliente href={dato.cliente.drive_referencia_url}>{dato.cliente.drive_referencia_nombre ?? "Referencia de Drive"}</EnlaceCliente>
            <EnlaceCliente href={dato.cliente.drive_url}>{dato.cliente.drive_carpeta_id ? "Carpeta del cliente" : "Referencia anterior"}</EnlaceCliente>
            {dato.cliente.material_carpeta_id && <EnlaceCliente href={`https://drive.google.com/drive/folders/${encodeURIComponent(dato.cliente.material_carpeta_id)}`}>Material del lugar</EnlaceCliente>}
            {dato.cliente.producto_carpeta_id && <EnlaceCliente href={`https://drive.google.com/drive/folders/${encodeURIComponent(dato.cliente.producto_carpeta_id)}`}>Producto</EnlaceCliente>}
          </div>
        </section>
        <section className={styles.panel}>
          <h2>Estadísticas</h2>
          <dl className={styles.estadisticasCliente}>
            <div><dt>Trabajos totales</dt><dd>{dato.estadisticas.total}</dd></div>
            <div><dt>Activos</dt><dd>{dato.estadisticas.activos}</dd></div>
            <div><dt>Entregados</dt><dd>{dato.estadisticas.entregados}</dd></div>
            <div><dt>Por revisar</dt><dd>{dato.estadisticas.por_revisar}</dd></div>
            <div><dt>Aprobados</dt><dd>{dato.estadisticas.aprobados}</dd></div>
            <div><dt>Cancelados</dt><dd>{dato.estadisticas.cancelados}</dd></div>
            <div><dt>Última entrega</dt><dd>{dato.estadisticas.ultima_entrega ? fechaTrabajo(dato.estadisticas.ultima_entrega) : "Sin entregas"}</dd></div>
          </dl>
        </section>
        <section className={styles.panel}><h2>Trabajos ({dato.estadisticas.total})</h2>
          {!dato.trabajos.length ? <p className={styles.ayuda}>Este cliente todavía no tiene trabajos.</p> : <ul className={styles.listaTrabajos}>{dato.trabajos.map(t => <FilaTrabajo key={t.id} tarea={t} origen={`cliente-${dato.cliente.id}`} />)}</ul>}
        </section>
      </>}
  </section>;
}

function EditorCliente({ cliente, onCerrar, onGuardar }: { cliente?: Cliente; onCerrar(): void; onGuardar(c: Cliente): void }) {
  const [base, setBase] = useState(cliente);
  const [nombre, setNombre] = useState(cliente?.nombre ?? "");
  const [foto, setFoto] = useState<File | null>(null);
  const [notas, setNotas] = useState(cliente?.notas ?? "");
  const [activo, setActivo] = useState(cliente?.activo ?? true);
  const [referencia, setReferencia] = useState<ReferenciaDrive | null>(cliente?.drive_referencia_id ? { id: cliente.drive_referencia_id, nombre: cliente.drive_referencia_nombre ?? "Referencia de Drive" } : null);
  const [modo, setModo] = useState("");
  const [carpetas, setCarpetas] = useState<DriveArchivo[] | null>(null);
  const [carpeta, setCarpeta] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (modo !== "elegir") return;
    let vigente = true;
    api.adminGetDriveArchivos().then(r => { if (vigente) setCarpetas(r.filter(a => a.es_carpeta)); })
      .catch(e => { if (vigente) { setCarpetas([]); setError(e instanceof Error ? e.message : "No pudimos cargar las carpetas."); } });
    return () => { vigente = false; };
  }, [modo]);

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (ocupado) return;
    if (foto && foto.size > 1024 * 1024) { setError("Elige una imagen que no supere 1 MB."); return; }
    setOcupado(true); setError("");
    try {
      let actual = base ?? await api.adminPostCliente(nombre.trim());
      setBase(actual);
      actual = await api.adminPatchCliente(actual.id, { nombre: nombre.trim(), notas: notas.trim(), activo,
        ...(referencia?.id !== (actual.drive_referencia_id ?? undefined) ? { drive_referencia_id: referencia?.id ?? null } : {}) });
      setBase(actual);
      if (foto) { actual = await api.adminSubirFotoCliente(actual.id, foto); setBase(actual); setFoto(null); }
      if (modo) { actual = await api.adminClienteDrive(actual.id, modo === "crear" ? { crear: true } : { carpeta_id: carpeta }); setBase(actual); }
      onGuardar(actual);
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos guardar la ficha."); }
    finally { setOcupado(false); }
  }
  return <form className={`${styles.panel} ${styles.form}`} onSubmit={guardar}>
    <Campo etiqueta="Nombre" required maxLength={80} value={nombre} onChange={e => setNombre(e.target.value)} />
    <div className={styles.identidad}>{base && <FotoCliente cliente={base} />}<Campo etiqueta="Foto de perfil" type="file" accept="image/*" onChange={e => {
      const archivos = (e.currentTarget as HTMLInputElement).files;
      setFoto(archivos?.[0] ?? null); setError("");
    }} /></div>
    <p className={styles.ayuda}>JPEG, PNG o WebP de hasta 1 MB.</p>
    <Campo como="textarea" etiqueta="Notas" filas={5} maxLength={1000} value={notas} onChange={e => setNotas(e.target.value)} />
    <PickerDriveCliente valor={referencia} onChange={setReferencia} disabled={ocupado} />
    <Campo como="select" etiqueta="Carpeta operativa de Drive" value={modo} onChange={e => { setModo(e.target.value); setCarpetas(null); setCarpeta(""); setError(""); }}>
      <option value="">{base?.drive_carpeta_id ? "Conservar carpeta vinculada" : "Vincular después"}</option>
      <option value="elegir">Elegir carpeta existente</option><option value="crear">Crear carpeta del cliente</option>
    </Campo>
    {modo === "elegir" && <Campo como="select" etiqueta="Carpeta existente" value={carpeta} required onChange={e => setCarpeta(e.target.value)}>
      <option value="">{!carpetas ? "Cargando carpetas…" : carpetas.length ? "Selecciona una carpeta" : "Sin carpetas disponibles"}</option>
      {carpetas?.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
    </Campo>}
    {modo !== "" && <p className={styles.ayuda}>La carpeta operativa se usa para organizar Material del lugar y Producto; no cambia la referencia seleccionada.</p>}
    {cliente && <label><input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} /> Cliente activo</label>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.accionesFormulario}><Boton variante="secundario" disabled={ocupado} onClick={onCerrar}>Volver sin guardar</Boton><Boton type="submit" cargando={ocupado} disabled={modo === "elegir" && !carpeta}>Guardar ficha</Boton></div>
  </form>;
}
