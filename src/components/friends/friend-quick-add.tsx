"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { requestFriend } from "@/app/actions/friends";
import type { FormState } from "@/components/action-form";
import { Icon } from "@/components/icon";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconAddFriend, IconCopy, IconDone, IconQr, IconShare } from "@/lib/icons";
import { toast } from "@/lib/toast";

/** A3F9C1E7B2 → A3F9C-1E7B2 : plus facile à lire et à dicter. */
export const formatFriendCode = (code: string) => (code.length > 5 ? `${code.slice(0, 5)}-${code.slice(5)}` : code);

/**
 * Ajouter un ami sur place : mon code (copier, partager, QR) et le champ du code d'un ami.
 * La réponse est la même que le code existe ou non.
 */
export function FriendQuickAdd({ code, context, compact, contextLabel, className, initial }: { code: string; initial?: string; context?: { kind: "group" | "duel" | "revision" | "course"; id: string }; compact?: boolean; contextLabel?: string; className?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestFriend, null);
  const [qr, setQr] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const shown = formatFriendCode(code);
  const input = useRef<HTMLInputElement>(null);
  // La réponse est la même pour tout code : le champ se vide, le message reste
  useEffect(() => { if (state?.ok && input.current) input.current.value = ""; }, [state]);
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/amis?code=${code}`;
  const copy = async () => { await navigator.clipboard?.writeText(shown).catch(() => undefined); toast("Code copié"); };
  const share = async () => {
    if (navigator.share) await navigator.share({ title: "Mon code Campuss", text: `Ajoute-moi sur Campuss : ${shown}`, url: link }).catch(() => undefined);
    else await copy();
  };
  const openQr = async () => {
    const QR = await import("qrcode");
    setQr(await QR.toDataURL(link, { margin: 1, width: 240 }));
    setQrOpen(true);
  };
  return (
    <div className={cn(compact ? "grid gap-3" : "grid gap-4 rounded-xl bg-card p-4 shadow-xs md:p-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <span className="text-sm text-muted-foreground">Ton code</span>
          <span data-testid="friend-code" className="font-mono text-xl font-semibold tracking-wider tabular-nums">{shown}</span>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => void copy()} aria-label="Copier mon code"><Icon icon={IconCopy} /></Button>
          <Button variant="ghost" size="icon" onClick={() => void share()} aria-label="Partager mon code"><Icon icon={IconShare} /></Button>
          <Button variant="ghost" size="icon" onClick={() => void openQr()} aria-label="Afficher le QR code"><Icon icon={IconQr} /></Button>
        </div>
      </div>
      <form action={action} className="grid gap-2">
        {context && <><input type="hidden" name="contextKind" value={context.kind} /><input type="hidden" name="contextId" value={context.id} /></>}
        <Label htmlFor={`friend-code-${context?.id ?? "x"}`}>Code d’un ami</Label>
        <div className="flex gap-2">
          <Input ref={input} id={`friend-code-${context?.id ?? "x"}`} name="who" defaultValue={initial && initial.replace(/-/g, "").toUpperCase() !== code.toUpperCase() ? initial : undefined} aria-label="Code d’un ami" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="Son code à 10 caractères" className="font-mono uppercase placeholder:font-sans placeholder:normal-case" required />
          <Button type="submit" variant="outline" pending={pending}><Icon icon={IconAddFriend} size={16} />Ajouter</Button>
        </div>
        {contextLabel && !state?.ok && <p className="text-sm text-muted-foreground">{contextLabel}</p>}
        {state?.ok && <p role="status" className="flex items-center gap-1.5 text-sm text-success-foreground"><Icon icon={IconDone} size={16} />{state.ok}</p>}
        {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      </form>
      <ResponsiveSheet open={qrOpen} onOpenChange={setQrOpen} title="Ton QR code" size="sm">
        <div className="grid justify-items-center gap-3 pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt={`QR code de ${shown}`} width={240} height={240} className="rounded-lg bg-white p-2" />}
          <span className="font-mono text-lg font-semibold tracking-wider">{shown}</span>
        </div>
      </ResponsiveSheet>
    </div>
  );
}
