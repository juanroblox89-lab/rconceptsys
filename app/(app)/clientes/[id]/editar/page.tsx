import { notFound } from "next/navigation";
import { PaginaCliente } from "@/components/PaginaCliente";

export default async function EditarCliente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ desde?: string }> }) {
  const [{ id }, { desde }] = await Promise.all([params, searchParams]);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();
  return <PaginaCliente id={Number(id)} editar admin={desde === "admin"} />;
}
