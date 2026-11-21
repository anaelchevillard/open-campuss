"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { banUser, deleteAccountNow, reactivateUser, resetSecondFactor, scheduleDeletion, sendAccessLink, signOut, startViewAs, suspendUsers } from "@/app/actions/admin/access";
import { SuspendSheet } from "@/components/admin/people-view";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Icon } from "@/components/icon";
import { ResponsiveMenu, type MenuEntry } from "@/components/responsive-menu";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { IconBlock, IconDelete, IconEdit, IconEye, IconLogout, IconMail, IconMore, IconRestore, IconSecurity, IconSuspend } from "@/lib/icons";

type Person = { id: string; name: string; email: string; status: string; role: string; isOwner: boolean; suspended: boolean; deletion: boolean };

/** En-tête de la fiche : « Modifier » et « Envoyer un lien de connexion », le reste dans « … ». */
export function PersonActions({ person, editHref }: { person: Person; editHref: string }) {
  const { run, askReason, askReasonNotify, dialog, pending } = useAdminAction();
  const [suspend, setSuspend] = useState(false);
  const courses = useRef<"keep" | "trash">("keep");
  const protectedAccount = person.isOwner || person.role === "admin";

  const sensitive = async (title: string, confirmLabel: string, call: (reason: string) => Promise<unknown>, success: string, description?: string) => {
    const reason = await askReason({ title, description, confirmLabel, level: "sensitive" });
    if (reason) await run(() => call(reason) as never, { success });
  };
  const critical = async (title: string, confirmLabel: string, call: (reason: string) => Promise<unknown>, success: string, description?: string, children?: React.ReactNode) => {
    const reason = await askReason({ title, description, confirmLabel, level: "critical", expected: person.email, children });
    if (reason) await run(() => call(reason) as never, { success });
  };

  const viewAs = async () => {
    const answer = await askReasonNotify({ title: `Voir Campuss comme ${person.name}`, confirmLabel: "Commencer l’aperçu", level: "critical", expected: person.email, notifyOption: true,
      description: "15 minutes en lecture seule, journalisé. La personne n’est prévenue que si tu coches la case." });
    if (answer) await run(() => startViewAs(person.id, answer.reason, answer.notify) as never, { success: "" });
  };

  const items: MenuEntry[] = [
    ...(!protectedAccount && person.status === "active" ? [{ label: "Voir comme", icon: IconEye, onSelect: () => void viewAs() }] : []),
    { label: "Réinitialiser le second facteur", icon: IconSecurity, onSelect: () => void sensitive("Réinitialiser le second facteur", "Réinitialiser", (r) => resetSecondFactor(person.id, r), "Second facteur réinitialisé", "Code, clés d’accès et codes de secours supprimés, sessions coupées.") },
    { label: "Déconnecter partout", icon: IconLogout, onSelect: () => void sensitive("Déconnecter tous les appareils", "Déconnecter", (r) => signOut(person.id, null, r), "Appareils déconnectés") },
    ...(person.suspended || ["disabled", "banned", "rejected"].includes(person.status)
      ? [{ label: "Rouvrir le compte", icon: IconRestore, onSelect: () => void sensitive("Rouvrir le compte", "Rouvrir", (r) => reactivateUser(person.id, r), "Compte rouvert") }]
      : [{ label: "Suspendre", icon: IconSuspend, separatorBefore: true, onSelect: () => setSuspend(true) }]),
    ...(person.status !== "banned" && !person.isOwner ? [{ label: "Bannir", icon: IconBlock, danger: true, onSelect: () => void critical(`Bannir ${person.name}`, "Bannir", (r) => banUser(person.id, r), "Compte banni", "Compte fermé, sessions coupées ; l’adresse ne pourra plus servir à s’inscrire (empreinte gardée 3 ans).") }] : []),
    ...(!person.deletion && !person.isOwner ? [{ label: "Supprimer dans 30 jours", icon: IconDelete, danger: true, onSelect: () => void critical(`Supprimer le compte de ${person.name}`, "Programmer la suppression", (r) => scheduleDeletion(person.id, r, courses.current), "Suppression programmée dans 30 jours", "Désactivé tout de suite, supprimé dans 30 jours sauf annulation.",
      <RadioGroup defaultValue="keep" onValueChange={(v) => { courses.current = v as "keep" | "trash"; }} className="gap-2">
        <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="keep" />Garder ses cours publiés (signés « Ancien membre »)</Label>
        <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="trash" />Mettre ses cours à la corbeille</Label>
      </RadioGroup>) }] : []),
    ...(!person.isOwner ? [{ label: "Supprimer tout de suite", icon: IconDelete, danger: true, onSelect: () => void critical(`Supprimer définitivement le compte de ${person.name}`, "Supprimer définitivement", (r) => deleteAccountNow(person.id, r), "Compte supprimé", "Le compte, ses fichiers et ses données personnelles sont effacés maintenant, sans délai de 30 jours. Rien ne pourra être restauré.") }] : []),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={editHref} scroll={false} data-slot="button" className={buttonVariants({ variant: "outline" })}><Icon icon={IconEdit} size={16} />Modifier</Link>
      {person.status === "active" && <Button variant="outline" pending={pending} onClick={() => void sensitive("Envoyer un lien de connexion", "Envoyer", (r) => sendAccessLink(person.id, r), "Lien envoyé", "Un lien valable 24 h pour choisir un nouveau mot de passe.")}><Icon icon={IconMail} size={16} />Envoyer un lien de connexion</Button>}
      <ResponsiveMenu title={person.name} trigger={<Button variant="ghost" size="icon" aria-label="Plus d’actions"><Icon icon={IconMore} /></Button>} items={items} />
      <SuspendSheet open={suspend} onClose={() => setSuspend(false)} count={1} onSubmit={async (v) => { const r = await run(() => suspendUsers([person.id], v.preset, v.date, v.reason, v.message), { success: "Compte suspendu" }); if (r && !r.error) setSuspend(false); }} />
      {dialog}
    </div>
  );
}
