import type { Metadata } from "next";
import { NewDraft } from "@/components/import/new-draft";
import { Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Nouveau document" };

const DEPARTS = new Set(["photo", "notion", "google", "fichier"]);

/** Aucun champ à remplir d'abord : le brouillon se crée à l'arrivée et s'ouvre sur sa page finale, avec son départ (`?depart=`). */
export default async function NewCoursePage({ searchParams }: PageProps<"/contribuer/nouveau">) {
  const user = await requireUser();
  const { matiere, importer, partage, depart } = await searchParams;
  const start = typeof depart === "string" && DEPARTS.has(depart) ? depart : importer === "1" ? "fichier" : null;
  return (
    <Shell user={user} width="reading">
      <NewDraft subject={typeof matiere === "string" ? matiere : null} depart={start} shared={partage === "1"} />
    </Shell>
  );
}
