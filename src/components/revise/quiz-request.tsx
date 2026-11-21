"use client";

import { useState } from "react";
import { requestSubjectQuizzes } from "@/app/actions/mock-exam";
import { AiButton } from "@/components/ai/ai-button";
import { Icon } from "@/components/icon";
import { IconDone, IconError } from "@/lib/icons";

/** « Générer les quiz avec Campuss IA » : un appui, puis la réponse sur place. */
export function QuizRequestButton({ subjectId, count }: { subjectId: number; count: number }) {
  const [pending, setPending] = useState(false);
  const [reply, setReply] = useState<{ ok: string } | { error: string } | null>(null);
  const ask = async () => {
    setPending(true);
    setReply(await requestSubjectQuizzes(subjectId).catch(() => ({ error: "Connexion perdue, réessaie." })));
    setPending(false);
  };
  if (reply && "ok" in reply) return <p role="status" className="flex items-center gap-1.5 text-sm text-success-foreground"><Icon icon={IconDone} size={16} />{reply.ok}</p>;
  return (
    <div className="grid justify-items-start gap-2">
      <AiButton busy={pending} disabled={pending} onClick={() => void ask()}>Générer {count > 1 ? `les ${count} quiz` : "le quiz"} avec Campuss IA</AiButton>
      {reply && "error" in reply && <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive-foreground"><Icon icon={IconError} size={16} />{reply.error}</p>}
    </div>
  );
}
