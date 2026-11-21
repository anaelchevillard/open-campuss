import Link from "next/link";
import { deleteCourseRequest, draftForRequest } from "@/app/actions/requests";
import { Icon } from "@/components/icon";
import { RequestVote } from "@/components/requests/request-vote";
import { Badge } from "@/components/reui/badge";
import { Submit } from "@/components/submit";
import { buttonVariants } from "@/components/ui/button";
import { ageLabel, REQUEST_BONUS } from "@/lib/course-request-rules";
import type { RequestView } from "@/lib/course-requests";
import { IconCredits, IconSuccess } from "@/lib/icons";

/** Une demande : le vote à gauche, le texte, la matière et l'âge, puis « J'ai ce cours ». Jamais le nom de qui demande. */
export function RequestCard({ request, showSubject = true }: { request: RequestView; showSubject?: boolean }) {
  const meta = [showSubject ? request.subjectName : null, request.mine ? "Ta demande" : null, ageLabel(request.createdAt)].filter(Boolean).join(" · ");
  return (
    <li className="flex gap-3 rounded-xl bg-card p-3 shadow-xs motion-ok:animate-rise md:gap-4 md:p-4">
      {request.answer
        ? <span className="flex min-h-11 min-w-12 shrink-0 items-center justify-center self-start rounded-lg bg-success-tint text-success-foreground"><Icon icon={IconSuccess} label="Résolue" /></span>
        : <RequestVote id={request.id} voted={request.voted} votes={request.votes} />}
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="font-semibold text-pretty wrap-break-word">{request.text}</p>
        <p className="text-sm text-muted-foreground">{meta}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 empty:hidden">
          {request.answer ? (
            <Link href={`/d/${request.answer.id}`} data-slot="button" className={buttonVariants({ variant: "outline", size: "sm" })}>Lire le cours</Link>
          ) : (
            <>
              <form action={draftForRequest}><input type="hidden" name="id" value={request.id} /><Submit size="sm" variant="outline">{request.drafting ? "Reprendre mon brouillon" : "J’ai ce cours"}</Submit></form>
              {!request.mine && <Badge variant="success-light" size="lg" radius="full" className="tabular-nums"><Icon icon={IconCredits} size={16} />+{REQUEST_BONUS} crédits</Badge>}
            </>
          )}
          {request.removable && <form action={deleteCourseRequest} className="ml-auto"><input type="hidden" name="id" value={request.id} /><Submit size="sm" variant="ghost" aria-label={`Retirer la demande : ${request.text}`}>Retirer</Submit></form>}
        </div>
      </div>
    </li>
  );
}

export function RequestList({ requests, showSubject = true, label }: { requests: RequestView[]; showSubject?: boolean; label?: string }) {
  if (!requests.length) return null;
  return <ul aria-label={label} className="stagger grid gap-2">{requests.map((r) => <RequestCard key={r.id} request={r} showSubject={showSubject} />)}</ul>;
}
