import type { NextConfig } from "next";

// Las llamadas a /api/* las reenvia en ejecucion app/api/[...path]/route.ts hacia la API en Go
// (BACKEND_URL en Vercel; localhost:8310 en local). No se usa rewrites(): se evalua al compilar.
const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
};

export default nextConfig;
