"use client";

import Link from "next/link";
import { useState } from "react";
import { followProfile } from "@/app/actions/people";
import { askFriend, reportProfile } from "@/app/actions/social";
import { Icon } from "@/components/icon";
import { ResponsiveMenu } from "@/components/responsive-menu";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { IconAddFriend, IconBrush, IconDone, IconDuel, IconFlag, IconMore, IconNotifications, IconTogether } from "@/lib/icons";
import { toast, toastError } from "@/lib/toast";

const FIELDS = [
  { value: "name", label: "Le nom" }, { value: "status", label: "Le statut" }, { value: "bio", label: "La bio" },
  { value: "avatar", label: "La photo" }, { value: "banner", label: "La bannière" },
];

/** Actions de l'en-tête du profil : une seule pleine, le rare dans « … ». */
export function ProfileActions({ userId, own, friendship, following = false }: { userId: string; own: boolean; friendship: "none" | "pending" | "friends"; following?: boolean }) {
  const [state, setState] = useState(friendship);
  const [followed, setFollowed] = useState(following);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  if (own) return <Link href={`/u/${userId}?modifier=1`} data-slot="button" className={buttonVariants({ variant: "outline" })}><Icon icon={IconBrush} size={16} />Personnaliser</Link>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === "friends" ? (
        <>
          <Link href="/reviser/ensemble" data-slot="button" className={buttonVariants()}><Icon icon={IconTogether} size={16} />Réviser à plusieurs</Link>
          <Link href="/reviser/ensemble?defi=1" data-slot="button" className={buttonVariants({ variant: "outline" })}><Icon icon={IconDuel} size={16} />Défier</Link>
        </>
      ) : state === "pending" ? (
        <span className="inline-flex min-h-9 items-center gap-1.5 text-sm text-muted-foreground"><Icon icon={IconDone} size={16} />Demande envoyée</span>
      ) : (
        <Button pending={busy} onClick={async () => {
          setBusy(true);
          const result = await askFriend(userId);
          setBusy(false);
          if (result.ok) setState("pending"); else toastError(result.error);
        }}><Icon icon={IconAddFriend} size={16} />Ajouter en ami</Button>
      )}
      <Button variant={followed ? "ghost" : "outline"} aria-pressed={followed} onClick={async () => {
        const next = !followed;
        setFollowed(next);
        const result = await followProfile(userId, next);
        if (!result.ok) { setFollowed(!next); toastError(result.error); } else toast(next ? "Abonné : ses nouveaux cours arriveront dans tes notifications" : "Abonnement retiré");
      }}><Icon icon={followed ? IconDone : IconNotifications} size={16} />{followed ? "Abonné" : "S’abonner"}</Button>
      <ResponsiveMenu title="Profil" trigger={<Button variant="ghost" size="icon-lg" aria-label="Plus d’actions"><Icon icon={IconMore} /></Button>}
        items={[{ label: "Signaler ce profil", icon: IconFlag, onSelect: () => setReporting(true) }]} />
      <ReportSheet userId={userId} open={reporting} onOpenChange={setReporting} />
    </div>
  );
}

function ReportSheet({ userId, open, onOpenChange }: { userId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [field, setField] = useState("name");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    const result = await reportProfile({ target: userId, field, reason });
    setBusy(false);
    if (!result.ok) return toastError(result.error);
    onOpenChange(false);
    setReason("");
    toast("Signalement envoyé à la modération");
  };
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title="Signaler ce profil" description="La personne ne saura pas qui l’a signalée"
      footer={<Button variant="danger" pending={busy} onClick={send}><Icon icon={IconFlag} size={16} />Signaler</Button>}>
      <div className="grid gap-4 pb-2">
        <RadioGroup value={field} onValueChange={(value) => setField(String(value))} aria-label="Ce qui pose problème" className="grid gap-2">
          {FIELDS.map((f) => (
            <Label key={f.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 font-normal hover:bg-muted fine:min-h-9">
              <RadioGroupItem value={f.value} />{f.label}
            </Label>
          ))}
        </RadioGroup>
        <div className="grid gap-1.5">
          <Label htmlFor="report-reason">Précision (facultatif)</Label>
          <Textarea id="report-reason" value={reason} maxLength={500} rows={3} className="text-base" onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
    </ResponsiveSheet>
  );
}
