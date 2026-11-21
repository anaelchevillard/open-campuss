"use client";

import { useState } from "react";
import { challengeFriend, createDuelLink } from "@/app/actions/duels";
import { AiBadge } from "@/components/ai/ai-badge";
import { Avatar } from "@/components/avatar";
import { FriendQuickAdd } from "@/components/friends/friend-quick-add";
import { CopyLink } from "@/components/habits";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { IconDone, IconDuel } from "@/lib/icons";
import { toast, toastError } from "@/lib/toast";

type Friend = { id: string; name: string; avatarKey: string | null };

/** Après une partie : le score à battre est celui que le serveur vient d'enregistrer. Un ami s'ajoute sur place. */
export function DuelOffer({ docId, friends, code }: { docId: string; friends: Friend[]; code?: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  return (
    <section aria-label="Défier" className="grid gap-4 rounded-xl bg-card p-4 shadow-xs md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="heading flex items-center gap-2"><Icon icon={IconDuel} className="text-muted-foreground" />Défier avec ce score</h2>
          <p className="text-sm text-muted-foreground">Ton adversaire le découvre après avoir joué</p>
        </div>
        <AiBadge className="shrink-0" label="Quiz Campuss IA" />
      </div>
      {friends.length > 0 && (
        <ul className="grid gap-1">
          {friends.map((friend) => (
            <li key={friend.id} className="flex min-h-11 items-center gap-3">
              <Avatar user={friend} size={32} /><span className="min-w-0 flex-1 truncate font-semibold">{friend.name}</span>
              {sent.includes(friend.id)
                ? <span className="flex items-center gap-1 text-sm text-success-foreground"><Icon icon={IconDone} size={16} />Envoyé</span>
                : <Button size="sm" variant="outline" aria-label={`Défier ${friend.name}`} onClick={async () => { const result = await challengeFriend(docId, friend.id); if ("ok" in result) { setSent((all) => [...all, friend.id]); toast(result.ok); } else toastError(result.error); }}>Défier</Button>}
            </li>
          ))}
        </ul>
      )}
      {friends.length === 0 && code && <FriendQuickAdd code={code} context={{ kind: "duel", id: docId }} contextLabel="Dès qu’il accepte, il reçoit ton défi" compact />}
      <div className="border-t border-border pt-3">
        {link ? <CopyLink link={link} /> : <Button size="sm" variant="ghost" onClick={async () => { const result = await createDuelLink(docId); if ("url" in result) setLink(result.url); else toastError(result.error); }}>Créer un lien de défi</Button>}
      </div>
    </section>
  );
}
