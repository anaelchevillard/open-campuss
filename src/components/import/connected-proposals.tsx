"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { draftFromItem, ignoreItems } from "@/app/actions/connected";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { toastError, toastUndo } from "@/lib/toast";
import type { Provider } from "./import-jobs";
import { PROVIDER_ICON, PROVIDER_LABEL } from "./source-picker";

export type Proposal = { id: string; title: string; provider: Provider };

/** Les notes repérées dans la semaine : chacune s'ouvre en brouillon sur sa page finale, ou s'écarte. */
export function ConnectedProposals({ items }: { items: Proposal[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  async function open(item: Proposal) {
    setBusy(item.id);
    const result = await draftFromItem(item.id).catch(() => ({ error: `« ${item.title} » n’a pas pu être récupéré.` }));
    if ("error" in result) { setBusy(null); return toastError(result.error); }
    router.push(`/editer/${result.id}`);
  }

  // Écarter est réversible : pas de confirmation, un toast « Annuler » qui laisse 6 s
  function ignore(item: Proposal) {
    setHidden((old) => new Set(old).add(item.id));
    let undone = false;
    toastUndo(`« ${item.title} » écartée`, () => { undone = true; setHidden((old) => { const next = new Set(old); next.delete(item.id); return next; }); });
    window.setTimeout(() => { if (!undone) void ignoreItems([item.id]); }, 6000);
  }

  const shown = items.filter((item) => !hidden.has(item.id));
  if (!shown.length) return null;
  return (
    <ItemGroup className="stagger gap-2">
      {shown.map((item) => (
        <Item key={item.id} variant="outline" className="bg-card">
          <ItemMedia className="size-10 rounded-xl bg-muted"><Icon icon={PROVIDER_ICON[item.provider]} /></ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle className="text-base wrap-break-word">{item.title}</ItemTitle>
            <ItemDescription>{PROVIDER_LABEL[item.provider]}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button variant="ghost" onClick={() => ignore(item)} disabled={busy === item.id}>Écarter</Button>
            <Button variant="outline" pending={busy === item.id} onClick={() => void open(item)}>Importer</Button>
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}
