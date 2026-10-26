import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sistema de Diseño — Equipo de Producción de Contenido (RC-Kit)",
  description: "Catálogo vivo de componentes neumórficos y liquid glass.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function EstiloLayout({ children }: { children: React.ReactNode }) {
  return children;
}
