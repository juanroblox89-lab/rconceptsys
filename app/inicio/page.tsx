"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/Panel";
import { HomeCard, HomeCardRow } from "@/components/HomeCard";
import { ModuleIcon } from "@/components/icons";
import { useSession } from "@/components/SessionProvider";
import { faseDe } from "@/lib/modulos";
import { useTitle } from "@/lib/useTitle";
import { getTareas } from "@/lib/f1ui";
import { getLineas } from "@/lib/f2api";
import { getLeads } from "@/lib/f4api";
import { contarPendientes } from "@/lib/f4offline";
import { fmtCOP } from "@/lib/f2tipos";

export default function InicioPage() {
  useTitle("Inicio · RConcept Systems");
  const { me } = useSession();
  const nombre = me ? me.usuario.nombre.split(" ")[0] : "";
  const modulos = me?.modulos ?? [];
  const listos = modulos.filter((m) => m.habilitado && m.id !== "inicio" && m.id !== "mi-perfil");
  const perfil = modulos.find((m) => m.id === "mi-perfil" && m.habilitado);
  const proximos = modulos.filter((m) => !m.habilitado && m.id !== "inicio");
  const acceso = me?.usuario.acceso ?? "equipo";
  const admin = acceso === "dueno" || acceso === "admin";

  const [hoy, setHoy] = useState<number | null>(null);
  const [vencidas, setVencidas] = useState<number | null>(null);
  const [porRevisar, setPorRevisar] = useState<number | null>(null);
  const [cobrosMes, setCobrosMes] = useState<string | null>(null);
  const [alertas, setAlertas] = useState<string | null>(null);
  const [ventasHoy, setVentasHoy] = useState<string | null>(null);

  useEffect(() => {
    if (me === null) return;
    let alive = true;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          if (!alive) return;
          const yo = me.usuario.id;
          const [h, v] = await Promise.all([
            getTareas({ asignado: yo, vista: "hoy" }).catch(() => null),
            getTareas({ asignado: yo, vista: "vencidas" }).catch(() => null),
          ]);
          if (!alive) return;
          if (h !== null) setHoy(h.length);
          if (v !== null) setVencidas(v.length);
          // F2: tarjeta "Tus cobros del mes" (§5.22) + alertas admin/dueño.
          const ls = await getLineas({}).catch(() => null);
          if (!alive) return;
          if (ls !== null) {
            const d = new Date();
            const per = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            const delMes = ls.filter((l) => l.periodo === per);
            const ap = delMes
              .filter((l) => l.estado === "aprobada")
              .reduce((s, l) => s + l.monto_cop, 0);
            const pc = delMes
              .filter((l) => l.estado === "por_confirmar" || l.estado === "confirmada")
              .reduce((s, l) => s + l.monto_cop, 0);
            setCobrosMes(`${fmtCOP(ap)} aprob. · ${fmtCOP(pc)} por conf.`);
            if (admin) {
              const rec = delMes.filter((l) => l.estado === "reclamada").length;
              const st = delMes.filter((l) => l.estado === "sin_tarifa").length;
              const todos = await getTareas({}).catch(() => null);
              const dec = todos === null ? 0 : (todos as unknown as { decision_pendiente?: boolean }[]).filter((t) => t.decision_pendiente).length;
              setAlertas(
                rec + st + dec === 0
                  ? "Sin pendientes"
                  : `${rec} reclamos · ${st} sin tarifa · ${dec} decisiones`,
              );
            }
          }
          if (admin) {
            const r = await getTareas({ vista: "por_revisar" }).catch(() => null);
            if (!alive || r === null) return;
            setPorRevisar(r.length);
          }
          // F4: tarjeta Ventas (próximas acciones de hoy / visitas pendientes
          // de subir) para quien tiene oficio ventas; resumen para admin.
          try {
            const tieneVentas =
              admin || (me.usuario.oficios ?? []).includes("ventas");
            if (tieneVentas) {
              const ls = await getLeads({}).catch(() => null);
              const pend = await contarPendientes().catch(() => 0);
              if (!alive) return;
              if (ls !== null) {
                const d = new Date();
                const h = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                const deHoy = ls.filter(
                  (l) => l.accion_fecha === h && l.estado !== "ganado" && l.estado !== "perdido",
                ).length;
                const venc = ls.filter((l) => l.vencida).length;
                setVentasHoy(
                  `${deHoy} acciones hoy${venc > 0 ? ` · ${venc} vencidas` : ""}${pend > 0 ? ` · ${pend} por subir` : ""}`,
                );
              } else if (pend > 0) {
                setVentasHoy(`${pend} visitas por subir`);
              }
            }
          } catch {
            // Sin tarjeta de ventas: el módulo sigue disponible.
          }
        } catch {
          // Sin números: las tarjetas siguen mostrando los módulos.
        }
      })();
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [me, admin]);

  const metaTareas = hoy === null ? "Tus pendientes" : hoy === 0 ? "Nada para hoy" : `${hoy} para hoy`;
  const metaVenc = vencidas === null || vencidas === 0 ? "Al día" : `${vencidas} vencidas`;
  const metaCobros = cobrosMes ?? "Tus cobros";
  const metaVentas = ventasHoy ?? "Tus ventas";

  return (
    <Panel title="Inicio">
      <div className="page">
        <h1 className="page-title">Hola{nombre !== "" ? `, ${nombre}` : ""}</h1>
        <p className="page-sub">Esto es lo que hay hoy.</p>
        {listos.length > 0 && (
          <HomeCardRow>
            {listos.map((m) => (
              <HomeCard
                key={m.id}
                icon={<ModuleIcon id={m.id} size={18} />}
                title={m.titulo}
                meta={
                  m.id === "mis-tareas"
                    ? `${metaTareas} · ${metaVenc}`
                    : m.id === "revision" && porRevisar !== null
                      ? `${porRevisar} por revisar`
                      : m.id === "cobros"
                        ? metaCobros
                        : m.id === "ventas"
                          ? metaVentas
                          : "Disponible"
                }
                href={m.ruta}
                current
              />
            ))}
            {perfil !== undefined && (
              <HomeCard
                icon={<ModuleIcon id="mi-perfil" size={18} />}
                title={perfil.titulo}
                meta="Tus datos"
                href={perfil.ruta}
              />
            )}
            {admin && alertas !== null && (
              <HomeCard
                icon={<ModuleIcon id="cobros" size={18} />}
                title="Pendientes de cobro"
                meta={alertas}
                href="/cobros"
              />
            )}
          </HomeCardRow>
        )}
        {listos.length === 0 && perfil !== undefined && (
          <HomeCardRow>
            <HomeCard
              icon={<ModuleIcon id="mi-perfil" size={18} />}
              title={perfil.titulo}
              meta="Tus datos"
              href={perfil.ruta}
              current
            />
          </HomeCardRow>
        )}
        {proximos.length > 0 && (
          <>
            <p className="page-sub" style={{ marginTop: 16 }}>
              Llegan en sus fases.
            </p>
            <HomeCardRow>
              {proximos.map((m) => (
                <HomeCard
                  key={m.id}
                  icon={<ModuleIcon id={m.id} size={18} />}
                  title={m.titulo}
                  meta={`Llega en la fase ${faseDe(m.id)}`}
                  href={m.ruta}
                />
              ))}
            </HomeCardRow>
          </>
        )}
      </div>
    </Panel>
  );
}
