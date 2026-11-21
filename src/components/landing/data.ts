import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, count, countDistinct, eq, gt, gte, isNull, min, sql } from "drizzle-orm";
import { aiAvailable } from "@/lib/ai-available";
import { listPrograms } from "@/lib/catalog";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { featureOn, getSetting } from "@/lib/site-settings";
import { siteTotals } from "@/lib/site-stats";
import { TtlCache } from "@/lib/ttl-cache";

import { aiProvider, proofsOf, type PROOF_THRESHOLDS } from "./rules";

// La page est publique et souvent rechargée : une heure de cache pour les chiffres
const cache = new TtlCache<unknown>(4, 3_600_000);

async function counts() {
  const hit = cache.get("counts") as Record<keyof typeof PROOF_THRESHOLDS, number> | undefined;
  if (hit) return hit;
  const { documents, thanks, studyDays } = schema;
  const live = and(eq(documents.published, true), isNull(documents.deletedAt), eq(documents.hiddenByReports, false));
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [totals, [subjects], [cards], [thanked]] = await Promise.all([
    siteTotals(),
    db.select({ n: countDistinct(documents.subjectId) }).from(documents).where(live),
    db.select({ n: sql<number>`coalesce(sum(${studyDays.cards}), 0)::int` }).from(studyDays).where(gte(studyDays.day, since)),
    db.select({ n: count() }).from(thanks),
  ]);
  const value = { documents: totals.documents, subjects: subjects.n, cards: cards.n, thanks: thanked.n, students: totals.students };
  cache.set("counts", value);
  return value;
}

async function nextExamDays() {
  const { exams, subjects, programs } = schema;
  const [row] = await db.select({ at: min(exams.at) }).from(exams).innerJoin(subjects, eq(exams.subjectId, subjects.id))
    .innerJoin(programs, eq(subjects.programId, programs.id)).where(and(eq(programs.active, true), gt(exams.at, new Date())));
  return row?.at ? Math.ceil((new Date(row.at).getTime() - Date.now()) / 86_400_000) : null;
}

export type ShotSize = { width: number; height: number };

/** Captures disponibles (scripts/capture-showcase.mjs) : une capture absente fait disparaître ce qui la montre. */
async function shots(): Promise<Record<string, ShotSize>> {
  try {
    return JSON.parse(await readFile(join(process.cwd(), "public/presentation/manifest.json"), "utf8"));
  } catch {
    return {};
  }
}

export async function landingData() {
  const [mode, closedMessage, domains, programs, ai, imports, raw, examDays, manifest] = await Promise.all([
    getSetting("registration.mode"), getSetting("registration.closedMessage"), getSetting("registration.autoApproveDomains"),
    listPrograms(), aiAvailable(), featureOn("imports"), counts(), nextExamDays(), shots(),
  ]);
  const open = programs.filter((p) => p.active).map((p) => p.name);
  const later = programs.filter((p) => !p.active).map((p) => p.name);
  return {
    registration: { mode, closedMessage: closedMessage || "Les inscriptions sont fermées pour le moment." },
    // Le compte est actif dès la confirmation du mail seulement si le domaine est accepté d'office et que les mails partent
    instantDomain: mode === "open" && env.smtpEnabled ? domains[0] ?? null : null,
    programs: { open, later },
    proofs: proofsOf(raw),
    ai: ai ? { provider: aiProvider(env.aiBaseUrl), imports } : null,
    examDays,
    shots: manifest,
  };
}

export type LandingData = Awaited<ReturnType<typeof landingData>>;
