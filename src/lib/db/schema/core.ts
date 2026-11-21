import { sql, type SQL } from "drizzle-orm";
import type { QueuedMail } from "../../mail/content";
import type { Prefs } from "../../prefs";
import {
  type AnyPgColumn, bigint, bigserial, boolean, check, customType, index, integer, jsonb, pgTable, primaryKey, real, serial, smallint, text, timestamp, unique, uniqueIndex, uuid, varchar,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const programs = pgTable("programs", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 80 }).notNull(),
  // Une licence inactive n'est pas proposée à l'inscription
  active: boolean("active").notNull().default(false),
  position: integer("position").notNull().default(0),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 254 }).notNull().unique(),
  name: varchar("name", { length: 80 }).notNull(),
  message: varchar("message", { length: 500 }).notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  // unverified -> pending -> active | rejected ; active <-> disabled
  status: varchar("status", { length: 16, enum: ["unverified", "pending", "active", "rejected", "disabled", "banned"] }).notNull().default("unverified"),
  // delegate : modère sa licence. teacher : voit les documents des matières qui lui sont rattachées.
  role: varchar("role", { length: 16, enum: ["member", "contributor", "delegate", "teacher", "admin"] }).notNull().default("member"),
  prefs: jsonb("prefs").$type<Prefs>().notNull().default({}),
  // Accord de suivi : suit le compte d'un appareil à l'autre
  trackingConsent: varchar("tracking_consent", { length: 3 }),
  onboardedAt: ts("onboarded_at"),
  pendingEmail: varchar("pending_email", { length: 254 }),
  inactivityWarnedAt: ts("inactivity_warned_at"),
  // Le droit de lecture dépend de la licence, que seul un administrateur peut changer
  programId: integer("program_id").references(() => programs.id, { onDelete: "set null" }),
  level: integer("level"),
  bio: varchar("bio", { length: 280 }).notNull().default(""),
  pronouns: varchar("pronouns", { length: 30 }).notNull().default(""),
  avatarKey: varchar("avatar_key", { length: 80 }),
  favoriteSubjectId: integer("favorite_subject_id").references(() => subjects.id, { onDelete: "set null" }),
  // Le classement est un choix explicite : personne n'y figure sans l'avoir demandé
  showInRanking: boolean("show_in_ranking").notNull().default(false),
  termsVersion: varchar("terms_version", { length: 16 }),
  termsAcceptedAt: ts("terms_accepted_at"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  // Chiffré : voir totp-secret.ts
  totpSecret: varchar("totp_secret", { length: 255 }),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  totpLastCounter: bigint("totp_last_counter", { mode: "number" }).notNull().default(0),
  // Le seul moyen de trouver quelqu'un : il donne son code, il n'existe pas d'annuaire
  friendCode: varchar("friend_code", { length: 10 }).notNull().unique().default(sql`upper(substr(md5(gen_random_uuid()::text), 1, 10))`),
  createdAt: ts("created_at").notNull().defaultNow(),
  lastLoginAt: ts("last_login_at"),
  // Compte du propriétaire du site (ADMIN_EMAIL) : personne ne peut le rétrograder, le suspendre ni le supprimer
  isOwner: boolean("is_owner").notNull().default(false),
  suspendedUntil: ts("suspended_until"),
  suspensionReason: varchar("suspension_reason", { length: 500 }),
  // Montré à la personne suspendue, à la différence du motif interne
  suspensionMessage: varchar("suspension_message", { length: 500 }),
  // Mot de passe provisoire créé par un administrateur : valable 72 h
  provisionalExpiresAt: ts("provisional_expires_at"),
  deletionScheduledAt: ts("deletion_scheduled_at"),
  invitedBy: uuid("invited_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  // Sans clé étrangère : l'invitation peut être purgée sans toucher au compte
  invitationId: uuid("invitation_id"),
}, (t) => [index("users_status_idx").on(t.status)]);

export const sessions = pgTable("sessions", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  mfaPending: boolean("mfa_pending").notNull().default(false),
  // Dernier second facteur donné dans cette session : voir lib/step-up.ts
  stepUpAt: ts("step_up_at"),
  userAgent: varchar("user_agent", { length: 200 }).notNull().default(""),
  ip: varchar("ip", { length: 45 }).notNull().default(""),
  lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)]);

export const oneTimeTokens = pgTable("tokens", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: varchar("purpose", { length: 16, enum: ["verify", "reset", "email"] }).notNull(),
  expiresAt: ts("expires_at").notNull(),
});

export const rateEvents = pgTable("rate_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  key: varchar("key", { length: 320 }).notNull(),
  at: ts("at").notNull().defaultNow(),
}, (t) => [index("rate_key_at_idx").on(t.key, t.at)]);

