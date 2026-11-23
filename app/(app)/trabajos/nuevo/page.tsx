import { PaginaTrabajo } from "@/components/PaginaTrabajo";

export default async function NuevoTrabajo({ searchParams }: { searchParams: Promise<{ desde?: string; persona?: string }> }) {
  const { desde, persona } = await searchParams;
  return <PaginaTrabajo origen={typeof desde === "string" ? desde : undefined} persona={typeof persona === "string" ? persona : undefined} />;
}
