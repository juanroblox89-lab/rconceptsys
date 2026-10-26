import React from "react";

/**
 * Filtro de refracción SVG para liquid glass y símbolos de iconos / avatares del sistema RC-Kit.
 * Se monta una sola vez en el layout raíz de la aplicación.
 */
export function Definiciones() {
  return (
    <svg className="rc-svg-defs" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter
          id="rc-refraccion"
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.045"
            numOctaves={2}
            seed={7}
            result="ruido"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="ruido"
            scale={8}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>

      {/* ICONOS v1 (Lucide / Feather 24x24) */}
      <symbol id="rc-ico-papelera" viewBox="0 0 24 24">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
      </symbol>

      <symbol id="rc-ico-cuadricula" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </symbol>

      <symbol id="rc-ico-chevron-der" viewBox="0 0 24 24">
        <polyline points="9 18 15 12 9 6" />
      </symbol>

      <symbol id="rc-ico-chevron-abajo" viewBox="0 0 24 24">
        <polyline points="6 9 12 15 18 9" />
      </symbol>

      <symbol id="rc-ico-ajustes" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </symbol>

      <symbol id="rc-ico-buscar" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </symbol>

      <symbol id="rc-ico-correo" viewBox="0 0 24 24">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22 6 12 13 2 6" />
      </symbol>

      <symbol id="rc-ico-check" viewBox="0 0 24 24">
        <polyline points="20 6 9 17 4 12" />
      </symbol>

      <symbol id="rc-ico-campana" viewBox="0 0 24 24">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </symbol>

      <symbol id="rc-ico-imagen" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </symbol>

      <symbol id="rc-ico-usuario" viewBox="0 0 24 24">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </symbol>

      <symbol id="rc-ico-mas" viewBox="0 0 24 24">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </symbol>

      <symbol id="rc-ico-mas-vert" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        <circle cx="12" cy="5" r="1.5" fill="currentColor" />
        <circle cx="12" cy="19" r="1.5" fill="currentColor" />
      </symbol>

      <symbol id="rc-ico-inicio" viewBox="0 0 24 24">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </symbol>

      <symbol id="rc-ico-carpeta" viewBox="0 0 24 24">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </symbol>

      <symbol id="rc-ico-tareas" viewBox="0 0 24 24">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </symbol>

      <symbol id="rc-ico-calendario" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </symbol>

      <symbol id="rc-ico-archivo" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </symbol>

      <symbol id="rc-ico-clip" viewBox="0 0 24 24">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
      </symbol>

      <symbol id="rc-ico-enviar" viewBox="0 0 24 24">
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </symbol>

      {/* ICONOS v2 ORIGINALES (-v2) */}
      <symbol id="rc-ico-check-v2" viewBox="0 0 16 16">
        <path d="M3.5 8.2l3 3 6-6.4" />
      </symbol>

      <symbol id="rc-ico-cerrar-v2" viewBox="0 0 16 16">
        <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" />
      </symbol>

      <symbol id="rc-ico-info-v2" viewBox="0 0 16 16">
        <path d="M8 7.2v4.2M8 4.6h.01" />
      </symbol>

      <symbol id="rc-ico-alerta-v2" viewBox="0 0 16 16">
        <path d="M8 2.5L1.8 13h12.4L8 2.5zM8 6.5v3.2M8 11.4h.01" />
      </symbol>

      <symbol id="rc-ico-editar-v2" viewBox="0 0 16 16">
        <path d="M11.2 2.5l2.3 2.3-7.8 7.8-2.9.6.6-2.9 7.8-7.8z" />
      </symbol>

      <symbol id="rc-ico-cursor-v2" viewBox="0 0 16 16">
        <path
          d="M6.5 2.5v6.8l-1.6-1.2a1 1 0 0 0-1.4.2c-.3.4-.2 1 .1 1.3l3.6 3.6c.5.5 1.1.8 1.8.8h2.5c1.1 0 2-.9 2-2V7.8c0-.6-.5-1-1-1-.3 0-.5.1-.7.3-.1-.5-.5-.8-1-.8-.3 0-.6.1-.8.3-.1-.5-.5-.8-1-.8-.2 0-.4.1-.5.2V2.5a1 1 0 0 0-2 0z"
          fill="#FFFFFF"
          stroke="#1F2430"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </symbol>

      <symbol id="rc-ico-ordenar-v2" viewBox="0 0 16 16">
        <path d="M3 5h10M5 8h6M7 11h2" />
      </symbol>

      <symbol id="rc-ico-chevron-der-v2" viewBox="0 0 16 16">
        <path d="M6 3.5L10.5 8 6 12.5" />
      </symbol>

      <symbol id="rc-ico-mas-vert-v2" viewBox="0 0 16 16">
        <circle cx="8" cy="3.5" r="0.9" fill="currentColor" />
        <circle cx="8" cy="8" r="0.9" fill="currentColor" />
        <circle cx="8" cy="12.5" r="0.9" fill="currentColor" />
      </symbol>

      <symbol id="rc-ico-ajustes-v2" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="2.2" />
        <path d="M8 1.8v1.4M8 12.8v1.4M3.6 3.6l1 1M11.4 11.4l1 1M1.8 8h1.4M12.8 8h1.4M3.6 12.4l1-1M11.4 4.6l1-1" />
      </symbol>

      {/* AVATARES ILUSTRADOS (40x40) */}
      <symbol id="rc-ava-mujer-1" viewBox="0 0 40 40">
        <defs>
          <linearGradient id="rc-grad-m1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#D9E2EC" />
            <stop offset="100%" stopColor="#BCCCDC" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" fill="url(#rc-grad-m1)" />
        <path d="M10 18c0-6.5 4.2-11 10-11s10 4.5 10 11v12H10V18z" fill="#3B2820" />
        <path d="M9 38c1.5-6.5 5.5-9.5 11-9.5s9.5 3 11 9.5" fill="#2B3445" />
        <circle cx="20" cy="18" r="6.8" fill="#F2C6AC" />
        <path d="M13 16c1.5-4.5 5-6 8.5-5.5 2.8.4 4.8 2.5 5.5 5.5-2-1.8-4.5-2.5-7-2.2-3 .3-5.2 1.2-7 2.2z" fill="#3B2820" />
        <circle cx="17.6" cy="18" r="0.8" fill="#2B2118" />
        <circle cx="22.4" cy="18" r="0.8" fill="#2B2118" />
        <path d="M18.2 21.2c1.1.8 2.5.8 3.6 0" stroke="#BA6E5A" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      </symbol>

      <symbol id="rc-ava-hombre-1" viewBox="0 0 40 40">
        <defs>
          <linearGradient id="rc-grad-h1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E2E8F0" />
            <stop offset="100%" stopColor="#CBD5E1" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" fill="url(#rc-grad-h1)" />
        <path d="M8 39c1.8-7 6.2-10 12-10s10.2 3 12 10" fill="#475569" />
        <path d="M15 29l5 5 5-5" fill="#F8FAFC" />
        <circle cx="20" cy="17.5" r="7" fill="#E8B99B" />
        <path d="M13 15.5c0-4.5 3.2-7.2 7-7.2s7 2.7 7 7.2c-1.5-2-3.8-3-7-3s-5.5 1-7 3z" fill="#27201C" />
        <circle cx="17.5" cy="17.5" r="0.85" fill="#1E293B" />
        <circle cx="22.5" cy="17.5" r="0.85" fill="#1E293B" />
        <path d="M15.2 20.5c1 2.5 3 3.5 4.8 3.5s3.8-1 4.8-3.5" stroke="#4A3B32" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </symbol>

      <symbol id="rc-ava-mujer-2" viewBox="0 0 40 40">
        <rect width="40" height="40" fill="#DDE7F0" />
        <path d="M10 17c0-6 4.5-10.5 10-10.5S30 11 30 17v13H10V17z" fill="#5A3825" />
        <path d="M9 39c1.8-6.5 5.8-9.5 11-9.5s9.2 3 11 9.5" fill="#334E68" />
        <circle cx="20" cy="18" r="6.6" fill="#F4CBB2" />
        <path d="M13.4 15.5c2-3.8 5.2-5 8.6-4.5 2.5.4 4.2 2 4.8 4.5-2.2-1.5-4.8-2-7.2-1.8-2.8.2-4.6 1-6.2 1.8z" fill="#5A3825" />
        <circle cx="17.8" cy="18" r="0.8" fill="#1F2933" />
        <circle cx="22.2" cy="18" r="0.8" fill="#1F2933" />
        <path d="M18.4 21c1 .7 2.2.7 3.2 0" stroke="#C06C58" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      </symbol>
    </svg>
  );
}
