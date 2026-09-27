"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/Panel";
import { BootSplash } from "@/components/BootSplash";
import { Modal } from "@/components/Modal";
import { useSession } from "@/components/SessionProvider";
import {
  crearPieza,
  getClientes,
  getPiezas,
  getUsuariosF1,
} from "@/lib/f1ui";
import {
  fmtFecha,
  PIEZA_ESTADOS,
  piezaEstadoLabel,
  type Cliente,
  type Etapa,
  type Pieza,
  type PiezaEstado,
} from "@/lib/f1tipos";
import { ETAPAS, oficioDeEtapa } from "@/lib/f1tipos";
import type { Usuario } from "@/lib/types";
import f1 from "@/components/F1.module.css";

function Aviso({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="error-box" role="alert">
      <p>{error}</p>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}

/** Modal crear pieza: cliente, título, formato, guion, fecha + etapas con asignado filtrado por oficio (§5.8). */
function CrearPiezaModal({
  clientes,
  usuarios,
  onClose,
  onDone,
}: {
  clientes: Cliente[];
  usuarios: Usuario[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [clienteId, setClienteId] = useState(clientes[0]?.id ?? "");
  const [titulo, setTitulo] = useState("");
  const [formato, setFormato] = useState("");
  const [guion, setGuion] = useState("");
  const [fecha, setFecha] = useState("");
  const [etapas, setEtapas] = useState<{ etapa: Etapa; asignado: string; limite: string }[]>([
    { etapa: "grabacion_principal", asignado: "", limite: "" },
    { etapa: "edicion", asignado: "", limite: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cliente = clientes.find((c) => c.id === clienteId);
  const pausado = cliente?.estado === "pausado";

  const porOficio = (oficio: string) => usuarios.filter((u) => u.oficios.includes(oficio));

  const toggleEtapa = (et: Etapa) => {
    setEtapas((prev) =>
      prev.some((e) => e.etapa === et)
        ? prev.filter((e) => e.etapa !== et)
        : [...prev, { etapa: et, asignado: "", limite: "" }],
    );
  };

  const setEtapa = (et: Etapa, k: "asignado" | "limite", v: string) => {
    setEtapas((prev) => prev.map((e) => (e.etapa === et ? { ...e, [k]: v } : e)));
  };

  const puede = titulo.trim() !== "" && clienteId !== "" && etapas.length > 0 && !saving && !pausado;

  const guardar = async () => {
    if (!puede) return;
    setSaving(true);
    setError(null);
    try {
      await crearPieza({
        cliente_id: clienteId,
        titulo: titulo.trim(),
        formato: formato.trim() === "" ? null : formato.trim(),
        guion: guion.trim() === "" ? null : guion.trim(),
        fecha_objetivo: fecha === "" ? null : fecha,
        etapas: etapas.map((e) => ({
          etapa: e.etapa,
          asignado_id: e.asignado === "" ? null : e.asignado,
          fecha_limite: e.limite === "" ? null : e.limite,
        })),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Nueva pieza" onClose={onClose}>
      <div className="field">
        <label className="label" htmlFor="np-cliente">Cliente</label>
        <select id="np-cliente" className="select" value={clienteId} disabled={saving} onChange={(e) => setClienteId(e.target.value)}>
          {clientes.filter((c) => c.estado !== "pausado").map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
          {clientes.filter((c) => c.estado === "pausado").map((c) => (
            <option key={c.id} value={c.id}>{c.nombre} (pausado)</option>
          ))}
        </select>
        {pausado && <p className="hint">Este cliente está pausado: no admite piezas nuevas.</p>}
      </div>
      <div className="field">
        <label className="label" htmlFor="np-titulo">Título</label>
        <input id="np-titulo" className="input" value={titulo} disabled={saving} onChange={(e) => setTitulo(e.target.value)} placeholder="Promo almuerzo fin de semana" />
      </div>
      <div className={f1.f1two}>
        <div className="field">
          <label className="label" htmlFor="np-formato">Formato</label>
          <input id="np-formato" className="input" value={formato} disabled={saving} onChange={(e) => setFormato(e.target.value)} placeholder="Reel" />
        </div>
        <div className="field">
          <label className="label" htmlFor="np-fecha">Fecha objetivo</label>
          <input id="np-fecha" className="input" type="date" value={fecha} disabled={saving} onChange={(e) => setFecha(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="np-guion">Guion</label>
        <textarea id="np-guion" className="textarea" value={guion} disabled={saving} onChange={(e) => setGuion(e.target.value)} placeholder="Qué se graba, en qué orden…" />
      </div>
      <fieldset style={{ border: "1px solid var(--c-line)", borderRadius: 8, padding: "8px 10px", margin: "0 0 12px" }}>
        <legend style={{ fontSize: 13, fontWeight: 600, padding: "0 4px" }}>Etapas y quién las hace</legend>
        {ETAPAS.map((t) => {
          const sel = etapas.find((e) => e.etapa === t.value);
          const cand = porOficio(t.oficio);
          return (
            <div key={t.value} className={f1.f1formEtapa}>
              <div className={f1.f1formEtapaHead}>
                <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={sel !== undefined} disabled={saving} onChange={() => toggleEtapa(t.value)} style={{ accentColor: "#0a0a0a" }} />
                  {t.label}
                </label>
              </div>
              {sel !== undefined && (
                <div className={f1.f1two}>
                  <div>
                    <label className="label" htmlFor={`asig-${t.value}`} style={{ fontSize: 12 }}>
                      Asignado (oficio {oficioDeEtapa(t.value)})
                    </label>
                    <select
                      id={`asig-${t.value}`}
                      className="select"
                      value={sel.asignado}
                      disabled={saving}
                      onChange={(e) => setEtapa(t.value, "asignado", e.target.value)}
                    >
                      <option value="">Sin asignar</option>
                      {cand.map((u) => (
                        <option key={u.id} value={u.id}>{u.nombre}</option>
                      ))}
                    </select>
                    {cand.length === 0 && <p className="hint">Nadie con este oficio todavía.</p>}
                  </div>
                  <div>
                    <label className="label" htmlFor={`lim-${t.value}`} style={{ fontSize: 12 }}>
                      Fecha límite
                    </label>
                    <input
                      id={`lim-${t.value}`}
                      className="input"
                      type="date"
                      value={sel.limite}
                      disabled={saving}
                      onChange={(e) => setEtapa(t.value, "limite", e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </fieldset>
      {error !== null && (
        <div className="error-box" role="alert"><p>{error}</p></div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn btn-sm" onClick={() => void guardar()} disabled={!puede}>
          {saving ? "Guardando…" : "Crear pieza"}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={saving}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}

function PiezaCard({ pieza }: { pieza: Pieza }) {
  return (
    <li className={`${f1.f1card} ${pieza.vencida ? f1.f1esVencida : ""}`}>
      <p className={f1.f1cardTitle}>
        <Link href={`/produccion/${pieza.id}`}>{pieza.titulo}</Link>
      </p>
      <p className={f1.f1cardMeta}>{pieza.cliente_nombre} · {pieza.formato ?? "sin formato"}</p>
      <div className={f1.f1row}>
        <span className="chip">{piezaEstadoLabel(pieza.estado)}</span>
        <span className={pieza.vencida ? f1.f1vencida : undefined} style={{ fontSize: 12 }}>
          {pieza.vencida ? `Vencida · ${fmtFecha(pieza.fecha_objetivo)}` : fmtFecha(pieza.fecha_objetivo)}
        </span>
      </div>
    </li>
  );
}

export default function ProduccionPage() {
  const { me } = useSession();
  const admin = me?.usuario.acceso === "dueno" || me?.usuario.acceso === "admin";
  const [piezas, setPiezas] = useState<Pieza[] | null>(null);
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fCliente, setFCliente] = useState("");
  const [fPersona, setFPersona] = useState("");
  const [fEstado, setFEstado] = useState<PiezaEstado | "">("");
  const [filtros, setFiltros] = useState(false);
  const [crear, setCrear] = useState(false);
  const conFiltros = fCliente !== "" || fPersona !== "";

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const filtros =
        fPersona === ""
          ? { cliente: fCliente === "" ? undefined : fCliente, estado: fEstado === "" ? undefined : fEstado }
          : { asignado: fPersona, cliente: fCliente === "" ? undefined : fCliente, estado: fEstado === "" ? undefined : fEstado };
      const [ps, cs] = await Promise.all([getPiezas(filtros), getClientes(false)]);
      let us: Usuario[] | null = null;
      try {
        us = await getUsuariosF1();
      } catch {
        us = null;
      }
      setPiezas(ps);
      setClientes(cs);
      setUsuarios(us);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
    // Filtros directos: la recarga corre cuando el usuario los cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fCliente, fEstado, fPersona]);

  const filtradas = useMemo(() => piezas ?? [], [piezas]);

  const porEstado = useMemo(() => {
    const map = new Map<string, Pieza[]>();
    for (const p of filtradas) {
      const arr = map.get(p.estado) ?? [];
      arr.push(p);
      map.set(p.estado, arr);
    }
    return map;
  }, [filtradas]);

  if (!admin && me !== null) {
    return (
      <Panel title="Producción">
        <div className="page">
          <h1 className="page-title">Producción</h1>
          <div className="error-box" role="alert" style={{ marginBottom: 0 }}>
            <p>No tenés permiso para ver el tablero. Tus tareas están en Mis tareas.</p>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Producción">
      <div className="page">
        <h1 className="page-title">Producción</h1>
        <p className="page-sub">
          {piezas === null ? "Tablero por estado." : `${piezas.length} piezas en total.`}
        </p>
        <div className={f1.f1filters}>
          <button type="button" className="btn btn-sm" onClick={() => setCrear(true)} disabled={clientes === null}>
            Nueva pieza
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFiltros(true)}>
            Filtros{conFiltros ? " •" : ""}
          </button>
        </div>
        {filtros && (
          <Modal title="Filtros" onClose={() => setFiltros(false)}>
            <div className={f1.f1sheetFilters}>
              <label className="label" htmlFor="pf-cliente">
                Cliente
                <select id="pf-cliente" className="select" value={fCliente} onChange={(e) => setFCliente(e.target.value)}>
                  <option value="">Todos los clientes</option>
                  {(clientes ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </label>
              <label className="label" htmlFor="pf-persona">
                Persona
                <select id="pf-persona" className="select" value={fPersona} onChange={(e) => setFPersona(e.target.value)}>
                  <option value="">Todas las personas</option>
                  {(usuarios ?? []).map((u) => (
                    <option key={u.id} value={u.id}>{u.nombre}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn btn-sm" onClick={() => setFiltros(false)}>
                Ver {filtradas.length} piezas
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setFCliente("");
                  setFPersona("");
                }}
              >
                Limpiar
              </button>
            </div>
          </Modal>
        )}
        {loading && <BootSplash label="Cargando producción" />}
        {error !== null && !loading && <Aviso error={error} onRetry={() => void load()} />}
        {!loading && error === null && (
          <>
            {/* Mobile (375): una columna + selector de estado. */}
            <div className={f1.f1onlyMobile}>
              <div className={f1.f1filters}>
                <select className="select" aria-label="Estado" value={fEstado} onChange={(e) => setFEstado(e.target.value as PiezaEstado | "")}>
                  <option value="">Todos los estados</option>
                  {PIEZA_ESTADOS.map((e) => (
                    <option key={e.value} value={e.value}>{e.label}</option>
                  ))}
                </select>
              </div>
              <ul className={f1.f1list}>
                {filtradas.map((p) => (
                  <PiezaCard key={p.id} pieza={p} />
                ))}
              </ul>
              {filtradas.length === 0 && (
                <div className="card"><p className={f1.f1vacio}><strong>Nada con estos filtros</strong>Probá con otro cliente o persona.</p></div>
              )}
            </div>
            {/* Desktop: columnas por estado (canceladas en su columna, §4.1). */}
            <div className={`${f1.f1board} ${f1.f1onlyDesktop}`}>
              {PIEZA_ESTADOS.map((e) => {
                const ps = porEstado.get(e.value) ?? [];
                return (
                  <div key={e.value} className={f1.f1col}>
                    <div className={f1.f1colHead}>
                      <span>{e.label}</span>
                      <span className={f1.f1colCount}>{ps.length}</span>
                    </div>
                    <ul className={f1.f1list}>
                      {ps.map((p) => (
                        <PiezaCard key={p.id} pieza={p} />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {crear && clientes !== null && (
          <CrearPiezaModal
            clientes={clientes}
            usuarios={usuarios ?? []}
            onClose={() => setCrear(false)}
            onDone={() => {
              setCrear(false);
              void load();
            }}
          />
        )}
      </div>
    </Panel>
  );
}
