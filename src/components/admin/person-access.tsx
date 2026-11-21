"use client";

import { useState } from "react";
import { cancelDeletion, forcePasswordChange, liftSuspension, resetSecondFactor, sendAccessLink, setRole, setTeacherSubjects, setTemporaryPassword, signOut } from "@/app/actions/admin/access";
import { ago, dateTime } from "@/components/admin/badges";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Icon } from "@/components/icon";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IconCopy, IconDone, IconKey, IconLaptop, IconLogout, IconMail, IconPhone, IconSecurity, IconSuspend, IconWarning } from "@/lib/icons";
import { toast } from "@/lib/toast";

type Person = {
  id: string; name: string; email: string; role: string; status: string; isOwner: boolean; suspended: boolean; suspendedUntil: string | null; suspensionReason: string | null; suspensionMessage: string | null;
  deletionScheduledAt: string | null; totp: boolean; passkeys: number; recoveryCodes: number; mustChangePassword: boolean;
  /** Demande de réinitialisation du second facteur faite à la connexion, en attente */
  mfaRequest: { at: string; reason: string } | null;
};
type Teaching = { subjects: { id: number; name: string; level: number; program: string }[]; taught: number[] };
type Session = { key: string; agent: string; ip: string; lastSeenAt: string; createdAt: string };

const ROLES = [{ value: "member", label: "Membre" }, { value: "delegate", label: "Délégué" }, { value: "teacher", label: "Enseignant" }, { value: "admin", label: "Admin" }];
const device = (agent: string) => (/iphone|android|mobile/i.test(agent) ? IconPhone : IconLaptop);
function browser(agent: string) {
  if (/firefox/i.test(agent)) return "Firefox";
  if (/edg/i.test(agent)) return "Edge";
  if (/chrome/i.test(agent)) return "Chrome";
  if (/safari/i.test(agent)) return "Safari";
  return "Navigateur";
}

