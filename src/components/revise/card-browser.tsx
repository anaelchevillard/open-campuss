"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useDeferredValue, useState } from "react";
import { removeCard, restoreCard, setCardSuspended } from "@/app/actions/study";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { BrowserCard } from "@/lib/fiches-data";
import { IconAdd, IconArchive, IconCards, IconClose, IconDelete, IconEdit, IconMore, IconRestore, IconSearch } from "@/lib/icons";
import { EASE_OUT } from "@/lib/motion";
import type { CardFilter, CardStatus } from "@/lib/memo-stats";
import { toastError, toastUndo } from "@/lib/toast";
import { EditCardForm, NewCardForm } from "./card-editor";
import { CardText } from "./card-text";

const STATUS_LABEL: Record<CardStatus, string> = { new: "nouvelle", learning: "en apprentissage", young: "jeune", mature: "acquise", suspended: "de côté" };

const FILTERS: { value: CardFilter; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "due", label: "À revoir" },
  { value: "new", label: "Nouvelles" },
  { value: "mature", label: "Acquises" },
  { value: "suspended", label: "De côté" },
];

function matches(card: BrowserCard, filter: CardFilter) {
  if (filter === "all") return true;
  if (filter === "due") return card.due;
  return card.status === filter;
}

/**
 * Toutes mes fiches (ou celles d'un paquet) : recherche instantanée, filtre par état, modification en feuille,
 * mise de côté et retrait annulables. ?nouvelle=1 ouvre la création.
 */
