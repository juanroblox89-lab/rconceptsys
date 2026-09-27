"use client";

/**
 * Ventas F4 — CRM (B/N, compacto, 375 primero, skill compact-ui):
 * - Vendedor: mis leads (kanban en desktop, lista con "mover" en 2 toques
 *   en 375), próximas acciones de hoy, registrar visita (botón grande fijo
 *   abajo en móvil), mis visitas.
 * - Admin/dueño: todos los leads, filtros por vendedor/estado/municipio,
 *   duplicados a resolver, sin asignar, métricas simples (leads por etapa,
 *   tasa de conversión del mes, visitas por vendedor).
 * - Ganar: pide paquete (catálogo F2) → crea/reactiva cliente → comisión
 *   8 % una sola vez (la genera el backend F2).
 * - Offline: cola IndexedDB + client_id; "N pendientes de subir" y sync
 *   sola al volver la señal (evento online + al abrir).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "@/components/Panel";
import { BootSplash } from "@/components/BootSplash";
import { Modal } from "@/components/Modal";
import { useSession } from "@/components/SessionProvider";
import { getUsuarios } from "@/lib/api";
import type { Usuario } from "@/lib/types";
import { getPaquetes } from "@/lib/f2api";
import type { Paquete } from "@/lib/f2tipos";
import {
  crearLead,
  crearVisita,
  ganarLead,
  getLead,
  getLeads,
  getMetricasVentas,
  getVisitas,
  moverLead,
  patchLead,
  reactivarDe,
  reasignarLead,
  subirFotoVisita,
} from "@/lib/f4api";
import {
  borrarPendiente,
  contarPendientes,
  guardarPendiente,
  listarPendientes,
  nuevoClientID,
  type VisitaPendiente,
} from "@/lib/f4offline";
import {
  fmtCOP,
  leadEstadoLabel,
  LEAD_ETAPAS,
  visitaResultadoLabel,
  type Lead,
  type LeadEstado,
  type VentasMetricas,
  type Visita,
} from "@/lib/f4tipos";
import f1 from "@/components/F1.module.css";

type Tab = "leads" | "visitas" | "metricas";

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

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Comprime una imagen a ~500 KB con canvas (BRIEF F4 §2). Devuelve data URL. */
function comprimirFoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const MAX_LADO = 1280;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        const escala = Math.min(1, MAX_LADO / Math.max(w, h));
        w = Math.max(1, Math.round(w * escala));
        h = Math.max(1, Math.round(h * escala));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx === null) {
          URL.revokeObjectURL(url);
          reject(new Error("No se pudo leer la foto"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        let calidad = 0.82;
        let data = canvas.toDataURL("image/jpeg", calidad);
        // Bajar calidad hasta caber en ~500 KB (base64 ≈ 4/3 del binario).
        while (data.length > 680000 && calidad > 0.35) {
          calidad -= 0.12;
          data = canvas.toDataURL("image/jpeg", calidad);
        }
        resolve(data);
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e instanceof Error ? e : new Error("No se pudo leer la foto"));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la foto"));
    };
    img.src = url;
  });
}

