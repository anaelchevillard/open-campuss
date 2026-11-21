import { sql } from "drizzle-orm";
import { index, pgTable, primaryKey, smallint, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { documents, users } from "./core";

// Tables de la contribution (Mes documents, modération)

// Fil auteur ↔ relecteur d'un document : envois, décisions et commentaires (lib/document-reviews.ts)
export const documentReviews = pgTable("document_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  kind: varchar("kind", { length: 12, enum: ["sent", "published", "rejected", "removed", "post_ok", "comment", "resubmitted"] }).notNull(),
  // Motif de renvoi 1 à 7 (DESIGN.md §4.5)
  reasonCode: smallint("reason_code"),
  body: varchar("body", { length: 2000 }).notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("document_reviews_doc_idx").on(t.documentId, t.createdAt)]);

// Auteurs d'un document avec leur rôle et leur date d'ajout (lib/document-authors.ts). L'auteur principal reste
// documents.created_by ; doc_authors (accès des co-auteurs) est tenu en phase tant qu'il existe.
export const documentAuthors = pgTable("document_authors", {
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // « correcteur » : co-auteur devenu auteur par une proposition acceptée ; il gagne les points d'une correction, pas ceux d'une création
  role: varchar("role", { length: 12, enum: ["auteur", "coauteur", "correcteur"] }).notNull().default("coauteur"),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.documentId, t.userId] }), index("document_authors_user_idx").on(t.userId)]);

// Lecture seule d'un document accordée par un auteur à un ami choisi, même non publié (lib/document-shares.ts).
// L'accès tombe dès que l'amitié avec la personne qui a partagé n'existe plus.
export const documentShares = pgTable("document_shares", {
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sharedBy: uuid("shared_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.documentId, t.userId] }), index("document_shares_user_idx").on(t.userId)]);

// Un étudiant ne retire plus seul un cours publié. Il demande le retrait avec une justification,
// l'administration accepte (le cours redevient un brouillon) ou refuse avec un motif ; une seule demande ouverte par cours.
export const withdrawalRequests = pgTable("withdrawal_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  requesterId: uuid("requester_id").references(() => users.id, { onDelete: "set null" }),
  reason: varchar("reason", { length: 1000 }).notNull(),
  status: varchar("status", { length: 10, enum: ["pending", "accepted", "refused"] }).notNull().default("pending"),
  response: varchar("response", { length: 1000 }),
  decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("withdrawal_requests_pending_once").on(t.documentId).where(sql`status = 'pending'`),
  index("withdrawal_requests_status_idx").on(t.status, t.createdAt),
  index("withdrawal_requests_requester_idx").on(t.requesterId),
]);
