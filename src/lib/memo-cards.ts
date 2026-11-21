import { createHash } from "node:crypto";
import { folded } from "./content-utils";

/** L'identité d'une fiche, c'est sa question : la casse et les espaces ne suffisent pas à la faire revenir. */
export function cardKey(front: string) {
  return createHash("sha256").update(folded(front).replace(/\s+/g, " ").trim()).digest("hex").slice(0, 32);
}

export function withoutRemoved<T extends { front: string }>(cards: T[], removedKeys: string[]) {
  const removed = new Set(removedKeys);
  return cards.filter((card) => !removed.has(cardKey(card.front)));
}
