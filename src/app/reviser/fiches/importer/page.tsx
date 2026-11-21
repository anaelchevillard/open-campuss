import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { CardImporter } from "@/components/revise/card-importer";
import { CreateModeHeader } from "@/components/revise/create-mode";
import { Shell } from "@/components/shell";
import { canRead } from "@/lib/access-server";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { FREE_SCOPE, parseScope } from "@/lib/memo-pack-rules";
import { myPacks } from "@/lib/memo-packs";

export const metadata: Metadata = { title: "Importer des fiches" };

/** Importer des fiches : dans un de mes paquets, dans le cours demandé (?cours=) ou dans les fiches libres. */
export default async function ImportCardsPage({ searchParams }: PageProps<"/reviser/fiches/importer">) {
  const user = await requireUser();
  const params = await searchParams;
  const wanted = parseScope(params.cours ?? params.paquet);
  const packs = await myPacks(user.id);
  const destinations = packs.map((p) => ({ scope: p.scope, title: p.title }));
  if (!destinations.some((d) => d.scope === FREE_SCOPE)) destinations.push({ scope: FREE_SCOPE, title: "Fiches libres" });
  // Un cours demandé dans l'adresse n'est proposé que s'il est lisible : le serveur le revérifie à l'import
  if (wanted && wanted !== FREE_SCOPE && !destinations.some((d) => d.scope === wanted)) {
    const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, wanted));
    if (doc && !doc.deletedAt && (await canRead(user, doc))) destinations.unshift({ scope: doc.id, title: doc.title || "Sans titre" });
  }
  const initial = destinations.some((d) => d.scope === wanted) ? wanted! : destinations[0].scope;
  return (
    <Shell user={user}>
      <CreateModeHeader step={2} lead="Reprends tes fiches d’Anki, de Quizlet, d’un tableur ou d’un fichier JSON. Tu vois l’aperçu avant d’importer." />
      <CardImporter destinations={destinations} initial={initial} />
    </Shell>
  );
}
