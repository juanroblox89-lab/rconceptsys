import { Clapperboard } from "lucide-react";

/** Marca de RConcept Systems: ícono + nombre. Sin imágenes ni degradados. */
export function Logo({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: size, fontWeight: 600, letterSpacing: "0.01em" }}
    >
      <Clapperboard size={size + 2} strokeWidth={1.75} aria-hidden="true" />
      RConcept
    </span>
  );
}
