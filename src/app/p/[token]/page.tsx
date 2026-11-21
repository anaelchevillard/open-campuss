import { and, eq, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { cn } from "cn";
import { PublicShell } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";
import { canRead } from "@/lib/access-server";
import { clientIp, currentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { rateHit, rateLimited } from "@/lib/security";
import { inSentence } from "@/lib/subject-name";

const { documents, programs, shareLinks, subjects, userHabits } = schema;

const PRIVATE = { robots: { index: false, follow: false }, referrer: "no-referrer" } as const;

/** Seules ces colonnes sont lues : le contenu du cours ne peut pas fuiter par cette page. */
const loadShare = cache(async (token: string) => {
  if (!/^[\w-]{43}$/.test(token)) return null;
  const key = `share-view:${await clientIp()}`;
  if (await rateLimited(key, 120, 60)) return "limited" as const;
  await rateHit(key);
  const [row] = await db.select({
    title: documents.title, published: documents.published, hidden: documents.hiddenByReports, reviewRequested: documents.reviewRequested, documentId: documents.id, programId: documents.programId, kind: documents.kind, createdBy: documents.createdBy, subjectId: documents.subjectId,
    program: programs.name, subject: subjects.name, inviteCode: userHabits.inviteCode,
  }).from(shareLinks).innerJoin(documents, eq(shareLinks.documentId, documents.id)).innerJoin(programs, eq(documents.programId, programs.id))
    .leftJoin(subjects, eq(documents.subjectId, subjects.id)).leftJoin(userHabits, eq(userHabits.userId, shareLinks.createdBy))
    .where(and(eq(shareLinks.token, token), isNull(shareLinks.revokedAt), isNull(documents.deletedAt)));
  // Un cours retiré ou masqué après le partage ne s'annonce plus
  return row && row.published && !row.hidden ? row : null;
});

export async function generateMetadata({ params }: PageProps<"/p/[token]">): Promise<Metadata> {
  const share = await loadShare((await params).token);
  if (!share || share === "limited") return { title: "Campuss", ...PRIVATE };
  const description = [inSentence(share.subject), share.program].filter(Boolean).join(", ");
  return { title: share.title, description, openGraph: { title: share.title, description }, ...PRIVATE };
}

export default async function SharedCoursePage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const share = await loadShare(token);
  if (share === "limited") return <PublicShell title="Trop de demandes"><p className="text-muted-foreground">Réessaie dans un moment.</p></PublicShell>;
  if (!share) notFound();
  const user = await currentUser();
  const readable = user ? await canRead(user, { id: share.documentId, kind: share.kind, programId: share.programId, published: share.published, createdBy: share.createdBy, subjectId: share.subjectId, hiddenByReports: share.hidden, reviewRequested: share.reviewRequested }) : false;
  return (
    <PublicShell>
      <p className="text-sm text-muted-foreground">Un cours partagé sur Campuss</p>
      <h1 className="display-2 mt-1 wrap-break-word">{share.title}</h1>
      <p className="mt-2 font-semibold">{[share.subject, share.program].filter(Boolean).join(", ")}</p>
      {user ? (
        readable
          ? <Link href={`/d/${share.documentId}`} data-slot="button" className={cn(buttonVariants(), "mt-6")}>Ouvrir le cours</Link>
          : <p className="mt-6 text-muted-foreground">Ce cours est réservé aux étudiants de cette licence.</p>
      ) : (
        <>
          <p className="mt-6 text-muted-foreground">Le contenu est réservé aux étudiants de cette licence, une fois leur compte validé.</p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Link href={share.inviteCode ? `/register?ref=${share.inviteCode}` : "/register"} data-slot="button" className={buttonVariants()}>Créer mon compte</Link>
            <Link className="text-sm underline underline-offset-2" href={`/login?next=${encodeURIComponent(`/p/${token}`)}`}>J’ai déjà un compte</Link>
          </div>
        </>
      )}
    </PublicShell>
  );
}
