// Tables de Réviser (Réviser et amis). Importer depuis "./core", jamais depuis "../schema".
import { bigserial, boolean, index, integer, jsonb, pgTable, primaryKey, smallint, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { documents, exams, flashcards, programs, users } from "./core";

const ts = (name: string) => timestamp(name, { withTimezone: true });

// Journal des notes de fiches : XP, anti-mitraille, statut « en train de réviser » et carte de chaleur
export const cardReviews = pgTable("card_reviews", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cardId: uuid("card_id").notNull().references(() => flashcards.id, { onDelete: "cascade" }),
  grade: smallint("grade").notNull(),
  ms: integer("ms").notNull().default(0),
  at: ts("at").notNull().defaultNow(),
  // État FSRS de la fiche avant cette note : « Annuler la dernière note » le remet (lib/fsrs.ts)
  before: jsonb("before").$type<CardSnapshot>(),
}, (t) => [
  index("card_reviews_user_idx").on(t.userId, t.at), index("card_reviews_card_idx").on(t.cardId, t.at),
  // Statistiques d'administration : notes de toute la base sur une période
  index("card_reviews_at_idx").on(t.at),
]);

export type CardSnapshot = {
  dueAt: string; intervalDays: number; reps: number; stability: number; difficulty: number;
  state: number; lapses: number; learningSteps: number; lastReviewedAt: string | null;
};

// Trois quêtes par jour (le jour commence à 4 h à Paris) ; le catalogue vit dans le code (lib/quests.ts)
export const dailyQuests = pgTable("daily_quests", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  day: varchar("day", { length: 10 }).notNull(),
  quest: varchar("quest", { length: 32 }).notNull(),
  progress: integer("progress").notNull().default(0),
  target: integer("target").notNull(),
  doneAt: ts("done_at"),
}, (t) => [primaryKey({ columns: [t.userId, t.day, t.quest] })]);

// Lien d'ami qui circule dans un groupe de discussion sans exposer le code permanent : 7 jours, 5 usages
export const friendInvites = pgTable("friend_invites", {
  token: varchar("token", { length: 32 }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  usesLeft: smallint("uses_left").notNull().default(5),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("friend_invites_user_idx").on(t.userId)]);

// Une réaction fixe (pas de texte libre) par personne et par événement d'activité
export const friendReactions = pgTable("friend_reactions", {
  actorId: uuid("actor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetId: uuid("target_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventKey: varchar("event_key", { length: 64 }).notNull(),
  kind: varchar("kind", { length: 8, enum: ["bravo", "merci", "courage"] }).notNull(),
  at: ts("at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.actorId, t.eventKey] }), index("friend_reactions_target_idx").on(t.targetId)]);

// Série de rappels d'un partiel coupée par la personne (Réviser › Partiels) ; sans ligne, la série est active
export const examSeriesMutes = pgTable("exam_series_mutes", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  examId: uuid("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  at: ts("at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.examId] })]);

// Paquet de fiches mémo d'une personne : ses fiches d'un cours (scope = id du cours) ou ses fiches libres (scope « libre »).
// Les fiches restent dans flashcards ; le paquet porte seulement le partage (lib/memo-packs.ts).
export const memoPacks = pgTable("memo_packs", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  scope: varchar("scope", { length: 36 }).notNull(),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
  title: varchar("title", { length: 120 }).notNull(),
  // Licence de la bibliothèque publique : celle de la personne au moment de la publication
  programId: integer("program_id").references(() => programs.id, { onDelete: "set null" }),
  friends: boolean("friends").notNull().default(false),
  public: boolean("public").notNull().default(false),
  copies: integer("copies").notNull().default(0),
  // Retiré par un délégué de la licence ou l'administration : plus visible que par son auteur
  removedAt: ts("removed_at"),
  removedBy: uuid("removed_by").references(() => users.id, { onDelete: "set null" }),
  // « Pas pour ce paquet » : l'invitation à publier ne revient plus pour ce paquet
  publishDeclinedAt: ts("publish_declined_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("memo_packs_owner_scope").on(t.ownerId, t.scope), index("memo_packs_public_idx").on(t.programId, t.public)]);

// Image d'une fiche : nettoyée par cleanImage, rangée sous cards/<id>. Lue par son auteur, par qui
// a une fiche qui la cite (copie d'un paquet) et par qui peut lire un paquet de l'auteur qui la cite (lib/card-images.ts).
export const cardImages = pgTable("card_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  inlineType: varchar("inline_type", { length: 40 }).notNull(),
  size: integer("size").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("card_images_owner_idx").on(t.ownerId)]);

// Une copie comptée une fois par personne
export const memoPackCopies = pgTable("memo_pack_copies", {
  packId: uuid("pack_id").notNull().references(() => memoPacks.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  at: ts("at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.packId, t.userId] })]);

// Signalement d'un paquet public, traité dans la file de modération comme celui d'un document
export const memoPackReports = pgTable("memo_pack_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  packId: uuid("pack_id").notNull().references(() => memoPacks.id, { onDelete: "cascade" }),
  reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
  reason: varchar("reason", { length: 500 }).notNull().default(""),
  status: varchar("status", { length: 10, enum: ["open", "removed", "kept"] }).notNull().default("open"),
  createdAt: ts("created_at").notNull().defaultNow(),
  closedBy: uuid("closed_by").references(() => users.id, { onDelete: "set null" }),
}, (t) => [index("memo_pack_reports_status_idx").on(t.status), uniqueIndex("memo_pack_reports_once").on(t.packId, t.reporterId)]);
