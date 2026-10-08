import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RConcept Systems",
  description: "Sistema interno de Rohlfing Concept.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // En Android el teclado achica el contenido en vez de taparlo.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0f12" },
  ],
};

// Anti-flash: aplica tema y estado de la sidebar antes de pintar.
const initScript = `(function(){try{var t=localStorage.getItem("rc-theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;}if(localStorage.getItem("rc-sidebar")==="hidden"){document.documentElement.dataset.sidebar="closed";}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
