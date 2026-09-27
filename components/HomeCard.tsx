"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./HomeCard.module.css";

// HomeCard RConcept (adaptado de Globe): la misma tarjeta para cada módulo.
export interface HomeCardProps {
  icon: ReactNode;
  title: string;
  meta: string;
  href?: string;
  current?: boolean;
}

export function HomeCard({ icon, title, meta, href, current = false }: HomeCardProps) {
  const inner = (
    <>
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        <span className={styles.meta}>{meta}</span>
      </span>
    </>
  );
  const cls = `${styles.card} ${current ? styles.current : ""}`;
  if (href !== undefined) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}

export function HomeCardRow({ children }: { children: ReactNode }) {
  return <div className={styles.cards}>{children}</div>;
}
