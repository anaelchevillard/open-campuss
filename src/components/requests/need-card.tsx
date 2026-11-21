"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { voteNeed } from "@/app/actions/requests";
import { VoteButton } from "@/components/requests/request-vote";
import { toastError } from "@/lib/toast";
import { inSentence } from "@/lib/subject-name";

/** Un besoin détecté : rien n'existe encore, le premier vote en fait une demande. */
export function NeedCard({ subjectId, subjectName, category, label }: { subjectId: number; subjectName: string; category: string; label: string }) {
  const router = useRouter();
  const [voted, setVoted] = useState(false);
  const [, start] = useTransition();
  const vote = () => {
    if (voted) return;
    setVoted(true);
    start(async () => {
      const result = await voteNeed(subjectId, category);
      if (result.error) { setVoted(false); toastError(result.error); return; }
      router.refresh();
    });
  };
  return (
    <li className="flex gap-3 rounded-xl bg-card p-3 shadow-xs motion-ok:animate-rise md:gap-4 md:p-4">
      <VoteButton voted={voted} votes={voted ? 1 : 0} onClick={vote} />
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="font-semibold text-pretty">{label}</p>
        <p className="text-sm text-muted-foreground">{inSentence(subjectName)} · personne ne l’a encore partagé</p>
      </div>
    </li>
  );
}
