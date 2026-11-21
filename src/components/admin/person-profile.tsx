"use client";

import { useState } from "react";
import { resetProfilePart, updateProfileField, type ProfileField } from "@/app/actions/admin/people";
import { SavedText, SaveState, useSaveState } from "@/components/admin/saved-field";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IconDelete, IconRefresh } from "@/lib/icons";

type Person = { id: string; name: string; pronouns: string; bio: string; email: string; programId: number | null; level: number | null; favoriteSubjectId: number | null; friendCode: string; avatar: boolean };

/** Profil modifiable sur place : chaque champ s'enregistre seul ; licence, année et adresse proposent un motif (facultatif). */
export function ProfileEditor({ person, programs, subjects, self }: { person: Person; programs: { id: number; name: string }[]; subjects: { id: number; name: string; level: number }[]; self: boolean }) {
  const { run, askReasonNotify, dialog } = useAdminAction();
  const save = (field: ProfileField) => async (value: unknown, reason?: string, warn = false) => {
    const result = await updateProfileField(person.id, field, value, reason, warn);
    if (result.stepUp) {
      const retried = await run(() => updateProfileField(person.id, field, value, reason, warn), { quiet: true });
      return retried?.error ?? (retried ? null : "Non enregistré");
    }
    return result.error ?? null;
  };
  const sensitive = (field: ProfileField, title: string) => async (value: unknown) => {
    const answer = await askReasonNotify({ title, confirmLabel: "Enregistrer", level: "sensitive", notifyOption: field !== "email", description: field === "email" ? "La nouvelle adresse reçoit un lien de confirmation, l’ancienne est prévenue." : undefined });
    if (!answer) return "Non enregistré";
    return save(field)(value, answer.reason, answer.notify);
  };
  const reset = (part: Parameters<typeof resetProfilePart>[1], title: string, label: string) => async () => {
    const answer = await askReasonNotify({ title, confirmLabel: part === "avatar" || part === "banner" ? "Retirer" : "Confirmer", level: "sensitive", notifyOption: true, danger: part === "avatar" || part === "banner",
      description: part === "avatar" || part === "banner" ? "L’image est effacée du stockage. Journalisé." : "Journalisé." });
    if (answer) await run(() => resetProfilePart(person.id, part, answer.reason, answer.notify), { success: label });
  };

  return (
    <div className="grid max-w-2xl gap-8">
      <section className="grid gap-4">
        <SavedText id="p-name" label="Nom" initial={person.name} maxLength={80} onSave={(v) => save("name")(v)} />
        <SavedText id="p-pronouns" label="Pronoms" initial={person.pronouns} maxLength={30} onSave={(v) => save("pronouns")(v)} />
        <SavedText id="p-bio" label="Bio" initial={person.bio} maxLength={280} multiline onSave={(v) => save("bio")(v)} />
        {!self && <SavedText id="p-email" label="Adresse" initial={person.email} maxLength={254} onSave={sensitive("email", "Changer l’adresse")} />}
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        <Choice label="Licence" value={person.programId ? String(person.programId) : ""} items={[{ value: "", label: "Aucune" }, ...programs.map((p) => ({ value: String(p.id), label: p.name }))]} onSave={(v) => (self ? save("programId") : sensitive("programId", "Changer la licence"))(v ? Number(v) : null)} />
        <Choice label="Année" value={person.level ? String(person.level) : ""} items={[{ value: "", label: "Aucune" }, ...[1, 2, 3].map((n) => ({ value: String(n), label: `L${n}` }))]} onSave={(v) => (self ? save("level") : sensitive("level", "Changer l’année"))(v ? Number(v) : null)} />
        <Choice label="Matière préférée" value={person.favoriteSubjectId ? String(person.favoriteSubjectId) : ""} items={[{ value: "", label: "Aucune" }, ...subjects.map((s) => ({ value: String(s.id), label: `L${s.level} · ${s.name}` }))]} onSave={(v) => save("favoriteSubjectId")(v ? Number(v) : null)} />
      </section>
      {!self && (
        <section className="grid gap-3">
          <h3 className="heading">Apparence</h3>
          <p className="text-sm text-muted-foreground">Chaque retrait est journalisé et bloque les changements d’apparence 7 jours (sauf l’avatar). La personne n’est prévenue que si tu le demandes.</p>
          <div className="flex flex-wrap gap-2">
            {person.avatar && <Button variant="destructive" size="sm" onClick={reset("avatar", "Retirer l’avatar", "Avatar retiré")}><Icon icon={IconDelete} size={16} />Retirer l’avatar</Button>}
            <Button variant="destructive" size="sm" onClick={reset("banner", "Retirer la bannière", "Bannière retirée")}><Icon icon={IconDelete} size={16} />Retirer la bannière</Button>
            <Button variant="outline" size="sm" onClick={reset("font", "Réinitialiser la police du nom", "Police réinitialisée")}><Icon icon={IconRefresh} size={16} />Police du nom</Button>
            <Button variant="outline" size="sm" onClick={reset("badge", "Retirer le badge du nom", "Badge retiré du nom")}><Icon icon={IconRefresh} size={16} />Badge</Button>
            <Button variant="outline" size="sm" onClick={reset("status", "Effacer le statut", "Statut effacé")}><Icon icon={IconRefresh} size={16} />Statut</Button>
            <Button variant="outline" size="sm" onClick={reset("appearance", "Réinitialiser toute l’apparence", "Apparence réinitialisée")}><Icon icon={IconRefresh} size={16} />Toute l’apparence</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>Code ami <code className="font-mono">{person.friendCode.slice(0, 5)}-{person.friendCode.slice(5)}</code></span>
            <Button variant="ghost" size="sm" onClick={reset("friendCode", "Régénérer le code ami", "Code ami régénéré")}><Icon icon={IconRefresh} size={16} />Régénérer</Button>
          </div>
        </section>
      )}
      {dialog}
    </div>
  );
}

function Choice({ label, value, items, onSave }: { label: string; value: string; items: { value: string; label: string }[]; onSave: (value: string) => Promise<string | null | undefined> }) {
  const [current, setCurrent] = useState(value);
  const { state, error, start, done } = useSaveState();
  return (
    <div className="grid gap-1.5">
      <div className="flex min-h-5 items-center justify-between gap-3"><Label>{label}</Label><SaveState state={state} error={error} /></div>
      <Select items={items} value={current} onValueChange={async (next) => {
        const v = String(next ?? "");
        const before = current;
        setCurrent(v);
        start();
        const err = await onSave(v);
        if (err) setCurrent(before);
        done(err);
      }}>
        <SelectTrigger className="w-full" aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>{items.map((i) => <SelectItem key={i.value || "none"} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
