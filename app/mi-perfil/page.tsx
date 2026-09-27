"use client";

import { Panel } from "@/components/Panel";
import { useSession } from "@/components/SessionProvider";
import { useTitle } from "@/lib/useTitle";
import { oficioLabel } from "@/lib/oficios";

export default function MiPerfilPage() {
  useTitle("Mi perfil · RConcept Systems");
  const { me, signOut } = useSession();
  const u = me?.usuario ?? null;
  const initial = (u?.nombre ?? "?").charAt(0).toUpperCase();

  return (
    <Panel title="Mi perfil">
      <div className="page">
        <h1 className="page-title">Mi perfil</h1>
        <p className="page-sub">Tus datos en el sistema.</p>
        <div className="card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span className="avatar" aria-hidden="true">
            {u?.foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.foto} alt="" referrerPolicy="no-referrer" />
            ) : (
              initial
            )}
          </span>
          <div style={{ minWidth: 0 }}>
            <strong style={{ display: "block", fontSize: 14 }}>{u?.nombre ?? "…"}</strong>
            <span style={{ display: "block", fontSize: 13, color: "var(--c-text-2)" }}>
              {u?.email ?? ""}
            </span>
            <span style={{ display: "block", fontSize: 13, color: "var(--c-text-2)" }}>
              {u?.telefono ?? "Sin teléfono"}
            </span>
          </div>
        </div>
        <div className="card" style={{ marginTop: 12 }}>
          <span className="label">Oficios</span>
          {u !== null && u.oficios.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {u.oficios.map((o) => (
                <span key={o} className="chip">
                  {oficioLabel(o)}
                </span>
              ))}
            </div>
          ) : (
            <p className="hint" style={{ margin: 0 }}>
              Sin oficios asignados.
            </p>
          )}
          <p className="hint">Los oficios los gestiona un dueño o admin desde Equipo.</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: 12 }}
          onClick={() => void signOut()}
        >
          Cerrar sesión
        </button>
      </div>
    </Panel>
  );
}
