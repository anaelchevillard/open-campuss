"use client";

import Link from "next/link";
import { useState } from "react";
import { revokeShare } from "@/app/actions/habits";
import { savePrivacy, saveRanking, unblockUser } from "@/app/actions/social";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ProfilePrivacy } from "@/lib/db/schema";
import { toast } from "@/lib/toast";
import { AutoSwitch, SettingsGroup, useDraft } from "./autosave";

export function VisibilitySettings({ privacy, ranking, rankingOn }: { privacy: ProfilePrivacy; ranking: boolean; rankingOn: boolean }) {
  const [who, setWho] = useDraft<"friends" | "none">("privacy:activity", privacy.activity ?? "friends", (v) => savePrivacy({ activity: v }));
  return (
    <SettingsGroup id="visibilite" title="Visibilité">
      {rankingOn && <AutoSwitch label="Apparaître dans le classement" description="Celui de ta licence, modifiable à tout moment" checked={ranking} onSave={saveRanking} />}
      <AutoSwitch label="Me trouver par mon nom" description="Dans la recherche de la page Amis ; les non-amis voient ton prénom et l’initiale de ton nom" checked={privacy.findable !== false} onSave={(v) => savePrivacy({ findable: v })} />
      <AutoSwitch label="Partager ma révision avec mes amis" description="Série, fiches revues et ligue d’amis" checked={Boolean(privacy.shareStudy)} onSave={(v) => savePrivacy({ shareStudy: v })} />
      <AutoSwitch label="Montrer que je révise" description="« En train de réviser », pour tes amis seulement" checked={Boolean(privacy.showStudying)} onSave={(v) => savePrivacy({ showStudying: v })} />
      <div className="grid gap-2">
        <span className="text-sm font-semibold">Mon activité est visible par</span>
        <ToggleGroup aria-label="Activité visible par" variant="outline" spacing={0} className="w-full" value={[who]}
          onValueChange={(values: string[]) => { const v = values[0] as "friends" | "none" | undefined; if (v) setWho(v); }}>
          <ToggleGroupItem value="friends" className="min-h-9 flex-1 aria-pressed:bg-brand-tint aria-pressed:font-semibold aria-pressed:text-brand-text coarse:min-h-11">Mes amis</ToggleGroupItem>
          <ToggleGroupItem value="none" className="min-h-9 flex-1 aria-pressed:bg-brand-tint aria-pressed:font-semibold aria-pressed:text-brand-text coarse:min-h-11">Personne</ToggleGroupItem>
        </ToggleGroup>
      </div>
    </SettingsGroup>
  );
}

export function BlockedList({ people }: { people: { id: string; name: string; avatarKey: string | null }[] }) {
  const [list, setList] = useState(people);
  return (
    <SettingsGroup id="bloques" title="Personnes bloquées">
      {list.length ? (
        <ul className="-my-2 divide-y divide-border">
          {list.map((p) => (
            <li key={p.id} className="flex min-h-14 items-center gap-3 py-2">
              <Avatar user={p} size={32} />
              <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
              <Button variant="outline" size="sm" className="shrink-0" onClick={async () => { await unblockUser(p.id); setList((l) => l.filter((x) => x.id !== p.id)); toast(`${p.name} débloqué`); }}>Débloquer</Button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">Personne</p>}
    </SettingsGroup>
  );
}

export function ShareLinks({ links }: { links: { documentId: string; title: string }[] }) {
  const [list, setList] = useState(links);
  return (
    <SettingsGroup id="liens" title="Liens de partage">
      {list.length ? (
        <ul className="-my-2 divide-y divide-border">
          {list.map((l) => (
            <li key={l.documentId} className="flex min-h-14 items-center gap-3 py-2">
              <Link href={`/d/${l.documentId}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">{l.title}</Link>
              <Button variant="outline" size="sm" className="shrink-0" onClick={async () => { await revokeShare(l.documentId); setList((x) => x.filter((y) => y.documentId !== l.documentId)); toast("Lien retiré"); }}>Retirer le lien</Button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">Aucun lien actif</p>}
    </SettingsGroup>
  );
}
