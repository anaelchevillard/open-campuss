"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { startNotes } from "@/app/actions/notes";
import { followSubject } from "@/app/actions/people";
import { useCreateSheet } from "@/components/create-sheet";
import { DocFilters, type FilterMenu, type FilterOption } from "@/components/doc-filters";
import { Hint } from "@/components/hint";
import { Icon } from "@/components/icon";
import { ResponsiveMenu } from "@/components/responsive-menu";
import { Button, buttonVariants } from "@/components/ui/button";
import { IconAdd, IconDone, IconMore, IconNote, IconNotifications, IconRevise } from "@/lib/icons";
import { toast, toastError } from "@/lib/toast";

/** Une action pleine (Réviser), « Ajouter un cours » sur ordinateur (le + s'en charge au téléphone), le rare dans « … ». */
export function SubjectActions({ subjectId, following = false }: { subjectId: number; following?: boolean }) {
  const sheet = useCreateSheet();
  const [pending, start] = useTransition();
  const [followed, setFollowed] = useState(following);
  const follow = async () => {
    const next = !followed;
    setFollowed(next);
    const result = await followSubject(subjectId, next);
    if (!result.ok) { setFollowed(!next); toastError(result.error); } else toast(next ? "Abonné : les nouveaux cours de la matière arriveront dans tes notifications" : "Abonnement retiré");
  };
  const notes = () => start(async () => { const form = new FormData(); form.set("subject", String(subjectId)); await startNotes(form); });
  return (
    <>
      <ResponsiveMenu title="Actions de la matière" items={[
        { label: "Démarrer les notes de ce CM", icon: IconNote, onSelect: notes },
        { label: followed ? "Se désabonner de la matière" : "S’abonner aux nouveaux cours", icon: followed ? IconDone : IconNotifications, onSelect: () => void follow() },
      ]}
        trigger={<Button variant="ghost" size="icon" aria-label="Plus d’actions" pending={pending}><Icon icon={IconMore} /></Button>} />
      <Button variant="outline" className="hidden lg:inline-flex" onClick={sheet.open}><Icon icon={IconAdd} />Ajouter un cours</Button>
      <Link href={`/reviser/seance?matiere=${subjectId}`} data-slot="button" className={buttonVariants()}><Icon icon={IconRevise} />Réviser</Link>
    </>
  );
}

/** Les filtres de la matière, avec l'astuce Favoris à la première visite d'une matière. */
export function SubjectFilters({ types, selected, fallback, menus, sort, hints }: { types: FilterOption[]; selected: string | null; fallback: string | null; menus: FilterMenu[]; sort: FilterMenu; hints: string[] | undefined }) {
  const hint = (chip: ReactNode) => (
    <Hint id="favoris-filtre" text="Tes cours étoilés, en un toucher" seen={hints}><span className="inline-flex shrink-0">{chip}</span></Hint>
  );
  return <DocFilters types={types} requiredType={selected ? { selected, fallback: fallback ?? selected } : undefined} favorites menus={menus} sort={sort} favoriteHint={hint} />;
}
