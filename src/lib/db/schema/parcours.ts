import { sql } from "drizzle-orm";
import { check, integer, pgTable, serial, smallint, unique, varchar } from "drizzle-orm/pg-core";
import { programs } from "./core";

// Tables du parcours (accueil, Matières, semestres, demandes)

// Dates de début des semestres par licence et par année ; licence vide = calendrier par défaut du site
export const academicTerms = pgTable("academic_terms", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").references(() => programs.id, { onDelete: "cascade" }),
  academicYear: varchar("academic_year", { length: 9 }).notNull(),
  // 1 = semestre impair (S1, S3, S5), 2 = semestre pair
  parity: smallint("parity").notNull(),
  startsOn: varchar("starts_on", { length: 10 }).notNull(),
}, (t) => [
  unique("academic_terms_unique").on(t.programId, t.academicYear, t.parity).nullsNotDistinct(),
  check("academic_terms_parity_check", sql`${t.parity} in (1, 2)`),
]);
