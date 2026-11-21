import { inSentence } from "@/lib/subject-name";

/**
 * Quêtes du jour : trois, choisies d'après les données (rien au hasard), à paliers prévisibles.
 * Clés stockées dans daily_quests.quest : "session", "goal", "cards", "weak:<matière>", "mock:<matière>", "make", "thanks".
 * Une sur trois au plus mène vers la contribution (remercier, faire des fiches depuis un cours).
 */
export type QuestContext = {
  /** La séance du jour a du contenu. */
  hasSession: boolean;
  /** La matière la plus faible, si on la connaît. */
  weakest?: { id: number } | null;
  /** Partiel dans 14 jours au plus. */
  examSoon?: { subjectId: number; days: number } | null;
  /** Le jour des quêtes (AAAA-MM-JJ) : alterne les quêtes de contribution sans tirage. */
  day: string;
  /** La personne a lu au moins un cours : « Crée 3 fiches depuis un cours lu » a un sens. */
  hasReadCourse: boolean;
};

export type QuestDraw = { quest: string; target: number };

export const MOCK_EXAM_DAYS = 14;

export function drawQuests(context: QuestContext): QuestDraw[] {
  const first: QuestDraw = context.hasSession ? { quest: "session", target: 1 } : { quest: "goal", target: 1 };
  const second: QuestDraw = context.examSoon && context.examSoon.days <= MOCK_EXAM_DAYS
    ? { quest: `mock:${context.examSoon.subjectId}`, target: 1 }
    : context.weakest ? { quest: `weak:${context.weakest.id}`, target: 5 } : { quest: "cards", target: 10 };
  // Un jour sur deux : faire des fiches depuis un cours lu, sinon remercier un cours
  const even = Number(context.day.slice(-2)) % 2 === 0;
  const third: QuestDraw = even && context.hasReadCourse ? { quest: "make", target: 3 } : { quest: "thanks", target: 1 };
  return [first, second, third];
}

export type QuestView = { quest: string; label: string; href: string; progress: number; target: number; done: boolean; contribution: boolean };

/** Le texte d'une quête, avec le nom de sa matière. Une matière disparue redevient une quête générale. */
export function describeQuest(quest: string, subjectName: (id: number) => string | undefined): { label: string; href: string; contribution: boolean } {
  const [kind, raw] = quest.split(":");
  const id = Number(raw);
  const name = id ? inSentence(subjectName(id)) || undefined : undefined;
  switch (kind) {
    case "session": return { label: "Termine ta séance du jour", href: "/reviser/seance", contribution: false };
    case "goal": return { label: "Atteins ton objectif du jour", href: "/reviser/seance", contribution: false };
    case "weak": return { label: name ? `5 questions en ${name}` : "5 questions de quiz", href: `/reviser/seance?mode=questions${id ? `&matiere=${id}` : ""}`, contribution: false };
    case "mock": return { label: name ? `Un partiel blanc en ${name}` : "Un partiel blanc", href: `/reviser/seance?mode=partiel${id ? `&matiere=${id}` : ""}`, contribution: false };
    case "make": return { label: "Crée 3 fiches depuis un cours lu", href: "/reviser/fiches?nouvelle=1", contribution: true };
    case "thanks": return { label: "Remercie un cours qui t’a aidé", href: "/matieres", contribution: true };
    default: return { label: "Révise 10 fiches", href: "/reviser/seance", contribution: false };
  }
}

/** Avance une quête sans jamais dépasser sa cible. */
export const advance = (progress: number, by: number, target: number) => Math.min(target, Math.max(0, progress) + Math.max(0, by));

/** Combien de jours de la semaine ont leurs trois quêtes faites. */
export function fullDays(rows: { day: string; doneAt: Date | null }[]) {
  const byDay = new Map<string, { total: number; done: number }>();
  for (const row of rows) {
    const entry = byDay.get(row.day) ?? { total: 0, done: 0 };
    entry.total++;
    if (row.doneAt) entry.done++;
    byDay.set(row.day, entry);
  }
  return [...byDay.values()].filter((entry) => entry.total > 0 && entry.done === entry.total).length;
}
