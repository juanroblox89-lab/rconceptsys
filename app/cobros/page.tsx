"use client";

/**
 * Cobros F2 — 3 vistas por acceso (B/N, compacto, 375 primero):
 * - equipo: mis líneas del mes (confirmar / reclamar con motivo),
 *   total "llevas $X aprobado, $Y por confirmar", historial de cortes.
 * - admin: todas las líneas, confirmar/aprobar/devolver, ajustes con motivo,
 *   reclamos pendientes.
 * - dueño: lo anterior + Tarifas + Paquetes y % comisión + Cerrar corte +
 *   Marcar pagado + Decisiones pendientes de piezas canceladas.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/Panel";
import { BootSplash } from "@/components/BootSplash";
import { Modal } from "@/components/Modal";
import { useSession } from "@/components/SessionProvider";
import { getTareas } from "@/lib/f1ui";
import { getUsuarios } from "@/lib/api";
import type { Usuario } from "@/lib/types";
import {
  aprobarLinea,
  cerrarCorte,
  confirmarLinea,
  crearAjuste,
  crearPaquete,
  crearTarifa,
  decidirTarea,
  devolverLinea,
  getConfigCobros,
  getCorteActual,
  getCorteMio,
  getLineas,
  getPaquetes,
  getTarifas,
  pagarCorte,
  patchConfigCobros,
  reclamarLinea,
  revertirCorte,
} from "@/lib/f2api";
import {
  fmtCOP,
  lineaEstadoLabel,
  periodoActual,
  type CorteDetalle,
  type Linea,
  type Paquete,
  type Tarifa,
  type UnidadTarifa,
} from "@/lib/f2tipos";
import { fmtPeriodo } from "@/lib/fechas";
import f1 from "@/components/F1.module.css";

type Tab = "lineas" | "historial" | "reclamos" | "tarifas" | "paquetes" | "corte" | "decisiones";

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

function Totales({ lineas, equipo }: { lineas: Linea[]; equipo: boolean }) {
  const aprobado = lineas
    .filter((l) => l.estado === "aprobada")
    .reduce((s, l) => s + l.monto_cop, 0);
  const porConfirmar = lineas
    .filter((l) => l.estado === "por_confirmar" || l.estado === "confirmada")
    .reduce((s, l) => s + l.monto_cop, 0);
  const sinTarifa = lineas.filter((l) => l.estado === "sin_tarifa").length;
  return (
    <div className={f1.f1card} aria-live="polite">
      <div style={{ fontSize: 13, fontWeight: 700 }}>
        {equipo
          ? `Llevás ${fmtCOP(aprobado)} aprobado este mes, ${fmtCOP(porConfirmar)} por confirmar`
          : `Total del equipo este mes: ${fmtCOP(aprobado)} aprobado, ${fmtCOP(porConfirmar)} por confirmar`}
      </div>
      {sinTarifa > 0 && (
        <div style={{ fontSize: 12, color: "var(--c-text-2)", marginTop: 2 }}>
          {sinTarifa} línea{sinTarifa === 1 ? "" : "s"} sin tarifa (avisamos al dueño)
        </div>
      )}
    </div>
  );
}

/** Historial de cortes del trabajador (§5.22): su resumen por periodo. */
function HistorialMio({ periodo }: { periodo: string }) {
  const [detalle, setDetalle] = useState<CorteDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    getCorteMio(periodo)
      .then((d) => {
        if (vivo) setDetalle(d);
      })
      .catch((e) => {
        if (vivo) setError(e instanceof Error ? e.message : "No se pudo cargar");
      });
    return () => {
      vivo = false;
    };
  }, [periodo]);

  if (error !== null) return <p role="alert" style={{ fontSize: 12 }}>{error}</p>;
  if (detalle === null) return <p style={{ fontSize: 12, color: "var(--c-text-2)" }}>Cargando historial…</p>;
  const yo = detalle.por_persona[0];
  return (
    <div className={f1.f1card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
        <strong>Corte {fmtPeriodo(detalle.periodo)}</strong>
        <span className={f1.f1chip}>{detalle.corte.estado}</span>
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--c-text-2)" }}>
        {yo === undefined
          ? "Sin líneas en este periodo."
          : `${fmtCOP(yo.aprobado)} aprob. · ${fmtCOP(yo.por_confirmar)} por conf. · ${fmtCOP(yo.pagado)} pag.`}
      </p>
    </div>
  );
}

