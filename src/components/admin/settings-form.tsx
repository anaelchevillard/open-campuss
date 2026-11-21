"use client";

import { useState, type ReactNode } from "react";
import { saveSetting } from "@/app/actions/admin/settings";
import { SaveState, useSaveState } from "@/components/admin/saved-field";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { AiBadge } from "@/components/ai/ai-badge";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { SettingKey } from "@/lib/site-settings";
import { IconError, IconSuccess } from "@/lib/icons";

type Values = Record<SettingKey, unknown>;

function Group({ title, children, extra }: { title: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="grid gap-4">
      <h2 className="heading flex items-center gap-2">{title}{extra}</h2>
      <div className="grid gap-5 rounded-xl bg-card p-4 shadow-xs md:p-6">{children}</div>
    </section>
  );
}

/** Chaque changement demande un motif (sensible) et part au journal avec l'ancienne et la nouvelle valeur. */
export function SettingsForm({ values, secrets, aiKey }: { values: Values; secrets: [string, boolean][]; aiKey: boolean }) {
  const { run, askReason, dialog } = useAdminAction();
  const save = async (key: SettingKey, value: unknown, label: string) => {
    const closing = key === "registration.mode" && value === "closed";
    const reason = await askReason({ title: label, confirmLabel: closing ? "Fermer les inscriptions" : "Enregistrer", level: closing ? "critical" : "sensitive", expected: closing ? "fermer" : undefined, description: closing ? "Plus personne ne pourra créer de compte, même avec une invitation en attente." : undefined });
    if (!reason) return "Non enregistré";
    const result = await run(() => saveSetting(key, value, reason), { quiet: true });
    return result?.error ?? (result ? null : "Non enregistré");
  };
  return (
    <div className="grid max-w-3xl gap-12">
      <Group title="Inscriptions">
        <ModeField value={values["registration.mode"] as string} onSave={(v) => save("registration.mode", v, "Mode d’inscription")} />
        <ListField id="auto" label="Domaines étudiants" hint="Un par ligne, par exemple etu.exemple.fr. Seuls ces domaines peuvent s’inscrire seuls ; ils sont acceptés sans validation. Les invitations et les comptes créés par l’administration ne sont pas limités." value={values["registration.autoApproveDomains"] as string[]} onSave={(v) => save("registration.autoApproveDomains", v, "Domaines acceptés")} />
        <ListField id="reviewed" label="Autres domaines admis, avec validation" hint="Un par ligne. Vide : seuls les domaines étudiants peuvent s’inscrire." value={values["registration.reviewedDomains"] as string[]} onSave={(v) => save("registration.reviewedDomains", v, "Autres domaines admis")} />
        <ListField id="blocked" label="Domaines refusés" value={values["registration.blockedDomains"] as string[]} onSave={(v) => save("registration.blockedDomains", v, "Domaines refusés")} />
        <TextField id="closed" label="Message quand les inscriptions sont fermées" value={values["registration.closedMessage"] as string} onSave={(v) => save("registration.closedMessage", v, "Message de fermeture")} />
      </Group>
      <Group title="Quotas">
        <NumberSetting id="storage" label="Stockage par personne (Mo)" value={values["quotas.storageMb"] as number} onSave={(v) => save("quotas.storageMb", v, "Stockage par personne")} />
        <NumberSetting id="ai" label="Plafond IA quotidien du site" value={values["quotas.aiDailyGlobal"] as number} onSave={(v) => save("quotas.aiDailyGlobal", v, "Plafond IA quotidien")} />
        <NumberSetting id="mail" label="Mails par jour (invitations)" value={values["mail.dailyLimit"] as number} onSave={(v) => save("mail.dailyLimit", v, "Plafond de mails")} />
      </Group>
      <Group title="Fonctions">
        <p className="-mt-1 text-sm text-muted-foreground">Une fonction coupée disparaît partout.</p>
        <SwitchSetting label={<span className="flex items-center gap-2">Campuss IA <AiBadge /></span>} hint={aiKey ? undefined : "Sans AI_API_KEY dans app.env, l’IA reste absente quel que soit ce réglage."} value={values["features.ai"] as boolean} onSave={(v) => save("features.ai", v, v ? "Activer Campuss IA" : "Couper Campuss IA")} />
        <SwitchSetting label="Imports (fichier, Notion, Google)" value={values["features.imports"] as boolean} onSave={(v) => save("features.imports", v, v ? "Activer les imports" : "Couper les imports")} />
        <SwitchSetting label="Classement" value={values["features.ranking"] as boolean} onSave={(v) => save("features.ranking", v, v ? "Activer le classement" : "Couper le classement")} />
        <SwitchSetting label="Duels" value={values["features.duels"] as boolean} onSave={(v) => save("features.duels", v, v ? "Activer les duels" : "Couper les duels")} />
        <SwitchSetting label="Réviser à plusieurs" value={values["features.groups"] as boolean} onSave={(v) => save("features.groups", v, v ? "Activer les groupes" : "Couper les groupes")} />
        <SwitchSetting label="Bannières en image" value={values["features.bannerImages"] as boolean} onSave={(v) => save("features.bannerImages", v, v ? "Autoriser les bannières en image" : "Couper les bannières en image")} />
      </Group>
      <Group title="Modération">
        <NumberSetting id="threshold" label="Signalements avant masquage automatique" value={values["moderation.reportHideThreshold"] as number} onSave={(v) => save("moderation.reportHideThreshold", v, "Seuil de masquage")} />
        <ListField id="words" label="Mots interdits" hint="Un par ligne" value={values["moderation.bannedWords"] as string[]} onSave={(v) => save("moderation.bannedWords", v, "Mots interdits")} />
      </Group>
      <Group title="Secrets">
        <p className="-mt-1 text-sm text-muted-foreground">Ils se changent dans app.env, sur le serveur.</p>
        <ul className="grid gap-2 text-sm">{secrets.map(([label, ok]) => (
          <li key={label} className="flex items-center gap-2"><Icon icon={ok ? IconSuccess : IconError} size={16} className={ok ? "text-success-foreground" : "text-muted-foreground"} /><span className="flex-1">{label}</span><span className={ok ? "text-success-foreground" : "text-muted-foreground"}>{ok ? "configuré" : "absent"}</span></li>
        ))}</ul>
      </Group>
      {dialog}
    </div>
  );
}