export const outbox = pgTable("outbox", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  recipient: varchar("recipient", { length: 254 }).notNull(),
  subject: varchar("subject", { length: 200 }).notNull(),
  // Ancien format (texte brut) : vide pour toute ligne mise en file depuis le gabarit HTML, à supprimer après la reprise
  body: text("body"),
  // Le mail comme donnée (titre, blocs, chemins) : mis en forme au moment de l'envoi
  content: jsonb("content").$type<QueuedMail>(),
  attempts: integer("attempts").notNull().default(0),
  lastError: varchar("last_error", { length: 500 }),
  createdAt: ts("created_at").notNull().defaultNow(),
  nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
  // Mail regroupable (lib/mail/digest.ts) : catégorie et désinscription ; vide pour la sécurité et le compte, envoyés seuls
  batchKey: varchar("batch_key", { length: 300 }),
}, (t) => [index("outbox_batch_idx").on(t.recipient, t.batchKey)]);

export const subjects = pgTable("subjects", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
  level: integer("level").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  shortName: varchar("short_name", { length: 20 }).notNull(),
  position: integer("position").notNull().default(0),
  // Semestre absolu de 1 à 6 (L1 S1 = 1, L1 S2 = 2…) ; vide = matière annuelle
  semester: integer("semester"),
  archivedAt: ts("archived_at"),
}, (t) => [
  unique("subjects_semester_unique").on(t.programId, t.level, t.semester, t.name).nullsNotDistinct(),
  check("subjects_semester_check", sql`${t.semester} is null or ${t.semester} between 1 and 6`),
]);

export { CATEGORIES, KINDS } from "../categories";
import type { CATEGORIES } from "../categories";
export type Category = keyof typeof CATEGORIES;

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description").notNull().default(""),
  category: varchar("category", { length: 16 }).$type<Category>().notNull(),
  programId: integer("program_id").notNull().references(() => programs.id),
  subjectId: integer("subject_id").references(() => subjects.id, { onDelete: "set null" }),
  chapter: integer("chapter"),
  // Contenu écrit dans l'éditeur : Markdown normalisé, jamais de HTML
  bodyMarkdown: text("body_markdown"),
  // La version de l'éditeur, couleurs comprises ; le Markdown en est déduit côté serveur
  bodyBlocks: jsonb("body_blocks").$type<unknown[]>(),
  coverFileId: uuid("cover_file_id"),
  reviewRequested: boolean("review_requested").notNull().default(false),
  // Première demande de validation en cours : sert à mesurer le délai jusqu'à la publication
  reviewRequestedAt: ts("review_requested_at"),
  reviewNote: varchar("review_note", { length: 1000 }),
  // Le rappel aux modérateurs ne part qu'une fois par demande
  reviewReminderAt: ts("review_reminder_at"),
  // Relu par un modérateur : la date fait foi, le compte du relecteur peut disparaître sans retirer le badge
  reviewedBy: uuid("reviewed_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  reviewedAt: ts("reviewed_at"),
  // Texte libre : rien à voir avec les comptes enseignants
  teacherName: varchar("teacher_name", { length: 80 }).notNull().default(""),
  // Ancienne publication directe (supprimée) : renseigné tant que la relecture après coup n’a pas eu lieu
  postReviewAt: ts("post_review_at"),
  // La demande à laquelle ce document répond
  courseRequestId: uuid("course_request_id").references((): AnyPgColumn => courseRequests.id, { onDelete: "set null" }),
  publishedAt: ts("published_at"),
  // none, pending, ready, failed : le quiz n'est généré qu'une fois, puis partagé par tous
  quizStatus: varchar("quiz_status", { length: 8 }).notNull().default("none"),
  // Décision de l'enseignant rattaché à la matière
  teacherDecision: varchar("teacher_decision", { length: 12 }),
  hiddenByReports: boolean("hidden_by_reports").notNull().default(false),
  // D'où vient le contenu : rien n'est publié sans cette déclaration
  rightsBasis: varchar("rights_basis", { length: 16 }).notNull().default("unknown"),
  academicYear: varchar("academic_year", { length: 9 }).notNull().default(""),
  semester: integer("semester"),
  // Jamais en ligne par défaut : seule une décision explicite (relecture, enseignant, administration) publie
  published: boolean("published").notNull().default(false),
  // none | html | artifact | markdown | site | notion
  kind: varchar("kind", { length: 16 }).notNull().default("none"),
  // Chaque import écrit sous un nouveau préfixe : la bascule est atomique et un échec garde l'ancien contenu
  contentVersion: uuid("content_version"),
  entryPath: varchar("entry_path", { length: 1024 }),
  externalUrl: varchar("external_url", { length: 1024 }),
  notionPageId: varchar("notion_page_id", { length: 32 }),
  syncRequested: boolean("sync_requested").notNull().default(false),
  syncedAt: ts("synced_at"),
  syncError: varchar("sync_error", { length: 500 }),
  bodyText: text("body_text").notNull().default(""),
  searchText: text("search_text").notNull().default(""),
  searchVector: tsvector("search_vector").generatedAlwaysAs((): SQL => sql`to_tsvector('french'::regconfig, search_text)`),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  // Corbeille : purgé 30 jours après (lib/trash.ts). Toute lecture exclut ces documents.
  deletedAt: ts("deleted_at"),
  deletedBy: uuid("deleted_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
}, (t) => [
  index("documents_published_idx").on(t.published),
  index("documents_deleted_idx").on(t.deletedAt),
  index("documents_program_idx").on(t.programId),
  index("documents_subject_idx").on(t.subjectId),
  index("documents_created_by_idx").on(t.createdBy),
  index("documents_request_idx").on(t.courseRequestId),
  index("documents_search_idx").using("gin", t.searchVector),
]);

