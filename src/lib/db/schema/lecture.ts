// Tables de la lecture : à créer ici en important depuis "./core" (jamais depuis "../schema").
import { bigint, boolean, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { blogPosts } from "./core";

/** Réglages de publication d'une actualité qui n'ont pas de colonne dans blog_posts (1:1). */
export const blogPostMeta = pgTable("blog_post_meta", {
  postId: uuid("post_id").primaryKey().references(() => blogPosts.id, { onDelete: "cascade" }),
  notify: boolean("notify").notNull().default(false),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
});

/** Images d'une actualité : publiques comme l'actualité, donc hors de doc_files (qui exige un compte). */
export const blogFiles = pgTable("blog_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull().references(() => blogPosts.id, { onDelete: "cascade" }),
  filename: varchar("filename", { length: 255 }).notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  inlineType: varchar("inline_type", { length: 100 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
