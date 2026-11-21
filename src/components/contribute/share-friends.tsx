"use client";

import { useOptimistic, useState, useTransition } from "react";
import { shareWithFriend, unshareWithFriend } from "@/app/actions/course";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IconShare } from "@/lib/icons";

type Friend = { id: string; name: string; avatarKey: string | null };

/** Un document est d'abord personnel : son auteur l'ouvre en lecture seule à des amis choisis, même avant publication. */
export function ShareWithFriends({ docId, friends, shared }: { docId: string; friends: Friend[]; shared: string[] }) {
  const [ids, setIds] = useState(shared);
  const [optimistic, toggle] = useOptimistic(ids, (current, id: string) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const change = (id: string) => startTransition(async () => {
    const on = !ids.includes(id);
    toggle(id);
    setError(null);
    const result = on ? await shareWithFriend(docId, id) : await unshareWithFriend(docId, id);
    if (result.error) { setError(result.error); return; }
    setIds((current) => (on ? [...current, id] : current.filter((x) => x !== id)));
  });

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <Icon icon={IconShare} size={16} />{optimistic.length ? `Partagé à ${optimistic.length} ami${optimistic.length > 1 ? "s" : ""}` : "Partager à des amis"}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-3 p-3">
        <p className="text-sm text-pretty text-muted-foreground">Tes amis cochés lisent ce cours tel qu’il est, sans pouvoir le modifier. Il n’est pas publié pour autant.</p>
        {friends.length === 0
          ? <p className="text-sm">Ajoute d’abord des amis pour leur partager tes cours.</p>
          : <ul className="grid max-h-72 gap-1 overflow-y-auto">
            {friends.map((f) => (
              <li key={f.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover-ok:bg-muted">
                  <Checkbox checked={optimistic.includes(f.id)} onCheckedChange={() => change(f.id)} aria-label={`Partager à ${f.name}`} />
                  <Avatar user={f} size={24} />
                  <span className="min-w-0 truncate text-sm">{f.name}</span>
                </label>
              </li>
            ))}
          </ul>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </PopoverContent>
    </Popover>
  );
}
