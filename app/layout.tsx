import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./estilo/tokens.css";
import "./estilo/base.css";
import "./estilo/componentes.css";
import "./globals.css";
import { Definiciones } from "@/components/Definiciones";
import { ProveedorAvisos } from "@/components/ui/Aviso";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RConcept Systems",
  description: "Sistema interno de Rohlfing Concept.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#ECEEF3",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <head>
        <meta name="theme-color" content="#ECEEF3" />
      </head>
      <body>
        <Definiciones />
        <ProveedorAvisos>{children}</ProveedorAvisos>
      </body>
    </html>
  );
}
