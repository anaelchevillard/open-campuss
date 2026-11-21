"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { startDraft } from "@/app/actions/connected";
import { Notice } from "@/components/action-form";

/** Passe par un effet et non par la page : le préchargement d'un lien ne doit pas créer de brouillon. */
export function NewDraft({ subject, depart, shared }: { subject: string | null; depart: string | null; shared: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void startDraft(subject).then((result) => {
      if ("error" in result) return setError(result.error);
      const query = shared ? "?partage=1" : depart ? `?depart=${depart}${depart === "fichier" ? "&importer=1" : ""}` : "";
      router.replace(`/editer/${result.id}${query}`);
    }).catch(() => setError("Le brouillon n’a pas pu être créé. Recharge la page."));
  }, [subject, depart, shared, router]);
  return error
    ? <Notice tone="error">{error}</Notice>
    : <div className="mx-auto grid max-w-(--measure) gap-4 pt-16" aria-busy="true"><div className="frame-loading h-4 w-40 rounded" /><div className="frame-loading h-10 w-3/4 rounded" /><div className="frame-loading h-80 rounded-lg" /></div>;
}