function LeadCard({
  lead,
  esAdmin,
  onChange,
  onVer,
}: {
  lead: Lead;
  esAdmin: boolean;
  onChange: (l: Lead) => void;
  onVer: (l: Lead, ganar?: boolean) => void;
}) {
  const [moviendo, setMoviendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pideMotivo, setPideMotivo] = useState(false);

  const correr = async (fn: () => Promise<Lead>) => {
    setMoviendo(true);
    setError(null);
    try {
      onChange(await fn());
      setPideMotivo(false);
      setMotivo("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo mover");
    } finally {
      setMoviendo(false);
    }
  };

  return (
    <li className={f1.f1card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <button
          type="button"
          onClick={() => onVer(lead)}
          style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer" }}
        >
          <strong style={{ fontSize: 13 }}>{lead.negocio}</strong>
        </button>
        <span className={f1.f1chip}>{leadEstadoLabel(lead.estado)}</span>
      </div>
      <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--c-text-2)" }}>
        {[lead.vendedor_nombre ?? "sin asignar", lead.municipio, lead.telefono].filter(Boolean).join(" · ")}
      </p>
      {lead.accion_que !== null && lead.accion_que !== "" && (
        <p style={{ margin: "4px 0 0", fontSize: 12, fontWeight: lead.vencida ? 700 : 400 }}>
          {lead.vencida ? "Vencida: " : "Próx: "}
          {lead.accion_que}
          {lead.accion_fecha ? ` (${lead.accion_fecha})` : ""}
        </p>
      )}
      {lead.duplicados !== undefined && lead.duplicados.length > 0 && (
        <p style={{ margin: "4px 0 0", fontSize: 12 }}>
          Este negocio ya lo tiene {lead.duplicados[0].vendedor_nombre ?? "otro vendedor"}
        </p>
      )}
      {error !== null && (
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--c-text)" }} role="alert">
          {error}
        </p>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {lead.estado !== "ganado" && lead.estado !== "perdido" && (
          <>
            <label style={{ fontSize: 12 }}>
              Mover{" "}
              <select
                className="input"
                style={{ minHeight: 36, fontSize: 13, width: "auto" }}
                value={lead.estado}
                disabled={moviendo}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "perdido") {
                    setPideMotivo(true);
                    return;
                  }
                  if (v === "ganado") {
                    onVer(lead, true);
                    return;
                  }
                  void correr(() => moverLead(lead.id, v as LeadEstado));
                }}
              >
                {LEAD_ETAPAS.map((et) => (
                  <option key={et} value={et}>
                    {leadEstadoLabel(et)}
                  </option>
                ))}
                <option value="perdido">Perdido…</option>
                <option value="ganado">Ganado…</option>
              </select>
            </label>
            {pideMotivo && (
              <span style={{ display: "inline-flex", gap: 6, flex: "1 1 100%" }}>
                <input
                  className="input"
                  style={{ minHeight: 36, fontSize: 13, flex: "1 1 auto" }}
                  placeholder="Motivo (obligatorio)"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={moviendo || motivo.trim() === ""}
                  onClick={() => void correr(() => moverLead(lead.id, "perdido", motivo.trim()))}
                >
                  Perder
                </button>
              </span>
            )}
          </>
        )}
        {esAdmin && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={moviendo} onClick={() => onVer(lead)}>
            Ver / reasignar
          </button>
        )}
      </div>
    </li>
  );
}

