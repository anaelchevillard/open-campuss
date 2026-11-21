"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Confirmation, en trois niveaux. Une action réversible n'en a pas (toast « Annuler » à la place).
 * - simple : un bouton plein ; - danger : bouton rouge ; - critique : il faut saisir le nom pour confirmer.
 */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, level = "simple", expected, onConfirm, pending }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: ReactNode; confirmLabel: string;
  level?: "simple" | "danger" | "critical"; expected?: string; onConfirm: () => void | Promise<void>; pending?: boolean;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const blocked = level === "critical" && typed.trim() !== (expected ?? "").trim();
  const go = async () => {
    if (blocked) return;
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); setTyped(""); }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setTyped(""); }}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription className="text-base">{description}</DialogDescription>}
        </DialogHeader>
        {level === "critical" && expected && (
          <div className="grid gap-2">
            <Label htmlFor="confirm-name">Pour confirmer, écris <strong className="font-semibold">{expected}</strong></Label>
            <Input id="confirm-name" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} aria-invalid={typed.length > 0 && blocked || undefined} />
          </div>
        )}
        <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button variant={level === "simple" ? "default" : "danger"} pending={pending || busy} onClick={() => void go()} aria-disabled={blocked || undefined} className={blocked ? "opacity-60" : undefined}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
