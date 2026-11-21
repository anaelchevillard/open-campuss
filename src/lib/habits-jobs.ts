import "server-only";
import { and, eq, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import { db, schema } from "./db";
import { notify } from "./notify";
import { lastDayOf, seasonOf, shouldAnnounceSeason } from "./seasons";

const { referrals, seasonAnnouncements, users, dailyQuests, friendInvites, cardReviews } = schema;

/** La clé primaire décide : un seul passage annonce la saison, même si le processus redémarre au milieu de la boucle horaire. */
export async function announceSeason(now = new Date()) {
  const season = seasonOf(now);
  const [fresh] = await db.insert(seasonAnnouncements).values({ season: season.key }).onConflictDoNothing().returning();
  if (!fresh || !shouldAnnounceSeason(season, now)) return;
  const people = await db.select({ id: users.id }).from(users).where(and(eq(users.status, "active"), isNotNull(users.programId), ne(users.role, "teacher")));
  for (const person of people) {
    await notify(person.id, { kind: "season", title: `La saison ${season.label} commence`, body: `Le classement repart de zéro, jusqu’au ${lastDayOf(season)}. Y figurer reste un choix.`, href: "/reviser/classement" });
  }
}

/** Le filleul a disparu sans jamais être activé : il ne reste rien à compter. */
export const sweepReferrals = () => db.delete(referrals).where(and(isNull(referrals.refereeId), isNull(referrals.creditedAt)));

/**
 * Ménage horaire de Réviser : quêtes de plus de 60 jours, liens d'ami expirés ou épuisés, notes de fiches de plus de 400 jours.
 * Les quêtes du jour se tirent à la première visite après 4 h (lib/habits.ts) : rien à préparer ici.
 */
export async function sweepRevision(now = new Date()) {
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
  await db.delete(dailyQuests).where(lt(dailyQuests.day, daysAgo(60).toISOString().slice(0, 10)));
  await db.delete(friendInvites).where(or(lt(friendInvites.expiresAt, now), lt(friendInvites.usesLeft, 1)));
  await db.delete(cardReviews).where(lt(cardReviews.at, daysAgo(400)));
}
