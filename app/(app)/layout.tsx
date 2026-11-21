import { AppShell } from "@/components/AppShell";
import { BarreraCelular } from "@/components/BarreraCelular";
import { ProveedorAvisos } from "@/components/ui/Aviso";

// Layout persistente: el AppShell se monta una sola vez para todas las rutas
// privadas con el ProveedorAvisos para notificaciones de vidrio.
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProveedorAvisos>
      <BarreraCelular><AppShell>{children}</AppShell></BarreraCelular>
    </ProveedorAvisos>
  );
}
