// Tables de l'observabilité : erreurs du site et événements produits. Importer depuis "./core".
import { bigint, bigserial, date, index, integer, pgTable, primaryKey, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { PRODUCT_EVENT_NAMES } from "../../product-event-catalog";
import { users } from "./core";

const ts = (name: string) => timestamp(name, { withTimezone: true });

// Une erreur regroupée par empreinte (type, message normalisé, premières lignes de pile). Aucune donnée de personne :
// message et pile sont nettoyés avant l'écriture (lib/errors/scrub.ts). Purge : 90 jours après la dernière occurrence.
export const errorGroups = pgTable("error_groups", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fingerprint: varchar("fingerprint", { length: 64 }).notNull().unique(),
  source: varchar("source", { length: 8, enum: ["server", "client"] }).notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  message: varchar("message", { length: 500 }).notNull(),
  stack: text("stack").notNull().default(""),
  route: varchar("route", { length: 200 }).notNull().default(""),
  count: integer("count").notNull().default(0),
  firstSeen: ts("first_seen").notNull().defaultNow(),
  lastSeen: ts("last_seen").notNull().defaultNow(),
  firstRelease: varchar("first_release", { length: 40 }).notNull().default(""),
  lastRelease: varchar("last_release", { length: 40 }).notNull().default(""),
  status: varchar("status", { length: 8, enum: ["open", "resolved", "ignored"] }).notNull().default("open"),
  // Version en ligne quand l'erreur a été marquée résolue : elle se rouvre si elle revient dans une autre version
  statusRelease: varchar("status_release", { length: 40 }),
  statusAt: ts("status_at"),
  regressedAt: ts("regressed_at"),
  // Fenêtre d'une heure qui sert à repérer un pic
  windowStart: ts("window_start").notNull().defaultNow(),
  windowCount: integer("window_count").notNull().default(0),
  // Dernière alerte envoyée aux administrateurs pour ce groupe (null : jamais, donc nouvelle)
  alertedAt: ts("alerted_at"),
}, (t) => [index("error_groups_last_idx").on(t.lastSeen)]);

// Exemples d'une erreur (100 par groupe et par jour au plus). `reporter` : empreinte de l'IP et du navigateur salée
// par un sel tiré au hasard chaque jour et jamais écrit : elle sert à compter les personnes touchées un même jour,
// ne se relie à rien d'un jour à l'autre et ne permet pas de retrouver une adresse.
export const errorEvents = pgTable("error_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  groupId: bigint("group_id", { mode: "number" }).notNull().references(() => errorGroups.id, { onDelete: "cascade" }),
  at: ts("at").notNull().defaultNow(),
  release: varchar("release", { length: 40 }).notNull().default(""),
  route: varchar("route", { length: 200 }).notNull().default(""),
  browser: varchar("browser", { length: 20 }).notNull().default(""),
  os: varchar("os", { length: 20 }).notNull().default(""),
  device: varchar("device", { length: 20 }).notNull().default(""),
  message: varchar("message", { length: 500 }).notNull().default(""),
  stack: text("stack").notNull().default(""),
  reporter: varchar("reporter", { length: 16 }).notNull().default(""),
}, (t) => [index("error_events_group_idx").on(t.groupId, t.at), index("error_events_at_idx").on(t.at)]);

// Événement produit lié à une personne : seulement si elle a accepté la mesure d'audience. Effacé au retrait de
// l'accord, à la suppression du compte (cascade) et après 13 mois. Restitué dans l'export RGPD.
export const productEvents = pgTable("product_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 24, enum: PRODUCT_EVENT_NAMES }).notNull(),
  at: ts("at").notNull().defaultNow(),
}, (t) => [index("product_events_user_idx").on(t.userId, t.at), index("product_events_at_idx").on(t.at)]);

// Totaux du jour par événement, pour tout le monde, sans aucun identifiant. Purge : 25 mois.
export const productEventCounts = pgTable("product_event_counts", {
  day: date("day", { mode: "string" }).notNull(),
  name: varchar("name", { length: 24, enum: PRODUCT_EVENT_NAMES }).notNull(),
  n: integer("n").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.day, t.name] })]);

export type ErrorGroup = typeof errorGroups.$inferSelect;
export type ErrorEvent = typeof errorEvents.$inferSelect;
