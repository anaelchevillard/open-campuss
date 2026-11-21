import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { examPhrase } from "@/lib/exam-kind";
import { readableDocuments } from "@/lib/access";
import { db, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { previewIntervals } from "@/lib/fsrs";
import { gameSnapshot, subjectScores } from "@/lib/habits";
import { parisDay } from "@/lib/study-habits";
import { composeSession, sessionSize, sessionSummary, type SessionCounts, type SessionItem, type SessionSubject } from "@/lib/today-session";

/** La carte « Séance du jour », la même à l'accueil et dans Réviser. */
export type TodayPlan = {
  kind: "exam" | "cards" | "resume" | "start";
  title: string;
  detail: string;
  href: string;
  minutes?: number;
  readiness?: number;
  /** Absente quand la personne a masqué les éléments de jeu. */
  streak?: number;
  chips: { label: string; href: string }[];
  /** Contenu de la séance (facultatif). */
  session?: SessionCounts;
  /** Objectif du jour : absent quand les éléments de jeu sont masqués. */
  goal?: { today: number; goal: number };
};

type Who = Pick<User, "id" | "role" | "programId" | "level"> & { prefs?: User["prefs"] };

const { documents, flashcards, favorites, memoDecks, quizzes, readingProgress, subjects } = schema;

/**
 * La séance composée côté serveur. `subjectId` la resserre sur une matière, `newCount` fixe le nombre de nouvelles fiches
 * (« Faire 5 fiches » d'un compte vide), `questions` le nombre de questions.
 */
export async function todaySession(user: Who, options: { subjectId?: number; newCount?: number; questions?: number } = {}) {
  const now = new Date();
  const inSubject = options.subjectId ? eq(documents.subjectId, options.subjectId) : undefined;
  const [due, readDocs] = await Promise.all([
    db.select({ card: flashcards, subjectId: documents.subjectId }).from(flashcards)
      .leftJoin(documents, eq(flashcards.documentId, documents.id))
      .where(and(eq(flashcards.userId, user.id), lte(flashcards.dueAt, now), isNull(flashcards.suspendedAt), inSubject)).orderBy(asc(flashcards.dueAt)).limit(60),
    // Cours lus ou favoris, lisibles, avec un paquet de fiches
    db.select({ docId: documents.id, subjectId: documents.subjectId, cards: memoDecks.cards }).from(memoDecks)
      .innerJoin(documents, eq(memoDecks.documentId, documents.id))
      .leftJoin(readingProgress, and(eq(readingProgress.documentId, documents.id), eq(readingProgress.userId, user.id)))
      .leftJoin(favorites, and(eq(favorites.documentId, documents.id), eq(favorites.userId, user.id)))
      .where(and(readableDocuments(user), isNull(documents.deletedAt), inSubject, or(sql`${readingProgress.userId} is not null`, sql`${favorites.userId} is not null`)))
      .orderBy(desc(sql`coalesce(${readingProgress.updatedAt}, ${favorites.at})`)).limit(8),
  ]);
  const known = readDocs.length
    ? new Set((await db.select({ doc: flashcards.documentId, front: flashcards.front }).from(flashcards).where(and(eq(flashcards.userId, user.id), inArray(flashcards.documentId, readDocs.map((d) => d.docId))))).map((c) => `${c.doc}|${c.front}`))
    : new Set<string>();
  // Matière la plus faible, ou celle demandée ; à défaut, la matière d'un cours lu
  let focus = options.subjectId ?? null;
  if (!focus) {
    const scores = await subjectScores(user).catch(() => []);
    const weakest = scores.filter((s) => s.result.known).sort((a, b) => (a.result.known && b.result.known ? a.result.percent - b.result.percent : 0))[0] ?? scores[0];
    focus = weakest?.id ?? readDocs.find((d) => d.subjectId)?.subjectId ?? null;
  }
  const quiz = (options.questions ?? 3) > 0 ? await quizFor(user, focus) : null;
  const composed = composeSession({ due: due.map(({ card, subjectId }) => dueItem(card, subjectId, now)), decks: readDocs, known, quiz, day: parisDay(now), newCount: options.newCount, questionCount: options.questions });
  const ids = [...new Set(composed.items.map((item) => item.subjectId).filter((id): id is number => Boolean(id)))];
  const names: SessionSubject[] = ids.length ? (await db.select({ id: subjects.id, name: subjects.name, shortName: subjects.shortName }).from(subjects).where(inArray(subjects.id, ids))).map((s) => ({ id: s.id, name: s.shortName || s.name })) : [];
  const items = composed.items.map((item) => (item.kind === "new" ? { ...item, previews: newPreviews(now) } : item));
  return { ...composed, items, subjects: names, focus };
}

/** Une fiche à moi dans une séance : son texte et les intervalles des 4 notes. */
export function dueItem(card: typeof flashcards.$inferSelect, subjectId: number | null, now: Date) {
  return { id: card.id, front: card.front, back: card.back, subjectId, previews: previewIntervals(card, now), fresh: card.state === 0 && !card.lastReviewedAt };
}

const newPreviews = (now: Date) => previewIntervals(null, now);

/** Un quiz prêt dans la matière : d'abord un cours lu, sinon le plus récent. */
async function quizFor(user: Who, subjectId: number | null) {
  if (!subjectId) return null;
  const [doc] = await db.select({ docId: documents.id, subjectId: documents.subjectId, questions: quizzes.questions }).from(quizzes)
    .innerJoin(documents, eq(quizzes.documentId, documents.id))
    .leftJoin(readingProgress, and(eq(readingProgress.documentId, documents.id), eq(readingProgress.userId, user.id)))
    .where(and(readableDocuments(user), isNull(documents.deletedAt), eq(documents.subjectId, subjectId), eq(documents.quizStatus, "ready")))
    .orderBy(sql`${readingProgress.userId} is null`, desc(documents.publishedAt)).limit(1);
  return doc ? { docId: doc.docId, subjectId: doc.subjectId, questions: doc.questions.map((q) => ({ question: q.question, choices: q.choices })) } : null;
}

/** Les questions d'un partiel blanc : jusqu'à 10, prises à tour de rôle dans les quiz de la matière. */
export async function mockExamQuestions(user: Who, subjectId: number, max = 10): Promise<SessionItem[]> {
  const docs = await db.select({ docId: documents.id, subjectId: documents.subjectId, questions: quizzes.questions }).from(quizzes)
    .innerJoin(documents, eq(quizzes.documentId, documents.id))
    .where(and(readableDocuments(user), isNull(documents.deletedAt), eq(documents.subjectId, subjectId), eq(documents.quizStatus, "ready"))).orderBy(desc(documents.publishedAt)).limit(6);
  const items: SessionItem[] = [];
  for (let round = 0; items.length < max && docs.some((d) => d.questions.length > round); round++) {
    for (const doc of docs) {
      const q = doc.questions[round];
      if (q && items.length < max) items.push({ kind: "question", docId: doc.docId, index: round, question: q.question, choices: q.choices, subjectId: doc.subjectId });
    }
  }
  return items;
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/** Partiel dans 7 jours ou séance prête, sinon dernière lecture, sinon un premier pas. Même calcul pour l'accueil et Aujourd'hui. */
export async function todayPlan(user: Who): Promise<TodayPlan> {
  const now = new Date();
  const hideGame = Boolean(user.prefs?.hideGame);
  const [[exam], session, [resume], game] = await Promise.all([
    user.programId ? db.select({ at: schema.exams.at, kind: schema.exams.kind, subject: subjects.name, subjectId: subjects.id }).from(schema.exams)
      .innerJoin(subjects, eq(schema.exams.subjectId, subjects.id))
      .where(and(eq(subjects.programId, user.programId), eq(subjects.level, user.level ?? 1), gte(schema.exams.at, now), lte(schema.exams.at, new Date(now.getTime() + 7 * 86_400_000))))
      .orderBy(asc(schema.exams.at)).limit(1) : [],
    todaySession(user),
    db.select({ id: documents.id, title: documents.title, percent: readingProgress.percent }).from(readingProgress)
      .innerJoin(documents, eq(readingProgress.documentId, documents.id))
      .where(and(eq(readingProgress.userId, user.id), readableDocuments(user), isNull(documents.deletedAt), sql`${readingProgress.percent} between 3 and 96`))
      .orderBy(desc(readingProgress.updatedAt)).limit(1),
    hideGame ? Promise.resolve(null) : gameSnapshot(user.id).catch(() => null),
  ]);
  const streak = game?.streak || undefined;
  const goal = game ? { today: game.today, goal: game.goal } : undefined;
  const chips = session.subjects.slice(0, 3).map((s) => ({ label: s.name, href: `/reviser/seance?matiere=${s.id}` }));
  const size = sessionSize(session.counts);
  if (exam) {
    const days = Math.max(0, Math.ceil((exam.at.getTime() - now.getTime()) / 86_400_000));
    const readiness = (await subjectScores(user).catch(() => [])).find((s) => s.id === exam.subjectId)?.result;
    return {
      kind: "exam", title: examPhrase(exam.kind, exam.subject), detail: days ? `Dans ${plural(days, "jour")}` : "Aujourd’hui",
      href: size ? "/reviser/seance" : `/reviser/seance?mode=partiel&matiere=${exam.subjectId}`, minutes: size ? session.minutes : 15,
      readiness: readiness?.known ? readiness.percent : undefined, streak, chips, session: session.counts, goal,
    };
  }
  if (size) return { kind: "cards", title: "Séance du jour", detail: sessionSummary(session.counts), href: "/reviser/seance", minutes: session.minutes, streak, chips, session: session.counts, goal };
  if (resume) return { kind: "resume", title: resume.title || "Sans titre", detail: `Lu à ${resume.percent} %`, href: `/d/${resume.id}`, streak, chips, goal };
  return { kind: "start", title: "Commence par une matière", detail: "Choisis un cours à lire", href: "/matieres", streak, chips, goal };
}
