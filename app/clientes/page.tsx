"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/Panel";
import { BootSplash } from "@/components/BootSplash";
import { useSession } from "@/components/SessionProvider";
import { crearCliente, getClientes } from "@/lib/f1ui";
import { clienteEstadoLabel, type Cliente } from "@/lib/f1tipos";
import f1 from "@/components/F1.module.css";

export default function ClientesPage() {
  const { me } = useSession();
  const admin = me?.usuario.acceso === "dueno" || me?.usuario.acceso === "admin";
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [nombre, setNombre] = useState("");
  const [paquete, setPaquete] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setClientes(await getClientes(false));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, []);

  const crear = async () => {
    if (nombre.trim() === "" || saving) return;
    setSaving(true);
    setError(null);
    try {
      const c = await crearCliente({
        nombre: nombre.trim(),
        paquete: paquete.trim() === "" ? null : paquete.trim(),
      });
      setClientes((prev) => (prev === null ? [c] : [...prev, c].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))));
      setNombre("");
      setPaquete("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear");
    } finally {
      setSaving(false);
    }
  };

  const lista = (clientes ?? []).filter((c) =>
    q.trim() === "" || c.nombre.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <Panel title="Clientes">
      <div className="page">
        <h1 className="page-title">Clientes</h1>
        <p className="page-sub">
          {clientes === null ? "Quiénes son y en qué están." : `${lista.length} clientes.`}
          {!admin && " Solo ves los clientes donde tenés tareas."}
        </p>
        <div className={f1.f1filters}>
          <input
            className="input"
            style={{ flex: "1 1 auto" }}
            placeholder="Buscar por nombre"
            aria-label="Buscar cliente"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {admin && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className={f1.f1two}>
              <div className="field" style={{ marginBottom: 8 }}>
                <label className="label" htmlFor="nc-nombre" style={{ fontSize: 12 }}>Nuevo cliente</label>
                <input id="nc-nombre" className="input" value={nombre} disabled={saving} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" />
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label className="label" htmlFor="nc-paquete" style={{ fontSize: 12 }}>Paquete</label>
                <input id="nc-paquete" className="input" value={paquete} disabled={saving} onChange={(e) => setPaquete(e.target.value)} placeholder="TV Basic…" />
              </div>
            </div>
            <button type="button" className="btn btn-sm" disabled={saving || nombre.trim() === ""} onClick={() => void crear()}>
              {saving ? "Guardando…" : "Crear cliente"}
            </button>
          </div>
        )}
        {loading && <BootSplash label="Cargando clientes" />}
        {error !== null && !loading && (
          <div className="error-box" role="alert">
            <p>{error}</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
              Reintentar
            </button>
          </div>
        )}
        {!loading && error === null && lista.length === 0 && (
          <div className="card">
            <p style={{ margin: 0, fontSize: 13, color: "var(--c-text-2)" }}>Ningún cliente por aquí.</p>
          </div>
        )}
        {!loading && error === null && lista.length > 0 && (
          <ul className={f1.f1list}>
            {lista.map((c) => (
              <li key={c.id} className={f1.f1card}>
                <p className={f1.f1cardTitle}>
                  <Link href={`/clientes/${c.id}`}>{c.nombre}</Link>
                </p>
                <p className={f1.f1cardMeta}>{c.paquete ?? "Sin paquete"}</p>
                <div className={f1.f1row}>
                  <span className="chip">{clienteEstadoLabel(c.estado)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
