"use client";

import { useEffect } from "react";
import { IndependenceNotice } from "@/components/independence";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/errors/client";

// Aucun détail technique affiché : Next ne transmet au navigateur qu'un identifiant d'erreur
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Une erreur du rendu serveur porte un digest : elle est déjà enregistrée par onRequestError (instrumentation.ts)
  useEffect(() => {
    if (!error.digest) reportError("react", error);
  }, [error]);
  return (
    <main className="mx-auto max-w-md px-4 pt-[14vh]">
      <Logo className="mb-8 h-7 w-auto" />
      <h1 className="display-2">La page n’a pas pu s’afficher</h1>
      <p className="mb-5 mt-1 text-muted-foreground">Le serveur a rencontré une erreur. Réessaie dans un instant.</p>
      <Button  onClick={reset}>Réessayer</Button>
      <IndependenceNotice className="mt-8 text-sm text-muted-foreground" />
    </main>
  );
}
