import "server-only";
import { and, count, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { db, schema } from "./db";
import type { User } from "./db/schema";
import { statsOf } from "./gamification";
import { shellCache, type ShellCounters } from "./shell-cache";

const { documents, friendships, memoCardReports, notifications, reports, revisionMembers, revisions, userBadges, users } = schema;

async function loadCounters(user: User, scope: string): Promise<ShellCounters> {
  const moderator = user.role === "admin" || user.role === "delegate";
  const programScope = user.role === "admin" ? undefined : eq(documents.programId, user.programId ?? -1);
  const none = [{ n: 0 }];
  const [unseen, stats, [review], [pendingRevisions], [memoErrors], [pending], [open], [invites], [friends], [unread], [groupInvites], [postReview], [dueCards]] = await Promise.all([
    db.select({ badge: userBadges.badge }).from(userBadges).where(and(eq(userBadges.userId, user.id), eq(userBadges.seen, false), isNull(userBadges.revokedAt))),
    statsOf(user),
    moderator ? db.select({ n: count() }).from(documents).where(and(eq(documents.reviewRequested, true), isNull(documents.deletedAt), programScope)) : none,
    moderator ? db.select({ n: count() }).from(revisions).innerJoin(documents, eq(revisions.documentId, documents.id)).where(and(eq(revisions.status, "pending"), programScope)) : none,
    moderator ? db.select({ n: count() }).from(memoCardReports).innerJoin(documents, eq(memoCardReports.documentId, documents.id)).where(and(eq(memoCardReports.status, "open"), programScope)) : none,
    user.role === "admin" ? db.select({ n: count() }).from(users).where(eq(users.status, "pending")) : none,
    user.role === "admin" ? db.select({ n: count() }).from(reports).where(eq(reports.status, "open")) : none,
    db.select({ n: count() }).from(revisionMembers).where(and(eq(revisionMembers.userId, user.id), eq(revisionMembers.status, "pending"))),
    db.select({ n: count() }).from(friendships).where(and(eq(friendships.addresseeId, user.id), eq(friendships.status, "pending"))),
    db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))),
    db.select({ n: count() }).from(schema.studyGroupMembers).where(and(eq(schema.studyGroupMembers.userId, user.id), eq(schema.studyGroupMembers.status, "pending"))),
    moderator ? db.select({ n: count() }).from(documents).where(and(eq(documents.published, true), isNull(documents.deletedAt), isNotNull(documents.postReviewAt), programScope)) : none,
    db.select({ n: count() }).from(schema.flashcards).where(and(eq(schema.flashcards.userId, user.id), lte(schema.flashcards.dueAt, new Date()), isNull(schema.flashcards.suspendedAt))),
  ]);
  return {
    scope, credits: stats.credits, unseenBadges: unseen.map((row) => row.badge),
    toReview: review.n + pendingRevisions.n + memoErrors.n + postReview.n, pendingAccounts: pending.n, openReports: open.n, invites: invites.n, friendRequests: friends.n + groupInvites.n, unreadNotifications: unread.n, dueCards: dueCards.n,
  };
}

/** Les compteurs de la barre latérale, refaits à chaque page sinon. La clé est le compte : rien n'est partagé entre personnes. */
export async function shellCounters(user: User) {
  const scope = `${user.role}:${user.programId ?? ""}`;
  const cached = await shellCache.getOrLoad(user.id, () => loadCounters(user, scope));
  if (cached.scope === scope) return cached;
  shellCache.delete(user.id);
  return shellCache.getOrLoad(user.id, () => loadCounters(user, scope));
}
