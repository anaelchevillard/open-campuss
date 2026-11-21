import { inSentence } from "@/lib/subject-name";
/** Les règles des demandes de cours, sans base de données : le texte, le bonus et le regroupement des notifications. */
export const REQUEST_BONUS = 15;
export const REQUEST_MAX_CHARS = 160;
export const DIGEST_EVERY_MS = 24 * 3_600_000;
export const DIGEST_LOOKBACK_MS = 7 * 24 * 3_600_000;
// Laisse le temps à plusieurs demandes de se regrouper
export const DIGEST_SETTLE_MS = 10 * 60_000;
export const DIGEST_MAX_RECIPIENTS = 200;

export function cleanRequestText(raw: unknown) {
  const text = String(raw ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return text.length >= 3 && text.length <= REQUEST_MAX_CHARS ? text : null;
}

/** Chapitre 3 et chapitre 4 se ressemblent mot pour mot, mais ce ne sont pas la même demande. */
export const sameNumbers = (a: string, b: string) => (a.match(/\d+/g) ?? []).join() === (b.match(/\d+/g) ?? []).join();

/** « chapitre 3 », « chap. 3 » : une chose de moins à saisir dans le brouillon. */
export function chapterOf(text: string) {
  return text.match(/\bchap(?:itre|\.)?\s*(\d{1,3})\b/i)?.[1] ?? null;
}

const NEED_LABELS = { cours: "Le cours", fiche: "Une fiche", partiel: "Un ancien partiel" } as const;

/** Le texte d'un besoin détecté quand il devient une demande : « Un ancien partiel de Statistiques ». */
export function needText(category: keyof typeof NEED_LABELS, subjectName: string) {
  return `${NEED_LABELS[category]} de ${inSentence(subjectName)}`.slice(0, REQUEST_MAX_CHARS);
}

export type AnswerRow = { documentId: string; documentAuthor: string | null; documentSubject: number | null; requestId: string; requestAuthor: string | null; requestSubject: number; publishedAt: Date | null };

/**
 * Un seul bonus par demande, au premier cours publié qui y répond. Répondre à sa propre demande, ou depuis une autre matière, ne rapporte rien.
 * Les lignes ne contiennent que des cours relus : le bonus suit la règle des crédits.
 */
export function bonusDocuments(rows: AnswerRow[]) {
  const first = new Map<string, AnswerRow>();
  for (const row of rows) {
    if (row.documentSubject !== row.requestSubject || !row.documentAuthor || row.documentAuthor === row.requestAuthor) continue;
    const held = first.get(row.requestId);
    if (!held || (row.publishedAt?.getTime() ?? Infinity) < (held.publishedAt?.getTime() ?? Infinity)) first.set(row.requestId, row);
  }
  return new Set([...first.values()].map((row) => row.documentId));
}

export type DigestRequest = { id: string; subjectId: number; subjectName: string; authorId: string | null; createdAt: Date };
export type DigestPlan = { userId: string; title: string; body: string; href: string };

/** Une seule notification par personne et par jour, qui regroupe ce qui est paru depuis la précédente. */
export function planRequestDigest(requests: DigestRequest[], authorsBySubject: Map<number, string[]>, lastNotified: Map<string, Date>, now: Date): DigestPlan[] {
  const mine = new Map<string, DigestRequest[]>();
  for (const request of requests) {
    if (request.createdAt.getTime() > now.getTime() - DIGEST_SETTLE_MS || request.createdAt.getTime() < now.getTime() - DIGEST_LOOKBACK_MS) continue;
    for (const userId of authorsBySubject.get(request.subjectId) ?? []) {
      if (userId === request.authorId) continue;
      const last = lastNotified.get(userId);
      if (last && (last.getTime() > now.getTime() - DIGEST_EVERY_MS || request.createdAt <= last)) continue;
      mine.set(userId, [...(mine.get(userId) ?? []), request]);
    }
  }
  return [...mine].slice(0, DIGEST_MAX_RECIPIENTS).map(([userId, list]) => {
    const subjects = [...new Map(list.map((r) => [r.subjectId, r.subjectName])).entries()];
    const one = subjects.length === 1;
    return {
      userId,
      title: list.length === 1 ? `Un cours est demandé en ${inSentence(subjects[0][1])}` : `${list.length} cours demandés${one ? ` en ${inSentence(subjects[0][1])}` : " dans tes matières"}`,
      body: one ? "Tu as publié dans cette matière : si tu l’as, ton cours rapporte un bonus." : subjects.map(([, name]) => inSentence(name)).join(", "),
      href: one ? `/matieres/${subjects[0][0]}#demandes` : "/demandes",
    };
  });
}

/** « aujourd’hui », « hier », « il y a 3 j », « il y a 2 sem. », « il y a 4 mois » : l'âge d'une demande, sans date à lire. */
export function ageLabel(date: Date, now = new Date()) {
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days <= 0) return "aujourd’hui";
  if (days === 1) return "hier";
  if (days < 14) return `il y a ${days} j`;
  if (days < 60) return `il y a ${Math.floor(days / 7)} sem.`;
  return `il y a ${Math.floor(days / 30)} mois`;
}
