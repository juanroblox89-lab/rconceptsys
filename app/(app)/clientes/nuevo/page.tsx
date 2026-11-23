import { PaginaCliente } from "@/components/PaginaCliente";

export default async function NuevoCliente({ searchParams }: { searchParams: Promise<{ desde?: string }> }) {
  const { desde } = await searchParams;
  return <PaginaCliente editar admin={desde === "admin"} />;
}
