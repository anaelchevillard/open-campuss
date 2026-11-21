import { date, integer, pgTable, primaryKey, varchar } from "drizzle-orm/pg-core";

// Consommation de Campuss IA, en totaux par jour : aucun identifiant de personne, seulement de quoi suivre le coût
export const aiUsage = pgTable("ai_usage", {
  day: date("day").notNull(),
  task: varchar("task", { length: 20 }).notNull(),
  model: varchar("model", { length: 80 }).notNull(),
  calls: integer("calls").notNull().default(0),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  errors: integer("errors").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.day, t.task, t.model] })]);
