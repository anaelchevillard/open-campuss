import { sql } from "drizzle-orm";
import { bigserial, boolean, check, date, index, integer, jsonb, pgTable, primaryKey, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./core";

// Tables de l'administration

const ts = (name: string) => timestamp(name, { withTimezone: true });

// Ajustement manuel de crédits : compté par creditsOf, ignoré par le classement et les trophées
export const creditAdjustments = pgTable("credit_adjustments", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  delta: integer("delta").notNull(),
  reason: varchar("reason", { length: 300 }).notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("credit_adjustments_user_idx").on(t.userId), check("credit_adjustments_delta_check", sql`${t.delta} between -1000 and 1000`)]);

// Invitation nominative (email renseigné) ou lien ouvert (email nul, plusieurs utilisations). Seule l'empreinte du jeton est gardée.
export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  email: varchar("email", { length: 254 }),
  name: varchar("name", { length: 80 }).notNull().default(""),
  role: varchar("role", { length: 16, enum: ["member", "delegate", "teacher"] }).notNull().default("member"),
  programId: integer("program_id"),
  level: integer("level"),
  maxUses: integer("max_uses").notNull().default(1),
  uses: integer("uses").notNull().default(0),
  allowedDomain: varchar("allowed_domain", { length: 120 }),
  message: varchar("message", { length: 500 }).notNull().default(""),
  batchId: uuid("batch_id"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: ts("expires_at").notNull(),
  revokedAt: ts("revoked_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  // Nul tant que la file plafonnée ne l'a pas envoyée (lien ouvert : jamais envoyé)
  sentAt: ts("sent_at"),
  openedAt: ts("opened_at"),
  acceptedAt: ts("accepted_at"),
}, (t) => [index("invitations_batch_idx").on(t.batchId), index("invitations_pending_idx").on(t.sentAt), index("invitations_email_idx").on(t.email)]);

// « Voir comme » : 15 minutes en lecture seule, motif obligatoire, journalisé et notifié
export const impersonations = pgTable("impersonations", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminId: uuid("admin_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetId: uuid("target_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Lié à la session de l'admin : le cookie seul ne sert à rien
  adminSessionHash: varchar("admin_session_hash", { length: 64 }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  reason: varchar("reason", { length: 500 }).notNull(),
  startedAt: ts("started_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
  endedAt: ts("ended_at"),
  paths: jsonb("paths").$type<string[]>().notNull().default([]),
  notifiedAt: ts("notified_at"),
}, (t) => [index("impersonations_admin_idx").on(t.adminId, t.startedAt), index("impersonations_target_idx").on(t.targetId)]);

// Notes internes sur une personne : incluses dans son export RGPD
export const adminNotes = pgTable("admin_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  body: varchar("body", { length: 2000 }).notNull(),
  pinned: boolean("pinned").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [index("admin_notes_user_idx").on(t.userId, t.createdAt)]);

// Adresse bannie : seule une empreinte HMAC de l'adresse normalisée est gardée, 3 ans au plus
export const bannedIdentities = pgTable("banned_identities", {
  emailHmac: varchar("email_hmac", { length: 64 }).primaryKey(),
  reason: varchar("reason", { length: 300 }).notNull().default(""),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull().defaultNow(),
  expiresAt: ts("expires_at"),
});

export type AnnouncementAudience = { programIds?: number[]; levels?: number[]; roles?: string[] };

export const announcements = pgTable("announcements", {
  id: uuid("id").primaryKey().defaultRandom(),
  body: varchar("body", { length: 140 }).notNull(),
  href: varchar("href", { length: 500 }),
  tone: varchar("tone", { length: 10, enum: ["info", "warning", "critical"] }).notNull().default("info"),
  audience: jsonb("audience").$type<AnnouncementAudience>().notNull().default({}),
  dismissible: boolean("dismissible").notNull().default(true),
  startsAt: ts("starts_at").notNull().defaultNow(),
  endsAt: ts("ends_at"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("announcements_window_idx").on(t.startsAt, t.endsAt)]);

export const announcementDismissals = pgTable("announcement_dismissals", {
  announcementId: uuid("announcement_id").notNull().references(() => announcements.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  at: ts("at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.announcementId, t.userId] }), index("announcement_dismissals_user_idx").on(t.userId)]);

// Mesure d'audience en totaux par jour, sans aucun identifiant : écrite seulement avec l'accord à la
// mesure d'audience. « time » : vues chronométrées d'une page (n) et secondes visibles cumulées ; « miss » : recherche
// sans résultat réduite par missQuery (n). Purge : 25 mois pour les durées, 1 an pour les recherches (lib/boot.ts).
export const audienceCounters = pgTable("audience_counters", {
  day: date("day", { mode: "string" }).notNull(),
  kind: varchar("kind", { length: 8, enum: ["time", "miss"] }).notNull(),
  key: varchar("key", { length: 300 }).notNull(),
  n: integer("n").notNull().default(0),
  seconds: integer("seconds").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.day, t.kind, t.key] }), index("audience_counters_kind_idx").on(t.kind, t.day)]);

export type Invitation = typeof invitations.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type AdminNote = typeof adminNotes.$inferSelect;