export const docFiles = pgTable("doc_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  filename: varchar("filename", { length: 255 }).notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  // Non nul seulement si la signature du fichier a été vérifiée et autorise un affichage en ligne
  inlineType: varchar("inline_type", { length: 32 }),
  // Image insérée dans le texte d'un cours : absente de la liste des fichiers à télécharger
  embedded: boolean("embedded").notNull().default(false),
  // clean, infected, pending (à analyser), skipped (antivirus absent)
  scanStatus: varchar("scan_status", { length: 8 }).notNull().default("skipped"),
  // Texte extrait d'un PDF pour la recherche ; null tant que l'extraction n'a pas eu lieu
  extractedText: text("extracted_text"),
  textChecked: boolean("text_checked").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("doc_files_doc_idx").on(t.documentId)]);

export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: varchar("purpose", { length: 16, enum: ["attachment", "page", "zip"] }).notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  objectKey: varchar("object_key", { length: 200 }).notNull(),
  s3UploadId: text("s3_upload_id").notNull(),
  parts: jsonb("parts").$type<{ PartNumber: number; ETag: string; size: number }[]>().notNull().default([]),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  at: ts("at").notNull().defaultNow(),
  actor: varchar("actor", { length: 254 }).notNull(),
  action: varchar("action", { length: 40 }).notNull(),
  target: varchar("target", { length: 300 }).notNull().default(""),
  ip: varchar("ip", { length: 45 }).notNull().default(""),
  // Journal enrichi : qui (compte), sur quoi, pourquoi, avant et après
  actorId: uuid("actor_id"),
  targetType: varchar("target_type", { length: 20 }),
  targetId: varchar("target_id", { length: 64 }),
  targetLabel: varchar("target_label", { length: 200 }),
  reason: varchar("reason", { length: 500 }),
  before: jsonb("before"),
  after: jsonb("after"),
  level: varchar("level", { length: 10, enum: ["read", "routine", "sensitive", "critical"] }),
  impersonationId: uuid("impersonation_id"),
  userAgent: varchar("user_agent", { length: 200 }),
}, (t) => [
  index("audit_at_idx").on(t.at),
  index("audit_target_idx").on(t.targetType, t.targetId),
  index("audit_actor_idx").on(t.actorId, t.at),
  index("audit_action_idx").on(t.action, t.at),
]);

export const thanks = pgTable("thanks", {
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  at: ts("at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.documentId, t.userId] }), index("thanks_user_idx").on(t.userId)]);

export const revised = pgTable("revised", {
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  at: ts("at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.documentId, t.userId] }), index("revised_user_idx").on(t.userId)]);

export const userBadges = pgTable("user_badges", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  badge: varchar("badge", { length: 32 }).notNull(),
  earnedAt: ts("earned_at").notNull().defaultNow(),
  seen: boolean("seen").notNull().default(false),
  // Attribué ou retiré à la main par un administrateur ; un badge retiré n'est pas recalculé
  grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
  revokedAt: ts("revoked_at"),
  revokedReason: varchar("revoked_reason", { length: 300 }),
}, (t) => [primaryKey({ columns: [t.userId, t.badge] })]);

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: varchar("kind", { length: 16, enum: ["rights", "error", "privacy", "other"] }).notNull(),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
  reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
  name: varchar("name", { length: 120 }).notNull().default(""),
  email: varchar("email", { length: 254 }).notNull().default(""),
  message: text("message").notNull(),
  status: varchar("status", { length: 12, enum: ["open", "accepted", "dismissed"] }).notNull().default("open"),
  // Jeton du lien de suivi donné au déclarant
  trackingToken: varchar("tracking_token", { length: 64 }),
  response: text("response"),
  postId: uuid("post_id"),
  createdAt: ts("created_at").notNull().defaultNow(),
  closedAt: ts("closed_at"),
}, (t) => [index("reports_status_idx").on(t.status), index("reports_reporter_idx").on(t.reporterId)]);

export const pageViews = pgTable("page_views", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  at: ts("at").notNull().defaultNow(),
  path: varchar("path", { length: 300 }).notNull(),
  device: varchar("device", { length: 16 }).notNull().default(""),
  browser: varchar("browser", { length: 16 }).notNull().default(""),
  referrer: varchar("referrer", { length: 120 }).notNull().default(""),
  // Nuls sans consentement : la visite n'est alors qu'un compteur anonyme
  visitorId: uuid("visitor_id"),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
}, (t) => [index("page_views_at_idx").on(t.at), index("page_views_user_idx").on(t.userId)]);

// Preuve conservée même après suppression du compte : d'où la copie du nom, de l'adresse et du texte
export const attestations = pgTable("attestations", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  at: ts("at").notNull().defaultNow(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  userEmail: varchar("user_email", { length: 254 }).notNull(),
  userName: varchar("user_name", { length: 80 }).notNull().default(""),
  kind: varchar("kind", { length: 16 }).notNull(),
  text: text("text").notNull(),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
  documentTitle: varchar("document_title", { length: 200 }).notNull().default(""),
  termsVersion: varchar("terms_version", { length: 16 }).notNull(),
  ip: varchar("ip", { length: 45 }).notNull().default(""),
}, (t) => [index("attestations_user_idx").on(t.userId), index("attestations_doc_idx").on(t.documentId)]);

export const recoveryCodes = pgTable("recovery_codes", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: varchar("code_hash", { length: 64 }).notNull(),
  usedAt: ts("used_at"),
}, (t) => [index("recovery_user_idx").on(t.userId)]);

export const passkeys = pgTable("passkeys", {
  credentialId: varchar("credential_id", { length: 512 }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  publicKey: text("public_key").notNull(),
  counter: bigint("counter", { mode: "number" }).notNull().default(0),
  transports: jsonb("transports").$type<string[]>().notNull().default([]),
  name: varchar("name", { length: 60 }).notNull().default("Clé d’accès"),
  createdAt: ts("created_at").notNull().defaultNow(),
  lastUsedAt: ts("last_used_at"),
}, (t) => [index("passkeys_user_idx").on(t.userId)]);

export const webauthnChallenges = pgTable("webauthn_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  challenge: varchar("challenge", { length: 200 }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
});

export const knownDevices = pgTable("known_devices", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  hash: varchar("hash", { length: 64 }).notNull(),
  lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.hash] })]);

