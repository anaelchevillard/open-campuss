"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Notice } from "@/components/action-form";
import { sendFile } from "@/lib/upload-client";
import { Icon } from "@/components/icon";
import { IconCloudUpload } from "@/lib/icons";

/** Dépôt de PDF et de photos sur un brouillon. Le serveur revérifie le type réel de chaque fichier. */
export function DraftFiles({ docId }: { docId: string }) {
  const router = useRouter();
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const send = async (files: File[]) => {
    if (!files.length) return;
    setError("");
    const total = files.reduce((sum, f) => sum + f.size, 0);
    let sent = 0;
    try {
      for (const file of files) {
        await sendFile(docId, "attachment", file, (bytes) => { sent += bytes; setProgress(`Envoi : ${Math.round((sent / total) * 100)} %`); });
      }
      router.refresh();
    } catch (failure) {
      setError((failure as Error).message);
    }
    setProgress(null);
  };
  return (
    <div className="grid gap-2">
      <label onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); void send([...e.dataTransfer.files]); }}
        className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-2.5 transition-colors duration-(--dur-fast) has-focus-visible:ring-3 has-focus-visible:ring-ring/40 ${over ? "border-primary bg-brand-tint" : "border-input hover-ok:border-primary"}`}>
        <Icon icon={IconCloudUpload} className="text-muted-foreground" />
        <span className="grid"><span className="text-sm font-semibold">{progress ?? "Ajouter un PDF, une photo ou une page HTML"}</span>
        <span className="text-xs text-muted-foreground">50 Mo au plus par fichier</span></span>
        <input type="file" name="draft-files" multiple accept="application/pdf,image/jpeg,image/png,image/webp,.html,.htm" capture={undefined} className="sr-only" disabled={progress !== null} onChange={(e) => { void send([...e.target.files!]); e.target.value = ""; }} />
      </label>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