export function CardBrowser({ cards: initial, courses, deck }: { cards: BrowserCard[]; courses: { id: string; title: string }[]; deck: { scope: string; title: string } | null }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Changements locaux (retrait, modification, mise de côté) posés sur la liste du serveur ; effacés quand elle se recharge
  const [hidden, setHidden] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Partial<BrowserCard>>>({});
  const [source, setSource] = useState(initial);
  if (source !== initial) { setSource(initial); setHidden([]); setOverrides({}); }
  const cards = initial.filter((c) => !hidden.includes(c.id)).map((c) => (overrides[c.id] ? { ...c, ...overrides[c.id] } : c));
  const [creating, setCreating] = useState(params.get("nouvelle") === "1");
  const [editing, setEditing] = useState<BrowserCard | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CardFilter>("all");
  const deferred = useDeferredValue(query);
  const reduce = useReducedMotion();
  const needle = deferred.trim().toLocaleLowerCase("fr");
  const inDeck = deck ? cards.filter((c) => c.scope === deck.scope) : cards;
  const shown = inDeck.filter((c) => matches(c, filter) && (!needle || `${c.front} ${c.back} ${c.doc ?? ""}`.toLocaleLowerCase("fr").includes(needle)));
  const patch = useCallback((id: string, change: Partial<BrowserCard>) => setOverrides((all) => ({ ...all, [id]: { ...all[id], ...change } })), []);

  const closeCreate = (next: boolean) => {
    setCreating(next);
    if (!next) {
      if (params.get("nouvelle")) router.replace(pathname + (deck ? `?paquet=${deck.scope}` : ""), { scroll: false });
      router.refresh();
    }
  };
  const remove = async (card: BrowserCard) => {
    setHidden((all) => [...all, card.id]);
    const saved = await removeCard(card.id).catch(() => null);
    if (!saved) { setHidden((all) => all.filter((id) => id !== card.id)); toastError("La fiche n’a pas pu être retirée"); return; }
    toastUndo("Fiche retirée", () => { void restoreCard(saved).then(() => router.refresh()); });
  };
  const suspend = async (card: BrowserCard, on: boolean) => {
    const before = card.status;
    patch(card.id, { status: on ? "suspended" : "new", due: false });
    const result = await setCardSuspended(card.id, on).catch(() => ({ error: "Connexion perdue, réessaie." }));
    if ("error" in result) { patch(card.id, { status: before }); toastError(result.error); return; }
    // L'état exact (nouvelle, jeune, acquise…) d'une fiche reprise vient du serveur
    if (!on) router.refresh();
    else toastUndo("Fiche mise de côté", () => { void setCardSuspended(card.id, false).then(() => router.refresh()); });
  };
  const counts = Object.fromEntries(FILTERS.map((f) => [f.value, inDeck.filter((c) => matches(c, f.value)).length])) as Record<CardFilter, number>;

  return (
    <section id="mes-fiches" aria-labelledby="mes-fiches-title" className="grid scroll-mt-24 gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="mes-fiches-title" className="heading mr-auto">Mes fiches</h2>
        <Button variant="outline" onClick={() => setCreating(true)}><Icon icon={IconAdd} size={16} />Nouvelle fiche</Button>
      </div>
      {deck && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Paquet</span>
          <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted py-0.5 ps-3 pe-1 font-semibold">
            <span className="truncate">{deck.title}</span>
            <Link href="/reviser/fiches#mes-fiches" scroll={false} aria-label="Voir toutes les fiches" className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"><Icon icon={IconClose} size={16} /></Link>
          </span>
        </p>
      )}
      {cards.length === 0 ? (
        <EmptyState icon={IconCards} title="Aucune fiche pour l’instant" description="Choisis un cours : Campuss IA peut les écrire, ou fais-les toi-même" action={<Link href="/reviser/fiches/nouveau" data-slot="button" className={buttonVariants()}>Créer des fiches</Link>} />
      ) : (
        <>
          <div className="grid gap-3 md:flex md:flex-wrap md:items-center">
            <div className="relative min-w-0 md:w-72">
              <Icon icon={IconSearch} size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher" aria-label="Rechercher une fiche" className="pl-9" />
            </div>
            <ToggleGroup aria-label="Filtrer les fiches" value={[filter]} onValueChange={(v: string[]) => setFilter((v[0] as CardFilter) ?? "all")} className="-mx-1 flex max-w-full justify-start gap-1 overflow-x-auto px-1 pb-1">
              {FILTERS.map((f) => (
                <ToggleGroupItem key={f.value} value={f.value} variant="outline" size="sm" className="shrink-0">{f.label}<span className="tabular-nums text-muted-foreground">{counts[f.value]}</span></ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <p className="sr-only" aria-live="polite">{shown.length} {shown.length > 1 ? "fiches" : "fiche"}</p>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <AnimatePresence initial={false}>
              {shown.map((card, index) => (
                <motion.li
                  key={card.id} layout={!reduce} initial={{ opacity: 0, y: reduce ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: Math.min(index, 8) * 0.03, duration: 0.25, ease: EASE_OUT } }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  className="group grid min-w-0 content-start gap-2 rounded-xl bg-card p-4 shadow-xs data-[suspended]:opacity-70" data-suspended={card.status === "suspended" || undefined}
                >
                  <div className="flex items-start gap-1">
                    <CardText text={card.front} className="min-w-0 flex-1 font-semibold text-pretty" />
                    <Button variant="ghost" size="icon-sm" aria-label={`Modifier la fiche ${card.front.slice(0, 40)}`} onClick={() => setEditing(card)} className="-mt-1 shrink-0 text-muted-foreground coarse:size-11"><Icon icon={IconEdit} size={16} /></Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Plus d’actions pour ${card.front.slice(0, 40)}`} className="-mt-1 -mr-1 shrink-0 text-muted-foreground coarse:size-11"><Icon icon={IconMore} size={16} /></Button>} />
                      <DropdownMenuContent align="end" className="min-w-48">
                        {card.status === "suspended"
                          ? <DropdownMenuItem onClick={() => void suspend(card, false)}><Icon icon={IconRestore} size={16} />Reprendre la fiche</DropdownMenuItem>
                          : <DropdownMenuItem onClick={() => void suspend(card, true)}><Icon icon={IconArchive} size={16} />Mettre de côté</DropdownMenuItem>}
                        <DropdownMenuItem variant="destructive" onClick={() => void remove(card)}><Icon icon={IconDelete} size={16} />Retirer la fiche</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardText text={card.back} clamp className="text-sm text-pretty text-muted-foreground" />
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {card.due ? <span className="rounded-full bg-brand-tint px-2 py-0.5 font-semibold text-brand-text">à revoir</span> : <span className="rounded-full bg-muted px-2 py-0.5">{STATUS_LABEL[card.status]}</span>}
                    {!deck && card.doc && <span className="min-w-0 truncate">{card.doc}</span>}
                  </p>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {!shown.length && <p className="text-sm text-muted-foreground">{needle ? `Aucune fiche ne contient « ${deferred} »` : "Aucune fiche dans ce filtre"}</p>}
        </>
      )}
      <ResponsiveSheet open={creating} onOpenChange={closeCreate} title="Nouvelle fiche">
        <NewCardForm courses={courses} course={deck && deck.scope !== "libre" ? deck.scope : undefined} />
      </ResponsiveSheet>
      <ResponsiveSheet open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }} title="Modifier la fiche" description="Son historique de révision est gardé.">
        {editing && <EditCardForm key={editing.id} card={editing} onSaved={(text) => { patch(editing.id, text); setEditing(null); }} />}
      </ResponsiveSheet>
    </section>
  );
}
