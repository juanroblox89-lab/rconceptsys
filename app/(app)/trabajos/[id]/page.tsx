import { notFound } from "next/navigation";
import { PaginaTrabajo } from "@/components/PaginaTrabajo";

export default async function Trabajo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ desde?: string; origen?: string; persona?: string; pedir?: string }> }) {
  const [{ id }, { desde, origen, persona, pedir }] = await Promise.all([params, searchParams]);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();
  const procedencia = typeof desde === "string" ? desde : typeof origen === "string" ? origen : undefined;
  return <PaginaTrabajo key={`${id}:${pedir === "1"}`} id={Number(id)} origen={procedencia} persona={typeof persona === "string" ? persona : undefined} pedir={pedir === "1"} />;
}
