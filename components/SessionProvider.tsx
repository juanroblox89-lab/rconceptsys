"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import {
  getDemoUser,
  getSupabase,
  isAuthConfigured,
  setDemoUser,
} from "@/lib/supabase";
import { getMe, ApiError } from "@/lib/api";
import type { MeResponse } from "@/lib/types";

/** Valores aceptados en ?demo= para entrar directo (útil para QA). */
const DEMO_ACCESOS = ["dueno", "admin", "equipo", "pendiente"] as const;

interface SessionState {
  /** false = sin Supabase: la app corre en modo demo. */
  authEnabled: boolean;
  /** Sesión de Supabase (null si no hay o si es modo demo). */
  session: Session | null | undefined;
  /** Usuario demo elegido (modo demo). null si no eligió. */
  demoUser: string | null;
  /** Respuesta de GET /me (null hasta cargarla). */
  me: MeResponse | null;
  meLoading: boolean;
  meError: string | null;
  unauthorized: boolean;
  retryMe: () => void;
  chooseDemo: (value: string) => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState>({
  authEnabled: true,
  session: undefined,
  demoUser: null,
  me: null,
  meLoading: true,
  meError: null,
  unauthorized: false,
  retryMe: () => {},
  chooseDemo: () => {},
  signOut: async () => {},
});

export function useSession(): SessionState {
  return useContext(SessionContext);
}

/** Lee ?demo=<acceso> una vez y entra directo (solo modo demo). */
function DemoParamReader({ onDemo }: { onDemo: (raw: string) => void }) {
  const searchParams = useSearchParams();
  const seen = useRef(false);
  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    const raw = searchParams.get("demo");
    if (raw !== null) onDemo(raw);
  }, [searchParams, onDemo]);
  return null;
}

function SessionInner({ children }: { children: React.ReactNode }) {
  const authEnabled = isAuthConfigured();
  const [session, setSession] = useState<Session | null | undefined>(
    authEnabled ? undefined : null,
  );
  const [demoUser, setDemoUserState] = useState<string | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [meError, setMeError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [meTick, setMeTick] = useState(0);
  const router = useRouter();
  const demoApplied = useRef(false);

  const applyDemoParam = useCallback(
    (raw: string) => {
      if (demoApplied.current) return;
      demoApplied.current = true;
      if (authEnabled) return;
      if ((DEMO_ACCESOS as readonly string[]).includes(raw)) {
        setDemoUser(raw);
        setDemoUserState(raw);
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("demo");
      router.replace(url.pathname + url.search + url.hash);
    },
    [authEnabled, router],
  );

  // Leer el demo elegido al montar (defer para no setear en el cuerpo del efecto).
  useEffect(() => {
    if (authEnabled) return;
    const t = window.setTimeout(() => setDemoUserState(getDemoUser()), 0);
    return () => window.clearTimeout(t);
  }, [authEnabled]);

  // Sesión de Supabase (solo si hay auth configurado).
  useEffect(() => {
    const supabase = getSupabase();
    if (supabase === null) return;
    let active = true;
    const timer = window.setTimeout(() => {
      if (active) setSession((s) => (s === undefined ? null : s));
    }, 6000);
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session);
      })
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => window.clearTimeout(timer));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next !== null && window.location.search.includes("code=")) {
        const url = new URL(window.location.href);
        url.searchParams.delete("code");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // GET /me cuando hay credencial (sesión o demo elegido).
  const hasCredential = authEnabled
    ? session !== null && session !== undefined
    : demoUser !== null;
  useEffect(() => {
    let active = true;
    const t = window.setTimeout(() => {
      if (!active) return;
      if (!hasCredential) {
        setMe(null);
        setMeError(null);
        setUnauthorized(false);
        setMeLoading(false);
        return;
      }
      setMeLoading(true);
      setMeError(null);
      setUnauthorized(false);
      void getMe()
        .then((data) => {
          if (!active) return;
          setMe(data);
          setMeLoading(false);
        })
        .catch((err: unknown) => {
          if (!active) return;
          if (err instanceof ApiError && err.status === 401) {
            setUnauthorized(true);
            setMe(null);
          } else {
            setMeError(err instanceof Error ? err.message : "Error al cargar");
          }
          setMeLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(t);
    };
  }, [hasCredential, session, demoUser, meTick]);

  const retryMe = useCallback(() => setMeTick((t) => t + 1), []);

  const chooseDemo = useCallback((value: string) => {
    setDemoUser(value);
    setDemoUserState(value);
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (supabase !== null) {
      try {
        await supabase.auth.signOut();
      } catch {
        // igual se sale
      }
    }
    setDemoUser(null);
    setDemoUserState(null);
    setMe(null);
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      authEnabled,
      session,
      demoUser,
      me,
      meLoading,
      meError,
      unauthorized,
      retryMe,
      chooseDemo,
      signOut,
    }),
    [
      authEnabled,
      session,
      demoUser,
      me,
      meLoading,
      meError,
      unauthorized,
      retryMe,
      chooseDemo,
      signOut,
    ],
  );

  return (
    <SessionContext.Provider value={value}>
      <Suspense fallback={null}>
        <DemoParamReader onDemo={applyDemoParam} />
      </Suspense>
      {children}
    </SessionContext.Provider>
  );
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SessionInner>{children}</SessionInner>
    </Suspense>
  );
}
