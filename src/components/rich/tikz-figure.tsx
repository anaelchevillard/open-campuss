"use client";

import { useEffect, useState } from "react";

/**
 * Figure TikZ pas encore en cache : le serveur la calcule une fois, puis tout le monde lit le SVG
 * gardé. Le SVG reçu a été nettoyé par le serveur (lib/rich/svg.ts), comme celui rendu directement dans la page.
 */
export function TikzFigure({ source, preview = false }: { source: string; preview?: boolean }) {
  const [state, setState] = useState<{ source: string; svg?: string; error?: string } | null>(null);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      void fetch("/api/rich/tikz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source }) })
        .then(async (response) => (await response.json()) as { svg?: string; error?: string })
        .catch(() => ({ error: "Rendu indisponible pour l’instant." }))
        .then((result) => { if (live) setState({ source, ...result }); });
    }, preview ? 600 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [source, preview]);
  const current = state?.source === source ? state : null;
  return (
    <figure className="course-rich">
      {/* Polices Computer Modern auto-hébergées, chargées seulement avec une figure TikZ (React les place dans <head>) */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/vendor/tikz/fonts.css" precedence="default" />
      {current?.svg
        // SVG nettoyé par liste blanche côté serveur (sanitizeSvg) avant d'être envoyé
        ? <div className="rich-svg" dangerouslySetInnerHTML={{ __html: current.svg }} />
        : <p role={current?.error ? "alert" : "status"} className="text-sm text-muted-foreground">{current?.error ? `Figure TikZ non affichée : ${current.error}` : "Calcul de la figure TikZ…"}</p>}
      {!current?.svg && <pre className="hidden whitespace-pre-wrap text-xs print:block">{source}</pre>}
    </figure>
  );
}
