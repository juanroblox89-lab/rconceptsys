"use client";

import { useEffect, useState } from "react";
import { AccesoChip } from "@/components/AccessScreens";
import { BootSplash } from "@/components/BootSplash";
import { Modal } from "@/components/Modal";
import {
  aprobarUsuario,
  desactivarUsuario,
  getActividad,
  getUsuarios,
  patchUsuario,
  ApiError,
} from "@/lib/api";
import { OFICIOS, accesoLabel, oficioLabel } from "@/lib/oficios";
import type { ActividadEvento, Usuario } from "@/lib/types";

type Filter = "todos" | "pendiente" | "equipo" | "admin" | "dueno" | "desactivado";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "pendiente", label: "Pendientes" },
  { value: "equipo", label: "Equipo" },
  { value: "admin", label: "Admin" },
  { value: "dueno", label: "Dueños" },
  { value: "desactivado", label: "Desactivados" },
];

const ACCESOS_EDIT = ["equipo", "admin", "dueno"] as const;

function fmtFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtValor(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((o) => oficioLabel(String(o))).join(" + ") || "—";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Historial de actividad de una persona (admin/dueño). */
function Historial({ usuarioId }: { usuarioId: string }) {
  const [open, setOpen] = useState(false);
  const [eventos, setEventos] = useState<ActividadEvento[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setEventos(await getActividad(usuarioId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    if (!open && eventos === null && !loading) void load();
    setOpen((v) => !v);
  };

  return (
    <div>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={toggle}
        aria-expanded={open}
        disabled={loading}
      >
        {loading ? "Cargando…" : open ? "Ocultar historial" : "Ver historial"}
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          {error !== null && (
            <div className="error-box" role="alert">
              <p>{error}</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
                Reintentar
              </button>
            </div>
          )}
          {eventos !== null && eventos.length === 0 && (
            <p className="hint" style={{ margin: 0 }}>
              Sin eventos registrados.
            </p>
          )}
          {eventos !== null && eventos.length > 0 && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {eventos.map((e) => (
                <li
                  key={e.id}
                  style={{
                    border: "1px solid var(--c-line)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "baseline" }}>
                    <strong>{e.accion}</strong>
                    <span style={{ color: "var(--c-text-3)" }}>{fmtFecha(e.cuando)}</span>
                  </div>
                  <div style={{ color: "var(--c-text-2)" }}>
                    {e.actor_nombre}
                    {(e.antes !== null && e.antes !== undefined) ||
                    (e.despues !== null && e.despues !== undefined) ? (
                      <>
                        {" · "}
                        {fmtValor(e.antes)} → {fmtValor(e.despues)}
                      </>
                    ) : null}
                    {e.motivo ? ` · “${e.motivo}”` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Formulario de cambio de acceso + oficios (motivo obligatorio). */
function EditForm({
  usuario,
  yo,
  soyDueno,
  disabled,
  onDone,
}: {
  usuario: Usuario;
  yo: string;
  /** true si quien edita es dueño: solo el dueño puede dar admin/dueño. */
  soyDueno: boolean;
  disabled: boolean;
  onDone: (u: Usuario) => void;
}) {
  const [acceso, setAcceso] = useState<Usuario["acceso"]>(usuario.acceso);
  const [oficios, setOficios] = useState<string[]>(usuario.oficios);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esYo = usuario.id === yo;

  // Opciones de acceso visibles: un admin no puede nombrar admin ni dueño
  // (ANALISIS §5.5; el backend además lo frena con 403).
  const opcionesAcceso = ACCESOS_EDIT.filter(
    (a) => a !== usuario.acceso && (soyDueno || (a !== "admin" && a !== "dueno")),
  );

  const toggleOficio = (o: string) => {
    setOficios((prev) => (prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o]));
  };

  const changed =
    acceso !== usuario.acceso ||
    oficios.length !== usuario.oficios.length ||
    oficios.some((o) => !usuario.oficios.includes(o)) ||
    usuario.oficios.some((o) => !oficios.includes(o));

  const motivoOk = motivo.trim().length > 0;
  const canSave = changed && motivoOk && !saving && !disabled;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const body = { acceso, oficios, motivo: motivo.trim() };
      const updated =
        usuario.acceso === "pendiente"
          ? await aprobarUsuario(usuario.id, body)
          : await patchUsuario(usuario.id, body);
      onDone(updated);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 403
          ? e.message
          : e instanceof Error
            ? e.message
            : "No se pudo guardar",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div className="field">
        <label className="label" htmlFor={`acceso-${usuario.id}`}>
          Acceso
        </label>
        <select
          id={`acceso-${usuario.id}`}
          className="select"
          value={acceso}
          disabled={saving || esYo}
          onChange={(e) => setAcceso(e.target.value as Usuario["acceso"])}
        >
          <option value={usuario.acceso}>{accesoLabel(usuario.acceso)} (actual)</option>
          {opcionesAcceso.map((a) => (
            <option key={a} value={a}>
              {accesoLabel(a)}
            </option>
          ))}
        </select>
        {esYo && <p className="hint">No podés cambiar tu propio acceso.</p>}
      </div>
      <fieldset style={{ border: "1px solid var(--c-line)", borderRadius: 8, padding: "8px 10px", margin: "0 0 12px" }}>
        <legend style={{ fontSize: 13, fontWeight: 600, padding: "0 4px" }}>Oficios</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {OFICIOS.map((o) => (
            <label
              key={o}
              className={`chip ${oficios.includes(o) ? "chip-dark" : ""}`}
              style={{ cursor: saving ? "not-allowed" : "pointer" }}
            >
              <input
                type="checkbox"
                checked={oficios.includes(o)}
                disabled={saving}
                onChange={() => toggleOficio(o)}
                style={{ accentColor: "#0a0a0a", marginRight: 4 }}
              />
              {oficioLabel(o)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label className="label" htmlFor={`motivo-${usuario.id}`}>
          Motivo (obligatorio)
        </label>
        <textarea
          id={`motivo-${usuario.id}`}
          className="textarea"
          value={motivo}
          disabled={saving}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Por qué se hace este cambio"
        />
      </div>
      {error !== null && (
        <div className="error-box" role="alert">
          <p>{error}</p>
        </div>
      )}
      <button type="button" className="btn btn-sm" onClick={() => void save()} disabled={!canSave}>
        {saving ? "Guardando…" : "Guardar cambios"}
      </button>
      {!motivoOk && changed && <p className="hint">Escribí el motivo para guardar.</p>}
    </div>
  );
}

function UserCard({
  usuario,
  yo,
  soyDueno,
  canManage,
  onChange,
}: {
  usuario: Usuario;
  yo: string;
  /** true si quien gestiona es dueño (puede tocar admin/dueño). */
  soyDueno: boolean;
  canManage: boolean;
  onChange: (u: Usuario) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [motivoBaja, setMotivoBaja] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const esYo = usuario.id === yo;

  const aprobar = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await aprobarUsuario(usuario.id, {});
      onChange(updated);
      setOk("Aprobado como equipo.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aprobar");
    } finally {
      setBusy(false);
    }
  };

  const desactivar = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await desactivarUsuario(
        usuario.id,
        motivoBaja.trim() === "" ? undefined : motivoBaja.trim(),
      );
      onChange(updated);
      setDeactivating(false);
      setMotivoBaja("");
      setOk("Desactivado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo desactivar");
    } finally {
      setBusy(false);
    }
  };

  const initial = (usuario.nombre || "?").charAt(0).toUpperCase();

  return (
    <li className="card" style={{ listStyle: "none" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span className="avatar" aria-hidden="true">
          {usuario.foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={usuario.foto} alt="" referrerPolicy="no-referrer" />
          ) : (
            initial
          )}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <strong style={{ display: "block", fontSize: 14 }}>{usuario.nombre}</strong>
          <span style={{ display: "block", fontSize: 12, color: "var(--c-text-2)" }}>
            {usuario.email}
          </span>
        </div>
        <AccesoChip acceso={usuario.acceso} />
      </div>
      {usuario.oficios.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {usuario.oficios.map((o) => (
            <span key={o} className="chip">
              {oficioLabel(o)}
            </span>
          ))}
        </div>
      )}
      {error !== null && (
        <div className="error-box" role="alert" style={{ marginTop: 8, marginBottom: 0 }}>
          <p>{error}</p>
        </div>
      )}
      {ok !== null && (
        <p className="hint" role="status" style={{ margin: "8px 0 0" }}>
          {ok}
        </p>
      )}
      {canManage && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {usuario.acceso === "pendiente" && (
            <button type="button" className="btn btn-sm" onClick={() => void aprobar()} disabled={busy}>
              {busy ? "Aprobando…" : "Aprobar"}
            </button>
          )}
          {usuario.acceso !== "pendiente" &&
            usuario.acceso !== "desactivado" &&
            !esYo && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setEditing((v) => !v)}
                  aria-expanded={editing}
                >
                  {editing ? "Cerrar edición" : "Cambiar acceso / oficios"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => setDeactivating((v) => !v)}
                  aria-expanded={deactivating}
                >
                  Desactivar
                </button>
              </>
            )}
        </div>
      )}
      {canManage && editing && (
        <EditForm
          usuario={usuario}
          yo={yo}
          soyDueno={soyDueno}
          disabled={busy}
          onDone={(u) => {
            onChange(u);
            setEditing(false);
            setOk("Cambios guardados.");
          }}
        />
      )}
      {canManage && deactivating && (
        <Modal title={`Desactivar a ${usuario.nombre}`} onClose={() => setDeactivating(false)}>
          <div className="field">
            <label className="label" htmlFor={`baja-${usuario.id}`}>
              Motivo (opcional)
            </label>
            <textarea
              id={`baja-${usuario.id}`}
              className="textarea"
              value={motivoBaja}
              disabled={busy}
              onChange={(e) => setMotivoBaja(e.target.value)}
              placeholder="Por qué se desactiva"
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => void desactivar()}
              disabled={busy}
            >
              {busy ? "Desactivando…" : "Confirmar"}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setDeactivating(false)}
              disabled={busy}
            >
              Cancelar
            </button>
          </div>
        </Modal>
      )}
      {canManage && <div style={{ marginTop: 10 }}><Historial usuarioId={usuario.id} /></div>}
    </li>
  );
}

export function EquipoView({
  yo,
  soyDueno,
  puedeGestionar,
}: {
  yo: string;
  /** true si el yo es dueño: habilita opciones admin/dueño en edición. */
  soyDueno: boolean;
  puedeGestionar: boolean;
}) {
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("todos");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setUsuarios(await getUsuarios());
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 403
          ? e.message
          : e instanceof Error
            ? e.message
            : "No se pudo cargar el equipo",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, []);

  const onChange = (u: Usuario) => {
    setUsuarios((prev) => (prev === null ? prev : prev.map((x) => (x.id === u.id ? u : x))));
  };

  const list = (usuarios ?? []).filter((u) => filter === "todos" || u.acceso === filter);
  const pendientes = (usuarios ?? []).filter((u) => u.acceso === "pendiente").length;

  return (
    <div className="page">
      <h1 className="page-title">Equipo</h1>
      <p className="page-sub">
        {usuarios === null ? "Personas del sistema." : `${usuarios.length} personas${pendientes > 0 ? ` · ${pendientes} pendientes` : ""}.`}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }} role="group" aria-label="Filtrar por acceso">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`chip ${filter === f.value ? "chip-dark" : ""}`}
            style={{ cursor: "pointer" }}
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {loading && <BootSplash label="Cargando equipo" />}
      {error !== null && !loading && (
        <div className="error-box" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      )}
      {!loading && error === null && list.length === 0 && (
        <div className="card">
          <p style={{ margin: 0, fontSize: 13, color: "var(--c-text-2)" }}>
            Nadie con este filtro.
          </p>
        </div>
      )}
      {!loading && error === null && list.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map((u) => (
            <UserCard key={u.id} usuario={u} yo={yo} soyDueno={soyDueno} canManage={puedeGestionar} onChange={onChange} />
          ))}
        </ul>
      )}
    </div>
  );
}
