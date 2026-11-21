"use client";

import { toast as sonner } from "sonner";

/** Toast simple, 4 s. Jamais pour une erreur de formulaire (elle va sous le champ) ni pour un enregistrement automatique. */
export function toast(message: string, options?: { description?: string; duration?: number }) {
  return sonner(message, { duration: 4000, ...options });
}

/** Action réversible : le toast propose « Annuler » pendant 6 s, à la place d'une confirmation. */
export function toastUndo(message: string, onUndo: () => void, { duration = 6000 }: { duration?: number } = {}) {
  return sonner(message, { duration, action: { label: "Annuler", onClick: onUndo } });
}

export function toastError(message: string) {
  return sonner.error(message, { duration: 6000 });
}
