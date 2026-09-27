import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";

export const metadata: Metadata = {
  title: {
    default: "RConcept Systems",
    template: "%s · RConcept Systems",
  },
  description: "Sistema operativo interno de Rohlfing Concept.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

const sidebarScript = `(function(){try{var s=localStorage.getItem("rc-sidebar");if(s==="hidden"){document.documentElement.dataset.sidebar="closed";}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: sidebarScript }} />
      </head>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
