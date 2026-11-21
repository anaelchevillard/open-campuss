"use client";

import { useEffect, useState } from "react";
import { deleteRevision, inviteToRevision, leaveRevision, removeFromRevision } from "@/app/actions/revision";
import { Avatar } from "@/components/avatar";
import { FriendQuickAdd } from "@/components/friends/friend-quick-add";
import { Badge } from "@/components/reui/badge";
import { Submit } from "@/components/submit";
import { cn } from "cn";
import { PRESENCE_EVENT, type LivePeer } from "./live";

type Person = { id: string; name: string; avatarKey: string | null };
type Member = Person & { status: "pending" | "accepted" | "refused" };

export type Sharing = {
  docId: string; spaceId: string | null; owner: boolean; ownerName: string; friends: Person[]; members: Member[];
  spaces: { id: string; label: string }[]; current: string | null; friendCode: string | null; published: boolean;
};

/** Où l'on annote : ses propres marques, ou la révision commune d'un ami qui nous a invité. */
export function SpaceChoice({ current, spaces }: { current: string | null; spaces: { id: string; label: string }[] }) {
  if (!spaces.length) return null;
  const go = (id: string | null) => { const url = new URL(location.href); if (id) url.searchParams.set("revision", id); else url.searchParams.delete("revision"); location.assign(url); };
  const all = [{ id: null as string | null, label: "Moi" }, ...spaces.map((s) => ({ id: s.id as string | null, label: `Avec ${s.label}` }))];
  return (
    <div role="radiogroup" aria-label="Annotations affichées" className="flex flex-wrap gap-1.5">
      {all.map((space) => {
        const on = space.id === current;
        return <button key={space.id ?? "moi"} type="button" role="radio" aria-checked={on} onClick={() => !on && go(space.id)}
          className={cn("min-h-8 rounded-full border px-3 text-sm transition-colors coarse:min-h-11", on ? "border-transparent bg-brand-tint font-semibold text-brand-text" : "border-input hover-ok:bg-muted")}>{space.label}</button>;
      })}
    </div>
  );
}

/** Réviser à plusieurs : seuls les amis sont proposés, chacun accepte ou refuse ; on ajoute un ami sur place. */
export function RevisionPeople({ sharing, hasMarks }: { sharing: Sharing; hasMarks: boolean }) {
  const { docId, spaceId, owner, ownerName, friends, members, friendCode, published } = sharing;
  const [online, setOnline] = useState<LivePeer[]>([]);
  useEffect(() => {
    const onPresence = (event: Event) => setOnline((event as CustomEvent<LivePeer[]>).detail);
    addEventListener(PRESENCE_EVENT, onPresence);
    return () => removeEventListener(PRESENCE_EVENT, onPresence);
  }, []);
  const candidates = friends.filter((f) => !members.some((m) => m.id === f.id));
  if (!owner) return (
    <div className="grid gap-2 text-sm">
      <p>Tu révises avec <strong className="font-semibold">{ownerName}</strong> : vos marques et vos notes sont communes.</p>
      {spaceId && <form action={leaveRevision}><input type="hidden" name="space" value={spaceId} /><Submit size="sm" variant="ghost">Quitter cette révision</Submit></form>}
    </div>
  );
  return (
    <div className="grid gap-3">
      {members.length > 0 && (
        <ul className="grid gap-1.5">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-sm">
              <span className="relative"><Avatar user={m} size={24} />{online.some((o) => o.id === m.id) && <span title="En ligne" className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full bg-success ring-2 ring-popover" />}</span>
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              {m.status !== "accepted" && <Badge variant={m.status === "pending" ? "warning-light" : "secondary"} size="sm">{m.status === "pending" ? "en attente" : "refusé"}</Badge>}
              {spaceId && <form action={removeFromRevision}><input type="hidden" name="space" value={spaceId} /><input type="hidden" name="user" value={m.id} /><Submit size="sm" variant="ghost" aria-label={`Retirer ${m.name}`}>Retirer</Submit></form>}
            </li>
          ))}
        </ul>
      )}
      {published && candidates.length > 0 && (
        <ul className="grid gap-1.5">
          {candidates.map((f) => (
            <li key={f.id}>
              <form action={inviteToRevision} className="flex items-center gap-2 text-sm">
                <input type="hidden" name="document" value={docId} /><input type="hidden" name="user" value={f.id} />
                <Avatar user={f} size={24} /><span className="min-w-0 flex-1 truncate">{f.name}</span>
                <Submit size="sm" variant="outline" aria-label={`Inviter ${f.name}`}>Inviter</Submit>
              </form>
            </li>
          ))}
        </ul>
      )}
      {friendCode && <FriendQuickAdd code={friendCode} context={{ kind: "revision", id: docId }} compact />}
      {hasMarks && spaceId && <form action={deleteRevision}><input type="hidden" name="space" value={spaceId} /><Submit size="sm" variant="ghost">Effacer toutes mes annotations</Submit></form>}
    </div>
  );
}