type Saver<T> = (value: T) => Promise<string | null | undefined>;

function useSaver<T>(initial: T, onSave: Saver<T>) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const s = useSaveState();
  const commit = async (next: T) => {
    if (JSON.stringify(next) === JSON.stringify(saved)) return;
    s.start();
    const err = await onSave(next);
    if (err) setValue(saved); else setSaved(next);
    s.done(err === "Non enregistré" ? null : err);
  };
  return { value, setValue, commit, s };
}

function ModeField({ value, onSave }: { value: string; onSave: Saver<string> }) {
  const { value: v, setValue, commit, s } = useSaver(value, onSave);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between"><Label>Mode</Label><SaveState state={s.state} error={s.error} /></div>
      <ToggleGroup variant="outline" value={[v]} onValueChange={(next) => { if (next[0]) { setValue(next[0]); void commit(next[0]); } }}>
        <ToggleGroupItem value="open">Ouvertes</ToggleGroupItem><ToggleGroupItem value="invite">Sur invitation</ToggleGroupItem><ToggleGroupItem value="closed">Fermées</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

function SwitchSetting({ label, hint, value, onSave }: { label: ReactNode; hint?: string; value: boolean; onSave: Saver<boolean> }) {
  const { value: v, setValue, commit, s } = useSaver(value, onSave);
  return (
    <label className="flex min-h-11 items-center gap-3">
      <span className="grid flex-1 gap-0.5"><span className="text-sm font-semibold">{label}</span>{hint && <span className="text-sm text-muted-foreground">{hint}</span>}</span>
      <SaveState state={s.state} error={s.error} />
      <Switch checked={v} onCheckedChange={(next) => { setValue(next); void commit(next); }} />
    </label>
  );
}

function NumberSetting({ id, label, value, onSave }: { id: string; label: string; value: number; onSave: Saver<number> }) {
  const { value: v, setValue, commit, s } = useSaver(String(value), (x) => onSave(Number(x)));
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between"><Label htmlFor={id}>{label}</Label><SaveState state={s.state} error={s.error} /></div>
      <Input id={id} inputMode="numeric" className="w-40 tabular-nums" value={v} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} onBlur={() => v && void commit(v)} />
    </div>
  );
}

function TextField({ id, label, value, onSave }: { id: string; label: string; value: string; onSave: Saver<string> }) {
  const { value: v, setValue, commit, s } = useSaver(value, onSave);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between"><Label htmlFor={id}>{label}</Label><SaveState state={s.state} error={s.error} /></div>
      <Textarea id={id} rows={2} maxLength={500} value={v} onChange={(e) => setValue(e.target.value)} onBlur={() => void commit(v)} />
    </div>
  );
}

function ListField({ id, label, hint, value, onSave }: { id: string; label: string; hint?: string; value: string[]; onSave: Saver<string[]> }) {
  const { value: v, setValue, commit, s } = useSaver(value.join("\n"), (x) => onSave(x.split(/[\n,;]/).map((w) => w.trim()).filter(Boolean)));
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between"><Label htmlFor={id}>{label}</Label><SaveState state={s.state} error={s.error} /></div>
      <Textarea id={id} rows={3} className="font-mono text-sm" value={v} onChange={(e) => setValue(e.target.value)} onBlur={() => void commit(v)} />
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