function LineaCard({
  linea,
  admin,
  onChange,
}: {
  linea: Linea;
  admin: boolean;
  onChange: (l: Linea) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const correr = async (fn: () => Promise<Linea>) => {
    setSaving(true);
    setError(null);
    try {
      onChange(await fn());
      setAbierto(false);
      setMotivo("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className={f1.f1card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ fontSize: 14 }}>
          {fmtCOP(linea.monto_cop)}{" "}
          <span style={{ fontWeight: 400, color: "var(--c-text-2)", fontSize: 12 }}>
            · {linea.tipo}{linea.usuario_nombre ? ` · ${linea.usuario_nombre}` : ""}
          </span>
        </strong>
        <span className={f1.f1chip}>{lineaEstadoLabel(linea.estado)}</span>
      </div>
      {linea.motivo !== null && linea.motivo !== "" && (
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--c-text-2)" }}>
          Motivo: {linea.motivo}
          {(linea.estado === "aprobada" || linea.estado === "en_corte" || linea.estado === "pagada") && " (resuelto)"}
        </p>
      )}
      {linea.reclamo_motivo !== null && linea.reclamo_motivo !== "" && (
        <p style={{ margin: "4px 0 0", fontSize: 12 }}>
          Reclamo: {linea.reclamo_motivo}
          {(linea.estado === "aprobada" || linea.estado === "en_corte" || linea.estado === "pagada") && " (resuelto)"}
        </p>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {linea.estado === "por_confirmar" && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={saving}
            onClick={() => void correr(() => confirmarLinea(linea.id))}
          >
            Confirmar
          </button>
        )}
        {linea.estado === "sin_tarifa" && (
          <span style={{ fontSize: 12, color: "var(--c-text-2)" }}>
            El dueño debe fijar la tarifa para generarte el cobro.
          </span>
        )}
        {(linea.estado === "por_confirmar" || linea.estado === "confirmada") && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={saving}
            onClick={() => setAbierto(!abierto)}
          >
            Reclamar
          </button>
        )}
        {admin && (linea.estado === "confirmada" || linea.estado === "reclamada") && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={saving}
            onClick={() => void correr(() => aprobarLinea(linea.id))}
          >
            Aprobar
          </button>
        )}
        {admin && (linea.estado === "confirmada" || linea.estado === "reclamada") && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={saving}
            onClick={() => setAbierto(!abierto)}
          >
            Devolver
          </button>
        )}
      </div>
      {abierto && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input
            className="input"
            placeholder="Motivo (obligatorio)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={saving || motivo.trim() === ""}
            onClick={() =>
              void correr(() =>
                admin && linea.estado !== "por_confirmar"
                  ? devolverLinea(linea.id, motivo.trim())
                  : reclamarLinea(linea.id, motivo.trim()),
              )
            }
          >
            Enviar
          </button>
        </div>
      )}
      {error !== null && (
        <p style={{ margin: "6px 0 0", fontSize: 12 }} role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function TarifasPanel({ onDone }: { onDone: () => void }) {
  const [tarifas, setTarifas] = useState<Tarifa[] | null>(null);
  const [etapa, setEtapa] = useState("edicion");
  const [unidad, setUnidad] = useState<UnidadTarifa>("por_tarea");
  const [monto, setMonto] = useState("");
  const [nueva, setNueva] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setTarifas(await getTarifas());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void cargar(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardar = async () => {
    const n = Number(monto);
    if (!Number.isInteger(n) || n < 0) return;
    setSaving(true);
    setError(null);
    try {
      await crearTarifa({ etapa, unidad, monto_cop: n });
      setMonto("");
      setNueva(false);
      await cargar();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className={f1.f1head}>
        <h2 className="page-sub" style={{ margin: "0" }}>
          Tarifas (crear nueva versión; la anterior queda en historial)
        </h2>
        <button type="button" className="btn btn-sm" onClick={() => setNueva(true)}>
          Nueva tarifa
        </button>
      </div>
      {error !== null && <p role="alert" style={{ fontSize: 12 }}>{error}</p>}
      {nueva && (
        <Modal title="Nueva tarifa" onClose={() => setNueva(false)}>
          <div className={f1.f1sheetFilters}>
            <label className="label" htmlFor="nt-etapa">
              Etapa
              <select id="nt-etapa" className="select" value={etapa} onChange={(e) => setEtapa(e.target.value)}>
                <option value="grabacion_principal">Grabación principal</option>
                <option value="grabacion_apoyo">Grabación de apoyo</option>
                <option value="edicion">Edición</option>
                <option value="diseno">Diseño</option>
                <option value="publicacion">Publicación</option>
              </select>
            </label>
            <label className="label" htmlFor="nt-unidad">
              Unidad
              <select id="nt-unidad" className="select" value={unidad} onChange={(e) => setUnidad(e.target.value as UnidadTarifa)}>
                <option value="por_tarea">Por tarea</option>
                <option value="por_minuto">Por minuto</option>
                <option value="por_duracion">Por duración</option>
              </select>
            </label>
            <label className="label" htmlFor="nt-monto">
              Monto COP
              <input
                id="nt-monto"
                className="input"
                inputMode="numeric"
                placeholder="Monto COP"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-sm" disabled={saving || monto.trim() === ""} onClick={() => void guardar()}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => setNueva(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}
      <ul className={f1.f1list} style={{ marginTop: 10 }}>
        {(tarifas ?? []).map((t) => (
          <li key={t.id} className={f1.f1card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
              <strong>
                {t.etapa} · {t.unidad} · {fmtCOP(t.monto_cop)}
              </strong>
              <span className={f1.f1chip}>v{t.version}{t.activa ? " · vigente" : ""}{t.demo ? " · demo" : ""}</span>
            </div>
          </li>
        ))}
        {(tarifas ?? []).length === 0 && (
          <li className="card">
            <p className={f1.f1vacio}>
              <strong>Sin tarifas</strong>
              Tocá “Nueva tarifa” para crear la primera.
            </p>
          </li>
        )}
      </ul>
    </div>
  );
}

function PaquetesPanel() {
  const [paquetes, setPaquetes] = useState<Paquete[] | null>(null);
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  const [pct, setPct] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [ps, cfg] = await Promise.all([getPaquetes(), getConfigCobros()]);
      setPaquetes(ps);
      setPct(String(cfg.porcentaje_comision));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void cargar(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardarPaquete = async () => {
    const n = Number(precio);
    if (nombre.trim() === "" || !Number.isInteger(n) || n < 0) return;
    setSaving(true);
    try {
      await crearPaquete({ nombre: nombre.trim(), precio_cop: n });
      setNombre("");
      setPrecio("");
      setNuevo(false);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const guardarConfig = async () => {
    const n = Number(pct);
    if (!(n >= 0 && n <= 100)) return;
    setSaving(true);
    try {
      // Comisión fija en una_vez (decisión de Juan, BRIEF F3 §2.1): el modo
      // no se muestra ni se cambia desde la UI.
      await patchConfigCobros({ porcentaje_comision: n, modo_comision: "una_vez" });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className={f1.f1head}>
        <h2 className="page-sub" style={{ margin: "0" }}>
          Paquetes y comisión ({pct !== "" ? `${pct} %` : "…"})
        </h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNuevo(true)}>
          Nuevo paquete
        </button>
      </div>
      {error !== null && <p role="alert" style={{ fontSize: 12 }}>{error}</p>}
      <ul className={f1.f1list} style={{ marginTop: 10 }}>
        {(paquetes ?? []).map((p) => (
          <li key={p.id} className={f1.f1card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
              <strong>{p.nombre}</strong>
              <span>{fmtCOP(p.precio_cop)}{p.demo ? " · demo" : ""}</span>
            </div>
          </li>
        ))}
        {(paquetes ?? []).length === 0 && (
          <li className="card">
            <p className={f1.f1vacio}>
              <strong>Sin paquetes</strong>
              Tocá “Nuevo paquete” para crear el primero.
            </p>
          </li>
        )}
      </ul>
      {nuevo && (
        <Modal title="Nuevo paquete" onClose={() => setNuevo(false)}>
          <div className={f1.f1sheetFilters}>
            <label className="label" htmlFor="npq-nombre">
              Nombre
              <input id="npq-nombre" className="input" placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </label>
            <label className="label" htmlFor="npq-precio">
              Precio COP
              <input id="npq-precio" className="input" inputMode="numeric" placeholder="Precio COP" value={precio} onChange={(e) => setPrecio(e.target.value)} />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-sm" disabled={saving || nombre.trim() === ""} onClick={() => void guardarPaquete()}>
                {saving ? "Guardando…" : "Agregar"}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => setNuevo(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}
      <div className={f1.f1filters}>
        <input className="input" inputMode="decimal" placeholder="% (0–100)" value={pct} onChange={(e) => setPct(e.target.value)} aria-label="Porcentaje de comisión" />
        <span style={{ fontSize: 12, color: "var(--c-text-2)" }}>Comisión única al conseguir el cliente</span>
        <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => void guardarConfig()}>
          Guardar
        </button>
      </div>
    </div>
  );
}

function CortePanel({ periodo }: { periodo: string }) {  const [detalle, setDetalle] = useState<CorteDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ajuste, setAjuste] = useState({ usuario: "", monto: "", motivo: "" });
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);

  const cargar = useCallback(async () => {
    try {
      setDetalle(await getCorteActual(periodo));
      setUsuarios(await getUsuarios().catch(() => []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    }
  }, [periodo]);

  useEffect(() => {
    const t = window.setTimeout(() => void cargar(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  const correr = async (fn: () => Promise<unknown>) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const guardarAjuste = async () => {
    const n = Number(ajuste.monto);
    if (ajuste.usuario === "" || !Number.isInteger(n) || n === 0 || ajuste.motivo.trim() === "") return;
    await correr(() => crearAjuste({ usuario_id: ajuste.usuario, monto_cop: n, motivo: ajuste.motivo.trim(), periodo }));
    setAjuste({ usuario: "", monto: "", motivo: "" });
  };

  return (
    <div>
      <h2 className="page-sub" style={{ margin: "0 0 8px" }}>
        Corte {fmtPeriodo(periodo)} · {detalle?.corte.estado ?? "…"}
      </h2>
      {error !== null && <p role="alert" style={{ fontSize: 12 }}>{error}</p>}
      <div className={f1.f1filters}>
        <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => void correr(() => cerrarCorte(periodo))}>
          Cerrar corte
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => void correr(() => pagarCorte(periodo))}>
          Marcar pagado (todo)
        </button>
        <a className="btn btn-secondary btn-sm" href={`/api/backend/cortes/${periodo}/csv`}>
          CSV
        </a>
      </div>
      <ul className={f1.f1list}>
        {(detalle?.por_persona ?? []).map((p) => (
          <li key={p.usuario_id} className={f1.f1card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
              <strong>{p.usuario_nombre}</strong>
              <span>
                {fmtCOP(p.aprobado)} aprob. · {fmtCOP(p.por_confirmar)} conf. · {fmtCOP(p.pagado)} pag.
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => void correr(() => pagarCorte(periodo, p.usuario_id))}>
                Pagar a esta persona
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => void correr(() => revertirCorte(periodo, p.usuario_id))}>
                Revertir
              </button>
            </div>
          </li>
        ))}
      </ul>
      <h2 className="page-sub" style={{ margin: "12px 0 8px" }}>
        Ajuste con motivo (bono, descuento, corrección)
      </h2>
      <div className={f1.f1filters}>
        <select className="select" value={ajuste.usuario} onChange={(e) => setAjuste({ ...ajuste, usuario: e.target.value })} aria-label="Persona">
          <option value="">Persona…</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
        <input className="input" inputMode="numeric" placeholder="Monto (+/−)" value={ajuste.monto} onChange={(e) => setAjuste({ ...ajuste, monto: e.target.value })} />
        <input className="input" placeholder="Motivo (obligatorio)" value={ajuste.motivo} onChange={(e) => setAjuste({ ...ajuste, motivo: e.target.value })} />
        <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => void guardarAjuste()}>
          Crear ajuste
        </button>
      </div>
    </div>
  );
}

function DecisionesPanel({ onDone }: { onDone: () => void }) {
  const [tareas, setTareas] = useState<{ id: string; pieza_titulo: string; etapa: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  const cargar = useCallback(async () => {
    try {
      const todas = await getTareas({});
      setTareas(
        (todas as unknown as { id: string; pieza_titulo: string; etapa: string; decision_pendiente: boolean }[])
          .filter((t) => t.decision_pendiente)
          .map((t) => ({ id: t.id, pieza_titulo: t.pieza_titulo, etapa: t.etapa })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void cargar(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decidir = async (id: string, decision: "pagar" | "no_pagar") => {    if (motivo.trim() === "") return;
    try {
      await decidirTarea(id, { decision, motivo: motivo.trim() });
      setMotivo("");
      await cargar();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  };

  if (tareas.length === 0) {
    return (
      <div className="card">
        <p className={f1.f1vacio}>
          <strong>Sin decisiones pendientes</strong>
          Cuando se cancele una pieza, aparece aquí qué pagar.
        </p>
      </div>
    );
  }
  return (
    <div>
      {error !== null && <p role="alert" style={{ fontSize: 12 }}>{error}</p>}
      <ul className={f1.f1list} style={{ minWidth: 0 }}>
        {tareas.map((t) => (
          <li key={t.id} className={f1.f1card} style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13 }}>
              <strong>{t.pieza_titulo}</strong> · {t.etapa}
            </div>
            <div className={f1.f1sheetFilters} style={{ marginTop: 6 }}>
              <input className="input" placeholder="Motivo (obligatorio)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              <div className={f1.f1filters} style={{ marginBottom: 0 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void decidir(t.id, "pagar")}>
                  Pagar
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void decidir(t.id, "no_pagar")}>
                  No pagar
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Selector de mes compacto (BRIEF F3 §2.2): ‹ Sep 2026 › en vez del input
 * month nativo, que se trunca a 375. Sin dependencias, B/N. */
function SelectorMes({ periodo, onChange }: { periodo: string; onChange: (p: string) => void }) {
  const mover = (dir: 1 | -1) => {
    const m = /^(\d{4})-(\d{2})$/.exec(periodo);
    if (m === null) {
      onChange(periodoActual());
      return;
    }
    let y = Number(m[1]);
    let mo = Number(m[2]) + dir;
    if (mo < 1) {
      mo = 12;
      y -= 1;
    }
    if (mo > 12) {
      mo = 1;
      y += 1;
    }
    onChange(`${y}-${String(mo).padStart(2, "0")}`);
  };
  const etiqueta = fmtPeriodo(periodo);
  return (
    <div className="f1mes" role="group" aria-label="Periodo">
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => mover(-1)} aria-label="Mes anterior">
        ‹
      </button>
      <span style={{ fontSize: 13, minWidth: 76, textAlign: "center" }} aria-live="polite">
        {etiqueta}
      </span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => mover(1)} aria-label="Mes siguiente">
        ›
      </button>
    </div>
  );
}

export default function CobrosPage() {
  const { me } = useSession();
  const acceso = me?.usuario.acceso ?? "equipo";
  const dueno = acceso === "dueno";
  const admin = acceso === "dueno" || acceso === "admin";
  const [tab, setTab] = useState<Tab>("lineas");
  const [periodo, setPeriodo] = useState(periodoActual());
  const [lineas, setLineas] = useState<Linea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setLineas(await getLineas({ periodo }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    } finally {
      setCargando(false);
    }
  }, [periodo]);

  useEffect(() => {
    const t = window.setTimeout(() => void cargar(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  const visibles = useMemo(() => {
    const ls = lineas ?? [];
    if (tab === "reclamos") return ls.filter((l) => l.estado === "reclamada" || l.estado === "sin_tarifa");
    if (filtro === "") return ls;
    return ls.filter((l) => l.estado === filtro);
  }, [lineas, tab, filtro]);

  const tabs: { value: Tab; label: string }[] = useMemo(() => {
    const base: { value: Tab; label: string }[] = [{ value: "lineas", label: "Líneas" }];
    if (!admin) base.push({ value: "historial", label: "Historial" });
    if (admin) base.push({ value: "reclamos", label: "Reclamos" });
    if (admin) base.push({ value: "corte", label: "Corte" });
    if (dueno) {
      base.push({ value: "tarifas", label: "Tarifas" });
      base.push({ value: "paquetes", label: "Paquetes" });
      base.push({ value: "decisiones", label: "Decisiones" });
    }
    return base;
  }, [admin, dueno]);

  if (me === null || cargando) return <BootSplash label="Cargando cobros…" />;

  return (
    <Panel title="Cobros">
      <div className="page">
        <h1 className="page-title">Cobros</h1>
        <p className="page-sub">
          {lineas === null ? "Tus cobros del mes." : `${visibles.length} líneas · ${fmtPeriodo(periodo)}.`}
        </p>
        {error !== null && <Aviso error={error} onRetry={() => void cargar()} />}
        <Totales lineas={lineas ?? []} equipo={!admin} />
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
          <SelectorMes periodo={periodo} onChange={(p) => setPeriodo(p)} />
          {(tab === "lineas" || tab === "reclamos") && (
            <select
              className="select"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              aria-label="Estado"
            >
              <option value="">Todos</option>
              <option value="por_confirmar">Por confirmar</option>
              <option value="confirmada">Confirmada</option>
              <option value="aprobada">Aprobada</option>
              <option value="en_corte">En corte</option>
              <option value="pagada">Pagada</option>
              <option value="reclamada">Reclamada</option>
              <option value="sin_tarifa">Sin tarifa</option>
            </select>
          )}
        </div>
        {tab === "lineas" || tab === "reclamos" ? (
          visibles.length === 0 ? (
            tab === "reclamos" ? (
              <div className="card">
                <p className={f1.f1vacio}>
                  <strong>Sin reclamos pendientes</strong>
                  Cuando alguien reclame una línea, aparece aquí.
                </p>
              </div>
            ) : (
              <div className="card">
                <p className={f1.f1vacio}>
                  <strong>Nada en esta vista</strong>
                  Cambiá el mes o el filtro de estado.
                </p>
              </div>
            )
          ) : (
            <ul className={f1.f1list}>
              {visibles.map((l) => (
                <LineaCard
                  key={l.id}
                  linea={l}
                  admin={admin}
                  onChange={(n) => setLineas((ls) => (ls ?? []).map((x) => (x.id === n.id ? n : x)))}
                />
              ))}
            </ul>
          )
        ) : tab === "corte" && admin ? (
          <CortePanel periodo={periodo} />
        ) : tab === "historial" && !admin ? (
          <HistorialMio periodo={periodo} />
        ) : tab === "tarifas" && dueno ? (
          <TarifasPanel onDone={() => void cargar()} />
        ) : tab === "paquetes" && dueno ? (
          <PaquetesPanel />
        ) : tab === "decisiones" && dueno ? (
          <DecisionesPanel onDone={() => void cargar()} />
        ) : null}
      </div>
    </Panel>
  );
}
