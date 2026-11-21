import "server-only";
import { and, count, eq, gt, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "./db";
import type { Invitation } from "./db/schema/admin";
import { domainBlocked, domainOf, emailHmac } from "./domains";
import { env } from "./env";
import { queueMail } from "./mail";
import { accountMails } from "@/lib/mail/catalog";
import { randomToken, tokenHash } from "./security";
import { getSetting } from "./site-settings";

const { invitations, bannedIdentities, users } = schema;

export const INVITE_DAYS = 14;

/** Tant que la file ne l'a pas envoyée, une invitation garde une empreinte de remplissage : le vrai jeton naît à l'envoi. */
export const placeholderHash = () => tokenHash(`file:${randomToken()}`);

export const inviteUrl = (token: string) => `${env.baseUrl}/invitation/${token}`;

/** Invitations envoyées depuis minuit : la file respecte le plafond quotidien de mails. */
export async function invitationsSentToday() {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const [row] = await db.select({ n: count() }).from(invitations).where(gte(invitations.sentAt, since));
  return row?.n ?? 0;
}

/** Envoie une invitation tout de suite (renvoi, ou file sous le plafond) : nouveau jeton, l'ancien ne vaut plus. */
export async function sendInvitation(inv: Invitation) {
  if (!inv.email) return;
  const token = randomToken();
  const [program] = inv.programId ? await db.select({ name: schema.programs.name }).from(schema.programs).where(eq(schema.programs.id, inv.programId)) : [];
  await db.update(invitations).set({ tokenHash: tokenHash(token), sentAt: new Date(), expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) }).where(eq(invitations.id, inv.id));
  await queueMail(inv.email, accountMails.invitation({ name: inv.name, programName: program?.name ?? "", message: inv.message, token, days: INVITE_DAYS }));
}

/** Boucle de fond : envoie les invitations en attente, dans la limite de mail.dailyLimit par jour. */
export async function flushInvitationQueue() {
  const limit = await getSetting("mail.dailyLimit");
  const room = Math.min(20, limit - await invitationsSentToday());
  if (room <= 0) return;
  const due = await db.select().from(invitations).where(and(isNull(invitations.sentAt), isNotNull(invitations.email), isNull(invitations.revokedAt), gt(invitations.expiresAt, new Date()))).orderBy(invitations.createdAt).limit(room);
  for (const inv of due) await sendInvitation(inv);
}

/** Purge : empreintes de bannissement de plus de 3 ans, invitations expirées depuis 6 mois. */
export async function purgeAdminLeftovers() {
  const now = new Date();
  await db.delete(bannedIdentities).where(or(lt(bannedIdentities.expiresAt, now), lt(bannedIdentities.createdAt, new Date(Date.now() - 3 * 365 * 86_400_000))));
  await db.delete(invitations).where(lt(invitations.expiresAt, new Date(Date.now() - 183 * 86_400_000)));
}

export async function isBanned(email: string) {
  const [row] = await db.select({ h: bannedIdentities.emailHmac }).from(bannedIdentities).where(eq(bannedIdentities.emailHmac, emailHmac(email, env.secretKey)));
  return Boolean(row);
}

/** Refus commun aux inscriptions : adresse bannie (empreinte) ou domaine refusé. Même texte : rien n'est révélé. */
export async function signupRefusal(email: string): Promise<string | null> {
  if (await isBanned(email)) return "Cette adresse ne peut pas être utilisée.";
  if (domainBlocked(email, await getSetting("registration.blockedDomains"))) return "Cette adresse ne peut pas être utilisée.";
  return null;
}

/** Invitation utilisable avec ce jeton : ni révoquée, ni expirée, ni épuisée. */
export async function usableInvitation(token: string) {
  if (!/^[\w-]{20,100}$/.test(token)) return null;
  const [inv] = await db.select().from(invitations).where(and(eq(invitations.tokenHash, tokenHash(token)), isNull(invitations.revokedAt), gt(invitations.expiresAt, new Date()), sql`${invitations.uses} < ${invitations.maxUses}`));
  return inv ?? null;
}

/** L'adresse respecte le domaine imposé par un lien ouvert. */
export const domainAllowed = (inv: Pick<Invitation, "allowedDomain">, email: string) => !inv.allowedDomain || domainOf(email) === inv.allowedDomain.toLowerCase();

/** Compte l'utilisation ; renvoie faux si quelqu'un d'autre a pris la dernière place entre-temps. */
export async function consumeInvitation(id: string) {
  const [row] = await db.update(invitations).set({ uses: sql`${invitations.uses} + 1`, acceptedAt: new Date() }).where(and(eq(invitations.id, id), sql`${invitations.uses} < ${invitations.maxUses}`)).returning({ id: invitations.id });
  return Boolean(row);
}

export async function registeredEmails(emails: string[]) {
  if (!emails.length) return new Set<string>();
  const rows = await db.select({ email: users.email }).from(users).where(inArray(users.email, emails));
  return new Set(rows.map((r) => r.email));
}
