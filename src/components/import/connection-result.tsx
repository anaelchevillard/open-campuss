"use client";

import { useEffect, useRef } from "react";
import { toast, toastError } from "@/lib/toast";

const FAILURES: Record<string, string> = {
  annule: "Connexion annulée : rien n’a été relié",
  refuse: "Ce lien de connexion n’est plus valable. Recommence",
  echec: "La connexion n’a pas abouti. Réessaie dans un instant",
};

/** Le retour de Google ou Notion dit comment ça s'est passé, une fois, puis l'adresse redevient propre. */
export function ConnectionResult({ result, name }: { result: string | null; name: string | null }) {
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current || !result) return;
    shown.current = true;
    if (result === "ok") toast(name ? `${name} est connecté` : "C’est connecté");
    else toastError(FAILURES[result] ?? FAILURES.echec);
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [result, name]);
  return null;
}
