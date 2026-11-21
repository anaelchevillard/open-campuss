"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Deck } from "@/lib/fiches-data";
import { IconAdd, IconCards, IconFriends, IconMore, IconRedo, IconShare } from "@/lib/icons";
import { FREE_SCOPE } from "@/lib/memo-pack-rules";
import { deckSummary } from "@/lib/memo-stats";
import { PackShareForm } from "./packs";
import { PublishInvite } from "./publish-invite";

const sessionHref = (scope: string, extra = "") => `/reviser/seance?mode=fiches&paquet=${scope}${extra}`;

/** Mes paquets : un par cours (et les fiches libres), avec ce qu'il y a à revoir, la maîtrise et un bouton Réviser. */
export function DeckList({ decks, current }: { decks: Deck[]; current: string | null }) {
  const [sharing, setSharing] = useState<Deck | null>(null);
  const [publishing, setPublishing] = useState<Deck | null>(null);
  return (
    <>
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {decks.map((deck) => {
          const waiting = deck.stats.due + deck.stats.fresh;
          const shared = deck.pack?.removedAt ? "retiré" : deck.pack?.public ? "public" : deck.pack?.friends ? "amis" : "";
          return (
            <li key={deck.scope} data-deck={deck.scope} aria-current={current === deck.scope || undefined} className="grid min-w-0 gap-3 rounded-xl bg-card p-4 shadow-xs aria-[current]:ring-2 aria-[current]:ring-ring/40">
              <div className="flex min-w-0 items-start gap-3">
                <Icon icon={IconCards} className="mt-0.5 shrink-0 text-muted-foreground" />
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <Link href={`/reviser/fiches?paquet=${deck.scope}#mes-fiches`} scroll={false} className="truncate font-semibold underline-offset-2 hover:underline">{deck.title}</Link>
                  <span className="truncate text-sm text-muted-foreground tabular-nums">{deckSummary(deck.stats)}{shared && <> · <span className="text-foreground">{shared === "public" ? "publié" : shared === "amis" ? "partagé aux amis" : "retiré par la modération"}</span></>}</span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Plus d’actions pour ${deck.title}`} className="-mt-1 -mr-1 shrink-0 coarse:size-11"><Icon icon={IconMore} size={20} /></Button>} />
                  <DropdownMenuContent align="end" className="min-w-56">
                    <DropdownMenuItem render={<Link href={sessionHref(deck.scope, waiting ? "&sens=inverse" : "&tout=1&sens=inverse")} />}><Icon icon={IconRedo} size={16} />Réviser en sens inversé</DropdownMenuItem>
                    {waiting > 0 && <DropdownMenuItem render={<Link href={sessionHref(deck.scope, "&tout=1")} />}><Icon icon={IconCards} size={16} />Tout réviser, même en avance</DropdownMenuItem>}
                    <DropdownMenuItem render={<Link href={deck.scope === FREE_SCOPE ? "/reviser/fiches?nouvelle=1" : `/reviser/fiches/nouveau?cours=${deck.scope}`} />}><Icon icon={IconAdd} size={16} />Ajouter des fiches</DropdownMenuItem>
                    {!deck.pack?.public && !deck.pack?.removedAt && <DropdownMenuItem onClick={() => setPublishing(deck)}><Icon icon={IconFriends} size={16} />Publier pour ma promo…</DropdownMenuItem>}
                    <DropdownMenuItem onClick={() => setSharing(deck)}><Icon icon={IconShare} size={16} />Partager…</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center gap-3">
                <span className="grid min-w-0 flex-1 gap-1">
                  <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden><span className="block h-full origin-left rounded-full bg-success motion-ok:animate-[grow_600ms_var(--ease-out)_both]" style={{ width: `${deck.mastery}%` }} /></span>
                  <span className="text-xs text-muted-foreground tabular-nums">{deck.mastery} % acquises</span>
                </span>
                {waiting > 0
                  ? <Link href={sessionHref(deck.scope)} data-slot="button" className={buttonVariants({ size: "sm" })} aria-label={`Réviser ${deck.title} (${waiting})`}>Réviser<span className="tabular-nums opacity-80">{waiting}</span></Link>
                  : <Link href={sessionHref(deck.scope, "&tout=1")} data-slot="button" className={buttonVariants({ variant: "outline", size: "sm" })} aria-label={`Réviser ${deck.title} en avance`}>En avance</Link>}
              </div>
            </li>
          );
        })}
      </ul>
      {/* Publier depuis le paquet, en un geste, avec l'aperçu de ce qui sera public */}
      <ResponsiveSheet open={Boolean(publishing)} onOpenChange={(open) => { if (!open) setPublishing(null); }} title={publishing ? `Publier « ${publishing.title} »` : "Publier"} description="Ta promo pourra réviser ce paquet et le copier dans ses fiches.">
        {publishing && <div className="pb-4"><PublishInvite key={publishing.scope} scope={publishing.scope} force /></div>}
      </ResponsiveSheet>
      <ResponsiveSheet open={Boolean(sharing)} onOpenChange={(open) => { if (!open) setSharing(null); }} title={sharing ? `Partager « ${sharing.title} »` : "Partager"} description="Tes amis ou les étudiants de ta licence pourront voir ce paquet et le copier dans leurs fiches.">
        {sharing && <PackShareForm key={sharing.scope} scope={sharing.scope} pack={sharing.pack} />}
      </ResponsiveSheet>
    </>
  );
}
