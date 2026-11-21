"use client";

import { useEffect, useId, useRef, useState } from "react";
import { rateDocument } from "@/app/actions/reading";
import { formatAverage, ratingLabel } from "@/lib/ratings";
import { Icon } from "@/components/icon";
import { IconFavorite } from "@/lib/icons";

const SYNC = "campuss:doc-rating";
type Totals = { mine: number; average: number | null; count: number };

/** « 4,5 (12) », masquée sous trois notes. Le lecteur d'écran entend la phrase entière. */
export function RatingSummary({ average, count, className = "text-[0.95rem]" }: { average: number | null; count: number; className?: string }) {
  const label = ratingLabel(average, count);
  if (!label) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-muted-foreground tabular-nums ${className}`}>
      <Icon icon={IconFavorite} filled className="size-3.5 text-brand-text" />
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">Note moyenne de {formatAverage(average!)} sur 5, {count} notes</span>
    </span>
  );
}

/**
 * De vrais boutons radio : Tab entre dans le groupe, les flèches changent la note, sans rien à valider.
 * Le court délai évite une requête par étoile traversée au clavier.
 */
export function DocRating({ docId, initial, average, count }: { docId: string; initial: number; average: number | null; count: number }) {
  const [totals, setTotals] = useState<Totals>({ mine: initial, average, count });
  const [hover, setHover] = useState(0);
  const [error, setError] = useState("");
  const name = useId();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saved = useRef(initial);

  // La page porte deux fois ces étoiles : dans la barre d'actions et à la fin du texte
  useEffect(() => {
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<Totals & { docId: string }>).detail;
      if (detail.docId !== docId) return;
      setTotals({ mine: detail.mine, average: detail.average, count: detail.count });
      saved.current = detail.mine;
    };
    window.addEventListener(SYNC, onSync);
    return () => { window.removeEventListener(SYNC, onSync); clearTimeout(timer.current); };
  }, [docId]);

  const share = (next: Totals) => window.dispatchEvent(new CustomEvent(SYNC, { detail: { ...next, docId } }));

  const pick = (stars: number) => {
    setError("");
    setTotals((old) => ({ ...old, mine: stars }));
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const result = await rateDocument(docId, stars).catch(() => ({ error: "La note n’a pas été enregistrée. Réessaie." }));
      if ("error" in result) {
        setError(result.error);
        setTotals((old) => ({ ...old, mine: saved.current }));
      } else share(result);
    }, 250);
  };

  const lit = hover || totals.mine;
  return (
    <div className="inline-flex flex-wrap items-center gap-x-2">
      <fieldset className="flex" onMouseLeave={() => setHover(0)}>
        <legend className="sr-only">Ta note pour ce cours</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} onMouseEnter={() => setHover(n)} className="flex size-11 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-brand-text has-focus-visible:ring-3 has-focus-visible:ring-ring/50 md:size-8">
            <input type="radio" name={name} value={n} checked={totals.mine === n} onChange={() => pick(n)} className="sr-only" />
            <span className="sr-only">{n} étoile{n > 1 ? "s" : ""}</span>
            {n <= lit ? <Icon icon={IconFavorite} filled className="size-5 text-brand-text" /> : <Icon icon={IconFavorite} className="size-5" />}
          </label>
        ))}
      </fieldset>
      <RatingSummary average={totals.average} count={totals.count} />
      <span role="status" className="sr-only">{totals.mine ? `Ta note : ${totals.mine} sur 5` : ""}</span>
      {error && <span role="alert" className="text-[0.95rem] text-destructive">{error}</span>}
    </div>
  );
}
