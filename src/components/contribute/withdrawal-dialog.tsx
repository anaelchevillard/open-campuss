"use client";

import { useState } from "react";
import { requestWithdrawal } from "@/app/actions/withdrawals";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast, toastError } from "@/lib/toast";
import { WITHDRAWAL_REASON_MAX, WITHDRAWAL_REASON_MIN } from "@/lib/withdrawal-rules";

/** Un cours publié ne se retire plus seul : la demande part à l'administration avec une justification obligatoire. */
export function WithdrawalDialog({ doc, onClose }: { doc: { id: string; title: string } | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const short = reason.replace(/\s+/g, " ").trim().length < WITHDRAWAL_REASON_MIN;
  const close = () => { setReason(""); onClose(); };
  const send = async () => {
    if (!doc) return;
    if (short) { toastError(`Explique en quelques mots pourquoi (au moins ${WITHDRAWAL_REASON_MIN} caractères).`); return; }
    setBusy(true);
    const result = await requestWithdrawal(doc.id, reason).catch(() => ({ error: "La demande n’est pas partie. Réessaie." }));
    setBusy(false);
    if ("error" in result) { toastError(result.error); return; }
    toast("Demande envoyée : tu seras prévenu de la réponse");
    close();
  };
  return (
    <Dialog open={doc !== null} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Demander le retrait</DialogTitle>
          <DialogDescription className="text-base">« {doc?.title.trim() || "Sans titre"} » est publié : d’autres étudiants s’en servent. L’administration lit ta demande et te répond.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-1.5" onSubmit={(event) => { event.preventDefault(); void send(); }} id="withdrawal-form">
          <Label htmlFor="withdrawal-reason">Pourquoi le retirer ?</Label>
          <Textarea id="withdrawal-reason" name="withdrawal-reason" value={reason} maxLength={WITHDRAWAL_REASON_MAX} onChange={(e) => setReason(e.target.value)} className="min-h-28 text-base" required />
        </form>
        <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0">
          <Button variant="outline" onClick={close}>Annuler</Button>
          <Button type="submit" form="withdrawal-form" pending={busy} aria-disabled={short || undefined} className={short ? "opacity-60" : undefined}>Envoyer la demande</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