export const revisions = pgTable("revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  bodyMarkdown: text("body_markdown").notNull(),
  bodyBlocks: jsonb("body_blocks").$type<unknown[]>(),
  summary: varchar("summary", { length: 300 }).notNull().default(""),
  status: varchar("status", { length: 10, enum: ["pending", "accepted", "rejected"] }).notNull().default("pending"),
  note: varchar("note", { length: 1000 }),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("revisions_doc_idx").on(t.documentId), index("revisions_status_idx").on(t.status)]);

export const docAuthors = pgTable("doc_authors", {
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.documentId, t.userId] }), index("doc_authors_user_idx").on(t.userId)]);

export const flashcards = pgTable("flashcards", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
  front: varchar("front", { length: 1000 }).notNull(),
  back: varchar("back", { length: 2000 }).notNull(),
  dueAt: ts("due_at").notNull().defaultNow(),
  intervalDays: integer("interval_days").notNull().default(0),
  ease: integer("ease").notNull().default(250),
  reps: integer("reps").notNull().default(0),
  // FSRS (lib/fsrs.ts) : interval_days garde l'intervalle prévu ; ease n'est plus tenu (ancien état SM-2)
  stability: real("stability").notNull().default(0),
  difficulty: real("difficulty").notNull().default(0),
  // 0 nouvelle, 1 apprentissage, 2 révision, 3 réapprentissage
  state: smallint("state").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
  learningSteps: smallint("learning_steps").notNull().default(0),
  lastReviewedAt: ts("last_reviewed_at"),
  // Mise de côté par la personne : hors séances, compteurs et rappels ; l'état FSRS est gardé
  suspendedAt: ts("suspended_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("flashcards_due_idx").on(t.userId, t.dueAt)]);

export const favorites = pgTable("favorites", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  at: ts("at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.documentId] })]);

export const readingProgress = pgTable("reading_progress", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  percent: integer("percent").notNull().default(0),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  // updatedAt bouge à chaque relecture : seule cette date dit si le cours a été lu la première semaine
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.documentId] }), index("reading_progress_doc_idx").on(t.documentId)]);

