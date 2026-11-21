/** « Bien démarrer » sans base de données : les étapes, leur ordre selon l'intention, l'avancement. */
import type { Prefs } from "@/lib/prefs";

export type ChecklistFacts = { opened: boolean; highlighted: boolean; cards: number; friends: number; shared: boolean; lastDocId?: string | null };
export type ChecklistStepId = "open" | "highlight" | "cards" | "friend" | "share";
export type ChecklistStep = { id: ChecklistStepId; label: string; href: string; done: boolean };

export const CARDS_GOAL = 5;

const ORDERS: Record<NonNullable<Prefs["intent"]>, ChecklistStepId[]> = {
  read: ["open", "highlight", "cards", "friend", "share"],
  exam: ["cards", "open", "highlight", "friend", "share"],
  share: ["share", "open", "highlight", "friend", "cards"],
};

/** Chaque étape mène là où elle se fait ; l'ordre suit ce qui a amené la personne, et ne bouge plus ensuite. */
export function checklistSteps(facts: ChecklistFacts, intent?: Prefs["intent"]): ChecklistStep[] {
  const read = facts.lastDocId ? `/d/${facts.lastDocId}` : "/matieres";
  const all: Record<ChecklistStepId, ChecklistStep> = {
    open: { id: "open", label: "Ouvrir un cours de tes matières", href: "/matieres", done: facts.opened },
    highlight: { id: "highlight", label: "Surligner un passage", href: read, done: facts.highlighted },
    cards: { id: "cards", label: `Réviser ${CARDS_GOAL} fiches`, href: "/reviser", done: facts.cards >= CARDS_GOAL },
    friend: { id: "friend", label: "Ajouter un ami", href: "/amis", done: facts.friends > 0 },
    share: { id: "share", label: "Partager ou demander un cours", href: "/demandes?nouvelle=1", done: facts.shared },
  };
  return ORDERS[intent ?? "read"].map((id) => all[id]);
}

export function checklistProgress(steps: ChecklistStep[]) {
  const done = steps.filter((s) => s.done).length;
  return { done, total: steps.length, complete: done === steps.length };
}
