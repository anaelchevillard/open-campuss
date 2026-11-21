"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { IconImageAdd } from "@/lib/icons";

/**
 * L'image en haut de la page (cours ou actualité) : recadrée dans le navigateur, le serveur vérifie ensuite sa signature.
 * Sans image, un simple lien qui n'apparaît qu'au survol ou au focus de l'en-tête (toujours visible au doigt).
 */
export function CoverPicker({ src, uploadUrl, onRemove }: { src: string | null; uploadUrl: string; onRemove: () => Promise<unknown> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const bitmap = await createImageBitmap(file).catch(() => { throw new Error("Cette image n’a pas pu être lue. Utilise un JPEG ou un PNG."); });
      const scale = Math.min(1, 1600 / bitmap.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      const response = await fetch(uploadUrl, { method: "POST", body: blob });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "L’envoi a échoué.");
      router.refresh();
    } catch (failure) {
      setError((failure as Error).message);
    }
    setBusy(false);
  }
  const input = <input type="file" name="cover" accept="image/*" className="sr-only" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} />;
  if (src) return (
    <div className="group/cover relative mb-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="aspect-[3/1] w-full rounded-xl object-cover" />
      <span className="absolute top-2 right-2 flex gap-1 transition-opacity duration-(--dur-fast) fine:opacity-0 fine:group-hover/cover:opacity-100 fine:group-focus-within/cover:opacity-100">
        <label className={cn("inline-flex min-h-8 cursor-pointer items-center rounded-lg bg-background/90 px-2.5 text-sm font-semibold shadow-xs has-focus-visible:ring-3 has-focus-visible:ring-ring/40 hover-ok:bg-background", busy && "opacity-50")}>{busy ? "Envoi…" : "Changer"}{input}</label>
        <Button variant="secondary" size="sm" onClick={async () => { await onRemove(); router.refresh(); }}>Retirer</Button>
      </span>
      {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
  return (
    <div className="mb-2 flex min-h-8 items-center">
      <label className={cn("inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 -ml-2 text-sm text-muted-foreground transition-opacity duration-(--dur-fast) hover-ok:bg-muted hover-ok:text-foreground has-focus-visible:opacity-100 has-focus-visible:ring-3 has-focus-visible:ring-ring/40",
        "fine:opacity-0 fine:group-hover/header:opacity-100", busy && "opacity-100")}>
        <Icon icon={IconImageAdd} size={16} />{busy ? "Envoi…" : "Ajouter une couverture"}{input}
      </label>
      {error && <span role="alert" className="ml-2 text-sm text-destructive">{error}</span>}
    </div>
  );
}
