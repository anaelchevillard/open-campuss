"use client";

import { useEffect, useRef, useState } from "react";
import { createBlankDraft } from "@/app/actions/course";
import { Notice } from "@/components/action-form";

/** Passe par un effet et non par la page : le préchargement d'un lien ne doit pas créer de brouillon. */
export function NewDocument({ subject, startImport, shared }: { subject: string | null; startImport: boolean; shared: boolean }) {
  const [error, setError] = useState("");
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void createBlankDraft(subject, startImport, shared).then((result) => { if (result?.error) setError(result.error); });
  }, [subject, startImport, shared]);
  return error ? <Notice tone="error">{error}</Notice> : <div className="mx-auto grid max-w-[42rem] gap-4 pt-16" aria-busy="true"><div className="frame-loading h-4 w-40 rounded" /><div className="frame-loading h-10 w-3/4 rounded" /><div className="frame-loading h-80 rounded-lg" /></div>;
}
