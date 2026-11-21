import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { moderatePack } from "@/app/actions/packs";
import { PageHeader } from "@/components/page-header";
import { CardText } from "@/components/revise/card-text";
import { CopyPackForm, ReportPackForm } from "@/components/revise/packs";
import { PublishInvite } from "@/components/revise/publish-invite";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { canModeratePack } from "@/lib/memo-pack-rules";
import { packCards, readablePack } from "@/lib/memo-packs";
import { shortName } from "@/lib/user-name-rules";
import { z } from "zod";

export const metadata: Metadata = { title: "Paquet de fiches" };

export default async function PackPage({ params }: PageProps<"/reviser/fiches/paquets/[id]">) {
  const user = await requireUser();
  const id = z.uuid().safeParse((await params).id);
  const pack = id.success ? await readablePack(user, id.data) : null;
  if (!pack) notFound();
  const [cards, [owner]] = await Promise.all([packCards(pack), db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, pack.ownerId))]);
  const mine = pack.ownerId === user.id;
  const moderator = !mine && canModeratePack(user, pack);
  const facts = [mine ? "Ton paquet" : `Par ${shortName(owner?.name ?? "Ancien compte")}`, `${cards.length} fiche${cards.length > 1 ? "s" : ""}`, pack.public ? `${pack.copies} copie${pack.copies > 1 ? "s" : ""}` : "", pack.removedAt ? "Retiré par la modération" : ""].filter(Boolean);
  return (
    <Shell user={user}>
      <PageHeader title={pack.title} lead={facts.join(" · ")} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <ol className="grid gap-3">
          {cards.map((card, index) => (
            <li key={index} className="grid gap-2 rounded-xl border bg-card p-4">
              <CardText text={card.front} className="font-semibold text-pretty" />
              <CardText text={card.back} className="text-pretty text-muted-foreground" />
            </li>
          ))}
        </ol>
        <aside className="grid content-start gap-4">
          {!mine && !pack.removedAt && <CopyPackForm id={pack.id} />}
          {mine && !pack.public && !pack.removedAt && <PublishInvite scope={pack.scope} force />}
          {!mine && pack.public && !pack.removedAt && <ReportPackForm id={pack.id} />}
          {moderator && pack.public && (
            <form action={moderatePack} className="grid gap-2">
              <input type="hidden" name="id" value={pack.id} />
              {pack.removedAt
                ? <Button type="submit" name="decision" value="restore" variant="outline">Rétablir le paquet</Button>
                : <Button type="submit" name="decision" value="remove" variant="destructive">Retirer de la bibliothèque</Button>}
            </form>
          )}
        </aside>
      </div>
    </Shell>
  );
}
