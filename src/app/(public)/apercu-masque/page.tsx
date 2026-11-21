import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { Shell } from "@/components/shell";
import { currentUser } from "@/lib/auth";
import { IconHidden } from "@/lib/icons";
import { HOME } from "@/lib/home";

export const metadata: Metadata = { title: "Masqué en aperçu" };

/** Pendant un « voir comme », les espaces privés de la personne (révision, amis, notes, paramètres) ne s'affichent pas. */
export default async function HiddenInPreview() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.viewing) redirect(HOME);
  return (
    <Shell user={user}>
      <EmptyState icon={IconHidden} title="Masqué en aperçu" description="Cet espace reste privé, même pour l’équipe." className="mx-auto mt-12 max-w-md" />
    </Shell>
  );
}
