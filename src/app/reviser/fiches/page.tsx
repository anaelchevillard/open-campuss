import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { CardBrowser } from "@/components/revise/card-browser";
import { DeckList } from "@/components/revise/deck-list";
import { MemoryPanel } from "@/components/revise/memory-panel";
import { ReviseTabs, Section } from "@/components/revise/revise-parts";
import { Shell } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { requireUser } from "@/lib/auth";
import { fichesOverview, recentCourses } from "@/lib/fiches-data";
import { IconAdd } from "@/lib/icons";
import { parseScope } from "@/lib/memo-pack-rules";
import { featureOn } from "@/lib/site-settings";

export const metadata: Metadata = { title: "Fiches" };

/**
 * Fiches : ma mémoire, mes paquets avec un bouton Réviser chacun, puis toutes mes fiches
 * (ou celles d'un paquet, ?paquet=) à chercher, filtrer, modifier, mettre de côté.
 */
export default async function CardsPage({ searchParams }: PageProps<"/reviser/fiches">) {
  const user = await requireUser();
  const params = await searchParams;
  const now = new Date();
  const [{ cards, decks, stats, truncated }, courses, ranking] = await Promise.all([fichesOverview(user, now), recentCourses(user), featureOn("ranking")]);
  const wanted = parseScope(params.paquet);
  const deck = decks.find((d) => d.scope === wanted) ?? null;
  const waiting = stats.due + stats.fresh;
  return (
    <Shell user={user}>
      <PageHeader
        title="Réviser"
        shortTitle="Fiches"
        tabs={<ReviseTabs value="cards" ranking={ranking} due={stats.due + stats.fresh} />}
        action={(
          <div className="flex flex-wrap gap-2">
            <Link href="/reviser/fiches/importer" data-slot="button" className={buttonVariants({ variant: "ghost" })}>Importer</Link>
            <Link href="/reviser/fiches/paquets" data-slot="button" className={buttonVariants({ variant: "outline" })}>Paquets de la promo</Link>
            <Link href="/reviser/fiches/nouveau" data-slot="button" className={buttonVariants({ variant: waiting ? "outline" : "default" })}><Icon icon={IconAdd} size={16} />Créer des fiches</Link>
            {waiting > 0 && <Link href="/reviser/seance?mode=fiches" data-slot="button" className={buttonVariants()}>Réviser<span className="tabular-nums opacity-80">{waiting}</span></Link>}
          </div>
        )}
      />
      <div className="grid gap-10 pb-28 md:pb-8">
        {cards.length > 0 && <MemoryPanel stats={stats} now={now} />}
        {decks.length > 0 && (
          <Section title="Mes paquets" action={<span className="text-sm text-muted-foreground">Un paquet par cours, à réviser ou partager</span>}>
            <DeckList decks={decks} current={deck?.scope ?? null} />
          </Section>
        )}
        <CardBrowser key={deck?.scope ?? "all"} cards={cards} courses={courses} deck={deck ? { scope: deck.scope, title: deck.title } : null} />
        {truncated && <p className="text-sm text-muted-foreground">Seules tes 2 000 fiches les plus récentes sont affichées ici ; toutes restent dans tes révisions.</p>}
      </div>
    </Shell>
  );
}
