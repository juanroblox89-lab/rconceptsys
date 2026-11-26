"use client";

import { Casilla } from "@/components/ui/Casilla";
import { EnlaceExterno } from "@/components/ui/EnlaceExterno";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, ExternalLink, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { usePerfilActual } from "./AppShell";
import type { Cliente, FichaClienteDatos } from "@/lib/types";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { FotoCliente } from "./ClientesPanel";
import { FilaTrabajo, fechaTrabajo } from "./FilaTrabajo";
import { PickerDriveCliente, type ReferenciaDrive } from "./PickerDriveCliente";
import { useCambiosSinGuardar } from "./CambiosSinGuardar";
import styles from "./FlujoTrabajo.module.css";

/** Lista de referencias del cliente; acepta clientes que solo tienen la referencia única anterior. */
function referenciasDe(c?: Cliente): ReferenciaDrive[] {
  if (c?.drive_referencias?.length) return c.drive_referencias.map(r => ({ id: r.id, nombre: r.nombre, url: r.url, ruta: r.ruta }));
  return c?.drive_referencia_id ? [{ id: c.drive_referencia_id, nombre: c.drive_referencia_nombre ?? "Referencia de Drive", url: c.drive_referencia_url ?? undefined }] : [];
}

function EnlaceCliente({ href, ruta, children }: { href?: string | null; ruta?: string; children: string }) {
  return href && /^https:\/\/(drive|docs)\.google\.com\//.test(href) ? (
    <EnlaceExterno
      className={`rc-btn rc-btn--secundario rc-btn--sm ${styles.enlaceCliente}`}
      href={href}
      aria-label={children}
      title={ruta ? `${ruta} / ${children}` : children}
    >
      <span className={styles.enlaceClienteTexto}>
        {ruta && <span className={styles.rutaReferenciaCliente}>{ruta}</span>}
        <span>{children}</span>
      </span>
      <ExternalLink size={14} aria-hidden="true" />
    </EnlaceExterno>
  ) : null;
}