export const quizzes = pgTable("quizzes", {
  documentId: uuid("document_id").primaryKey().references(() => documents.id, { onDelete: "cascade" }),
  questions: jsonb("questions").$type<{ question: string; choices: string[]; answer: number; explanation: string }[]>().notNull(),
  model: varchar("model", { length: 80 }).notNull().default(""),
  // Version des consignes qui ont produit ce contenu, pour retrouver ce qu'il faut régénérer
  promptVersion: varchar("prompt_version", { length: 40 }).notNull().default(""),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// Fiches mémo générées une seule fois par cours, puis servies à tous depuis la base
export const memoDecks = pgTable("memo_decks", {
  documentId: uuid("document_id").primaryKey().references(() => documents.id, { onDelete: "cascade" }),
  cards: jsonb("cards").$type<{ front: string; back: string }[]>().notNull(),
  model: varchar("model", { length: 80 }).notNull().default(""),
  // Version des consignes qui ont produit ce contenu, pour retrouver ce qu'il faut régénérer
  promptVersion: varchar("prompt_version", { length: 40 }).notNull().default(""),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// Les annotations d'une personne sur un cours, partagées seulement sur invitation acceptée
export const revisionSpaces = pgTable("revision_spaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("revision_spaces_doc_owner").on(t.documentId, t.ownerId)]);

export const revisionMembers = pgTable("revision_members", {
  spaceId: uuid("space_id").notNull().references(() => revisionSpaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 10, enum: ["pending", "accepted", "refused"] }).notNull().default("pending"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.spaceId, t.userId] }), index("revision_members_user_idx").on(t.userId)]);

// Une couche posée sur le texte, qui ne le modifie jamais. Le passage est retrouvé par sa citation si le cours change.
export const annotations = pgTable("annotations", {
  id: uuid("id").primaryKey().defaultRandom(),
  spaceId: uuid("space_id").notNull().references(() => revisionSpaces.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 10, enum: ["hl", "bold", "italic", "underline", "strike", "note"] }).notNull(),
  color: varchar("color", { length: 10 }),
  // -1 : position inconnue, ou note sur tout le cours quand la citation est vide
  start: integer("start_offset").notNull().default(-1),
  end: integer("end_offset").notNull().default(-1),
  quote: text("quote").notNull().default(""),
  prefix: varchar("prefix", { length: 40 }).notNull().default(""),
  suffix: varchar("suffix", { length: 40 }).notNull().default(""),
  note: text("note"),
  photoId: uuid("photo_id").references((): AnyPgColumn => revisionFiles.id, { onDelete: "set null" }),
  parentId: uuid("parent_id").references((): AnyPgColumn => annotations.id, { onDelete: "cascade" }),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [index("annotations_space_idx").on(t.spaceId)]);

// Une seule ligne par paire, quel que soit le sens de la demande. Un refus reste enregistré : il empêche de redemander.
export const friendships = pgTable("friendships", {
  requesterId: uuid("requester_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  addresseeId: uuid("addressee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 10, enum: ["pending", "accepted", "refused"] }).notNull().default("pending"),
  createdAt: ts("created_at").notNull().defaultNow(),
  // D'où vient la demande (groupe, défi, révision, cours) : sert à la reformuler à la personne invitée
  context: jsonb("context").$type<{ kind: "group" | "duel" | "revision" | "course"; id: string }>(),
  acceptedAt: ts("accepted_at"),
}, (t) => [primaryKey({ columns: [t.requesterId, t.addresseeId] }), index("friendships_addressee_idx").on(t.addresseeId), uniqueIndex("friendships_pair").on(sql`least(${t.requesterId}, ${t.addresseeId})`, sql`greatest(${t.requesterId}, ${t.addresseeId})`)]);

export const revisionFiles = pgTable("revision_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  spaceId: uuid("space_id").notNull().references(() => revisionSpaces.id, { onDelete: "cascade" }),
  inlineType: varchar("inline_type", { length: 40 }).notNull(),
  size: integer("size").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const quizAttempts = pgTable("quiz_attempts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  at: ts("at").notNull().defaultNow(),
  mode: varchar("mode", { length: 12, enum: ["classic", "flash", "mock", "duel"] }).notNull().default("classic"),
  durationMs: integer("duration_ms"),
}, (t) => [index("quiz_attempts_idx").on(t.userId, t.documentId)]);

export const exams = pgTable("exams", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: integer("subject_id").notNull().references(() => subjects.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 160 }).notNull(),
  at: ts("at").notNull(),
  place: varchar("place", { length: 120 }).notNull().default(""),
  // Partiel ou contrôle continu ; les annonces d'avant restent des partiels
  kind: varchar("kind", { length: 8, enum: ["partiel", "cc"] }).notNull().default("partiel"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
}, (t) => [index("exams_at_idx").on(t.at)]);

export const qaPosts = pgTable("qa_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  body: varchar("body", { length: 4000 }).notNull(),
  hidden: boolean("hidden").notNull().default(false),
  accepted: boolean("accepted").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("qa_doc_idx").on(t.documentId)]);

export const blogPosts = pgTable("blog_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  bodyMarkdown: text("body_markdown").notNull(),
  published: boolean("published").notNull().default(false),
  publishedAt: ts("published_at"),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull().defaultNow(),
  // Écrite dans le même éditeur que les cours
  bodyBlocks: jsonb("body_blocks").$type<unknown[]>(),
  coverFileId: uuid("cover_file_id"),
  excerpt: varchar("excerpt", { length: 300 }).notNull().default(""),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  scheduledAt: ts("scheduled_at"),
  pinned: boolean("pinned").notNull().default(false),
});

export const seasonTrophies = pgTable("season_trophies", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  season: varchar("season", { length: 16 }).notNull(),
  programId: integer("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 160 }).notNull(),
}, (t) => [uniqueIndex("season_trophies_unique").on(t.season, t.programId, t.userId, t.label)]);

export const subjectTeachers = pgTable("subject_teachers", {
  subjectId: integer("subject_id").notNull().references(() => subjects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.subjectId, t.userId] })]);

export type User = typeof users.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Subject = typeof subjects.$inferSelect;
export type Program = typeof programs.$inferSelect;

