import { Clapperboard } from "lucide-react";

/** Marca de RConcept Systems: ícono + nombre en estilo neumórfico. */
export function Logo({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontSize: size,
        fontWeight: 600,
        letterSpacing: "0.01em",
        color: "var(--rc-gris-900)",
      }}
    >
      <Clapperboard size={size + 2} strokeWidth={1.75} color="var(--rc-azul-texto)" aria-hidden="true" />
      <span>RConcept</span>
    </span>
  );
}
