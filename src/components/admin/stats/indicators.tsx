import { Badge } from "@/components/reui/badge";
import { Frame, FramePanel } from "@/components/reui/frame";
import { delayReached, formatDelay, shareReached, shareView, type Share } from "@/lib/metrics";
import type { loadMetrics } from "@/lib/metrics-server";

type Indicator = { label: string; value: string; detail?: string | null; definition: string; target: string; reached: boolean | null };

/** Sans personne à compter, on dit pourquoi plutôt que d'afficher 0 %. */
function shareIndicator(label: string, share: Share, unit: string, definition: string, empty: string, target?: number): Indicator {
  const view = shareView(share);
  return {
    label, definition, value: view.value ?? empty, detail: view.detail && `${view.detail} ${unit}`,
    target: target ? `Objectif ${target} %` : "Objectif à établir",
    reached: target ? shareReached(share, target) : null,
  };
}

function IndicatorPanel({ indicator }: { indicator: Indicator }) {
  return (
    <FramePanel className="flex min-w-0 flex-col gap-2">
      <h3 className="font-sans text-sm font-normal text-muted-foreground">{indicator.label}</h3>
      <p className="text-2xl font-semibold tabular-nums">{indicator.value}</p>
      {indicator.detail && <p className="-mt-1 text-sm tabular-nums text-muted-foreground">{indicator.detail}</p>}
      <p className="text-sm text-muted-foreground">{indicator.definition}</p>
      <p className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-sm font-semibold">
        {indicator.target}
        {indicator.reached !== null && <Badge variant={indicator.reached ? "success-light" : "warning-light"} size="sm">{indicator.reached ? "atteint" : "pas encore"}</Badge>}
      </p>
    </FramePanel>
  );
}

/** Indicateurs de pilotage (objectifs repères), indépendants de la période et des filtres. */
export function Indicators({ metrics }: { metrics: Awaited<ReturnType<typeof loadMetrics>> }) {
  const delay = metrics.validation;
  const waiting = delay.waiting ? `, ${delay.waiting} en attente` : "";
  const indicators: Indicator[] = [
    shareIndicator("Couverture de la L1", metrics.coverage.firstYear, "matières", "Matières de L1 avec au moins un cours publié, faute de liste officielle des chapitres.", "Aucune matière", 80),
    shareIndicator("Activation", metrics.activation, "nouveaux inscrits", "A lu un cours et gardé une fiche pendant sa première semaine. Inscrits depuis 7 à 97 jours.", "Pas encore de recul", 50),
    shareIndicator("Actifs par semaine", metrics.weekly, "comptes", "Comptes vus dans les 7 derniers jours.", "Aucun compte"),
    shareIndicator("Retour à 7 jours", metrics.back7, "inscrits", "Revenu au moins 7 jours après son inscription. Inscrits depuis 7 à 97 jours.", "Pas encore de recul"),
    shareIndicator("Retour à 30 jours", metrics.back30, "inscrits", "Revenu au moins 30 jours après son inscription. Inscrits depuis 30 à 120 jours.", "Pas encore de recul"),
    shareIndicator("Contributeurs", metrics.contributors, "comptes", "A envoyé ou publié au moins un document, seul ou à plusieurs.", "Aucun compte", 10),
    {
      label: "Délai de validation", definition: "Médiane entre la demande et la publication, sur 90 jours.",
      value: delay.medianSeconds === null ? "Aucune validation" : formatDelay(delay.medianSeconds),
      detail: delay.count ? `${delay.count} validation${delay.count > 1 ? "s" : ""}${waiting}` : delay.waiting ? `${delay.waiting} en attente` : null,
      target: "Objectif moins de 24 h", reached: delayReached(delay.medianSeconds, delay.count),
    },
    shareIndicator("Recours aux fiches", metrics.reviewers, "comptes", "A révisé au moins une fiche dans les 7 derniers jours.", "Aucun compte"),
  ];
  return (
    <section aria-labelledby="indicateurs" className="grid gap-3">
      <div>
        <h2 id="indicateurs" className="section-title">Indicateurs</h2>
        <p className="text-sm text-muted-foreground">Objectifs repères, calculés sur toutes les licences quels que soient la période et les filtres.</p>
      </div>
      <Frame className="grid sm:grid-cols-2 xl:grid-cols-4">
        {indicators.map((indicator) => <IndicatorPanel key={indicator.label} indicator={indicator} />)}
      </Frame>
    </section>
  );
}
