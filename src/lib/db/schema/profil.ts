import { index, integer, pgTable, primaryKey, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { subjects, users } from "./core";

// Tables du profil (personnalisation, badges, signalements de profil)

// Éléments de personnalisation débloqués (seuil atteint ou attribution par un administrateur)
export const userUnlocks = pgTable("user_unlocks", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  item: varchar("item", { length: 32 }).notNull(),
  source: varchar("source", { length: 16 }).notNull(),
  grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.item] })]);

export const profileReports = pgTable("profile_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  targetId: uuid("target_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
  field: varchar("field", { length: 16, enum: ["name", "bio", "status", "avatar", "banner"] }).notNull(),
  reason: varchar("reason", { length: 500 }).notNull().default(""),
  status: varchar("status", { length: 10 }).notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedBy: uuid("closed_by").references(() => users.id, { onDelete: "set null" }),
}, (t) => [index("profile_reports_status_idx").on(t.status), index("profile_reports_target_idx").on(t.targetId)]);

// Second facteur perdu : demande faite à l'étape de connexion 2FA (mot de passe déjà vérifié). Jamais traitée seule :
// un administrateur réinitialise depuis la fiche de la personne, ce qui clôt la demande.
export const mfaResetRequests = pgTable("mfa_reset_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: varchar("reason", { length: 500 }).notNull().default(""),
  ip: varchar("ip", { length: 64 }),
  status: varchar("status", { length: 10, enum: ["open", "done", "refused"] }).notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedBy: uuid("closed_by").references(() => users.id, { onDelete: "set null" }),
}, (t) => [index("mfa_reset_requests_user_idx").on(t.userId, t.status)]);

// Abonnement au profil de quelqu'un : ses nouveaux cours publiés arrivent dans les notifications
export const profileFollows = pgTable("profile_follows", {
  followerId: uuid("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  followedId: uuid("followed_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.followerId, t.followedId] }), index("profile_follows_followed_idx").on(t.followedId)]);

// Abonnement à une matière de sa licence : ses nouveaux cours arrivent dans les notifications
export const subjectFollows = pgTable("subject_follows", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull().references(() => subjects.id, { onDelete: "cascade" }),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.subjectId] }), index("subject_follows_subject_idx").on(t.subjectId)]);
