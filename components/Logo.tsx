/**
 * Logo de RConcept Systems (adaptado de marca/logo-icon.svg a monocromo:
 * lente en currentColor para el shell blanco y negro).
 */
export function LogoIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 150 150"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="translate(15, 30)">
        <rect
          x="0"
          y="15"
          width="120"
          height="85"
          rx="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
        />
        <path
          d="M 35 15 L 45 0 L 75 0 L 85 15 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinejoin="round"
        />
        <circle cx="100" cy="35" r="5" fill="currentColor" />
        <circle cx="60" cy="55" r="28" fill="none" stroke="currentColor" strokeWidth="8" />
        <polygon points="53,45 53,65 72,55" fill="currentColor" />
      </g>
    </svg>
  );
}

export function LogoLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        color: "inherit",
        lineHeight: 1.2,
      }}
    >
      <LogoIcon size={compact ? 24 : 28} />
      {!compact && (
        <span style={{ display: "flex", flexDirection: "column" }}>
          <strong style={{ fontSize: 14, letterSpacing: "-0.01em" }}>RConcept Systems</strong>
          <span style={{ fontSize: 11, color: "var(--c-text-2)" }}>Rohlfing Concept</span>
        </span>
      )}
    </span>
  );
}