export function PaginaCliente({ id, editar = false, admin = false }: { id?: number; editar?: boolean; admin?: boolean }) {
  const router = useRouter();
  const perfil = usePerfilActual();
  const puedeEditar = perfil?.estado === "aprobado" && perfil.es_admin;
  const verEditor = editar && puedeEditar;
  const desdeGestion = admin && puedeEditar;
  const [respuesta, setRespuesta] = useState<FichaClienteDatos | string | null>(null);
  const [intento, setIntento] = useState(0);
  const desde = desdeGestion ? "?desde=admin" : "";
  const lista = desdeGestion ? "/admin?pestana=clientes" : "/clientes";
  const ficha = id === undefined ? lista : `/clientes/${id}${desde}`;
  const dato = typeof respuesta === "object" ? respuesta : null;
  const cliente = dato?.cliente;
  useEffect(() => {
    if (id === undefined) return;
    let vigente = true;
    api.getFichaCliente(id).then(d => { if (vigente) setRespuesta(d); }).catch(e => { if (vigente) setRespuesta(e instanceof Error ? e.message : "No pudimos cargar la ficha."); });
    return () => { vigente = false; };
  }, [id, intento]);

  if ((editar || id === undefined) && perfil === undefined) return <Esqueleto filas={5} />;
  if (id === undefined && !puedeEditar) return <section className={styles.pagina}><h1>Nuevo cliente</h1><p>Solo los administradores pueden crear clientes.</p><Link className="rc-btn rc-btn--secundario rc-btn--sm" href={lista}>Volver a clientes</Link></section>;
  return <section className={`${styles.pagina} ${styles.paginaDetalle}`}>
    <Link className={`rc-btn rc-btn--secundario rc-btn--sm ${styles.enlace}`} href={verEditor ? ficha : lista}><ArrowLeft size={16} aria-hidden="true" />{verEditor && cliente ? "Volver a la ficha" : "Volver a clientes"}</Link>
    <header className={styles.cabecera}>
      <div className={styles.identidad}>{cliente && !verEditor && <FotoCliente cliente={cliente} grande />}<div>
        <h1>{id === undefined ? "Nuevo cliente" : verEditor ? "Editar cliente" : cliente?.nombre ?? "Cliente"}</h1>
        {cliente && <p>{verEditor ? cliente.nombre : cliente.activo ? "Cliente activo" : "Cliente inactivo"}</p>}
      </div></div>
      {puedeEditar && cliente && !verEditor && <Link className={`rc-btn rc-btn--secundario rc-btn--sm ${styles.abrir}`} href={`/clientes/${cliente.id}/editar${desde}`}><Pencil size={15} aria-hidden="true" /> Editar</Link>}
    </header>
    {editar && !puedeEditar && <p className={styles.ayuda}>Ficha de solo lectura.</p>}
    {typeof respuesta === "string" ? <div className={styles.panel}><p role="alert" className={styles.error}>{respuesta}</p><Boton variante="secundario" onClick={() => { setRespuesta(null); setIntento(n => n + 1); }}>Reintentar</Boton></div> :
      id !== undefined && !dato ? <Esqueleto filas={5} /> : verEditor || id === undefined ?
      <EditorCliente cliente={cliente} onCerrar={() => router.push(ficha)} onGuardar={c => router.push(`/clientes/${c.id}${desde}`)} /> : dato && <>
        <section className={styles.panel}>
          <h2>Notas y referencias</h2>
          <p className={styles.textoLargo}>{dato.cliente.notas || "Sin notas."}</p>
          <div className={styles.acciones}>
            {referenciasDe(dato.cliente).map(r => <EnlaceCliente key={r.id} href={r.url} ruta={r.ruta}>{r.nombre}</EnlaceCliente>)}
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
          {!dato.trabajos.length ? <p className={styles.ayuda}>Sin trabajos.</p> : <ul className={styles.listaTrabajos}>{dato.trabajos.map(t => <FilaTrabajo key={t.id} tarea={t} origen={`cliente-${dato.cliente.id}`} soloLectura={!puedeEditar} />)}</ul>}
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
  const [referencias, setReferencias] = useState<ReferenciaDrive[]>(() => referenciasDe(cliente));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const inputFoto = useRef<HTMLInputElement>(null);
  const vistaPrevia = useMemo(() => (foto ? URL.createObjectURL(foto) : null), [foto]);
  useEffect(() => () => { if (vistaPrevia) URL.revokeObjectURL(vistaPrevia); }, [vistaPrevia]);

  const guardado = base ?? cliente;
  const sucio =
    nombre !== (guardado?.nombre ?? "") ||
    notas !== (guardado?.notas ?? "") ||
    activo !== (guardado?.activo ?? true) ||
    foto !== null ||
    referencias.map((r) => r.id).join("|") !== referenciasDe(guardado).map((r) => r.id).join("|");
  const { confirmarSalida, limpiarRegistro } = useCambiosSinGuardar(sucio);

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (ocupado) return;
    if (foto && foto.size > 1024 * 1024) { setError("Elige una imagen que no supere 1 MB."); return; }
    setOcupado(true); setError("");
    try {
      let actual = base ?? await api.adminPostCliente(nombre.trim());
      setBase(actual);
      const ids = referencias.map(r => r.id);
      const cambiaron = ids.join("|") !== referenciasDe(actual).map(r => r.id).join("|");
      actual = await api.adminPatchCliente(actual.id, { nombre: nombre.trim(), notas: notas.trim(), activo,
        ...(cambiaron ? { drive_referencias: ids } : {}) });
      setBase(actual);
      if (foto) { actual = await api.adminSubirFotoCliente(actual.id, foto); setBase(actual); setFoto(null); }
      limpiarRegistro();
      onGuardar(actual);
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos guardar la ficha."); }
    finally { setOcupado(false); }
  }
  return <form className={`${styles.panel} ${styles.form}`} onSubmit={guardar}>
    <Campo etiqueta="Nombre" required maxLength={80} value={nombre} onChange={e => setNombre(e.target.value)} />
    <div className={styles.fotoEditor}>
      {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), next/image no aplica */}
      {vistaPrevia ? <img className={styles.fotoPrevia} src={vistaPrevia} alt="Foto elegida" /> : base ? <FotoCliente cliente={base} grande /> : <span className={styles.fotoVacia} aria-hidden="true"><Camera size={22} strokeWidth={1.6} /></span>}
      <div className={styles.fotoTexto}>
        <span className={styles.fotoTitulo}>Foto de perfil</span>
        <span className={styles.ayuda}>{foto ? foto.name : "JPEG, PNG o WebP de hasta 1 MB."}</span>
        <Boton type="button" variante="secundario" tamano="sm" onClick={() => inputFoto.current?.click()} disabled={ocupado}>{foto || base?.foto_url ? "Cambiar foto" : "Elegir foto"}</Boton>
      </div>
      <input ref={inputFoto} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => {
        setFoto(e.currentTarget.files?.[0] ?? null); setError(""); e.currentTarget.value = "";
      }} />
    </div>
    <Campo como="textarea" etiqueta="Notas" filas={5} maxLength={1000} value={notas} onChange={e => setNotas(e.target.value)} />
    <PickerDriveCliente clienteId={base?.id} valor={referencias} onChange={setReferencias} disabled={ocupado} />
    {base?.drive_carpeta_id && base.drive_url && <div className={styles.acciones}>
      <EnlaceCliente href={base.drive_url}>Abrir carpeta del cliente</EnlaceCliente>
    </div>}
    {cliente && <Casilla etiqueta="Cliente activo" checked={activo} onChange={e => setActivo(e.target.checked)} />}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.accionesFormulario}><Boton variante="secundario" disabled={ocupado} onClick={() => confirmarSalida(onCerrar)}>Volver sin guardar</Boton><Boton type="submit" variante="guardar" cargando={ocupado}>Guardar ficha</Boton></div>
  </form>;
}
