import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, inArray, lt, lte } from "drizzle-orm";
import nodemailer from "nodemailer";
import { db, schema } from "./db";
import { isDemo } from "./demo";
import { env } from "./env";
import { legacyMail, type MailCategory, type MailContent, type QueuedMail } from "./mail/content";
import { batchKeyOf, batchSendAt, digestMail, DIGEST_MAX } from "./mail/digest";
import { FALLBACK_FROM, mailHeaders } from "./mail/headers";
import { renderMail, siteUrl } from "./mail/render";

export type QueueOptions = {
  category?: MailCategory; unsubscribePath?: string;
  /**
   * Non urgent : attend jusqu'à 10 minutes et part en un seul récapitulatif avec les autres mails regroupables de la
   * même personne (lib/mail/digest.ts). Jamais pour la sécurité ou le compte, qui partent seuls et tout de suite.
   */
  batch?: boolean;
};

/**
 * Met un mail en file. Seule la donnée est gardée : le gabarit la met en forme à l'envoi.
 * Un mail non transactionnel porte son chemin de désinscription (/api/desabonnement/<jeton>).
 */
export async function queueMail(recipient: string, mail: MailContent, options: QueueOptions = {}) {
  // Démonstration : les adresses sont fictives, aucun mail n'est mis en file
  if (isDemo()) return;
  const subject = `${env.siteName} : ${mail.subject}`.slice(0, 200);
  const content: QueuedMail = { ...mail, subject, category: options.category ?? "transactional", ...(options.unsubscribePath ? { unsubscribePath: options.unsubscribePath } : {}) };
  if (!options.batch) {
    await db.insert(schema.outbox).values({ recipient, subject, content });
    return;
  }
  // Rejoint le groupe déjà en attente pour cette personne, sinon ouvre une fenêtre de 10 minutes
  const batchKey = batchKeyOf(content);
  const [pending] = await db.select({ at: schema.outbox.nextAttemptAt }).from(schema.outbox)
    .where(and(eq(schema.outbox.recipient, recipient), eq(schema.outbox.batchKey, batchKey), eq(schema.outbox.attempts, 0), gt(schema.outbox.nextAttemptAt, new Date())))
    .orderBy(asc(schema.outbox.nextAttemptAt)).limit(1);
  await db.insert(schema.outbox).values({ recipient, subject, content, batchKey, nextAttemptAt: batchSendAt(pending?.at, new Date(), env.mailBatchMs) });
}

/** Les files de l'équipe (cours à valider, signalements…) se regroupent ; une alerte (`batch: false`) part tout de suite. */
export async function notifyAdmins(mail: MailContent, { batch = true }: { batch?: boolean } = {}) {
  const admins = await db.select({ email: schema.users.email }).from(schema.users)
    .where(and(eq(schema.users.role, "admin"), eq(schema.users.status, "active")));
  const recipients = new Set(admins.map((a) => a.email));
  if (env.adminEmail) recipients.add(env.adminEmail);
  for (const recipient of recipients) await queueMail(recipient, mail, { category: "admin", batch });
}

type OutboxRow = typeof schema.outbox.$inferSelect;

/** Le groupe d'un mail dû : lui seul, ou tous les mails regroupables dus de la même personne et de la même clé. */
async function groupOf(mail: OutboxRow, now: Date): Promise<OutboxRow[]> {
  if (!mail.batchKey) return [mail];
  const rows = await db.select().from(schema.outbox)
    .where(and(eq(schema.outbox.recipient, mail.recipient), eq(schema.outbox.batchKey, mail.batchKey), lte(schema.outbox.nextAttemptAt, now)))
    .orderBy(asc(schema.outbox.id)).limit(DIGEST_MAX);
  return rows.some((r) => r.id === mail.id) ? rows : [mail, ...rows.slice(0, DIGEST_MAX - 1)];
}

/** Envoi différé : la réponse HTTP ne dépend pas du SMTP et son délai ne révèle pas si un compte existe. */
export async function flushOutbox() {
  await db.delete(schema.outbox).where(lt(schema.outbox.createdAt, new Date(Date.now() - 7 * 86_400_000)));
  if (!env.smtpEnabled || isDemo()) return;
  const due = await db.select().from(schema.outbox).where(lte(schema.outbox.nextAttemptAt, new Date()))
    .orderBy(asc(schema.outbox.id)).limit(20);
  if (!due.length) return;
  const transport = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    requireTLS: env.smtpPort !== 465 && !env.smtpInsecure,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPassword } : undefined,
    connectionTimeout: 20_000,
  });
  const from = env.smtpFrom || FALLBACK_FROM;
  const ctx = { baseUrl: env.baseUrl, siteName: env.siteName };
  const now = new Date();
  const done = new Set<number>();
  for (const first of due) {
    if (done.has(first.id)) continue;
    const group = (await groupOf(first, now)).filter((row) => !done.has(row.id));
    for (const row of group) done.add(row.id);
    const ids = group.map((row) => row.id);
    const mail = { ...first, attempts: Math.max(...group.map((row) => row.attempts)) };
    try {
      const content = digestMail(group.map((row) => row.content ?? legacyMail(row.subject, row.body ?? "")), env.siteName);
      const { html, text } = renderMail(content, ctx);
      const unsubscribeUrl = content.unsubscribePath ? siteUrl(ctx.baseUrl, content.unsubscribePath) : undefined;
      const { messageId, headers } = mailHeaders({ from, category: content.category, unsubscribeUrl, id: randomUUID(), siteHost: new URL(ctx.baseUrl).host });
      // Nodemailer encode les en-têtes : un nom contenant un saut de ligne ne peut pas en ajouter.
      // Pas de Reply-To : l'adresse d'envoi n'est pas lue, le pied de page renvoie vers /contact.
      await transport.sendMail({
        from: { name: env.siteName, address: from }, to: mail.recipient, subject: content.subject, text, html, messageId, date: new Date(), headers,
      });
      await db.delete(schema.outbox).where(inArray(schema.outbox.id, ids));
    } catch (error) {
      const attempts = mail.attempts + 1;
      console.warn(`mail : échec de l'envoi, tentative ${attempts}`, (error as Error).message);
      await db.update(schema.outbox).set({
        attempts, lastError: String((error as Error).message).slice(0, 500),
        nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000),
      }).where(inArray(schema.outbox.id, ids));
    }
  }
  transport.close();
}