// Centre de notifications : une ligne par événement, lue ou non
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 30 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  body: varchar("body", { length: 500 }).notNull().default(""),
  href: varchar("href", { length: 500 }).notNull().default("/"),
  readAt: ts("read_at"),
  // Rappel réellement parti, par push ou par mail : c'est ce qui compte dans la limite d'un par jour
  pushedAt: ts("pushed_at"),
  // Ouverture par un clic, seule mesure de ce qui fait revenir. Affichée en totaux uniquement.
  clickedAt: ts("clicked_at"),
  // Empêche de prévenir deux fois du même événement si une tâche reprend après une panne. Null pour un événement unique.
  dedupeKey: varchar("dedupe_key", { length: 120 }),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("notifications_user_idx").on(t.userId, t.createdAt), uniqueIndex("notifications_dedupe_idx").on(t.userId, t.dedupeKey), index("notifications_created_idx").on(t.createdAt)]);

// Copie lisible d'un cours publié, sous le préfixe drive/ du stockage. Pas de clé étrangère : la ligne doit survivre
// à la suppression du cours pour que la copie soit retirée au tour suivant.
export const driveCopies = pgTable("drive_copies", {
  documentId: uuid("document_id").primaryKey(),
  base: varchar("base", { length: 1024 }).notNull(),
  files: jsonb("files").$type<Record<string, string>>().notNull().default({}),
  fingerprint: varchar("fingerprint", { length: 32 }).notNull(),
  syncedAt: ts("synced_at").notNull().defaultNow(),
});

// Engagement déjà accepté pour un type de contenu : la case n'est plus redemandée tant que le texte ne change pas.
// La preuve de chaque envoi reste dans attestations.
export const attestationAcceptances = pgTable("attestation_acceptances", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 16 }).notNull(),
  category: varchar("category", { length: 16 }).notNull().default(""),
  version: varchar("version", { length: 16 }).notNull(),
  at: ts("at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.kind, t.category, t.version] })]);
// Un appareil abonné au push. Le point d'accès est propre à l'appareil et au navigateur.
export const pushSubscriptions = pgTable("push_subscriptions", {
  endpoint: varchar("endpoint", { length: 1024 }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  p256dh: varchar("p256dh", { length: 200 }).notNull(),
  auth: varchar("auth", { length: 100 }).notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("push_subscriptions_user_idx").on(t.userId)]);

// Une ligne par personne, créée au premier besoin : l'absence de ligne vaut les réglages par défaut
export const notificationState = pgTable("notification_state", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  weeklyMail: boolean("weekly_mail").notNull().default(true),
  // Mails des notifications non transactionnelles (invitations, réponses) : coupés en un clic depuis le mail
  notificationMail: boolean("notification_mail").notNull().default(true),
  weeklyMailAt: ts("weekly_mail_at"),
  // Jour (heure de Paris) du dernier rappel envoyé : écrit de façon atomique, deux envois simultanés ne passent pas
  lastReminderDay: varchar("last_reminder_day", { length: 10 }),
  lastVisitAt: ts("last_visit_at"),
  // Retour après une longue absence : la visite précédente, et le moment du retour
  returnedFrom: ts("returned_from"),
  returnedAt: ts("returned_at"),
});

// Dernier seuil de lecteurs annoncé pour un cours : survit au nettoyage des notifications
export const impactMilestones = pgTable("impact_milestones", {
  documentId: uuid("document_id").primaryKey().references(() => documents.id, { onDelete: "cascade" }),
  threshold: integer("threshold").notNull(),
});

// Dernière exécution d'une tâche quotidienne : un redémarrage ne la rejoue pas
export const scheduledRuns = pgTable("scheduled_runs", {
  name: varchar("name", { length: 40 }).primaryKey(),
  day: varchar("day", { length: 10 }).notNull(),
  at: ts("at").notNull(),
});
// Une note par compte et par cours, modifiable
export const documentRatings = pgTable("document_ratings", {
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stars: integer("stars").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.documentId, t.userId] }), index("document_ratings_user_idx").on(t.userId), check("document_ratings_stars", sql`${t.stars} between 1 and 5`)]);

// Une ligne par fiche signalée, sans dire qui l'a signalée. Une ligne « removed » reste : elle empêche la fiche de revenir.
export const memoCardReports = pgTable("memo_card_reports", {
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  cardKey: varchar("card_key", { length: 32 }).notNull(),
  front: varchar("front", { length: 1000 }).notNull(),
  back: varchar("back", { length: 2000 }).notNull(),
  reports: integer("reports").notNull().default(1),
  // replaced : le paquet a été régénéré depuis le signalement
  status: varchar("status", { length: 10, enum: ["open", "removed", "kept", "replaced"] }).notNull().default("open"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.documentId, t.cardKey] }), index("memo_card_reports_status_idx").on(t.status)]);
