import { and, count, eq, gt, isNull, ne, sql } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { categoryCountsLabel, countsByKey } from "@/lib/category-counts";
import { recordVisit } from "@/lib/notification-state";

const { documents, notificationState, subjects } = schema;
const SHOWN_DAYS = 7;

/** Ce qui est arrivé pendant l'absence, en puces sous « Nouveautés » ; rien sur l'absence elle-même. */
export async function ReturnBlock({ user }: { user: User }) {
  if (!user.programId) return null;
  await recordVisit(user.id).catch((error) => console.error("dernière visite non enregistrée", error));
  const [state] = await db.select({ from: notificationState.returnedFrom }).from(notificationState).where(and(eq(notificationState.userId, user.id), gt(notificationState.returnedAt, sql`now() - make_interval(days => ${SHOWN_DAYS})`)));
  if (!state?.from) return null;
  const rows = await db.select({ id: subjects.id, name: subjects.shortName, category: documents.category, n: count() }).from(documents).innerJoin(subjects, eq(documents.subjectId, subjects.id))
    .where(and(eq(documents.programId, user.programId), eq(documents.published, true), isNull(documents.deletedAt), eq(documents.hiddenByReports, false), gt(documents.publishedAt, state.from), ne(documents.createdBy, user.id)))
    .groupBy(subjects.id, subjects.shortName, documents.category).orderBy(subjects.shortName);
  if (!rows.length) return null;
  // « +2 CM +1 fiche » plutôt qu'un total où une fiche compterait comme un cours
  const counts = countsByKey(rows.map((r) => ({ key: r.id, category: r.category, n: r.n })));
  const subjectsSeen = [...new Map(rows.map((r) => [r.id, r] as const)).values()];
  return (
    <ul aria-label="Depuis ta dernière visite" className="flex flex-wrap gap-1.5">
      {subjectsSeen.map((row) => (
        <li key={row.id}>
          <Link href={`/matieres/${row.id}`} className="flex min-h-8 items-center gap-1 rounded-full bg-brand-tint px-3 text-sm font-semibold text-brand-text coarse:min-h-11">
            {row.name}<span className="tabular-nums">{categoryCountsLabel(counts.get(row.id) ?? {}, { prefix: "+", separator: " " })}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
