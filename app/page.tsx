"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BootSplash } from "@/components/BootSplash";
import { useSession } from "@/components/SessionProvider";
import { useTitle } from "@/lib/useTitle";

/** Raíz: decide a dónde mandar según sesión/demo. */
export default function RootPage() {
  useTitle("RConcept Systems");
  const { authEnabled, session, demoUser, me, meLoading, meError, unauthorized, retryMe } =
    useSession();
  const router = useRouter();

  const checkingAuth = authEnabled && session === undefined;
  const needLogin =
    (authEnabled && session === null) ||
    (!authEnabled && demoUser === null) ||
    unauthorized;

  useEffect(() => {
    if (me !== null) router.replace("/inicio");
    else if (needLogin) router.replace("/login");
  }, [me, needLogin, router]);

  if (checkingAuth || (me === null && meLoading && !needLogin)) {
    return <BootSplash />;
  }

  if (meError !== null && me === null) {
    return (
      <div className="center">
        <div className="error-box" style={{ maxWidth: 340 }}>
          <p>{meError}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={retryMe}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return <BootSplash />;
}
