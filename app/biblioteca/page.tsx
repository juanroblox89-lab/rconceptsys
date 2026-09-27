"use client";

/**
 * Biblioteca F3 — Formatos, Hooks, Referencias, SOPs (+Ejecuciones).
 * B/N, compacto, 375 primero (skill compact-ui): 13–14px, filtros 36–40px,
 * tarjetas parejas con componentes Globe (Panel + F1.module.css).
 *
 * - Leer: todo acceso salvo pendiente/desactivado.
 * - Equipo propone → borrador (solo él + admin lo ven); admin/dueño
 *   publica directo, publica/rechaza con motivo, archiva.
 * - Búsqueda ?q= y filtros ?etiqueta/?categoria/?plataforma/?oficio.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/Panel";
import { BootSplash } from "@/components/BootSplash";
import { useSession } from "@/components/SessionProvider";
import { getTareas } from "@/lib/f1ui";
import {
  archivarFormato,
  archivarHook,
  archivarReferencia,
  archivarSOP,
  crearFormato,
  crearHook,
  crearReferencia,
  crearSOP,
  desmarcarPaso,
  getEjecuciones,
  getFormatos,
  getHooks,
  getReferencias,
  getSOP,
  getSOPs,
  iniciarEjecucion,
  marcarPaso,
  patchFormato,
  publicarFormato,
  publicarHook,
  publicarReferencia,
  publicarSOP,
  rechazarFormato,
  rechazarHook,
  rechazarReferencia,
  rechazarSOP,
  terminarEjecucion,
} from "@/lib/f3api";
import {
  bibEstadoLabel,
  sopOficioLabel,
  type BibEstado,
  type Formato,
  type Hook,
  type Referencia,
  type SOP,
  type SOPEjecucion,
  type SOPPaso,
} from "@/lib/f3tipos";
import f1 from "@/components/F1.module.css";

type Tab = "formatos" | "hooks" | "referencias" | "sops" | "ejecuciones" | "borradores";

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

function EstadoChip({ estado }: { estado: string }) {
  return <span className={f1.f1chip}>{bibEstadoLabel(estado)}</span>;
}

function Etiquetas({ etiquetas }: { etiquetas: string[] }) {
  if (etiquetas.length === 0) return null;
  return (
    <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--c-text-2)" }}>
      {etiquetas.join(" · ")}
    </p>
  );
}

function Rechazo({ motivo }: { motivo: string | null }) {
  if (motivo === null || motivo === "") return null;
  return (
    <p style={{ margin: "4px 0 0", fontSize: 12 }}>
      <strong>Motivo del rechazo:</strong> {motivo}
    </p>
  );
}

function AccionesBib({
  estado,
  esAdmin,
  esMio,
  saving,
  onPublicar,
  onRechazar,
  onArchivar,
}: {
  estado: BibEstado;
  esAdmin: boolean;
  esMio: boolean;
  saving: boolean;
  onPublicar: () => void;
  onRechazar: () => void;
  onArchivar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [pideMotivo, setPideMotivo] = useState(false);
  if (!esAdmin) return null;
  if (estado === "archivado") return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
      {estado === "borrador" && (
        <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={onPublicar}>
          Publicar
        </button>
      )}
      {estado === "borrador" &&
        (pideMotivo ? (
          <span style={{ display: "inline-flex", gap: 6, flex: "1 1 100%" }}>
            <input
              className="input"
              style={{ minHeight: 36, fontSize: 13, flex: "1 1 auto" }}
              placeholder="Motivo del rechazo (obligatorio)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={saving || motivo.trim() === ""}
              onClick={onRechazar}
            >
              Enviar
            </button>
          </span>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => setPideMotivo(true)}>
            Rechazar
          </button>
        ))}
      {estado !== "borrador" && (
        <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={onArchivar}>
          Archivar
        </button>
      )}
      {esMio && estado === "rechazado" && (
        <span style={{ fontSize: 12, color: "var(--c-text-2)" }}>Editá y se vuelve a proponer.</span>
      )}
    </div>
  );
}

/* ---------- Formatos ---------- */