// Une ligne par jour de révision (fuseau Europe/Paris) : flashcards.lastReviewedAt ne garde que la dernière date de chaque fiche
export const studyDays = pgTable("study_days", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  day: varchar("day", { length: 10 }).notNull(),
  cards: integer("cards").notNull().default(0),
  xp: integer("xp").notNull().default(0),
  questions: integer("questions").notNull().default(0),
  correct: integer("correct").notNull().default(0),
  seconds: integer("seconds").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.userId, t.day] })]);

// Réglages des habitudes. Ligne créée au premier besoin : les comptes existants n'ont rien à reprendre.
export const userHabits = pgTable("user_habits", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  dailyGoal: integer("daily_goal").notNull().default(5),
  seasonDismissed: varchar("season_dismissed", { length: 16 }),
  inviteCode: varchar("invite_code", { length: 32 }).unique(),
  bestStreak: integer("best_streak").notNull().default(0),
  // Vacances : la série ne se perd pas jusqu'à cette date (AAAA-MM-JJ)
  vacationUntil: varchar("vacation_until", { length: 10 }),
  reminderHour: integer("reminder_hour"),
});

// Garantit une seule annonce par saison, même si plusieurs processus tournent
export const seasonAnnouncements = pgTable("season_announcements", {
  season: varchar("season", { length: 16 }).primaryKey(),
  at: ts("at").notNull().defaultNow(),
});

// Sans invité : un lien de défi, ouvert aux comptes de la licence du cours. Le score du lanceur vient de son dernier essai, jamais du navigateur.
export const quizDuels = pgTable("quiz_duels", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  challengerId: uuid("challenger_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  invitedId: uuid("invited_id").references(() => users.id, { onDelete: "cascade" }),
  challengerScore: integer("challenger_score").notNull(),
  challengerTotal: integer("challenger_total").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("quiz_duels_challenger_idx").on(t.challengerId), index("quiz_duels_invited_idx").on(t.invitedId)]);

