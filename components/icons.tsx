/** Iconos SVG de trazo (stroke 1.75, 18px), sin dependencias. */

interface IconProps {
  size?: number;
}

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: false,
  } as const;
}

export function IconInicio({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}

export function IconProduccion({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18" />
      <path d="m10 12.5 4.5 2.5L10 17.5z" />
    </svg>
  );
}

export function IconCobros({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="12" cy="14.5" r="2" />
    </svg>
  );
}

export function IconClientes({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 20v-1a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v1" />
      <circle cx="12" cy="8.5" r="3.5" />
    </svg>
  );
}

export function IconVentas({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 3v18h18" />
      <path d="m7 14 4-4 3 3 5-6" />
    </svg>
  );
}

export function IconBiblioteca({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 19a2 2 0 0 0 2 2h13" />
      <path d="M9 7h6" />
    </svg>
  );
}

export function IconEquipo({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3.5 20v-1a5 5 0 0 1 5-5h1" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 14.5h1a4 4 0 0 1 4 4v1" />
    </svg>
  );
}

export function IconPerfil({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 18.5a5.5 5.5 0 0 1 11 0" />
    </svg>
  );
}

export function IconMenu({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

export function IconClose({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

export function IconTareas({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M9 6h11" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
      <path d="m3.5 6 1 1 2-2" />
      <path d="m3.5 12 1 1 2-2" />
      <path d="m3.5 18 1 1 2-2" />
    </svg>
  );
}

export function IconRevision({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

export function IconBell({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

const ICONS: Record<string, (props: IconProps) => React.ReactElement> = {
  inicio: IconInicio,
  produccion: IconProduccion,
  "mis-tareas": IconTareas,
  revision: IconRevision,
  cobros: IconCobros,
  clientes: IconClientes,
  ventas: IconVentas,
  biblioteca: IconBiblioteca,
  equipo: IconEquipo,
  "mi-perfil": IconPerfil,
};

export function ModuleIcon({ id, size = 18 }: { id: string; size?: number }) {
  const Cmp = ICONS[id] ?? IconInicio;
  return <Cmp size={size} />;
}
