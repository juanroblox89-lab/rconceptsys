"use client";

import { useEffect } from "react";

/** Título distinto por pantalla (útil para asserts de QA). */
export function useTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