function FormatoCard({
  formato,
  esAdmin,
  miId,
  onChange,
}: {
  formato: Formato;
  esAdmin: boolean;
  miId: string;
  onChange: (f: Formato) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [nombre, setNombre] = useState(formato.nombre);
  const [estructura, setEstructura] = useState(formato.estructura ?? "");
  const [objetivo, setObjetivo] = useState(formato.objetivo ?? "");
  const [rechazo, setRechazo] = useState("");

  const correr = async (fn: () => Promise<Formato>) => {
    setSaving(true);
    setError(null);
    try {
      onChange(await fn());
      setEdit(false);
      setRechazo("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const editable =
    esAdmin ||
    ((formato.estado === "borrador" || formato.estado === "rechazado") && formato.propuesto_por === miId);

  return (
    <li className={f1.f1card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ fontSize: 13 }}>
          {formato.codigo ? `${formato.codigo} · ` : ""}
          {formato.nombre}
        </strong>
        <EstadoChip estado={formato.estado} />
      </div>
      {formato.objetivo !== null && formato.objetivo !== "" && (
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--c-text-2)" }}>{formato.objetivo}</p>
      )}
      {formato.estructura !== null && formato.estructura !== "" && (
        <p style={{ margin: "4px 0 0", fontSize: 12, whiteSpace: "pre-wrap" }}>{formato.estructura}</p>
      )}
      {(formato.kpis !== null && formato.kpis !== "") ||
      (formato.hooks_recomendados !== null && formato.hooks_recomendados !== "") ? (
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--c-text-2)" }}>
          {[formato.hooks_recomendados, formato.kpis].filter((x) => x !== null && x !== "").join(" · ")}
        </p>
      ) : null}
      <Etiquetas etiquetas={formato.etiquetas} />
      <Rechazo motivo={formato.motivo_rechazo} />
      {formato.propuesto_por_nombre !== null && formato.propuesto_por_nombre !== undefined && formato.estado === "borrador" && esAdmin && (
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--c-text-2)" }}>
          Propuesto por {formato.propuesto_por_nombre}
        </p>
      )}
      {editable && (
        <div style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => setEdit((v) => !v)}>
            {edit ? "Cerrar" : "Editar"}
          </button>
        </div>
      )}
      {edit && editable && (
        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
          <input className="input" style={{ minHeight: 36, fontSize: 13 }} value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre" />
          <input className="input" style={{ minHeight: 36, fontSize: 13 }} value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="Objetivo" aria-label="Objetivo" />
          <textarea className="textarea" value={estructura} onChange={(e) => setEstructura(e.target.value)} placeholder="Estructura (un paso por línea)" aria-label="Estructura" />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={saving || nombre.trim() === ""}
            onClick={() => void correr(() => patchFormato(formato.id, { nombre: nombre.trim(), objetivo, estructura }))}
          >
            Guardar
          </button>
        </div>
      )}
      <AccionesBib
        estado={formato.estado}
        esAdmin={esAdmin}
        esMio={formato.propuesto_por === miId}
        saving={saving}
        onPublicar={() => void correr(() => publicarFormato(formato.id))}
        onRechazar={() => {
          if (rechazo.trim() === "") {
            setError("Escribí el motivo del rechazo primero.");
            return;
          }
          void correr(() => rechazarFormato(formato.id, rechazo.trim()));
        }}
        onArchivar={() => void correr(() => archivarFormato(formato.id))}
      />
      {esAdmin && formato.estado === "borrador" && (
        <input
          className="input"
          style={{ minHeight: 36, fontSize: 13, marginTop: 6 }}
          placeholder="Motivo del rechazo (para Rechazar)"
          value={rechazo}
          onChange={(e) => setRechazo(e.target.value)}
          aria-label="Motivo del rechazo"
        />
      )}
      {error !== null && (
        <p style={{ margin: "6px 0 0", fontSize: 12 }} role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/* ---------- Hooks ---------- */

function HookCard({
  hook,
  esAdmin,
  miId,
  onChange,
}: {
  hook: Hook;
  esAdmin: boolean;
  miId: string;
  onChange: (h: Hook) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rechazo, setRechazo] = useState("");
  const correr = async (fn: () => Promise<Hook>) => {
    setSaving(true);
    setError(null);
    try {
      onChange(await fn());
      setRechazo("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };
  return (
    <li className={f1.f1card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ fontSize: 13 }}>{hook.titulo}</strong>
        <EstadoChip estado={hook.estado} />
      </div>
      <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--c-text-2)" }}>
        {[hook.categoria, hook.retencion_esperada ? `Retención ${hook.retencion_esperada}` : ""]
          .filter((x) => x !== null && x !== "")
          .join(" · ")}
      </p>
      {hook.psicologia !== null && hook.psicologia !== "" && (
        <p style={{ margin: "4px 0 0", fontSize: 12 }}>{hook.psicologia}</p>
      )}
      <Etiquetas etiquetas={hook.etiquetas} />
      <Rechazo motivo={hook.motivo_rechazo} />
      {hook.propuesto_por_nombre !== null && hook.propuesto_por_nombre !== undefined && hook.estado === "borrador" && esAdmin && (
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--c-text-2)" }}>
          Propuesto por {hook.propuesto_por_nombre}
        </p>
      )}
      <AccionesBib
        estado={hook.estado}
        esAdmin={esAdmin}
        esMio={hook.propuesto_por === miId}
        saving={saving}
        onPublicar={() => void correr(() => publicarHook(hook.id))}
        onRechazar={() => {
          if (rechazo.trim() === "") {
            setError("Escribí el motivo del rechazo primero.");
            return;
          }
          void correr(() => rechazarHook(hook.id, rechazo.trim()));
        }}
        onArchivar={() => void correr(() => archivarHook(hook.id))}
      />
      {esAdmin && hook.estado === "borrador" && (
        <input
          className="input"
          style={{ minHeight: 36, fontSize: 13, marginTop: 6 }}
          placeholder="Motivo del rechazo (para Rechazar)"
          value={rechazo}
          onChange={(e) => setRechazo(e.target.value)}
          aria-label="Motivo del rechazo"
        />
      )}
      {error !== null && (
        <p style={{ margin: "6px 0 0", fontSize: 12 }} role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/* ---------- Referencias ---------- */

function ReferenciaCard({
  referencia,
  esAdmin,
  miId,
  onChange,
}: {
  referencia: Referencia;
  esAdmin: boolean;
  miId: string;
  onChange: (r: Referencia) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rechazo, setRechazo] = useState("");
  const correr = async (fn: () => Promise<Referencia>) => {
    setSaving(true);
    setError(null);
    try {
      onChange(await fn());
      setRechazo("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };
  return (
    <li className={f1.f1card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ fontSize: 13 }}>
          <a href={referencia.link} target="_blank" rel="noreferrer">
            {referencia.titulo}
          </a>
        </strong>
        <EstadoChip estado={referencia.estado} />
      </div>
      <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--c-text-2)" }}>{referencia.plataforma}</p>
      {referencia.analisis !== null && referencia.analisis !== "" && (
        <p style={{ margin: "4px 0 0", fontSize: 12 }}>{referencia.analisis}</p>
      )}
      <Etiquetas etiquetas={referencia.etiquetas} />
      <Rechazo motivo={referencia.motivo_rechazo} />
      <AccionesBib
        estado={referencia.estado}
        esAdmin={esAdmin}
        esMio={referencia.propuesto_por === miId}
        saving={saving}
        onPublicar={() => void correr(() => publicarReferencia(referencia.id))}
        onRechazar={() => {
          if (rechazo.trim() === "") {
            setError("Escribí el motivo del rechazo primero.");
            return;
          }
          void correr(() => rechazarReferencia(referencia.id, rechazo.trim()));
        }}
        onArchivar={() => void correr(() => archivarReferencia(referencia.id))}
      />
      {esAdmin && referencia.estado === "borrador" && (
        <input
          className="input"
          style={{ minHeight: 36, fontSize: 13, marginTop: 6 }}
          placeholder="Motivo del rechazo (para Rechazar)"
          value={rechazo}
          onChange={(e) => setRechazo(e.target.value)}
          aria-label="Motivo del rechazo"
        />
      )}
      {error !== null && (
        <p style={{ margin: "6px 0 0", fontSize: 12 }} role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/* ---------- SOPs ---------- */

function SOPCard({
  sop,
  esAdmin,
  miId,
  onChange,
  onEjecutar,
}: {
  sop: SOP;
  esAdmin: boolean;
  miId: string;
  onChange: (s: SOP) => void;
  onEjecutar: (sop: SOP) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasos, setPasos] = useState<SOPPaso[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [rechazo, setRechazo] = useState("");
  const correr = async (fn: () => Promise<SOP>) => {
    setSaving(true);
    setError(null);
    try {
      onChange(await fn());
      setRechazo("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };
  const verPasos = async () => {
    if (abierto) {
      setAbierto(false);
      return;
    }
    setSaving(true);
    try {
      const d = await getSOP(sop.id);
      setPasos(d.pasos);
      setAbierto(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    } finally {
      setSaving(false);
    }
  };
  return (
    <li className={f1.f1card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ fontSize: 13 }}>{sop.titulo}</strong>
        <EstadoChip estado={sop.estado} />
      </div>
      <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--c-text-2)" }}>
        {sopOficioLabel(sop.oficio)}
        {sop.tiempo_estimado_min !== null ? ` · ~${sop.tiempo_estimado_min} min` : ""}
      </p>
      <Etiquetas etiquetas={sop.etiquetas} />
      <Rechazo motivo={sop.motivo_rechazo} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => void verPasos()}>
          {abierto ? "Ocultar pasos" : "Ver pasos"}
        </button>
        {sop.estado === "publicado" && (
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => onEjecutar(sop)}>
            Iniciar
          </button>
        )}
      </div>
      {abierto && (
        <ol style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12 }}>
          {(pasos ?? []).map((p) => (
            <li key={p.id} style={{ marginBottom: 4 }}>
              <strong>{p.titulo ?? p.title}</strong>
              {p.descripcion !== null && p.descripcion !== "" && (
                <span style={{ color: "var(--c-text-2)" }}> — {p.descripcion}</span>
              )}
            </li>
          ))}
          {(pasos ?? []).length === 0 && <li>Sin pasos cargados.</li>}
        </ol>
      )}
      <AccionesBib
        estado={sop.estado}
        esAdmin={esAdmin}
        esMio={sop.propuesto_por === miId}
        saving={saving}
        onPublicar={() => void correr(() => publicarSOP(sop.id))}
        onRechazar={() => {
          if (rechazo.trim() === "") {
            setError("Escribí el motivo del rechazo primero.");
            return;
          }
          void correr(() => rechazarSOP(sop.id, rechazo.trim()));
        }}
        onArchivar={() => void correr(() => archivarSOP(sop.id))}
      />
      {esAdmin && sop.estado === "borrador" && (
        <input
          className="input"
          style={{ minHeight: 36, fontSize: 13, marginTop: 6 }}
          placeholder="Motivo del rechazo (para Rechazar)"
          value={rechazo}
          onChange={(e) => setRechazo(e.target.value)}
          aria-label="Motivo del rechazo"
        />
      )}
      {error !== null && (
        <p style={{ margin: "6px 0 0", fontSize: 12 }} role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/* ---------- Ejecuciones ---------- */

function EjecucionCard({
  ejecucion,
  pasos,
  onChange,
}: {
  ejecucion: SOPEjecucion;
  pasos: SOPPaso[];
  onChange: (e: SOPEjecucion) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const terminada = ejecucion.estado === "terminada";
  const correr = async (fn: () => Promise<SOPEjecucion>) => {
    setSaving(true);
    setError(null);
    try {
      onChange(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };
  const marcados = new Set(ejecucion.pasos_marcados);
  return (
    <li className={f1.f1card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ fontSize: 13 }}>{ejecucion.sop_titulo ?? ejecucion.sop_id}</strong>
        <span className={f1.f1chip}>{terminada ? "Terminada" : "En curso"}</span>
      </div>
      <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--c-text-2)" }}>
        {ejecucion.iniciado_por_nombre ?? ejecucion.iniciado_por}
        {` · ${marcados.size}/${pasos.length} pasos`}
      </p>
      <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "grid", gap: 6 }}>
        {pasos.map((p) => {
          const marcado = marcados.has(p.id);
          return (
            <li key={p.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
              <input
                type="checkbox"
                style={{ width: 20, height: 20, marginTop: 1 }}
                checked={marcado}
                disabled={saving || terminada}
                onChange={() =>
                  void correr(() =>
                    marcado ? desmarcarPaso(ejecucion.id, p.id) : marcarPaso(ejecucion.id, p.id),
                  )
                }
                aria-label={p.titulo ?? p.title ?? "Paso"}
              />
              <span style={marcado ? { textDecoration: "line-through", color: "var(--c-text-2)" } : undefined}>
                <strong>{p.titulo ?? p.title}</strong>
                {p.descripcion !== null && p.descripcion !== "" && (
                  <span style={{ color: "var(--c-text-2)" }}> — {p.descripcion}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {!terminada && (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          style={{ marginTop: 8 }}
          disabled={saving}
          onClick={() => void correr(() => terminarEjecucion(ejecucion.id))}
        >
          Terminar
        </button>
      )}
      {error !== null && (
        <p style={{ margin: "6px 0 0", fontSize: 12 }} role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/* ---------- Página ---------- */

export default function BibliotecaPage() {
  const { me } = useSession();
  const acceso = me?.usuario.acceso ?? "equipo";
  const esAdmin = acceso === "dueno" || acceso === "admin";
  const miId = me?.usuario.id ?? "";
  const [tab, setTab] = useState<Tab>("formatos");
  const [q, setQ] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const [categoria, setCategoria] = useState("");
  const [plataforma, setPlataforma] = useState("");
  const [oficio, setOficio] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formatos, setFormatos] = useState<Formato[] | null>(null);
  const [hooks, setHooks] = useState<Hook[] | null>(null);
  const [referencias, setReferencias] = useState<Referencia[] | null>(null);
  const [sops, setSOPs] = useState<SOP[] | null>(null);
  const [ejecuciones, setEjecuciones] = useState<SOPEjecucion[] | null>(null);
  const [pasosPorSOP, setPasosPorSOP] = useState<Record<string, SOPPaso[]>>({});

  // Formularios de propuesta (equipo) / creación (admin).
  const [nuevoTitulo, setNuevoTitulo] = useState("");
  const [nuevoDetalle, setNuevoDetalle] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const qt = q.trim() === "" ? undefined : q.trim();
      const et = etiqueta.trim() === "" ? undefined : etiqueta.trim();
      const [fs, hs, rs, ss, es] = await Promise.all([
        getFormatos({ q: qt, etiqueta: et }),
        getHooks({ q: qt, etiqueta: et, categoria: categoria === "" ? undefined : categoria }),
        getReferencias({ q: qt, etiqueta: et, plataforma: plataforma === "" ? undefined : plataforma }),
        getSOPs({ q: qt, etiqueta: et, oficio: oficio === "" ? undefined : oficio }),
        getEjecuciones({}),
      ]);
      setFormatos(fs);
      setHooks(hs);
      setReferencias(rs);
      setSOPs(ss);
      setEjecuciones(es);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    } finally {
      setCargando(false);
    }
  }, [q, etiqueta, categoria, plataforma, oficio]);

  useEffect(() => {
    const t = window.setTimeout(() => void cargar(), 150);
    return () => window.clearTimeout(t);
  }, [cargar]);

  const cargarPasos = useCallback(async (sopId: string) => {
    try {
      const d = await getSOP(sopId);
      setPasosPorSOP((m) => (m[sopId] === undefined ? { ...m, [sopId]: d.pasos } : m));
    } catch {
      setPasosPorSOP((m) => (m[sopId] === undefined ? { ...m, [sopId]: [] } : m));
    }
  }, []);

  // Pasos de cada ejecución: se cargan al entrar a la pestaña (evento de
  // usuario vía tab, no setState sincrónico en efecto: se difiere con
  // timeout para no hacer render en cascada).
  useEffect(() => {
    if (tab !== "ejecuciones") return;
    const ids = [...new Set((ejecuciones ?? []).map((e) => e.sop_id))].filter(
      (id) => pasosPorSOP[id] === undefined,
    );
    if (ids.length === 0) return;
    const t = window.setTimeout(() => {
      for (const id of ids) void cargarPasos(id);
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, ejecuciones]);

  const proponer = async () => {
    if (nuevoTitulo.trim() === "") return;
    setGuardando(true);
    setError(null);
    try {
      if (tab === "formatos") {
        const f = await crearFormato({ nombre: nuevoTitulo.trim(), objetivo: nuevoDetalle.trim() === "" ? undefined : nuevoDetalle.trim() });
        setFormatos((ls) => [f, ...(ls ?? [])]);
      } else if (tab === "hooks") {
        const h = await crearHook({ titulo: nuevoTitulo.trim(), psicologia: nuevoDetalle.trim() === "" ? undefined : nuevoDetalle.trim() });
        setHooks((ls) => [h, ...(ls ?? [])]);
      } else if (tab === "referencias") {
        const r = await crearReferencia({ titulo: nuevoTitulo.trim(), link: nuevoDetalle.trim() });
        setReferencias((ls) => [r, ...(ls ?? [])]);
      } else if (tab === "sops") {
        const d = await crearSOP({ titulo: nuevoTitulo.trim() });
        setSOPs((ls) => [d.sop, ...(ls ?? [])]);
      }
      setNuevoTitulo("");
      setNuevoDetalle("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const tabs: { value: Tab; label: string }[] = useMemo(() => {
    const base: { value: Tab; label: string }[] = [
      { value: "formatos", label: "Formatos" },
      { value: "hooks", label: "Hooks" },
      { value: "referencias", label: "Refs" },
      { value: "sops", label: "SOPs" },
      { value: "ejecuciones", label: "Mis SOPs" },
    ];
    if (esAdmin) base.push({ value: "borradores", label: "Borradores" });
    return base;
  }, [esAdmin]);

  const borradores = useMemo(() => {
    const enBorrador = (estado: string) => estado === "borrador";
    return {
      formatos: (formatos ?? []).filter((f) => enBorrador(f.estado)),
      hooks: (hooks ?? []).filter((h) => enBorrador(h.estado)),
      referencias: (referencias ?? []).filter((r) => enBorrador(r.estado)),
      sops: (sops ?? []).filter((s) => enBorrador(s.estado)),
    };
  }, [formatos, hooks, referencias, sops]);

  const iniciarSOP = async (sop: SOP) => {
    // Ligar a una tarea propia es opcional: se ofrece la primera tarea
    // en curso/pendiente del usuario si existe.
    let tareaId: string | undefined;
    try {
      const mias = await getTareas({ asignado: miId });
      const apta = (mias as unknown as { id: string; estado: string }[]).find(
        (t) => t.estado === "en_curso" || t.estado === "pendiente",
      );
      tareaId = apta?.id;
    } catch {
      tareaId = undefined;
    }
    setGuardando(true);
    setError(null);
    try {
      const e = await iniciarEjecucion({ sop_id: sop.id, tarea_id: tareaId });
      setEjecuciones((ls) => [e, ...(ls ?? [])]);
      await cargarPasos(sop.id);
      setTab("ejecuciones");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar");
    } finally {
      setGuardando(false);
    }
  };

  if (me === null || cargando) return <BootSplash label="Cargando biblioteca…" />;

  const muestraProponer = tab === "formatos" || tab === "hooks" || tab === "referencias" || tab === "sops";

  return (
    <Panel title="Biblioteca">
      <div className="page">
        <h1 className="page-title">Biblioteca</h1>
        <p className="page-sub">
          {esAdmin ? "Formatos, hooks, referencias y SOPs. Publicá o rechazá propuestas." : "Formatos, hooks, referencias y SOPs. Podés proponer contenido."}
        </p>
        {error !== null && <Aviso error={error} onRetry={() => void cargar()} />}
        <div className={f1.f1filters} style={{ marginTop: 10 }}>
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              className={tab === t.value ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
              onClick={() => setTab(t.value)}
            >
              {t.label}
            </button>
          ))}
          <input
            className="input"
            style={{ minHeight: 36, fontSize: 13 }}
            placeholder="Buscar…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar"
          />
          <input
            className="input"
            style={{ minHeight: 36, fontSize: 13, maxWidth: 130 }}
            placeholder="Etiqueta…"
            value={etiqueta}
            onChange={(e) => setEtiqueta(e.target.value)}
            aria-label="Etiqueta"
          />
          {tab === "hooks" && (
            <input
              className="input"
              style={{ minHeight: 36, fontSize: 13, maxWidth: 140 }}
              placeholder="Categoría…"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              aria-label="Categoría"
            />
          )}
          {tab === "referencias" && (
            <select
              className="input select"
              style={{ minHeight: 36, fontSize: 13, maxWidth: 140 }}
              value={plataforma}
              onChange={(e) => setPlataforma(e.target.value)}
              aria-label="Plataforma"
            >
              <option value="">Plataforma…</option>
              <option value="Instagram">Instagram</option>
              <option value="TikTok">TikTok</option>
              <option value="YouTube">YouTube</option>
              <option value="otra">Otra</option>
            </select>
          )}
          {tab === "sops" && (
            <select
              className="input select"
              style={{ minHeight: 36, fontSize: 13, maxWidth: 150 }}
              value={oficio}
              onChange={(e) => setOficio(e.target.value)}
              aria-label="Oficio"
            >
              <option value="">Oficio…</option>
              <option value="todos">Todos</option>
              <option value="grabacion">Grabación</option>
              <option value="edicion">Edición</option>
              <option value="diseno">Diseño</option>
              <option value="estrategia">Estrategia/guion</option>
              <option value="publicacion">Publicación</option>
              <option value="ventas">Ventas</option>
            </select>
          )}
        </div>

        {muestraProponer && (
          <div className="card" style={{ marginTop: 10 }}>
            <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700 }}>
              {esAdmin ? "Crear (se publica directo)" : "Proponer (queda en borrador hasta que se publique)"}
            </p>
            <div style={{ display: "grid", gap: 6 }}>
              <input
                className="input"
                style={{ minHeight: 36, fontSize: 13 }}
                placeholder={tab === "hooks" ? "Título del hook (ej. ¿Sabías que…?)" : tab === "referencias" ? "Título de la referencia" : tab === "sops" ? "Título del SOP" : "Nombre del formato"}
                value={nuevoTitulo}
                onChange={(e) => setNuevoTitulo(e.target.value)}
              />
              <input
                className="input"
                style={{ minHeight: 36, fontSize: 13 }}
                placeholder={tab === "referencias" ? "Link https://…" : tab === "formatos" ? "Objetivo (opcional)" : tab === "hooks" ? "Por qué funciona (opcional)" : "Detalle (opcional)"}
                value={nuevoDetalle}
                onChange={(e) => setNuevoDetalle(e.target.value)}
              />
              <button type="button" className="btn btn-primary btn-sm" disabled={guardando || nuevoTitulo.trim() === ""} onClick={() => void proponer()}>
                {esAdmin ? "Crear" : "Proponer"}
              </button>
            </div>
          </div>
        )}

        {tab === "formatos" && (
          <ul className={f1.f1list} style={{ marginTop: 10 }}>
            {(formatos ?? []).filter((f) => f.estado === "publicado" || (esAdmin && f.estado !== "archivado") || (!esAdmin && f.propuesto_por === miId)).map((f) => (
              <FormatoCard key={f.id} formato={f} esAdmin={esAdmin} miId={miId} onChange={(n) => setFormatos((ls) => (ls ?? []).map((x) => (x.id === n.id ? n : x)))} />
            ))}
            {(formatos ?? []).length === 0 && (
              <li className="card"><p style={{ margin: 0, fontSize: 13, color: "var(--c-text-2)" }}>Sin formatos todavía. Proponé el primero.</p></li>
            )}
          </ul>
        )}

        {tab === "hooks" && (
          <ul className={f1.f1list} style={{ marginTop: 10 }}>
            {(hooks ?? []).filter((h) => h.estado === "publicado" || (esAdmin && h.estado !== "archivado") || (!esAdmin && h.propuesto_por === miId)).map((h) => (
              <HookCard key={h.id} hook={h} esAdmin={esAdmin} miId={miId} onChange={(n) => setHooks((ls) => (ls ?? []).map((x) => (x.id === n.id ? n : x)))} />
            ))}
            {(hooks ?? []).length === 0 && (
              <li className="card"><p style={{ margin: 0, fontSize: 13, color: "var(--c-text-2)" }}>Sin hooks todavía. Proponé el primero.</p></li>
            )}
          </ul>
        )}

        {tab === "referencias" && (
          <ul className={f1.f1list} style={{ marginTop: 10 }}>
            {(referencias ?? []).filter((r) => r.estado === "publicado" || (esAdmin && r.estado !== "archivado") || (!esAdmin && r.propuesto_por === miId)).map((r) => (
              <ReferenciaCard key={r.id} referencia={r} esAdmin={esAdmin} miId={miId} onChange={(n) => setReferencias((ls) => (ls ?? []).map((x) => (x.id === n.id ? n : x)))} />
            ))}
            {(referencias ?? []).length === 0 && (
              <li className="card"><p style={{ margin: 0, fontSize: 13, color: "var(--c-text-2)" }}>Sin referencias todavía. Pegá el primer link analizado.</p></li>
            )}
          </ul>
        )}

        {tab === "sops" && (
          <ul className={f1.f1list} style={{ marginTop: 10 }}>
            {(sops ?? []).filter((s) => s.estado === "publicado" || (esAdmin && s.estado !== "archivado") || (!esAdmin && s.propuesto_por === miId)).map((s) => (
              <SOPCard key={s.id} sop={s} esAdmin={esAdmin} miId={miId} onChange={(n) => setSOPs((ls) => (ls ?? []).map((x) => (x.id === n.id ? n : x)))} onEjecutar={(x) => void iniciarSOP(x)} />
            ))}
            {(sops ?? []).length === 0 && (
              <li className="card"><p style={{ margin: 0, fontSize: 13, color: "var(--c-text-2)" }}>Sin SOPs todavía. Creá el primero.</p></li>
            )}
          </ul>
        )}

        {tab === "ejecuciones" && (
          <ul className={f1.f1list} style={{ marginTop: 10 }}>
            {(ejecuciones ?? []).map((e) => (
              <EjecucionCard
                key={e.id}
                ejecucion={e}
                pasos={pasosPorSOP[e.sop_id] ?? []}
                onChange={(n) => setEjecuciones((ls) => (ls ?? []).map((x) => (x.id === n.id ? n : x)))}
              />
            ))}
            {(ejecuciones ?? []).length === 0 && (
              <li className="card"><p style={{ margin: 0, fontSize: 13, color: "var(--c-text-2)" }}>Todavía no iniciaste ningún SOP. Abrí la pestaña SOPs e iniciá uno.</p></li>
            )}
          </ul>
        )}

        {tab === "borradores" && esAdmin && (
          <div style={{ marginTop: 10 }}>
            {borradores.formatos.length + borradores.hooks.length + borradores.referencias.length + borradores.sops.length === 0 ? (
              <div className="card">
                <p style={{ margin: 0, fontSize: 13, color: "var(--c-text-2)" }}>
                  No hay propuestas pendientes. Cuando alguien del equipo proponga contenido aparecerá aquí.
                </p>
              </div>
            ) : (
              <>
                {borradores.formatos.map((f) => (
                  <ul key={f.id} className={f1.f1list}>
                    <FormatoCard formato={f} esAdmin={esAdmin} miId={miId} onChange={(n) => setFormatos((ls) => (ls ?? []).map((x) => (x.id === n.id ? n : x)))} />
                  </ul>
                ))}
                {borradores.hooks.map((h) => (
                  <ul key={h.id} className={f1.f1list}>
                    <HookCard hook={h} esAdmin={esAdmin} miId={miId} onChange={(n) => setHooks((ls) => (ls ?? []).map((x) => (x.id === n.id ? n : x)))} />
                  </ul>
                ))}
                {borradores.referencias.map((r) => (
                  <ul key={r.id} className={f1.f1list}>
                    <ReferenciaCard referencia={r} esAdmin={esAdmin} miId={miId} onChange={(n) => setReferencias((ls) => (ls ?? []).map((x) => (x.id === n.id ? n : x)))} />
                  </ul>
                ))}
                {borradores.sops.map((s) => (
                  <ul key={s.id} className={f1.f1list}>
                    <SOPCard sop={s} esAdmin={esAdmin} miId={miId} onChange={(n) => setSOPs((ls) => (ls ?? []).map((x) => (x.id === n.id ? n : x)))} onEjecutar={(x) => void iniciarSOP(x)} />
                  </ul>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
