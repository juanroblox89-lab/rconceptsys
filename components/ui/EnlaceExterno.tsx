"use client";

import type { ComponentPropsWithoutRef, MouseEvent } from "react";
import { abrirExterno, urlExterna } from "@/lib/abrir-externo";

type Props = Omit<ComponentPropsWithoutRef<"a">, "href" | "target" | "rel"> & { href: string };

export function EnlaceExterno({ href, onClick, children, ...props }: Props) {
  const url = urlExterna(href);
  if (!url) return <span>{children}</span>;
  function abrir(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    abrirExterno(e.currentTarget.href);
  }
  return <a {...props} href={url} target="_blank" rel="noopener noreferrer" onClick={abrir}>{children}</a>;
}
