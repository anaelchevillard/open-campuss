import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { PromoPackList } from "@/components/revise/resources";
import { Section } from "@/components/revise/revise-parts";
import { Shell } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canRead } from "@/lib/access-server";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { IconCards, IconSearch } from "@/lib/icons";
import { friendPacks } from "@/lib/memo-packs";
import { promoPacks } from "@/lib/revise-resources";

export const metadata: Metadata = { title: "Paquets de la promo" };

/** Paquets de la promo : une ressource de Réviser, avec ses actions (Réviser, Copier), pas une liste de cours. */
export default async function PublicPacksPage({ searchParams }: PageProps<"/reviser/fiches/paquets">) {
  const user = await requireUser();
  const raw = (await searchParams).q;
  const query = typeof raw === "string" ? raw.slice(0, 80) : "";
  // ?cours= : les paquets des autres élèves pour un cours que je peux lire (choix « Voir les fiches des autres élèves »)
  const rawCourse = z.uuid().safeParse((await searchParams).cours);
  const [course] = rawCourse.success ? await db.select().from(schema.documents).where(eq(schema.documents.id, rawCourse.data)) : [];
  const forCourse = course && !course.deletedAt && (await canRead(user, course)) ? course : null;
  const [allLibrary, shared] = await Promise.all([promoPacks(user, 60, query, forCourse?.id), query ? Promise.resolve([]) : friendPacks(user, forCourse?.id)]);
  // Un paquet déjà montré dans « Partagés par mes amis » ne revient pas dans la bibliothèque
  const sharedIds = new Set(shared.map((row) => row.pack.id));
  const library = allLibrary.filter((row) => !sharedIds.has(row.pack.id));
  return (
    <Shell user={user}>
      <PageHeader
        title={forCourse ? "Fiches des autres élèves" : "Paquets de la promo"}
        lead={forCourse ? <>Les paquets publiés pour « {forCourse.title || "Sans titre"} » : copie-les dans tes fiches pour les réviser. <Link href="/reviser/fiches/paquets" className="text-link hover:underline">Tous les paquets</Link></> : "Les fiches publiées par les étudiants de ta licence : révise-les en un clic ou copie-les dans les tiennes."}
      />
      <form className="relative mb-8 sm:max-w-sm" role="search">
        {forCourse && <input type="hidden" name="cours" value={forCourse.id} />}
        <Icon icon={IconSearch} size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" name="q" defaultValue={query} placeholder="Rechercher un paquet" aria-label="Rechercher un paquet" className="pl-9" />
      </form>
      <div className="grid gap-10">
        {shared.length > 0 && <Section title="Partagés par mes amis"><PromoPackList rows={shared.filter((row) => row.pack.ownerId !== user.id)} /></Section>}
        <Section title={query ? `Résultats pour « ${query} »` : "Publiés dans ta licence"}>
          {library.length ? <PromoPackList rows={library} /> : <EmptyState icon={IconCards} title={query ? "Aucun paquet trouvé" : shared.length ? "Pas d’autre paquet publié pour l’instant" : forCourse ? "Personne n’a encore publié de fiches pour ce cours" : "Aucun paquet publié pour l’instant"} description={forCourse ? "Fais les tiennes, puis publie-les depuis Fiches › Mes paquets" : "Publie un de tes paquets depuis Fiches › Mes paquets"} action={forCourse ? <Link href={`/reviser/fiches/nouveau?cours=${forCourse.id}`} data-slot="button" className={buttonVariants({ variant: "outline" })}>Faire mes fiches</Link> : undefined} />}
        </Section>
      </div>
    </Shell>
  );
}
