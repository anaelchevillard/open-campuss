import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { and, eq, isNotNull, isNull, lt, ne, notLike, or, type SQL, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { scanDueFolders } from "./connected/scan";
import { runRequestDigest } from "./course-requests";
import { checkDisk } from "./disk-alert";
import { closeIdleNotes } from "./notes";
import { sweepDriveOrphans, syncDriveCopies } from "./drive";
import { abortMultipart, ensureBucket, uploadKey } from "./s3";
import { db, schema } from "./db";
import { env } from "./env";
import { archivePastSeasons } from "./gamification";
import { announceSeason, sweepReferrals, sweepRevision } from "./habits-jobs";
import { flushOutbox, queueMail } from "./mail";
import { authMails } from "@/lib/mail/catalog";
import { sweepOrphanFiles } from "./file-cleanup";
import { runFileJobs } from "./file-jobs";
import { runDueNotionSyncs } from "./notion";
import { runQuizJobs } from "./quiz";
import { runChosenHourReminders, runDailyReminders } from "./reminders/daily";
import { deleteUserAccount } from "./purge";
import { remindOverdueReviews } from "./review-reminder";
import { hashPassword } from "./security";
import { purgeExpiredTrash } from "./trash";
import { publishScheduledPosts } from "./blog";
import { markOwner } from "./admin-guards";
import { runAdminJobs } from "./admin-jobs";
import { sealTotpSecret } from "./totp-secret";
import { alertNewErrors } from "./errors/alert";
import { captureServerError } from "./errors/server";
import { RETENTION } from "./product-event-catalog";

async function bootstrapAdmin() {
  if (!env.adminEmail) return;
  // Le compte de ADMIN_EMAIL est le propriétaire : ni rétrogradable, ni suspendable, ni supprimable depuis l'interface
  await markOwner(env.adminEmail);
  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, "admin")).limit(1);
  if (existing) return;
  const password = randomBytes(18).toString("base64url");
  await mkdir(dirname(env.adminPasswordFile), { recursive: true });
  await writeFile(env.adminPasswordFile, `${password}\n`, { mode: 0o600 });
  await db.insert(schema.users).values({
    email: env.adminEmail, name: env.adminName, role: "admin", status: "active", mustChangePassword: true, isOwner: true,
    passwordHash: await hashPassword(password),
  });
  await db.insert(schema.auditLog).values({ actor: "système", action: "admin_créé", target: env.adminEmail });
}

/** Les secrets écrits avant le chiffrement : la clé n'existe pas côté SQL, donc la reprise se fait ici. Rejouable sans effet. */
async function sealLegacyTotpSecrets() {
  const { users } = schema;
  const legacy = await db.select({ id: users.id, secret: users.totpSecret }).from(users).where(and(isNotNull(users.totpSecret), notLike(users.totpSecret, "v1:%")));
  for (const { id, secret } of legacy) {
    await db.update(users).set({ totpSecret: sealTotpSecret(secret!) }).where(and(eq(users.id, id), eq(users.totpSecret, secret!)));
  }
  if (legacy.length) console.log(`secrets TOTP chiffrés : ${legacy.length}`);
}

