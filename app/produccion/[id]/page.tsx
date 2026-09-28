"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/Panel";
import { BootSplash } from "@/components/BootSplash";
import { AsistenteEntrada } from "@/components/Asistente";
import { useSession } from "@/components/SessionProvider";
import { cancelarPieza, getPieza, mensajeConflicto, patchPieza } from "@/lib/f1ui";
import { getFormatos, getHooks } from "@/lib/f3api";
import type { Formato, Hook } from "@/lib/f3tipos";
import {
  etapaLabel,
  fmtFecha,
  piezaEstadoLabel,
  tareaEstadoLabel,
  type Pieza,
  type Tarea,
} from "@/lib/f1tipos";
import f1 from "@/components/F1.module.css";

export default function PiezaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { me } = useSession();
  const admin = me?.usuario.acceso === "dueno" || me?.usuario.acceso === "admin";
  const [id, setId] = useState<string | null>(null);
  const [pieza, setPieza] = useState<Pieza | null>(null);
  const [tareas, setTareas] = useState<Tarea[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelar, setCancelar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  // F3: formato/hook vinculado (solo referencia a biblioteca publicada).
  const [formatosPub, setFormatosPub] = useState<Formato[]>([]);
  const [hooksPub, setHooksPub] = useState<Hook[]>([]);
  const [vinculando, setVinculando] = useState(false);

  useEffect(() => {
    void params.then((p) => setId(p.id));
  }, [params]);

  const load = async (pid: string) => {
    setLoading(true);
    setError(null);
    try {
      const d = await getPieza(pid);
      setPieza(d.pieza);
      setTareas(d.tareas);
      try {
        const [fs, hs] = await Promise.all([
          getFormatos({ estado: "publicado" }).catch(() => []),
          getHooks({ estado: "publicado" }).catch(() => []),
        ]);
        setFormatosPub(fs);
        setHooksPub(hs);
      } catch {
        setFormatosPub([]);
        setHooksPub([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id === null) return;
    const t = window.setTimeout(() => void load(id), 0);
    return () => window.clearTimeout(t);
  }, [id]);

  const avanzar = async (estado: Pieza["estado"]) => {
    if (pieza === null) return;
    setSaving(true);
    setError(null);
    try {
      const p = await patchPieza(pieza.id, { estado, updated_at: pieza.updated_at });
      setPieza(p);
    } catch (e) {
      setError(mensajeConflicto(e) ?? (e instanceof Error ? e.message : "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  const cancelarAhora = async () => {
    if (pieza === null || motivo.trim() === "") return;
    setSaving(true);
    setError(null);
    try {
      const p = await cancelarPieza(pieza.id, motivo.trim());
      setPieza(p);
      setCancelar(false);
      setMotivo("");
      if (id !== null) {
        const d = await getPieza(id);
        setTareas(d.tareas);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cancelar");
    } finally {
      setSaving(false);
    }
  };

  /** Vincular formato/hook recomendado (F3, solo referencia, sin romper F1). */
  const vincular = async (formatoId: string, hookId: string) => {
    if (pieza === null || vinculando) return;
    setVinculando(true);
    setError(null);
    try {
      const p = await patchPieza(pieza.id, {
        formato_recomendado_id: formatoId === "" ? null : formatoId,
        hook_recomendado_id: hookId === "" ? null : hookId,
        updated_at: pieza.updated_at,
      });
      setPieza(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo vincular");
    } finally {
      setVinculando(false);
    }
  };

  return (
    <Panel title="Pieza">
      <div className="page">
        {loading && <BootSplash label="Cargando pieza" />}
        {error !== null && !loading && (
          <div className="error-box" role="alert">
            <p>{error}</p>
            {id !== null && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load(id)}>
                Reintentar
              </button>
            )}
          </div>
        )}
        {!loading && pieza !== null && (
          <>
            <p className={f1.f1kicker}>{pieza.cliente_nombre}</p>
            <h1 className="page-title">{pieza.titulo}</h1>
            <p className="page-sub">
              {pieza.formato ?? "Sin formato"} · {piezaEstadoLabel(pieza.estado)}
              {pieza.vencida ? " · " : ""}
              {pieza.vencida && <span className={f1.f1vencida}>Vencida</span>}
              {" · "}Objetivo {fmtFecha(pieza.fecha_objetivo)}
            </p>
            {pieza.guion !== null && pieza.guion !== "" && (
              <div className="card" style={{ marginBottom: 12 }}>
                <span className="label">Guion</span>
                <p style={{ margin: 0, fontSize: 13, whiteSpace: "pre-wrap" }}>{pieza.guion}</p>
              </div>
            )}
            {pieza.guion_borrador !== null && pieza.guion_borrador !== "" && (
              <div className="card" style={{ marginBottom: 12 }}>
                <span className="label">Borrador del asistente (no reemplaza al guion aprobado)</span>
                <p style={{ margin: "0 0 8px", fontSize: 13, whiteSpace: "pre-wrap" }}>{pieza.guion_borrador}</p>
                {admin && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={saving}
                    onClick={() => {
                      if (pieza === null) return;
                      if (!window.confirm("¿Usar el borrador como guion aprobado?")) return;
                      setSaving(true);
                      setError(null);
                      void patchPieza(pieza.id, {
                        guion: pieza.guion_borrador,
                        guion_borrador: "",
                        updated_at: pieza.updated_at,
                      })
                        .then(setPieza)
                        .catch((e: unknown) => setError(e instanceof Error ? e.message : "No se pudo guardar"))
                        .finally(() => setSaving(false));
                    }}
                  >
                    Usar como guion
                  </button>
                )}
              </div>
            )}
            <div className={f1.f1filters}>
              <AsistenteEntrada
                titulo="Escribir guion con IA"
                piezaId={pieza.id}
                clienteId={pieza.cliente_id}
                onBorrador={() => {
                  if (id !== null) void load(id);
                }}
              />
            </div>
            {admin && (
              <div className="card" style={{ marginBottom: 12 }}>
                <span className="label">Biblioteca (formato y hook, solo referencia)</span>
                <div className={f1.f1two}>
                  <div className="field">
                    <label className="label" htmlFor="pz-formato">Formato</label>
                    <select
                      id="pz-formato"
                      className="select"
                      value={pieza.formato_recomendado_id ?? ""}
                      disabled={vinculando}
                      onChange={(e) => void vincular(e.target.value, pieza.hook_recomendado_id ?? "")}
                    >
                      <option value="">Sin formato</option>
                      {formatosPub.map((f) => (
                        <option key={f.id} value={f.id}>{f.codigo ? `${f.codigo} · ` : ""}{f.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="pz-hook">Hook</label>
                    <select
                      id="pz-hook"
                      className="select"
                      value={pieza.hook_recomendado_id ?? ""}
                      disabled={vinculando}
                      onChange={(e) => void vincular(pieza.formato_recomendado_id ?? "", e.target.value)}
                    >
                      <option value="">Sin hook</option>
                      {hooksPub.map((h) => (
                        <option key={h.id} value={h.id}>{h.titulo}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
            {!admin && (pieza.formato_recomendado_id !== null || pieza.hook_recomendado_id !== null) && (
              <p className="page-sub" style={{ marginTop: 0 }}>
                {[formatosPub.find((f) => f.id === pieza.formato_recomendado_id)?.nombre,
                  hooksPub.find((h) => h.id === pieza.hook_recomendado_id)?.titulo]
                  .filter((x) => x !== undefined && x !== "")
                  .join(" · ")}
              </p>
            )}
            {admin && (
              <div className={f1.f1filters}>
                {pieza.estado === "borrador" && (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => void avanzar("en_produccion")}>
                    Pasar a producción
                  </button>
                )}
                {pieza.estado === "en_produccion" && (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => void avanzar("en_revision")}>
                    Pedir revisión
                  </button>
                )}
                {pieza.estado === "en_revision" && (
                  <>
                    <button type="button" className="btn btn-sm" disabled={saving} onClick={() => void avanzar("aprobada")}>
                      Aprobar pieza
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => void avanzar("en_produccion")}>
                      Pedir cambios
                    </button>
                  </>
                )}
                {pieza.estado === "aprobada" && (
                  <button type="button" className="btn btn-sm" disabled={saving} onClick={() => void avanzar("publicada")}>
                    Marcar publicada
                  </button>
                )}
                {pieza.estado !== "cancelada" && pieza.estado !== "publicada" && (
                  <button type="button" className="btn btn-danger btn-sm" disabled={saving} onClick={() => setCancelar((v) => !v)}>
                    Cancelar pieza
                  </button>
                )}
              </div>
            )}
            {cancelar && (
              <div className="card" style={{ marginBottom: 12 }}>
                <div className="field">
                  <label className="label" htmlFor="motivo-cancel">Motivo (obligatorio)</label>
                  <textarea id="motivo-cancel" className="textarea" value={motivo} disabled={saving} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué se cancela" />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn btn-danger btn-sm" disabled={saving || motivo.trim() === ""} onClick={() => void cancelarAhora()}>
                    {saving ? "Guardando…" : "Confirmar cancelación"}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => setCancelar(false)}>
                    Volver
                  </button>
                </div>
              </div>
            )}
            {(pieza.motivo_cancelacion ?? pieza.motivo) !== null && (pieza.motivo_cancelacion ?? pieza.motivo) !== "" && (
              <div className="error-box" role="note">
                <p>Cancelada: {pieza.motivo_cancelacion ?? pieza.motivo}</p>
              </div>
            )}
            <h2 className={f1.f1sectionTitle}>Etapas</h2>
            <ul className={f1.f1list}>
              {(tareas ?? []).map((t) => (
                <li key={t.id} className={`${f1.f1card} ${t.vencida ? f1.f1esVencida : ""}`}>
                  <p className={f1.f1cardTitle}>{etapaLabel(t.etapa)}</p>
                  <p className={f1.f1cardMeta}>
                    {t.asignado_nombre ?? "Sin asignar"}
                    {t.fecha_limite ? ` · ${fmtFecha(t.fecha_limite)}` : ""}
                  </p>
                  <div className={f1.f1row}>
                    <span className="chip">{tareaEstadoLabel(t.estado)}</span>
                    {t.vencida && <span className={f1.f1vencida} style={{ fontSize: 12 }}>Vencida</span>}
                    {t.decision_pendiente === true && (
                      <span className="chip chip-warn">Decisión pendiente</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Panel>
  );
}
