import { notFound } from "next/navigation";
import { PaginaTrabajo } from "@/components/PaginaTrabajo";

export default async function Trabajo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ desde?: string; persona?: string }> }) {
  const [{ id }, { desde, persona }] = await Promise.all([params, searchParams]);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();
  return <PaginaTrabajo id={Number(id)} origen={typeof desde === "string" ? desde : undefined} persona={typeof persona === "string" ? persona : undefined} />;
}