/** Accès et sécurité : rôle, suspension, second facteur, mot de passe, sessions par appareil. */
export function AccessPanel({ person, sessions, self, teaching, now }: { person: Person; sessions: Session[]; self: boolean; teaching?: Teaching | null; now: number }) {
  const { run, askReason, askReasonNotify, dialog, pending } = useAdminAction();
  const [secret, setSecret] = useState<string | null>(null);
  const temporaryPassword = async () => {
    const answer = await askReasonNotify({ title: "Donner un mot de passe provisoire", confirmLabel: "Générer", level: "sensitive", notifyOption: true,
      description: "Un mot de passe tiré au hasard remplace l’actuel, valable 72 h, à changer à la connexion. Ses appareils sont déconnectés." });
    if (!answer) return;
    const result = await run(() => setTemporaryPassword(person.id, answer.reason, answer.notify), { quiet: true });
    if (result?.data) setSecret(result.data);
  };
  const ask = async (title: string, label: string, call: (r: string) => Promise<unknown>, success: string, critical = false, description?: string) => {
    const reason = await askReason({ title, confirmLabel: label, level: critical ? "critical" : "sensitive", expected: critical ? person.email : undefined, description });
    if (reason) await run(() => call(reason) as never, { success });
  };
  if (self) return <p className="text-sm text-muted-foreground">Ton propre accès se gère dans Paramètres.</p>;
  return (
    <div className="grid max-w-2xl gap-8">
      {person.deletionScheduledAt && (
        <Alert variant="destructive"><Icon icon={IconWarning} size={16} /><AlertDescription className="text-foreground">Suppression le {dateTime(person.deletionScheduledAt)}
          <Button size="sm" variant="outline" onClick={() => void ask("Annuler la suppression", "Annuler la suppression", (r) => cancelDeletion(person.id, r), "Suppression annulée")}>Annuler la suppression</Button></AlertDescription></Alert>
      )}
      {person.suspended && (
        <Alert variant="warning"><Icon icon={IconSuspend} size={16} /><AlertDescription className="text-foreground">
          <span>Suspendu jusqu’au {dateTime(person.suspendedUntil)}{person.suspensionReason ? ` · ${person.suspensionReason}` : ""}</span>
          {person.suspensionMessage && <span className="text-muted-foreground">Message montré : {person.suspensionMessage}</span>}
          <Button size="sm" variant="outline" onClick={() => void ask("Lever la suspension", "Lever", (r) => liftSuspension(person.id, r), "Suspension levée")}>Lever la suspension</Button>
        </AlertDescription></Alert>
      )}
      <section className="grid gap-2">
        <Label>Rôle</Label>
        {person.isOwner ? <p className="text-sm">Propriétaire du site : son rôle ne change pas.</p> : (
          <Select items={ROLES} value={person.role} onValueChange={(v) => {
            const next = String(v);
            const critical = next === "admin" || person.role === "admin";
            void (async () => {
              const answer = await askReasonNotify({ title: critical ? (next === "admin" ? `Nommer ${person.name} administrateur` : `Retirer les droits d’administration`) : "Changer le rôle", confirmLabel: "Confirmer", level: critical ? "critical" : "sensitive", expected: critical ? person.email : undefined, notifyOption: true, description: critical ? "Réservé au propriétaire du site." : undefined });
              if (answer) await run(() => setRole(person.id, next as never, answer.reason, answer.notify), { success: "Rôle modifié" });
            })();
          }}>
            <SelectTrigger className="w-56" aria-label="Rôle"><SelectValue /></SelectTrigger>
            <SelectContent>{ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </section>
      {teaching && <TeacherSubjects personId={person.id} teaching={teaching} />}
      <section className="grid gap-3">
        <h3 className="heading">Connexion</h3>
        {person.mfaRequest && (
          <p role="status" className="rounded-lg bg-warning-tint p-3 text-sm text-warning-foreground">
            Second facteur perdu : demande du {new Date(person.mfaRequest.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}{person.mfaRequest.reason ? ` · « ${person.mfaRequest.reason} »` : ""}.
            Un mail a été envoyé à l’adresse du compte : attends sa réponse avant de réinitialiser.
          </p>
        )}
        <p className="text-sm text-muted-foreground">{person.totp ? "Application d’authentification" : "Pas d’application"} · {person.passkeys} clé{person.passkeys > 1 ? "s" : ""} d’accès · {person.recoveryCodes} code{person.recoveryCodes > 1 ? "s" : ""} de secours{person.mustChangePassword ? " · changement de mot de passe demandé" : ""}</p>
        <div className="flex flex-wrap gap-2">
          {(person.totp || person.passkeys > 0) && <Button variant="outline" size="sm" pending={pending} onClick={() => void ask("Réinitialiser le second facteur", "Réinitialiser", (r) => resetSecondFactor(person.id, r), "Second facteur réinitialisé", false, "Code, clés et codes de secours supprimés, sessions coupées, personne prévenue.")}><Icon icon={IconSecurity} size={16} />Réinitialiser la 2FA</Button>}
          <Button variant="outline" size="sm" onClick={() => void ask("Envoyer un lien de mot de passe", "Envoyer", (r) => sendAccessLink(person.id, r), "Lien envoyé")}><Icon icon={IconMail} size={16} />Lien de mot de passe</Button>
          {person.status === "active" && !person.isOwner && person.role !== "admin" && <Button variant="outline" size="sm" onClick={() => void temporaryPassword()}><Icon icon={IconKey} size={16} />Mot de passe provisoire</Button>}
          {!person.mustChangePassword && <Button variant="outline" size="sm" onClick={() => void ask("Forcer le changement de mot de passe", "Forcer", (r) => forcePasswordChange(person.id, r), "Changement demandé")}><Icon icon={IconKey} size={16} />Forcer le changement</Button>}
        </div>
      </section>
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="heading">Appareils · {sessions.length}</h3>
          {sessions.length > 1 && <Button variant="ghost" size="sm" onClick={() => void ask("Déconnecter tous les appareils", "Tout déconnecter", (r) => signOut(person.id, null, r), "Appareils déconnectés")}><Icon icon={IconLogout} size={16} />Tout déconnecter</Button>}
        </div>
        {sessions.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs">{sessions.map((s) => (
            <li key={s.key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <Icon icon={device(s.agent)} className="text-muted-foreground" />
              <span className="grid min-w-0 flex-1"><span className="font-semibold">{browser(s.agent)}</span><span className="truncate text-muted-foreground">{s.ip || "IP inconnue"} · vu {ago(s.lastSeenAt, now)}</span></span>
              <Button variant="ghost" size="sm" onClick={() => void ask("Déconnecter cet appareil", "Déconnecter", (r) => signOut(person.id, s.key, r), "Appareil déconnecté")}>Déconnecter</Button>
            </li>
          ))}</ul>
        ) : <p className="text-sm text-muted-foreground">Aucune session ouverte</p>}
      </section>
      {secret && <SecretDialog value={secret} onClose={() => setSecret(null)} />}
      {dialog}
    </div>
  );
}

/** Matières d'un enseignant : il voit leurs cours et y publie les siens. */
function TeacherSubjects({ personId, teaching }: { personId: string; teaching: Teaching }) {
  const { run, askReason, dialog, pending } = useAdminAction();
  const [chosen, setChosen] = useState<number[]>(teaching.taught);
  const changed = chosen.length !== teaching.taught.length || chosen.some((id) => !teaching.taught.includes(id));
  const save = async () => {
    const reason = await askReason({ title: "Enregistrer les matières", confirmLabel: "Enregistrer", level: "sensitive" });
    if (reason !== null) await run(() => setTeacherSubjects(personId, chosen, reason), { success: "Matières enregistrées" });
  };
  return (
    <section className="grid gap-3">
      <h3 className="heading">Matières enseignées · {chosen.length}</h3>
      {!teaching.taught.length && <p role="status" className="rounded-lg bg-warning-tint p-3 text-sm text-warning-foreground">Aucune matière : ce compte ne voit aucun cours tant qu’elles ne sont pas reliées.</p>}
      <div className="grid max-h-72 gap-0.5 overflow-y-auto rounded-xl bg-card p-3 shadow-xs sm:grid-cols-2">
        {teaching.subjects.map((s) => (
          <label key={s.id} className="flex min-h-9 items-center gap-2 text-sm">
            <Checkbox checked={chosen.includes(s.id)} onCheckedChange={(v) => setChosen(v ? [...chosen, s.id] : chosen.filter((id) => id !== s.id))} />
            <span className="min-w-0 truncate">{s.name} <span className="text-muted-foreground">· {s.program} L{s.level}</span></span>
          </label>
        ))}
      </div>
      <div><Button size="sm" disabled={!changed} pending={pending} onClick={() => void save()}>Enregistrer les matières</Button></div>
      {dialog}
    </section>
  );
}

/** Le mot de passe provisoire, montré une seule fois. */
function SecretDialog({ value, onClose }: { value: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mot de passe provisoire</DialogTitle>
          <DialogDescription className="text-base">Valable 72 h, à changer à la connexion. Transmets-le à la personne : il ne sera plus affiché.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-lg bg-muted p-3"><code className="min-w-0 flex-1 font-mono text-sm break-all">{value}</code>
          <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(value); setCopied(true); toast("Copié"); }}><Icon icon={copied ? IconDone : IconCopy} size={16} />Copier</Button></div>
        <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0"><Button variant="outline" onClick={onClose}>Fermer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