export default function VentasPage() {
  const { me } = useSession();
  const acceso = me?.usuario.acceso ?? "equipo";
  const esAdmin = acceso === "dueno" || acceso === "admin";
  const miId = me?.usuario.id ?? "";

  const [tab, setTab] = useState<Tab>("leads");
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [visitas, setVisitas] = useState<Visita[] | null>(null);
  const [metricas, setMetricas] = useState<VentasMetricas | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [paquetes, setPaquetes] = useState<Paquete[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fEstado, setFEstado] = useState("");
  const [fVendedor, setFVendedor] = useState("");
  const [fMunicipio, setFMunicipio] = useState("");
  const [pendientes, setPendientes] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);

  // Modales.
  const [creandoLead, setCreandoLead] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [detalle, setDetalle] = useState<Lead | null>(null);
  const [ganando, setGanando] = useState<Lead | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [ls, vs] = await Promise.all([getLeads({}), getVisitas({})]);
      setLeads(ls);
      setVisitas(vs);
      if (esAdmin) {
        const [m, us, ps] = await Promise.all([getMetricasVentas(), getUsuarios(), getPaquetes()]);
        setMetricas(m);
        setUsuarios(us);
        setPaquetes(ps.filter((p) => p.activo));
      } else {
        const ps = await getPaquetes().catch(() => []);
        setPaquetes(ps.filter((p) => p.activo));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar Ventas");
    }
  }, [esAdmin]);

  // Sincronizar la cola offline: subir pendientes en orden (idempotente por
  // client_id; el backend ignora duplicados aunque se repita el POST).
  const sincronizar = useCallback(async () => {
    if (sincronizando) return;
    setSincronizando(true);
    try {
      const cola: VisitaPendiente[] = await listarPendientes();
      for (const p of cola) {
        try {
          const v = await crearVisita({
            lead_id: p.lead_id,
            negocio: p.negocio,
            telefono: p.telefono,
            municipio: p.municipio,
            direccion: p.direccion,
            barrio: p.barrio,
            latitud: p.latitud,
            longitud: p.longitud,
            notas: p.notas,
            resultado: p.resultado,
            client_id: p.client_id,
            cuando: p.cuando,
          });
          for (const f of p.fotos) {
            try {
              await subirFotoVisita(v.id, f, "foto.jpg");
            } catch {
              // La visita ya subió; la foto se pierde solo si el backend
              // la rechaza (413): no se reintenta para no duplicar visitas.
            }
          }
          await borrarPendiente(p.client_id);
        } catch {
          // Sin red u otro error: queda en cola para el próximo intento.
          break;
        }
      }
      setPendientes(await contarPendientes());
      await cargar();
    } finally {
      setSincronizando(false);
    }
  }, [cargar, sincronizando]);

  useEffect(() => {
    if (me === null) return;
    // Carga inicial + reintento offline al abrir (BRIEF F4 §2): el setState
    // vive en callbacks async, no directo en el efecto.
    const inicio = () => {
      void cargar();
      void contarPendientes().then((n) => setPendientes(n));
    };
    const t = window.setTimeout(inicio, 0);
    // Reintento al volver la señal.
    const alVolver = () => void sincronizar();
    window.addEventListener("online", alVolver);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("online", alVolver);
    };
  }, [me, cargar, sincronizar]);

  const filtrados = useMemo(() => {
    let out = leads ?? [];
    if (fEstado !== "") out = out.filter((l) => l.estado === fEstado);
    if (fVendedor !== "") out = out.filter((l) => (l.vendedor_id ?? "") === fVendedor);
    if (fMunicipio !== "") out = out.filter((l) => (l.municipio ?? "").toLowerCase().includes(fMunicipio.toLowerCase()));
    return out;
  }, [leads, fEstado, fVendedor, fMunicipio]);

  const porEtapa = useMemo(() => {
    const m = new Map<string, Lead[]>();
    for (const et of [...LEAD_ETAPAS, "perdido"]) m.set(et, []);
    for (const l of filtrados) m.get(l.estado)?.push(l);
    return m;
  }, [filtrados]);

  const accionesHoy = useMemo(() => {
    const h = hoyISO();
    return (leads ?? []).filter((l) => l.accion_fecha === h && l.estado !== "ganado" && l.estado !== "perdido");
  }, [leads]);

  const sinAsignar = useMemo(() => (leads ?? []).filter((l) => (l.vendedor_id ?? "") === ""), [leads]);

  if (me === null) return <BootSplash />;
  // Equipo sin oficio ventas (ni admin): 403 honesto sin botones rotos
  // (BRIEF F4 §6.5: no ve Ventas). El backend ya responde 403; aquí se
  // muestra el mensaje en vez de tabs vacíos.
  if (!esAdmin && !(me.usuario.oficios ?? []).includes("ventas")) {
    return (
      <Panel title="Ventas">
        <div className="page">
          <p style={{ fontSize: 13 }}>No tenés permiso para ver Ventas (solo equipo de ventas).</p>
        </div>
      </Panel>
    );
  }
  if (leads === null) {
    return (
      <Panel title="Ventas">
        {error !== null ? <Aviso error={error} onRetry={() => void cargar()} /> : <BootSplash />}
      </Panel>
    );
  }

  return (
    <Panel title="Ventas">
      {/* Despeje inferior: el botón fijo "Registrar visita" no tapa la última etapa (hallazgo QA visual F4). */}
      <div className="page" style={{ paddingBottom: 76 }}>
        <div className={f1.f1filters} role="tablist" aria-label="Vistas de ventas">
          {(["leads", "visitas", "metricas"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`btn btn-sm ${tab === t ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setTab(t)}
            >
              {t === "leads" ? "Leads" : t === "visitas" ? "Visitas" : "Métricas"}
            </button>
          ))}
        </div>

        {pendientes > 0 && (
          <p role="status" style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>
            {pendientes} visita{pendientes === 1 ? "" : "s"} pendiente{pendientes === 1 ? "" : "s"} de subir
            {sincronizando ? " (subiendo…)" : ""}
            {!sincronizando && (
              <>
                {" · "}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void sincronizar()}>
                  Subir ahora
                </button>
              </>
            )}
          </p>
        )}

        {error !== null && <Aviso error={error} onRetry={() => void cargar()} />}

        {tab === "leads" && (
          <>
            {accionesHoy.length > 0 && (
              <div className={f1.f1card} style={{ marginBottom: 10 }}>
                <strong style={{ fontSize: 13 }}>Próximas acciones de hoy ({accionesHoy.length})</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 13 }}>
                  {accionesHoy.slice(0, 5).map((l) => (
                    <li key={l.id}>
                      {l.negocio}: {l.accion_que}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className={f1.f1filters}>
              <select className="input select" aria-label="Filtrar por estado" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
                <option value="">Todos los estados</option>
                {[...LEAD_ETAPAS, "perdido"].map((et) => (
                  <option key={et} value={et}>
                    {leadEstadoLabel(et)}
                  </option>
                ))}
              </select>
              {esAdmin && (
                <select className="input select" aria-label="Filtrar por vendedor" value={fVendedor} onChange={(e) => setFVendedor(e.target.value)}>
                  <option value="">Todos los vendedores</option>
                  <option value="">Sin asignar</option>
                  {usuarios
                    .filter((u) => u.oficios.includes("ventas"))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                </select>
              )}
              <input
                className="input"
                style={{ minHeight: 36, fontSize: 13, flex: "1 1 120px" }}
                placeholder="Municipio…"
                value={fMunicipio}
                onChange={(e) => setFMunicipio(e.target.value)}
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreandoLead(true)}>
                Nuevo lead
              </button>
            </div>

            {esAdmin && sinAsignar.length > 0 && (
              <p style={{ fontSize: 12, color: "var(--c-text-2)", margin: "0 0 8px" }}>
                {sinAsignar.length} sin asignar (reasigná desde el detalle).
              </p>
            )}

            <div className={f1.f1board}>
              {[...porEtapa.entries()].map(([etapa, ls]) => (
                <section key={etapa} className={f1.f1col} aria-label={leadEstadoLabel(etapa)}>
                  <header className={f1.f1colHead}>
                    <span>{leadEstadoLabel(etapa)}</span>
                    <span className={f1.f1colCount}>{ls.length}</span>
                  </header>
                  <ul className={f1.f1list}>
                    {ls.map((l) => (
                      <LeadCard
                        key={l.id}
                        lead={l}
                        esAdmin={esAdmin}
                        onChange={(act) => setLeads((prev) => (prev ?? []).map((x) => (x.id === act.id ? act : x)))}
                        onVer={(dd, ganar) => {
                          setDetalle(dd);
                          if (ganar === true) setGanando(dd);
                        }}
                      />
                    ))}
                    {ls.length === 0 && <li style={{ fontSize: 12, color: "var(--c-text-2)" }}>Vacío.</li>}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}

        {tab === "visitas" && (
          <>
            <div className={f1.f1filters}>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setRegistrando(true)}>
                Registrar visita
              </button>
            </div>
            <ul className={f1.f1list}>
              {(visitas ?? []).map((v) => (
                <li key={v.id} className={f1.f1card}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong style={{ fontSize: 13 }}>{v.negocio ?? "Visita"}</strong>
                    <span className={f1.f1chip}>{visitaResultadoLabel(v.resultado)}</span>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--c-text-2)" }}>
                    {[v.vendedor_nombre, v.cuando ?? v.created_at.slice(0, 10), v.fotos > 0 ? `${v.fotos} foto(s)` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {v.notas !== null && v.notas !== "" && <p style={{ margin: "4px 0 0", fontSize: 12 }}>{v.notas}</p>}
                </li>
              ))}
              {(visitas ?? []).length === 0 && <li style={{ fontSize: 13 }}>Sin visitas todavía.</li>}
            </ul>
          </>
        )}

        {tab === "metricas" && (
          <>
            {metricas === null ? (
              <p style={{ fontSize: 13 }}>{esAdmin ? "Sin métricas." : "Solo el admin ve métricas."}</p>
            ) : (
              <>
                <div className={f1.f1card} style={{ marginBottom: 10 }}>
                  <strong style={{ fontSize: 13 }}>Este mes</strong>
                  <p style={{ margin: "4px 0 0", fontSize: 13 }}>
                    {metricas.ganados_mes} ganados · {metricas.perdidos_mes} perdidos ·{" "}
                    {Math.round(metricas.tasa_conversion_mes * 100)}% conversión
                  </p>
                </div>
                <div className={f1.f1card} style={{ marginBottom: 10 }}>
                  <strong style={{ fontSize: 13 }}>Leads por etapa</strong>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 13 }}>
                    {Object.entries(metricas.por_etapa).map(([et, n]) => (
                      <li key={et}>
                        {leadEstadoLabel(et)}: {n}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={f1.f1card}>
                  <strong style={{ fontSize: 13 }}>Visitas por vendedor</strong>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 13 }}>
                    {Object.entries(metricas.visitas_por_vendedor).map(([id, n]) => (
                      <li key={id}>
                        {metricas.vendedores[id] ?? id}: {n}
                      </li>
                    ))}
                    {Object.keys(metricas.visitas_por_vendedor).length === 0 && <li>Sin visitas.</li>}
                  </ul>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Botón grande fijo abajo en móvil para registrar visita (BRIEF F4 §4). */}
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          setTab("visitas");
          setRegistrando(true);
        }}
        style={{
          position: "fixed",
          left: 12,
          right: 12,
          bottom: 12,
          minHeight: 52,
          fontSize: 16,
          zIndex: 30,
        }}
      >
        Registrar visita
      </button>

      {creandoLead && (
        <CrearLeadModal
          vendedorFijo={esAdmin ? "" : miId}
          paquetes={paquetes}
          onClose={() => setCreandoLead(false)}
          onDone={(l) => {
            setLeads((prev) => [l, ...(prev ?? [])]);
            setCreandoLead(false);
          }}
        />
      )}
      {registrando && (
        <VisitaModal
          leads={leads ?? []}
          onClose={() => setRegistrando(false)}
          onPendiente={(n) => setPendientes((p) => p + n)}
          onDone={(v) => {
            setVisitas((prev) => [v, ...(prev ?? [])]);
            setRegistrando(false);
            void cargar();
          }}
        />
      )}
      {detalle !== null && (
        <DetalleModal
          lead={detalle}
          esAdmin={esAdmin}
          usuarios={usuarios.filter((u) => u.oficios.includes("ventas"))}
          onClose={() => {
            setDetalle(null);
            setGanando(null);
          }}
          onChange={(act) => {
            setLeads((prev) => (prev ?? []).map((x) => (x.id === act.id ? act : x)));
            setDetalle(act);
          }}
          onGanar={() => setGanando(detalle)}
        />
      )}
      {ganando !== null && (
        <GanarModal
          lead={ganando}
          paquetes={paquetes}
          onClose={() => setGanando(null)}
          onDone={(act) => {
            setLeads((prev) => (prev ?? []).map((x) => (x.id === act.id ? act : x)));
            setGanando(null);
            setDetalle(null);
            void cargar();
          }}
        />
      )}
    </Panel>
  );
}

function CrearLeadModal({
  vendedorFijo,
  paquetes,
  onClose,
  onDone,
}: {
  vendedorFijo: string;
  paquetes: Paquete[];
  onClose: () => void;
  onDone: (l: Lead) => void;
}) {
  const [negocio, setNegocio] = useState("");
  const [telefono, setTelefono] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [origen, setOrigen] = useState("visita");
  const [accionQue, setAccionQue] = useState("");
  const [accionFecha, setAccionFecha] = useState("");
  const [paqueteId, setPaqueteId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <Modal title="Nuevo lead" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (negocio.trim() === "") {
            setError("El negocio es obligatorio");
            return;
          }
          setSaving(true);
          setError(null);
          void crearLead({
            negocio: negocio.trim(),
            telefono: telefono.trim(),
            municipio: municipio.trim(),
            origen,
            accion_que: accionQue.trim(),
            accion_fecha: accionFecha,
            paquete_id: paqueteId === "" ? undefined : paqueteId,
            vendedor_id: vendedorFijo === "" ? undefined : vendedorFijo,
          })
            .then((l) => {
              if (l.duplicados !== undefined && l.duplicados.length > 0) {
                setAviso(`Este negocio ya lo tiene ${l.duplicados[0].vendedor_nombre ?? "otro vendedor"}. Se creó igual.`);
              }
              onDone(l);
            })
            .catch((er) => setError(er instanceof Error ? er.message : "No se pudo crear"))
            .finally(() => setSaving(false));
        }}
      >
        <label style={{ fontSize: 14 }}>
          Negocio *
          <input className="input" value={negocio} onChange={(e) => setNegocio(e.target.value)} style={{ minHeight: 48, fontSize: 16 }} />
        </label>
        <label style={{ fontSize: 14 }}>
          Teléfono / WhatsApp
          <input className="input" value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" style={{ minHeight: 48, fontSize: 16 }} />
        </label>
        <label style={{ fontSize: 14 }}>
          Municipio
          <input className="input" value={municipio} onChange={(e) => setMunicipio(e.target.value)} style={{ minHeight: 48, fontSize: 16 }} />
        </label>
        <label style={{ fontSize: 14 }}>
          Origen
          <select className="input" value={origen} onChange={(e) => setOrigen(e.target.value)} style={{ minHeight: 48, fontSize: 16 }}>
            <option value="visita">Visita</option>
            <option value="referido">Referido</option>
            <option value="redes">Redes</option>
            <option value="llamada">Llamada</option>
          </select>
        </label>
        <label style={{ fontSize: 14 }}>
          Paquete de interés
          <select className="input" value={paqueteId} onChange={(e) => setPaqueteId(e.target.value)} style={{ minHeight: 48, fontSize: 16 }}>
            <option value="">Sin paquete</option>
            {paquetes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} ({fmtCOP(p.precio_cop)})
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 14 }}>
          Próxima acción (qué)
          <input className="input" value={accionQue} onChange={(e) => setAccionQue(e.target.value)} style={{ minHeight: 48, fontSize: 16 }} />
        </label>
        <label style={{ fontSize: 14 }}>
          Próxima acción (fecha)
          <input className="input" type="date" value={accionFecha} onChange={(e) => setAccionFecha(e.target.value)} style={{ minHeight: 48, fontSize: 16 }} />
        </label>
        {error !== null && (
          <p role="alert" style={{ fontSize: 13 }}>
            {error}
          </p>
        )}
        {aviso !== null && <p style={{ fontSize: 13 }}>{aviso}</p>}
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ minHeight: 52, fontSize: 16, width: "100%" }}>
          {saving ? "Guardando…" : "Crear lead"}
        </button>
      </form>
    </Modal>
  );
}

function VisitaModal({
  leads,
  onClose,
  onPendiente,
  onDone,
}: {
  leads: Lead[];
  onClose: () => void;
  onPendiente: (n: number) => void;
  onDone: (v: Visita) => void;
}) {
  const [leadId, setLeadId] = useState("");
  const [nuevo, setNuevo] = useState(leads.length === 0);
  const [negocio, setNegocio] = useState("");
  const [resultado, setResultado] = useState("interesado");
  const [notas, setNotas] = useState("");
  const [fotos, setFotos] = useState<string[]>([]);
  const [geo, setGeo] = useState<{ lat: number | null; lon: number | null }>({ lat: null, lon: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Ubicación opcional: si la niegan, la visita igual se guarda (BRIEF F4 §2).
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setGeo({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => {},
      { timeout: 8000 },
    );
  }, []);

  const guardar = async () => {
    if (!nuevo && leadId === "") {
      setError("Elegí el lead o creá uno nuevo");
      return;
    }
    if (nuevo && negocio.trim() === "") {
      setError("El negocio es obligatorio");
      return;
    }
    setSaving(true);
    setError(null);
    const client_id = nuevoClientID();
    const base = {
      client_id,
      lead_id: nuevo ? undefined : leadId,
      negocio: nuevo ? negocio.trim() : undefined,
      latitud: geo.lat,
      longitud: geo.lon,
      notas: notas.trim(),
      resultado,
      cuando: new Date().toISOString(),
      fotos,
    };
    try {
      const v = await crearVisita(base);
      const fotosFallidas: string[] = [];
      for (const f of fotos) {
        try {
          await subirFotoVisita(v.id, f, "foto.jpg");
        } catch {
          // La visita ya quedó: la foto fallida se re-encola con la visita
          // (B4 Valentina: nunca se descarta en silencio).
          fotosFallidas.push(f);
        }
      }
      if (fotosFallidas.length > 0) {
        try {
          await guardarPendiente({ ...base, fotos: fotosFallidas });
          onPendiente(1);
        } catch {
          // Sin IndexedDB: avisar en vez de perder (el contador no miente).
          setError("La visita subió pero una foto no: reintentalo con señal");
          setSaving(false);
          return;
        }
      }
      onDone(v);
    } catch {
      // Sin red: a la cola IndexedDB (no se pierde aunque se cierre la app).
      try {
        await guardarPendiente(base);
        onPendiente(1);
        onClose();
      } catch {
        setError("No hay señal y no se pudo guardar en el teléfono");
        setSaving(false);
      }
    }
  };

  return (
    <Modal title="Registrar visita" onClose={onClose}>
      {nuevo ? (
        <label style={{ fontSize: 14 }}>
          Negocio *
          <input className="input" value={negocio} onChange={(e) => setNegocio(e.target.value)} style={{ minHeight: 48, fontSize: 16 }} />
        </label>
      ) : (
        <label style={{ fontSize: 14 }}>
          Lead *
          <select
            className="input"
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            style={{ minHeight: 48, fontSize: 16 }}
          >
            <option value="">Elegí el lead…</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.negocio}
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNuevo((n) => !n)}>
        {nuevo ? "Elegir lead existente" : "Crear el lead aquí mismo"}
      </button>
      <label style={{ fontSize: 14 }}>
        Resultado
        <select className="input" value={resultado} onChange={(e) => setResultado(e.target.value)} style={{ minHeight: 48, fontSize: 16 }}>
          <option value="interesado">Interesado</option>
          <option value="no_interesado">No interesado</option>
          <option value="volver">Volver</option>
        </select>
      </label>
      <label style={{ fontSize: 14 }}>
        Notas
        <textarea className="input" value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} style={{ fontSize: 16, minHeight: 150 }} />
      </label>
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])].slice(0, 3 - fotos.length);
            void (async () => {
              for (const f of files) {
                try {
                  const data = await comprimirFoto(f);
                  setFotos((prev) => [...prev, data].slice(0, 3));
                } catch {
                  setError("No se pudo leer una foto");
                }
              }
            })();
            e.target.value = "";
          }}
        />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={fotos.length >= 3}>
          {fotos.length === 0 ? "Agregar foto" : `${fotos.length}/3 fotos`}
        </button>
        {geo.lat !== null && <span style={{ fontSize: 12, color: "var(--c-text-2)", marginLeft: 8 }}>Con ubicación</span>}
      </div>
      {error !== null && (
        <p role="alert" style={{ fontSize: 13 }}>
          {error}
        </p>
      )}
      <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void guardar()} style={{ minHeight: 52, fontSize: 16, width: "100%" }}>
        {saving ? "Guardando…" : "Guardar visita"}
      </button>
    </Modal>
  );
}

function DetalleModal({
  lead,
  esAdmin,
  usuarios,
  onClose,
  onChange,
  onGanar,
}: {
  lead: Lead;
  esAdmin: boolean;
  usuarios: Usuario[];
  onClose: () => void;
  onChange: (l: Lead) => void;
  onGanar: () => void;
}) {
  const [full, setFull] = useState<(Lead & { historial?: unknown[] }) | null>(null);
  const [accionQue, setAccionQue] = useState(lead.accion_que ?? "");
  const [accionFecha, setAccionFecha] = useState(lead.accion_fecha ?? "");
  const [vendedor, setVendedor] = useState(lead.vendedor_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getLead(lead.id)
      .then(setFull)
      .catch(() => setFull(null));
  }, [lead.id]);

  const guardarAccion = async () => {
    setSaving(true);
    setError(null);
    try {
      onChange(await patchLead(lead.id, { accion_que: accionQue, accion_fecha: accionFecha }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const reasignar = async () => {
    setSaving(true);
    setError(null);
    try {
      onChange(await reasignarLead(lead.id, vendedor));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reasignar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={lead.negocio} onClose={onClose}>
      <p style={{ fontSize: 13, color: "var(--c-text-2)", margin: "0 0 8px" }}>
        {[lead.telefono, lead.municipio, lead.rubro, lead.origen].filter(Boolean).join(" · ")} · {leadEstadoLabel(lead.estado)}
      </p>
      {lead.notas !== null && lead.notas !== "" && <p style={{ fontSize: 13 }}>{lead.notas}</p>}
      <label style={{ fontSize: 14 }}>
        Próxima acción (qué)
        <input className="input" value={accionQue} onChange={(e) => setAccionQue(e.target.value)} style={{ minHeight: 48, fontSize: 16 }} />
      </label>
      <label style={{ fontSize: 14 }}>
        Próxima acción (fecha)
        <input className="input" type="date" value={accionFecha} onChange={(e) => setAccionFecha(e.target.value)} style={{ minHeight: 48, fontSize: 16 }} />
      </label>
      <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => void guardarAccion()}>
        Guardar próxima acción
      </button>
      {esAdmin && (
        <label style={{ fontSize: 14 }}>
          Vendedor (solo admin reasigna)
          <select className="input" value={vendedor} onChange={(e) => setVendedor(e.target.value)} style={{ minHeight: 48, fontSize: 16 }}>
            <option value="">Sin asignar</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </label>
      )}
      {esAdmin && (
        <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => void reasignar()}>
          Reasignar
        </button>
      )}
      {(lead.estado === "negociacion" || lead.estado === "propuesta_enviada") && (
        <button type="button" className="btn btn-primary" onClick={onGanar} style={{ minHeight: 52, fontSize: 16, width: "100%" }}>
          Ganar (crear cliente)
        </button>
      )}
      {lead.estado !== "negociacion" && lead.estado !== "propuesta_enviada" && lead.estado !== "ganado" && lead.estado !== "perdido" && (
        <p style={{ fontSize: 12, color: "var(--c-text-2)" }}>
          Para ganar, llevá el lead a propuesta o negociación con “Mover” y volvé acá.
        </p>
      )}
      {error !== null && (
        <p role="alert" style={{ fontSize: 13 }}>
          {error}
        </p>
      )}
      {full?.historial !== undefined && Array.isArray(full.historial) && full.historial.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <strong style={{ fontSize: 13 }}>Historial</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 12 }}>
            {(full.historial as { accion: string; actor_nombre: string; cuando: string }[]).slice(-5).map((h, i) => (
              <li key={i}>
                {h.accion} · {h.actor_nombre} · {h.cuando.slice(0, 10)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

function GanarModal({
  lead,
  paquetes,
  onClose,
  onDone,
}: {
  lead: Lead;
  paquetes: Paquete[];
  onClose: () => void;
  onDone: (l: Lead) => void;
}) {
  const [paqueteId, setPaqueteId] = useState(lead.paquete_id ?? "");
  const [nombre, setNombre] = useState(lead.negocio);
  const [reactivar, setReactivar] = useState<{ id: string; nombre: string; estado: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // B3 Valentina: pre-chequear ex-cliente al abrir (no obligar a un 409).
  // Incluye archivados: el backend filtra por ?incluir_archivados=1.
  useEffect(() => {
    let vivo = true;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const mod = await import("@/lib/f1api");
          const cs = await mod.getClientes(true).catch(() => []);
          if (!vivo) return;
          const tel = (lead.telefono ?? "").replace(/\D/g, "").replace(/^57(?=\d{10}$)/, "");
          const prev = cs.find((c) => {
            const ct = (c.contacto_telefono ?? "").replace(/\D/g, "").replace(/^57(?=\d{10}$)/, "");
            if (tel !== "" && ct !== "" && ct === tel) return true;
            const a = lead.negocio.toLowerCase();
            const b = c.nombre.toLowerCase();
            return a !== "" && (b.includes(a) || a.includes(b));
          });
          if (vivo && prev !== undefined) {
            setReactivar({ id: prev.id, nombre: prev.nombre, estado: prev.estado });
          }
        } catch {
          // Sin catálogo: ganar sigue funcionando (el backend devuelve 409).
        }
      })();
    }, 0);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [lead.id, lead.negocio, lead.telefono]);

  const ganar = async (reactivarId?: string) => {
    if (paqueteId === "") {
      setError("Elegí el paquete para crear el cliente");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onDone(await ganarLead(lead.id, { paquete_id: paqueteId, nombre_cliente: nombre, reactivar_id: reactivarId }));
    } catch (e) {
      // 409 = el negocio ya fue cliente (§5.25): ofrecer reactivarlo en vez
      // de crear otro (el cuerpo viene pegado al error, ver req en api.ts).
      const previo = reactivarDe(e);
      if (previo?.reactivar !== undefined && previo.reactivar.id !== "") {
        setReactivar(previo.reactivar);
        setError(`Ese negocio ya fue cliente (${previo.reactivar.nombre}). Reactivalo en vez de crear otro.`);
      } else {
        setError(e instanceof Error ? e.message : "No se pudo ganar");
      }
      setSaving(false);
    }
  };

  return (
    <Modal title={`Ganar: ${lead.negocio}`} onClose={onClose}>
      <label style={{ fontSize: 14 }}>
        Paquete *
        <select className="input" value={paqueteId} onChange={(e) => setPaqueteId(e.target.value)} style={{ minHeight: 48, fontSize: 16 }}>
          <option value="">Elegí el paquete…</option>
          {paquetes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} ({fmtCOP(p.precio_cop)})
            </option>
          ))}
        </select>
      </label>
      <label style={{ fontSize: 14 }}>
        Nombre del cliente
        <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ minHeight: 48, fontSize: 16 }} />
      </label>
      {reactivar !== null && (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={saving}
          onClick={() => void ganar(reactivar.id)}
          style={{ minHeight: 48, width: "100%" }}
        >
          Reactivar {reactivar.nombre} en vez de crear otro
        </button>
      )}
      {error !== null && (
        <p role="alert" style={{ fontSize: 13 }}>
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn btn-primary"
        disabled={saving}
        onClick={() => void ganar()}
        style={{ minHeight: 52, fontSize: 16, width: "100%" }}
      >
        {saving ? "Creando cliente…" : "Crear cliente y ganar"}
      </button>
      <p style={{ fontSize: 12, color: "var(--c-text-2)" }}>
        Crea el cliente con su paquete y genera la comisión del vendedor una sola vez.
      </p>
    </Modal>
  );
}
