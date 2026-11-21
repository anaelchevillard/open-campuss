import "server-only";
import { and, desc, eq, gt, isNull, lte, notExists, or } from "drizzle-orm";
import { db, schema } from "./db";
import type { User } from "./db/schema";
import type { Announcement, AnnouncementAudience } from "./db/schema/admin";

const { announcements, announcementDismissals } = schema;
const TONE_RANK = { critical: 0, warning: 1, info: 2 } as const;

/** Le public visé : vide = tout le monde ; sinon chaque critère renseigné doit correspondre. */
export function inAudience(audience: AnnouncementAudience, user: Pick<User, "programId" | "level" | "role">) {
  if (audience.programIds?.length && !(user.programId && audience.programIds.includes(user.programId))) return false;
  if (audience.levels?.length && !(user.level && audience.levels.includes(user.level))) return false;
  if (audience.roles?.length && !audience.roles.includes(user.role)) return false;
  return true;
}

/** L'annonce à montrer : la plus grave, puis la plus récente, non masquée par la personne. */
export async function announcementFor(user: Pick<User, "id" | "programId" | "level" | "role">): Promise<Announcement | null> {
  const now = new Date();
  const rows = await db.select().from(announcements).where(and(
    lte(announcements.startsAt, now), or(isNull(announcements.endsAt), gt(announcements.endsAt, now)),
    notExists(db.select().from(announcementDismissals).where(and(eq(announcementDismissals.announcementId, announcements.id), eq(announcementDismissals.userId, user.id)))),
  )).orderBy(desc(announcements.createdAt)).limit(20);
  return rows.filter((a) => inAudience(a.audience, user)).sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone])[0] ?? null;
}
