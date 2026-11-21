import { daysBetween, lastSunday, parisDay, plural } from "./calendar";
import { impactSentence } from "./impact";
import { button, hello, type MailContent } from "@/lib/mail/content";
import { categoryCountsLabel, type CategoryCounts } from "@/lib/category-counts";
import { examPhrase } from "@/lib/exam-kind";
import { inSentence } from "@/lib/subject-name";

const EXAM_HORIZON_DAYS = 30;

export type DigestFacts = {
  name: string;
  dueCards: number;
  nextExam: { subject: string; at: Date; kind?: string | null } | null;
  /** Les nouveautés de chaque matière, par type (« 2 CM, 1 fiche ») */
  newCourses: { subject: string; counts: CategoryCounts }[];
  impact: { readers: number; courses: number };
};

/** Une fois par semaine, le dimanche. Un envoi manqué (quota du jour, serveur arrêté) part le lendemain. Le tout premier attend un dimanche. */
export const weeklyDue = (last: Date | null, now: Date) => (last ? parisDay(last) < lastSunday(now) : parisDay(now) === lastSunday(now));


/** Null s'il n'y a rien à dire : dans ce cas, aucun mail ne part. Le lien de désinscription est ajouté par la file. */
export function weeklyDigest(facts: DigestFacts, paths: { open: string }, now: Date) {
  const days = facts.nextExam ? daysBetween(now, facts.nextExam.at) : null;
  const exam = facts.nextExam && days !== null && days >= 0 && days <= EXAM_HORIZON_DAYS ? facts.nextExam : null;
  const items: { text: string; link?: { label: string; path: string } }[] = [];
  if (facts.dueCards > 0) items.push({ text: `${plural(facts.dueCards, "fiche")} à réviser.`, link: { label: "Réviser", path: "/reviser" } });
  if (exam) items.push({ text: `${examPhrase(exam.kind, exam.subject)} ${days === 0 ? "aujourd’hui" : days === 1 ? "demain" : `dans ${plural(days!, "jour")}`}.`, link: { label: "Calendrier", path: "/calendrier" } });
  if (facts.newCourses.length) items.push({ text: `Nouveautés : ${facts.newCourses.map((c) => `${inSentence(c.subject)} (${categoryCountsLabel(c.counts, { separator: ", " })})`).join(", ")}.` });
  if (facts.impact.readers > 0) items.push({ text: `${impactSentence(facts.impact.readers, facts.impact.courses)}. Merci pour eux.` });
  if (!items.length) return null;
  const summary = items.map((item) => item.text.split(" : ")[0].replace(/\.$/, "")).join(", ").slice(0, 500);
  const content: MailContent = {
    subject: "ta semaine", title: "Ta semaine sur {site}", greeting: hello(facts.name), preheader: summary.slice(0, 140),
    blocks: [{ type: "list", items }, button("Ouvrir {site}", paths.open)],
  };
  return { subject: "ta semaine", summary, content };
}
