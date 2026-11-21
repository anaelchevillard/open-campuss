"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { IconCamera, IconError } from "@/lib/icons";
import { IMAGE_ACCEPT } from "@/lib/image-crop";
import { deleteImage, postImage } from "@/lib/image-upload";
import { toastError, toastUndo } from "@/lib/toast";
import { useImagePick } from "./image-crop-dialog";

function useAvatarUpload() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const image = useImagePick("avatar", async (blob) => {
    setBusy(true);
    try {
      await postImage(blob, "/api/account/avatar");
      router.refresh();
    } finally {
      setBusy(false);
    }
  });
  const remove = () => {
    let undone = false;
    toastUndo("Photo retirée", () => { undone = true; });
    setTimeout(() => {
      if (undone) return;
      deleteImage("/api/account/avatar").then(() => router.refresh(), (error: Error) => toastError(error.message));
    }, 6000);
  };
  return { message: image.error, busy, pick: image.pick, dialog: image.dialog, remove };
}

/**
 * La photo elle-même est le bouton : un clic (ou Entrée) ouvre le choix du fichier.
 * Au survol ou au focus, un voile et un appareil photo ; au toucher (pas de survol), une pastille appareil photo reste visible.
 * La pastille est en bas à gauche : celle du cadre (série, bouclier…) occupe le bas à droite.
 */
export function AvatarEditButton({ hasAvatar, children, className }: { hasAvatar: boolean; children: ReactNode; className?: string }) {
  const { message, busy, pick, dialog } = useAvatarUpload();
  const label = hasAvatar ? "Changer la photo" : "Ajouter une photo";
  return (
    <div className={cn("grid justify-items-start gap-1.5", className)}>
      <label title={label} className="group relative cursor-pointer rounded-full has-focus-visible:ring-3 has-focus-visible:ring-ring/50" aria-busy={busy || undefined}>
        {children}
        {/* Voile : translucide sur une photo (on la voit encore), plein sur les initiales (sinon elles transparaissent sous l'appareil photo) */}
        <span aria-hidden className={cn("absolute inset-0 flex items-center justify-center rounded-full text-white transition-opacity", hasAvatar ? "bg-black/55" : "bg-neutral-700",
          busy ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-has-focus-visible:opacity-100")}>
          {busy ? <span className="size-6 rounded-full motion-ok:animate-spin border-2 border-white/40 border-t-white" /> : <Icon icon={IconCamera} size={24} />}
        </span>
        <span aria-hidden className="absolute -bottom-1 -left-1 inline-flex size-8 items-center justify-center rounded-full bg-card text-foreground shadow-sm ring-1 ring-border fine:hidden">
          <Icon icon={IconCamera} size={16} />
        </span>
        <input type="file" accept={IMAGE_ACCEPT} name="avatar" aria-label={label} className="sr-only" disabled={busy}
          onChange={(event) => { const file = event.target.files?.[0]; if (file) void pick(file); event.target.value = ""; }} />
      </label>
      {message && <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive-foreground"><Icon icon={IconError} size={16} />{message}</p>}
      {dialog}
    </div>
  );
}

/** Ligne « Photo » de la personnalisation : l'indication du clic sur la photo, et « Retirer » avec « Annuler ». */
export function AvatarRemove({ hasAvatar }: { hasAvatar: boolean }) {
  const { remove } = useAvatarUpload();
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="grid gap-0.5">
        <span className="text-sm font-semibold">Photo</span>
        <span className="text-sm text-muted-foreground">Touche ta photo, en haut, pour la changer (JPEG, PNG ou WebP, 128 × 128 pixels au moins, recadrée en carré)</span>
      </div>
      {hasAvatar && <Button variant="ghost" className="text-muted-foreground" onClick={remove}>Retirer la photo</Button>}
    </div>
  );
}
