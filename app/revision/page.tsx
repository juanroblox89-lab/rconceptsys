"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/Panel";
import { BootSplash } from "@/components/BootSplash";
import { Modal } from "@/components/Modal";
import { useSession } from "@/components/SessionProvider";
import {
  aprobarTarea,
  devolverTarea,
  getEventosTarea,
  getTareas,
  reasignarTarea,
  getUsuariosF1,
} from "@/lib/f1ui";
import {
  etapaLabel,
  fmtFechaCorta,
  type Tarea,
  type TareaEvento,
} from "@/lib/f1tipos";
import { oficioDeEtapa } from "@/lib/f1tipos";
import type { Usuario } from "@/lib/types";
import f1 from "@/components/F1.module.css";

function Historial({ tareaId }: { tareaId: string }) {
  const [open, setOpen] = useState(false);
  const [eventos, setEventos] = useState<TareaEvento[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setEventos(await getEventosTarea(tareaId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        aria-expanded={open}
        disabled={loading}
        onClick={() => {
          if (!open && eventos === null && !loading) void load();
          setOpen((v) => !v);
        }}
      >
        {loading ? "Cargando…" : open ? "Ocultar historial" : "Ver historial"}
      </button>
      {open && error !== null && (
        <div className="error-box" role="alert" style={{ marginTop: 8 }}>
          <p>{error}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      )}
      {open && eventos !== null && (
        <ul className={f1.f1hist}>
          {eventos.map((e) => (
            <li key={e.id}>
              <strong>{e.accion}</strong> · {e.actor_nombre}
              {(e.antes || e.despues) && (
                <span style={{ color: "var(--c-text-2)" }}> · {e.antes ?? "—"} → {e.despues ?? "—"}</span>
              )}
              {e.comentario && <span style={{ color: "var(--c-text-2)" }}> · “{e.comentario}”</span>}
            </li>
          ))}
          {eventos.length === 0 && <li>Sin eventos.</li>}
        </ul>
      )}
    </div>
  );
}

function ColaItem({
  tarea,
  usuarios,
  onChange,
}: {
  tarea: Tarea;
  usuarios: Usuario[];
  onChange: (t: Tarea) => void;
}) {
  const [devolver, setDevolver] = useState(false);
  const [comentario, setComentario] = useState("");
  const [reasignar, setReasignar] = useState(false);
  const [nuevo, setNuevo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cand = usuarios.filter((u) => u.oficios.includes(oficioDeEtapa(tarea.etapa)));

  const aprobar = async () => {
    setSaving(true);
    setError(null);
    try {
      onChange(await aprobarTarea(tarea.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const devolverAhora = async () => {
    if (comentario.trim() === "") return;
    setSaving(true);
    setError(null);
    try {
      onChange(await devolverTarea(tarea.id, comentario.trim()));
      setDevolver(false);
      setComentario("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const reasignarAhora = async () => {
    setSaving(true);
    setError(null);
    try {
      onChange(await reasignarTarea(tarea.id, nuevo === "" ? null : nuevo, tarea.updated_at));
      setReasignar(false);
      setNuevo("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className={`${f1.f1card} ${tarea.vencida ? f1.f1esVencida : ""}`}>
      <p className={f1.f1cardTitle}>{tarea.pieza_titulo}</p>
      <p className={f1.f1cardMeta}>
        {tarea.cliente_nombre} · {etapaLabel(tarea.etapa)} · {tarea.asignado_nombre ?? "Sin asignar"}
      </p>
      <div className={f1.f1row}>
        {tarea.fecha_limite !== null && (
          <span className={tarea.vencida ? f1.f1vencida : undefined} style={{ fontSize: 12 }}>
            {tarea.vencida ? `Vencida · ${fmtFechaCorta(tarea.fecha_limite)}` : fmtFechaCorta(tarea.fecha_limite)}
          </span>
        )}
      </div>
      {tarea.dato_entrega !== null && tarea.dato_entrega !== undefined && (
        <p className="hint" style={{ margin: "6px 0 0" }}>
          Dato: {Object.values(tarea.dato_entrega).join(" · ")}
        </p>
      )}
      {error !== null && (
        <div className="error-box" role="alert" style={{ margin: "8px 0 0" }}>
          <p>{error}</p>
        </div>
      )}
      <div className={f1.f1row}>
        <button type="button" className="btn btn-sm" disabled={saving} onClick={() => void aprobar()}>
          {saving ? "Guardando…" : "Aprobar"}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => setDevolver((v) => !v)}>
          Devolver
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => setReasignar((v) => !v)}>
          Reasignar
        </button>
      </div>
      {reasignar && (
        <div style={{ marginTop: 8 }}>
          <label className="label" htmlFor={`re-${tarea.id}`} style={{ fontSize: 12 }}>
            Nueva persona (oficio {oficioDeEtapa(tarea.etapa)})
          </label>
          <select id={`re-${tarea.id}`} className="select" value={nuevo} disabled={saving} onChange={(e) => setNuevo(e.target.value)}>
            <option value="">Sin asignar</option>
            {cand.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre}</option>
            ))}
          </select>
          <div className={f1.f1row}>
            <button type="button" className="btn btn-sm" disabled={saving} onClick={() => void reasignarAhora()}>
              {saving ? "Guardando…" : "Confirmar"}
            </button>
          </div>
        </div>
      )}
      <Historial tareaId={tarea.id} />
      {devolver && (
        <Modal title={`Devolver: ${tarea.pieza_titulo}`} onClose={() => setDevolver(false)}>
          <div className="field">
            <label className="label" htmlFor={`com-${tarea.id}`}>Comentario (obligatorio)</label>
            <textarea
              id={`com-${tarea.id}`}
              className="textarea"
              value={comentario}
              disabled={saving}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Qué hay que corregir"
            />
          </div>
          {error !== null && (
            <div className="error-box" role="alert"><p>{error}</p></div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-sm" disabled={saving || comentario.trim() === ""} onClick={() => void devolverAhora()}>
              {saving ? "Guardando…" : "Devolver"}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => setDevolver(false)}>
              Cancelar
            </button>
          </div>
        </Modal>
      )}
    </li>
  );
}

export default function RevisionPage() {
  const { me } = useSession();
  const admin = me?.usuario.acceso === "dueno" || me?.usuario.acceso === "admin";
  const [tareas, setTareas] = useState<Tarea[] | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ts, us] = await Promise.all([getTareas({ vista: "por_revisar" }), getUsuariosF1()]);
      setTareas(ts);
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
  }, []);

  if (!admin && me !== null) {
    return (
      <Panel title="Revisión">
        <div className="page">
          <h1 className="page-title">Revisión</h1>
          <div className="error-box" role="alert" style={{ marginBottom: 0 }}>
            <p>Solo admin o dueño pueden revisar entregas.</p>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Revisión">
      <div className="page">
        <h1 className="page-title">Revisión</h1>
        <p className="page-sub">
          {tareas === null ? "Entregas esperando tu visto bueno." : `${tareas.length} por revisar.`}
        </p>
        {loading && <BootSplash label="Cargando revisión" />}
        {error !== null && !loading && (
          <div className="error-box" role="alert">
            <p>{error}</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
              Reintentar
            </button>
          </div>
        )}
        {!loading && error === null && (tareas ?? []).length === 0 && (
          <div className="card">
            <p style={{ margin: 0, fontSize: 13, color: "var(--c-text-2)" }}>
              Cola vacía. Nada esperando revisión.
            </p>
          </div>
        )}
        {!loading && error === null && (tareas ?? []).length > 0 && (
          <ul className={f1.f1list}>
            {tareas?.map((t) => (
              <ColaItem
                key={t.id}
                tarea={t}
                usuarios={usuarios}
                onChange={(nt) => setTareas((prev) => (prev === null ? prev : prev.map((x) => (x.id === nt.id ? nt : x))))}
              />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
