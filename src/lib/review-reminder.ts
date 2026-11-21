import "server-only";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { canModerate } from "./access";
import { db, schema } from "./db";
import { notify } from "./notify";

const { documents, users } = schema;

/** La ligne est marquée d'abord : un rappel perdu vaut mieux qu'un rappel envoyé à chaque tour. */
export async function remindOverdueReviews(now = new Date()) {
  const due = await db.update(documents).set({ reviewReminderAt: now }).where(and(
    eq(documents.reviewRequested, true), eq(documents.published, false), isNull(documents.reviewReminderAt), lt(documents.reviewRequestedAt, new Date(now.getTime() - 86_400_000)),
  )).returning({ id: documents.id, title: documents.title, programId: documents.programId });
  if (!due.length) return;
  const moderators = await db.select({ id: users.id, role: users.role, programId: users.programId }).from(users).where(and(eq(users.status, "active"), inArray(users.role, ["admin", "delegate"])));
  for (const doc of due) {
    for (const moderator of moderators) {
      if (canModerate(moderator, doc)) await notify(moderator.id, { kind: "alert", title: "Un cours attend depuis plus de 24 h", body: `« ${doc.title} » attend sa validation.`, href: "/moderation" });
    }
  }
}
