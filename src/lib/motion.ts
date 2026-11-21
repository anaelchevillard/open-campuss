import type { Transition } from "motion/react";

/** Ressorts de la charte (DESIGN.md §2.14). Une sortie dure environ 2/3 de l'entrée. */
export const snappy: Transition = { type: "spring", stiffness: 500, damping: 38 };
export const sheet: Transition = { type: "spring", stiffness: 300, damping: 32 };
export const reward: Transition = { type: "spring", stiffness: 380, damping: 16 };

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_IN = [0.55, 0, 1, 0.45] as const;

/** Cascade de liste : 30 ms par élément, 8 au plus, le reste d'un bloc. */
export const stagger = (index: number) => Math.min(index, 8) * 0.03;
