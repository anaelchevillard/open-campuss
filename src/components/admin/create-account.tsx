"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createAccount } from "@/app/actions/admin/create";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Icon } from "@/components/icon";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { IconAdd, IconCopy, IconDone } from "@/lib/icons";
import { toast } from "@/lib/toast";

/** Création directe : feuille courte, puis lien d'activation ou mot de passe provisoire montré une seule fois. */
export function CreateAccount({ programs, defaultProgram }: { programs: { id: number; name: string }[]; defaultProgram: number | null }) {
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(params.get("creer") === "1");
  const [form, setForm] = useState({ name: "", email: "", programId: defaultProgram ? String(defaultProgram) : "", level: "1", role: "member" as "member" | "delegate", mode: "link" as "link" | "password" });
  const [secret, setSecret] = useState<{ id: string; link?: string; password?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const { run, askReason, dialog, pending } = useAdminAction();
  const programItems = [{ value: "", label: "Aucune" }, ...programs.map((p) => ({ value: String(p.id), label: p.name }))];
  const close = () => { setOpen(false); setSecret(null); setCopied(false); setForm((f) => ({ ...f, name: "", email: "" })); if (params.get("creer")) router.replace("/admin/personnes", { scroll: false }); };
  const submit = async () => {
    const reason = await askReason({ title: `Créer le compte de ${form.name || "cette personne"}`, confirmLabel: "Créer", level: "sensitive", description: "Compte actif tout de suite, sans validation." });
    if (!reason) return;
    const result = await run(() => createAccount({ name: form.name, email: form.email, programId: form.programId ? Number(form.programId) : null, level: Number(form.level), role: form.role, mode: form.mode, reason }), { quiet: true });
    if (result?.data) setSecret(result.data);
  };
  const value = secret?.password ?? secret?.link ?? "";
  return (
    <>
      <Button onClick={() => setOpen(true)}><Icon icon={IconAdd} size={16} />Créer un compte</Button>
      <ResponsiveSheet open={open} onOpenChange={(o) => (o ? setOpen(true) : close())} title={secret ? "Compte créé" : "Créer un compte"}
        footer={secret ? <Button variant="outline" onClick={close}>Fermer</Button> : <Button pending={pending} onClick={() => void submit()}>Créer le compte</Button>}>
        {secret ? (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">{secret.password ? "Mot de passe provisoire, valable 72 h, à changer à la première connexion. Il ne sera plus affiché." : "Lien d’activation valable 7 jours, envoyé par mail. Il ne sera plus affiché."}</p>
            <div className="flex items-center gap-2 rounded-lg bg-muted p-3"><code className="min-w-0 flex-1 font-mono text-sm break-all">{value}</code>
              <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(value); setCopied(true); toast("Copié"); }}><Icon icon={copied ? IconDone : IconCopy} size={16} />Copier</Button></div>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <div className="grid gap-1.5"><Label htmlFor="new-name">Nom</Label><Input id="new-name" autoComplete="off" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} /></div>
            <div className="grid gap-1.5"><Label htmlFor="new-email">Adresse</Label><Input id="new-email" type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <div className="grid gap-1.5"><Label>Licence</Label><Select items={programItems} value={form.programId} onValueChange={(v) => setForm({ ...form, programId: String(v ?? "") })}><SelectTrigger className="w-full" aria-label="Licence"><SelectValue /></SelectTrigger><SelectContent>{programItems.map((i) => <SelectItem key={i.value || "none"} value={i.value}>{i.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-1.5"><Label>Année</Label><ToggleGroup variant="outline" value={[form.level]} onValueChange={(v) => v[0] && setForm({ ...form, level: v[0] })} spacing={0}>{["1", "2", "3"].map((l) => <ToggleGroupItem key={l} value={l} aria-label={`L${l}`}>L{l}</ToggleGroupItem>)}</ToggleGroup></div>
            </div>
            <div className="grid gap-1.5"><Label>Rôle</Label><ToggleGroup variant="outline" value={[form.role]} onValueChange={(v) => v[0] && setForm({ ...form, role: v[0] as "member" | "delegate" })}><ToggleGroupItem value="member">Membre</ToggleGroupItem><ToggleGroupItem value="delegate">Délégué</ToggleGroupItem></ToggleGroup></div>
            <div className="grid gap-1.5"><Label>Accès</Label><ToggleGroup variant="outline" value={[form.mode]} onValueChange={(v) => v[0] && setForm({ ...form, mode: v[0] as "link" | "password" })}><ToggleGroupItem value="link">Lien d’activation</ToggleGroupItem><ToggleGroupItem value="password">Mot de passe provisoire</ToggleGroupItem></ToggleGroup></div>
          </form>
        )}
      </ResponsiveSheet>
      {dialog}
    </>
  );
}
