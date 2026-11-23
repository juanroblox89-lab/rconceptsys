import type { SVGProps } from "react";

export function MarcaRIA({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number | string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <circle cx="12" cy="12" r="11" fill="var(--rc-azul-suave)" />
    <path d="M8.7 17V7h3.6a2.8 2.8 0 0 1 0 5.6H8.7m3.1 0 3.7 4.4" stroke="var(--rc-azul-texto)" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
