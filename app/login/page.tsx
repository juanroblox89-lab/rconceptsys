"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase, isAuthConfigured } from "@/lib/supabase";
import { useSession } from "@/components/SessionProvider";
import { useTitle } from "@/lib/useTitle";
import { LogoIcon } from "@/components/Logo";
import styles from "./login.module.css";

const DEMO_OPTIONS = [
  { value: "dueno", titulo: "Dueño", desc: "Todo: usuarios, tarifas, cortes." },
  { value: "admin", titulo: "Admin", desc: "Clientes, piezas, aprobar, CRM." },
  { value: "equipo", titulo: "Equipo", desc: "Solo su trabajo." },
  { value: "pendiente", titulo: "Pendiente", desc: "Ve “esperando aprobación”." },
] as const;

function GoogleLogin() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const login = async () => {
    const supabase = getSupabase();
    if (supabase === null) {
      setError("Login no configurado");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) setError(error.message);
    } catch {
      setError("No se pudo iniciar sesión, probá de nuevo");
      setBusy(false);
    }
  };

  return (
    <>
      {error !== null && (
        <div className="error-box" role="alert">
          <p>{error}</p>
        </div>
      )}
      <button type="button" className="btn btn-block" onClick={() => void login()} disabled={busy}>
        {busy ? "Abriendo Google…" : "Entrar con Google"}
      </button>
    </>
  );
}

function DemoLogin() {
  const { chooseDemo } = useSession();
  const router = useRouter();

  const enter = (value: string) => {
    chooseDemo(value);
    router.replace("/inicio");
  };

  return (
    <div className={styles.demoList}>
      <p className={styles.demoNote}>
        Modo demo (sin Supabase): elegí con qué usuario entrar.
      </p>
      {DEMO_OPTIONS.map((o) => (
        <button key={o.value} type="button" className={styles.demoBtn} onClick={() => enter(o.value)}>
          <strong>{o.titulo}</strong>
          <small>{o.desc}</small>
        </button>
      ))}
    </div>
  );
}

export default function LoginPage() {
  useTitle("Entrar · RConcept Systems");
  const { authEnabled, session, demoUser, me } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (me !== null) router.replace("/inicio");
    else if (authEnabled && session !== null && session !== undefined) router.replace("/");
    else if (!authEnabled && demoUser !== null) router.replace("/inicio");
  }, [authEnabled, session, demoUser, me, router]);

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <span className={styles.brand}>
          <LogoIcon size={32} />
        </span>
        <h1 className="page-title">RConcept Systems</h1>
        <p className="page-sub">Sistema interno de Rohlfing Concept.</p>
        {isAuthConfigured() && authEnabled ? <GoogleLogin /> : <DemoLogin />}
      </div>
    </div>
  );
}
