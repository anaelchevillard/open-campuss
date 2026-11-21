"use client";

import { useActionState, useState } from "react";
import { createGroup } from "@/app/actions/groups";
import type { FormState } from "@/components/action-form";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { IconAdd, IconError } from "@/lib/icons";

type Friend = { id: string; name: string; avatarKey: string | null };

/** Un groupe se crée depuis une sélection d'amis : chacun reçoit son invitation d'un coup. */
export function GroupCreate({ friends }: { friends: Friend[] }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [state, action, pending] = useActionState<FormState, FormData>(createGroup, null);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Icon icon={IconAdd} size={16} />Nouveau groupe</Button>
      <ResponsiveSheet open={open} onOpenChange={setOpen} title="Nouveau groupe">
        <form action={action} className="grid gap-5 pb-4">
          {picked.map((id) => <input key={id} type="hidden" name="members" value={id} />)}
          <div className="grid gap-1.5"><Label htmlFor="group-name">Nom</Label><Input id="group-name" name="name" required minLength={2} maxLength={60} autoComplete="off" placeholder="TD de droit civil" /></div>
          {friends.length > 0 && (
            <div className="grid gap-2">
              <Label id="group-friends">Amis à inviter</Label>
              <ToggleGroup multiple aria-labelledby="group-friends" value={picked} onValueChange={(v: string[]) => setPicked(v)} className="flex-wrap justify-start">
                {friends.map((friend) => (
                  <ToggleGroupItem key={friend.id} value={friend.id} variant="outline" className="h-auto min-h-10 gap-2 rounded-full py-1 pr-3 pl-1">
                    <Avatar user={friend} size={28} />{friend.name}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}
          {state?.error && <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive-foreground"><Icon icon={IconError} size={16} />{state.error}</p>}
          <Button type="submit" pending={pending}>Créer le groupe{picked.length ? ` avec ${picked.length} ${picked.length > 1 ? "amis" : "ami"}` : ""}</Button>
        </form>
      </ResponsiveSheet>
    </>
  );
}
