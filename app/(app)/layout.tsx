import { AppShell } from "@/components/AppShell";

// Layout persistente: el AppShell se monta una sola vez para todas las rutas
// privadas; al navegar solo cambia {children}.
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