// La clé primaire empêche de rejouer un défi pour améliorer son score
export const quizDuelScores = pgTable("quiz_duel_scores", {
  duelId: uuid("duel_id").notNull().references(() => quizDuels.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  at: ts("at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.duelId, t.userId] }), index("quiz_duel_scores_user_idx").on(t.userId)]);

// Le jeton reste lisible pour que l'auteur retrouve son lien : il ne donne accès qu'au titre, à la matière et à la licence
export const shareLinks = pgTable("share_links", {
  token: varchar("token", { length: 64 }).primaryKey(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  revokedAt: ts("revoked_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("share_links_owner_idx").on(t.createdBy, t.documentId)]);

// Le filleul peut supprimer son compte : la ligne reste, sans lui, pour que le parrain garde ses crédits
export const referrals = pgTable("referrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  referrerId: uuid("referrer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  refereeId: uuid("referee_id").unique().references(() => users.id, { onDelete: "set null" }),
  creditedAt: ts("credited_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("referrals_referrer_idx").on(t.referrerId)]);

export const studyGroups = pgTable("study_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 60 }).notNull(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("study_groups_owner_idx").on(t.ownerId)]);

// Le créateur y figure aussi, accepté d'office. Un refus reste enregistré : il empêche de réinviter.
export const studyGroupMembers = pgTable("study_group_members", {
  groupId: uuid("group_id").notNull().references(() => studyGroups.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 10, enum: ["pending", "accepted", "refused"] }).notNull().default("pending"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index("study_group_members_user_idx").on(t.userId)]);

// Début et fin en base : chacun voit le même décompte, quelle que soit l'heure de son appareil
export const studyGroupSessions = pgTable("study_group_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => studyGroups.id, { onDelete: "cascade" }),
  startedBy: uuid("started_by").references(() => users.id, { onDelete: "set null" }),
  startsAt: ts("starts_at").notNull(),
  endsAt: ts("ends_at").notNull(),
}, (t) => [index("study_group_sessions_group_idx").on(t.groupId, t.endsAt)]);

export const studyGroupMeetings = pgTable("study_group_meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => studyGroups.id, { onDelete: "cascade" }),
  at: ts("at").notNull(),
  subjectId: integer("subject_id").references(() => subjects.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("study_group_meetings_group_idx").on(t.groupId, t.at)]);
// « Je cherche le chapitre 3 de HPE ». Résolue dès qu'un document publié y est rattaché : rien à tenir à jour.
export const courseRequests = pgTable("course_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: integer("subject_id").notNull().references(() => subjects.id, { onDelete: "cascade" }),
  // Le compte supprimé, la demande et le bonus de celui qui y a répondu restent
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  text: varchar("text", { length: 160 }).notNull(),
  // Ceux qui attendaient ce cours ont été prévenus une fois
  answeredAt: ts("answered_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  category: varchar("category", { length: 16 }),
  chapter: integer("chapter"),
  anonymous: boolean("anonymous").notNull().default(true),
  // Doublon fusionné dans une autre demande (sans clé étrangère : l'autre peut disparaître)
  mergedInto: uuid("merged_into"),
}, (t) => [index("course_requests_subject_idx").on(t.subjectId), index("course_requests_created_idx").on(t.createdAt)]);

export const courseRequestVotes = pgTable("course_request_votes", {
  requestId: uuid("request_id").notNull().references(() => courseRequests.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  at: ts("at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.requestId, t.userId] }), index("course_request_votes_user_idx").on(t.userId)]);

// Notes à plusieurs pendant un CM : le texte vit dans le document, l'état Yjs seulement le temps de la prise de notes
export const collabNotes = pgTable("collab_notes", {
  documentId: uuid("document_id").primaryKey().references(() => documents.id, { onDelete: "cascade" }),
  startedBy: uuid("started_by").references(() => users.id, { onDelete: "set null" }),
  // Lancées par un délégué : toute la licence peut rejoindre le groupe ; sinon, sur invitation d'un ami
  open: boolean("open").notNull().default(false),
  turns: jsonb("turns").$type<{ part: string; userId: string | null }[]>().notNull().default([]),
  state: bytea("state"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  closedAt: ts("closed_at"),
});

// Dossier Drive ou page Notion relié par un étudiant. Les jetons sont à part : cette table-ci peut être exportée.
export const connectedFolders = pgTable("connected_folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 10, enum: ["notion", "google"] }).notNull(),
  folderId: varchar("folder_id", { length: 100 }),
  folderName: varchar("folder_name", { length: 200 }).notNull().default(""),
  lastCheckedAt: ts("last_checked_at"),
  // Accès retiré côté Google ou Notion : il faut reconnecter
  brokenAt: ts("broken_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  accountLabel: varchar("account_label", { length: 200 }).notNull().default(""),
  // Vérification hebdomadaire du dossier (nouveaux cours à proposer)
  weekly: boolean("weekly").notNull().default(false),
}, (t) => [uniqueIndex("connected_folders_user_provider").on(t.userId, t.provider)]);

// Chiffrés (oauth-seal.ts) et jamais exportés
export const connectedTokens = pgTable("connected_tokens", {
  folderId: uuid("folder_id").primaryKey().references(() => connectedFolders.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: ts("expires_at"),
});

export const connectedItems = pgTable("connected_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  folderId: uuid("folder_id").notNull().references(() => connectedFolders.id, { onDelete: "cascade" }),
  externalId: varchar("external_id", { length: 100 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  mime: varchar("mime", { length: 120 }).notNull().default(""),
  status: varchar("status", { length: 10, enum: ["proposed", "shared", "ignored"] }).notNull().default("proposed"),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
  foundAt: ts("found_at").notNull().defaultNow(),
  externalEditedAt: ts("external_edited_at"),
  importedByHand: boolean("imported_by_hand").notNull().default(false),
}, (t) => [uniqueIndex("connected_items_unique").on(t.folderId, t.externalId)]);

/* ---------------------------------------------------------------------------------------------------------------- */
/* Tables transverses de la refonte                                                                                   */
/* ---------------------------------------------------------------------------------------------------------------- */

// Réglages du site modifiables par l'administration (lib/site-settings.ts). Les secrets restent dans app.env.
export const siteSettings = pgTable("site_settings", {
  key: varchar("key", { length: 60 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export type NameStyle = { font?: string; hue?: number; gradient?: string; effect?: string };
export type ProfileBanner = { kind: "gradient" | "pattern" | "animated" | "image"; value: string; key?: string };
export type ProfileSocials = { instagram?: string; tiktok?: string; snapchat?: string };
export type ProfileStatus = { emoji?: string; text: string; expiresAt?: string };
export type ProfileShowcase = { docs: string[]; badges: string[] };
// findable : apparaître dans la recherche de personnes par nom (activé tant que la personne ne l'a pas refusé)
export type ProfilePrivacy = { shareStudy?: boolean; showStudying?: boolean; activity?: "friends" | "none"; findable?: boolean };

// Personnalisation visible par les autres. Une ligne au premier réglage.
export const userProfiles = pgTable("user_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  nameStyle: jsonb("name_style").$type<NameStyle>(),
  badgeShown: varchar("badge_shown", { length: 32 }),
  banner: jsonb("banner").$type<ProfileBanner>(),
  profileColors: jsonb("profile_colors").$type<Record<string, string>>(),
  avatarFrame: varchar("avatar_frame", { length: 32 }),
  avatarEffect: varchar("avatar_effect", { length: 32 }),
  status: jsonb("status").$type<ProfileStatus>(),
  showcase: jsonb("showcase").$type<ProfileShowcase>(),
  privacy: jsonb("privacy").$type<ProfilePrivacy>().notNull().default({}),
  // Identifiants Instagram, TikTok, Snapchat (validés, jamais d'URL) ; visibles par les amis
  socials: jsonb("socials").$type<ProfileSocials>(),
  // Apparence réinitialisée par un modérateur : plus de changement avant cette date
  appearanceLockedUntil: ts("appearance_locked_until"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});
export type UserProfile = typeof userProfiles.$inferSelect;

export const userBlocks = pgTable("user_blocks", {
  blockerId: uuid("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  blockedId: uuid("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  at: ts("at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] }), index("user_blocks_blocked_idx").on(t.blockedId)]);
