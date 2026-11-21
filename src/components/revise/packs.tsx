import Link from "next/link";
import { copyPack, reportPack, sharePack } from "@/app/actions/packs";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type PackShare = { id: string; friends: boolean; public: boolean; copies: number; removedAt: Date | null } | null;

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/** Partage d'un de mes paquets : avec mes amis et/ou dans la bibliothèque de ma licence. */
export function PackShareForm({ scope, pack }: { scope: string; pack: PackShare }) {
  return (
    <ActionForm action={sharePack} className="grid gap-4 pb-4">
      <input type="hidden" name="scope" value={scope} />
      <div className="grid gap-3">
        <Label className="flex items-center gap-2 font-normal"><Checkbox name="friends" value="1" defaultChecked={pack?.friends ?? false} />Mes amis peuvent le voir et le copier</Label>
        <Label className="flex items-center gap-2 font-normal"><Checkbox name="public" value="1" defaultChecked={pack?.public ?? false} disabled={Boolean(pack?.removedAt)} />Publié dans les paquets publics de ma licence</Label>
      </div>
      {pack?.public && !pack.removedAt && <p className="text-sm text-muted-foreground tabular-nums">{plural(pack.copies, "copie")} · <Link href={`/reviser/fiches/paquets/${pack.id}`} className="text-link hover:underline">voir la page publique</Link></p>}
      {pack?.removedAt && <p className="text-sm text-muted-foreground">Retiré par la modération : il ne peut plus être publié.</p>}
      <Button type="submit">Enregistrer</Button>
    </ActionForm>
  );
}

export function CopyPackForm({ id }: { id: string }) {
  return (
    <ActionForm action={copyPack} hideOnOk className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      <Button type="submit">Copier dans mes fiches</Button>
    </ActionForm>
  );
}

export function ReportPackForm({ id }: { id: string }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground">Signaler ce paquet</summary>
      <ActionForm action={reportPack} hideOnOk className="mt-3 grid gap-3">
        <input type="hidden" name="id" value={id} />
        <Label htmlFor="pack-report-reason">Ce qui ne va pas</Label>
        <Textarea id="pack-report-reason" name="reason" rows={2} maxLength={500} />
        <Button type="submit" variant="outline" size="sm" className="justify-self-start">Envoyer le signalement</Button>
      </ActionForm>
    </details>
  );
}
