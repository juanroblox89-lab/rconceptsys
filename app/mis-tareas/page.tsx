"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/Panel";
import { BootSplash } from "@/components/BootSplash";
import { useSession } from "@/components/SessionProvider";
import { empezarTarea, entregarTarea, getTareas } from "@/lib/f1ui";
import {
  CAMPO_ENTREGA_LABEL,
  camposDeEtapa,
  etapaLabel,
  fmtFechaCorta,
  tareaEstadoLabel,
  type CampoEntrega,
  type Tarea,
} from "@/lib/f1tipos";
import f1 from "@/components/F1.module.css";

type Seccion = "hoy" | "semana" | "vencidas" | "revision";

const SECCIONES: { value: Seccion; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Semana" },
  { value: "vencidas", label: "Vencidas" },
  { value: "revision", label: "Esperando revisión" },
];

/** Tarjeta pensada para 2 toques en el celular: Empezar / Entregar directo. */
function TareaCard({ tarea, onChange }: { tarea: Tarea; onChange: (t: Tarea) => void }) {
  const [expandir, setExpandir] = useState(false);
  const [dato, setDato] = useState<Record<CampoEntrega, string>>({
    material_url: "",
    minutos: "",
    entregable_url: "",
    publicado_url: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const campos = camposDeEtapa(tarea.etapa);
  const puedeEmpezar = tarea.estado === "pendiente" || tarea.estado === "devuelta";
  const puedeEntregar = tarea.estado === "en_curso";
  const datoOk = campos.every((c) =>
    c === "minutos" ? dato[c].trim() !== "" : dato[c].trim() !== "",
  );

  const empezar = async () => {
    setSaving(true);
    setError(null);
    try {
      onChange(await empezarTarea(tarea.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const entregar = async () => {
    if (!datoOk) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string | number> = {};
      for (const c of campos) {
        const v = dato[c].trim();
        if (c === "minutos") {
          const n = Number(v);
          if (!Number.isInteger(n) || n < 0) {
            setError("Minutos debe ser un número entero ≥ 0");
            setSaving(false);
            return;
          }
          body[c] = n;
        } else {
          body[c] = v;
        }
      }
      onChange(await entregarTarea(tarea.id, body));
      setExpandir(false);
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
        {tarea.cliente_nombre} · {etapaLabel(tarea.etapa)}
      </p>
      <div className={f1.f1row}>
        <span className="chip">{tareaEstadoLabel(tarea.estado)}</span>
        {tarea.fecha_limite !== null && (
          <span className={tarea.vencida ? f1.f1vencida : undefined} style={{ fontSize: 12 }}>
            {tarea.vencida ? `Vencida · ${fmtFechaCorta(tarea.fecha_limite)}` : fmtFechaCorta(tarea.fecha_limite)}
          </span>
        )}
      </div>
      {error !== null && (
        <div className="error-box" role="alert" style={{ margin: "8px 0 0" }}>
          <p>{error}</p>
        </div>
      )}
      <div className={f1.f1row}>
        {puedeEmpezar && (
          <button type="button" className="btn btn-sm btn-block" disabled={saving} onClick={() => void empezar()}>
            {saving ? "Guardando…" : tarea.estado === "devuelta" ? "Retomar" : "Empezar"}
          </button>
        )}
        {puedeEntregar && !expandir && (
          <button type="button" className="btn btn-sm btn-block" disabled={saving} onClick={() => setExpandir(true)}>
            Entregar
          </button>
        )}
        {puedeEntregar && expandir && (
          <div style={{ width: "100%" }}>
            {campos.map((c) => (
              <div className="field" key={c}>
                <label className="label" htmlFor={`ent-${tarea.id}-${c}`} style={{ fontSize: 12 }}>
                  {CAMPO_ENTREGA_LABEL[c]}
                </label>
                <input
                  id={`ent-${tarea.id}-${c}`}
                  className="input"
                  inputMode={c === "minutos" ? "numeric" : "url"}
                  value={dato[c]}
                  disabled={saving}
                  onChange={(e) => setDato((d) => ({ ...d, [c]: e.target.value }))}
                  placeholder={c === "minutos" ? "45" : "https://…"}
                />
              </div>
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-sm" disabled={saving || !datoOk} onClick={() => void entregar()}>
                {saving ? "Guardando…" : "Confirmar entrega"}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => setExpandir(false)}>
                Volver
              </button>
            </div>
            {!datoOk && <p className="hint">Completá el dato de la etapa para entregar.</p>}
          </div>
        )}
        {tarea.estado === "entregada" && (
          <p className="hint" style={{ margin: "8px 0 0" }}>Entregada: esperando revisión del admin.</p>
        )}
        {tarea.estado === "bloqueada" && (
          <p className="hint" style={{ margin: "8px 0 0" }}>Bloqueada: se libera cuando se apruebe la etapa anterior.</p>
        )}
      </div>
    </li>
  );
}

export default function MisTareasPage() {
  const { me } = useSession();
  const [seccion, setSeccion] = useState<Seccion>("hoy");
  const [tareas, setTareas] = useState<Tarea[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (s: Seccion) => {
    setLoading(true);
    setError(null);
    try {
      if (s === "revision") {
        setTareas(await getTareas({ asignado: me?.usuario.id, vista: "por_revisar" }));
      } else if (s === "hoy") {
        setTareas(await getTareas({ asignado: me?.usuario.id, vista: "hoy" }));
      } else if (s === "semana") {
        setTareas(await getTareas({ asignado: me?.usuario.id, vista: "semana" }));
      } else {
        setTareas(await getTareas({ asignado: me?.usuario.id, vista: "vencidas" }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => void load(seccion), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seccion, me?.usuario.id]);

  const onChange = (t: Tarea) => {
    setTareas((prev) => (prev === null ? prev : prev.map((x) => (x.id === t.id ? t : x))));
  };

  return (
    <Panel title="Mis tareas">
      <div className="page">
        <h1 className="page-title">Mis tareas</h1>
        <p className="page-sub">
          {tareas === null ? "Lo que tenés que hacer." : `${tareas.length} en esta vista.`}{" "}
          <Link href="/revision" style={{ fontSize: 12 }}>Ver revisión</Link>
        </p>
        <div className={f1.f1filters} role="group" aria-label="Sección">
          {SECCIONES.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`chip ${seccion === s.value ? "chip-dark" : ""}`}
              style={{ cursor: "pointer" }}
              aria-pressed={seccion === s.value}
              onClick={() => setSeccion(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
        {loading && <BootSplash label="Cargando tareas" />}
        {error !== null && !loading && (
          <div className="error-box" role="alert">
            <p>{error}</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load(seccion)}>
              Reintentar
            </button>
          </div>
        )}
        {!loading && error === null && (tareas ?? []).length === 0 && (
          <div className="card">
            <p style={{ margin: 0, fontSize: 13, color: "var(--c-text-2)" }}>
              Nada aquí. Cuando te asignen algo, aparece en esta lista.
            </p>
          </div>
        )}
        {!loading && error === null && (tareas ?? []).length > 0 && (
          <ul className={f1.f1list}>
            {tareas?.map((t) => (
              <TareaCard key={t.id} tarea={t} onChange={onChange} />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
