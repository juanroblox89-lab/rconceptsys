import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        // En Vercel el servicio "api" llega por BACKEND_URL (binding de vercel.json); en local, el Go en 8310.
        destination: `${(process.env.BACKEND_URL || "http://localhost:8310").replace(/\/+$/, "")}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
