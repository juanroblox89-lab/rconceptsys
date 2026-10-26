import { AppShell } from "@/components/AppShell";
import { ProveedorAvisos } from "@/components/ui/Aviso";

// Layout persistente: el AppShell se monta una sola vez para todas las rutas
// privadas con el ProveedorAvisos para notificaciones de vidrio.
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProveedorAvisos>
      <AppShell>{children}</AppShell>
    </ProveedorAvisos>
  );
}