async function cleanup() {
  const { sessions, oneTimeTokens, rateEvents, users, uploads, auditLog, reports, pageViews, attestations } = schema;
  const now = new Date();
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db.delete(oneTimeTokens).where(lt(oneTimeTokens.expiresAt, now));
  await db.delete(rateEvents).where(lt(rateEvents.at, new Date(Date.now() - 2 * 86_400_000)));
  // Passe par deleteUserAccount, comme toute suppression de compte : ses fichiers ne restent pas derrière lui
  const removeAccounts = async (where: SQL | undefined) => {
    const accounts = await db.select({ id: users.id, avatarKey: users.avatarKey }).from(users).where(where);
    for (const account of accounts) await deleteUserAccount(account);
  };
  // Inscription jamais confirmée : l'adresse redevient disponible
  await removeAccounts(and(eq(users.status, "unverified"), lt(users.createdAt, new Date(Date.now() - 3 * 86_400_000))));
  // Durées annoncées dans la politique de confidentialité
  const days = (n: number) => new Date(Date.now() - n * 86_400_000);
  await db.delete(auditLog).where(lt(auditLog.at, days(365)));
  // Le lien avec la personne disparaît à 6 mois ; le compteur anonyme reste 25 mois
  await db.update(pageViews).set({ userId: null, visitorId: null }).where(lt(pageViews.at, days(183)));
  await db.delete(pageViews).where(lt(pageViews.at, days(760)));
  // Totaux sans identifiant (durées de lecture, recherches sans résultat) : 25 mois et 1 an
  const day = (n: number) => days(n).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const counters = schema.audienceCounters;
  await db.delete(counters).where(or(and(eq(counters.kind, "time"), lt(counters.day, day(760))), and(eq(counters.kind, "miss"), lt(counters.day, day(365)))));
  await db.delete(attestations).where(lt(attestations.at, days(1830)));
  // Erreurs : 90 jours (exemples et groupes sans occurrence récente) ; événements produits : 13 mois liés à la
  // personne, 25 mois en totaux du jour sans identifiant
  await db.delete(schema.errorEvents).where(lt(schema.errorEvents.at, days(RETENTION.errorDays)));
  await db.delete(schema.errorGroups).where(lt(schema.errorGroups.lastSeen, days(RETENTION.errorDays)));
  await db.delete(schema.productEvents).where(lt(schema.productEvents.at, days(RETENTION.individualEventDays)));
  await db.delete(schema.productEventCounts).where(lt(schema.productEventCounts.day, day(RETENTION.dailyEventDays)));
  await db.delete(schema.notifications).where(lt(schema.notifications.createdAt, days(90)));
  await db.delete(reports).where(and(ne(reports.status, "open"), lt(reports.closedAt, days(365))));
  await removeAccounts(and(eq(users.status, "rejected"), lt(users.createdAt, days(180))));
  // Compte sans connexion : un mail d'avertissement 30 jours avant, et la suppression seulement si le mail est parti
  const lastSeen = sql`coalesce(${users.lastLoginAt}, ${users.createdAt})`;
  const toWarn = await db.select().from(users).where(and(ne(users.role, "admin"), isNull(users.inactivityWarnedAt), lt(lastSeen, days(1065))));
  for (const account of toWarn) {
    await queueMail(account.email, authMails.inactiveDeletion());
    await db.update(users).set({ inactivityWarnedAt: new Date() }).where(eq(users.id, account.id));
  }
  await removeAccounts(and(ne(users.role, "admin"), lt(users.inactivityWarnedAt, days(30)), lt(lastSeen, days(1095))));
  await archivePastSeasons();
  await announceSeason();
  await sweepReferrals();
  await purgeExpiredTrash();
  const stale = await db.select().from(uploads).where(lt(uploads.createdAt, new Date(Date.now() - 86_400_000)));
  for (const upload of stale) {
    await abortMultipart(uploadKey(upload.id), upload.s3UploadId);
    await db.delete(uploads).where(eq(uploads.id, upload.id));
  }
}

async function loop() {
  let lastCleanup = 0;
  // Parcourt tout le contenu : une fois par jour, et pas au démarrage qui a déjà assez à faire
  let lastSweep = Date.now() - 23 * 3_600_000;
  let lastDriveCopy = 0;
  let lastReminders = 0;
  let lastConnected = 0;
  let lastErrorAlert = 0;
  let busy = false;
  setInterval(async () => {
    if (busy) return; // une synchronisation Notion peut durer plus longtemps que l'intervalle
    busy = true;
    try {
      await flushOutbox();
      await runDueNotionSyncs();
      await runFileJobs();
      await runQuizJobs();
      await publishScheduledPosts();
      await runAdminJobs();
      // Nouvelle erreur ou pic : vérifié chaque minute, une alerte par heure au plus (lib/errors/alert.ts)
      if (Date.now() - lastErrorAlert > 60_000) {
        lastErrorAlert = Date.now();
        await alertNewErrors();
      }
      if (Date.now() - lastDriveCopy > 60_000) {
        lastDriveCopy = Date.now();
        await syncDriveCopies();
      }
      if (Date.now() - lastCleanup > 3_600_000) {
        lastCleanup = Date.now();
        await checkDisk();
        await remindOverdueReviews();
        await cleanup();
        await sweepDriveOrphans();
        await runRequestDigest();
        await closeIdleNotes();
        await sweepRevision();
      }
      // Hebdomadaire par dossier : ce tour ne fait qu'en prendre quelques-uns, ceux dont c'est l'heure
      if (Date.now() - lastConnected > 15 * 60_000) {
        lastConnected = Date.now();
        await scanDueFolders();
      }
      // Vérifie souvent, n'agit qu'une fois par jour : une tâche en échec reprend sans renvoyer ce qui est déjà parti
      if (Date.now() - lastReminders > 600_000) {
        lastReminders = Date.now();
        await runDailyReminders();
        await runChosenHourReminders();
      }
      if (Date.now() - lastSweep > 86_400_000) {
        lastSweep = Date.now();
        await sweepOrphanFiles();
      }
    } catch (error) {
      console.error("tâche de fond en échec", error);
      await captureServerError(error, { route: "tâche de fond" });
    } finally {
      busy = false;
    }
  }, 10_000);
}

export async function boot() {
  await migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
  // Sans la migration qui agrandit la colonne, l'écriture échoue : le site reste utilisable, la lecture accepte le clair
  await sealLegacyTotpSecrets().catch((error) => console.error("chiffrement des secrets TOTP en échec", error));
  await ensureBucket();
  await bootstrapAdmin();
  await loop();
  // État réel lu dans l'environnement du conteneur, jamais la clé : si app.env a changé sans effet, `docker compose restart` en est la cause (voir le README)
  console.log(`démarré (SMTP ${env.smtpEnabled ? "actif" : "inactif"}, Notion ${env.notionToken ? "actif" : "inactif"}, IA ${env.aiApiKey ? `active, ${env.aiModel}` : "sans clé"})`);
}
