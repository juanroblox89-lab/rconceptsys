"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/Panel";
import { BootSplash } from "@/components/BootSplash";
import { useSession } from "@/components/SessionProvider";
import { archivarCliente, getCliente, getTareas, patchCliente } from "@/lib/f1ui";
import {
  CLIENTE_ESTADOS,
  clienteEstadoLabel,
  fmtFechaCorta,
  piezaEstadoLabel,
  type Cliente,
  type Pieza,
  type Tarea,
} from "@/lib/f1tipos";
import f1 from "@/components/F1.module.css";

export default function ClienteFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { me } = useSession();
  const admin = me?.usuario.acceso === "dueno" || me?.usuario.acceso === "admin";
  const [id, setId] = useState<string | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [piezas, setPiezas] = useState<Pieza[] | null>(null);
  const [tareas, setTareas] = useState<Tarea[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [edit, setEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  // Borrador de edición (solo admin).
  const [estado, setEstado] = useState("");
  const [paquete, setPaquete] = useState("");
  const [contacto, setContacto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [drive, setDrive] = useState("");
  const [notas, setNotas] = useState("");
  const [estrategia, setEstrategia] = useState("");

  useEffect(() => {
    void params.then((p) => setId(p.id));
  }, [params]);

  const load = async (cid: string) => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const d = await getCliente(cid);
      setCliente(d.cliente);
      setPiezas(d.piezas);
      setEstado(d.cliente.estado);
      setPaquete(d.cliente.paquete ?? "");
      setContacto(d.cliente.contacto_nombre ?? "");
      setTelefono(d.cliente.contacto_telefono ?? "");
      setWhatsapp(d.cliente.contacto_whatsapp ?? "");
      setDrive(d.cliente.drive_url ?? "");
      setNotas(d.cliente.notas ?? "");
      setEstrategia(d.cliente.estrategia ?? "");
      try {
        setTareas(await getTareas({ cliente: cid }));
      } catch {
        setTareas([]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo cargar";
      if (msg.includes("permiso") || (e !== null && typeof e === "object" && "status" in e && (e as { status: number }).status === 403)) {
        setForbidden(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id === null) return;
    const t = window.setTimeout(() => void load(id), 0);
    return () => window.clearTimeout(t);
  }, [id]);

  const guardar = async () => {
    if (cliente === null || saving) return;
    setSaving(true);
    setError(null);
    try {
      const c = await patchCliente(cliente.id, {
        estado: estado as Cliente["estado"],
        paquete: paquete.trim() === "" ? null : paquete.trim(),
        contacto_nombre: contacto.trim() === "" ? null : contacto.trim(),
        contacto_telefono: telefono.trim() === "" ? null : telefono.trim(),
        contacto_whatsapp: whatsapp.trim() === "" ? null : whatsapp.trim(),
        drive_url: drive.trim() === "" ? null : drive.trim(),
        notas: notas.trim() === "" ? null : notas.trim(),
        estrategia: estrategia.trim() === "" ? null : estrategia.trim(),
        updated_at: cliente.updated_at,
      });
      setCliente(c);
      setEdit(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const archivar = async () => {
    if (cliente === null || saving) return;
    setSaving(true);
    setError(null);
    try {
      await archivarCliente(cliente.id);
      if (id !== null) await load(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo archivar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Cliente">
      <div className="page">
        {loading && <BootSplash label="Cargando cliente" />}
        {forbidden && !loading && (
          <div className="error-box" role="alert" style={{ marginBottom: 0 }}>
            <p>No tenés permiso para ver este cliente: solo ves los clientes donde tenés tareas.</p>
          </div>
        )}
        {error !== null && !loading && !forbidden && (
          <div className="error-box" role="alert">
            <p>{error}</p>
            {id !== null && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load(id)}>
                Reintentar
              </button>
            )}
          </div>
        )}
        {!loading && !forbidden && cliente !== null && (
          <>
            <p className={f1.f1kicker}>
              <Link href="/clientes" style={{ color: "inherit" }}>Clientes</Link>
              {" · "}{clienteEstadoLabel(cliente.estado)}
            </p>
            <h1 className="page-title">{cliente.nombre}</h1>
            <p className="page-sub">
              {cliente.paquete ?? "Sin paquete"}
              {cliente.contacto_nombre ? ` · ${cliente.contacto_nombre}` : ""}
              {cliente.contacto_telefono ? ` · ${cliente.contacto_telefono}` : ""}
            </p>
            {admin && (
              <div className={f1.f1filters}>
                <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => setEdit((v) => !v)}>
                  {edit ? "Cerrar edición" : "Editar"}
                </button>
                {cliente.archivado_at === null && (
                  <button type="button" className="btn btn-danger btn-sm" disabled={saving} onClick={() => void archivar()}>
                    {saving ? "Guardando…" : "Archivar"}
                  </button>
                )}
              </div>
            )}
            {edit && admin && (
              <div className="card" style={{ marginBottom: 12 }}>
                <div className={f1.f1two}>
                  <div className="field">
                    <label className="label" htmlFor="cf-estado">Estado</label>
                    <select id="cf-estado" className="select" value={estado} disabled={saving} onChange={(e) => setEstado(e.target.value)}>
                      {CLIENTE_ESTADOS.map((e) => (
                        <option key={e.value} value={e.value}>{e.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="cf-paquete">Paquete</label>
                    <input id="cf-paquete" className="input" value={paquete} disabled={saving} onChange={(e) => setPaquete(e.target.value)} />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="cf-contacto">Contacto</label>
                    <input id="cf-contacto" className="input" value={contacto} disabled={saving} onChange={(e) => setContacto(e.target.value)} />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="cf-tel">Teléfono</label>
                    <input id="cf-tel" className="input" value={telefono} disabled={saving} onChange={(e) => setTelefono(e.target.value)} />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="cf-wa">WhatsApp</label>
                    <input id="cf-wa" className="input" value={whatsapp} disabled={saving} onChange={(e) => setWhatsapp(e.target.value)} />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="cf-drive">Link a Drive</label>
                    <input id="cf-drive" className="input" value={drive} disabled={saving} onChange={(e) => setDrive(e.target.value)} placeholder="https://…" />
                  </div>
                </div>
                <div className="field">
                  <label className="label" htmlFor="cf-notas">Notas</label>
                  <textarea id="cf-notas" className="textarea" value={notas} disabled={saving} onChange={(e) => setNotas(e.target.value)} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="cf-estr">Estrategia</label>
                  <textarea id="cf-estr" className="textarea" value={estrategia} disabled={saving} onChange={(e) => setEstrategia(e.target.value)} placeholder={"Objetivos, público, tono, formatos, hooks…"} />
                </div>
                <button type="button" className="btn btn-sm" disabled={saving} onClick={() => void guardar()}>
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            )}
            {!edit && (
              <>
                {(cliente.drive_url || cliente.notas) && (
                  <div className="card" style={{ marginBottom: 12 }}>
                    {cliente.drive_url && (
                      <p style={{ margin: "0 0 6px", fontSize: 13 }}>
                        Drive: <a href={cliente.drive_url} target="_blank" rel="noreferrer">{cliente.drive_url}</a>
                      </p>
                    )}
                    {cliente.notas && <p style={{ margin: 0, fontSize: 13, whiteSpace: "pre-wrap" }}>{cliente.notas}</p>}
                  </div>
                )}
                {cliente.estrategia && (
                  <div className="card" style={{ marginBottom: 12 }}>
                    <span className="label">Estrategia</span>
                    <p style={{ margin: 0, fontSize: 13, whiteSpace: "pre-wrap" }}>{cliente.estrategia}</p>
                  </div>
                )}
              </>
            )}
            <h2 className={f1.f1sectionTitle}>Piezas del cliente</h2>
            <ul className={f1.f1list} style={{ marginBottom: 16 }}>
              {(piezas ?? []).map((p) => (
                <li key={p.id} className={f1.f1card}>
                  <p className={f1.f1cardTitle}>
                    {admin ? <Link href={`/produccion/${p.id}`}>{p.titulo}</Link> : p.titulo}
                  </p>
                  <div className={f1.f1row}>
                    <span className="chip">{piezaEstadoLabel(p.estado)}</span>
                    <span style={{ fontSize: 12, color: "var(--c-text-2)" }}>{fmtFechaCorta(p.fecha_objetivo)}</span>
                  </div>
                </li>
              ))}
              {(piezas ?? []).length === 0 && (
                <li className="card"><p style={{ margin: 0, fontSize: 13, color: "var(--c-text-2)" }}>Sin piezas todavía.</p></li>
              )}
            </ul>
            <h2 className={f1.f1sectionTitle}>Historial (actividad del cliente)</h2>
            <ul className={f1.f1list}>
              {(tareas ?? []).slice(0, 20).map((t) => (
                <li key={t.id} className={f1.f1card}>
                  <p className={f1.f1cardTitle}>{t.pieza_titulo}</p>
                  <p className={f1.f1cardMeta}>
                    {t.asignado_nombre ?? "Sin asignar"} · {t.estado}
                    {t.fecha_limite ? ` · ${fmtFechaCorta(t.fecha_limite)}` : ""}
                  </p>
                </li>
              ))}
              {(tareas ?? []).length === 0 && (
                <li className="card"><p style={{ margin: 0, fontSize: 13, color: "var(--c-text-2)" }}>Sin movimiento todavía.</p></li>
              )}
            </ul>
          </>
        )}
      </div>
    </Panel>
  );
}
