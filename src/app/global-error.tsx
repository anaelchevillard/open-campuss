"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/errors/client";

/** Dernier filet : une erreur dans la mise en page racine elle-même. Page minimale, sans le reste du site. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (!error.digest) reportError("react", error);
  }, [error]);
  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: "28rem", margin: "14vh auto 0", padding: "0 1rem" }}>
        <h1>La page n’a pas pu s’afficher</h1>
        <p>Une erreur est survenue. Réessaie dans un instant.</p>
        <button type="button" onClick={reset}>Réessayer</button>
      </body>
    </html>
  );
}
