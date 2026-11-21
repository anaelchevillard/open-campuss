import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { ProgramPicker } from "@/components/admin/program-picker";
import { PageHeader } from "@/components/page-header";
import { listPrograms } from "@/lib/catalog";

/** En-tête d'une page racine de l'administration (À traiter) : titre et sélecteur de licence. */
export async function AdminHeaderSimple({ title, action }: { title: string; action?: ReactNode }) {
  const programs = await listPrograms();
  const raw = Number((await cookies()).get("campuss-admin-licence")?.value);
  return <PageHeader title={title} action={<>{programs.length > 1 && <ProgramPicker programs={programs.map((p) => ({ id: p.id, name: p.name }))} value={raw > 0 ? raw : null} />}{action}</>} />;
}
