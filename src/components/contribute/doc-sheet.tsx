"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "cn";
import { documentSheet } from "@/app/actions/documents";
import { Icon } from "@/components/icon";
import { ReviewThreadView } from "@/components/review/review-thread-view";
import { Stat } from "@/components/stat";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useCoarsePointer, useMedia } from "@/hooks/use-media";
import { IconEdit, IconEye, IconFavorite, IconRequests, IconRevisionPending } from "@/lib/icons";
import { formatRating, type MyDoc } from "@/lib/my-documents";
import { hrefOf } from "./doc-menu";

type SheetData = Awaited<ReturnType<typeof documentSheet>>;

const short = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

/** Feuille d'un document : à droite à la souris sur grand écran, en bas sinon. Chiffres, fil avec le relecteur, corrections. */
export function DocSheet({ doc, onClose, viewerId }: { doc: MyDoc | null; onClose: () => void; viewerId: string }) {
  const wide = useMedia("(min-width: 768px)");
  const coarse = useCoarsePointer();
  const side = wide && !coarse ? "right" : "bottom";
  const open = doc !== null;
  useBackToClose(open, onClose);
  const [data, setData] = useState<{ id: string; value: SheetData } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const id = doc?.id;
  useEffect(() => {
    if (!id) return;
    let live = true;
    documentSheet(id).then((value) => { if (live) setData({ id, value }); }, () => { if (live) setFailed(id); });
    return () => { live = false; };
  }, [id]);
  const current = data && data.id === id ? data.value : null;
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side={side} className={cn("gap-0 overflow-y-auto", side === "right" ? "sm:max-w-[30rem]" : "max-h-[90dvh]")}>
        {doc && (
          <>
            <SheetHeader className="gap-2 border-b border-border p-4 pr-12 md:p-6 md:pr-14">
              <SheetTitle className="text-balance">{doc.title.trim() || "Sans titre"}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <StatusBadge status={doc.status} size="default" />
                {doc.subject && <span>{doc.subject}</span>}
              </SheetDescription>
              {doc.status !== "trash" && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link href={hrefOf(doc)} data-slot="button" className={buttonVariants({ variant: "outline", size: "sm" })}><Icon icon={IconEye} size={16} />Ouvrir</Link>
                  {doc.kind === "editor" && <Link href={`/editer/${doc.id}`} data-slot="button" className={buttonVariants({ variant: "ghost", size: "sm" })}><Icon icon={IconEdit} size={16} />Modifier</Link>}
                </div>
              )}
            </SheetHeader>
            <div className="grid gap-8 p-4 pb-8 md:p-6">
              {failed === doc.id ? <p className="text-sm text-muted-foreground">Impossible de charger les détails, réessaie dans un instant</p> : !current ? <SheetSkeleton /> : (
                <>
                  {doc.published && <Readers data={current} doc={doc} />}
                  {current.revisions.length > 0 && (
                    <section className="grid gap-2">
                      <h3 className="heading">Corrections proposées</h3>
                      <ul className="grid gap-2">
                        {current.revisions.map((r) => (
                          <li key={r.id} className="flex items-start gap-2 text-sm"><Icon icon={IconRevisionPending} size={16} className="mt-0.5 text-brand-text" />
                            <span><span className="font-semibold">{r.author ?? "Ancien compte"}</span> · {short(r.createdAt)}{r.summary && <span className="block text-muted-foreground">{r.summary}</span>}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <section className="grid gap-3">
                    <h3 className="heading">Relecture</h3>
                    <ReviewThreadView documentId={doc.id} events={current.events} viewerId={viewerId} compact waitingSince={doc.waitingSince} />
                  </section>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Readers({ data, doc }: { data: SheetData; doc: MyDoc }) {
  const max = Math.max(1, ...data.stats.perWeek);
  const total = data.stats.perWeek.reduce((a, b) => a + b, 0);
  return (
    <>
      <section className="grid grid-cols-3 gap-4">
        <Stat value={doc.readers.toLocaleString("fr-FR")} label={doc.readers > 1 ? "lecteurs" : "lecteur"} />
        <Stat value={doc.ratingAvg === null ? "–" : formatRating(doc.ratingAvg)} label={doc.ratingCount ? `${doc.ratingCount} note${doc.ratingCount > 1 ? "s" : ""}` : "pas de note"} />
        <Stat value={doc.openQuestions} label={doc.openQuestions > 1 ? "questions" : "question"} hint="sans réponse" />
      </section>
      <section className="grid gap-2">
        <h3 className="heading">Nouveaux lecteurs</h3>
        <figure className="grid gap-1" aria-label={`${total} nouveaux lecteurs en 8 semaines`}>
          <div className="flex h-24 items-end gap-1.5" aria-hidden>
            {data.stats.perWeek.map((n, i) => (
              <span key={i} title={`${n}`} className={cn("flex-1 origin-bottom rounded-t-sm motion-ok:animate-[grow_var(--dur-reward)_var(--ease-out)_both]", i === 7 ? "bg-brand-text" : "bg-brand-text/35")}
                style={{ height: `${Math.max(4, (n / max) * 100)}%`, animationDelay: `${i * 30}ms` }} />
            ))}
          </div>
          <figcaption className="flex justify-between text-xs text-muted-foreground"><span>il y a 8 semaines</span><span>cette semaine</span></figcaption>
        </figure>
      </section>
      {data.stats.ratings && (
        <section className="grid gap-2">
          <h3 className="heading">Notes</h3>
          <ul className="grid gap-1">
            {[5, 4, 3, 2, 1].map((stars) => {
              const n = data.stats.ratings![stars - 1];
              return (
                <li key={stars} className="grid grid-cols-[2.5rem_1fr_2rem] items-center gap-2 text-sm">
                  <span className="flex items-center gap-1 tabular-nums">{stars}<Icon icon={IconFavorite} size={16} filled className="size-3.5 text-muted-foreground" /></span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-brand-text/70" style={{ width: `${(n / data.stats.ratingCount) * 100}%` }} /></span>
                  <span className="text-right text-muted-foreground tabular-nums">{n}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {data.stats.questions.length > 0 && (
        <section className="grid gap-2">
          <h3 className="heading">Questions sans réponse</h3>
          <ul className="grid gap-1">
            {data.stats.questions.map((q) => (
              <li key={q.id}><Link href={`/d/${doc.id}#questions`} className="flex items-start gap-2 rounded-lg p-2 text-sm hover:bg-muted"><Icon icon={IconRequests} size={16} className="mt-0.5 text-muted-foreground" /><span className="line-clamp-2">{q.body}</span></Link></li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function SheetSkeleton() {
  return (
    <div className="grid gap-4" aria-busy>
      <div className="grid grid-cols-3 gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      <Skeleton className="h-24" />
      <Skeleton className="h-16" />
    </div>
  );
}
