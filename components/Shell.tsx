"use client";

import { Suspense } from "react";
import { AppShell } from "./AppShell";

/** Shell: AppShell de Globe adaptado con los módulos de GET /me (vía Panel). */
export function Shell({
  children,
  modulos,
}: {
  children: React.ReactNode;
  modulos: import("@/lib/types").Modulo[];
}) {
  return (
    <Suspense>
      <AppShell modulos={modulos}>{children}</AppShell>
    </Suspense>
  );
}
